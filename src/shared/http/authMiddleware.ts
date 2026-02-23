import { NextFunction, Request, Response } from "express";
import { JwtService } from "../../infrastructure/services/JwtService";
import { AppError } from "./errors";
import { InMemoryTokenBlacklist } from "../../infrastructure/services/InMemoryTokenBlacklist";

export type AuthenticatedRequest = Request & {
  userId?: string;
  userRole?: string;
  token?: string;
};

export const authMiddleware =
  (jwtService: JwtService, tokenBlacklist?: InMemoryTokenBlacklist) =>
  (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const authorizationHeader = req.headers.authorization;
    if (!authorizationHeader?.startsWith("Bearer ")) {
      throw new AppError("Unauthorized", 401);
    }

    const token = authorizationHeader.slice("Bearer ".length);
    if (tokenBlacklist?.isRevoked(token)) {
      throw new AppError("Unauthorized", 401);
    }

    const payload = jwtService.verify(token);

    req.userId = payload.sub;
    req.userRole = payload.role;
    req.token = token;
    next();
  };

export const requireRole =
  (...allowedRoles: string[]) =>
  (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      throw new AppError("Forbidden", 403);
    }

    next();
  };
