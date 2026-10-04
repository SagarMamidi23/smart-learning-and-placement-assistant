"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LearningPathView } from "@/components/LearningPathView";
import { SafetyNotice } from "@/components/SafetyNotice";
import { ErrorAlert, inputClass, primaryButton } from "@/components/ui";
import { useGeneratePath, useLearningPath, useSkillGap } from "@/lib/aiHooks";
import { ApiError } from "@/lib/api";
import { useDomain, useProfile } from "@/lib/hooks";

export default function LearningPathPage() {
  return (
    <AppShell>
      <LearningPath />
    </AppShell>
  );
}

function LearningPath() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const report = useSkillGap(Boolean(slug));
  const path = useLearningPath(Boolean(slug));
  const generate = useGeneratePath();
  const [weeks, setWeeks] = useState(8);
  const [hours, setHours] = useState(8);
  const [error, setError] = useState<string>();

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">Learning path</h1>
        <p className="mt-3">
          Choose a career domain first.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>
        </p>
      </>
    );
  }

  async function run() {
    setError(undefined);
    try {
      await generate.mutateAsync({ weeks, hoursPerWeek: hours });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");
    }
  }

  const p = path.data;
  const noReport = !report.isLoading && !report.data;

  return (
    <>
      <h1 className="text-2xl font-bold">Learning path</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        A week-by-week plan to close your {domain.data?.name ?? slug} skill gaps.
      </p>
      <div className="mt-4">
        <SafetyNotice text={domain.data?.safetyNotice} />
      </div>

      {noReport ? (
        <p className="mt-6">
          Your plan is built from your skill-gap report, so run that first.{" "}
          <Link href="/skill-gap" className="text-indigo-600 underline dark:text-indigo-400">
            Analyse my skills
          </Link>
        </p>
      ) : (
        <>
          {p?.stale && (
            <div
              role="alert"
              className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            >
              Your skill-gap report has changed since this plan was made. Generate a new plan to
              match your current gaps.
            </div>
          )}
          <form
            className="mt-6 flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <div>
              <label htmlFor="weeks" className="block text-sm font-medium">
                Weeks
              </label>
              <select
                id="weeks"
                className={inputClass}
                value={weeks}
                onChange={(e) => setWeeks(Number(e.target.value))}
              >
                {[4, 6, 8, 10, 12, 16].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="hours" className="block text-sm font-medium">
                Hours per week
              </label>
              <input
                id="hours"
                type="number"
                min={1}
                max={40}
                className={`${inputClass} w-28`}
                value={hours}
                onChange={(e) => setHours(Math.min(40, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <button className={primaryButton} disabled={generate.isPending || report.isLoading}>
              {generate.isPending ? "Planning…" : p ? "Generate a new plan" : "Generate my plan"}
            </button>
            {generate.isPending && (
              <span role="status" className="text-sm text-slate-500">
                This can take up to a minute.
              </span>
            )}
          </form>
          <div className="mt-3">
            <ErrorAlert message={error} />
          </div>
          {p && (
            <div className="mt-8">
              <LearningPathView path={p} />
            </div>
          )}
        </>
      )}
    </>
  );
}
