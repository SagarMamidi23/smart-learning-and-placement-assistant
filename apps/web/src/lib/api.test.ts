import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, resolveApiBase } from "./api";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });
const unauthorized = () => json(401, { error: { code: "INVALID_TOKEN", message: "expired" } });

describe("api client", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends credentials and parses JSON", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    expect(await api("/profile")).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("maps error responses to ApiError", async () => {
    fetchMock.mockResolvedValueOnce(
      json(409, { error: { code: "EMAIL_TAKEN", message: "taken" } }),
    );
    await expect(api("/auth/register", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_TAKEN",
      message: "taken",
    });
  });

  it("refreshes once on 401 and retries the original request", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json(200, { user: {} })) // /auth/refresh
      .mockResolvedValueOnce(json(200, { profile: 1 }));
    expect(await api("/profile")).toEqual({ profile: 1 });
    expect(fetchMock.mock.calls[1][0]).toContain("/auth/refresh");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one refresh between concurrent 401s", async () => {
    let refreshes = 0;
    const seen = new Set<string>();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        return json(200, {});
      }
      if (seen.has(url)) return json(200, { ok: 1 });
      seen.add(url);
      return unauthorized();
    });
    await Promise.all([api("/profile"), api("/auth/me")]);
    expect(refreshes).toBe(1);
  });

  it("gives up when the refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(unauthorized())
      .mockResolvedValueOnce(json(401, { error: { code: "TOKEN_REUSED", message: "no" } }));
    await expect(api("/profile")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not try to refresh failed logins", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: "INVALID_CREDENTIALS", message: "bad" } }),
    );
    await expect(api("/auth/login", { method: "POST", body: "{}" })).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolveApiBase", () => {
  it("defaults to the local API, supports a same-origin proxy, and tidies a custom URL", () => {
    expect(resolveApiBase(undefined)).toBe("http://localhost:4000");
    expect(resolveApiBase("same-origin")).toBe("");
    expect(resolveApiBase("https://api.example.com/")).toBe("https://api.example.com");
    expect(resolveApiBase("https://api.example.com")).toBe("https://api.example.com");
  });
});
