import { ProjectRepository } from "../../ports/CatalogRepositories";
import { DashboardSummary } from "../../../domain/dashboard/DashboardSummary";

type DashboardSummaryFilters = {
  region?: string;
  year?: number;
  priority?: string;
  organization?: string;
};

type DashboardFilterOptions = {
  priority: string[];
  organization: string[];
  region: string[];
  year: number[];
};

const normalize = (value: string): string => value.trim().toLowerCase();

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

const isNoFilterValue = (value?: string): boolean => {
  const normalized = normalize(String(value ?? ""));
  if (!normalized) {
    return true;
  }

  return [
    "all",
    "any",
    "все",
    "все направления",
    "все приоритеты",
    "all directions",
    "all priorities",
    "все организации",
    "all organizations",
    "выбор организации",
    "приоритетные направления развития науки",
    "-",
    "null",
    "undefined"
  ].includes(normalized);
};

const matchesTextFilter = (source: string, filter?: string): boolean => {
  if (isNoFilterValue(filter)) {
    return true;
  }

  const left = normalize(source);
  const right = normalize(String(filter ?? ""));
  if (!left || !right) {
    return false;
  }

  return left.includes(right) || right.includes(left);
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

const toStringValue = (value: unknown): string => String(value ?? "").trim();

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

const pickExcelString = (excelData: Record<string, unknown>, keys: string[]): string => {
  for (const key of keys) {
    const exact = toStringValue(excelData[key]);
    if (exact) {
      return exact;
    }

    const target = normalize(key);
    const fuzzy = Object.entries(excelData).find(([candidate, value]) => {
      const text = toStringValue(value);
      if (!text) {
        return false;
      }
      const normalizedCandidate = normalize(candidate);
      return normalizedCandidate.includes(target) || target.includes(normalizedCandidate);
    });

    if (fuzzy) {
      return toStringValue(fuzzy[1]);
    }
  }

  return "";
};

const pickExcelNumber = (excelData: Record<string, unknown>, keys: string[]): number => {
  const value = pickExcelString(excelData, keys);
  return value ? toNumber(value) : 0;
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

const parseYearRangeFromPeriod = (period: string): { startYear: number | null; endYear: number | null } => {
  const years = (toStringValue(period).match(/(19|20)\d{2}/g) ?? [])
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

const overlapsYear = (startYear: number | null, endYear: number | null, year?: number): boolean => {
  if (!year) {
    return true;
  }
  if (!startYear || !endYear) {
    return true;
  }
  return startYear <= year && endYear >= year;
};

const detectFinancingType = (tags: string[], fallback?: string): "grant" | "program" | "contract" | "other" => {
  const source = `${tags.join(" ")} ${fallback ?? ""}`.toLowerCase();
  if (/grant|грант|gf/.test(source)) {
    return "grant";
  }
  if (/program|програм|pcf|пцф/.test(source)) {
    return "program";
  }
  if (/contract|договор|коммерц/.test(source)) {
    return "contract";
  }
  return "other";
};

const sortUniqueStrings = (values: Iterable<string>): string[] =>
  Array.from(new Set(Array.from(values).map((value) => toStringValue(value)).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru")
  );

const getProjectPriority = (projectPriority: string | undefined, excelData: Record<string, unknown>): string =>
  projectPriority || pickExcelString(excelData, ["Приоритет", "Приоритетное научное направление", "Приоритетное направление"]);

const getProjectOrganization = (projectLead: string, excelData: Record<string, unknown>): string =>
  pickExcelString(excelData, [
    "Организация заявителя",
    "Полное наименование организации заявителя",
    "Наименование организации",
    "Организация",
    "Заявитель"
  ]) || projectLead;

export class DashboardService {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async getFilters(): Promise<DashboardFilterOptions> {
    const projects = await this.listAllProjects();

    const priorities = new Set<string>();
    const organizations = new Set<string>();
    const regions = new Set<string>();
    const years = new Set<number>();

    for (const project of projects) {
      const excelData = toRecord(project.excelData);

      const priority = getProjectPriority(project.priority, excelData);
      if (priority && !isNoFilterValue(priority)) {
        priorities.add(priority);
      }

      const organization = getProjectOrganization(project.lead, excelData);
      if (organization && !isNoFilterValue(organization)) {
        organizations.add(organization);
      }

      const region = project.region || pickExcelString(excelData, ["Регион заявителя", "Регион", "Город заявителя"]);
      if (region && !isAllRegionValue(region)) {
        regions.add(region);
      }

      const periodRange = parseYearRangeFromPeriod(pickExcelString(excelData, ["Период реализации"]));
      const startYear = project.startYear ?? parseYear(project.startDate) ?? periodRange.startYear;
      const endYear = project.endYear ?? parseYear(project.endDate) ?? periodRange.endYear ?? startYear;

      if (startYear && endYear && endYear >= startYear) {
        for (let currentYear = startYear; currentYear <= endYear; currentYear += 1) {
          years.add(currentYear);
        }
      }
    }

    return {
      priority: sortUniqueStrings(priorities),
      organization: sortUniqueStrings(organizations),
      region: sortUniqueStrings(regions),
      year: Array.from(years).sort((a, b) => a - b)
    };
  }

  async getSummary(filters: DashboardSummaryFilters = {}): Promise<DashboardSummary> {
    const { region, year, priority, organization } = filters;

    const allProjects = (await this.listAllProjects()).filter((item) =>
      matchesRegion(item.region, region)
    );

    const projects = allProjects.filter((project) => {
      const excelData = toRecord(project.excelData);

      const projectPriority = getProjectPriority(project.priority, excelData);
      if (!matchesTextFilter(projectPriority, priority)) {
        return false;
      }

      const projectOrganization = getProjectOrganization(project.lead, excelData);

      if (!matchesTextFilter(projectOrganization, organization)) {
        return false;
      }

      const periodRange = parseYearRangeFromPeriod(pickExcelString(excelData, ["Период реализации"]));
      const startYear = project.startYear ?? parseYear(project.startDate) ?? periodRange.startYear;
      const endYear = project.endYear ?? parseYear(project.endDate) ?? periodRange.endYear ?? startYear;
      return overlapsYear(startYear, endYear, year);
    });

    const budgetsByYearKeys = [
      "Одобренная сумма на 1 год",
      "Одобренная сумма на 2 год",
      "Одобренная сумма на 3 год",
      "Одобренная сумма на 4 год",
      "Одобренная сумма на 5 год"
    ];

    let grants = 0;
    let programs = 0;
    let contracts = 0;
    let totalPublications = 0;
    let journals = 0;
    let conferences = 0;
    let books = 0;
    let totalBudgetRaw = 0;
    let selectedYearBudgetRaw = 0;
    let durationSumYears = 0;
    let durationCount = 0;

    const uniquePeople = new Set<string>();

    const byRegionMap = new Map<string, { projects: number; employees: Set<string>; publications: number; budgetRaw: number }>();

    for (const project of projects) {
      const excelData = toRecord(project.excelData);
      const financingFallback = pickExcelString(excelData, ["Тип финансирования", "Тип конкурса", "GF/PCF/PK"]);
      const financingType = detectFinancingType(project.tags, project.financingType || financingFallback);

      if (financingType === "grant") {
        grants += 1;
      } else if (financingType === "program") {
        programs += 1;
      } else if (financingType === "contract") {
        contracts += 1;
      }

      const domestic = pickExcelNumber(excelData, ["Отечественные публикации"]);
      const foreign = pickExcelNumber(excelData, ["Зарубежные публикации"]);
      const projectTotalPublications = domestic + foreign;
      totalPublications += projectTotalPublications;

      const scopus = pickExcelNumber(excelData, ["Публикаций Scopus"]);
      const wos = pickExcelNumber(excelData, ["Публикаций Web of science", "Публикаций Web of Science"]);
      journals += scopus + wos;

      const projectBooks = pickExcelNumber(excelData, ["Количество книг"]);
      books += projectBooks;

      const budgetRaw = Math.max(project.budget, 0);
      totalBudgetRaw += budgetRaw;

      const periodRange = parseYearRangeFromPeriod(pickExcelString(excelData, ["Период реализации"]));
      const startYear = project.startYear ?? parseYear(project.startDate) ?? periodRange.startYear;
      const endYear = project.endYear ?? parseYear(project.endDate) ?? periodRange.endYear ?? startYear;

      if (startYear && endYear && endYear >= startYear) {
        durationSumYears += endYear - startYear + 1;
        durationCount += 1;
      }

      if (year && startYear) {
        const index = year - startYear;
        if (index >= 0 && index < budgetsByYearKeys.length) {
          selectedYearBudgetRaw += pickExcelNumber(excelData, [budgetsByYearKeys[index]]);
        }
      }

      const leader = pickExcelString(excelData, ["Научный руководитель", "Заявитель"]);
      if (leader) {
        uniquePeople.add(leader);
      }

      const regionKey = project.region || pickExcelString(excelData, ["Регион заявителя", "Регион", "Город заявителя"]) || "—";
      const regionBucket = byRegionMap.get(regionKey) ?? {
        projects: 0,
        employees: new Set<string>(),
        publications: 0,
        budgetRaw: 0
      };

      regionBucket.projects += 1;
      regionBucket.publications += projectTotalPublications;
      regionBucket.budgetRaw += budgetRaw;
      if (leader) {
        regionBucket.employees.add(leader);
      }
      byRegionMap.set(regionKey, regionBucket);
    }

    if (!year) {
      selectedYearBudgetRaw = projects.reduce((sum, project) => sum + Math.max(project.spent, 0), 0);
    }

    if (selectedYearBudgetRaw <= 0) {
      selectedYearBudgetRaw = totalBudgetRaw * 0.65;
    }

    const commercialization = Math.max(projects.length - grants - programs - contracts, 0);
    conferences = Math.max(totalPublications - journals - books, 0);
    const other = Math.max(totalPublications - journals - conferences - books, 0);

    const byRegion = Array.from(byRegionMap.entries())
      .map(([regionName, value]) => ({
        region: regionName,
        projects: value.projects,
        employees: value.employees.size,
        publications: value.publications,
        budget: Number((value.budgetRaw / 1_000_000_000).toFixed(2))
      }))
      .sort((a, b) => b.projects - a.projects);

    const totalBudget = totalBudgetRaw / 1_000_000_000;
    const lastYear = selectedYearBudgetRaw / 1_000_000_000;

    return {
      projects: {
        total: projects.length,
        grants,
        programs,
        contracts,
        commercialization,
        avgDuration: durationCount > 0 ? Number((durationSumYears / durationCount).toFixed(1)) : 0
      },
      publications: {
        total: Math.round(totalPublications),
        journals: Math.round(journals),
        conferences: Math.round(conferences),
        books: Math.round(books),
        other: Math.round(other)
      },
      people: {
        total: uniquePeople.size,
        docents: 0,
        professors: 0,
        associateProfessors: 0,
        avgAge: 0
      },
      finances: {
        total: Number(totalBudget.toFixed(2)),
        lastYear: Number(lastYear.toFixed(2)),
        avgExpense: projects.length ? Number((lastYear / projects.length).toFixed(2)) : 0,
        budgetUsage: totalBudget > 0 ? Number(((lastYear / totalBudget) * 100).toFixed(1)) : 0,
        regionalPrograms: byRegion.length
      },
      byRegion
    };
  }

  private async listAllProjects() {
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
}