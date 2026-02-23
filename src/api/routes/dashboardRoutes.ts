import { Router } from "express";
import { DashboardService } from "../../application/use-cases/dashboard/DashboardService";
import { asyncHandler } from "../../shared/http/asyncHandler";

export const buildDashboardRoutes = (dashboardService: DashboardService): Router => {
  const router = Router();

  router.get(
    "/summary",
    asyncHandler(async (req, res) => {
      const region = req.query.region?.toString();
      const summary = await dashboardService.getSummary(region);
      res.status(200).json(summary);
    })
  );

  return router;
};