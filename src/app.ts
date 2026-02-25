import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { healthRoutes } from "./api/routes/healthRoutes";
import { buildAuthRoutes } from "./api/routes/authRoutes";
import { PostgresUserRepository } from "./infrastructure/repositories/postgres/PostgresUserRepository";
import { usersDbPool } from "./shared/db/postgresPool";
import { PasswordService } from "./infrastructure/services/PasswordService";
import { JwtService } from "./infrastructure/services/JwtService";
import { env } from "./shared/config/env";
import { RegisterUserUseCase } from "./application/use-cases/auth/RegisterUserUseCase";
import { LoginUserUseCase } from "./application/use-cases/auth/LoginUserUseCase";
import { FileSystemSqlTemplateRepository } from "./infrastructure/repositories/filesystem/FileSystemSqlTemplateRepository";
import { toHttpError } from "./shared/http/errors";
import { appDbPool } from "./shared/db/mysqlPool";
import { createLegacyRepositories } from "./infrastructure/repositories/legacy/LegacyCatalogRepository";
import { ProjectService } from "./application/use-cases/catalog/ProjectService";
import { EmployeeService } from "./application/use-cases/catalog/EmployeeService";
import { PublicationService } from "./application/use-cases/catalog/PublicationService";
import { FinanceService } from "./application/use-cases/catalog/FinanceService";
import { buildProjectRoutes } from "./api/routes/projectRoutes";
import { buildEmployeeRoutes } from "./api/routes/employeeRoutes";
import { buildPublicationRoutes } from "./api/routes/publicationRoutes";
import { buildFinanceRoutes } from "./api/routes/financeRoutes";
import { buildDashboardRoutes } from "./api/routes/dashboardRoutes";
import { InMemoryTokenBlacklist } from "./infrastructure/services/InMemoryTokenBlacklist";
import { openApiSpec } from "./api/docs/openapi";
import { DashboardService } from "./application/use-cases/dashboard/DashboardService";
import { PostgresProjectRepository } from "./infrastructure/repositories/postgres/PostgresProjectRepository";

export const buildApp = (): express.Express => {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.get("/docs-json", (_req, res) => {
    res.status(200).json(openApiSpec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  const userRepository = new PostgresUserRepository(usersDbPool);
  const passwordService = new PasswordService();
  const jwtService = new JwtService(env.JWT_SECRET, env.JWT_EXPIRES_IN);
  const tokenBlacklist = new InMemoryTokenBlacklist();
  const sqlTemplateRepository = new FileSystemSqlTemplateRepository(env.SQL_EXAMPLE_BASE);

  const registerUserUseCase = new RegisterUserUseCase(userRepository, passwordService, jwtService);
  const loginUserUseCase = new LoginUserUseCase(userRepository, passwordService, jwtService);

  const { employeeRepository, publicationRepository, financeRepository } = createLegacyRepositories(
    appDbPool,
    sqlTemplateRepository,
    env.APP_DB_LOCALE
  );

  const projectRepository = new PostgresProjectRepository(usersDbPool, env.USERS_PROJECTS_TABLE);

  const projectService = new ProjectService(projectRepository);
  const employeeService = new EmployeeService(employeeRepository);
  const publicationService = new PublicationService(publicationRepository);
  const financeService = new FinanceService(financeRepository);
  const dashboardService = new DashboardService(projectRepository, employeeRepository, publicationRepository, financeRepository);

  app.use("/api", healthRoutes);
  app.use(
    "/api/auth",
    buildAuthRoutes(registerUserUseCase, loginUserUseCase, jwtService, tokenBlacklist, userRepository)
  );
  app.use("/api/projects", buildProjectRoutes(projectService, jwtService, tokenBlacklist));
  app.use("/api/employees", buildEmployeeRoutes(employeeService, jwtService, tokenBlacklist));
  app.use("/api/publications", buildPublicationRoutes(publicationService, jwtService, tokenBlacklist));
  app.use("/api/finances", buildFinanceRoutes(financeService, jwtService, tokenBlacklist));
  app.use("/api/dashboard", buildDashboardRoutes(dashboardService));

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const httpError = toHttpError(error);
    res.status(httpError.status).json({ error: httpError.message });
  });

  return app;
};
