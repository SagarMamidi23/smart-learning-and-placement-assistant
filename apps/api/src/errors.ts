import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { MulterError } from "multer";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid request", result.error.flatten());
  }
  return result.data;
}

function send(req: Request, res: Response, e: AppError) {
  res.status(e.status).json({
    error: { code: e.code, message: e.message, details: e.details, requestId: req.id },
  });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) return send(req, res, err);
  if (err instanceof ZodError) {
    return send(req, res, new AppError(400, "VALIDATION_ERROR", "Invalid request", err.flatten()));
  }
  if (err instanceof MulterError) {
    const tooBig = err.code === "LIMIT_FILE_SIZE";
    return send(
      req,
      res,
      new AppError(tooBig ? 413 : 400, tooBig ? "FILE_TOO_LARGE" : "UPLOAD_ERROR", err.message),
    );
  }
  if (err?.type === "entity.parse.failed") {
    return send(req, res, new AppError(400, "BAD_JSON", "Malformed JSON body"));
  }
  req.log.error(err);
  send(req, res, new AppError(500, "INTERNAL", "Internal server error"));
};
