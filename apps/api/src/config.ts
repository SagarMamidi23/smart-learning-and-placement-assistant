import "dotenv/config";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";
const isTest = process.env.NODE_ENV === "test";

/** Accepts "host:port" (what Render's private network hands out) as well as a full URL, and drops trailing slashes. */
export const withScheme = (url: string) =>
  (/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`).replace(/\/+$/, "");

/** Headers for a JSON call to the ML service, with its bearer token when one is configured. */
export const mlHeaders = (token: string | undefined): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  MONGO_URI: z.string().default("mongodb://localhost:27017/slp"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  LOG_LEVEL: z.string().default("info"),
  JWT_ACCESS_SECRET: isProd
    ? z.string().min(32)
    : z.string().default("dev-access-secret-change-me-0000000000"),
  JWT_REFRESH_SECRET: isProd
    ? z.string().min(32)
    : z.string().default("dev-refresh-secret-change-me-000000000"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(15 * 60),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(7 * 24 * 60 * 60),
  BCRYPT_ROUNDS: z.coerce.number().min(4).max(15).default(12),
  RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default(isTest ? "false" : "true")
    .transform((v) => v === "true"),
  UPLOAD_DIR: z.string().default("./uploads"),
  CLOUDINARY_URL: z.string().optional(),
  MAX_RESUME_BYTES: z.coerce.number().default(5 * 1024 * 1024),

  /** First-run setup on hosts with no shell; see bootstrap.ts. */
  AUTO_SEED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  /** When set, /metrics requires "Authorization: Bearer <token>" (Prometheus: authorization.credentials). */
  METRICS_TOKEN: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),

  // LLM. Presets for groq, gemini, openai and ollama; anything OpenAI-compatible works via LLM_BASE_URL.
  LLM_PROVIDER: z.enum(["groq", "gemini", "openai", "ollama", "custom"]).default("groq"),
  LLM_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(45_000),
  /** Per-user cap on AI-backed requests (each can cost tokens). */
  AI_RATE_LIMIT_PER_HOUR: z.coerce.number().default(30),

  /** Voice interviews via VAPI. Disabled: no voice code is active unless this is set (and the module is built). */
  VOICE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // RAG
  ML_SERVICE_URL: z.string().default("http://localhost:8000"),
  /** Shared secret for the ML service's /embed and /predict (its ML_API_TOKEN). Needed when the ML service is public. */
  ML_API_TOKEN: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  MAX_MATERIAL_BYTES: z.coerce.number().default(30 * 1024 * 1024),
  /**
   * Cosine similarity below which a passage is not considered relevant. Calibrated for bge-small-en-v1.5 on
   * a small sample: related questions scored 0.73-0.85, near-misses about 0.54, unrelated 0.35-0.46.
   * Re-check it if the embedding model or the kind of study material changes.
   */
  RAG_MIN_SCORE: z.coerce.number().default(0.6),
  RAG_TOP_K: z.coerce.number().int().min(1).max(10).default(5),
});

const env = envSchema.parse(process.env);

export const config = {
  env: env.NODE_ENV,
  isProd,
  port: env.PORT,
  mongoUri: env.MONGO_URI,
  corsOrigin: env.CORS_ORIGIN,
  logLevel: env.LOG_LEVEL,
  jwt: {
    accessSecret: env.JWT_ACCESS_SECRET,
    refreshSecret: env.JWT_REFRESH_SECRET,
    accessTtl: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtl: env.REFRESH_TOKEN_TTL_SECONDS,
  },
  bcryptRounds: env.BCRYPT_ROUNDS,
  rateLimitEnabled: env.RATE_LIMIT_ENABLED,
  uploadDir: env.UPLOAD_DIR,
  cloudinaryUrl: env.CLOUDINARY_URL,
  maxResumeBytes: env.MAX_RESUME_BYTES,
  llmTimeoutMs: env.LLM_TIMEOUT_MS,
  aiRateLimitPerHour: env.AI_RATE_LIMIT_PER_HOUR,
  mlServiceUrl: withScheme(env.ML_SERVICE_URL),
  mlApiToken: env.ML_API_TOKEN,
  maxMaterialBytes: env.MAX_MATERIAL_BYTES,
  ragMinScore: env.RAG_MIN_SCORE,
  ragTopK: env.RAG_TOP_K,
  voiceEnabled: env.VOICE_ENABLED,
  metricsToken: env.METRICS_TOKEN || undefined,
  bootstrap: {
    autoSeed: env.AUTO_SEED,
    adminEmail: env.BOOTSTRAP_ADMIN_EMAIL || undefined,
    adminPassword: env.BOOTSTRAP_ADMIN_PASSWORD || undefined,
  },
};

/** Raw LLM env, resolved into a provider config in ai/llm/config.ts (kept separate so it is testable). */
export const llmEnv = {
  provider: env.LLM_PROVIDER,
  model: env.LLM_MODEL,
  baseUrl: env.LLM_BASE_URL,
  apiKey: env.LLM_API_KEY,
  groqKey: env.GROQ_API_KEY,
  geminiKey: env.GEMINI_API_KEY,
  openaiKey: env.OPENAI_API_KEY,
};
