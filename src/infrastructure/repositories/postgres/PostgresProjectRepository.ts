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

const isSame = (left: string, right: string): boolean => normalize(left) === normalize(right);

const contains = (source: string, needle: string): boolean => normalize(source).includes(normalize(needle));

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

    return {
      irn: sortUniqueStrings(projects.map((project) => project.id)),
      status: sortUniqueStrings(projects.map((project) => project.status)),
      region: sortUniqueStrings(projects.map((project) => project.region)),
      financingType: sortUniqueStrings(projects.flatMap((project) => project.tags.slice(1, 2))),
      priority: sortUniqueStrings(projects.flatMap((project) => project.tags.slice(0, 1))),
      applicant: sortUniqueStrings(projects.map((project) => project.lead)),
      mrnti: [],
      trl: []
    };
  }

  async getFilterMeta(filters: ProjectListFilters): Promise<ProjectFilterMeta> {
    const projects = await this.listAll(filters);

    return {
      irn: toCountedStrings(projects.map((project) => project.id)),
      status: toCountedStrings(projects.map((project) => project.status)),
      region: toCountedStrings(projects.map((project) => project.region)),
      financingType: toCountedStrings(projects.flatMap((project) => project.tags.slice(1, 2))),
      priority: toCountedStrings(projects.flatMap((project) => project.tags.slice(0, 1))),
      applicant: toCountedStrings(projects.map((project) => project.lead)),
      mrnti: [],
      trl: []
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
        tags
      FROM ${this.qualifiedTable}
      ORDER BY id
    `;

    const rows = (await this.pool.query<ProjectRow>(query)).rows;
    const base: Project[] = rows.map((row) => {
      const tags = [toStringValue(row.priority), toStringValue(row.financing_type)]
        .concat(
          toStringValue(row.tags)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        )
        .filter(Boolean);

      return {
        id: toStringValue(row.id),
        title: toStringValue(row.title),
        lead: toStringValue(row.lead),
        region: toStringValue(row.region),
        status: toStringValue(row.status),
        budget: toNumber(row.budget),
        spent: toNumber(row.spent),
        startDate: row.start_date ? toStringValue(row.start_date) : null,
        endDate: row.end_date ? toStringValue(row.end_date) : null,
        tags: Array.from(new Set(tags))
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
}
