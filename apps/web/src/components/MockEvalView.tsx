"use client";

import { useState } from "react";
import type { MockEvalDto } from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useSubmitMockEval } from "@/lib/evalHooks";
import { AiNotice, ProgressBar } from "./AiNotice";
import { ErrorAlert, inputClass, primaryButton } from "./ui";

export function MockEvalForm({ evaluation }: { evaluation: MockEvalDto }) {
  const submit = useSubmitMockEval(evaluation.id);
  const [text, setText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const interview = evaluation.type === "interview";
  const answered = evaluation.questions.filter((q) => text[q.id]?.trim()).length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    if (answered === 0) {
      setError("Answer at least one question before submitting.");
      return;
    }
    try {
      await submit.mutateAsync(
        evaluation.questions.map((q) => ({ questionId: q.id, text: text[q.id] ?? "" })),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not score your answers. Please try again.",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <AiNotice>
        Your answers are scored by AI against this domain&apos;s rubric. Answer as you would{" "}
        {interview ? "in a real interview" : "in a real task"}, in full sentences. Skipped questions
        lower your score.
      </AiNotice>
      <p role="status" className="text-sm text-slate-500">
        {answered} of {evaluation.questions.length} answered
      </p>
      <ol className="space-y-6">
        {evaluation.questions.map((q, i) => (
          <li key={q.id}>
            <label htmlFor={q.id} className="block font-medium">
              {i + 1}. {q.prompt}
            </label>
            {q.focus && <p className="text-xs text-slate-500">Tests: {q.focus}</p>}
            <textarea
              id={q.id}
              rows={7}
              maxLength={4000}
              className={inputClass}
              value={text[q.id] ?? ""}
              onChange={(e) => setText((t) => ({ ...t, [q.id]: e.target.value }))}
            />
          </li>
        ))}
      </ol>
      <ErrorAlert message={error} />
      <button className={primaryButton} disabled={submit.isPending}>
        {submit.isPending ? "Scoring…" : "Submit for scoring"}
      </button>
      {submit.isPending && (
        <span role="status" className="ml-3 text-sm text-slate-500">
          This can take up to a minute.
        </span>
      )}
    </form>
  );
}

export function MockEvalResults({ evaluation }: { evaluation: MockEvalDto }) {
  const scores = evaluation.rubricScores ?? [];
  const answerOf = (id: string) => evaluation.answers?.find((a) => a.questionId === id)?.text;
  const feedbackOf = (id: string) =>
    evaluation.questionFeedback?.find((f) => f.questionId === id)?.feedback;
  return (
    <div className="space-y-8">
      <section aria-labelledby="overall-h">
        <h2 id="overall-h" className="text-xl font-semibold">
          Overall score: {evaluation.overallScore}/100
        </h2>
        <div className="mt-2 max-w-md">
          <ProgressBar value={evaluation.overallScore ?? 0} label="Overall" />
        </div>
        <p className="mt-3">{evaluation.feedback?.summary}</p>
      </section>

      <section aria-labelledby="rubric-h">
        <h2 id="rubric-h" className="text-lg font-semibold">
          Rubric breakdown
        </h2>
        <ul className="mt-3 space-y-4">
          {scores.map((s) => (
            <li key={s.criterion}>
              <ProgressBar
                value={s.score * 10}
                label={`${s.criterion} (weight ${Math.round(s.weight * 100)}%): ${s.score}/10`}
              />
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{s.comment}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="str-h">
          <h2 id="str-h" className="text-lg font-semibold">
            Strengths
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {evaluation.feedback?.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="imp-h">
          <h2 id="imp-h" className="text-lg font-semibold">
            To improve
          </h2>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {evaluation.feedback?.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="qs-h">
        <h2 id="qs-h" className="text-lg font-semibold">
          Question by question
        </h2>
        <ol className="mt-3 space-y-4">
          {evaluation.questions.map((q, i) => (
            <li
              key={q.id}
              className="rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800"
            >
              <p className="font-medium">
                {i + 1}. {q.prompt}
              </p>
              <p className="mt-2 whitespace-pre-wrap">
                <span className="font-medium">Your answer: </span>
                {answerOf(q.id)?.trim() || <em>skipped</em>}
              </p>
              {feedbackOf(q.id) && (
                <p className="mt-2 text-slate-600 dark:text-slate-300">
                  <span className="font-medium">Feedback: </span>
                  {feedbackOf(q.id)}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
