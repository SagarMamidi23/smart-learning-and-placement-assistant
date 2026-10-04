"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { formatDuration } from "@/components/AssessmentTaker";
import { SafetyNotice } from "@/components/SafetyNotice";
import { primaryButton } from "@/components/ui";
import { useAssessments, useAttemptHistory } from "@/lib/evalHooks";
import { ApiError } from "@/lib/api";
import { useDomain, useProfile } from "@/lib/hooks";

export default function AssessmentsPage() {
  return (
    <AppShell>
      <Assessments />
    </AppShell>
  );
}

function Assessments() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const list = useAssessments();
  const history = useAttemptHistory();

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">Assessments</h1>
        <p className="mt-3">
          Choose a career domain first.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>
        </p>
      </>
    );
  }
  const noDomainError = list.error instanceof ApiError && list.error.status === 409;

  return (
    <>
      <h1 className="text-2xl font-bold">Assessments</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Practice tests for {domain.data?.name ?? slug}, reviewed by an administrator before they
        appear here.
      </p>
      <div className="mt-4">
        <SafetyNotice text={domain.data?.safetyNotice} />
      </div>

      {list.isLoading && <p role="status">Loading…</p>}
      {list.data?.length === 0 && !noDomainError && (
        <p className="mt-6 text-slate-600 dark:text-slate-300">
          No assessments are published for this domain yet. Check back soon.
        </p>
      )}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {list.data?.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <h2 className="font-semibold">{a.title}</h2>
            <p className="text-sm text-slate-500">
              {a.questionCount} questions · about {a.timeLimitMinutes} min · {a.type}
              {a.grounded ? " · from study material" : ""}
            </p>
            <p className="text-sm">
              {a.attempts
                ? `Best score ${a.bestScore}% from ${a.attempts} attempt${a.attempts === 1 ? "" : "s"}`
                : "Not attempted yet"}
            </p>
            <div className="mt-auto">
              <Link href={`/assessments/${a.id}`} className={primaryButton}>
                {a.attempts ? "Try again" : "Start"}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {history.data && history.data.length > 0 && (
        <section className="mt-10" aria-labelledby="hist-h">
          <h2 id="hist-h" className="text-lg font-semibold">
            Your attempts
          </h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-4">Assessment</th>
                <th className="py-2 pr-4">Score</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((h) => (
                <tr key={h.id} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="py-2 pr-4">{h.title}</td>
                  <td className="py-2 pr-4">{h.score}%</td>
                  <td className="py-2 pr-4">
                    {h.timeTakenSec !== undefined ? formatDuration(h.timeTakenSec) : "-"}
                  </td>
                  <td className="py-2">{new Date(h.submittedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
