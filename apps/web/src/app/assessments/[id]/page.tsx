"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { AttemptDto } from "@slp/shared";
import { AppShell } from "@/components/AppShell";
import { AssessmentTaker } from "@/components/AssessmentTaker";
import { ErrorAlert } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useStartAttempt } from "@/lib/evalHooks";

export default function TakeAssessmentPage() {
  return (
    <AppShell>
      <Take />
    </AppShell>
  );
}

function Take() {
  const { id } = useParams<{ id: string }>();
  const start = useStartAttempt();
  const [attempt, setAttempt] = useState<AttemptDto>();
  const [error, setError] = useState<string>();
  const started = useRef(false);

  // Starting is explicit (it begins the clock), but there is nothing to choose, so begin on arrival.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start
      .mutateAsync(id)
      .then(setAttempt, (e) =>
        setError(e instanceof ApiError ? e.message : "Could not start the assessment."),
      );
  }, [id, start]);

  return (
    <>
      <Link href="/assessments" className="text-sm text-indigo-600 underline dark:text-indigo-400">
        All assessments
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Assessment</h1>
      <div className="mt-4">
        <ErrorAlert message={error} />
      </div>
      {!attempt && !error && <p role="status">Starting…</p>}
      {attempt && (
        <div className="mt-6">
          <AssessmentTaker attempt={attempt} />
        </div>
      )}
    </>
  );
}
