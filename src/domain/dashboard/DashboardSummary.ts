export interface DashboardRegionSummary {
  region: string;
  projects: number;
  publications: number;
  employees: number;
  budget: number;
}

export interface DashboardSummary {
  projects: {
    total: number;
    grants: number;
    programs: number;
    contracts: number;
    commercialization: number;
    avgDuration: number;
  };
  publications: {
    total: number;
    journals: number;
    conferences: number;
    books: number;
    other: number;
  };
  people: {
    total: number;
    docents: number;
    professors: number;
    associateProfessors: number;
    avgAge: number;
  };
  finances: {
    total: number;
    lastYear: number;
    avgExpense: number;
    budgetUsage: number;
    regionalPrograms: number;
  };
  byRegion: DashboardRegionSummary[];
}