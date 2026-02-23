import { Employee } from "../../../domain/catalog/Employee";
import { EmployeeFilterMeta, EmployeeFilterOptions, EmployeeListFilters, EmployeeRepository } from "../../ports/CatalogRepositories";
import { PaginatedResult } from "../../ports/Pagination";

export class EmployeeService {
  constructor(private readonly employeeRepository: EmployeeRepository) {}

  list(filters: EmployeeListFilters): Promise<PaginatedResult<Employee>> {
    return this.employeeRepository.list(filters);
  }

  getFilters(): Promise<EmployeeFilterOptions> {
    return this.employeeRepository.getFilters();
  }

  getFilterMeta(filters: EmployeeListFilters): Promise<EmployeeFilterMeta> {
    return this.employeeRepository.getFilterMeta(filters);
  }

  getById(id: string): Promise<Employee | null> {
    return this.employeeRepository.getById(id);
  }

  create(input: Employee): Promise<Employee> {
    return this.employeeRepository.create(input);
  }

  update(id: string, input: Partial<Employee>): Promise<Employee | null> {
    return this.employeeRepository.update(id, input);
  }

  delete(id: string): Promise<boolean> {
    return this.employeeRepository.delete(id);
  }
}
