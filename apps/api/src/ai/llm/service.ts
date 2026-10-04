import type { Logger } from "pino";
import type { z } from "zod";
import { AppError } from "../../errors";
import { logger as defaultLogger } from "../../logger";
import { llmCalls, llmDuration, llmTokens } from "../../metrics";
import { LLMProviderError, type ChatMessage, type LLMProvider } from "./types";

export interface GenerateJsonArgs<S extends z.ZodTypeAny> {
  /** Stable feature name, used for logs and metrics (never the prompt). */
  feature: string;
  system: string;
  prompt: string;
  schema: S;
  temperature?: number;
}

/** Pulls a JSON object out of a model reply, tolerating code fences and stray prose around it. */
export function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new SyntaxError("reply contained no JSON object");
  }
}

const describeIssues = (e: z.ZodError) =>
  e.issues
    .slice(0, 8)
    .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");

/**
 * The single entry point for LLM calls. Handles timeouts, one corrective retry on invalid JSON, schema
 * validation, usage metrics and logging. Logs carry feature, model, latency and token counts only: prompts
 * and replies can contain resume text, so they are never logged.
 */
export class LLMService {
  constructor(
    private provider: LLMProvider | null,
    private opts: { timeoutMs: number; log?: Logger } = { timeoutMs: 45_000 },
  ) {}

  get configured() {
    return this.provider !== null;
  }

  get info() {
    return { provider: this.provider?.name ?? "none", model: this.provider?.model ?? "none" };
  }

  async generateJson<S extends z.ZodTypeAny>(args: GenerateJsonArgs<S>): Promise<z.output<S>> {
    if (!this.provider) {
      throw new AppError(
        503,
        "LLM_NOT_CONFIGURED",
        "The AI service is not configured on this server.",
      );
    }
    const messages: ChatMessage[] = [
      { role: "system", content: args.system },
      { role: "user", content: args.prompt },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      const reply = await this.callProvider(
        this.provider,
        args.feature,
        messages,
        args.temperature ?? 0.3,
      );

      let problem: string;
      try {
        const parsed = args.schema.safeParse(extractJson(reply));
        if (parsed.success) {
          this.record(args.feature, "ok");
          return parsed.data;
        }
        problem = describeIssues(parsed.error);
        this.record(args.feature, "invalid_schema");
      } catch {
        problem = "- the reply was not valid JSON";
        this.record(args.feature, "invalid_json");
      }

      this.log().warn({ feature: args.feature, attempt }, "llm output failed validation");
      if (attempt === 2) break;
      messages.push(
        { role: "assistant", content: reply.slice(0, 4_000) },
        {
          role: "user",
          content: `Your previous reply was invalid:\n${problem}\nReply again with ONLY the corrected JSON object.`,
        },
      );
    }
    throw new AppError(
      502,
      "LLM_INVALID_OUTPUT",
      "The AI returned an answer we could not use. Please try again.",
    );
  }

  private async callProvider(
    provider: LLMProvider,
    feature: string,
    messages: ChatMessage[],
    temperature: number,
  ): Promise<string> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const result = await provider.complete({
        messages,
        json: true,
        temperature,
        signal: controller.signal,
      });
      const seconds = (Date.now() - started) / 1000;
      llmDuration.observe({ feature, provider: provider.name }, seconds);
      if (result.promptTokens) {
        llmTokens.inc({ feature, provider: provider.name, kind: "prompt" }, result.promptTokens);
      }
      if (result.completionTokens) {
        llmTokens.inc(
          { feature, provider: provider.name, kind: "completion" },
          result.completionTokens,
        );
      }
      this.log().info(
        {
          feature,
          provider: provider.name,
          model: result.model,
          latencyMs: Date.now() - started,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          promptChars: messages.reduce((n, m) => n + m.content.length, 0),
        },
        "llm call",
      );
      return result.text;
    } catch (e) {
      if (!(e instanceof LLMProviderError)) throw e;
      llmCalls.inc({ feature, provider: provider.name, outcome: e.kind });
      this.log().error(
        { feature, provider: provider.name, kind: e.kind, detail: e.message },
        "llm call failed",
      );
      throw this.toAppError(e);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streams a plain-text answer. The caller's signal (for example a client disconnect) and the service timeout
   * both abort the upstream request. Provider failures surface as the same clean AppErrors as generateJson.
   */
  async *streamText(args: {
    feature: string;
    messages: ChatMessage[];
    temperature?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<string> {
    const provider = this.provider;
    if (!provider) {
      throw new AppError(
        503,
        "LLM_NOT_CONFIGURED",
        "The AI service is not configured on this server.",
      );
    }
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    args.signal?.addEventListener("abort", () => controller.abort());
    let chars = 0;
    try {
      for await (const delta of provider.stream({
        messages: args.messages,
        json: false,
        temperature: args.temperature ?? 0.2,
        signal: controller.signal,
      })) {
        chars += delta.length;
        yield delta;
      }
      llmDuration.observe(
        { feature: args.feature, provider: provider.name },
        (Date.now() - started) / 1000,
      );
      this.record(args.feature, "ok");
      this.log().info(
        {
          feature: args.feature,
          provider: provider.name,
          model: provider.model,
          latencyMs: Date.now() - started,
          streamedChars: chars,
          promptChars: args.messages.reduce((n, m) => n + m.content.length, 0),
        },
        "llm stream",
      );
    } catch (e) {
      if (!(e instanceof LLMProviderError)) throw e;
      llmCalls.inc({ feature: args.feature, provider: provider.name, outcome: e.kind });
      this.log().error(
        { feature: args.feature, provider: provider.name, kind: e.kind, detail: e.message },
        "llm stream failed",
      );
      throw this.toAppError(e);
    } finally {
      clearTimeout(timer);
    }
  }

  private record(feature: string, outcome: string) {
    llmCalls.inc({ feature, provider: this.provider?.name ?? "none", outcome });
  }

  private log() {
    return this.opts.log ?? defaultLogger;
  }

  private toAppError(e: LLMProviderError): AppError {
    switch (e.kind) {
      case "timeout":
        return new AppError(
          504,
          "LLM_TIMEOUT",
          "The AI took too long to respond. Please try again.",
        );
      case "rate_limited":
        return new AppError(
          503,
          "LLM_BUSY",
          "The AI service is busy right now. Please try again in a minute.",
        );
      default:
        // Auth and bad-request details stay in the server log; clients just see "unavailable".
        return new AppError(502, "LLM_UNAVAILABLE", "The AI service is unavailable right now.");
    }
  }
}
