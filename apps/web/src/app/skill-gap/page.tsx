"use client";

import Link from "next/link";
import { useState } from "react";
import { AiNotice, ProgressBar } from "@/components/AiNotice";
import { AppShell } from "@/components/AppShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { ErrorAlert, primaryButton, secondaryButton } from "@/components/ui";
import { useGenerateSkillGap, useSkillGap } from "@/lib/aiHooks";
import { ApiError } from "@/lib/api";
import { useDomain, useProfile } from "@/lib/hooks";

export default function SkillGapPage() {
  return (
    <AppShell>
      <SkillGap />
    </AppShell>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

function SkillGap() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const report = useSkillGap(Boolean(slug));
  const generate = useGenerateSkillGap();
  const [error, setError] = useState<{ message: string; code?: string }>();

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">Skill-gap report</h1>
        <p className="mt-3">
          Choose a career domain first so we know what to measure you against.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>{" "}
          or{" "}
          <Link href="/discovery" className="text-indigo-600 underline dark:text-indigo-400">
            take the discovery quiz
          </Link>
          .
        </p>
      </>
    );
  }

  async function run() {
    setError(undefined);
    try {
      await generate.mutateAsync();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { message: e.message, code: e.code }
          : { message: "Something went wrong. Please try again." },
      );
    }
  }

  const r = report.data;
  return (
    <>
      <h1 className="text-2xl font-bold">Skill-gap report</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        How your profile compares with the {domain.data?.name ?? slug} benchmark.
      </p>
      <div className="mt-4 space-y-3">
        <SafetyNotice text={domain.data?.safetyNotice} />
        <AiNotice>
          Levels are estimated only from what is in your profile and resume. Adding detail to your
          profile gives a more accurate picture.
        </AiNotice>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className={primaryButton} disabled={generate.isPending} onClick={run}>
          {generate.isPending ? "Analysing…" : r ? "Re-run analysis" : "Analyse my skills"}
        </button>
        {r && (
          <Link href="/learning-path" className={secondaryButton}>
            Go to my learning path
          </Link>
        )}
        {generate.isPending && (
          <span role="status" className="text-sm text-slate-500">
            This can take up to a minute.
          </span>
        )}
      </div>
      <div className="mt-3">
        <ErrorAlert message={error?.message} />
        {error?.code === "PROFILE_INCOMPLETE" && (
          <p className="mt-2 text-sm">
            <Link href="/profile" className="text-indigo-600 underline dark:text-indigo-400">
              Update your profile
            </Link>
          </p>
        )}
      </div>

      {report.isLoading && <p role="status">Loading…</p>}
      {!r && !report.isLoading && !generate.isPending && (
        <p className="mt-6 text-slate-600 dark:text-slate-300">
          You have no report yet. Run the analysis to see your strengths and gaps.
        </p>
      )}

      {r && (
        <div className="mt-8 space-y-8">
          <section aria-labelledby="cov-h">
            <h2 id="cov-h" className="sr-only">
              Overall coverage
            </h2>
            <ProgressBar value={r.coverage} label="Benchmark coverage" />
            <p className="mt-3">{r.summary}</p>
            <p className="mt-1 text-xs text-slate-500">
              Generated {new Date(r.generatedAt).toLocaleString()}
              {r.usedResume ? " · includes your resume" : ""}
            </p>
          </section>

          <section aria-labelledby="gaps-h">
            <h2 id="gaps-h" className="text-lg font-semibold">
              Gaps to close ({r.gaps.length})
            </h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-4">Skill</th>
                    <th className="py-2 pr-4">Now</th>
                    <th className="py-2 pr-4">Target</th>
                    <th className="py-2">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {r.gaps.map((g) => (
                    <tr key={g.skill} className="border-b border-slate-100 dark:border-slate-900">
                      <td className="py-2 pr-4">{g.skill}</td>
                      <td className="py-2 pr-4">{g.currentLevel}/5</td>
                      <td className="py-2 pr-4">{g.targetLevel}/5</td>
                      <td className="py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLE[g.priority]}`}
                        >
                          {g.priority}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="str-h">
            <h2 id="str-h" className="text-lg font-semibold">
              Strengths ({r.strengths.length})
            </h2>
            {r.strengths.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No skill meets its target level yet based on your profile. Adding projects,
                coursework and skills will change this.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {r.strengths.map((s) => (
                  <li key={s.skill}>
                    <strong>{s.skill}</strong> ({s.currentLevel}/{s.targetLevel})
                    {s.evidence ? <span className="text-slate-500">: {s.evidence}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
