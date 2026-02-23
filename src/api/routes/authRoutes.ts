import { Router } from "express";
import { asyncHandler } from "../../shared/http/asyncHandler";
import { LoginUserUseCase } from "../../application/use-cases/auth/LoginUserUseCase";
import { RegisterUserUseCase } from "../../application/use-cases/auth/RegisterUserUseCase";
import { JwtService } from "../../infrastructure/services/JwtService";
import { InMemoryTokenBlacklist } from "../../infrastructure/services/InMemoryTokenBlacklist";
import { authMiddleware, AuthenticatedRequest } from "../../shared/http/authMiddleware";
import { UserRepository } from "../../application/ports/UserRepository";
import { AppError } from "../../shared/http/errors";

export const buildAuthRoutes = (
  registerUserUseCase: RegisterUserUseCase,
  loginUserUseCase: LoginUserUseCase,
  jwtService: JwtService,
  tokenBlacklist: InMemoryTokenBlacklist,
  userRepository: UserRepository
): Router => {
  const router = Router();

  router.post(
    "/register",
    asyncHandler(async (req, res) => {
      const user = await registerUserUseCase.execute(req.body);
      res.status(201).json(user);
    })
  );

  router.post(
    "/login",
    asyncHandler(async (req, res) => {
      const result = await loginUserUseCase.execute(req.body);
      res.status(200).json(result);
    })
  );

  router.post(
    "/logout",
    authMiddleware(jwtService, tokenBlacklist),
    asyncHandler(async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      if (authReq.token) {
        tokenBlacklist.revoke(authReq.token);
      }

      res.status(200).json({ success: true });
    })
  );

  router.get(
    "/me",
    authMiddleware(jwtService, tokenBlacklist),
    asyncHandler(async (req, res) => {
      const authReq = req as AuthenticatedRequest;
      const user = await userRepository.findById(authReq.userId || "");

      if (!user) {
        throw new AppError("Unauthorized", 401);
      }

      res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          name: user.fullName,
          role: user.role
        },
        role: user.role
      });
    })
  );

  return router;
};
