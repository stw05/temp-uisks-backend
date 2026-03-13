import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  FilterOptionCountString,
  ProjectFilterMeta,
  ProjectFilterOptions,
  ProjectListFilters,
  ProjectRepository
} from "../../../application/ports/CatalogRepositories";
import { PaginatedResult, paginateArray } from "../../../application/ports/Pagination";
import { Project } from "../../../domain/catalog/Project";

const toNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toStringValue = (value: unknown): string => String(value ?? "").trim();

const normalize = (value: string): string => value.toLowerCase().trim();

const isNoFilterValue = (value?: string): boolean => {
  const normalized = normalize(String(value ?? ""));
  if (!normalized) {
    return true;
  }

  return ["all", "any", "все", "все регионы", "все регионы рк", "любой", "-", "null", "undefined"].includes(normalized);
};

const isSame = (left: string, right: string): boolean => normalize(left) === normalize(right);

const contains = (source: string, needle: string): boolean => normalize(source).includes(normalize(needle));

const normalizeRegion = (value: string): string =>
  normalize(value)
    .replace(/[.,]/g, " ")
    .replace(/(^|\s)(город|г|область|обл|обл\.|обл)(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesRegion = (itemRegion: string, filterRegion: string): boolean => {
  const left = normalizeRegion(itemRegion);
  const right = normalizeRegion(filterRegion);
  if (!left || !right) {
    return false;
  }

  return left.includes(right) || right.includes(left);
};

const sortUniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const toCountedStrings = (values: string[]): FilterOptionCountString[] => {
  const counter = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  return Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const firstNonEmpty = (values: unknown[]): string => {
  for (const value of values) {
    const text = toStringValue(value);
    if (text) {
      return text;
    }
  }
  return "";
};

const pickExcelValue = (excelData: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const direct = toStringValue(excelData[key]);
    if (direct) {
      return direct;
    }

    const normalizedKey = normalize(key);
    const fuzzy = Object.entries(excelData).find(([candidate, candidateValue]) => {
      const normalizedCandidate = normalize(candidate);
      if (!normalizedCandidate) {
        return false;
      }
      const valueText = toStringValue(candidateValue);
      if (!valueText) {
        return false;
      }
      return normalizedCandidate.includes(normalizedKey) || normalizedKey.includes(normalizedCandidate);
    });

    if (fuzzy) {
      return toStringValue(fuzzy[1]);
    }
  }

  return "";
};

const parseYearFromDate = (value: string | null | undefined): number | null => {
  const raw = toStringValue(value);
  if (!raw) {
    return null;
  }

  const yearMatch = raw.match(/(19|20)\d{2}/);
  if (!yearMatch) {
    return null;
  }

  const year = Number(yearMatch[0]);
  return Number.isFinite(year) ? year : null;
};

const parseYearsFromPeriod = (value: string): { startYear: number | null; endYear: number | null } => {
  const raw = toStringValue(value);
  if (!raw) {
    return { startYear: null, endYear: null };
  }

  const years = raw.match(/(19|20)\d{2}/g) ?? [];
  const numeric = years.map((item) => Number(item)).filter((item) => Number.isFinite(item));
  if (numeric.length === 0) {
    return { startYear: null, endYear: null };
  }
  if (numeric.length === 1) {
    return { startYear: numeric[0], endYear: numeric[0] };
  }

  return {
    startYear: Math.min(...numeric),
    endYear: Math.max(...numeric)
  };
};

const parseTrl = (value: string): number | null => {
  const raw = toStringValue(value);
  if (!raw) {
    return null;
  }

  const digits = raw.match(/\d{1,2}/);
  if (!digits) {
    return null;
  }
  const parsed = Number(digits[0]);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed >= 1 && parsed <= 9 ? parsed : null;
};

const toTrlLabel = (value: number | null | undefined): string => {
  if (!value || !Number.isFinite(value)) {
    return "";
  }
  return `TRL ${value}`;
};

const FINANCING_KEYS = ["Тип финансирования", "Тип конкурса", "competition_type", "financing_type", "GF/PCF/PK"];
const PRIORITY_KEYS = ["Приоритет", "Приоритетное научное направление", "Приоритетное направление"];
const CONTEST_KEYS = ["Конкурс", "Наименование конкурса", "Тип конкурса"];
const CUSTOMER_KEYS = ["Заказчик", "Тип заказчика"];
const MRNTI_KEYS = ["МРНТИ", "MRNTI"];
const TRL_KEYS = ["TRL", "Уровень TRL"];
const PERIOD_KEYS = ["Период реализации"];

const toQualifiedTable = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("USERS_PROJECTS_TABLE must not be empty");
  }

  const parts = normalized.split(".");
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (parts.some((part) => !valid.test(part))) {
    throw new Error("USERS_PROJECTS_TABLE contains unsupported characters");
  }

  return parts.map((part) => `"${part}"`).join(".");
};

