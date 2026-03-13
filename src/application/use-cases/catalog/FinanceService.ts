import { FinanceHistoryItem, FinanceProject, FinanceSummary } from "../../../domain/catalog/Finance";
import { FinanceRepository, ProjectRepository } from "../../ports/CatalogRepositories";
import { Project } from "../../../domain/catalog/Project";

type FinanceSummaryFilters = {
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  startYear?: number;
  endYear?: number;
  region?: string;
  irn?: string;
  financingType?: string;
  cofinancing?: string;
  expense?: string;
  priority?: string;
  competition?: string;
  applicant?: string;
  customer?: string;
  status?: string;
};

type FilterCount = { value: string; count: number };

type FinanceFilterOptions = {
  region: string[];
  yearRange: number[];
  minYear: number;
  maxYear: number;
  irn: string[];
  financingType: string[];
  cofinancing: string[];
  expense: string[];
  priority: string[];
  competition: string[];
  applicant: string[];
  customer: string[];
  status: string[];
};

type FinanceFilterMeta = {
  region: FilterCount[];
  yearRange: Array<{ value: number; count: number }>;
  minYear: number;
  maxYear: number;
  irn: FilterCount[];
  financingType: FilterCount[];
  cofinancing: FilterCount[];
  expense: FilterCount[];
  priority: FilterCount[];
  competition: FilterCount[];
  applicant: FilterCount[];
  customer: FilterCount[];
  status: FilterCount[];
};

const toStringValue = (value: unknown): string => String(value ?? "").trim();

const normalize = (value: string): string => value.toLowerCase().trim();

const isNoFilterValue = (value?: string): boolean => {
  const normalized = normalize(toStringValue(value));
  if (!normalized) {
    return true;
  }

  return ["all", "any", "все", "все регионы", "все значения", "любой", "-", "null", "undefined"].includes(normalized);
};

const normalizeRegion = (value: string): string =>
  normalize(value)
    .replace(/[.,]/g, " ")
    .replace(/(^|\s)(город|г|область|обл)(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const isAllRegionValue = (value?: string): boolean => {
  const normalized = normalizeRegion(String(value ?? ""));
  if (!normalized) {
    return true;
  }

  return ["all", "any", "все", "все регионы", "все регионы рк", "любой", "-"].includes(normalized);
};

const splitQueryValues = (value?: string): string[] => {
  if (isNoFilterValue(value)) {
    return [];
  }

  return toStringValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const matchesText = (source: string, filter?: string): boolean => {
  const sourceNormalized = normalize(source);
  const values = splitQueryValues(filter);

  if (values.length === 0) {
    return true;
  }

  return values.some((value) => {
    const right = normalize(value);
    return sourceNormalized.includes(right) || right.includes(sourceNormalized);
  });
};

const matchesRegion = (itemRegion: string, filterRegion?: string): boolean => {
  if (isAllRegionValue(filterRegion)) {
    return true;
  }

  const left = normalizeRegion(itemRegion);
  const right = normalizeRegion(filterRegion ?? "");

  if (!left || !right) {
    return false;
  }

  return left.includes(right) || right.includes(left);
};

const toNumber = (value: unknown): number => {
  const normalized = toStringValue(value)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/,(?=\d{1,2}$)/, ".")
    .replace(/,/g, "");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const pickExcelNumber = (excelData: Record<string, unknown>, keys: string[]): number => {
  for (const key of keys) {
    const exact = toStringValue(excelData[key]);
    if (exact) {
      return toNumber(exact);
    }

    const normalizedKey = normalize(key);
    const fuzzy = Object.entries(excelData).find(([candidate, value]) => {
      const text = toStringValue(value);
      if (!text) {
        return false;
      }
      const normalizedCandidate = normalize(candidate);
      return normalizedCandidate.includes(normalizedKey) || normalizedKey.includes(normalizedCandidate);
    });

    if (fuzzy) {
      return toNumber(fuzzy[1]);
    }
  }

  return 0;
};

const parseYear = (value: string | null | undefined): number | null => {
  const raw = toStringValue(value);
  const match = raw.match(/(19|20)\d{2}/);
  if (!match) {
    return null;
  }
  const year = Number(match[0]);
  return Number.isFinite(year) ? year : null;
};

const parsePeriodYears = (value: string): { startYear: number | null; endYear: number | null } => {
  const years = (toStringValue(value).match(/(19|20)\d{2}/g) ?? [])
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));

  if (years.length === 0) {
    return { startYear: null, endYear: null };
  }
  if (years.length === 1) {
    return { startYear: years[0], endYear: years[0] };
  }

  return {
    startYear: Math.min(...years),
    endYear: Math.max(...years)
  };
};

const overlapPeriod = (startYear: number | null, endYear: number | null, filterStart?: number, filterEnd?: number): boolean => {
  if (filterStart === undefined && filterEnd === undefined) {
    return true;
  }

  if (!startYear || !endYear) {
    return true;
  }

  const left = filterStart ?? filterEnd ?? startYear;
  const right = filterEnd ?? filterStart ?? endYear;
  return !(endYear < left || startYear > right);
};

const BUDGET_YEAR_KEYS = [
  "Одобренная сумма на 1 год",
  "Одобренная сумма на 2 год",
  "Одобренная сумма на 3 год",
  "Одобренная сумма на 4 год",
  "Одобренная сумма на 5 год"
];

const sumBudgetYears = (excelData: Record<string, unknown>): number =>
  BUDGET_YEAR_KEYS.reduce((acc, key) => acc + pickExcelNumber(excelData, [key]), 0);

const EXPENSE_CATEGORY_KEYS: Record<string, string[]> = {
  salary: ["Оплата труда (включая налоги и другие обязательные платежи в бюджет)", "Оплата труда"],
  travel: ["Служебные командировки"],
  support: ["Научно-организационное сопровождение, прочие услуги и работы"],
  materials: ["Приобретение материалов, оборудования и (или) программного обеспечения (для юридических лиц)"],
  rent: ["Расходы на аренду, эксплуатационные расходы оборудования и техники, используемых для реализации исследований"]
};

const getCofinancingLabel = (excelData: Record<string, unknown>): string => {
  const cofinancingText = Object.entries(excelData)
    .filter(([key]) => normalize(key).includes("софинанс"))
    .map(([, value]) => toStringValue(value))
    .find(Boolean);

  if (!cofinancingText) {
    return "Без софинансирования";
  }

  const valueNumber = toNumber(cofinancingText);
  if (valueNumber > 0) {
    return "С софинансированием";
  }

  const normalized = normalize(cofinancingText);
  if (["да", "yes", "true", "имеется", "есть", "with"].some((value) => normalized.includes(value))) {
    return "С софинансированием";
  }

  return "Без софинансирования";
};

const toCountedStrings = (values: string[]): FilterCount[] => {
  const counter = new Map<string, number>();
  for (const value of values.map((item) => toStringValue(item)).filter(Boolean)) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "ru"))
    .map(([value, count]) => ({ value, count }));
};

