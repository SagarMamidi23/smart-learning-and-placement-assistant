"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ReadinessView } from "@/components/ReadinessView";
import { ErrorAlert, primaryButton, secondaryButton } from "@/components/ui";
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

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function Readiness() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const latest = useReadiness(Boolean(slug));
  const history = useReadinessHistory(Boolean(slug));
  const compute = useComputeReadiness();
  const [error, setError] = useState<string>();

  if (profile.isLoading) return <p role="status">Loading…</p>;

  const header = (action?: React.ReactNode) => (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-rule pb-5">
      <div>
        {slug && <div className="kicker text-muted">{domain.data?.name ?? slug}</div>}
        <h1 className="mt-1.5 text-[28px] leading-tight font-extrabold tracking-tight lg:text-[34px]">
          Career readiness
        </h1>
      </div>
      {action}
    </header>
  );

  if (!slug) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <p>
          Choose a career domain first.{" "}
          <Link href="/domains" className="font-semibold">
            Browse domains
          </Link>
        </p>
      </div>
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
    <div className="flex flex-col gap-7">
      {header(
        <button
          className={r ? secondaryButton : primaryButton}
          onClick={run}
          disabled={compute.isPending}
        >
          {compute.isPending ? "Calculating…" : r ? "Recalculate" : "Calculate my readiness"}
        </button>,
      )}
      <ErrorAlert message={error} />

      {latest.isLoading && <p role="status">Loading…</p>}
      {!r && !latest.isLoading && (
        <p className="max-w-[62ch] text-muted">
          You have not calculated your readiness yet. It combines your assessments, mock
          evaluations, learning progress and activity into one score against the target for{" "}
          {domain.data?.name ?? slug}.
        </p>
      )}

      {r && <ReadinessView result={r} />}

      {points.length >= 2 && (
        <section
          aria-labelledby="hist-h"
          className="flex flex-col gap-3 border-t-2 border-rule pt-6"
        >
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="hist-h" className="text-lg font-extrabold lg:text-xl">
              History
            </h2>
            <span className="text-[13px] text-muted">
              {points.length} calculations since {shortDate(points[0].createdAt)}
            </span>
          </div>
          <ReadinessChart points={points} target={history.data?.target ?? null} />
          <details className="text-sm">
            <summary className="min-h-8 cursor-pointer font-semibold text-accent">
              View as table
            </summary>
            <p className="mt-2 text-muted">
              {points.map((p) => `${shortDate(p.createdAt)}: ${Math.round(p.score)}`).join(" · ")}
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
