"use client";

import { useState } from "react";
import { APPLICATION_STATUSES, type AlertDto, type ApplicationDto } from "@slp/shared";
import type { ApplicationPatch } from "@/lib/opportunityHooks";
import { deadlineText, typeLabel } from "./OpportunityCard";
import { inputClass, secondaryButton } from "./ui";

const COLUMN_LABEL: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  offered: "Offered",
};
export const statusLabel = (s: string) => COLUMN_LABEL[s] ?? s;

/**
 * A board with one column per status. Cards move with a labelled "Status" control rather than drag and drop, so it works
 * with a keyboard and a screen reader and on a phone.
 */
export function ApplicationBoard({
  applications,
  onUpdate,
  onRemove,
  busy,
}: {
  applications: ApplicationDto[];
  onUpdate: (id: string, patch: ApplicationPatch) => void;
  onRemove: (id: string) => void;
  busy?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {APPLICATION_STATUSES.map((status) => {
        const items = applications.filter((a) => a.status === status);
        const headingId = `col-${status}`;
        return (
          <section key={status} aria-labelledby={headingId} className="min-w-0">
            <h2 id={headingId} className="text-sm font-semibold">
              {statusLabel(status)}{" "}
              <span className="font-normal text-slate-500">({items.length})</span>
            </h2>
            <ul className="mt-2 space-y-3">
              {items.map((a) => (
                <li key={a.id}>
                  <ApplicationCard
                    application={a}
                    onUpdate={onUpdate}
                    onRemove={onRemove}
                    busy={busy}
                  />
                </li>
              ))}
              {items.length === 0 && <li className="text-sm text-slate-500">Nothing here yet.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ApplicationCard({
  application: a,
  onUpdate,
  onRemove,
  busy,
}: {
  application: ApplicationDto;
  onUpdate: (id: string, patch: ApplicationPatch) => void;
  onRemove: (id: string) => void;
  busy?: boolean;
}) {
  const title = a.opportunity?.title ?? "Removed opportunity";
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(a.notes);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");

  const addReminder = () => {
    if (!label.trim() || !date) return;
    onUpdate(a.id, { deadlines: [...a.deadlines, { label: label.trim(), date }] });
    setLabel("");
    setDate("");
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <p className="font-medium">{title}</p>
      {a.opportunity && (
        <>
          <p className="text-slate-600 dark:text-slate-300">
            {typeLabel(a.opportunity.type)} · {a.opportunity.organisation}
          </p>
          <p className="mt-1">{deadlineText(a.opportunity)}</p>
        </>
      )}

      <label className="mt-2 block text-xs font-medium" htmlFor={`status-${a.id}`}>
        Status<span className="sr-only"> of {title}</span>
      </label>
      <select
        id={`status-${a.id}`}
        className={inputClass}
        value={a.status}
        disabled={busy}
        onChange={(e) => onUpdate(a.id, { status: e.target.value as ApplicationDto["status"] })}
      >
        {APPLICATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>

      <button
        className="mt-2 text-indigo-600 underline dark:text-indigo-400"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Hide details" : "Notes and reminders"}
        <span className="sr-only"> for {title}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          <div>
            <label className="block text-xs font-medium" htmlFor={`notes-${a.id}`}>
              Notes<span className="sr-only"> for {title}</span>
            </label>
            <textarea
              id={`notes-${a.id}`}
              className={inputClass}
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <button
              className={`${secondaryButton} mt-1 !px-3 !py-1`}
              disabled={busy || notes === a.notes}
              onClick={() => onUpdate(a.id, { notes })}
            >
              Save notes
            </button>
          </div>

          <div>
            <p className="text-xs font-medium">Your reminders</p>
            <ul className="mt-1 space-y-1">
              {a.deadlines.map((d, i) => (
                <li key={`${d.label}-${d.date}-${i}`} className="flex items-center gap-2">
                  <span>
                    {d.label}: {d.date}
                  </span>
                  <button
                    className="text-red-700 underline dark:text-red-300"
                    onClick={() =>
                      onUpdate(a.id, { deadlines: a.deadlines.filter((_, j) => j !== i) })
                    }
                    aria-label={`Remove reminder ${d.label}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 grid gap-2">
              <div>
                <label className="block text-xs" htmlFor={`rl-${a.id}`}>
                  Reminder name
                </label>
                <input
                  id={`rl-${a.id}`}
                  className={inputClass}
                  maxLength={80}
                  placeholder="Admit card, interview…"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs" htmlFor={`rd-${a.id}`}>
                  Reminder date
                </label>
                <input
                  id={`rd-${a.id}`}
                  type="date"
                  className={inputClass}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <button
                className={`${secondaryButton} !px-3 !py-1`}
                onClick={addReminder}
                disabled={busy || !label.trim() || !date || a.deadlines.length >= 10}
              >
                Add reminder
              </button>
            </div>
          </div>

          {a.history.length > 1 && (
            <p className="text-xs text-slate-500">
              History:{" "}
              {a.history.map((h) => `${statusLabel(h.status)} ${h.at.slice(0, 10)}`).join(" → ")}
            </p>
          )}
          <button
            className="text-red-700 underline dark:text-red-300"
            onClick={() => onRemove(a.id)}
            aria-label={`Stop tracking ${title}`}
          >
            Stop tracking
          </button>
        </div>
      )}
    </div>
  );
}

export function AlertsPanel({ alerts }: { alerts: AlertDto[] }) {
  if (alerts.length === 0) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        No deadlines in the next two weeks.
      </p>
    );
  }
  return (
    <ul className="space-y-2" aria-label="Upcoming deadlines">
      {alerts.map((a, i) => {
        const overdue = a.daysLeft < 0;
        const when = overdue
          ? `${-a.daysLeft} day${a.daysLeft === -1 ? "" : "s"} ago`
          : a.daysLeft === 0
            ? "today"
            : `in ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}`;
        return (
          <li
            key={`${a.applicationId}-${a.kind}-${a.date}-${i}`}
            className={`rounded-md p-3 text-sm ${
              overdue || a.daysLeft <= 3
                ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200"
                : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            <span className="font-medium">{a.opportunityTitle}</span>: {a.message}, {a.date} ({when}
            )
          </li>
        );
      })}
    </ul>
  );
}
