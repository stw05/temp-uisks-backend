import { Router } from "express";
import { FinanceService } from "../../application/use-cases/catalog/FinanceService";
import { JwtService } from "../../infrastructure/services/JwtService";
import { InMemoryTokenBlacklist } from "../../infrastructure/services/InMemoryTokenBlacklist";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { authMiddleware, requireRole } from "../../shared/http/authMiddleware";
import { AppError } from "../../shared/http/errors";

export const buildFinanceRoutes = (
  financeService: FinanceService,
  jwtService: JwtService,
  tokenBlacklist: InMemoryTokenBlacklist
): Router => {
  const router = Router();

  router.get(
    "/summary",
    asyncHandler(async (req, res) => {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const summary = await financeService.getSummary(year);
      res.status(200).json(summary);
    })
  );

  router.get(
    "/projects/:projectId",
    asyncHandler(async (req, res) => {
      const projectFinance = await financeService.getProject(req.params.projectId);
      if (!projectFinance) {
        throw new AppError("Finance project not found", 404);
      }

      res.status(200).json(projectFinance);
    })
  );

  router.post(
    "/projects/:projectId/history",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const projectFinance = await financeService.upsertHistory(req.params.projectId, req.body);
      res.status(200).json(projectFinance);
    })
  );

  router.patch(
    "/projects/:projectId/history",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const projectFinance = await financeService.upsertHistory(req.params.projectId, req.body);
      res.status(200).json(projectFinance);
    })
  );

  return router;
};
