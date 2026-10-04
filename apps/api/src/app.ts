import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { HealthResponse } from "@slp/shared";
import { config } from "./config";
import { logger } from "./logger";
import { httpDuration, registry } from "./metrics";
import { dbReady } from "./db";
import { errorHandler } from "./errors";
import { openapi } from "./openapi";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { adminDomainsRouter, domainsRouter } from "./routes/domains";
import { discoveryRouter } from "./routes/discovery";
import { skillGapRouter } from "./routes/skillGap";
import { learningPathRouter } from "./routes/learningPath";
import { mentorRouter } from "./routes/mentor";
import { studyMaterialRouter } from "./routes/studyMaterial";
import { adminAssessmentsRouter } from "./routes/adminAssessments";
import { assessmentsRouter } from "./routes/assessments";
import { mockEvalRouter } from "./routes/mockEval";
import { featuresRouter } from "./routes/features";
import { readinessRouter } from "./routes/readiness";
import { adminOpportunitiesRouter, opportunitiesRouter } from "./routes/opportunities";
import { applicationsRouter } from "./routes/applications";
import { adminAnalyticsRouter } from "./routes/adminAnalytics";

export function createApp() {
  const app = express();
  if (config.isProd) app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers["x-request-id"] as string) ?? randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: {
        ignore: (req) => ["/health", "/ready", "/metrics"].includes(req.url ?? ""),
      },
    }),
  );
  app.use((req, res, next) => {
    const end = httpDuration.startTimer();
    res.on("finish", () =>
      end({
        method: req.method,
        route: req.route ? `${req.baseUrl}${req.route.path}` : "unmatched",
        status: res.statusCode,
      }),
    );
    next();
  });

  app.get("/health", (_req, res) => {
    const body: HealthResponse = { status: "ok", service: "api", uptime: process.uptime() };
    res.json(body);
  });
  app.get("/ready", (_req, res) => {
    const ready = dbReady();
    res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not-ready", db: ready });
  });
  app.get("/metrics", async (req, res) => {
    // Optional bearer token, so a public deployment does not expose usage figures to the internet.
    const token = config.metricsToken;
    if (token) {
      const given = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      const want = Buffer.from(token);
      if (given.length !== want.length || !timingSafeEqual(given, want)) {
        res
          .status(401)
          .json({ error: { code: "UNAUTHORIZED", message: "Metrics token required" } });
        return;
      }
    }
    res.set("Content-Type", registry.contentType);
    res.send(await registry.metrics());
  });

  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));

  const limit = (windowMs: number, max: number) =>
    config.rateLimitEnabled
      ? rateLimit({
          windowMs,
          max,
          standardHeaders: true,
          legacyHeaders: false,
          message: { error: { code: "RATE_LIMITED", message: "Too many requests, slow down" } },
        })
      : (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

  const v1 = express.Router();
  v1.use(limit(60_000, 300));
  v1.use("/auth/login", limit(15 * 60_000, 20));
  v1.use("/auth/register", limit(60 * 60_000, 20));
  v1.use("/auth", authRouter);
  v1.use("/profile", profileRouter);
  v1.use("/domains", domainsRouter);
  v1.use("/admin/domains", adminDomainsRouter);
  v1.use("/discovery", discoveryRouter);
  v1.use("/skill-gap", skillGapRouter);
  v1.use("/learning-path", learningPathRouter);
  v1.use("/mentor", mentorRouter);
  v1.use("/admin/study-material", studyMaterialRouter);
  v1.use("/admin/assessments", adminAssessmentsRouter);
  v1.use("/assessments", assessmentsRouter);
  v1.use("/mock-eval", mockEvalRouter);
  v1.use("/features", featuresRouter);
  v1.use("/readiness", readinessRouter);
  v1.use("/admin/opportunities", adminOpportunitiesRouter);
  v1.use("/opportunities", opportunitiesRouter);
  v1.use("/applications", applicationsRouter);
  v1.use("/admin/analytics", adminAnalyticsRouter);
  app.use("/api/v1", v1);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
  app.use(errorHandler);

  return app;
}
