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
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="date" fontSize={12} />
          <YAxis domain={[0, 100]} fontSize={12} />
          <Tooltip />
          {target !== null && (
            <ReferenceLine
              y={target}
              strokeDasharray="6 4"
              label={{ value: `target ${target}`, fontSize: 11, position: "insideTopRight" }}
            />
          )}
          <Line
            type="monotone"
            dataKey="score"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
