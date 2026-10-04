import { API_BASE, ApiError, refreshSession } from "./api";

export interface SourceRef {
  n: number;
  title: string;
  page: number;
  snippet: string;
}

export type ChatEvent =
  | { event: "sources"; data: { sources: SourceRef[] } }
  | { event: "token"; data: { text: string } }
  | { event: "done"; data: { refused: boolean; cited: number[] } }
  | { event: "error"; data: { code: string; message: string } };

/**
 * Incremental server-sent-events parser. Feed it text as it arrives; it returns the complete events so far
 * and keeps any partial event buffered for the next chunk.
 */
export function createSseParser() {
  let buffer = "";
  return (chunk: string): ChatEvent[] => {
    buffer += chunk;
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    const events: ChatEvent[] = [];
    for (const block of blocks) {
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !data) continue;
      try {
        events.push({ event, data: JSON.parse(data) } as ChatEvent);
      } catch {
        /* ignore a malformed event rather than break the stream */
      }
    }
    return events;
  };
}

/** POSTs a mentor question and calls `onEvent` for each streamed event. Retries once after refreshing the session. */
export async function streamChat(
  message: string,
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
  retry = true,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/mentor/chat`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  if (res.status === 401 && retry && (await refreshSession())) {
    return streamChat(message, onEvent, signal, false);
  }
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? res.statusText,
    );
  }
  const parse = createSseParser();
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const e of parse(decoder.decode(value, { stream: true }))) onEvent(e);
  }
}
