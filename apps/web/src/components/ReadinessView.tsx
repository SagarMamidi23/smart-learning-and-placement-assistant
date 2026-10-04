"use client";

import Link from "next/link";
import { READINESS_FEATURE_LABELS, type ReadinessResultDto } from "@slp/shared";
import { InfoIcon, SparkleIcon } from "./icons";
import { ReadinessGauge } from "./ReadinessGauge";

const sign = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;

/** How much real evidence stands behind the score. A score built on almost nothing deserves a warning. */
export const evidenceCount = (e: ReadinessResultDto["evidence"]) =>
  Object.values(e).filter(Boolean).length;

const notice = "flex items-start gap-3 rounded-md px-4 py-3.5 text-sm leading-normal";

export function ReadinessView({ result }: { result: ReadinessResultDto }) {
  const met = result.decision === "opportunities";
  const thin = evidenceCount(result.evidence) <= 1;
  const score = Math.round(result.score);
  const gap = Math.max(0, Math.round(result.target - result.score));
  const computed = new Date(result.createdAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Next actions first, then the top skill gaps, numbered as one list in the order they should help.
  const steps = [
    ...result.nextActions.map((a) => ({ label: a.label, href: a.href, detail: undefined })),
    ...result.focusAreas.slice(0, 3).map((f) => ({
      label: `Close your ${f.skill} gap`,
      href: "/skill-gap",
      detail: `Level ${f.currentLevel} of ${f.targetLevel} · ${f.priority} priority`,
    })),
  ];
  const maxImpact = Math.max(0.1, ...result.factors.map((f) => Math.abs(f.impact)));

  return (
    <div className="flex flex-col gap-7">
      {result.isFallback && (
        <div role="status" className={`${notice} bg-surface-2`}>
          <InfoIcon size={18} className="mt-0.5 shrink-0" />
          <span>
            <strong>Calculated with the simple formula.</strong> The prediction service was
            unavailable, so this score uses a weighted formula instead of the ML model. It is a
            reasonable estimate. Recalculate later for the full model.
          </span>
        </div>
      )}
      {thin && (
        <div role="status" className={`${notice} bg-warn-soft text-warn-ink`}>
          <InfoIcon size={18} className="mt-0.5 shrink-0" />
          <span>
            This score rests on very little activity so far. Take an assessment or a mock evaluation
            to make it meaningful.
          </span>
        </div>
      )}

      <div className="grid rounded-md bg-surface shadow-card lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-4 border-rule p-6 max-lg:border-b-2 lg:items-start lg:border-r-2 lg:p-8">
          <ReadinessGauge score={result.score} target={result.target} size={300} stroke={18} />
          <p className="text-sm text-pretty text-muted">
            How closely your results and activity resemble students who were ready for this domain.
            Guidance on what to work on, not a verdict.
          </p>
          <p className="text-xs text-muted">
            Calculated {computed} · {result.isFallback ? "simple formula" : "ML model"}{" "}
            <code className="text-[11px]">{result.modelVersion}</code>
          </p>
        </div>
        <div className="flex flex-col gap-5 p-6 lg:p-8">
          <div className="flex flex-col gap-2">
            <span
              className={`self-start rounded-full px-2.5 py-[3px] text-xs font-semibold ${
                met ? "bg-success-soft text-success-ink" : "bg-accent-soft text-accent-soft-ink"
              }`}
            >
              {met ? "Target met · look at opportunities" : "Below target · keep learning"}
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight lg:text-[28px]">
              {met ? "You've reached the target" : `${gap} point${gap === 1 ? "" : "s"} to go`}
            </h2>
            <p className="max-w-[56ch] text-[15px] text-muted">
              {met
                ? `Your readiness is ${score}, at or above this domain's target of ${result.target}. You can start looking at opportunities.`
                : `You're at ${score} against a target of ${result.target}. These are the steps that should move it most, in order.`}
            </p>
          </div>
          {steps.length > 0 && (
            <section aria-labelledby="next-h">
              <h3 id="next-h" className="kicker mb-2 text-muted">
                {met ? "What next" : "What will help most"}
              </h3>
              <ol className="flex flex-col border-t-2 border-rule">
                {steps.map((s, i) => (
                  <li key={s.label} className={i < steps.length - 1 ? "border-b border-line" : ""}>
                    <Link
                      href={s.href}
                      className="grid min-h-14 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-2 text-ink no-underline hover:bg-surface-2"
                    >
                      <span aria-hidden className="text-xl font-extrabold text-accent">
                        {i + 1}
                      </span>
                      <span className="flex flex-col">
                        <strong className="text-[15px] font-semibold">{s.label}</strong>
                        {s.detail && <span className="text-[13px] text-muted">{s.detail}</span>}
                      </span>
                      <span aria-hidden>→</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>

      <div role="note" className={`${notice} rounded-sm bg-surface-2 text-[13px]`}>
        <SparkleIcon size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>
          <strong>AI-generated, advisory.</strong> The score estimates how closely your results and
          activity resemble students who are ready for this domain. It is a guide to what to work
          on, not a prediction of any exam or hiring outcome.
        </span>
      </div>

      <div className="grid gap-10 border-t-2 border-rule pt-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <section aria-labelledby="why-h">
          <h2 id="why-h" className="mb-1 text-lg font-extrabold lg:text-xl">
            What moved your score
          </h2>
          <p className="mb-3.5 text-[13px] text-muted">
            Points each signal adds or removes compared with a typical student.
          </p>
          <ul className="flex flex-col">
            {result.factors.map((f, i) => {
              const raises = f.direction === "raises";
              const width = `${(Math.abs(f.impact) / maxImpact) * 100}%`;
              return (
                <li
                  key={f.feature}
                  className={`grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3 py-2.5 text-sm sm:grid-cols-[56px_minmax(0,1fr)_120px] ${
                    i < result.factors.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  <span
                    className={`font-extrabold tabular-nums ${raises ? "text-success" : "text-danger"}`}
                  >
                    {sign(f.impact)}
                  </span>
                  <span>
                    <strong className="font-semibold">{f.label}</strong> is {f.value}
                    {f.typical !== undefined ? `, against a typical ${f.typical}` : ""}.
                    <span className="sr-only">
                      {raises ? " This raises your score." : " This lowers your score."}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`hidden h-2 sm:flex ${
                      raises ? "border-l-2 border-ink" : "justify-end border-r-2 border-ink"
                    }`}
                  >
                    <span
                      className={
                        raises ? "rounded-r-[2px] bg-success" : "rounded-l-[2px] bg-danger"
                      }
                      style={{ width }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="sig-h">
          <h2 id="sig-h" className="mb-3.5 text-lg font-extrabold lg:text-xl">
            The signals behind it
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="kicker border-b-2 border-rule py-1.5 text-left font-semibold text-muted"
                >
                  Signal
                </th>
                <th
                  scope="col"
                  className="kicker border-b-2 border-rule py-1.5 text-right font-semibold text-muted"
                >
                  Yours
                </th>
              </tr>
            </thead>
            <tbody>
              {(
                Object.keys(READINESS_FEATURE_LABELS) as (keyof typeof READINESS_FEATURE_LABELS)[]
              ).map((k) => {
                const noMock = k === "mock_eval_avg" && !result.evidence.mockEvaluations;
                return (
                  <tr key={k} className="border-b border-line last:border-0">
                    <th scope="row" className="py-2.5 text-left font-normal">
                      {READINESS_FEATURE_LABELS[k]}
                    </th>
                    <td
                      className={`py-2.5 text-right font-semibold tabular-nums ${noMock ? "text-muted" : ""}`}
                    >
                      {noMock ? "No result" : result.features[k]}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
