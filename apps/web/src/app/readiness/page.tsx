"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ReadinessView } from "@/components/ReadinessView";
import { ErrorAlert, primaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useDomain, useProfile } from "@/lib/hooks";
import { useComputeReadiness, useReadiness, useReadinessHistory } from "@/lib/readinessHooks";

// Recharts measures the DOM, so load it on the client only.
const ReadinessChart = dynamic(
  () => import("@/components/ReadinessChart").then((m) => m.ReadinessChart),
  {
    ssr: false,
    loading: () => <p role="status">Loading chart…</p>,
  },
);

export default function ReadinessPage() {
  return (
    <AppShell>
      <Readiness />
    </AppShell>
  );
}

function Readiness() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const latest = useReadiness(Boolean(slug));
  const history = useReadinessHistory(Boolean(slug));
  const compute = useComputeReadiness();
  const [error, setError] = useState<string>();

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">Career readiness</h1>
        <p className="mt-3">
          Choose a career domain first.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>
        </p>
      </>
    );
  }

  async function run() {
    setError(undefined);
    try {
      await compute.mutateAsync();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Could not compute your readiness. Please try again.",
      );
    }
  }

  const r = latest.data;
  const points = history.data?.points ?? [];
  return (
    <>
      <h1 className="text-2xl font-bold">Career readiness</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        How ready you are for {domain.data?.name ?? slug}, based on your assessments, mock
        evaluations, learning progress and activity.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button className={primaryButton} onClick={run} disabled={compute.isPending}>
          {compute.isPending
            ? "Calculating…"
            : r
              ? "Update my readiness"
              : "Calculate my readiness"}
        </button>
      </div>
      <div className="mt-3">
        <ErrorAlert message={error} />
      </div>

      {latest.isLoading && <p role="status">Loading…</p>}
      {!r && !latest.isLoading && (
        <p className="mt-6 text-slate-600 dark:text-slate-300">
          You have not calculated your readiness yet.
        </p>
      )}

      {r && (
        <div className="mt-8">
          <ReadinessView result={r} />
        </div>
      )}

      {points.length >= 2 && (
        <section className="mt-10" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-semibold">
            Your progress over time
          </h2>
          <div className="mt-3">
            <ReadinessChart points={points} target={history.data?.target ?? null} />
          </div>
        </section>
      )}
    </>
  );
}