const withOverlay = <T extends { id: string }>(
  baseItems: T[],
  localMap: Map<string, T>,
  deletedIds: Set<string>
): T[] => {
  const merged = new Map<string, T>();
  for (const item of baseItems) {
    if (!deletedIds.has(item.id)) {
      merged.set(item.id, item);
    }
  }
  for (const [id, item] of localMap.entries()) {
    if (!deletedIds.has(id)) {
      merged.set(id, item);
    }
  }
  return Array.from(merged.values());
};

type ProjectRow = {
  id: string;
  title: string;
  lead: string;
  region: string;
  status: string;
  budget: number | string | null;
  spent: number | string | null;
  start_date: string | null;
  end_date: string | null;
  priority: string | null;
  financing_type: string | null;
  tags: string | null;
  excel_data: unknown;
};

export class PostgresProjectRepository implements ProjectRepository {
  private readonly localProjects = new Map<string, Project>();
  private readonly deletedProjectIds = new Set<string>();
  private readonly qualifiedTable: string;

  constructor(
    private readonly pool: Pool,
    tableName: string
  ) {
    this.qualifiedTable = toQualifiedTable(tableName);
  }

  async list(filters: ProjectListFilters): Promise<PaginatedResult<Project>> {
    const allProjects = await this.listAll(filters);
    return paginateArray(allProjects, filters);
  }

  async getFilters(): Promise<ProjectFilterOptions> {
    const projects = await this.listAll({});

    const financingValues = projects
      .map((project) => firstNonEmpty([project.financingType, project.tags[1], project.tags.find((tag) => /grant|program|contract|грант|договор|програм/i.test(tag))]))
      .filter(Boolean);

    const priorityValues = projects
      .map((project) => firstNonEmpty([project.priority, project.tags[0]]))
      .filter(Boolean);

    return {
      irn: sortUniqueStrings(projects.map((project) => project.id)),
      status: sortUniqueStrings(projects.map((project) => project.status)),
      region: sortUniqueStrings(projects.map((project) => project.region)),
      financingType: sortUniqueStrings(financingValues),
      priority: sortUniqueStrings(priorityValues),
      applicant: sortUniqueStrings(projects.map((project) => project.lead)),
      contest: sortUniqueStrings(projects.map((project) => toStringValue(project.contest)).filter(Boolean)),
      customer: sortUniqueStrings(projects.map((project) => toStringValue(project.customer)).filter(Boolean)),
      mrnti: sortUniqueStrings(projects.map((project) => toStringValue(project.mrnti)).filter(Boolean)),
      trl: sortUniqueStrings(projects.map((project) => toTrlLabel(project.trl)).filter(Boolean))
    };
  }

