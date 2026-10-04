"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { SafetyNotice } from "@/components/SafetyNotice";
import { primaryButton } from "@/components/ui";
import { useDomains, useProfile, useSelectDomain } from "@/lib/hooks";

export default function DomainsPage() {
  return (
    <AppShell>
      <Domains />
    </AppShell>
  );
}

function Domains() {
  const domains = useDomains();
  const profile = useProfile();
  const select = useSelectDomain();
  const active = profile.data?.activeDomain;

  return (
    <>
      <h1 className="text-2xl font-bold">Career domains</h1>
      <p className="mt-2 text-slate-600 dark:text-slate-300">
        Choose the domain you want to prepare for. You can switch later, and your progress in each
        domain is kept.
      </p>
      {domains.isLoading && <p role="status">Loading domains…</p>}
      {domains.error && <p role="alert">Could not load domains.</p>}
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {domains.data?.map((d) => (
          <li
            key={d.slug}
            className={`flex flex-col gap-3 rounded-lg border p-4 ${
              d.slug === active
                ? "border-indigo-500 ring-1 ring-indigo-500"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <div>
              <h2 className="text-lg font-semibold">
                <Link href={`/domains/${d.slug}`} className="hover:underline">
                  {d.name}
                </Link>
                {d.slug === active && (
                  <span className="ml-2 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                    Your domain
                  </span>
                )}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{d.description}</p>
            </div>
            <SafetyNotice text={d.safetyNotice} />
            <div className="mt-auto flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Readiness target {d.readinessTarget}/100
              </span>
              {d.slug !== active && (
                <button
                  className={primaryButton}
                  disabled={select.isPending}
                  onClick={() => select.mutate(d.slug)}
                  aria-label={`Choose ${d.name}`}
                >
                  Choose
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {select.isError && (
        <p role="alert" className="mt-4 text-red-700 dark:text-red-300">
          Could not set your domain. Please try again.
        </p>
      )}
    </>
  );
}
