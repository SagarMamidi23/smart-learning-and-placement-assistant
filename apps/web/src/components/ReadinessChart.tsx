"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReadinessHistoryPoint } from "@slp/shared";

/** Score over time with the target as a reference line. Needs at least two points to show a trend. */
export function ReadinessChart({
  points,
  target,
}: {
  points: ReadinessHistoryPoint[];
  target: number | null;
}) {
  const data = points.map((p) => ({
    date: new Date(p.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    score: p.score,
  }));
  return (
    <div
      role="img"
      aria-label={`Readiness history: ${points.map((p) => Math.round(p.score)).join(", ")}`}
      className="h-56 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--divider)" />
          <XAxis
            dataKey="date"
            fontSize={12}
            tick={{ fill: "var(--muted)" }}
            stroke="var(--rule)"
            strokeWidth={2}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            fontSize={12}
            tick={{ fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: 0,
              borderRadius: 6,
              boxShadow: "var(--shadow-2)",
              color: "var(--text)",
            }}
          />
          {target !== null && (
            <ReferenceLine
              y={target}
              stroke="var(--text)"
              strokeWidth={2}
              strokeDasharray="6 5"
              label={{
                value: `Target ${target}`,
                fontSize: 12,
                fontWeight: 600,
                fill: "var(--text)",
                position: "insideTopRight",
              }}
            />
          )}
          <Line
            type="linear"
            dataKey="score"
            stroke="var(--accent)"
            strokeWidth={3}
            dot={{ r: 5, strokeWidth: 3, fill: "var(--surface)" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
