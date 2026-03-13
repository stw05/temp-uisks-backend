import { createHash, randomUUID } from "node:crypto";
import { Pool } from "mysql2/promise";
import {
  EmployeeFilterOptions,
  EmployeeFilterMeta,
  EmployeeListFilters,
  FilterOptionCountNumber,
  FilterOptionCountString,
  EmployeeRepository,
  FinanceRepository,
  ProjectFilterOptions,
  ProjectFilterMeta,
  ProjectListFilters,
  ProjectRepository,
  PublicationFilterOptions,
  PublicationFilterMeta,
  PublicationListFilters,
  PublicationRepository
} from "../../../application/ports/CatalogRepositories";
import { PaginatedResult, paginateArray } from "../../../application/ports/Pagination";
import { SqlTemplateRepository } from "../../../application/ports/SqlTemplateRepository";
import { Employee } from "../../../domain/catalog/Employee";
import { FinanceHistoryItem, FinanceProject, FinanceSummary } from "../../../domain/catalog/Finance";
import { Project } from "../../../domain/catalog/Project";
import { Publication } from "../../../domain/catalog/Publication";

const toNumber = (value: unknown): number => {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const toStringValue = (value: unknown): string => String(value ?? "").trim();

const normalize = (value: string): string => value.toLowerCase().trim();

const isSame = (left: string, right: string): boolean => normalize(left) === normalize(right);

const contains = (source: string, needle: string): boolean => normalize(source).includes(normalize(needle));

const cleanText = (value: unknown, fallback = "Не указано"): string => {
  const text = toStringValue(value);
  return text || fallback;
};

const normalizeRegion = (value: string): string =>
  normalize(value)
    .replace(/[.,]/g, " ")
    .replace(/(^|\s)(город|г|область|обл|обл\.)(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const matchesRegion = (source: string, filter: string): boolean => {
  const left = normalizeRegion(source);
  const right = normalizeRegion(filter);
  if (!left || !right) {
    return false;
  }
  return left.includes(right) || right.includes(left);
};

const toHIndexGroup = (hIndex: number): string => {
  if (!Number.isFinite(hIndex) || hIndex <= 0) {
    return "0";
  }
  if (hIndex <= 2) {
    return "1-2";
  }
  if (hIndex <= 5) {
    return "3-5";
  }
  if (hIndex <= 10) {
    return "6-10";
  }
  return "11+";
};

const sortUniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));

const firstStringValue = (row: Record<string, unknown>): string => {
  const value = Object.values(row)
    .map((item) => toStringValue(item))
    .find((item) => item.length > 0);

  return value ?? "";
};

const toCountedStrings = (values: string[]): FilterOptionCountString[] => {
  const counter = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  return Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
};

const toCountedNumbers = (values: number[]): FilterOptionCountNumber[] => {
  const counter = new Map<number, number>();
  for (const value of values.filter((item) => Number.isFinite(item))) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  return Array.from(counter.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
};

const stableId = (prefix: string, source: string): string => {
  const hash = createHash("sha1").update(source).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
};

const rowsFromMySqlResult = (queryRows: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(queryRows)) {
    return [];
  }

  if (queryRows.length === 0) {
    return [];
  }

  const firstItem = queryRows[0];
  if (!Array.isArray(firstItem)) {
    return queryRows as Array<Record<string, unknown>>;
  }

  const rowsMaybe = [...queryRows]
    .reverse()
    .find(
      (item) =>
        Array.isArray(item) &&
        (item.length === 0 || (!Array.isArray(item[0]) && typeof item[0] === "object" && item[0] !== null))
    );

  return (rowsMaybe as Array<Record<string, unknown>> | undefined) ?? [];
};

class LegacySqlReader {
  constructor(
    private readonly appDbPool: Pool,
    private readonly sqlTemplateRepository: SqlTemplateRepository,
    private readonly appLocale: string
  ) {}

  async execute(domain: string, locale: string, fileName: string): Promise<Array<Record<string, unknown>>> {
    const sql = await this.sqlTemplateRepository.readTemplate({ domain, locale, fileName });
    const [rows] = await this.appDbPool.query(sql);
    return rowsFromMySqlResult(rows);
  }

  async executeRaw(sql: string): Promise<Array<Record<string, unknown>>> {
    const [rows] = await this.appDbPool.query(sql);
    return rowsFromMySqlResult(rows);
  }

  projectsLocale(): string {
    return this.appLocale;
  }

  employeesLocale(): string {
    return this.appLocale === "рус" ? "ru" : this.appLocale;
  }

  publicationsLocale(): string {
    return this.appLocale === "рус" ? "русн" : this.appLocale;
  }

  financesLocale(): string {
    return this.appLocale === "рус" ? "ру" : this.appLocale;
  }
}

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

export class LegacyProjectRepository implements ProjectRepository {
  private readonly localProjects = new Map<string, Project>();
  private readonly deletedProjectIds = new Set<string>();

  constructor(private readonly reader: LegacySqlReader) {}

  async list(filters: ProjectListFilters): Promise<PaginatedResult<Project>> {
    const allProjects = await this.listAll(filters);
    return paginateArray(allProjects, filters);
  }

  async getFilters(): Promise<ProjectFilterOptions> {
    const projects = await this.listAll({});

    const collectSqlValues = async (fileName: string): Promise<string[]> => {
      try {
        const rows = await this.reader.execute("проекты", this.reader.projectsLocale(), fileName);
        return sortUniqueStrings(rows.map(firstStringValue));
      } catch {
        return [];
      }
    };

    const irn = sortUniqueStrings(projects.map((project) => project.id));
    const status = sortUniqueStrings(projects.map((project) => project.status));
    const region = sortUniqueStrings(projects.map((project) => project.region));
    const financingType = sortUniqueStrings(projects.flatMap((project) => project.tags.slice(1, 2)));
    const priority = sortUniqueStrings(projects.flatMap((project) => project.tags.slice(0, 1)));
    const applicant = sortUniqueStrings(projects.map((project) => project.lead));
    const contest = sortUniqueStrings(projects.map((project) => project.contest ?? "").filter(Boolean));
    const customer = sortUniqueStrings(projects.map((project) => project.customer ?? "").filter(Boolean));

    const mrnti = await collectSqlValues("МРНТИ.txt");
    const trl = await collectSqlValues("ТРЛ.txt");

    return {
      irn,
      status,
      region,
      financingType,
      priority,
      applicant,
      contest,
      customer,
      mrnti,
      trl
    };
  }

  async getFilterMeta(filters: ProjectListFilters): Promise<ProjectFilterMeta> {
    const projects = await this.listAll(filters);
    const collectSqlValues = async (fileName: string): Promise<FilterOptionCountString[]> => {
      try {
        const rows = await this.reader.execute("проекты", this.reader.projectsLocale(), fileName);
        return toCountedStrings(rows.map(firstStringValue));
      } catch {
        return [];
      }
    };

    return {
      irn: toCountedStrings(projects.map((project) => project.id)),
      status: toCountedStrings(projects.map((project) => project.status)),
      region: toCountedStrings(projects.map((project) => project.region)),
      financingType: toCountedStrings(projects.flatMap((project) => project.tags.slice(1, 2))),
      priority: toCountedStrings(projects.flatMap((project) => project.tags.slice(0, 1))),
      applicant: toCountedStrings(projects.map((project) => project.lead)),
      contest: toCountedStrings(projects.map((project) => project.contest ?? "").filter(Boolean)),
      customer: toCountedStrings(projects.map((project) => project.customer ?? "").filter(Boolean)),
      mrnti: await collectSqlValues("МРНТИ.txt"),
      trl: await collectSqlValues("ТРЛ.txt")
    };
  }

  private async listAll(filters: {
    irn?: string;
    status?: string;
    region?: string;
    financingType?: string;
    priority?: string;
    applicant?: string;
    q?: string;
  }): Promise<Project[]> {
    const rows = await this.reader.execute("проекты", this.reader.projectsLocale(), "Проекты основной запрос.txt");

    const base: Project[] = rows.map((row): Project => {
      const irn = toStringValue(row["ИРН"] ?? row.number);
      const title = toStringValue(row["Название проекта"]);
      const lead = toStringValue(row["Заявитель"]);
      const region = toStringValue(row["Регион заявителя"]);
      const status = toStringValue(row["статус"]);
      const budget = toNumber(row["Сумма финансирования (одобр)"] ?? row["Сумма финансирования (запр)"]);

      return {
        id: irn || stableId("project", `${title}-${lead}-${region}`),
        title,
        lead,
        region,
        status,
        budget,
        spent: 0,
        startDate: null,
        endDate: null,
        tags: [toStringValue(row["Приоритет"]), toStringValue(row["Тип финансирования"])].filter(Boolean)
      };
    });

    return withOverlay(base, this.localProjects, this.deletedProjectIds).filter((project) => {
      if (filters.irn && !isSame(project.id, filters.irn)) {
        return false;
      }
      if (filters.status && !isSame(project.status, filters.status)) {
        return false;
      }
      if (filters.region && !contains(project.region, filters.region)) {
        return false;
      }
      if (filters.financingType && !project.tags.some((tag) => contains(tag, filters.financingType ?? ""))) {
        return false;
      }
      if (filters.priority && !project.tags.some((tag) => contains(tag, filters.priority ?? ""))) {
        return false;
      }
      if (filters.applicant && !contains(project.lead, filters.applicant)) {
        return false;
      }
      if (filters.q) {
        return contains(`${project.id} ${project.title} ${project.lead}`, filters.q);
      }
      return true;
    });
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
}

export class LegacyEmployeeRepository implements EmployeeRepository {
  private readonly localEmployees = new Map<string, Employee>();
  private readonly deletedEmployeeIds = new Set<string>();
  private personsColumnsCache: Set<string> | null = null;

  constructor(private readonly reader: LegacySqlReader) {}

  async list(filters: EmployeeListFilters): Promise<PaginatedResult<Employee>> {
    const allEmployees = await this.listAll(filters);
    return paginateArray(allEmployees, filters);
  }

  async getFilters(): Promise<EmployeeFilterOptions> {
    const employees = await this.listAll({});

    const ages = employees.map((employee) => toNumber(employee.metrics["age"])).filter((value) => Number.isFinite(value) && value > 0);

    return {
      searchTerm: sortUniqueStrings(employees.map((employee) => employee.name)),
      region: sortUniqueStrings(employees.map((employee) => employee.region)),
      position: sortUniqueStrings(employees.map((employee) => employee.position)),
      department: sortUniqueStrings(employees.map((employee) => employee.department)),
      affiliateType: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["affiliateType"]))),
      gender: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["gender"]))),
      degree: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["academicDegree"]))),
      citizenship: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["citizenship"]))),
      projectRole: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["projectRole"]))),
      hIndexGroup: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["hIndexGroup"]))),
      mrnti: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["mrnti"]))),
      classifier: sortUniqueStrings(employees.map((employee) => toStringValue(employee.metrics["classifier"]))),
      minAge: ages.length ? Math.min(...ages) : 0,
      maxAge: ages.length ? Math.max(...ages) : 0
    };
  }

  async getFilterMeta(filters: EmployeeListFilters): Promise<EmployeeFilterMeta> {
    const employees = await this.listAll(filters);

    const ages = employees.map((employee) => toNumber(employee.metrics["age"])).filter((value) => Number.isFinite(value) && value > 0);

    return {
      searchTerm: toCountedStrings(employees.map((employee) => employee.name)),
      region: toCountedStrings(employees.map((employee) => employee.region)),
      position: toCountedStrings(employees.map((employee) => employee.position)),
      department: toCountedStrings(employees.map((employee) => employee.department)),
      affiliateType: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["affiliateType"]))),
      gender: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["gender"]))),
      degree: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["academicDegree"]))),
      citizenship: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["citizenship"]))),
      projectRole: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["projectRole"]))),
      hIndexGroup: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["hIndexGroup"]))),
      mrnti: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["mrnti"]))),
      classifier: toCountedStrings(employees.map((employee) => toStringValue(employee.metrics["classifier"]))),
      minAge: ages.length ? Math.min(...ages) : 0,
      maxAge: ages.length ? Math.max(...ages) : 0
    };
  }

  private async getPersonsColumns(): Promise<Set<string>> {
    if (this.personsColumnsCache) {
      return this.personsColumnsCache;
    }

    const rows = await this.reader.executeRaw("SHOW COLUMNS FROM persons");
    this.personsColumnsCache = new Set(rows.map((row) => toStringValue(row["Field"])).filter(Boolean));
    return this.personsColumnsCache;
  }

  private pickPersonsColumn(columns: Set<string>, candidates: string[], alias: string): string {
    const matched = candidates.find((candidate) => columns.has(candidate));
    if (!matched) {
      return `'' AS \`${alias}\``;
    }

    return `COALESCE(CAST(p.\`${matched}\` AS CHAR), '') AS \`${alias}\``;
  }

  private buildEmployeesSql(columns: Set<string>): string {
    const statusExpr = this.pickPersonsColumn(columns, ["status", "verification_status"], "status_raw");
    const confirmedFlagExpr = columns.has("is_confirmed")
      ? "COALESCE(p.`is_confirmed`, 0) AS `confirmed_flag`"
      : columns.has("confirmed")
        ? "COALESCE(p.`confirmed`, 0) AS `confirmed_flag`"
        : "0 AS `confirmed_flag`";

    const confirmedConditions: string[] = [];
    if (columns.has("is_confirmed")) {
      confirmedConditions.push("COALESCE(p.`is_confirmed`, 0) = 1");
    }
    if (columns.has("confirmed")) {
      confirmedConditions.push("COALESCE(p.`confirmed`, 0) = 1");
    }
    if (columns.has("status")) {
      confirmedConditions.push(
        "LOWER(COALESCE(CAST(p.`status` AS CHAR), '')) IN ('confirmed','подтвержденный','подтверждённый','подтверждено','подтвержден')"
      );
    }
    if (columns.has("verification_status")) {
      confirmedConditions.push(
        "LOWER(COALESCE(CAST(p.`verification_status` AS CHAR), '')) IN ('confirmed','подтвержденный','подтверждённый','подтверждено','подтвержден')"
      );
    }

    const whereClause = confirmedConditions.length > 0 ? `WHERE (${confirmedConditions.join(" OR ")})` : "";

    return `
      SELECT
        CONCAT_WS(' ', pa.sname, pa.fname, pa.pname) AS 'ФИО',
        COALESCE(CAST(p.academic_title AS CHAR), '') AS 'Ученое звание',
        COALESCE(CAST(p.academic_degree AS CHAR), '') AS 'Ученая степень',
        COALESCE(CAST(p.scopus AS CHAR), '') AS 'Author ID SCOPUS',
        COALESCE(CAST(p.webofscience AS CHAR), '') AS 'Researcher ID web of science',
        COALESCE(CAST(p.orcid AS CHAR), '') AS 'ORCID ID',
        COALESCE(psi.hindex, 0) AS 'H-index',
        CASE
          WHEN ci.city IN ('Алматы', 'Almaty') THEN 'г. Алматы'
          WHEN ci.city IN ('Астана', 'Астана (Нур-Султан)', 'Nur-Sultan', 'Astana') THEN 'г. Астана'
          WHEN ci.city IN ('Шымкент', 'Shymkent') THEN 'г. Шымкент'
          WHEN ci.city IN ('Семей', 'Semey') THEN 'Абайская область'
          WHEN ci.city IN ('Жезказган', 'Zhezkazgan') THEN 'Улытауская область'
          WHEN ci.city IN ('Талдыкорган', 'Taldykorgan') THEN 'Жетысуская область'
          ELSE COALESCE(CAST(s.name AS CHAR), '')
        END AS 'Регион',
        TIMESTAMPDIFF(YEAR, p.birthday, CURDATE()) AS 'old',
        ${this.pickPersonsColumn(columns, ["department", "department_name"], "department")},
        ${this.pickPersonsColumn(columns, ["affiliate_type", "organization_type", "affiliateType"], "affiliate_type")},
        ${this.pickPersonsColumn(columns, ["gender", "sex"], "gender")},
        ${this.pickPersonsColumn(columns, ["citizenship", "country"], "citizenship")},
        ${this.pickPersonsColumn(columns, ["project_role", "role"], "project_role")},
        ${this.pickPersonsColumn(columns, ["mrnti"], "mrnti")},
        ${this.pickPersonsColumn(columns, ["classifier", "classificator"], "classifier")},
        ${this.pickPersonsColumn(columns, ["email"], "email")},
        ${this.pickPersonsColumn(columns, ["phone", "mobile"], "phone")},
        ${statusExpr},
        ${confirmedFlagExpr}
      FROM persons p
      LEFT JOIN persons_all pa ON pa.main_user_id = p.main_user_id
      LEFT JOIN states s ON s.id = p.state_id
      LEFT JOIN cities ci ON ci.id = p.city_id
      LEFT JOIN person_scopus_info psi ON psi.person_id = p.id
      ${whereClause}
    `;
  }

  private async listAll(filters: {
    searchTerm?: string;
    region?: string;
    position?: string;
    department?: string;
    minAge?: number;
    maxAge?: number;
    affiliateType?: string;
    gender?: string;
    citizenship?: string;
    projectRole?: string;
    hIndexGroup?: string;
    mrnti?: string;
    classifier?: string;
    degree?: string;
    minHIndex?: number;
    maxHIndex?: number;
    q?: string;
  }): Promise<Employee[]> {
    const personsColumns = await this.getPersonsColumns();
    const rows = await this.reader.executeRaw(this.buildEmployeesSql(personsColumns));

    const hasConfirmedColumns =
      personsColumns.has("is_confirmed") ||
      personsColumns.has("confirmed") ||
      personsColumns.has("status") ||
      personsColumns.has("verification_status");

    const base: Employee[] = [];
    for (const row of rows) {
      const name = toStringValue(row["ФИО"]);
      const region = cleanText(row["Регион"]);

      const statusRaw = normalize(toStringValue(row["status_raw"]));
      const confirmedByStatus = ["confirmed", "подтвержденный", "подтверждённый", "подтверждено", "подтвержден"].some((value) =>
        statusRaw.includes(value)
      );
      const confirmedByFlag = toNumber(row["confirmed_flag"]) === 1;

      if (hasConfirmedColumns && !(confirmedByStatus || confirmedByFlag)) {
        continue;
      }

      if (!name) {
        continue;
      }

      const academicTitle = cleanText(row["Ученое звание"]);
      const academicDegree = cleanText(row["Ученая степень"]);
      const hIndex = toNumber(row["H-index"]);
      const age = Math.max(toNumber(row["old"]), 0);
      const department = cleanText(row["department"]);
      const affiliateType = cleanText(row["affiliate_type"]);
      const gender = cleanText(row["gender"]);
      const citizenship = cleanText(row["citizenship"]);
      const projectRole = cleanText(row["project_role"]);
      const mrnti = cleanText(row["mrnti"]);
      const classifier = cleanText(row["classifier"]);
      const email = cleanText(row["email"]);
      const phone = cleanText(row["phone"]);
      const hIndexGroup = toHIndexGroup(hIndex);

      base.push({
        id: stableId("employee", `${name}-${region}`),
        name,
        position: academicTitle,
        department,
        region,
        email,
        phone,
        avatarUrl: "Не указано",
        projectsIds: [],
        metrics: {
          hIndex,
          academicDegree,
          scopusAuthorId: cleanText(row["Author ID SCOPUS"]),
          researcherIdWos: cleanText(row["Researcher ID web of science"]),
          orcid: cleanText(row["ORCID ID"]),
          age,
          affiliateType,
          gender,
          citizenship,
          projectRole,
          hIndexGroup,
          mrnti,
          classifier,
          status: "подтвержденный"
        },
        bio: "Не указано",
        publicationsIds: []
      } satisfies Employee);
    }

    const searchTerm = filters.searchTerm ?? filters.q;

    return withOverlay(base, this.localEmployees, this.deletedEmployeeIds).filter((employee) => {
      if (filters.region && !matchesRegion(employee.region, filters.region)) {
        return false;
      }
      if (filters.position && !contains(employee.position, filters.position)) {
        return false;
      }
      if (filters.department && !contains(employee.department, filters.department)) {
        return false;
      }
      if (filters.affiliateType && !contains(toStringValue(employee.metrics["affiliateType"]), filters.affiliateType)) {
        return false;
      }
      if (filters.gender && !contains(toStringValue(employee.metrics["gender"]), filters.gender)) {
        return false;
      }
      if (filters.citizenship && !contains(toStringValue(employee.metrics["citizenship"]), filters.citizenship)) {
        return false;
      }
      if (filters.projectRole && !contains(toStringValue(employee.metrics["projectRole"]), filters.projectRole)) {
        return false;
      }
      if (filters.hIndexGroup && !isSame(toStringValue(employee.metrics["hIndexGroup"]), filters.hIndexGroup)) {
        return false;
      }
      if (filters.mrnti && !contains(toStringValue(employee.metrics["mrnti"]), filters.mrnti)) {
        return false;
      }
      if (filters.classifier && !contains(toStringValue(employee.metrics["classifier"]), filters.classifier)) {
        return false;
      }
      if (filters.degree) {
        const degree = toStringValue(employee.metrics["academicDegree"]);
        const degreeAliases: Record<string, string[]> = {
          doctor: ["доктор", "doctor"],
          candidate: ["кандидат", "candidate"],
          phd: ["phd", "ph.d"],
          master: ["магистр", "master"],
          none: ["нет", "none"]
        };

        const aliases = degreeAliases[normalize(filters.degree)] ?? [filters.degree];
        const hasMatch = aliases.some((alias) => contains(degree, alias));
        if (!hasMatch) {
          return false;
        }
      }
      const age = toNumber(employee.metrics["age"]);
      if (filters.minAge !== undefined && age < filters.minAge) {
        return false;
      }
      if (filters.maxAge !== undefined && age > filters.maxAge) {
        return false;
      }
      const hIndex = toNumber(employee.metrics["hIndex"]);
      if (filters.minHIndex !== undefined && hIndex < filters.minHIndex) {
        return false;
      }
      if (filters.maxHIndex !== undefined && hIndex > filters.maxHIndex) {
        return false;
      }
      if (searchTerm) {
        return contains(
          `${employee.name} ${employee.position} ${employee.department} ${toStringValue(employee.metrics["mrnti"])} ${toStringValue(employee.metrics["classifier"])} ${toStringValue(employee.metrics["projectRole"])}`,
          searchTerm
        );
      }
      return true;
    });
  }

  async getById(id: string): Promise<Employee | null> {
    const employees = await this.listAll({});
    return employees.find((item) => item.id === id) ?? null;
  }

  async create(input: Employee): Promise<Employee> {
    const id = input.id || randomUUID();
    const created = { ...input, id };
    this.localEmployees.set(id, created);
    this.deletedEmployeeIds.delete(id);
    return created;
  }

  async update(id: string, input: Partial<Employee>): Promise<Employee | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input, id };
    this.localEmployees.set(id, updated);
    this.deletedEmployeeIds.delete(id);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.localEmployees.delete(id);
    this.deletedEmployeeIds.add(id);
    return true;
  }
}

