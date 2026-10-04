"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DomainEditor } from "@/components/DomainEditor";
import { toForm } from "@/lib/domainForm";
import { useAdminDomain } from "@/lib/hooks";

export default function EditDomainPage() {
  return (
    <AppShell adminOnly>
      <Edit />
    </AppShell>
  );
}

function Edit() {
  const { slug } = useParams<{ slug: string }>();
  const domain = useAdminDomain(slug);
  if (domain.isLoading) return <p role="status">Loading…</p>;
  if (domain.error || !domain.data) return <p role="alert">Domain not found.</p>;
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Edit {domain.data.name}</h1>
      {/* key remounts the form when fresh data arrives after a save elsewhere */}
      <DomainEditor key={domain.data.updatedAt} mode="edit" initial={toForm(domain.data)} />
    </>
  );
}
