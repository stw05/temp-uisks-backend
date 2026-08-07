import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  EmployeeFilterMeta,
  EmployeeFilterOptions,
  EmployeeListFilters,
  EmployeeRepository,
  FilterOptionCountString
} from "../../../application/ports/CatalogRepositories";
import { PaginatedResult, paginateArray } from "../../../application/ports/Pagination";
import { Employee } from "../../../domain/catalog/Employee";

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

const toCountedStrings = (values: string[]): FilterOptionCountString[] => {
  const counter = new Map<string, number>();
  for (const value of values.filter(Boolean)) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }
  return Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, count }));
};

const toQualifiedTable = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error("USERS_EMPLOYEES_TABLE must not be empty");
  }

  const parts = normalized.split(".");
  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/;
  if (parts.some((part) => !valid.test(part))) {
    throw new Error("USERS_EMPLOYEES_TABLE contains unsupported characters");
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

type EmployeeRow = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  region: string | null;
  email: string | null;
  phone: string | null;
  h_index: number | string | null;
  academic_degree: string | null;
  scopus_author_id: string | null;
  researcher_id_wos: string | null;
  orcid: string | null;
  gender: string | null;
  citizenship: string | null;
  project_role: string | null;
  mrnti: string | null;
  classifier: string | null;
  project_ids: string | null;
};

export class PostgresEmployeeRepository implements EmployeeRepository {
  private readonly localEmployees = new Map<string, Employee>();
  private readonly deletedEmployeeIds = new Set<string>();
  private readonly qualifiedTable: string;

  constructor(
    private readonly pool: Pool,
    tableName: string
  ) {
    this.qualifiedTable = toQualifiedTable(tableName);
  }

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

  private async listAll(filters: EmployeeListFilters): Promise<Employee[]> {
    const query = `
      SELECT
        id, name, position, department, region, email, phone, h_index, academic_degree,
        scopus_author_id, researcher_id_wos, orcid, gender, citizenship, project_role,
        mrnti, classifier, project_ids
      FROM ${this.qualifiedTable}
      ORDER BY (name ~ '^[А-Яа-яЁё]') DESC, name
    `;

    const rows = (await this.pool.query<EmployeeRow>(query)).rows;

    const base: Employee[] = rows.map((row) => {
      const hIndex = toNumber(row.h_index);
      const region = cleanText(row.region);

      return {
        id: toStringValue(row.id),
        name: toStringValue(row.name),
        position: cleanText(row.position),
        department: cleanText(row.department),
        region,
        email: cleanText(row.email),
        phone: cleanText(row.phone),
        avatarUrl: "Не указано",
        projectsIds: toStringValue(row.project_ids)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        metrics: {
          hIndex,
          academicDegree: cleanText(row.academic_degree),
          scopusAuthorId: cleanText(row.scopus_author_id),
          researcherIdWos: cleanText(row.researcher_id_wos),
          orcid: cleanText(row.orcid),
          age: 0,
          affiliateType: "Не указано",
          gender: cleanText(row.gender),
          citizenship: cleanText(row.citizenship),
          projectRole: cleanText(row.project_role),
          hIndexGroup: toHIndexGroup(hIndex),
          mrnti: cleanText(row.mrnti),
          classifier: cleanText(row.classifier),
          status: "подтвержденный"
        },
        bio: "Не указано",
        publicationsIds: []
      } satisfies Employee;
    });

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
      if (age > 0) {
        if (filters.minAge !== undefined && age < filters.minAge) {
          return false;
        }
        if (filters.maxAge !== undefined && age > filters.maxAge) {
          return false;
        }
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
