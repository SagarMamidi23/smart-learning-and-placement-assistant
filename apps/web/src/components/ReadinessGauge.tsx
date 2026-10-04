"use client";

import { useEffect, useState } from "react";

/**
 * Semicircle gauge from 0 to 100 with the domain's target marked. The arc fills on mount and turns green once the
 * target is met. Colour is never the only signal: the number, the target label and the accessible name say it all.
 */
export function ReadinessGauge({
  score,
  target,
  size = 240,
  stroke = 16,
}: {
  score: number;
  target: number;
  size?: number;
  stroke?: number;
}) {
  const shown = Math.round(score);
  const clamped = Math.min(100, Math.max(0, score));
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setFill(clamped), 80);
    return () => clearTimeout(t);
  }, [clamped]);

  const r = 90;
  const cx = 110;
  const cy = 104;
  const len = Math.PI * r;
  const point = (value: number, radius: number) => {
    const a = Math.PI * (1 - value / 100);
    return { x: cx + radius * Math.cos(a), y: cy - radius * Math.sin(a) };
  };
  const start = point(0, r);
  const end = point(100, r);
  const d = `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  const met = score >= target;
  const t1 = point(target, r - stroke / 2 - 5);
  const t2 = point(target, r + stroke / 2 + 5);
  const label = point(target, r + stroke / 2 + 16);
  const gap = Math.max(0, Math.round(target - score));

  return (
    <svg
      role="img"
      aria-label={`Readiness ${shown} out of 100. Target ${target}. ${met ? "Target met." : `${gap} points below target.`}`}
      viewBox="-6 -14 232 134"
      width={size}
      height={(size * 134) / 232}
      className="block overflow-visible"
    >
      <path d={d} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <path
        d={d}
        fill="none"
        stroke={met ? "var(--success)" : "var(--accent)"}
        strokeWidth={stroke}
        strokeDasharray={len}
        strokeDashoffset={len * (1 - fill / 100)}
        style={{ transition: "stroke-dashoffset 900ms var(--ease)" }}
      />
      <line x1={t1.x} y1={t1.y} x2={t2.x} y2={t2.y} stroke="var(--text)" strokeWidth={3} />
      <text
        x={label.x}
        y={label.y}
        textAnchor={label.x > cx ? "start" : "middle"}
        fontSize={11}
        fontWeight={600}
        fill="var(--text)"
      >
        Target {target}
      </text>
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        fontSize={46}
        fontWeight={800}
        letterSpacing={-1}
        fill="var(--text)"
      >
        {shown}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={12} fill="var(--muted)">
        of 100
      </text>
    </svg>
  );
}
