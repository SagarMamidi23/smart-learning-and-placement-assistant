export interface LLMEnv {
  provider: "groq" | "gemini" | "openai" | "ollama" | "custom";
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  groqKey?: string;
  geminiKey?: string;
  openaiKey?: string;
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Extra request-body fields some models need (e.g. reasoning effort). */
  extraBody: Record<string, unknown>;
}

const PRESETS = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
  // Gemini's OpenAI-compatible endpoint. Preset not yet exercised against a real key.
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
  },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
} as const;

/**
 * Turns env into a provider config, or null when the provider needs a key that is missing.
 * Swapping vendors is an env change: LLM_PROVIDER, plus LLM_MODEL / LLM_BASE_URL / LLM_API_KEY to override.
 */
export function resolveLLMConfig(env: LLMEnv): ProviderConfig | null {
  const name = env.provider;
  if (name === "custom") {
    if (!env.baseUrl || !env.model) return null;
    return {
      name,
      baseUrl: env.baseUrl.replace(/\/+$/, ""),
      apiKey: env.apiKey,
      model: env.model,
      extraBody: {},
    };
  }
  const preset = PRESETS[name];
  const keys = {
    groq: env.groqKey,
    gemini: env.geminiKey,
    openai: env.openaiKey,
    ollama: undefined,
  };
  const apiKey = env.apiKey ?? keys[name];
  if (name !== "ollama" && !apiKey) return null;

  const model = env.model ?? preset.model;
  return {
    name,
    baseUrl: (env.baseUrl ?? preset.baseUrl).replace(/\/+$/, ""),
    apiKey,
    model,
    // gpt-oss models on Groq reason before answering; low effort keeps structured outputs fast.
    extraBody: name === "groq" && model.includes("gpt-oss") ? { reasoning_effort: "low" } : {},
  };
}
