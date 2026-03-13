import { Router } from "express";
import { DashboardService } from "../../application/use-cases/dashboard/DashboardService";
import { asyncHandler } from "../../shared/http/asyncHandler";

export const buildDashboardRoutes = (dashboardService: DashboardService): Router => {
  const router = Router();

  router.get(
    "/filters",
    asyncHandler(async (_req, res) => {
      const filters = await dashboardService.getFilters();
      res.status(200).json(filters);
    })
  );

  router.get(
    "/summary",
    asyncHandler(async (req, res) => {
      const region = req.query.region?.toString();
      const yearRaw = req.query.year ? Number(req.query.year) : undefined;
      const priority =
        req.query.priority?.toString() ??
        req.query.direction?.toString() ??
        req.query.sciencePriority?.toString() ??
        req.query.priorityDirection?.toString();
      const organization =
        req.query.organization?.toString() ??
        req.query.applicant?.toString() ??
        req.query.org?.toString() ??
        req.query.orgName?.toString();

      const summary = await dashboardService.getSummary({
        region,
        year: Number.isFinite(yearRaw) ? yearRaw : undefined,
        priority,
        organization
      });
      res.status(200).json(summary);
    })
  );

  return router;
};