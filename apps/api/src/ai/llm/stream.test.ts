import { MLEmbedder } from "../embeddings";
import { OpenAICompatibleProvider } from "./provider";
import type { CompletionRequest } from "./types";

const cfg = {
  name: "groq",
  baseUrl: "https://llm.test/v1",
  apiKey: "k",
  model: "m",
  extraBody: {},
};
const req = (): CompletionRequest => ({
  messages: [{ role: "user", content: "hi" }],
  json: false,
  temperature: 0.2,
  signal: new AbortController().signal,
});

/** A Response whose body arrives in the given pieces, split mid-line on purpose. */
const sseResponse = (pieces: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        const enc = new TextEncoder();
        for (const p of pieces) c.enqueue(enc.encode(p));
        c.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

const delta = (t: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;

describe("OpenAICompatibleProvider.stream", () => {
  it("yields text deltas, tolerating split lines, keep-alives and garbage", async () => {
    const line = delta("world");
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        sseResponse([
          delta("Hello "),
          ": keep-alive\n\n",
          line.slice(0, 12),
          line.slice(12),
          "data: {not json}\n\n",
          'data: {"choices":[{"delta":{}}]}\n\n',
          "data: [DONE]\n\n",
          delta("never reached"),
        ]),
      );
    const out: string[] = [];
    for await (const t of new OpenAICompatibleProvider(cfg, { fetchImpl }).stream(req()))
      out.push(t);
    expect(out.join("")).toBe("Hello world");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({ stream: true });
  });

  it("fails before streaming on auth errors and retries rate limits first", async () => {
    const auth = jest.fn().mockResolvedValue(new Response("no", { status: 401 }));
    await expect(
      (async () => {
        for await (const _ of new OpenAICompatibleProvider(cfg, { fetchImpl: auth }).stream(req()))
          void _;
      })(),
    ).rejects.toMatchObject({ kind: "auth" });

    const retry = jest
      .fn()
      .mockResolvedValueOnce(new Response("slow", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(sseResponse([delta("ok"), "data: [DONE]\n\n"]));
    const out: string[] = [];
    for await (const t of new OpenAICompatibleProvider(cfg, {
      fetchImpl: retry,
      sleep: async () => {},
    }).stream(req())) {
      out.push(t);
    }
    expect(out).toEqual(["ok"]);
  });
});

describe("MLEmbedder", () => {
  const vec = (n: number) => Array.from({ length: n }, () => [0.1, 0.2]);
  const okFor = (body: string) =>
    new Response(JSON.stringify({ model: "bge", embeddings: vec(JSON.parse(body).texts.length) }), {
      status: 200,
    });

  it("sends texts in batches of 32 and keeps the order", async () => {
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) =>
      okFor(init.body as string),
    );
    const e = new MLEmbedder("http://ml:8000", fetchImpl as never);
    const out = await e.embed(Array.from({ length: 70 }, (_, i) => `t${i}`));
    expect(out).toHaveLength(70);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://ml:8000/embed");
    expect(e.model).toBe("bge");
  });

  it("sends the ML service token only when one is configured", async () => {
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) =>
      okFor(init.body as string),
    );
    await new MLEmbedder("http://ml", fetchImpl as never, 1000, "tok-123").embed(["x"]);
    await new MLEmbedder("http://ml", fetchImpl as never, 1000, undefined).embed(["x"]);
    const headers = fetchImpl.mock.calls.map((c) => c[1].headers as Record<string, string>);
    expect(headers[0].Authorization).toBe("Bearer tok-123");
    expect(headers[1].Authorization).toBeUndefined();
  });

  it("maps an unreachable or failing service to clean errors", async () => {
    const down = new MLEmbedder(
      "http://ml",
      jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as never,
    );
    await expect(down.embed(["x"])).rejects.toMatchObject({
      status: 503,
      code: "EMBEDDING_UNAVAILABLE",
    });
    const bad = new MLEmbedder(
      "http://ml",
      jest.fn().mockResolvedValue(new Response("x", { status: 500 })) as never,
    );
    await expect(bad.embed(["x"])).rejects.toMatchObject({ status: 502, code: "EMBEDDING_FAILED" });
  });
});
