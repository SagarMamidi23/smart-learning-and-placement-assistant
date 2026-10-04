import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config";

/**
 * Caps AI-backed requests per signed-in user (each one costs tokens). Keyed by user id, not IP, so
 * students sharing a campus network don't throttle each other. Counts are in memory: fine for one API
 * instance; use a shared store (Redis) if the API is scaled out.
 */
export function createAiLimiter(
  opts: { max?: number; windowMs?: number; force?: boolean } = {},
): RequestHandler {
  if (!opts.force && !config.rateLimitEnabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: opts.windowMs ?? 60 * 60_000,
    max: opts.max ?? config.aiRateLimitPerHour,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.auth?.userId ?? "anonymous",
    message: {
      error: {
        code: "AI_RATE_LIMITED",
        message: "You have reached the hourly limit for AI requests. Please try again later.",
      },
    },
  });
}

export const aiLimiter = createAiLimiter();
