/**
 * Where the browser sends API calls. Unset: the local API. "same-origin": relative URLs, which the web server proxies to the API
 * (see next.config.mjs), so both live on one site and the login cookies are first-party. Anything else is used as given.
 */
export const resolveApiBase = (raw: string | undefined) =>
  raw === undefined
    ? "http://localhost:4000"
    : raw === "same-origin"
      ? ""
      : raw.replace(/\/+$/, "");

export const API_BASE = resolveApiBase(process.env.NEXT_PUBLIC_API_URL);

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: { fieldErrors?: Record<string, string[]> },
  ) {
    super(message);
  }
}

const NO_REFRESH = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time: concurrent 401s share the same request (refresh tokens are single-use). */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/api/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry && !NO_REFRESH.includes(path) && (await refreshSession())) {
    return api<T>(path, init, false);
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? res.statusText,
      body?.error?.details,
    );
  }
  return body as T;
}

export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });
export const put = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "PUT", body: JSON.stringify(data) });
