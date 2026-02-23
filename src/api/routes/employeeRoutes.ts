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
      const employees = await employeeService.list({
        region: req.query.region?.toString(),
        position: req.query.position?.toString(),
        degree: req.query.degree?.toString(),
        minHIndex: Number.isFinite(minHIndexRaw) ? minHIndexRaw : undefined,
        maxHIndex: Number.isFinite(maxHIndexRaw) ? maxHIndexRaw : undefined,
        q: req.query.q?.toString(),
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
      const filters = await employeeService.getFilterMeta({
        region: req.query.region?.toString(),
        position: req.query.position?.toString(),
        degree: req.query.degree?.toString(),
        minHIndex: Number.isFinite(minHIndexRaw) ? minHIndexRaw : undefined,
        maxHIndex: Number.isFinite(maxHIndexRaw) ? maxHIndexRaw : undefined,
        q: req.query.q?.toString()
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
