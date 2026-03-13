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
      const yearRaw = req.query.year ? Number(req.query.year) : undefined;
      const yearFromRaw = req.query.yearFrom ? Number(req.query.yearFrom) : undefined;
      const yearToRaw = req.query.yearTo ? Number(req.query.yearTo) : undefined;
      const startYearRaw = req.query.startYear ? Number(req.query.startYear) : undefined;
      const endYearRaw = req.query.endYear ? Number(req.query.endYear) : undefined;

      const summary = await financeService.getSummary({
        year: Number.isFinite(yearRaw) ? yearRaw : undefined,
        yearFrom: Number.isFinite(yearFromRaw) ? yearFromRaw : undefined,
        yearTo: Number.isFinite(yearToRaw) ? yearToRaw : undefined,
        startYear: Number.isFinite(startYearRaw) ? startYearRaw : undefined,
        endYear: Number.isFinite(endYearRaw) ? endYearRaw : undefined,
        region: req.query.region?.toString(),
        irn: req.query.irn?.toString(),
        financingType: req.query.financingType?.toString(),
        cofinancing: req.query.cofinancing?.toString(),
        expense: req.query.expense?.toString(),
        priority: req.query.priority?.toString(),
        competition: req.query.competition?.toString() ?? req.query.contest?.toString(),
        applicant: req.query.applicant?.toString(),
        customer: req.query.customer?.toString(),
        status: req.query.status?.toString()
      });
      res.status(200).json(summary);
    })
  );

  router.get(
    "/filters",
    asyncHandler(async (req, res) => {
      const yearRaw = req.query.year ? Number(req.query.year) : undefined;
      const yearFromRaw = req.query.yearFrom ? Number(req.query.yearFrom) : undefined;
      const yearToRaw = req.query.yearTo ? Number(req.query.yearTo) : undefined;
      const startYearRaw = req.query.startYear ? Number(req.query.startYear) : undefined;
      const endYearRaw = req.query.endYear ? Number(req.query.endYear) : undefined;

      const filters = await financeService.getFilters({
        year: Number.isFinite(yearRaw) ? yearRaw : undefined,
        yearFrom: Number.isFinite(yearFromRaw) ? yearFromRaw : undefined,
        yearTo: Number.isFinite(yearToRaw) ? yearToRaw : undefined,
        startYear: Number.isFinite(startYearRaw) ? startYearRaw : undefined,
        endYear: Number.isFinite(endYearRaw) ? endYearRaw : undefined,
        region: req.query.region?.toString(),
        irn: req.query.irn?.toString(),
        financingType: req.query.financingType?.toString(),
        cofinancing: req.query.cofinancing?.toString(),
        expense: req.query.expense?.toString(),
        priority: req.query.priority?.toString(),
        competition: req.query.competition?.toString() ?? req.query.contest?.toString(),
        applicant: req.query.applicant?.toString(),
        customer: req.query.customer?.toString(),
        status: req.query.status?.toString()
      });
      res.status(200).json(filters);
    })
  );

  router.get(
    "/filters-meta",
    asyncHandler(async (req, res) => {
      const yearRaw = req.query.year ? Number(req.query.year) : undefined;
      const yearFromRaw = req.query.yearFrom ? Number(req.query.yearFrom) : undefined;
      const yearToRaw = req.query.yearTo ? Number(req.query.yearTo) : undefined;
      const startYearRaw = req.query.startYear ? Number(req.query.startYear) : undefined;
      const endYearRaw = req.query.endYear ? Number(req.query.endYear) : undefined;

      const meta = await financeService.getFilterMeta({
        year: Number.isFinite(yearRaw) ? yearRaw : undefined,
        yearFrom: Number.isFinite(yearFromRaw) ? yearFromRaw : undefined,
        yearTo: Number.isFinite(yearToRaw) ? yearToRaw : undefined,
        startYear: Number.isFinite(startYearRaw) ? startYearRaw : undefined,
        endYear: Number.isFinite(endYearRaw) ? endYearRaw : undefined,
        region: req.query.region?.toString(),
        irn: req.query.irn?.toString(),
        financingType: req.query.financingType?.toString(),
        cofinancing: req.query.cofinancing?.toString(),
        expense: req.query.expense?.toString(),
        priority: req.query.priority?.toString(),
        competition: req.query.competition?.toString() ?? req.query.contest?.toString(),
        applicant: req.query.applicant?.toString(),
        customer: req.query.customer?.toString(),
        status: req.query.status?.toString()
      });
      res.status(200).json(meta);
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
