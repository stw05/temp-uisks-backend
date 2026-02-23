import { Employee } from "../../domain/catalog/Employee";
import { FinanceHistoryItem, FinanceProject, FinanceSummary } from "../../domain/catalog/Finance";
import { Project } from "../../domain/catalog/Project";
import { Publication } from "../../domain/catalog/Publication";
import { PaginatedResult, PaginationInput } from "./Pagination";

export type ProjectListFilters = {
  irn?: string;
  status?: string;
  region?: string;
  financingType?: string;
  priority?: string;
  applicant?: string;
  q?: string;
} & PaginationInput;

export type EmployeeListFilters = {
  region?: string;
  position?: string;
  degree?: string;
  minHIndex?: number;
  maxHIndex?: number;
  q?: string;
} & PaginationInput;

export type PublicationListFilters = {
  year?: number;
  type?: string;
  q?: string;
} & PaginationInput;

export interface ProjectFilterOptions {
  irn: string[];
  status: string[];
  region: string[];
  financingType: string[];
  priority: string[];
  applicant: string[];
  mrnti: string[];
  trl: string[];
}

export interface FilterOptionCountString {
  value: string;
  count: number;
}

export interface FilterOptionCountNumber {
  value: number;
  count: number;
}

export interface ProjectFilterMeta {
  irn: FilterOptionCountString[];
  status: FilterOptionCountString[];
  region: FilterOptionCountString[];
  financingType: FilterOptionCountString[];
  priority: FilterOptionCountString[];
  applicant: FilterOptionCountString[];
  mrnti: FilterOptionCountString[];
  trl: FilterOptionCountString[];
}

export interface EmployeeFilterOptions {
  region: string[];
  position: string[];
  degree: string[];
}

export interface EmployeeFilterMeta {
  region: FilterOptionCountString[];
  position: FilterOptionCountString[];
  degree: FilterOptionCountString[];
}

export interface PublicationFilterOptions {
  type: string[];
  year: number[];
  applicant: string[];
}

export interface PublicationFilterMeta {
  type: FilterOptionCountString[];
  year: FilterOptionCountNumber[];
  applicant: FilterOptionCountString[];
}

export interface ProjectRepository {
  list(filters: ProjectListFilters): Promise<PaginatedResult<Project>>;
  getFilters(): Promise<ProjectFilterOptions>;
  getFilterMeta(filters: ProjectListFilters): Promise<ProjectFilterMeta>;
  getById(id: string): Promise<Project | null>;
  create(input: Project): Promise<Project>;
  update(id: string, input: Partial<Project>): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
}

export interface EmployeeRepository {
  list(filters: EmployeeListFilters): Promise<PaginatedResult<Employee>>;
  getFilters(): Promise<EmployeeFilterOptions>;
  getFilterMeta(filters: EmployeeListFilters): Promise<EmployeeFilterMeta>;
  getById(id: string): Promise<Employee | null>;
  create(input: Employee): Promise<Employee>;
  update(id: string, input: Partial<Employee>): Promise<Employee | null>;
  delete(id: string): Promise<boolean>;
}

export interface PublicationRepository {
  list(filters: PublicationListFilters): Promise<PaginatedResult<Publication>>;
  getFilters(): Promise<PublicationFilterOptions>;
  getFilterMeta(filters: PublicationListFilters): Promise<PublicationFilterMeta>;
  getById(id: string): Promise<Publication | null>;
  create(input: Publication): Promise<Publication>;
  update(id: string, input: Partial<Publication>): Promise<Publication | null>;
  delete(id: string): Promise<boolean>;
}

export interface FinanceRepository {
  getSummary(year?: number): Promise<FinanceSummary>;
  getProject(projectId: string): Promise<FinanceProject | null>;
  upsertHistory(projectId: string, item: FinanceHistoryItem): Promise<FinanceProject>;
}
