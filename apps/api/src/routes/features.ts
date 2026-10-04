import { Router } from "express";
import type { FeaturesDto } from "@slp/shared";
import { config } from "../config";

/** Public feature flags so the web app can hide modules the server has not enabled. */
export const featuresRouter = Router();

featuresRouter.get("/", (_req, res) => {
  const features: FeaturesDto = { voice: config.voiceEnabled };
  res.json({ features });
});
