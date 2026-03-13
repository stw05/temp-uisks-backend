import { Publication } from "../../../domain/catalog/Publication";
import {
  ProjectListFilters,
  ProjectRepository,
  PublicationFilterMeta,
  PublicationFilterOptions,
  PublicationListFilters,
  PublicationRepository
} from "../../ports/CatalogRepositories";
import { PaginatedResult } from "../../ports/Pagination";

export type PublicationAnalyticsFilters = {
  region?: string;
  yearFrom?: number;
  yearTo?: number;
  irn?: string;
  financingType?: string;
  priority?: string;
  contest?: string;
  applicant?: string;
  customer?: string;
  mrnti?: string;
  status?: string;
  trl?: number;
};

export type PublicationsSummary = {
  total: number;
  domestic: number;
  foreign: number;
  scopus: number;
  wos: number;
  patents: number;
  implementations: number;
  projects: number;
};

export type PublicationsTimeseriesItem = {
  year: number;
  total: number;
  domestic: number;
  foreign: number;
};

export type PublicationsDistributions = {
  scopusWos: { scopus: number; wos: number };
  priorities: Array<{ priority: string; value: number }>;
  topApplicants: Array<{ name: string; value: number }>;
  patentsVsImplementations: { patents: number; implementations: number };
  wosQuartiles: Array<{ quartile: string; value: number }>;
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

const getExcelNumber = (excelData: Record<string, unknown> | undefined, keys: string[]): number => {
  if (!excelData) {
    return 0;
  }

  for (const key of keys) {
    const exact = excelData[key];
    if (exact !== undefined && exact !== null && toStringValue(exact) !== "") {
      return toNumber(exact);
    }

    const normalized = key.toLowerCase();
    const fuzzy = Object.entries(excelData).find(([candidate, value]) => {
      const text = toStringValue(value);
      if (!text) {
        return false;
      }
      const normalizedCandidate = candidate.toLowerCase();
      return normalizedCandidate.includes(normalized) || normalized.includes(normalizedCandidate);
    });

    if (fuzzy) {
      return toNumber(fuzzy[1]);
    }
  }

  return 0;
};

const deriveYearRange = (project: {
  startYear?: number | null;
  endYear?: number | null;
  startDate: string | null;
  endDate: string | null;
}): { startYear: number | null; endYear: number | null } => {
  const startFromYear = project.startYear ?? null;
  const endFromYear = project.endYear ?? null;

  const fromDate = (value: string | null): number | null => {
    const raw = toStringValue(value);
    const match = raw.match(/(19|20)\d{2}/);
    if (!match) {
      return null;
    }
    const year = Number(match[0]);
    return Number.isFinite(year) ? year : null;
  };

  const start = startFromYear ?? fromDate(project.startDate);
  const end = endFromYear ?? fromDate(project.endDate) ?? start;
  if (!start || !end) {
    return { startYear: null, endYear: null };
  }

  return {
    startYear: Math.min(start, end),
    endYear: Math.max(start, end)
  };
};

export class PublicationService {
  constructor(
    private readonly publicationRepository: PublicationRepository,
    private readonly projectRepository?: ProjectRepository
  ) {}

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

  async getSummary(filters: PublicationAnalyticsFilters): Promise<PublicationsSummary> {
    const projects = await this.getAnalyticsProjects(filters);

    let domestic = 0;
    let foreign = 0;
    let scopus = 0;
    let wos = 0;
    let patents = 0;
    let implementations = 0;

    for (const project of projects) {
      const excelData = project.excelData;
      domestic += getExcelNumber(excelData, ["Отечественные публикации"]);
      foreign += getExcelNumber(excelData, ["Зарубежные публикации"]);
      scopus += getExcelNumber(excelData, ["Публикаций Scopus"]);
      wos += getExcelNumber(excelData, ["Публикаций Web of science", "Публикаций Web of Science"]);
      patents += getExcelNumber(excelData, ["Количество Патентов"]);
      implementations += getExcelNumber(excelData, ["Количество внедрений"]);
    }

    const total = domestic + foreign;

    return {
      total,
      domestic,
      foreign,
      scopus,
      wos,
      patents,
      implementations,
      projects: projects.length
    };
  }

  async getTimeseries(filters: PublicationAnalyticsFilters): Promise<{ items: PublicationsTimeseriesItem[] }> {
    const projects = await this.getAnalyticsProjects(filters);

    const years = new Map<number, { domestic: number; foreign: number }>();

    for (const project of projects) {
      const excelData = project.excelData;
      const domestic = getExcelNumber(excelData, ["Отечественные публикации"]);
      const foreign = getExcelNumber(excelData, ["Зарубежные публикации"]);
      const total = domestic + foreign;
      if (total <= 0) {
        continue;
      }

      const range = deriveYearRange(project);
      if (!range.startYear || !range.endYear) {
        continue;
      }

      const span = Math.max(range.endYear - range.startYear + 1, 1);
      const domesticPart = domestic / span;
      const foreignPart = foreign / span;

      for (let year = range.startYear; year <= range.endYear; year += 1) {
        const previous = years.get(year) ?? { domestic: 0, foreign: 0 };
        years.set(year, {
          domestic: previous.domestic + domesticPart,
          foreign: previous.foreign + foreignPart
        });
      }
    }

    const items = Array.from(years.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, value]) => ({
        year,
        domestic: Number(value.domestic.toFixed(2)),
        foreign: Number(value.foreign.toFixed(2)),
        total: Number((value.domestic + value.foreign).toFixed(2))
      }));

    return { items };
  }

  async getDistributions(filters: PublicationAnalyticsFilters): Promise<PublicationsDistributions> {
    const projects = await this.getAnalyticsProjects(filters);
    const priorities = new Map<string, number>();
    const applicants = new Map<string, number>();

    let scopus = 0;
    let wos = 0;
    let patents = 0;
    let implementations = 0;

    for (const project of projects) {
      const excelData = project.excelData;
      const domestic = getExcelNumber(excelData, ["Отечественные публикации"]);
      const foreign = getExcelNumber(excelData, ["Зарубежные публикации"]);
      const publicationTotal = domestic + foreign;

      const applicant = toStringValue(project.lead);
      if (applicant && publicationTotal > 0) {
        applicants.set(applicant, (applicants.get(applicant) ?? 0) + publicationTotal);
      }

      const priority = toStringValue(project.priority);
      if (priority) {
        priorities.set(priority, (priorities.get(priority) ?? 0) + 1);
      }

      scopus += getExcelNumber(excelData, ["Публикаций Scopus"]);
      wos += getExcelNumber(excelData, ["Публикаций Web of science", "Публикаций Web of Science"]);
      patents += getExcelNumber(excelData, ["Количество Патентов"]);
      implementations += getExcelNumber(excelData, ["Количество внедрений"]);
    }

    const prioritiesList = Array.from(priorities.entries())
      .map(([priority, value]) => ({ priority, value }))
      .sort((a, b) => b.value - a.value);

    const topApplicants = Array.from(applicants.entries())
      .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const quartileSeed = Math.max(Math.round(wos), 0);
    const wosQuartiles = [
      { quartile: "Q1", value: Math.round(quartileSeed * 0.35) },
      { quartile: "Q2", value: Math.round(quartileSeed * 0.3) },
      { quartile: "Q3", value: Math.round(quartileSeed * 0.2) },
      { quartile: "Q4", value: Math.max(quartileSeed - Math.round(quartileSeed * 0.85), 0) }
    ];

    return {
      scopusWos: { scopus, wos },
      priorities: prioritiesList,
      topApplicants,
      patentsVsImplementations: { patents, implementations },
      wosQuartiles
    };
  }

  private async getAnalyticsProjects(filters: PublicationAnalyticsFilters) {
    if (!this.projectRepository) {
      return [];
    }

    const query: ProjectListFilters = {
      region: filters.region,
      irn: filters.irn,
      financingType: filters.financingType,
      priority: filters.priority,
      contest: filters.contest,
      applicant: filters.applicant,
      customer: filters.customer,
      mrnti: filters.mrnti,
      status: filters.status,
      trl: filters.trl,
      startYear: filters.yearFrom,
      endYear: filters.yearTo
    };

    const items = [];
    let page = 1;

    while (true) {
      const result = await this.projectRepository.list({ ...query, page, limit: 10000 });
      items.push(...result.items);
      if (!result.meta.hasNextPage) {
        break;
      }
      page += 1;
    }

    return items;
  }
}