const toCountedNumbers = (values: number[]): Array<{ value: number; count: number }> => {
  const counter = new Map<number, number>();
  for (const value of values.filter((item) => Number.isFinite(item))) {
    counter.set(value, (counter.get(value) ?? 0) + 1);
  }

  return Array.from(counter.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([value, count]) => ({ value, count }));
};

const sortUniqueStrings = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));

export class FinanceService {
  constructor(
    private readonly financeRepository: FinanceRepository,
    private readonly projectRepository?: ProjectRepository
  ) {}

  async getSummary(filters: FinanceSummaryFilters = {}): Promise<FinanceSummary> {
    const { year, yearFrom, yearTo, startYear, endYear } = filters;

    if (!this.projectRepository) {
      return this.financeRepository.getSummary(year);
    }

    const projects = (await this.listAllProjects()).filter((project) => this.matchesProject(project, filters));

    let totalBudget = 0;
    let totalSpent = 0;

    const byCategoryMap = new Map<string, number>([
      ["salary", 0],
      ["travel", 0],
      ["support", 0],
      ["materials", 0],
      ["rent", 0]
    ]);

    const byRegionMap = new Map<string, number>();

    const rangeFrom = year ?? startYear ?? yearFrom;
    const rangeTo = year ?? endYear ?? yearTo ?? yearFrom;
    const expenseFilter = splitQueryValues(filters.expense).map((item) => normalize(item));

    for (const project of projects) {
      const excelData = toRecord(project.excelData);
      const period = parsePeriodYears(toStringValue(excelData["Период реализации"]));
      const startYear = project.startYear ?? parseYear(project.startDate) ?? period.startYear;
      const endYear = project.endYear ?? parseYear(project.endDate) ?? period.endYear ?? startYear;

      const fullBudgetByYears = sumBudgetYears(excelData);
      const baselineBudget = fullBudgetByYears > 0 ? fullBudgetByYears : Math.max(project.budget, 0);

      let projectBudget = baselineBudget;
      if (rangeFrom !== undefined && rangeTo !== undefined && startYear && endYear) {
        let rangedBudget = 0;
        for (let targetYear = rangeFrom; targetYear <= rangeTo; targetYear += 1) {
          const offset = targetYear - startYear;
          if (offset >= 0 && offset < BUDGET_YEAR_KEYS.length && targetYear <= endYear) {
            rangedBudget += pickExcelNumber(excelData, [BUDGET_YEAR_KEYS[offset]]);
          }
        }
        projectBudget = rangedBudget > 0 ? rangedBudget : projectBudget;
      }

      const budgetShare = baselineBudget > 0 ? projectBudget / baselineBudget : 1;

      totalBudget += projectBudget;
      totalSpent += Math.max(project.spent, projectBudget * 0.65);

      const categoryValues = Object.entries(EXPENSE_CATEGORY_KEYS).map(([key, keys]) => ({
        key,
        amount: pickExcelNumber(excelData, keys) * budgetShare
      }));

      if (expenseFilter.length > 0 && !categoryValues.some((entry) => expenseFilter.includes(normalize(entry.key)) && entry.amount > 0)) {
        totalBudget -= projectBudget;
        totalSpent -= Math.max(project.spent, projectBudget * 0.65);
        continue;
      }

      for (const categoryValue of categoryValues) {
        byCategoryMap.set(categoryValue.key, (byCategoryMap.get(categoryValue.key) ?? 0) + categoryValue.amount);
      }

      const regionName = project.region || "—";
      byRegionMap.set(regionName, (byRegionMap.get(regionName) ?? 0) + projectBudget);
    }

    const rawCategories = Array.from(byCategoryMap.entries()).map(([category, amount]) => ({ category, amount }));
    const rawCategorySum = rawCategories.reduce((acc, item) => acc + Math.max(item.amount, 0), 0);
    const categoryScale = rawCategorySum > 0 && totalSpent > 0 ? totalSpent / rawCategorySum : 1;

    const byCategory = rawCategories
      .map((item) => ({ category: item.category, amount: Number((Math.max(item.amount, 0) * categoryScale).toFixed(2)) }))
      .filter((item) => item.amount > 0);

    const byRegion = Array.from(byRegionMap.entries())
      .map(([regionName, amount]) => ({ region: regionName, amount: Number(amount.toFixed(2)) }))
      .sort((a, b) => b.amount - a.amount);

    return {
      totalBudget: Number(totalBudget.toFixed(2)),
      totalSpent: Number(totalSpent.toFixed(2)),
      byCategory,
      byRegion
    };
  }

