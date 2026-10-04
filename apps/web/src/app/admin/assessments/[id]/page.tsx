"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AssessmentEditor } from "@/components/AssessmentEditor";
import { useAdminAssessment } from "@/lib/evalHooks";

export default function ReviewAssessmentPage() {
  return (
    <AppShell adminOnly>
      <Review />
    </AppShell>
  );
}

function Review() {
  const { id } = useParams<{ id: string }>();
  const a = useAdminAssessment(id);
  if (a.isLoading) return <p role="status">Loading…</p>;
  if (a.error || !a.data) return <p role="alert">Assessment not found.</p>;
  return (
    <>
      <Link
        href="/admin/assessments"
        className="text-sm text-indigo-600 underline dark:text-indigo-400"
      >
        All assessments
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">
        {a.data.status === "draft" ? "Review draft" : "Published assessment"}
      </h1>
      {/* key remounts the editor when the saved version changes, so it never shows stale fields */}
      <AssessmentEditor
        key={`${a.data.id}-${a.data.status}-${a.dataUpdatedAt}`}
        assessment={a.data}
      />
    </>
  );
}
