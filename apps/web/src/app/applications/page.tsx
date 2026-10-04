"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AlertsPanel, ApplicationBoard } from "@/components/ApplicationBoard";
import { ErrorAlert } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {
  useAlerts,
  useApplications,
  useDeleteApplication,
  useUpdateApplication,
  type ApplicationPatch,
} from "@/lib/opportunityHooks";

export default function ApplicationsPage() {
  return (
    <AppShell>
      <Applications />
    </AppShell>
  );
}

function Applications() {
  const apps = useApplications();
  const alerts = useAlerts();
  const update = useUpdateApplication();
  const del = useDeleteApplication();
  const [error, setError] = useState<string>();

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

  return (
    <>
      <h1 className="text-2xl font-bold">My applications</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Keep track of what you have saved and applied for. Change a card&apos;s status as you go,
        and add your own reminders for admit cards, interviews and similar dates.{" "}
        <Link href="/opportunities" className="text-indigo-600 underline dark:text-indigo-400">
          Find opportunities
        </Link>
      </p>

      <section className="mt-6" aria-labelledby="alerts-h">
        <h2 id="alerts-h" className="text-lg font-semibold">
          Coming up
        </h2>
        <div className="mt-2">
          {alerts.data ? <AlertsPanel alerts={alerts.data} /> : <p role="status">Loading…</p>}
        </div>
      </section>

      <div className="mt-4">
        <ErrorAlert message={error} />
      </div>

      <section className="mt-6" aria-label="Application board">
        {apps.isLoading && <p role="status">Loading…</p>}
        {apps.data && apps.data.length === 0 && (
          <p>
            You are not tracking anything yet. Press <strong>Track</strong> on an opportunity to add
            it here.
          </p>
        )}
        {apps.data && apps.data.length > 0 && (
          <ApplicationBoard
            applications={apps.data}
            busy={update.isPending || del.isPending}
            onUpdate={(id: string, patch: ApplicationPatch) => {
              setError(undefined);
              update.mutate({ id, patch }, { onError: fail });
            }}
            onRemove={(id) => {
              setError(undefined);
              del.mutate(id, { onError: fail });
            }}
          />
        )}
      </section>
    </>
  );
}
