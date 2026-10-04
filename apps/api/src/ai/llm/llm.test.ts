import { z } from "zod";
import { AppError } from "../../errors";
import { fakeLLM } from "../../test/fakeLLM";
import { resolveLLMConfig } from "./config";
import { OpenAICompatibleProvider } from "./provider";
import { extractJson } from "./service";
import { LLMProviderError, type CompletionRequest } from "./types";

const schema = z.object({ answer: z.string(), score: z.number().int() });
const args = { feature: "test", system: "sys", prompt: "ask", schema };

describe("resolveLLMConfig", () => {
  it("builds a Groq config with low reasoning effort for gpt-oss models", () => {
    const cfg = resolveLLMConfig({ provider: "groq", groqKey: "k" })!;
    expect(cfg.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(cfg.model).toBe("openai/gpt-oss-120b");
    expect(cfg.extraBody).toEqual({ reasoning_effort: "low" });
  });

  it("returns null when the provider's key is missing", () => {
    expect(resolveLLMConfig({ provider: "groq" })).toBeNull();
    expect(resolveLLMConfig({ provider: "openai", groqKey: "wrong-vendor" })).toBeNull();
  });

  it("swaps vendors purely by env", () => {
    const o = resolveLLMConfig({ provider: "openai", openaiKey: "k", model: "gpt-x" })!;
    expect([o.name, o.model, o.extraBody]).toEqual(["openai", "gpt-x", {}]);
    const g = resolveLLMConfig({ provider: "gemini", geminiKey: "k" })!;
    expect(g.baseUrl).toContain("generativelanguage.googleapis.com");
  });

  it("needs no key for Ollama, and a base URL plus model for custom", () => {
    expect(resolveLLMConfig({ provider: "ollama" })!.baseUrl).toBe("http://localhost:11434/v1");
    expect(resolveLLMConfig({ provider: "custom" })).toBeNull();
    const c = resolveLLMConfig({
      provider: "custom",
      baseUrl: "http://llm.local/v1/",
      model: "m",
    })!;
    expect(c.baseUrl).toBe("http://llm.local/v1");
  });

  it("lets LLM_BASE_URL and LLM_API_KEY override a preset", () => {
    const cfg = resolveLLMConfig({
      provider: "groq",
      baseUrl: "https://proxy.example/v1/",
      apiKey: "override",
    })!;
    expect([cfg.baseUrl, cfg.apiKey]).toEqual(["https://proxy.example/v1", "override"]);
  });
});

describe("extractJson", () => {
  it("handles plain JSON, code fences and surrounding prose", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! Here you go: {"a":1} Hope that helps.')).toEqual({ a: 1 });
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("LLMService.generateJson", () => {
  it("returns validated data and logs usage without prompt content", async () => {
    const { service, logLines } = fakeLLM(['{"answer":"42","score":7}']);
    const out = await service.generateJson({
      ...args,
      prompt: "SECRET-RESUME-TEXT jane@example.com",
    });
    expect(out).toEqual({ answer: "42", score: 7 });
    const log = logLines.join("");
    expect(log).toContain('"feature":"test"');
    expect(log).toContain('"promptTokens":11');
    expect(log).not.toContain("SECRET-RESUME-TEXT");
    expect(log).not.toContain("jane@example.com");
    expect(log).not.toContain('"answer"');
  });

  it("retries once with the validation errors fed back, then succeeds", async () => {
    const { service, provider } = fakeLLM(['{"answer":"x"}', '{"answer":"x","score":1}']);
    const out = await service.generateJson(args);
    expect(out.score).toBe(1);
    expect(provider.calls).toHaveLength(2);
    const feedback = provider.calls[1].messages.at(-1)!.content;
    expect(feedback).toContain("score");
    expect(feedback).toContain("ONLY the corrected JSON");
  });

  it("retries on non-JSON text too", async () => {
    const { service, provider } = fakeLLM(["I cannot do that", '{"answer":"ok","score":2}']);
    expect((await service.generateJson(args)).answer).toBe("ok");
    expect(provider.calls).toHaveLength(2);
  });

  it("gives a clean 502 after two invalid replies, and never a third call", async () => {
    const { service, provider } = fakeLLM(["nope", '{"answer":1}', '{"answer":"never","score":1}']);
    await expect(service.generateJson(args)).rejects.toMatchObject({
      status: 502,
      code: "LLM_INVALID_OUTPUT",
    });
    expect(provider.calls).toHaveLength(2);
  });

  it("returns 503 when no provider is configured", async () => {
    const { LLMService } = await import("./service");
    await expect(new LLMService(null).generateJson(args)).rejects.toMatchObject({
      status: 503,
      code: "LLM_NOT_CONFIGURED",
    });
  });

  it.each([
    ["timeout", 504, "LLM_TIMEOUT"],
    ["rate_limited", 503, "LLM_BUSY"],
    ["unavailable", 502, "LLM_UNAVAILABLE"],
    ["auth", 502, "LLM_UNAVAILABLE"],
  ] as const)("maps provider %s errors to a clean %i", async (kind, status, code) => {
    const { service } = fakeLLM([new LLMProviderError(kind, "internal detail with sk-secret")]);
    const err = (await service.generateJson(args).catch((e) => e)) as AppError;
    expect([err.status, err.code]).toEqual([status, code]);
    expect(err.message).not.toContain("sk-secret");
  });

  it("aborts a slow provider at the timeout", async () => {
    const { service, provider } = fakeLLM([], 30);
    provider.complete = (req: CompletionRequest) =>
      new Promise((_, reject) => {
        req.signal.addEventListener("abort", () =>
          reject(new LLMProviderError("timeout", "aborted")),
        );
      });
    await expect(service.generateJson(args)).rejects.toMatchObject({ status: 504 });
  });
});

describe("OpenAICompatibleProvider", () => {
  const cfg = {
    name: "groq",
    baseUrl: "https://llm.test/v1",
    apiKey: "key-123",
    model: "m1",
    extraBody: { reasoning_effort: "low" },
  };
  const ok = (content = '{"a":1}') =>
    new Response(
      JSON.stringify({
        model: "m1",
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }),
      { status: 200 },
    );
  const req = (): CompletionRequest => ({
    messages: [{ role: "user", content: "hi" }],
    json: true,
    temperature: 0.2,
    signal: new AbortController().signal,
  });
  const noSleep = async () => {};

  it("sends the bearer key, JSON mode and extra body, and parses usage", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok());
    const p = new OpenAICompatibleProvider(cfg, { fetchImpl });
    const res = await p.complete(req());
    expect(res).toMatchObject({ text: '{"a":1}', promptTokens: 5, completionTokens: 3 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://llm.test/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer key-123");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "m1",
      response_format: { type: "json_object" },
      reasoning_effort: "low",
    });
  });

  it("omits Authorization when there is no key (local Ollama)", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ok());
    await new OpenAICompatibleProvider({ ...cfg, apiKey: undefined }, { fetchImpl }).complete(
      req(),
    );
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response("slow down", { status: 429, headers: { "retry-after": "1" } }),
      )
      .mockResolvedValueOnce(new Response("oops", { status: 503 }))
      .mockResolvedValueOnce(ok());
    const sleep = jest.fn(noSleep);
    const res = await new OpenAICompatibleProvider(cfg, { fetchImpl, sleep }).complete(req());
    expect(res.text).toBe('{"a":1}');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000); // honours Retry-After
  });

  it("gives up after the retry budget with a rate_limited error", async () => {
    const fetchImpl = jest.fn().mockImplementation(async () => new Response("no", { status: 429 }));
    const err = await new OpenAICompatibleProvider(cfg, { fetchImpl, sleep: noSleep })
      .complete(req())
      .catch((e) => e);
    expect(err).toMatchObject({ kind: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not hold a request open for a long Retry-After", async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(new Response("no", { status: 429, headers: { "retry-after": "120" } }));
    const err = await new OpenAICompatibleProvider(cfg, { fetchImpl, sleep: noSleep })
      .complete(req())
      .catch((e) => e);
    expect(err).toMatchObject({ kind: "rate_limited", retryAfterMs: 120_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps auth and bad-request failures without retrying", async () => {
    for (const [status, kind] of [
      [401, "auth"],
      [400, "bad_request"],
    ] as const) {
      const fetchImpl = jest.fn().mockResolvedValue(new Response("x", { status }));
      const err = await new OpenAICompatibleProvider(cfg, { fetchImpl })
        .complete(req())
        .catch((e) => e);
      expect(err.kind).toBe(kind);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("treats an empty completion as unavailable and an abort as a timeout", async () => {
    const empty = jest.fn().mockResolvedValue(ok(""));
    await expect(
      new OpenAICompatibleProvider(cfg, { fetchImpl: empty }).complete(req()),
    ).rejects.toMatchObject({
      kind: "unavailable",
    });
    const controller = new AbortController();
    controller.abort();
    const aborted = jest.fn().mockRejectedValue(new Error("aborted"));
    await expect(
      new OpenAICompatibleProvider(cfg, { fetchImpl: aborted }).complete({
        ...req(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ kind: "timeout" });
  });
});
