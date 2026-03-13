import { Router } from "express";
import { EmployeeService } from "../../application/use-cases/catalog/EmployeeService";
import { JwtService } from "../../infrastructure/services/JwtService";
import { InMemoryTokenBlacklist } from "../../infrastructure/services/InMemoryTokenBlacklist";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { authMiddleware, requireRole } from "../../shared/http/authMiddleware";
import { AppError } from "../../shared/http/errors";
import { readPaginationFromQuery } from "../../shared/http/pagination";

export const buildEmployeeRoutes = (
  employeeService: EmployeeService,
  jwtService: JwtService,
  tokenBlacklist: InMemoryTokenBlacklist
): Router => {
  const router = Router();

  router.get(
    "/",
    asyncHandler(async (req, res) => {
      const pagination = readPaginationFromQuery(req);
      const minHIndexRaw = req.query.minHIndex ? Number(req.query.minHIndex) : undefined;
      const maxHIndexRaw = req.query.maxHIndex ? Number(req.query.maxHIndex) : undefined;
      const minAgeRaw = req.query.minAge ? Number(req.query.minAge) : undefined;
      const maxAgeRaw = req.query.maxAge ? Number(req.query.maxAge) : undefined;
      const employees = await employeeService.list({
        searchTerm: req.query.searchTerm?.toString(),
        region: req.query.region?.toString(),
        position: req.query.position?.toString(),
        department: req.query.department?.toString(),
        minAge: Number.isFinite(minAgeRaw) ? minAgeRaw : undefined,
        maxAge: Number.isFinite(maxAgeRaw) ? maxAgeRaw : undefined,
        affiliateType: req.query.affiliateType?.toString(),
        gender: req.query.gender?.toString(),
        citizenship: req.query.citizenship?.toString(),
        projectRole: req.query.projectRole?.toString(),
        hIndexGroup: req.query.hIndexGroup?.toString(),
        mrnti: req.query.mrnti?.toString(),
        classifier: req.query.classifier?.toString(),
        degree: req.query.degree?.toString(),
        minHIndex: Number.isFinite(minHIndexRaw) ? minHIndexRaw : undefined,
        maxHIndex: Number.isFinite(maxHIndexRaw) ? maxHIndexRaw : undefined,
        q: req.query.q?.toString() ?? req.query.searchTerm?.toString(),
        ...pagination
      });
      res.status(200).json(employees);
    })
  );

  router.get(
    "/filters",
    asyncHandler(async (_req, res) => {
      const filters = await employeeService.getFilters();
      res.status(200).json(filters);
    })
  );

  router.get(
    "/filters-meta",
    asyncHandler(async (req, res) => {
      const minHIndexRaw = req.query.minHIndex ? Number(req.query.minHIndex) : undefined;
      const maxHIndexRaw = req.query.maxHIndex ? Number(req.query.maxHIndex) : undefined;
      const minAgeRaw = req.query.minAge ? Number(req.query.minAge) : undefined;
      const maxAgeRaw = req.query.maxAge ? Number(req.query.maxAge) : undefined;
      const filters = await employeeService.getFilterMeta({
        searchTerm: req.query.searchTerm?.toString(),
        region: req.query.region?.toString(),
        position: req.query.position?.toString(),
        department: req.query.department?.toString(),
        minAge: Number.isFinite(minAgeRaw) ? minAgeRaw : undefined,
        maxAge: Number.isFinite(maxAgeRaw) ? maxAgeRaw : undefined,
        affiliateType: req.query.affiliateType?.toString(),
        gender: req.query.gender?.toString(),
        citizenship: req.query.citizenship?.toString(),
        projectRole: req.query.projectRole?.toString(),
        hIndexGroup: req.query.hIndexGroup?.toString(),
        mrnti: req.query.mrnti?.toString(),
        classifier: req.query.classifier?.toString(),
        degree: req.query.degree?.toString(),
        minHIndex: Number.isFinite(minHIndexRaw) ? minHIndexRaw : undefined,
        maxHIndex: Number.isFinite(maxHIndexRaw) ? maxHIndexRaw : undefined,
        q: req.query.q?.toString() ?? req.query.searchTerm?.toString()
      });
      res.status(200).json(filters);
    })
  );

  router.get(
    "/:id",
    asyncHandler(async (req, res) => {
      const employee = await employeeService.getById(req.params.id);
      if (!employee) {
        throw new AppError("Employee not found", 404);
      }

      res.status(200).json(employee);
    })
  );

  router.post(
    "/",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const created = await employeeService.create(req.body);
      res.status(201).json(created);
    })
  );

  router.patch(
    "/:id",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      const updated = await employeeService.update(req.params.id, req.body);
      if (!updated) {
        throw new AppError("Employee not found", 404);
      }

      res.status(200).json(updated);
    })
  );

  router.delete(
    "/:id",
    authMiddleware(jwtService, tokenBlacklist),
    requireRole("admin"),
    asyncHandler(async (req, res) => {
      await employeeService.delete(req.params.id);
      res.status(204).send();
    })
  );

  return router;
};