export class LegacyPublicationRepository implements PublicationRepository {
  private readonly localPublications = new Map<string, Publication>();
  private readonly deletedPublicationIds = new Set<string>();

  constructor(private readonly reader: LegacySqlReader) {}

  async list(filters: PublicationListFilters): Promise<PaginatedResult<Publication>> {
    const allPublications = await this.listAll(filters);
    return paginateArray(allPublications, filters);
  }

  async getFilters(): Promise<PublicationFilterOptions> {
    const publications = await this.listAll({});
    return {
      type: sortUniqueStrings(publications.map((publication) => publication.type)),
      year: Array.from(new Set(publications.map((publication) => publication.year).filter((year) => Number.isFinite(year) && year > 0))).sort((a, b) => a - b),
      applicant: sortUniqueStrings(publications.flatMap((publication) => publication.authors.slice(0, 1)))
    };
  }

  async getFilterMeta(filters: PublicationListFilters): Promise<PublicationFilterMeta> {
    const publications = await this.listAll(filters);
    return {
      type: toCountedStrings(publications.map((publication) => publication.type)),
      year: toCountedNumbers(publications.map((publication) => publication.year)),
      applicant: toCountedStrings(publications.flatMap((publication) => publication.authors.slice(0, 1)))
    };
  }

  private async listAll(filters: { year?: number; type?: string; q?: string }): Promise<Publication[]> {
    const rows = await this.reader.execute("публикации", this.reader.publicationsLocale(), "публикации.txt");

    const base = rows.map((row) => {
      const title = toStringValue(row.title ?? row.name_ru);
      const type = toStringValue(row.name ?? row.name_ru);

      return {
        id: toStringValue(row.id) || stableId("publication", title),
        title,
        authors: [toStringValue(row.name)].filter(Boolean),
        year: 0,
        type,
        doi: "",
        projectId: toStringValue(row.number),
        link: "",
        abstract: "",
        pdfUrl: ""
      } satisfies Publication;
    });

    return withOverlay(base, this.localPublications, this.deletedPublicationIds).filter((publication) => {
      if (filters.year && publication.year !== filters.year) {
        return false;
      }
      if (filters.type && publication.type !== filters.type) {
        return false;
      }
      if (filters.q) {
        return publication.title.toLowerCase().includes(filters.q.toLowerCase());
      }
      return true;
    });
  }

