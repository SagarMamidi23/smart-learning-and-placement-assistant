"use client";

import type { LearningPathDto } from "@slp/shared";
import { useToggleGoal } from "@/lib/aiHooks";
import { AiNotice, ProgressBar } from "./AiNotice";

const STATUS_LABEL = { "not-started": "Not started", "in-progress": "In progress", done: "Done" };

const TYPE_LABEL = {
  course: "Course",
  book: "Book",
  practice: "Practice",
  video: "Video",
  article: "Article",
  project: "Project",
};

export function LearningPathView({ path }: { path: LearningPathDto }) {
  const toggle = useToggleGoal();
  return (
    <div className="space-y-6">
      <ProgressBar value={path.completionPct} label="Plan progress" />
      <AiNotice>
        Resource titles are AI suggestions and may be inexact. Search for the topic and check the
        source before relying on it. Prefer your official syllabus where one exists.
      </AiNotice>
      <ol className="space-y-3">
        {path.weeks.map((w) => (
          <li key={w.week}>
            <details
              className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
              open={
                w.status !== "done" &&
                w.week === (path.weeks.find((x) => x.status !== "done")?.week ?? 1)
              }
            >
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="font-semibold">
                  Week {w.week}: {w.title}
                </span>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                  {STATUS_LABEL[w.status]}
                </span>
              </summary>
              <fieldset className="mt-3">
                <legend className="text-sm font-medium">Goals</legend>
                <ul className="mt-1 space-y-1">
                  {w.goals.map((g, i) => (
                    <li key={i}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={g.done}
                          onChange={(e) =>
                            toggle.mutate({ week: w.week, goalIndex: i, done: e.target.checked })
                          }
                        />
                        <span className={g.done ? "text-slate-500 line-through" : ""}>
                          {g.text}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
              <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <h3 className="font-medium">Topics</h3>
                  <ul className="mt-1 list-disc pl-5">
                    {w.topics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="font-medium">Suggested resources</h3>
                  <ul className="mt-1 list-disc pl-5">
                    {w.resources.map((r) => (
                      <li key={r.title}>
                        {r.title} <span className="text-slate-500">({TYPE_LABEL[r.type]})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {w.focusSkills.length > 0 && (
                <p className="mt-3 text-xs text-slate-500">Focus: {w.focusSkills.join(", ")}</p>
              )}
            </details>
          </li>
        ))}
      </ol>
      {toggle.isError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          Could not save that change. Please try again.
        </p>
      )}
    </div>
  );
}
