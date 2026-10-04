import pino from "pino";
import { LLMService } from "../ai/llm";
import type { CompletionRequest, CompletionResult, LLMProvider } from "../ai/llm/types";

type Reply = string | Error | ((req: CompletionRequest) => string);

/** Scripted provider: each call consumes the next reply. Records every request it received. */
export class FakeProvider implements LLMProvider {
  readonly name = "fake";
  readonly model = "fake-1";
  calls: CompletionRequest[] = [];

  constructor(private replies: Reply[]) {}

  private next(req: CompletionRequest): string {
    this.calls.push(req);
    const next = this.replies.shift();
    if (next === undefined) throw new Error("FakeProvider ran out of replies");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(req) : next;
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return { text: this.next(req), model: this.model, promptTokens: 11, completionTokens: 7 };
  }

  /** Streams the scripted reply a few words at a time, like a real model would. */
  async *stream(req: CompletionRequest): AsyncGenerator<string> {
    const text = this.next(req);
    const words = text.split(/(?<=\s)/);
    for (const w of words) yield w;
  }
}

export function fakeLLM(replies: Reply[], timeoutMs = 2000) {
  const provider = new FakeProvider(replies);
  const logLines: string[] = [];
  const log = pino({ level: "info" }, { write: (s: string) => logLines.push(s) });
  const service = new LLMService(provider, { timeoutMs, log });
  return { provider, service, logLines };
}

/** The user-visible prompt of the most recent request. */
export const lastPrompt = (p: FakeProvider) =>
  p.calls.at(-1)!.messages.find((m) => m.role === "user" && !m.content.startsWith("Your previous"))!
    .content;