  async getById(id: string): Promise<Publication | null> {
    const publications = await this.listAll({});
    return publications.find((item) => item.id === id) ?? null;
  }

  async create(input: Publication): Promise<Publication> {
    const id = input.id || randomUUID();
    const created = { ...input, id };
    this.localPublications.set(id, created);
    this.deletedPublicationIds.delete(id);
    return created;
  }

  async update(id: string, input: Partial<Publication>): Promise<Publication | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }

    const updated = { ...existing, ...input, id };
    this.localPublications.set(id, updated);
    this.deletedPublicationIds.delete(id);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    this.localPublications.delete(id);
    this.deletedPublicationIds.add(id);
    return true;
  }
}

export class LegacyFinanceRepository implements FinanceRepository {
  private readonly financeHistoryByProject = new Map<string, FinanceHistoryItem[]>();

  constructor(
    private readonly reader: LegacySqlReader,
    private readonly projectRepository: ProjectRepository
  ) {}

  async getSummary(_year?: number): Promise<FinanceSummary> {
    const rows = await this.reader.execute("финансы", this.reader.financesLocale(), "распределение п типу.txt");

    const byCategory = rows.map((row) => ({
      category: toStringValue(row.name),
      amount: toNumber(row.as)
    }));

    const totalBudget = byCategory.reduce((sum, item) => sum + item.amount, 0);
    const totalSpent = Array.from(this.financeHistoryByProject.values())
      .flat()
      .reduce((sum, item) => sum + item.amount, 0);

    return {
      totalBudget,
      totalSpent,
      byCategory,
      byRegion: []
    };
  }

