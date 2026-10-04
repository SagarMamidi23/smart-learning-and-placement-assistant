/**
 * Semicircle gauge from 0 to 100 with the domain's target marked. The arc turns green once the target is met.
 * Colour is never the only signal: the number and the "target" label are always shown.
 */
export function ReadinessGauge({
  score,
  target,
  size = 240,
}: {
  score: number;
  target: number;
  size?: number;
}) {
  const r = 90;
  const cx = 110;
  const cy = 110;
  const point = (value: number, radius = r) => {
    const angle = Math.PI * (1 - Math.min(100, Math.max(0, value)) / 100);
    return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle) };
  };
  const arc = (from: number, to: number) => {
    const a = point(from);
    const b = point(to);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
  };
  const met = score >= target;
  const t1 = point(target, r - 14);
  const t2 = point(target, r + 14);
  const label = point(target, r + 26);

  return (
    <svg
      role="img"
      aria-label={`Readiness score ${Math.round(score)} out of 100. Target ${target}. ${met ? "Target met." : "Below target."}`}
      viewBox="0 0 220 140"
      width={size}
      height={(size * 140) / 220}
    >
      <path
        d={arc(0, 100)}
        fill="none"
        strokeWidth={16}
        strokeLinecap="round"
        className="stroke-slate-200 dark:stroke-slate-800"
      />
      {score > 0 && (
        <path
          d={arc(0, Math.max(score, 0.5))}
          fill="none"
          strokeWidth={16}
          strokeLinecap="round"
          className={
            met
              ? "stroke-green-600 dark:stroke-green-400"
              : "stroke-indigo-600 dark:stroke-indigo-400"
          }
        />
      )}
      <line
        x1={t1.x}
        y1={t1.y}
        x2={t2.x}
        y2={t2.y}
        strokeWidth={3}
        className="stroke-slate-900 dark:stroke-slate-100"
      />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        fontSize={9}
        className="fill-slate-600 dark:fill-slate-300"
      >
        target {target}
      </text>
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fontSize={34}
        fontWeight={700}
        className="fill-slate-900 dark:fill-slate-100"
      >
        {Math.round(score)}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} className="fill-slate-500">
        out of 100
      </text>
    </svg>
  );
}
