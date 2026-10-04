"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ASSESSMENT_TYPES,
  OPPORTUNITY_TYPES,
  domainConfigSchema,
  domainUpdateSchema,
} from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useSaveDomain } from "@/lib/hooks";
import { describeIssue, sumPct, toPayload, type DomainForm } from "@/lib/domainForm";
import { ErrorAlert, Field, inputClass, primaryButton, secondaryButton } from "./ui";

type Row = Record<string, string>;

function CheckGroup({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: readonly string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-4">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.includes(o)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, o] : value.filter((x) => x !== o))
              }
            />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function DomainEditor({ mode, initial }: { mode: "create" | "edit"; initial: DomainForm }) {
  const router = useRouter();
  const save = useSaveDomain(mode);
  const [form, setForm] = useState<DomainForm>(initial);
  const [problems, setProblems] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string>();

  const set = <K extends keyof DomainForm>(key: K, value: DomainForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const patchRow = (key: "rubric" | "skills" | "exams", i: number, change: Row) =>
    setForm((f) => ({
      ...f,
      [key]: (f[key] as Row[]).map((r, j) => (j === i ? { ...r, ...change } : r)),
    }));
  const removeRow = (key: "rubric" | "skills" | "exams", i: number) =>
    setForm((f) => ({ ...f, [key]: (f[key] as Row[]).filter((_, j) => j !== i) }));

  const rubricTotal = sumPct(form.rubric);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(undefined);
    const payload = toPayload(form, mode as "create");
    const result = (mode === "create" ? domainConfigSchema : domainUpdateSchema).safeParse(payload);
    if (!result.success) {
      setProblems(result.error.issues.map((i) => describeIssue(i.path, i.message)));
      return;
    }
    setProblems([]);
    try {
      await save.mutateAsync({ slug: form.slug, body: payload });
      router.push("/admin/domains");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Could not save the domain.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      {problems.length > 0 && (
        <div
          role="alert"
          className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Field
          id="slug"
          label="Slug (cannot be changed later)"
          value={form.slug}
          disabled={mode === "edit"}
          onChange={(e) => set("slug", e.target.value)}
        />
        <Field
          id="name"
          label="Name"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
        <div className="sm:col-span-2">
          <label htmlFor="description" className="block text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            rows={2}
            className={inputClass}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <Field
          id="target"
          type="number"
          label="Readiness target (0-100)"
          value={form.readinessTarget}
          onChange={(e) => set("readinessTarget", e.target.value)}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Active (visible to students)
        </label>
        <div className="sm:col-span-2">
          <label htmlFor="safety" className="block text-sm font-medium">
            Safety notice (required for medical, legal and similar domains)
          </label>
          <textarea
            id="safety"
            rows={2}
            className={inputClass}
            value={form.safetyNotice}
            onChange={(e) => set("safetyNotice", e.target.value)}
          />
        </div>
      </section>

      <section className="space-y-4">
        <CheckGroup
          legend="Assessment types"
          options={ASSESSMENT_TYPES}
          value={form.assessmentTypes}
          onChange={(v) => set("assessmentTypes", v)}
        />
        <CheckGroup
          legend="Opportunity types"
          options={OPPORTUNITY_TYPES}
          value={form.opportunityTypes}
          onChange={(v) => set("opportunityTypes", v)}
        />
      </section>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">Benchmark skills</legend>
        <p className="text-sm text-slate-500">
          Level 1 (aware) to 5 (expert). Weights are percentages of importance within the domain.
        </p>
        {form.skills.map((s, i) => (
          <div key={i} className="grid grid-cols-[1fr_5rem_6rem_auto] items-end gap-2">
            <Field
              id={`skill-name-${i}`}
              label={i === 0 ? "Skill" : "Skill name"}
              value={s.name}
              onChange={(e) => patchRow("skills", i, { name: e.target.value })}
            />
            <div>
              <label htmlFor={`skill-level-${i}`} className="block text-sm font-medium">
                Level
              </label>
              <select
                id={`skill-level-${i}`}
                className={inputClass}
                value={s.level}
                onChange={(e) => patchRow("skills", i, { level: e.target.value })}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
            <Field
              id={`skill-weight-${i}`}
              type="number"
              step="0.1"
              label="Weight %"
              value={s.weight}
              onChange={(e) => patchRow("skills", i, { weight: e.target.value })}
            />
            <button
              type="button"
              className={secondaryButton}
              onClick={() => removeRow("skills", i)}
              aria-label={`Remove skill ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-4">
          <button
            type="button"
            className={secondaryButton}
            onClick={() =>
              set("skills", [
                ...form.skills,
                { name: "", level: "3", weight: "5", category: "core", source: "curated" },
              ])
            }
          >
            Add skill
          </button>
          <span className="text-sm text-slate-500">Total weight: {sumPct(form.skills)}%</span>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">Mock evaluation</legend>
        <div>
          <label htmlFor="mock-type" className="block text-sm font-medium">
            Format
          </label>
          <select
            id="mock-type"
            className={inputClass}
            value={form.mockType}
            onChange={(e) => set("mockType", e.target.value as DomainForm["mockType"])}
          >
            <option value="interview">interview</option>
            <option value="practical-task">practical-task</option>
          </select>
        </div>
        {form.rubric.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_6rem_1fr_auto] items-end gap-2">
            <Field
              id={`rubric-c-${i}`}
              label="Criterion"
              value={r.criterion}
              onChange={(e) => patchRow("rubric", i, { criterion: e.target.value })}
            />
            <Field
              id={`rubric-w-${i}`}
              type="number"
              step="0.1"
              label="Weight %"
              value={r.weight}
              onChange={(e) => patchRow("rubric", i, { weight: e.target.value })}
            />
            <Field
              id={`rubric-d-${i}`}
              label="Description"
              value={r.description}
              onChange={(e) => patchRow("rubric", i, { description: e.target.value })}
            />
            <button
              type="button"
              className={secondaryButton}
              onClick={() => removeRow("rubric", i)}
              aria-label={`Remove rubric row ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-4">
          <button
            type="button"
            className={secondaryButton}
            onClick={() =>
              set("rubric", [...form.rubric, { criterion: "", weight: "0", description: "" }])
            }
          >
            Add criterion
          </button>
          <span
            role="status"
            className={
              Math.abs(rubricTotal - 100) > 1
                ? "text-sm text-red-700 dark:text-red-300"
                : "text-sm text-slate-500"
            }
          >
            Rubric total: {rubricTotal}% (must be 100%)
          </span>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">Exam calendar</legend>
        <p className="text-sm text-slate-500">
          Typical months as numbers (for example 2, 11). Leave empty when it varies.
        </p>
        {form.exams.map((x, i) => (
          <div key={i} className="grid grid-cols-[1fr_8rem_1fr_auto] items-end gap-2">
            <Field
              id={`exam-n-${i}`}
              label="Exam"
              value={x.name}
              onChange={(e) => patchRow("exams", i, { name: e.target.value })}
            />
            <Field
              id={`exam-m-${i}`}
              label="Months"
              value={x.months}
              onChange={(e) => patchRow("exams", i, { months: e.target.value })}
            />
            <Field
              id={`exam-t-${i}`}
              label="Notes"
              value={x.notes}
              onChange={(e) => patchRow("exams", i, { notes: e.target.value })}
            />
            <button
              type="button"
              className={secondaryButton}
              onClick={() => removeRow("exams", i)}
              aria-label={`Remove exam ${i + 1}`}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={secondaryButton}
          onClick={() => set("exams", [...form.exams, { name: "", months: "", notes: "" }])}
        >
          Add exam
        </button>
      </fieldset>

      <ErrorAlert message={serverError} />
      <div className="flex gap-3">
        <button type="submit" className={primaryButton} disabled={save.isPending}>
          {save.isPending ? "Saving…" : mode === "create" ? "Create domain" : "Save changes"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => router.push("/admin/domains")}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
