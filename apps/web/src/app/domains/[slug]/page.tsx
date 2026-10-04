"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SafetyNotice, formatMonths } from "@/components/SafetyNotice";
import { primaryButton } from "@/components/ui";
import { useDomain, useProfile, useSelectDomain } from "@/lib/hooks";

export default function DomainDetailPage() {
  return (
    <AppShell>
      <Detail />
    </AppShell>
  );
}

function Detail() {
  const { slug } = useParams<{ slug: string }>();
  const domain = useDomain(slug);
  const profile = useProfile();
  const select = useSelectDomain();
  const d = domain.data;

  if (domain.isLoading) return <p role="status">Loading…</p>;
  if (domain.error || !d) {
    return (
      <p role="alert">
        Domain not found.{" "}
        <Link href="/domains" className="underline">
          Back to domains
        </Link>
      </p>
    );
  }
  const isActive = profile.data?.activeDomain === d.slug;
  const skills = [...d.benchmarkSkills].sort((a, b) => b.weight - a.weight);

  return (
    <>
      <Link href="/domains" className="text-sm text-indigo-600 underline dark:text-indigo-400">
        All domains
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{d.name}</h1>
        {isActive ? (
          <span className="rounded bg-indigo-100 px-2 py-0.5 text-sm font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
            Your domain
          </span>
        ) : (
          <button
            className={primaryButton}
            disabled={select.isPending}
            onClick={() => select.mutate(d.slug)}
          >
            Choose this domain
          </button>
        )}
      </div>
      <p className="mt-2 text-slate-600 dark:text-slate-300">{d.description}</p>
      <div className="mt-4">
        <SafetyNotice text={d.safetyNotice} />
      </div>

      <section className="mt-8" aria-labelledby="skills-h">
        <h2 id="skills-h" className="text-lg font-semibold">
          Skills you will be measured against
        </h2>
        <p className="text-sm text-slate-500">
          Target level is from 1 (aware) to 5 (expert). Higher weight means more important.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-4">Skill</th>
                <th className="py-2 pr-4">Target level</th>
                <th className="py-2 pr-4">Weight</th>
                <th className="py-2">Type</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.name} className="border-b border-slate-100 dark:border-slate-900">
                  <td className="py-2 pr-4">{s.name}</td>
                  <td className="py-2 pr-4">{s.level}/5</td>
                  <td className="py-2 pr-4">{(s.weight * 100).toFixed(1)}%</td>
                  <td className="py-2 text-slate-500">
                    {s.category === "core" ? "Domain skill" : s.category}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="eval-h">
        <h2 id="eval-h" className="text-lg font-semibold">
          Mock evaluation ({d.mockEvaluation.type === "interview" ? "interview" : "practical task"})
        </h2>
        <ul className="mt-2 list-disc pl-6 text-sm">
          {d.mockEvaluation.rubric.map((r) => (
            <li key={r.criterion}>
              <strong>{r.criterion}</strong> ({Math.round(r.weight * 100)}%)
              {r.description ? `: ${r.description}` : ""}
            </li>
          ))}
        </ul>
      </section>

      {d.examCalendar.length > 0 && (
        <section className="mt-8" aria-labelledby="exams-h">
          <h2 id="exams-h" className="text-lg font-semibold">
            Exams and recruitment cycles
          </h2>
          <p className="text-sm text-slate-500">
            Typical months only. Dates shift every year, so always confirm on the official
            notification.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {d.examCalendar.map((e) => (
              <li key={e.name}>
                <strong>{e.name}</strong>: {formatMonths(e.months)}
                {e.notes ? <span className="text-slate-500"> ({e.notes})</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
