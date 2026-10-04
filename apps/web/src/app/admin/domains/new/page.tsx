"use client";

import { AppShell } from "@/components/AppShell";
import { DomainEditor } from "@/components/DomainEditor";
import { emptyForm } from "@/lib/domainForm";

export default function NewDomainPage() {
  return (
    <AppShell adminOnly>
      <h1 className="mb-6 text-2xl font-bold">New domain</h1>
      <DomainEditor mode="create" initial={emptyForm()} />
    </AppShell>
  );
}
