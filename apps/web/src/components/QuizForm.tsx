"use client";

import { useState } from "react";
import type { QuizDefinition, QuizQuestion } from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useSubmitQuiz } from "@/lib/aiHooks";
import { ErrorAlert, inputClass, primaryButton } from "./ui";

type Answers = Record<string, string | number>;

const SCALE = ["Strongly disagree", "Disagree", "Neutral", "Agree", "Strongly agree"];

/** Required questions that still have no answer, in quiz order. */
export const unanswered = (quiz: QuizDefinition, answers: Answers) =>
  quiz.questions.filter((q) => q.required && (answers[q.id] === undefined || answers[q.id] === ""));

function Question({
  q,
  value,
  error,
  onChange,
}: {
  q: QuizQuestion;
  value: string | number | undefined;
  error?: string;
  onChange: (v: string | number) => void;
}) {
  const errId = `${q.id}-error`;
  if (q.type === "text") {
    return (
      <div>
        <label htmlFor={q.id} className="block text-sm font-medium">
          {q.text}
        </label>
        <textarea
          id={q.id}
          rows={3}
          maxLength={600}
          className={inputClass}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }
  const options =
    q.type === "likert"
      ? SCALE.map((label, i) => ({ value: i + 1, label }))
      : (q.options ?? []).map((o) => ({ value: o.value, label: o.label }));
  return (
    <fieldset aria-describedby={error ? errId : undefined}>
      <legend className="text-sm font-medium">{q.text}</legend>
      <div
        className={
          q.type === "likert" ? "mt-2 flex flex-wrap gap-x-5 gap-y-2" : "mt-2 flex flex-col gap-2"
        }
      >
        {options.map((o) => (
          <label key={String(o.value)} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={q.id}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errId} className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function QuizForm({ quiz, onDone }: { quiz: QuizDefinition; onDone?: () => void }) {
  const submit = useSubmitQuiz();
  const [answers, setAnswers] = useState<Answers>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [serverError, setServerError] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(undefined);
    const todo = unanswered(quiz, answers);
    if (todo.length) {
      setMissing(new Set(todo.map((q) => q.id)));
      document.getElementById(`${todo[0].id}-error`)?.scrollIntoView({ block: "center" });
      return;
    }
    setMissing(new Set());
    try {
      await submit.mutateAsync(answers);
      onDone?.();
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

  const answered = quiz.questions.filter((q) => q.required && answers[q.id] !== undefined).length;
  const required = quiz.questions.filter((q) => q.required).length;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-8">
      <p className="text-sm text-slate-500" role="status">
        {answered} of {required} required questions answered
      </p>
      {quiz.questions.map((q) => (
        <Question
          key={q.id}
          q={q}
          value={answers[q.id]}
          error={missing.has(q.id) ? "Please answer this question" : undefined}
          onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
        />
      ))}
      <ErrorAlert message={serverError} />
      <button type="submit" className={primaryButton} disabled={submit.isPending}>
        {submit.isPending ? "Analysing your answers…" : "Get my recommendations"}
      </button>
      {submit.isPending && (
        <p role="status" className="text-sm text-slate-500">
          This usually takes a few seconds, but can take up to a minute when the AI service is busy.
        </p>
      )}
    </form>
  );
}
