export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const toPositiveInteger = (value: number | undefined): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
};

export const normalizePagination = (input: PaginationInput = {}): PaginationParams => {
  const normalizedPage = toPositiveInteger(input.page) ?? DEFAULT_PAGE;
  const normalizedLimit = Math.min(toPositiveInteger(input.limit) ?? DEFAULT_LIMIT, MAX_LIMIT);

  return {
    page: normalizedPage,
    limit: normalizedLimit
  };
};

export const paginateArray = <T>(items: T[], input: PaginationInput = {}): PaginatedResult<T> => {
  const { page, limit } = normalizePagination(input);
  const total = items.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const pagedItems = items.slice(startIndex, startIndex + limit);

  return {
    items: pagedItems,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};