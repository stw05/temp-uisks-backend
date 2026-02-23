export interface FinanceHistoryItem {
  date: string;
  amount: number;
  category: string;
  note: string;
}

export interface FinanceProject {
  projectId: string;
  budget: number;
  spent: number;
  history: FinanceHistoryItem[];
}

export interface FinanceSummary {
  totalBudget: number;
  totalSpent: number;
  byCategory: Array<{ category: string; amount: number }>;
  byRegion: Array<{ region: string; amount: number }>;
}
