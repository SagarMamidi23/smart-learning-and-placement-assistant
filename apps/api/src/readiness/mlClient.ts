import { z } from "zod";
import {
  READINESS_FEATURE_LABELS,
  type ReadinessFactor,
  type ReadinessFeatures,
} from "@slp/shared";
import { config } from "../config";
import { logger } from "../logger";

const responseSchema = z.object({
  score: z.number().min(0).max(100),
  model_version: z.string().min(1),
  top_factors: z.array(
    z.object({
      feature: z.string(),
      value: z.number(),
      typical: z.number(),
      impact: z.number(),
      direction: z.enum(["raises", "lowers"]),
    }),
  ),
});

export interface MlPrediction {
  score: number;
  modelVersion: string;
  factors: ReadinessFactor[];
}

export interface ReadinessPredictor {
  predict(features: ReadinessFeatures): Promise<MlPrediction | null>;
}

/**
 * Calls the ML service. Returns null on ANY failure (down, slow, 5xx, malformed reply) so the caller can fall
 * back to the weighted formula: a readiness score should never be unavailable because a service restarted.
 */
export class MlReadinessClient implements ReadinessPredictor {
  constructor(
    private baseUrl = config.mlServiceUrl,
    private fetchImpl: typeof fetch = fetch,
    private timeoutMs = 3000,
  ) {}

  async predict(features: ReadinessFeatures): Promise<MlPrediction | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(features),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) throw new Error(`ml service replied ${res.status}`);
      const parsed = responseSchema.parse(await res.json());
      return {
        score: parsed.score,
        modelVersion: parsed.model_version,
        factors: parsed.top_factors
          .filter(
            (f): f is typeof f & { feature: keyof ReadinessFeatures } =>
              f.feature in READINESS_FEATURE_LABELS,
          )
          .map((f) => ({ ...f, label: READINESS_FEATURE_LABELS[f.feature] })),
      };
    } catch (e) {
      logger.warn(
        { err: (e as Error).message },
        "ml readiness service unavailable, using fallback",
      );
      return null;
    }
  }
}

let instance: ReadinessPredictor | undefined;
export const getPredictor = () => (instance ??= new MlReadinessClient());
/** Tests inject a fake; call with no argument to restore the real client. */
export const setPredictor = (p?: ReadinessPredictor) => {
  instance = p;
};
