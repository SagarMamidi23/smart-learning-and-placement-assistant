"use client";

import { useState } from "react";
import { OPPORTUNITY_TYPES, type OpportunityDto } from "@slp/shared";
import { AppShell } from "@/components/AppShell";
import { deadlineText, typeLabel } from "@/components/OpportunityCard";
import { ErrorAlert, Field, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAdminDomains } from "@/lib/hooks";
import {
  useAdminOpportunities,
  useDeleteOpportunity,
  useSaveOpportunity,
} from "@/lib/opportunityHooks";

export default function AdminOpportunitiesPage() {
  return (
    <AppShell adminOnly>
      <AdminOpportunities />
    </AppShell>
  );
}

const empty = {
  domain: "",
  type: "job",
  title: "",
  organisation: "",
  location: "India",
  eligibility: "",
  deadline: "",
  link: "",
  description: "",
  isActive: true,
};

function AdminOpportunities() {
  const domains = useAdminDomains();
  const list = useAdminOpportunities();
  const save = useSaveOpportunity();
  const del = useDeleteOpportunity();
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function edit(o: OpportunityDto) {
    setEditing(o.id);
    setDone(undefined);
    setForm({ ...o, deadline: o.deadline ?? "" });
    window.scrollTo?.({ top: 0 });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setDone(undefined);
    if (!form.domain) return setError("Choose a domain.");
    try {
      const { opportunity } = await save.mutateAsync({
        id: editing,
        data: {
          ...form,
          type: form.type as OpportunityDto["type"],
          deadline: form.deadline || null,
        },
      });
      setDone(`Saved "${opportunity.title}".`);
      setForm(empty);
      setEditing(undefined);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  const nameOf = (slug: string) => domains.data?.find((d) => d.slug === slug)?.name ?? slug;

  return (
    <>
      <h1 className="text-2xl font-bold">Opportunities</h1>
      <p className="mt-2 text-sm text-slate-500">
        Use official sources only, link to the official page (https), and leave the deadline empty
        when it changes every year. Saving also refreshes the opportunity&apos;s matching vector.
      </p>

      <form onSubmit={onSubmit} className="mt-6 grid max-w-2xl gap-4" aria-label="Opportunity form">
        <div>
          <label htmlFor="domain" className="block text-sm font-medium">
            Domain
          </label>
          <select
            id="domain"
            className={inputClass}
            value={form.domain}
            disabled={Boolean(editing)}
            onChange={(e) => set("domain", e.target.value)}
          >
            <option value="">Choose…</option>
            {domains.data?.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="otype" className="block text-sm font-medium">
            Type
          </label>
          <select
            id="otype"
            className={inputClass}
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
          >
            {OPPORTUNITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="title"
          label="Title"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required
        />
        <Field
          id="org"
          label="Organisation"
          value={form.organisation}
          onChange={(e) => set("organisation", e.target.value)}
          required
        />
        <Field
          id="loc"
          label="Location"
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
        />
        <Field
          id="elig"
          label="Eligibility"
          value={form.eligibility}
          onChange={(e) => set("eligibility", e.target.value)}
        />
        <Field
          id="deadline"
          label="Deadline (optional)"
          type="date"
          value={form.deadline}
          onChange={(e) => set("deadline", e.target.value)}
        />
        <Field
          id="link"
          label="Official link (https)"
          type="url"
          value={form.link}
          onChange={(e) => set("link", e.target.value)}
          required
        />
        <div>
          <label htmlFor="desc" className="block text-sm font-medium">
            Description
          </label>
          <textarea
            id="desc"
            className={inputClass}
            rows={4}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
          />
          Visible to students
        </label>
        <ErrorAlert message={error} />
        {done && (
          <p role="status" className="text-green-700 dark:text-green-300">
            {done}
          </p>
        )}
        <div className="flex gap-3">
          <button className={primaryButton} disabled={save.isPending}>
            {editing ? "Save changes" : "Add opportunity"}
          </button>
          {editing && (
            <button
              type="button"
              className={secondaryButton}
              onClick={() => (setEditing(undefined), setForm(empty))}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2 className="mt-10 text-lg font-semibold">All opportunities ({list.data?.length ?? 0})</h2>
      {list.isLoading && <p role="status">Loading…</p>}
      <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
        {list.data?.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{o.title}</span> · {nameOf(o.domain)} ·{" "}
              {typeLabel(o.type)} · {deadlineText(o)}
              {!o.isActive && <em> (hidden)</em>}
            </span>
            <button
              className="text-indigo-600 underline dark:text-indigo-400"
              onClick={() => edit(o)}
              aria-label={`Edit ${o.title}`}
            >
              Edit
            </button>
            <button
              className="text-red-700 underline dark:text-red-300"
              aria-label={`Delete ${o.title}`}
              onClick={() => {
                if (
                  window.confirm(`Delete "${o.title}"? Students tracking it will lose that card.`)
                )
                  del.mutate(o.id);
              }}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
