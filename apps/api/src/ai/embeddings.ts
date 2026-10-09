import { config, mlHeaders } from "../config";
import { AppError } from "../errors";

export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

const BATCH = 32;

/** Calls the ML service's /embed endpoint (a local model, so no API key and no rate limit). */
export class MLEmbedder implements Embedder {
  model = "BAAI/bge-small-en-v1.5";

  constructor(
    private baseUrl = config.mlServiceUrl,
    private fetchImpl: typeof fetch = fetch,
    // Generous: on a free host the ML service sleeps when idle and the first request waits while it wakes (about a minute).
    private timeoutMs = 120_000,
    private token = config.mlApiToken,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      out.push(...(await this.batch(texts.slice(i, i + BATCH))));
    }
    return out;
  }

  private async batch(texts: string[]): Promise<number[][]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/embed`, {
        method: "POST",
        headers: mlHeaders(this.token),
        body: JSON.stringify({ texts }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AppError(503, "EMBEDDING_UNAVAILABLE", "The embedding service is not reachable.");
    }
    if (!res.ok) {
      throw new AppError(
        502,
        "EMBEDDING_FAILED",
        "The embedding service could not process the text.",
      );
    }
    const data = (await res.json()) as { model?: string; embeddings: number[][] };
    if (data.model) this.model = data.model;
    return data.embeddings;
  }
}

let instance: Embedder | undefined;
export const getEmbedder = () => (instance ??= new MLEmbedder());
/** Tests inject a deterministic embedder; call with no argument to restore the real one. */
export const setEmbedder = (e?: Embedder) => {
  instance = e;
};
