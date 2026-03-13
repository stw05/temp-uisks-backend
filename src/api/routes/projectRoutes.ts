import { Router } from "express";
import { ProjectService } from "../../application/use-cases/catalog/ProjectService";
import { JwtService } from "../../infrastructure/services/JwtService";
import { InMemoryTokenBlacklist } from "../../infrastructure/services/InMemoryTokenBlacklist";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { authMiddleware, requireRole } from "../../shared/http/authMiddleware";
import { AppError } from "../../shared/http/errors";
import { readPaginationFromQuery } from "../../shared/http/pagination";

export const buildProjectRoutes = (
  projectService: ProjectService,
  jwtService: JwtService,
  tokenBlacklist: InMemoryTokenBlacklist
): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const pagination = readPaginationFromQuery(req);
      const trlRaw = req.query.trl ? Number(req.query.trl) : undefined;
      const startYearRaw = req.query.startYear ? Number(req.query.startYear) : undefined;
      const endYearRaw = req.query.endYear ? Number(req.query.endYear) : undefined;
      const projects = await projectService.list({
        irn: req.query.irn?.toString(),
        status: req.query.status?.toString(),
        region: req.query.region?.toString(),
        financingType: req.query.financingType?.toString(),
        priority: req.query.priority?.toString(),
        applicant: req.query.applicant?.toString(),
        contest: req.query.contest?.toString(),
        customer: req.query.customer?.toString(),
        mrnti: req.query.mrnti?.toString(),
        trl: Number.isFinite(trlRaw) ? trlRaw : undefined,
        startYear: Number.isFinite(startYearRaw) ? startYearRaw : undefined,
        endYear: Number.isFinite(endYearRaw) ? endYearRaw : undefined,
        q: req.query.q?.toString(),
        ...pagination
      });
      res.status(200).json(projects);
    })
  );

  router.get(
    "/filters",
    asyncHandler(async (_req, res) => {
      const filters = await projectService.getFilters();
      res.status(200).json(filters);
    })
  );

  router.get(
    "/filters-meta",
    asyncHandler(async (req, res) => {
      const trlRaw = req.query.trl ? Number(req.query.trl) : undefined;
      const startYearRaw = req.query.startYear ? Number(req.query.startYear) : undefined;
      const endYearRaw = req.query.endYear ? Number(req.query.endYear) : undefined;
      const filters = await projectService.getFilterMeta({
        irn: req.query.irn?.toString(),
        status: req.query.status?.toString(),
        region: req.query.region?.toString(),
        financingType: req.query.financingType?.toString(),
        priority: req.query.priority?.toString(),
        applicant: req.query.applicant?.toString(),
        contest: req.query.contest?.toString(),
        customer: req.query.customer?.toString(),
        mrnti: req.query.mrnti?.toString(),
        trl: Number.isFinite(trlRaw) ? trlRaw : undefined,
        startYear: Number.isFinite(startYearRaw) ? startYearRaw : undefined,
        endYear: Number.isFinite(endYearRaw) ? endYearRaw : undefined,
        q: req.query.q?.toString()
      });
      res.status(200).json(filters);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const project = await projectService.getById(req.params.id);
      if (!project) {
        throw new AppError("Project not found", 404);
      }

      res.status(200).json(project);
    })
  );

  router.post(
    "/",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const created = await projectService.create(req.body);
      res.status(201).json(created);
    })
  );

  router.patch(
    "/:id",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const updated = await projectService.update(req.params.id, req.body);
      if (!updated) {
        throw new AppError("Project not found", 404);
      }

      res.status(200).json(updated);
    })
  );

  router.delete(
    "/:id",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      await projectService.delete(req.params.id);
      res.status(204).send();
    })
  );

  return router;
};
