"use client";

import Link from "next/link";
import { READINESS_FEATURE_LABELS, type ReadinessResultDto } from "@slp/shared";
import { AiNotice } from "./AiNotice";
import { ReadinessGauge } from "./ReadinessGauge";

const sign = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;

/** How much real evidence stands behind the score. A score built on almost nothing deserves a warning. */
export const evidenceCount = (e: ReadinessResultDto["evidence"]) =>
  Object.values(e).filter(Boolean).length;

export function ReadinessView({ result }: { result: ReadinessResultDto }) {
  const met = result.decision === "opportunities";
  const thin = evidenceCount(result.evidence) <= 1;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-8">
        <ReadinessGauge score={result.score} target={result.target} />
        <div className="max-w-md">
          <h2 className="text-xl font-semibold">
            {met ? "You've reached the target" : "Not at the target yet"}
          </h2>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {met
              ? `Your readiness is ${result.score}, at or above this domain's target of ${result.target}. You can start looking at opportunities.`
              : `Your readiness is ${result.score} against a target of ${result.target}. Keep learning: the steps below will move it the most.`}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Computed {new Date(result.createdAt).toLocaleString()} ·{" "}
            {result.isFallback ? "simple formula" : "ML model"} <code>{result.modelVersion}</code>
          </p>
        </div>
      </div>

      {result.isFallback && (
        <p
          role="status"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          The prediction service was unavailable, so this score uses a simple weighted formula
          instead of the ML model. It is a reasonable estimate; refresh later for the full model.
        </p>
      )}
      {thin && (
        <p role="status" className="rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-900">
          This score rests on very little activity so far. Take an assessment or a mock evaluation
          to make it meaningful.
        </p>
      )}

      <AiNotice>
        The score estimates how closely your results and activity resemble students who are ready
        for this domain. It is a guide to what to work on, not a prediction of any exam or hiring
        outcome.
      </AiNotice>

      {result.nextActions.length > 0 && (
        <section aria-labelledby="next-h">
          <h2 id="next-h" className="text-lg font-semibold">
            {met ? "What next" : "What will help most"}
          </h2>
          <ul className="mt-2 space-y-1">
            {result.nextActions.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="text-indigo-600 underline dark:text-indigo-400">
                  {a.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {result.focusAreas.length > 0 && (
        <section aria-labelledby="focus-h">
          <h2 id="focus-h" className="text-lg font-semibold">
            Focus areas from your skill-gap report
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {result.focusAreas.map((f) => (
              <li key={f.skill}>
                <strong>{f.skill}</strong>: level {f.currentLevel} of {f.targetLevel} ({f.priority}{" "}
                priority)
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="why-h">
        <h2 id="why-h" className="text-lg font-semibold">
          What moved your score
        </h2>
        <ul className="mt-2 space-y-2 text-sm">
          {result.factors.map((f) => (
            <li key={f.feature} className="flex items-baseline gap-3">
              <span
                className={`w-14 shrink-0 font-mono font-semibold ${f.direction === "raises" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-300"}`}
              >
                {sign(f.impact)}
              </span>
              <span>
                <strong>{f.label}</strong> is {f.value}
                {f.typical !== undefined ? `, against a typical ${f.typical}` : ""}.{" "}
                <span className="text-slate-500">
                  {f.direction === "raises" ? "This raises" : "This lowers"} your score.
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sig-h">
        <h2 id="sig-h" className="text-lg font-semibold">
          The signals behind it
        </h2>
        <table className="mt-2 w-full max-w-lg text-left text-sm">
          <tbody>
            {(
              Object.keys(READINESS_FEATURE_LABELS) as (keyof typeof READINESS_FEATURE_LABELS)[]
            ).map((k) => (
              <tr key={k} className="border-b border-slate-100 dark:border-slate-900">
                <th scope="row" className="py-1.5 pr-4 font-normal">
                  {READINESS_FEATURE_LABELS[k]}
                </th>
                <td className="py-1.5 text-right font-medium">{result.features[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
