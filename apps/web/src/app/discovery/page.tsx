"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiNotice } from "@/components/AiNotice";
import { AppShell } from "@/components/AppShell";
import { QuizForm } from "@/components/QuizForm";
import { SafetyNotice } from "@/components/SafetyNotice";
import { primaryButton, secondaryButton } from "@/components/ui";
import { useDiscoveryResult, useQuiz } from "@/lib/aiHooks";
import { useDomains, useProfile, useSelectDomain } from "@/lib/hooks";

export default function DiscoveryPage() {
  return (
    <AppShell>
      <Discovery />
    </AppShell>
  );
}

function Discovery() {
  const quiz = useQuiz();
  const result = useDiscoveryResult();
  const [retaking, setRetaking] = useState(false);

  if (quiz.isLoading || result.isLoading) return <p role="status">Loading…</p>;
  if (quiz.error || !quiz.data) return <p role="alert">Could not load the quiz.</p>;

  const showResult = result.data && !retaking;
  return (
    <>
      <h1 className="text-2xl font-bold">Career discovery</h1>
      {showResult ? (
        <Results onRetake={() => setRetaking(true)} />
      ) : (
        <>
          <p className="mt-2 text-slate-600 dark:text-slate-300">
            Answer a few questions about your interests and strengths. We combine them with your
            profile to suggest three domains that fit you.
          </p>
          <div className="mt-8">
            <QuizForm
              key={retaking ? "retake" : "first"}
              quiz={quiz.data}
              onDone={() => setRetaking(false)}
            />
          </div>
        </>
      )}
    </>
  );
}

function Results({ onRetake }: { onRetake: () => void }) {
  const router = useRouter();
  const { data: result } = useDiscoveryResult();
  const domains = useDomains();
  const profile = useProfile();
  const select = useSelectDomain();
  if (!result) return null;
  const nameOf = (slug: string) => domains.data?.find((d) => d.slug === slug);

  return (
    <>
      <p className="mt-3 text-slate-700 dark:text-slate-200">{result.summary}</p>
      <div className="mt-4">
        <AiNotice>
          These are suggestions based on your answers and profile, not a verdict. You can pick any
          domain, and switch later.
        </AiNotice>
      </div>
      <ol className="mt-6 space-y-4">
        {result.recommendations.map((r, i) => {
          const domain = nameOf(r.slug);
          const isActive = profile.data?.activeDomain === r.slug;
          return (
            <li
              key={r.slug}
              className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">
                  {i + 1}. {domain?.name ?? r.slug}
                </h2>
                <span className="text-sm text-slate-500">Match {r.matchScore}/100</span>
              </div>
              <p className="mt-2 text-sm">{r.reason}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.strengths.map((s) => (
                  <li
                    key={s}
                    className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
                  >
                    {s}
                  </li>
                ))}
              </ul>
              <div className="mt-3">
                <SafetyNotice text={domain?.safetyNotice} />
              </div>
              <div className="mt-3">
                {isActive ? (
                  <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                    Your current domain
                  </span>
                ) : (
                  <button
                    className={primaryButton}
                    disabled={select.isPending}
                    onClick={() =>
                      select.mutate(r.slug, { onSuccess: () => router.push("/skill-gap") })
                    }
                  >
                    Choose {domain?.name ?? r.slug}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-6">
        <button className={secondaryButton} onClick={onRetake}>
          Retake the quiz
        </button>
      </div>
    </>
  );
}
