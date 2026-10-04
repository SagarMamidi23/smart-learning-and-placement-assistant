"use client";

import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorAlert, primaryButton, secondaryButton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAdminDomains, useDeleteDomain } from "@/lib/hooks";

export default function AdminDomainsPage() {
  return (
    <AppShell adminOnly>
      <AdminDomains />
    </AppShell>
  );
}

function AdminDomains() {
  const domains = useAdminDomains();
  const del = useDeleteDomain();
  const [error, setError] = useState<string>();

  async function onDelete(slug: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError(undefined);
    try {
      await del.mutateAsync(slug);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete the domain.");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Domain configuration</h1>
        <Link href="/admin/domains/new" className={primaryButton}>
          New domain
        </Link>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Every career domain is data. Adding a domain here makes it available to students
        immediately.
      </p>
      <div className="mt-4">
        <ErrorAlert message={error} />
      </div>
      {domains.isLoading && <p role="status">Loading…</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Slug</th>
              <th className="py-2 pr-4">Target</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {domains.data?.map((d) => (
              <tr key={d.slug} className="border-b border-slate-100 dark:border-slate-900">
                <td className="py-2 pr-4 font-medium">{d.name}</td>
                <td className="py-2 pr-4 text-slate-500">{d.slug}</td>
                <td className="py-2 pr-4">{d.readinessTarget}</td>
                <td className="py-2 pr-4">{d.isActive ? "Active" : "Hidden"}</td>
                <td className="flex gap-2 py-2">
                  <Link href={`/admin/domains/${d.slug}`} className={secondaryButton}>
                    Edit
                  </Link>
                  <button className={secondaryButton} onClick={() => onDelete(d.slug, d.name)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
