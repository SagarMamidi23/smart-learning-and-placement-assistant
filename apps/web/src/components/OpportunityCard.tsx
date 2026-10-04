import type { MatchDto, OpportunityDto } from "@slp/shared";
import { primaryButton } from "./ui";

const TYPE_LABEL: Record<string, string> = {
  job: "Job",
  exam: "Exam",
  internship: "Internship",
  fellowship: "Fellowship",
  apprenticeship: "Apprenticeship",
};
export const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/** "Closes 12 Dec 2026 (in 5 days)", "Closed 12 Dec 2026", or an honest note when there is no fixed date. */
export function deadlineText(o: Pick<OpportunityDto, "deadline" | "daysLeft">): string {
  if (!o.deadline || o.daysLeft === null)
    return "Dates change every year: check the official notice";
  const d = fmt(o.deadline);
  if (o.daysLeft < 0) return `Closed ${d}`;
  if (o.daysLeft === 0) return `Closes today (${d})`;
  return `Closes ${d} (in ${o.daysLeft} day${o.daysLeft === 1 ? "" : "s"})`;
}

export function OpportunityCard({
  opportunity: o,
  match,
  onTrack,
  tracking,
}: {
  opportunity: OpportunityDto;
  match?: MatchDto;
  /** Called with the opportunity id; omit to hide the button. */
  onTrack?: (id: string) => void;
  tracking?: boolean;
}) {
  const tracked = match?.application;
  return (
    <article
      className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
      aria-label={o.title}
    >
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="text-base font-semibold">{o.title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
          {typeLabel(o.type)}
        </span>
        {match && (
          <span
            className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-sm font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
            title="How closely this matches your profile. A guide for ranking, not a prediction of success."
          >
            {match.match}% match
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {o.organisation} · {o.location}
      </p>
      <p className="mt-1 text-sm">{deadlineText(o)}</p>
      {match?.reason && <p className="mt-3 text-sm">{match.reason}</p>}
      {match?.caution && (
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          <span className="font-medium">Check: </span>
          {match.caution}
        </p>
      )}
      {!match && <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{o.description}</p>}
      {o.eligibility && !match && (
        <p className="mt-2 text-sm">
          <span className="font-medium">Eligibility: </span>
          {o.eligibility}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={o.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-indigo-600 underline dark:text-indigo-400"
        >
          Official page<span className="sr-only"> for {o.title} (opens in a new tab)</span>
        </a>
        {tracked ? (
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Tracking: {tracked.status}
          </span>
        ) : (
          onTrack && (
            <button
              className={`${primaryButton} !px-3 !py-1 text-sm`}
              onClick={() => onTrack(o.id)}
              disabled={tracking}
              aria-label={`Track ${o.title}`}
            >
              Track
            </button>
          )
        )}
      </div>
    </article>
  );
}