  async getFilterMeta(filters: ProjectListFilters): Promise<ProjectFilterMeta> {
    const projects = await this.listAll(filters);

    const financingValues = projects
      .map((project) => firstNonEmpty([project.financingType, project.tags[1], project.tags.find((tag) => /grant|program|contract|грант|договор|програм/i.test(tag))]))
      .filter(Boolean);

    const priorityValues = projects
      .map((project) => firstNonEmpty([project.priority, project.tags[0]]))
      .filter(Boolean);

    return {
      irn: toCountedStrings(projects.map((project) => project.id)),
      status: toCountedStrings(projects.map((project) => project.status)),
      region: toCountedStrings(projects.map((project) => project.region)),
      financingType: toCountedStrings(financingValues),
      priority: toCountedStrings(priorityValues),
      applicant: toCountedStrings(projects.map((project) => project.lead)),
      contest: toCountedStrings(projects.map((project) => toStringValue(project.contest)).filter(Boolean)),
      customer: toCountedStrings(projects.map((project) => toStringValue(project.customer)).filter(Boolean)),
      mrnti: toCountedStrings(projects.map((project) => toStringValue(project.mrnti)).filter(Boolean)),
      trl: toCountedStrings(projects.map((project) => toTrlLabel(project.trl)).filter(Boolean))
    };
  }

  async getById(id: string): Promise<Project | null> {
    const projects = await this.listAll({});
    const project = projects.find((item) => item.id === id);

    return project
      ? {
          ...project,
          description: project.description ?? "",
          teamIds: project.teamIds ?? [],
          publicationsIds: project.publicationsIds ?? [],
          files: project.files ?? []
        }
      : null;
  }

  async create(input: Project): Promise<Project> {
    const id = input.id || randomUUID();
    const created = { ...input, id };
    this.localProjects.set(id, created);
    this.deletedProjectIds.delete(id);
    return created;
  }

