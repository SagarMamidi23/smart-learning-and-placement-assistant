"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AnalyticsView } from "@/components/AnalyticsView";
import { AppShell } from "@/components/AppShell";
import { ErrorAlert, inputClass } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAnalytics } from "@/lib/analyticsHooks";

// Recharts measures the DOM, so load it on the client only.
const AnalyticsCharts = dynamic(
  () => import("@/components/AnalyticsCharts").then((m) => m.AnalyticsCharts),
  { ssr: false, loading: () => <p role="status">Loading charts…</p> },
);

export default function AnalyticsPage() {
  return (
    <AppShell adminOnly>
      <Analytics />
    </AppShell>
  );
}

function Analytics() {
  const [days, setDays] = useState(30);
  const q = useAnalytics(days);

  return (
    <>
      <h1 className="text-2xl font-bold">Analytics</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Cohort-level usage and readiness. These are aggregates: no individual student is shown.
      </p>
      <div className="mt-4 max-w-xs">
        <label htmlFor="days" className="block text-sm font-medium">
          Recent window
        </label>
        <select
          id="days"
          className={inputClass}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="mt-6">
        {q.isLoading && <p role="status">Loading…</p>}
        {q.error && (
          <ErrorAlert
            message={q.error instanceof ApiError ? q.error.message : "Could not load analytics."}
          />
        )}
        {q.data && <AnalyticsView data={q.data} charts={<AnalyticsCharts data={q.data} />} />}
      </div>
    </>
  );
}
