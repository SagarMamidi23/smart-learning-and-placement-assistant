"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useClearHistory, type MentorMessage } from "@/lib/mentorHooks";
import { streamChat, type SourceRef } from "@/lib/stream";
import { ErrorAlert, inputClass, primaryButton, secondaryButton } from "./ui";

/** Turns "[1]" in an answer into a numbered badge, so citations read as references to the sources below. */
export function withCitations(text: string, sources: SourceRef[]) {
  // Accept full-width 【1】 too: some models emit it, and it appears while streaming before the server normalises it.
  return text.split(/([[【]\d+[\]】])/g).map((part, i) => {
    const m = /^[[【](\d+)[\]】]$/.exec(part);
    const source = m && sources.find((s) => s.n === Number(m[1]));
    if (!source) return <Fragment key={i}>{part}</Fragment>;
    return (
      <sup key={i}>
        <a
          href={`#source-${source.n}`}
          className="mx-0.5 rounded bg-indigo-100 px-1 text-xs font-medium text-indigo-800 no-underline dark:bg-indigo-900 dark:text-indigo-200"
          aria-label={`Source ${source.n}: ${source.title}, page ${source.page}`}
        >
          {source.n}
        </a>
      </sup>
    );
  });
}

function Sources({ sources, cited }: { sources: SourceRef[]; cited?: number[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
        Sources ({sources.length})
      </summary>
      <ol className="mt-2 space-y-2">
        {sources.map((s) => (
          <li
            key={s.n}
            id={`source-${s.n}`}
            className="rounded border border-slate-200 p-2 dark:border-slate-800"
          >
            <p className="font-medium">
              [{s.n}] {s.title}, page {s.page}
              {cited?.includes(s.n) && (
                <span className="ml-2 text-xs font-normal text-indigo-700 dark:text-indigo-300">
                  cited
                </span>
              )}
            </p>
            <p className="mt-1 text-slate-500">{s.snippet}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

interface LiveTurn {
  question: string;
  answer: string;
  sources: SourceRef[];
  cited: number[];
  refused: boolean;
  done: boolean;
}

export function MentorChat({ history }: { history: MentorMessage[] }) {
  const qc = useQueryClient();
  const clear = useClearHistory();
  const [input, setInput] = useState("");
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [error, setError] = useState<string>();
  const abort = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [live?.answer, history.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || (live && !live.done)) return;
    setInput("");
    setError(undefined);
    const turn: LiveTurn = {
      question,
      answer: "",
      sources: [],
      cited: [],
      refused: false,
      done: false,
    };
    setLive({ ...turn });
    abort.current = new AbortController();
    try {
      await streamChat(
        question,
        (ev) => {
          if (ev.event === "sources") turn.sources = ev.data.sources;
          else if (ev.event === "token") turn.answer += ev.data.text;
          else if (ev.event === "done") {
            turn.done = true;
            turn.refused = ev.data.refused;
            turn.cited = ev.data.cited;
          } else if (ev.event === "error") setError(ev.data.message);
          setLive({ ...turn });
        },
        abort.current.signal,
      );
      // The server has saved the turn, so refresh history and drop the live copy.
      await qc.invalidateQueries({ queryKey: ["mentor", "history"] });
      setLive(null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(
        err instanceof ApiError ? err.message : "Could not reach the mentor. Please try again.",
      );
      setLive(null);
    }
  }

  const busy = Boolean(live && !live.done);
  return (
    <div>
      <div
        className="space-y-4"
        role="log"
        aria-label="Conversation with your mentor"
        aria-live="polite"
      >
        {history.length === 0 && !live && (
          <p className="text-slate-500">
            Ask a question about your syllabus. Answers come only from your domain&apos;s study
            material and cite their sources.
          </p>
        )}
        {history.map((m, i) => (
          <Message key={i} role={m.role} refused={m.refused}>
            {m.role === "assistant" ? withCitations(m.content, m.sources) : m.content}
            {m.role === "assistant" && <Sources sources={m.sources} />}
          </Message>
        ))}
        {live && (
          <>
            <Message role="user">{live.question}</Message>
            <Message role="assistant" refused={live.refused}>
              {live.answer ? withCitations(live.answer, live.sources) : <em>Thinking…</em>}
              {!live.done && live.answer && <span aria-hidden> ▍</span>}
              <Sources sources={live.sources} cited={live.cited} />
            </Message>
          </>
        )}
        <div ref={bottom} />
      </div>

      <div className="mt-4">
        <ErrorAlert message={error} />
      </div>
      <form onSubmit={send} className="mt-4 flex gap-2">
        <label htmlFor="mentor-input" className="sr-only">
          Your question
        </label>
        <input
          id="mentor-input"
          className={inputClass}
          placeholder="Ask about a topic in your syllabus…"
          maxLength={1000}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className={`${primaryButton} mt-1`} disabled={busy || !input.trim()}>
          {busy ? "Answering…" : "Ask"}
        </button>
      </form>
      {history.length > 0 && (
        <button
          className={`${secondaryButton} mt-4`}
          disabled={clear.isPending || busy}
          onClick={() => clear.mutate()}
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}

function Message({
  role,
  refused,
  children,
}: {
  role: "user" | "assistant";
  refused?: boolean;
  children: React.ReactNode;
}) {
  const mine = role === "user";
  return (
    <div className={mine ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
          mine
            ? "bg-indigo-600 text-white"
            : refused
              ? "border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
              : "bg-slate-100 dark:bg-slate-900"
        }`}
      >
        <span className="sr-only">{mine ? "You: " : "Mentor: "}</span>
        {children}
      </div>
    </div>
  );
}