  async update(id: string, input: Partial<Project>): Promise<Project | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input, id };
    this.localProjects.set(id, updated);
    this.deletedProjectIds.delete(id);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.localProjects.delete(id);
    this.deletedProjectIds.add(id);
    return true;
  }

  private async listAll(filters: {
    irn?: string;
    status?: string;
    region?: string;
    financingType?: string;
    priority?: string;
    applicant?: string;
    contest?: string;
    customer?: string;
    mrnti?: string;
    trl?: number;
    startYear?: number;
    endYear?: number;
    q?: string;
  }): Promise<Project[]> {
    const query = `
      SELECT
        id,
        title,
        lead,
        region,
        status,
        budget,
        spent,
        start_date,
        end_date,
        priority,
        financing_type,
        tags,
        excel_data
      FROM ${this.qualifiedTable}
      ORDER BY id
    `;

    const rows = (await this.pool.query<ProjectRow>(query)).rows;
    const base: Project[] = rows.map((row) => {
      const excelData = toRecord(row.excel_data);
      const financingType = firstNonEmpty([row.financing_type, pickExcelValue(excelData, FINANCING_KEYS)]);
      const priority = firstNonEmpty([row.priority, pickExcelValue(excelData, PRIORITY_KEYS)]);
      const contest = pickExcelValue(excelData, CONTEST_KEYS);
      const customer = pickExcelValue(excelData, CUSTOMER_KEYS);
      const mrnti = pickExcelValue(excelData, MRNTI_KEYS);

      const periodValue = pickExcelValue(excelData, PERIOD_KEYS);
      const periodYears = parseYearsFromPeriod(periodValue);
      const startYearFromDate = parseYearFromDate(row.start_date);
      const endYearFromDate = parseYearFromDate(row.end_date);
      const startYear = startYearFromDate ?? periodYears.startYear;
      const endYear = endYearFromDate ?? periodYears.endYear;

      const tags = [toStringValue(row.priority), toStringValue(row.financing_type)]
        .concat(
          toStringValue(row.tags)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
        .concat([priority, financingType])
        .filter(Boolean);

      const trl =
        parseTrl(pickExcelValue(excelData, TRL_KEYS)) ??
        parseTrl(tags.find((tag) => /trl/i.test(tag)) ?? "");

      const status = firstNonEmpty([row.status, pickExcelValue(excelData, ["Статус", "статус", "Состояние"])]);
      const region = firstNonEmpty([row.region, pickExcelValue(excelData, ["Регион заявителя", "Регион", "Город заявителя"])]);
      const lead = firstNonEmpty([row.lead, pickExcelValue(excelData, ["Заявитель", "Научный руководитель"])]);
      const title = firstNonEmpty([
        row.title,
        pickExcelValue(excelData, ["Наименование на русском языке", "Название проекта", "Наименование на казахском языке", "Наименование на английском языке"])
      ]);

      return {
        id: toStringValue(row.id),
        title,
        lead,
        region,
        status,
        budget: toNumber(row.budget),
        spent: toNumber(row.spent),
        startDate: row.start_date ? toStringValue(row.start_date) : null,
        endDate: row.end_date ? toStringValue(row.end_date) : null,
        tags: Array.from(new Set(tags)),
        financingType: financingType || undefined,
        priority: priority || undefined,
        contest: contest || undefined,
        customer: customer || undefined,
        mrnti: mrnti || undefined,
        trl,
        startYear,
        endYear,
        excelData
      };
    });

    return withOverlay(base, this.localProjects, this.deletedProjectIds).filter((project) => {
      const irnFilter = isNoFilterValue(filters.irn) ? undefined : filters.irn;
      const statusFilter = isNoFilterValue(filters.status) ? undefined : filters.status;
      const regionFilter = isNoFilterValue(filters.region) ? undefined : filters.region;
      const financingTypeFilter = isNoFilterValue(filters.financingType) ? undefined : filters.financingType;
      const priorityFilter = isNoFilterValue(filters.priority) ? undefined : filters.priority;
      const applicantFilter = isNoFilterValue(filters.applicant) ? undefined : filters.applicant;
      const contestFilter = isNoFilterValue(filters.contest) ? undefined : filters.contest;
      const customerFilter = isNoFilterValue(filters.customer) ? undefined : filters.customer;
      const mrntiFilter = isNoFilterValue(filters.mrnti) ? undefined : filters.mrnti;
      const qFilter = isNoFilterValue(filters.q) ? undefined : filters.q;

      if (irnFilter && !isSame(project.id, irnFilter)) {
        return false;
      }
      if (statusFilter && !isSame(project.status, statusFilter)) {
        return false;
      }
      if (regionFilter && !matchesRegion(project.region, regionFilter)) {
        return false;
      }
      if (financingTypeFilter && !project.tags.some((tag) => contains(tag, financingTypeFilter))) {
        return false;
      }
      if (priorityFilter && !project.tags.some((tag) => contains(tag, priorityFilter))) {
        return false;
      }
      if (applicantFilter && !contains(project.lead, applicantFilter)) {
        return false;
      }
      if (contestFilter && !contains(project.contest ?? "", contestFilter)) {
        return false;
      }
      if (customerFilter && !contains(project.customer ?? "", customerFilter)) {
        return false;
      }
      if (mrntiFilter && !contains(project.mrnti ?? "", mrntiFilter)) {
        return false;
      }
      if (filters.trl !== undefined && project.trl !== filters.trl) {
        return false;
      }

      const filterStart = filters.startYear;
      const filterEnd = filters.endYear;
      if (filterStart !== undefined || filterEnd !== undefined) {
        const projectStart = project.startYear;
        const projectEnd = project.endYear;
        if (projectStart === null || projectStart === undefined || projectEnd === null || projectEnd === undefined) {
          return false;
        }

        const effectiveFilterStart = filterStart ?? filterEnd ?? projectStart;
        const effectiveFilterEnd = filterEnd ?? filterStart ?? projectEnd;
        if (projectEnd < effectiveFilterStart || projectStart > effectiveFilterEnd) {
          return false;
        }
      }

      if (qFilter) {
        return contains(
          `${project.id} ${project.title} ${project.lead} ${project.contest ?? ""} ${project.customer ?? ""} ${project.mrnti ?? ""}`,
          qFilter
        );
      }
      return true;
    });
  }
}
