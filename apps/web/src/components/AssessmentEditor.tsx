"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { assessmentContentSchema, type Question } from "@slp/shared";
import { ApiError } from "@/lib/api";
import { useAssessmentActions, type AdminAssessment } from "@/lib/evalHooks";
import { ErrorAlert, Field, inputClass, primaryButton, secondaryButton } from "./ui";

/** Turns a Zod issue into a sentence that names the question, for the reviewer. */
export function describeProblem(path: (string | number)[], message: string) {
  const q = path[0] === "questions" && typeof path[1] === "number" ? `Question ${path[1] + 1}` : "";
  const field = path.slice(q ? 2 : 0).join(" › ");
  return `${[q, field].filter(Boolean).join(" › ") || "Assessment"}: ${message}`;
}

export function AssessmentEditor({ assessment }: { assessment: AdminAssessment }) {
  const router = useRouter();
  const actions = useAssessmentActions(assessment.id);
  const locked = assessment.status === "published";
  const [title, setTitle] = useState(assessment.title);
  const [minutes, setMinutes] = useState(assessment.timeLimitMinutes);
  const [questions, setQuestions] = useState<Question[]>(assessment.questions);
  const [problems, setProblems] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();

  const patch = (i: number, change: Partial<Question>) =>
    setQuestions((qs) => qs.map((q, j) => (j === i ? ({ ...q, ...change } as Question) : q)));

  function content() {
    return { title, type: assessment.type as never, timeLimitMinutes: minutes, questions };
  }

  function validate() {
    const r = assessmentContentSchema.safeParse(content());
    if (r.success) {
      setProblems([]);
      return r.data;
    }
    setProblems(r.error.issues.map((i) => describeProblem(i.path, i.message)));
    return null;
  }

  async function run(fn: () => Promise<unknown>, ok: string) {
    setMessage(undefined);
    try {
      await fn();
      setMessage({ kind: "ok", text: ok });
      return true;
    } catch (e) {
      setMessage({
        kind: "error",
        text: e instanceof ApiError ? e.message : "Something went wrong.",
      });
      return false;
    }
  }

  async function save() {
    const data = validate();
    if (data) await run(() => actions.save.mutateAsync(data), "Draft saved.");
  }

  async function publish() {
    const data = validate();
    if (!data) return;
    // Publishing uses what is stored, so save the reviewer's latest edits first.
    if (await run(() => actions.save.mutateAsync(data), "Draft saved.")) {
      await run(
        () => actions.publish.mutateAsync(),
        "Published. Students in this domain can now take it.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md bg-slate-100 p-3 text-sm dark:bg-slate-900">
        {locked ? "Published" : "Draft"} · {assessment.type}
        {assessment.grounded
          ? ` · written from study material (${assessment.groundedOn.join(", ")})`
          : " · written from the skill list only, so check the facts carefully"}
        {assessment.llm ? ` · model ${assessment.llm}` : ""}
      </div>

      {locked && (
        <p
          role="status"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          Published assessments are read-only. To change one, duplicate it into a new draft.
        </p>
      )}

      {problems.length > 0 && (
        <div
          role="alert"
          className="rounded-md bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p className="font-medium">Please fix:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="title"
          label="Title"
          value={title}
          disabled={locked}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Field
          id="minutes"
          type="number"
          label="Suggested time (minutes)"
          value={minutes}
          disabled={locked}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
      </div>

      <ol className="space-y-6">
        {questions.map((q, i) => (
          <li key={q.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                Question {i + 1} (
                {q.kind === "mcq" ? "multiple choice" : `written, ${q.maxMarks} marks`})
                {q.skill ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">{q.skill}</span>
                ) : null}
              </h2>
              {!locked && (
                <button
                  type="button"
                  className={secondaryButton}
                  onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                >
                  Delete
                </button>
              )}
            </div>
            <label htmlFor={`prompt-${i}`} className="mt-3 block text-sm font-medium">
              Question
            </label>
            <textarea
              id={`prompt-${i}`}
              rows={3}
              disabled={locked}
              className={inputClass}
              value={q.prompt}
              onChange={(e) => patch(i, { prompt: e.target.value })}
            />

            {q.kind === "mcq" ? (
              <fieldset className="mt-3" disabled={locked}>
                <legend className="text-sm font-medium">Options (select the correct one)</legend>
                {q.options.map((o, idx) => (
                  <div key={idx} className="mt-2 flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      aria-label={`Option ${idx + 1} is correct`}
                      checked={q.correctIndex === idx}
                      onChange={() => patch(i, { correctIndex: idx })}
                    />
                    <input
                      aria-label={`Question ${i + 1} option ${idx + 1}`}
                      className={inputClass}
                      value={o}
                      onChange={(e) =>
                        patch(i, {
                          options: q.options.map((x, k) => (k === idx ? e.target.value : x)),
                        })
                      }
                    />
                  </div>
                ))}
              </fieldset>
            ) : (
              <>
                <label htmlFor={`model-${i}`} className="mt-3 block text-sm font-medium">
                  Key points a strong answer must cover (used for grading, hidden from students)
                </label>
                <textarea
                  id={`model-${i}`}
                  rows={4}
                  disabled={locked}
                  className={inputClass}
                  value={q.modelAnswer}
                  onChange={(e) => patch(i, { modelAnswer: e.target.value })}
                />
              </>
            )}

            <label htmlFor={`exp-${i}`} className="mt-3 block text-sm font-medium">
              Explanation (shown after submitting)
            </label>
            <textarea
              id={`exp-${i}`}
              rows={2}
              disabled={locked}
              className={inputClass}
              value={q.explanation}
              onChange={(e) => patch(i, { explanation: e.target.value })}
            />
          </li>
        ))}
      </ol>

      <ErrorAlert message={message?.kind === "error" ? message.text : undefined} />
      {message?.kind === "ok" && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {!locked ? (
          <>
            <button className={secondaryButton} onClick={save} disabled={actions.save.isPending}>
              Save draft
            </button>
            <button
              className={primaryButton}
              onClick={publish}
              disabled={actions.save.isPending || actions.publish.isPending}
            >
              Publish
            </button>
            <button
              className={secondaryButton}
              onClick={async () => {
                if (
                  window.confirm("Delete this draft?") &&
                  (await run(() => actions.remove.mutateAsync(), "Deleted."))
                ) {
                  router.push("/admin/assessments");
                }
              }}
            >
              Delete draft
            </button>
          </>
        ) : (
          <>
            <button
              className={secondaryButton}
              onClick={() => run(() => actions.unpublish.mutateAsync(), "Moved back to draft.")}
            >
              Unpublish
            </button>
            <button
              className={primaryButton}
              onClick={async () => {
                if (await run(() => actions.duplicate.mutateAsync(), "Copied to a new draft.")) {
                  router.push("/admin/assessments");
                }
              }}
            >
              Duplicate as draft
            </button>
          </>
        )}
      </div>
    </div>
  );
}
