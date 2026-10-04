"use client";

import { useEffect, useState } from "react";
import type { AttemptDto, QuestionResultDto } from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useSubmitAttempt } from "@/lib/evalHooks";
import { ProgressBar } from "./AiNotice";
import { ErrorAlert, inputClass, primaryButton } from "./ui";

type Answer = { selected?: number; text?: string };

export const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

/** Counts down for the student's reference. It is not enforced: the server just records how long it took. */
function Timer({ startedAt, limitMinutes }: { startedAt: string; limitMinutes: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = limitMinutes * 60 - Math.floor((now - new Date(startedAt).getTime()) / 1000);
  return (
    <p
      role="timer"
      className={`text-sm ${left < 0 ? "text-red-700 dark:text-red-300" : "text-slate-600 dark:text-slate-300"}`}
    >
      {left >= 0
        ? `Suggested time left: ${formatDuration(left)}`
        : `Over the suggested time by ${formatDuration(-left)}`}
    </p>
  );
}

export function AssessmentTaker({ attempt }: { attempt: AttemptDto }) {
  const submit = useSubmitAttempt();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [done, setDone] = useState<AttemptDto | null>(
    attempt.status === "submitted" ? attempt : null,
  );
  const [error, setError] = useState<string>();

  const answered = attempt.questions.filter((q) => {
    const a = answers[q.id];
    return q.kind === "mcq" ? a?.selected !== undefined : Boolean(a?.text?.trim());
  }).length;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const missing = attempt.questions.length - answered;
    if (
      missing > 0 &&
      !window.confirm(`${missing} question(s) are unanswered and will score zero. Submit anyway?`)
    ) {
      return;
    }
    setError(undefined);
    try {
      const result = await submit.mutateAsync({
        attemptId: attempt.id,
        answers: Object.entries(answers).map(([questionId, a]) => ({ questionId, ...a })),
      });
      setDone(result);
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit. Please try again.");
    }
  }

  if (done) return <Results attempt={done} />;

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Timer startedAt={attempt.startedAt} limitMinutes={attempt.timeLimitMinutes} />
        <p role="status" className="text-sm text-slate-500">
          {answered} of {attempt.questions.length} answered
        </p>
      </div>
      <ol className="space-y-8">
        {attempt.questions.map((q, i) => (
          <li key={q.id}>
            {q.kind === "mcq" ? (
              <fieldset>
                <legend className="font-medium">
                  {i + 1}. {q.prompt}
                </legend>
                <div className="mt-2 flex flex-col gap-2">
                  {q.options.map((o, idx) => (
                    <label key={idx} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name={q.id}
                        className="mt-1"
                        checked={answers[q.id]?.selected === idx}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: { selected: idx } }))}
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div>
                <label htmlFor={q.id} className="block font-medium">
                  {i + 1}. {q.prompt}{" "}
                  <span className="text-sm font-normal text-slate-500">
                    ({q.maxMarks} marks, written answer)
                  </span>
                </label>
                <textarea
                  id={q.id}
                  rows={6}
                  maxLength={4000}
                  className={inputClass}
                  value={answers[q.id]?.text ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value } }))}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      <ErrorAlert message={error} />
      <button className={primaryButton} disabled={submit.isPending}>
        {submit.isPending ? "Submitting…" : "Submit answers"}
      </button>
      {submit.isPending && (
        <span role="status" className="ml-3 text-sm text-slate-500">
          Written answers are graded by AI, which can take up to a minute.
        </span>
      )}
    </form>
  );
}

function Mark({ r }: { r: QuestionResultDto }) {
  if (r.kind === "mcq") {
    return r.correct ? (
      <span className="text-green-700 dark:text-green-400">✔ Correct</span>
    ) : (
      <span className="text-red-700 dark:text-red-300">
        ✘ {r.selected === undefined ? "Not answered" : "Incorrect"}
      </span>
    );
  }
  return (
    <span
      className={
        r.awarded >= r.max * 0.6
          ? "text-green-700 dark:text-green-400"
          : "text-amber-700 dark:text-amber-300"
      }
    >
      {r.awarded} / {r.max} marks
    </span>
  );
}

export function Results({ attempt }: { attempt: AttemptDto }) {
  const results = attempt.results ?? [];
  return (
    <div className="space-y-6">
      <section aria-labelledby="score-h">
        <h2 id="score-h" className="text-xl font-semibold">
          Your score: {attempt.score}%
        </h2>
        <div className="mt-2 max-w-md">
          <ProgressBar value={attempt.score ?? 0} label="Score" />
        </div>
        {attempt.timeTakenSec !== undefined && (
          <p className="mt-2 text-sm text-slate-500">
            Time taken: {formatDuration(attempt.timeTakenSec)}
          </p>
        )}
      </section>
      <ol className="space-y-4">
        {results.map((r, i) => (
          <li
            key={r.questionId}
            className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
          >
            <p className="font-medium">
              {i + 1}. {r.prompt}
            </p>
            <p className="mt-1 text-sm font-medium">
              <Mark r={r} />
            </p>
            {r.kind === "mcq" ? (
              <ul className="mt-2 space-y-1 text-sm">
                {r.options!.map((o, idx) => (
                  <li
                    key={idx}
                    className={
                      idx === r.correctIndex
                        ? "font-medium text-green-700 dark:text-green-400"
                        : idx === r.selected
                          ? "text-red-700 dark:text-red-300"
                          : ""
                    }
                  >
                    {idx === r.correctIndex ? "✔ " : idx === r.selected ? "✘ " : "• "}
                    {o}
                    {idx === r.selected && idx !== r.correctIndex ? " (your answer)" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                <p>
                  <span className="font-medium">Your answer: </span>
                  {r.answerText || <em>none</em>}
                </p>
                {r.feedback && (
                  <p>
                    <span className="font-medium">Feedback: </span>
                    {r.feedback}
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
                    Key points a strong answer covers
                  </summary>
                  <p className="mt-1 whitespace-pre-wrap">{r.modelAnswer}</p>
                </details>
              </div>
            )}
            {r.explanation && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{r.explanation}</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