  async getProject(projectId: string): Promise<FinanceProject | null> {
    const project = await this.projectRepository.getById(projectId);
    if (!project) {
      return null;
    }

    const history = this.financeHistoryByProject.get(projectId) ?? [];
    const spent = history.reduce((sum, item) => sum + item.amount, 0);

    return {
      projectId,
      budget: project.budget,
      spent,
      history
    };
  }

  async upsertHistory(projectId: string, item: FinanceHistoryItem): Promise<FinanceProject> {
    const history = this.financeHistoryByProject.get(projectId) ?? [];
    history.push(item);
    this.financeHistoryByProject.set(projectId, history);

    const financeProject = await this.getProject(projectId);
    if (financeProject) {
      return financeProject;
    }

    return {
      projectId,
      budget: 0,
      spent: history.reduce((sum, entry) => sum + entry.amount, 0),
      history
    };
  }
}

export const createLegacyRepositories = (
  appDbPool: Pool,
  sqlTemplateRepository: SqlTemplateRepository,
  appLocale: string
): {
  projectRepository: ProjectRepository;
  employeeRepository: EmployeeRepository;
  publicationRepository: PublicationRepository;
  financeRepository: FinanceRepository;
} => {
  const reader = new LegacySqlReader(appDbPool, sqlTemplateRepository, appLocale);
  const projectRepository = new LegacyProjectRepository(reader);

  return {
    projectRepository,
    employeeRepository: new LegacyEmployeeRepository(reader),
    publicationRepository: new LegacyPublicationRepository(reader),
    financeRepository: new LegacyFinanceRepository(reader, projectRepository)
  };
};
