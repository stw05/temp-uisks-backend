import { Router } from "express";
import { PublicationService } from "../../application/use-cases/catalog/PublicationService";
import { JwtService } from "../../infrastructure/services/JwtService";
import { InMemoryTokenBlacklist } from "../../infrastructure/services/InMemoryTokenBlacklist";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { authMiddleware, requireRole } from "../../shared/http/authMiddleware";
import { AppError } from "../../shared/http/errors";
import { readPaginationFromQuery } from "../../shared/http/pagination";

export const buildPublicationRoutes = (
  publicationService: PublicationService,
  jwtService: JwtService,
  tokenBlacklist: InMemoryTokenBlacklist
): Router => {
  const router = Router();

  const readAnalyticsFilters = (query: Record<string, unknown>) => {
    const yearFromRaw = query.yearFrom ? Number(query.yearFrom) : undefined;
    const yearToRaw = query.yearTo ? Number(query.yearTo) : undefined;
    const trlRaw = query.trl ? Number(query.trl) : undefined;

    return {
      region: query.region?.toString(),
      yearFrom: Number.isFinite(yearFromRaw) ? yearFromRaw : undefined,
      yearTo: Number.isFinite(yearToRaw) ? yearToRaw : undefined,
      irn: query.irn?.toString(),
      financingType: query.financingType?.toString(),
      priority: query.priority?.toString(),
      contest: query.contest?.toString(),
      applicant: query.applicant?.toString(),
      customer: query.customer?.toString(),
      mrnti: query.mrnti?.toString(),
      status: query.status?.toString(),
      trl: Number.isFinite(trlRaw) ? trlRaw : undefined
    };
  };

  router.get(
    "/summary",
    asyncHandler(async (req, res) => {
      const summary = await publicationService.getSummary(readAnalyticsFilters(req.query as Record<string, unknown>));
      res.status(200).json(summary);
    })
  );

  router.get(
    "/timeseries",
    asyncHandler(async (req, res) => {
      const timeseries = await publicationService.getTimeseries(readAnalyticsFilters(req.query as Record<string, unknown>));
      res.status(200).json(timeseries);
    })
  );

  router.get(
    "/distributions",
    asyncHandler(async (req, res) => {
      const distributions = await publicationService.getDistributions(
        readAnalyticsFilters(req.query as Record<string, unknown>)
      );
      res.status(200).json(distributions);
    })
  );

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const pagination = readPaginationFromQuery(req);
      const yearValue = req.query.year ? Number(req.query.year) : undefined;
      const publications = await publicationService.list({
        year: Number.isFinite(yearValue) ? yearValue : undefined,
        type: req.query.type?.toString(),
        q: req.query.q?.toString(),
        ...pagination
      });
      res.status(200).json(publications);
    })
  );

  router.get(
    "/filters",
    asyncHandler(async (_req, res) => {
      const filters = await publicationService.getFilters();
      res.status(200).json(filters);
    })
  );

  router.get(
    "/filters-meta",
    asyncHandler(async (req, res) => {
      const yearValue = req.query.year ? Number(req.query.year) : undefined;
      const filters = await publicationService.getFilterMeta({
        year: Number.isFinite(yearValue) ? yearValue : undefined,
        type: req.query.type?.toString(),
        q: req.query.q?.toString()
      });
      res.status(200).json(filters);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const publication = await publicationService.getById(req.params.id);
      if (!publication) {
        throw new AppError("Publication not found", 404);
      }

      res.status(200).json(publication);
    })
  );

  router.post(
    "/",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const created = await publicationService.create(req.body);
      res.status(201).json(created);
    })
  );

  router.patch(
    "/:id",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const updated = await publicationService.update(req.params.id, req.body);
      if (!updated) {
        throw new AppError("Publication not found", 404);
      }

      res.status(200).json(updated);
    })
  );

  router.delete(
    "/:id",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      await publicationService.delete(req.params.id);
      res.status(204).send();
    })
  );

  return router;
};
