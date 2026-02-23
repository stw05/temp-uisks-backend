import { Publication } from "../../../domain/catalog/Publication";
import { PublicationFilterMeta, PublicationFilterOptions, PublicationListFilters, PublicationRepository } from "../../ports/CatalogRepositories";
import { PaginatedResult } from "../../ports/Pagination";

export class PublicationService {
  constructor(private readonly publicationRepository: PublicationRepository) {}

  list(filters: PublicationListFilters): Promise<PaginatedResult<Publication>> {
    return this.publicationRepository.list(filters);
  }

  getFilters(): Promise<PublicationFilterOptions> {
    return this.publicationRepository.getFilters();
  }

  getFilterMeta(filters: PublicationListFilters): Promise<PublicationFilterMeta> {
    return this.publicationRepository.getFilterMeta(filters);
  }

  getById(id: string): Promise<Publication | null> {
    return this.publicationRepository.getById(id);
  }

  create(input: Publication): Promise<Publication> {
    return this.publicationRepository.create(input);
  }

  update(id: string, input: Partial<Publication>): Promise<Publication | null> {
    return this.publicationRepository.update(id, input);
  }

  delete(id: string): Promise<boolean> {
    return this.publicationRepository.delete(id);
  }
}
