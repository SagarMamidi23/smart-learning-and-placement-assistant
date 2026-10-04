"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorAlert, Field, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAdminAssessments, useGenerateAssessment } from "@/lib/evalHooks";
import { useAdminDomains } from "@/lib/hooks";

export default function AdminAssessmentsPage() {
  return (
    <AppShell adminOnly>
      <AdminAssessments />
    </AppShell>
  );
}

function AdminAssessments() {
  const router = useRouter();
  const domains = useAdminDomains();
  const list = useAdminAssessments();
  const generate = useGenerateAssessment();
  const [domain, setDomain] = useState("");
  const [count, setCount] = useState(8);
  const [practical, setPractical] = useState(0);
  const [difficulty, setDifficulty] = useState("");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState<string>();

  async function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (!domain) {
      setError("Choose a domain.");
      return;
    }
    try {
      const a = await generate.mutateAsync({
        domain,
        count,
        practicalCount: practical,
        difficulty: difficulty ? Number(difficulty) : undefined,
        focus: focus.trim() || undefined,
      });
      router.push(`/admin/assessments/${a.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not generate. Please try again.");
    }
  }

  const nameOf = (slug: string) => domains.data?.find((d) => d.slug === slug)?.name ?? slug;

  return (
    <>
      <h1 className="text-2xl font-bold">Assessments</h1>
      <p className="mt-2 text-sm text-slate-500">
        The AI writes a draft; you review and edit every question before publishing. When the domain
        has study material, questions are written from it.
      </p>

      <form onSubmit={onGenerate} noValidate className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium">
            Domain
          </label>
          <select
            id="domain"
            className={inputClass}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option value="">Choose…</option>
            {domains.data?.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="count"
          type="number"
          min={3}
          max={15}
          label="Questions (3-15)"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <Field
          id="practical"
          type="number"
          min={0}
          max={5}
          label="Of which written (0-5)"
          value={practical}
          onChange={(e) => setPractical(Number(e.target.value))}
        />
        <div>
          <label htmlFor="difficulty" className="block text-sm font-medium">
            Difficulty
          </label>
          <select
            id="difficulty"
            className={inputClass}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">Mixed</option>
            <option value="1">Easy</option>
            <option value="2">Moderate</option>
            <option value="3">Hard</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Field
            id="focus"
            label="Focus topic (optional)"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <ErrorAlert message={error} />
          <button className={`${primaryButton} mt-2`} disabled={generate.isPending}>
            {generate.isPending ? "Writing the draft…" : "Generate draft"}
          </button>
          {generate.isPending && (
            <span role="status" className="ml-3 text-sm text-slate-500">
              This can take up to a minute.
            </span>
          )}
        </div>
      </form>

      <h2 className="mt-10 text-lg font-semibold">All assessments</h2>
      {list.isLoading && <p role="status">Loading…</p>}
      {list.data?.length === 0 && <p className="mt-2 text-sm text-slate-500">None yet.</p>}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-4">Title</th>
              <th className="py-2 pr-4">Domain</th>
              <th className="py-2 pr-4">Questions</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-2 pr-4">{a.title}</td>
                <td className="py-2 pr-4">{nameOf(a.domain)}</td>
                <td className="py-2 pr-4">{a.questionCount}</td>
                <td className="py-2 pr-4">
                  {a.status === "published" ? "Published" : "Draft (needs review)"}
                </td>
                <td className="py-2">
                  <Link href={`/admin/assessments/${a.id}`} className={secondaryButton}>
                    {a.status === "draft" ? "Review" : "View"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
