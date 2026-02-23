import { Project } from "../../../domain/catalog/Project";
import { ProjectFilterMeta, ProjectFilterOptions, ProjectListFilters, ProjectRepository } from "../../ports/CatalogRepositories";
import { PaginatedResult } from "../../ports/Pagination";

export class ProjectService {
  constructor(private readonly projectRepository: ProjectRepository) {}

  list(filters: ProjectListFilters): Promise<PaginatedResult<Project>> {
    return this.projectRepository.list(filters);
  }

  getFilters(): Promise<ProjectFilterOptions> {
    return this.projectRepository.getFilters();
  }

  getFilterMeta(filters: ProjectListFilters): Promise<ProjectFilterMeta> {
    return this.projectRepository.getFilterMeta(filters);
  }

  getById(id: string): Promise<Project | null> {
    return this.projectRepository.getById(id);
  }

  create(input: Project): Promise<Project> {
    return this.projectRepository.create(input);
  }

  update(id: string, input: Partial<Project>): Promise<Project | null> {
    return this.projectRepository.update(id, input);
  }

  delete(id: string): Promise<boolean> {
    return this.projectRepository.delete(id);
  }
}
