import client from "prom-client";

/** One registry for the whole process, so request and LLM metrics are exported together at /metrics. */
export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

export const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const llmCalls = new client.Counter({
  name: "llm_calls_total",
  help: "LLM provider calls",
  labelNames: ["feature", "provider", "outcome"],
  registers: [registry],
});

export const llmDuration = new client.Histogram({
  name: "llm_call_duration_seconds",
  help: "LLM provider call latency",
  labelNames: ["feature", "provider"],
  buckets: [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64],
  registers: [registry],
});

export const llmTokens = new client.Counter({
  name: "llm_tokens_total",
  help: "LLM tokens used",
  labelNames: ["feature", "provider", "kind"],
  registers: [registry],
});

export const readinessComputations = new client.Counter({
  name: "readiness_computations_total",
  help: "Readiness scores computed, by source (ml or fallback)",
  labelNames: ["source"],
  registers: [registry],
});
