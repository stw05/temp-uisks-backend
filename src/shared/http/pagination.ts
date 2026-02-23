import { Request } from "express";
import { PaginationParams, normalizePagination } from "../../application/ports/Pagination";

const parseQueryNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const readPaginationFromQuery = (req: Request): PaginationParams =>
  normalizePagination({
    page: parseQueryNumber(req.query.page),
    limit: parseQueryNumber(req.query.limit)
  });