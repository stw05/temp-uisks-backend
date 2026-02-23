import { FinanceHistoryItem, FinanceProject, FinanceSummary } from "../../../domain/catalog/Finance";
import { FinanceRepository } from "../../ports/CatalogRepositories";

export class FinanceService {
  constructor(private readonly financeRepository: FinanceRepository) {}

  getSummary(year?: number): Promise<FinanceSummary> {
    return this.financeRepository.getSummary(year);
  }

  getProject(projectId: string): Promise<FinanceProject | null> {
    return this.financeRepository.getProject(projectId);
  }

  upsertHistory(projectId: string, item: FinanceHistoryItem): Promise<FinanceProject> {
    return this.financeRepository.upsertHistory(projectId, item);
  }
}
