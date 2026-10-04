"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { MockEvalForm, MockEvalResults } from "@/components/MockEvalView";
import { SafetyNotice } from "@/components/SafetyNotice";
import { useMockEval } from "@/lib/evalHooks";
import { useDomain } from "@/lib/hooks";

export default function MockEvalDetailPage() {
  return (
    <AppShell>
      <Detail />
    </AppShell>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const ev = useMockEval(id);
  const domain = useDomain(ev.data?.domain ?? "");
  if (ev.isLoading) return <p role="status">Loading…</p>;
  if (ev.error || !ev.data) return <p role="alert">Evaluation not found.</p>;
  const e = ev.data;
  return (
    <>
      <Link href="/mock-eval" className="text-sm text-indigo-600 underline dark:text-indigo-400">
        All evaluations
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        Mock {e.type === "interview" ? "interview" : "practical task"}
      </h1>
      <div className="mt-4">
        <SafetyNotice text={domain.data?.safetyNotice} />
      </div>
      <div className="mt-6">
        {e.status === "completed" ? (
          <MockEvalResults evaluation={e} />
        ) : (
          <MockEvalForm evaluation={e} />
        )}
      </div>
    </>
  );
}
