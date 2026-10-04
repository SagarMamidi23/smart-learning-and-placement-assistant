export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** Ask the provider for a JSON object. */
  json: boolean;
  temperature: number;
  signal: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

/** The only thing the rest of the app knows about a model vendor. */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
  /** Plain-text streaming (the `json` flag is ignored). Yields text deltas as they arrive. */
  stream(req: CompletionRequest): AsyncIterable<string>;
}

export type ProviderErrorKind = "timeout" | "rate_limited" | "unavailable" | "auth" | "bad_request";

export class LLMProviderError extends Error {
  constructor(
    public kind: ProviderErrorKind,
    message: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}
