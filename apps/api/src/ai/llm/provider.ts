import type { ProviderConfig } from "./config";
import {
  LLMProviderError,
  type CompletionRequest,
  type CompletionResult,
  type LLMProvider,
} from "./types";

const MAX_RETRIES = 2;
// Free tiers cap tokens per minute and ask for 5-20 s waits; hold a request that long rather than fail it.
const MAX_BACKOFF_MS = 20_000;

interface ChatCompletionResponse {
  model?: string;
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface StreamChunk {
  choices?: { delta?: { content?: string | null } }[];
}

function retryAfterMs(res: Response): number | undefined {
  const ms = Number(res.headers.get("retry-after-ms"));
  if (ms > 0) return ms;
  const s = Number(res.headers.get("retry-after"));
  return s > 0 ? s * 1000 : undefined;
}

/** Any OpenAI-compatible /chat/completions endpoint: Groq, OpenAI, Ollama, Gemini's compat layer, and so on. */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;

  constructor(
    private cfg: ProviderConfig,
    private deps: {
      fetchImpl?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
    } = {},
  ) {
    this.name = cfg.name;
    this.model = cfg.model;
  }

  /** POSTs to /chat/completions, retrying 429 and 5xx, and returns a successful Response. */
  private async request(body: string, signal: AbortSignal): Promise<Response> {
    const doFetch = this.deps.fetchImpl ?? fetch;
    const sleep = this.deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${this.cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.cfg.apiKey ? { Authorization: `Bearer ${this.cfg.apiKey}` } : {}),
          },
          body,
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new LLMProviderError("timeout", "LLM request timed out");
        throw new LLMProviderError("unavailable", `LLM network error: ${(e as Error).message}`);
      }
      if (res.ok) return res;

      const detail = (await res.text().catch(() => "")).slice(0, 300);
      if (res.status === 401 || res.status === 403) {
        throw new LLMProviderError("auth", `LLM rejected the credentials (${res.status})`);
      }
      if (res.status === 429 || res.status >= 500) {
        const wait = retryAfterMs(res);
        const kind = res.status === 429 ? "rate_limited" : "unavailable";
        const delay = Math.min(wait ?? 1_000 * 2 ** attempt, MAX_BACKOFF_MS);
        // Give up when out of retries, or when the provider asks for a wait longer than we will hold a request open.
        if (attempt >= MAX_RETRIES || (wait !== undefined && wait > MAX_BACKOFF_MS)) {
          throw new LLMProviderError(kind, `LLM ${res.status}: ${detail}`, wait);
        }
        await sleep(delay);
        continue;
      }
      throw new LLMProviderError("bad_request", `LLM ${res.status}: ${detail}`);
    }
  }

  private bodyFor(req: CompletionRequest, stream: boolean) {
    return JSON.stringify({
      model: this.cfg.model,
      messages: req.messages,
      temperature: req.temperature,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true } : {}),
      ...this.cfg.extraBody,
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const res = await this.request(this.bodyFor(req, false), req.signal);
    const data = (await res.json()) as ChatCompletionResponse;
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new LLMProviderError("unavailable", "LLM returned an empty completion");
    return {
      text,
      model: data.model ?? this.cfg.model,
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    };
  }

  /** Server-sent events: yields each text delta as it arrives. */
  async *stream(req: CompletionRequest): AsyncGenerator<string> {
    const res = await this.request(this.bodyFor(req, true), req.signal);
    if (!res.body) throw new LLMProviderError("unavailable", "LLM stream had no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch {
          if (req.signal.aborted) throw new LLMProviderError("timeout", "LLM stream timed out");
          throw new LLMProviderError("unavailable", "LLM stream was interrupted");
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const data = line.startsWith("data:") ? line.slice(5).trim() : "";
          if (!data) continue;
          if (data === "[DONE]") return;
          let parsed: StreamChunk;
          try {
            parsed = JSON.parse(data) as StreamChunk;
          } catch {
            continue; // ignore keep-alives and partial garbage
          }
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }
}
