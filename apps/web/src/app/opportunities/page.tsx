"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { OpportunityCard, typeLabel } from "@/components/OpportunityCard";
import { ErrorAlert, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useDomain, useProfile } from "@/lib/hooks";
import { useMatches, useOpportunities, useTrackOpportunity } from "@/lib/opportunityHooks";

export default function OpportunitiesPage() {
  return (
    <AppShell>
      <Opportunities />
    </AppShell>
  );
}

function Opportunities() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const [tab, setTab] = useState<"matches" | "all">("matches");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [wantMatches, setWantMatches] = useState(false);
  const matches = useMatches(wantMatches && tab === "matches", type || undefined);
  const all = useOpportunities(
    { type: type || undefined, q: q.trim() || undefined },
    Boolean(slug) && tab === "all",
  );
  const track = useTrackOpportunity();
  const [error, setError] = useState<string>();

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">Opportunities</h1>
        <p className="mt-3">
          Choose a career domain first.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>
        </p>
      </>
    );
  }

  async function onTrack(id: string) {
    setError(undefined);
    try {
      await track.mutateAsync({ opportunityId: id });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not track this opportunity.");
    }
  }

  const types = domain.data?.opportunityTypes ?? [];
  const m = matches.data;

  return (
    <>
      <h1 className="text-2xl font-bold">Opportunities</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Exams, jobs, fellowships and more for {domain.data?.name ?? slug}. Listings point to the
        official pages; always confirm eligibility and dates there.{" "}
        <Link href="/applications" className="text-indigo-600 underline dark:text-indigo-400">
          Your applications
        </Link>
      </p>

      <div role="tablist" aria-label="View" className="mt-6 flex gap-2">
        {(
          [
            ["matches", "Matched for you"],
            ["all", "Browse all"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? primaryButton : secondaryButton}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="type" className="block text-sm font-medium">
            Type
          </label>
          <select
            id="type"
            className={inputClass}
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </div>
        {tab === "all" && (
          <div>
            <label htmlFor="q" className="block text-sm font-medium">
              Search
            </label>
            <input id="q" className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
      </div>
      <div className="mt-3">
        <ErrorAlert message={error} />
      </div>

      {tab === "matches" && (
        <section className="mt-4" aria-label="Matches">
          {!wantMatches && (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                We compare your profile with each opportunity and write a short note on why it might
                suit you. The notes are AI-generated from your profile and the listing, so treat
                them as a starting point.
              </p>
              <button className={`${primaryButton} mt-3`} onClick={() => setWantMatches(true)}>
                Find my matches
              </button>
            </>
          )}
          {matches.isFetching && <p role="status">Finding your matches…</p>}
          {matches.error && (
            <ErrorAlert
              message={
                matches.error instanceof ApiError
                  ? matches.error.message
                  : "Could not load matches. Please try again."
              }
            />
          )}
          {m && (
            <>
              {m.rankingFallback && (
                <p
                  role="note"
                  className="mb-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  The matching service is unavailable, so these are ranked by simple keyword overlap
                  and may be less accurate.
                </p>
              )}
              {m.reasonsUnavailable && !m.rankingFallback && (
                <p role="note" className="mb-3 text-sm text-slate-600 dark:text-slate-300">
                  Explanations are not available right now
                  {m.matches.length
                    ? ", or your profile has too little detail to explain from. Add skills and education on your profile"
                    : ""}
                  .
                </p>
              )}
              {m.readiness && (
                <p className="mb-3 text-sm">
                  Your readiness is {Math.round(m.readiness.score)} against a target of{" "}
                  {m.readiness.target}
                  {m.readiness.met
                    ? ": you are at the level this domain asks for."
                    : ". Keep building skills while you track these."}
                </p>
              )}
              {m.matches.length === 0 ? (
                <p>No open opportunities match these filters.</p>
              ) : (
                <ul className="space-y-4">
                  {m.matches.map((x) => (
                    <li key={x.opportunity.id}>
                      <OpportunityCard
                        opportunity={x.opportunity}
                        match={x}
                        onTrack={onTrack}
                        tracking={track.isPending}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {tab === "all" && (
        <section className="mt-4" aria-label="All opportunities">
          {all.isLoading && <p role="status">Loading…</p>}
          {all.data?.length === 0 && <p>No open opportunities match these filters.</p>}
          <ul className="space-y-4">
            {all.data?.map((o) => (
              <li key={o.id}>
                <OpportunityCard opportunity={o} onTrack={onTrack} tracking={track.isPending} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
