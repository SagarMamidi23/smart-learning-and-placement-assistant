"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { ErrorAlert, inputClass, primaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useMockEvals, useStartMockEval } from "@/lib/evalHooks";
import { useDomain, useProfile } from "@/lib/hooks";

export default function MockEvalPage() {
  return (
    <AppShell>
      <MockEval />
    </AppShell>
  );
}

function MockEval() {
  const router = useRouter();
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const list = useMockEvals();
  const start = useStartMockEval();
  const [count, setCount] = useState(4);
  const [error, setError] = useState<string>();

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">Mock evaluation</h1>
        <p className="mt-3">
          Choose a career domain first.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>
        </p>
      </>
    );
  }

  const rubric = domain.data?.mockEvaluation;
  const kind = rubric?.type === "interview" ? "interview" : "practical task";

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    try {
      const ev = await start.mutateAsync(count);
      router.push(`/mock-eval/${ev.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start. Please try again.");
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Mock evaluation</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        A practice {kind} for {domain.data?.name ?? slug}, scored against the same rubric used for
        this domain.
      </p>
      <div className="mt-4">
        <SafetyNotice text={domain.data?.safetyNotice} />
      </div>

      {rubric && (
        <section className="mt-6" aria-labelledby="rub-h">
          <h2 id="rub-h" className="text-lg font-semibold">
            How you will be scored
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {rubric.rubric.map((r) => (
              <li key={r.criterion}>
                <strong>{r.criterion}</strong> ({Math.round(r.weight * 100)}%)
                {r.description ? `: ${r.description}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={onStart} className="mt-8 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="count" className="block text-sm font-medium">
            Number of questions
          </label>
          <select
            id="count"
            className={inputClass}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[3, 4, 5, 6].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </div>
        <button className={primaryButton} disabled={start.isPending}>
          {start.isPending ? "Preparing…" : `Start a ${kind}`}
        </button>
        {start.isPending && (
          <span role="status" className="text-sm text-slate-500">
            Writing your questions, this can take up to a minute.
          </span>
        )}
      </form>
      <div className="mt-3">
        <ErrorAlert message={error} />
      </div>

      {list.data && list.data.length > 0 && (
        <section className="mt-10" aria-labelledby="past-h">
          <h2 id="past-h" className="text-lg font-semibold">
            Your evaluations
          </h2>
          <ul className="mt-2 space-y-2 text-sm">
            {list.data.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/mock-eval/${m.id}`}
                  className="text-indigo-600 underline dark:text-indigo-400"
                >
                  {new Date(m.createdAt).toLocaleString()}
                </Link>{" "}
                {m.status === "completed" ? `: ${m.overallScore}/100` : "(in progress)"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
