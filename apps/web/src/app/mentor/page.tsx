"use client";

import Link from "next/link";
import { AiNotice } from "@/components/AiNotice";
import { AppShell } from "@/components/AppShell";
import { MentorChat } from "@/components/MentorChat";
import { SafetyNotice } from "@/components/SafetyNotice";
import { useDomain, useProfile } from "@/lib/hooks";
import { useMentorHistory, useMentorStatus } from "@/lib/mentorHooks";

export default function MentorPage() {
  return (
    <AppShell>
      <Mentor />
    </AppShell>
  );
}

function Mentor() {
  const profile = useProfile();
  const slug = profile.data?.activeDomain ?? "";
  const domain = useDomain(slug);
  const history = useMentorHistory(Boolean(slug));
  const status = useMentorStatus(Boolean(slug));

  if (profile.isLoading) return <p role="status">Loading…</p>;
  if (!slug) {
    return (
      <>
        <h1 className="text-2xl font-bold">AI mentor</h1>
        <p className="mt-3">
          Choose a career domain first so the mentor knows which study material to use.{" "}
          <Link href="/domains" className="text-indigo-600 underline dark:text-indigo-400">
            Browse domains
          </Link>
        </p>
      </>
    );
  }

  const empty = status.data && status.data.chunks === 0;
  return (
    <>
      <h1 className="text-2xl font-bold">AI mentor</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        Doubt-solving for {domain.data?.name ?? slug}, grounded in the study material.
      </p>
      <div className="mt-4 space-y-3">
        <SafetyNotice text={domain.data?.safetyNotice} />
        <AiNotice>
          Answers are generated only from the uploaded study material and cite where they came from.
          If the material does not cover your question, the mentor will say so rather than guess.
          Check important facts against your official syllabus.
        </AiNotice>
        {empty && (
          <p
            role="status"
            className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            No study material has been uploaded for this domain yet, so the mentor cannot answer
            yet. Ask an administrator to add your syllabus or notes.
          </p>
        )}
        {status.data && !empty && (
          <p className="text-xs text-slate-500">
            Using {status.data.materials} document{status.data.materials === 1 ? "" : "s"} (
            {status.data.chunks} passages).
          </p>
        )}
      </div>
      <div className="mt-6">
        {history.isLoading ? (
          <p role="status">Loading conversation…</p>
        ) : (
          <MentorChat history={history.data ?? []} />
        )}
      </div>
    </>
  );
}
