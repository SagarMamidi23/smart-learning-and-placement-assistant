import type { RequestHandler } from "express";
import type { Role } from "@slp/shared";
import { AppError } from "../errors";
import { ACCESS_COOKIE, verifyAccessToken } from "../auth/tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: Role };
    }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = req.cookies?.[ACCESS_COOKIE] ?? bearer;
  if (!token) return next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
  try {
    const p = verifyAccessToken(token);
    req.auth = { userId: p.sub, role: p.role };
    next();
  } catch {
    next(new AppError(401, "INVALID_TOKEN", "Invalid or expired token"));
  }
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(new AppError(401, "UNAUTHENTICATED", "Authentication required"));
    if (!roles.includes(req.auth.role)) {
      return next(new AppError(403, "FORBIDDEN", "Insufficient permissions"));
    }
    next();
  };