  async getFilters(query: FinanceSummaryFilters = {}): Promise<FinanceFilterOptions> {
    const projects = (await this.listAllProjects()).filter((project) => this.matchesProject(project, query));

    const years = new Set<number>();
    const regions: string[] = [];
    const irn: string[] = [];
    const financingType: string[] = [];
    const cofinancing: string[] = [];
    const priority: string[] = [];
    const competition: string[] = [];
    const applicant: string[] = [];
    const customer: string[] = [];
    const status: string[] = [];

    for (const project of projects) {
      const excelData = toRecord(project.excelData);
      const period = parsePeriodYears(toStringValue(excelData["Период реализации"]));
      const fromYear = project.startYear ?? parseYear(project.startDate) ?? period.startYear;
      const toYear = project.endYear ?? parseYear(project.endDate) ?? period.endYear ?? fromYear;
      if (fromYear && toYear && toYear >= fromYear) {
        for (let currentYear = fromYear; currentYear <= toYear; currentYear += 1) {
          years.add(currentYear);
        }
      }

      regions.push(project.region);
      irn.push(project.id);
      financingType.push(project.financingType ?? "");
      cofinancing.push(getCofinancingLabel(excelData));
      priority.push(project.priority ?? "");
      competition.push(project.contest ?? "");
      applicant.push(project.lead);
      customer.push(project.customer ?? "");
      status.push(project.status);
    }

    const yearRange = Array.from(years).sort((a, b) => a - b);
    const minYear = yearRange.length > 0 ? yearRange[0] : 0;
    const maxYear = yearRange.length > 0 ? yearRange[yearRange.length - 1] : 0;

    return {
      region: sortUniqueStrings(regions),
      yearRange,
      minYear,
      maxYear,
      irn: sortUniqueStrings(irn),
      financingType: sortUniqueStrings(financingType),
      cofinancing: sortUniqueStrings(cofinancing),
      expense: Object.keys(EXPENSE_CATEGORY_KEYS),
      priority: sortUniqueStrings(priority),
      competition: sortUniqueStrings(competition),
      applicant: sortUniqueStrings(applicant),
      customer: sortUniqueStrings(customer),
      status: sortUniqueStrings(status)
    };
  }

