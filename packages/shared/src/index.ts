import { z } from "zod";

export * from "./auth";
export * from "./profile";
export * from "./domain";
export * from "./ai";
export * from "./assessment";
export * from "./readiness";
export * from "./opportunity";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  uptime: z.number(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export * from "./analytics";
