"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsDto } from "@slp/shared";

function ChartBox({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <div role="img" aria-label={label} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Decorative summary of the tables below them (which are the accessible version of the same numbers). */
export function AnalyticsCharts({ data }: { data: AnalyticsDto }) {
  const readiness = data.domains
    .filter((d) => d.avgReadiness !== null)
    .map((d) => ({ name: d.name, Average: d.avgReadiness, Target: d.target }));
  const usage = data.modules.map((m) => ({
    name: m.label,
    "Students (all time)": m.users,
    [`Students (${data.windowDays} days)`]: m.recentUsers,
  }));
  const axis = { fontSize: 12 };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="c1">
        <h2 id="c1" className="text-lg font-semibold">
          Average readiness vs target
        </h2>
        {readiness.length === 0 ? (
          <p className="mt-2 text-sm">No readiness scores yet.</p>
        ) : (
          <ChartBox label={`Average readiness against target for ${readiness.length} domains`}>
            <BarChart data={readiness} margin={{ top: 8, right: 8, bottom: 40, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              <XAxis dataKey="name" {...axis} angle={-35} textAnchor="end" interval={0} />
              <YAxis domain={[0, 100]} {...axis} />
              <Tooltip />
              <Legend verticalAlign="top" />
              <Bar dataKey="Average" fill="#4f46e5" />
              <Bar dataKey="Target" fill="#94a3b8" />
            </BarChart>
          </ChartBox>
        )}
      </section>
      <section aria-labelledby="c2">
        <h2 id="c2" className="text-lg font-semibold">
          Students using each module
        </h2>
        <ChartBox label="Students using each module, all time and recent">
          <BarChart data={usage} margin={{ top: 8, right: 8, bottom: 40, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis dataKey="name" {...axis} angle={-35} textAnchor="end" interval={0} />
            <YAxis allowDecimals={false} {...axis} />
            <Tooltip />
            <Legend verticalAlign="top" />
            <Bar dataKey="Students (all time)" fill="#94a3b8" />
            <Bar dataKey={`Students (${data.windowDays} days)`} fill="#4f46e5" />
          </BarChart>
        </ChartBox>
      </section>
    </div>
  );
}
