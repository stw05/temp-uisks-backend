import { EmployeeRepository, FinanceRepository, ProjectRepository, PublicationRepository } from "../../ports/CatalogRepositories";
import { DashboardSummary } from "../../../domain/dashboard/DashboardSummary";

const normalize = (value: string): string => value.trim().toLowerCase();

const matchesRegion = (itemRegion: string, filterRegion?: string): boolean => {
  if (!filterRegion) {
    return true;
  }

  return normalize(itemRegion).includes(normalize(filterRegion));
};

const normalizeProjectId = (value: string): string => normalize(value).replace(/\s+/g, "");

export class DashboardService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly employeeRepository: EmployeeRepository,
    private readonly publicationRepository: PublicationRepository,
    private readonly financeRepository: FinanceRepository
  ) {}

  async getSummary(region?: string): Promise<DashboardSummary> {
    const projects = (await this.projectRepository.list({ page: 1, limit: 100000 })).items.filter((item) =>
      matchesRegion(item.region, region)
    );
    const employees = (await this.employeeRepository.list({ page: 1, limit: 100000 })).items.filter((item) =>
      matchesRegion(item.region, region)
    );
    const publications = (await this.publicationRepository.list({ page: 1, limit: 100000 })).items;
    const financeSummary = await this.financeRepository.getSummary();

    const grants = projects.filter((project) => project.tags.some((tag) => normalize(tag).includes("гран"))).length;
    const programs = projects.filter((project) => project.tags.some((tag) => normalize(tag).includes("програм"))).length;
    const contracts = projects.filter((project) => project.tags.some((tag) => normalize(tag).includes("контракт"))).length;
    const commercialization = Math.max(projects.length - grants - programs - contracts, 0);

    const journals = publications.filter((publication) => normalize(publication.type).includes("journal")).length;
    const conferences = publications.filter((publication) => normalize(publication.type).includes("conference")).length;
    const books = publications.filter((publication) => normalize(publication.type).includes("book")).length;
    const other = Math.max(publications.length - journals - conferences - books, 0);

    const peopleWithAge = employees
      .map((employee) => Number(employee.metrics["age"] ?? 0))
      .filter((age) => Number.isFinite(age) && age > 0);
    const avgAge = peopleWithAge.length
      ? peopleWithAge.reduce((acc, age) => acc + age, 0) / peopleWithAge.length
      : 0;

    const docents = employees.filter((employee) => normalize(employee.position).includes("доцент")).length;
    const professors = employees.filter((employee) => normalize(employee.position).includes("профессор")).length;
    const associateProfessors = Math.max(docents - professors, 0);

    const byRegionMap = new Map<string, { projects: number; employees: number; publications: number; budget: number }>();
    const projectRegionById = new Map<string, string>();
    projects.forEach((project) => {
      const key = project.region || "—";
      const prev = byRegionMap.get(key) ?? { projects: 0, employees: 0, publications: 0, budget: 0 };
      byRegionMap.set(key, {
        ...prev,
        projects: prev.projects + 1,
        budget: prev.budget + Math.max(project.budget, 0)
      });
      projectRegionById.set(normalizeProjectId(project.id), key);
    });

    employees.forEach((employee) => {
      const key = employee.region || "—";
      const prev = byRegionMap.get(key) ?? { projects: 0, employees: 0, publications: 0, budget: 0 };
      byRegionMap.set(key, { ...prev, employees: prev.employees + 1 });
    });

    publications.forEach((publication) => {
      const projectRegion = projectRegionById.get(normalizeProjectId(publication.projectId || ""));
      if (!projectRegion) {
        return;
      }

      const prev = byRegionMap.get(projectRegion) ?? { projects: 0, employees: 0, publications: 0, budget: 0 };
      byRegionMap.set(projectRegion, { ...prev, publications: prev.publications + 1 });
    });

    const budgetTotalFromProjects = Array.from(byRegionMap.values()).reduce((sum, item) => sum + item.budget, 0);
    const totalBudgetInRawCurrency = financeSummary.totalBudget;

    const byRegion = Array.from(byRegionMap.entries())
      .map(([regionName, value]) => ({
        region: regionName,
        projects: value.projects,
        employees: value.employees,
        publications: value.publications,
        budget:
          budgetTotalFromProjects > 0
            ? Number(((value.budget / budgetTotalFromProjects) * totalBudgetInRawCurrency).toFixed(2))
            : 0
      }))
      .sort((a, b) => b.projects - a.projects);

    const totalSpent = financeSummary.totalSpent / 1_000_000_000;
    const totalBudget = financeSummary.totalBudget / 1_000_000_000;

    return {
      projects: {
        total: projects.length,
        grants,
        programs,
        contracts,
        commercialization,
        avgDuration: 0
      },
      publications: {
        total: publications.length,
        journals,
        conferences,
        books,
        other
      },
      people: {
        total: employees.length,
        docents,
        professors,
        associateProfessors,
        avgAge
      },
      finances: {
        total: Number(totalBudget.toFixed(2)),
        lastYear: Number(totalSpent.toFixed(2)),
        avgExpense: projects.length ? Number((totalSpent / projects.length).toFixed(2)) : 0,
        budgetUsage: totalBudget > 0 ? Number(((totalSpent / totalBudget) * 100).toFixed(1)) : 0,
        regionalPrograms: byRegion.length
      },
      byRegion
    };
  }
}