  async getFilterMeta(query: FinanceSummaryFilters = {}): Promise<FinanceFilterMeta> {
    const projects = (await this.listAllProjects()).filter((project) => this.matchesProject(project, query));

    const years: number[] = [];
    const regions: string[] = [];
    const irn: string[] = [];
    const financingType: string[] = [];
    const cofinancing: string[] = [];
    const priority: string[] = [];
    const competition: string[] = [];
    const applicant: string[] = [];
    const customer: string[] = [];
    const status: string[] = [];
    const expense: string[] = [];

    for (const project of projects) {
      const excelData = toRecord(project.excelData);

      const period = parsePeriodYears(toStringValue(excelData["Период реализации"]));
      const fromYear = project.startYear ?? parseYear(project.startDate) ?? period.startYear;
      const toYear = project.endYear ?? parseYear(project.endDate) ?? period.endYear ?? fromYear;
      if (fromYear && toYear && toYear >= fromYear) {
        for (let currentYear = fromYear; currentYear <= toYear; currentYear += 1) {
          years.push(currentYear);
        }
      }

      regions.push(project.region);
      irn.push(project.id);
      financingType.push(project.financingType ?? "");
      cofinancing.push(getCofinancingLabel(excelData));
      priority.push(project.priority ?? "");
      competition.push(project.contest ?? "");
      applicant.push(project.lead);
      customer.push(project.customer ?? "");
      status.push(project.status);

      for (const [category, keys] of Object.entries(EXPENSE_CATEGORY_KEYS)) {
        if (pickExcelNumber(excelData, keys) > 0) {
          expense.push(category);
        }
      }
    }

    const yearValues = Array.from(new Set(years)).sort((a, b) => a - b);
    const minYear = yearValues.length > 0 ? yearValues[0] : 0;
    const maxYear = yearValues.length > 0 ? yearValues[yearValues.length - 1] : 0;

    return {
      region: toCountedStrings(regions),
      yearRange: toCountedNumbers(years),
      minYear,
      maxYear,
      irn: toCountedStrings(irn),
      financingType: toCountedStrings(financingType),
      cofinancing: toCountedStrings(cofinancing),
      expense: toCountedStrings(expense),
      priority: toCountedStrings(priority),
      competition: toCountedStrings(competition),
      applicant: toCountedStrings(applicant),
      customer: toCountedStrings(customer),
      status: toCountedStrings(status)
    };
  }

  getProject(projectId: string): Promise<FinanceProject | null> {
    return this.financeRepository.getProject(projectId);
  }

  upsertHistory(projectId: string, item: FinanceHistoryItem): Promise<FinanceProject> {
    return this.financeRepository.upsertHistory(projectId, item);
  }

  private async listAllProjects() {
    if (!this.projectRepository) {
      return [];
    }

    const items = [];
    let page = 1;

    while (true) {
      const result = await this.projectRepository.list({ page, limit: 10000 });
      items.push(...result.items);
      if (!result.meta.hasNextPage) {
        break;
      }
      page += 1;
    }

    return items;
  }

  private matchesProject(project: Project, filters: FinanceSummaryFilters): boolean {
    const excelData = toRecord(project.excelData);

    if (!matchesRegion(project.region, filters.region)) {
      return false;
    }

    if (!matchesText(project.id, filters.irn)) {
      return false;
    }

    if (!matchesText(project.financingType ?? "", filters.financingType)) {
      return false;
    }

    if (!matchesText(project.priority ?? "", filters.priority)) {
      return false;
    }

    if (!matchesText(project.contest ?? "", filters.competition)) {
      return false;
    }

    if (!matchesText(project.lead, filters.applicant)) {
      return false;
    }

    if (!matchesText(project.customer ?? "", filters.customer)) {
      return false;
    }

    if (!matchesText(project.status, filters.status)) {
      return false;
    }

    const cofinancingLabel = getCofinancingLabel(excelData);
    if (!matchesText(cofinancingLabel, filters.cofinancing)) {
      return false;
    }

    const period = parsePeriodYears(toStringValue(excelData["Период реализации"]));
    const projectStart = project.startYear ?? parseYear(project.startDate) ?? period.startYear;
    const projectEnd = project.endYear ?? parseYear(project.endDate) ?? period.endYear ?? projectStart;
    const rangeFrom = filters.year ?? filters.startYear ?? filters.yearFrom;
    const rangeTo = filters.year ?? filters.endYear ?? filters.yearTo ?? filters.yearFrom;

    if (!overlapPeriod(projectStart, projectEnd, rangeFrom, rangeTo)) {
      return false;
    }

    return true;
  }
}
