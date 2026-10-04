"use client";

import Link from "next/link";
import { useState } from "react";
import type { AlertDto, LearningPathDto, ReadinessResultDto } from "@slp/shared";
import { AppShell } from "@/components/AppShell";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { ChatIcon, ChevronDownIcon, ClockIcon } from "@/components/icons";
import { primaryButton, secondaryButton } from "@/components/ui";
import { useDomain, useMe } from "@/lib/hooks";
import { type JourneyStep, nextActionFor, relativeDays, useJourney } from "@/lib/journey";

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const card = "flex flex-col gap-3 rounded-md bg-surface p-5 shadow-card";
const cardLink = `${card} text-ink no-underline transition-[box-shadow,transform] duration-200 hover:-translate-y-px hover:shadow-raised`;

function Dashboard() {
  const me = useMe();
  const j = useJourney();
  const domain = useDomain(j.profile?.activeDomain ?? "");
  const [allSteps, setAllSteps] = useState(false);

  if (j.loading) return <p role="status">Loading…</p>;

  const firstName = me.data?.name.split(" ")[0] ?? "";
  const next = j.nextIndex >= 0 ? j.steps[j.nextIndex] : undefined;
  const total = j.steps.length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-rule pb-5">
        <div>
          <div className="kicker text-muted">{domain.data?.name ?? "No domain chosen yet"}</div>
          <h1 className="mt-1.5 text-[28px] leading-tight font-extrabold tracking-tight lg:text-[34px]">
            {greeting()}, {firstName}
          </h1>
        </div>
        <Link href="/mentor" className={`${secondaryButton} hidden no-underline sm:inline-flex`}>
          <ChatIcon size={16} />
          Ask the mentor
        </Link>
      </header>

      {j.alerts.length > 0 && <DeadlineBanner alerts={j.alerts} />}

      <section aria-labelledby="steps-h" className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="steps-h" className="text-lg font-extrabold lg:text-xl">
            Your next steps
          </h2>
          <span className="text-[13px] text-muted">
            {j.doneCount} of {total} done
            <span className="hidden lg:inline"> · steps stay open in any order</span>
          </span>
        </div>

        {/* Mobile: one segment per step, with the full list behind a toggle. */}
        <div aria-hidden className="grid grid-cols-9 gap-[3px] lg:hidden">
          {j.steps.map((s, i) => (
            <span
              key={s.key}
              className={`h-1.5 rounded-[2px] ${i === j.nextIndex ? "outline-2 outline-offset-1 outline-accent" : ""}`}
              style={{ background: barFill(s, i === j.nextIndex) }}
            />
          ))}
        </div>

        <ol
          id="all-steps"
          className={`${allSteps ? "flex" : "hidden"} flex-col gap-1 lg:grid lg:grid-cols-9 lg:gap-1.5`}
        >
          {j.steps.map((s, i) => (
            <StepCell key={s.key} step={s} index={i} isNext={i === j.nextIndex} />
          ))}
        </ol>

        {next ? (
          <NextActionCard step={next} index={j.nextIndex} total={total} />
        ) : (
          <div className={`${card} lg:p-7`}>
            <div className="kicker text-success">All {total} steps done</div>
            <h3 className="text-xl font-extrabold lg:text-2xl">You have reached your target</h3>
            <p className="max-w-[62ch] text-muted">
              Keep your readiness current as you learn, and confirm every date on the official page
              before you apply.
            </p>
          </div>
        )}

        <button
          aria-expanded={allSteps}
          aria-controls="all-steps"
          onClick={() => setAllSteps((o) => !o)}
          className="flex min-h-11 items-center justify-between border-b border-line px-1 text-left text-sm font-semibold lg:hidden"
        >
          {allSteps ? "Hide the steps" : `See all ${total} steps`}
          <ChevronDownIcon size={18} className={allSteps ? "rotate-180" : ""} />
        </button>
      </section>

      <div className="grid gap-5 border-t-2 border-rule pt-6 lg:grid-cols-3">
        <ReadinessCard r={j.readiness} />
        <PathCard path={j.path} />
        <ComingUpCard alerts={j.alerts} />
      </div>
    </div>
  );
}

/** Done steps fill, the learning path fills to its percentage, the next step is a soft tint, the rest are empty. */
function barFill(s: JourneyStep, isNext: boolean) {
  if (s.progress !== undefined && s.progress < 100) {
    return `linear-gradient(90deg, var(--accent) 0 ${s.progress}%, var(--accent-soft) ${s.progress}%)`;
  }
  if (s.done) return "var(--accent)";
  return isNext ? "var(--accent-soft)" : "var(--surface-2)";
}

function StepCell({ step, index, isNext }: { step: JourneyStep; index: number; isNext: boolean }) {
  const n = String(index + 1).padStart(2, "0");
  const status = isNext ? "Up next" : step.status || (step.done ? "Done" : "To do");
  return (
    <li>
      <Link
        href={step.href}
        aria-current={isNext ? "step" : undefined}
        className={`flex h-full items-center gap-3 rounded-sm px-2 py-2.5 text-ink no-underline lg:flex-col lg:items-stretch lg:gap-1.5 ${
          isNext ? "bg-surface shadow-[inset_0_0_0_2px_var(--accent)]" : "hover:bg-surface-2"
        }`}
      >
        <span
          aria-hidden
          className="h-1.5 w-8 shrink-0 rounded-[2px] lg:w-auto"
          style={{ background: barFill(step, isNext) }}
        />
        <span
          className={`text-[11px] font-semibold tabular-nums ${isNext ? "text-accent" : "text-muted"}`}
        >
          {n} · {status}
          <span className="sr-only">{step.done ? " (done)" : ""}</span>
        </span>
        <span className="text-[13px] leading-tight font-semibold">{step.name}</span>
      </Link>
    </li>
  );
}

function NextActionCard({
  step,
  index,
  total,
}: {
  step: JourneyStep;
  index: number;
  total: number;
}) {
  const a = nextActionFor(step.key);
  return (
    <div className="grid items-center gap-4 rounded-md bg-surface p-5 shadow-card lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-8 lg:px-7 lg:py-6">
      <div>
        <div className="kicker text-accent">
          Next best action · Step {index + 1} of {total}
        </div>
        <h3 className="mt-2 mb-1.5 text-[21px] leading-tight font-extrabold tracking-tight lg:text-2xl">
          {a.title}
        </h3>
        <p className="max-w-[62ch] text-sm text-pretty text-muted lg:text-[15px]">{a.reason}</p>
      </div>
      <Link
        href={step.href}
        className={`${primaryButton} min-h-12 justify-between px-[18px] text-[15px] no-underline lg:min-w-[230px]`}
      >
        {a.action}
        <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function DeadlineBanner({ alerts }: { alerts: AlertDto[] }) {
  const [first, second] = alerts;
  return (
    <Link
      href="/applications"
      className="flex items-start gap-3.5 rounded-md bg-warn-soft px-4 py-3 text-sm leading-snug text-warn-ink no-underline lg:items-center"
    >
      <ClockIcon size={18} className="mt-px shrink-0 lg:mt-0" />
      <span className="flex-1">
        <strong>{alerts.length} coming up.</strong> {first.opportunityTitle}: {first.message}{" "}
        <span className="rounded-sm bg-danger-soft px-1.5 font-semibold text-danger-ink">
          {relativeDays(first.daysLeft).toLowerCase()}
        </span>
        {second && (
          <span className="hidden sm:inline">
            {" "}
            · {second.opportunityTitle}: {second.message} (
            {relativeDays(second.daysLeft).toLowerCase()})
          </span>
        )}
      </span>
      <span className="font-semibold whitespace-nowrap">
        <span className="hidden sm:inline">Open tracker </span>→
      </span>
    </Link>
  );
}

function ReadinessCard({ r }: { r: ReadinessResultDto | null | undefined }) {
  if (!r) {
    return (
      <Link href="/readiness" className={cardLink}>
        <div className="kicker text-muted">Career readiness</div>
        <p className="text-sm text-pretty">
          Not calculated yet. It combines your assessments, mock evaluations, learning progress and
          activity into one score against your domain&apos;s target.
        </p>
        <span className="mt-auto text-sm font-semibold text-accent">Calculate it →</span>
      </Link>
    );
  }
  const gap = Math.round(r.target - r.score);
  return (
    <Link
      href="/readiness"
      className={`${cardLink} max-lg:grid max-lg:grid-cols-[150px_minmax(0,1fr)] max-lg:items-center max-lg:gap-3.5`}
    >
      <div className="kicker text-muted max-lg:hidden">Career readiness</div>
      <div className="flex justify-center pt-1.5">
        <ReadinessGauge score={r.score} target={r.target} size={220} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="kicker text-muted lg:hidden">Readiness</div>
        <p className="text-sm text-pretty">
          {gap > 0 ? (
            <>
              <strong>
                {gap} point{gap === 1 ? "" : "s"} below
              </strong>{" "}
              your domain&apos;s target.
            </>
          ) : (
            <strong>At or above your domain&apos;s target.</strong>
          )}{" "}
          Last checked{" "}
          {new Date(r.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}.
        </p>
        <span className="text-sm font-semibold text-accent">What moved it →</span>
      </div>
    </Link>
  );
}

function PathCard({ path }: { path: LearningPathDto | null | undefined }) {
  if (!path) {
    return (
      <Link href="/learning-path" className={cardLink}>
        <div className="kicker text-muted">Learning path</div>
        <p className="text-sm text-pretty">
          No path yet. Generate a week-by-week plan from your skill gaps.
        </p>
        <span className="mt-auto text-sm font-semibold text-accent">Build my path →</span>
      </Link>
    );
  }
  const current = path.weeks.find((w) => w.status !== "done") ?? path.weeks[path.weeks.length - 1];
  const pct = Math.round(path.completionPct);
  const goalsDone = current?.goals.filter((g) => g.done).length ?? 0;
  return (
    <Link href="/learning-path" className={cardLink}>
      <div className="kicker text-muted">Learning path</div>
      {current && (
        <div className="flex items-baseline gap-2">
          <span className="text-[32px] leading-none font-extrabold tracking-tight">
            Week {current.week}
          </span>
          <span className="text-sm text-muted">of {path.weeks.length}</span>
        </div>
      )}
      <div>
        <div className="mb-1.5 flex justify-between text-[13px]">
          <span>Path progress</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Learning path progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {current && (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-xs text-muted">
            This week · {goalsDone} of {current.goals.length} goals
          </span>
          <span className="text-[15px] font-semibold">{current.title}</span>
        </div>
      )}
      <span className="mt-auto text-sm font-semibold text-accent">
        {current ? `Continue week ${current.week} →` : "Open my path →"}
      </span>
    </Link>
  );
}

function ComingUpCard({ alerts }: { alerts: AlertDto[] }) {
  return (
    <div className={card}>
      <div className="kicker text-muted">Coming up</div>
      {alerts.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing due. Track an opportunity and its deadlines will appear here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {alerts.slice(0, 3).map((a, i) => {
            const d = new Date(a.date);
            const tone =
              a.daysLeft <= 3
                ? "bg-danger-soft text-danger-ink"
                : a.daysLeft <= 7
                  ? "bg-warn-soft text-warn-ink"
                  : "bg-surface-2 text-muted";
            const textTone =
              a.daysLeft <= 3
                ? "text-danger-ink"
                : a.daysLeft <= 7
                  ? "text-warn-ink"
                  : "text-muted";
            return (
              <li
                key={`${a.applicationId}-${a.kind}-${a.date}`}
                className={`grid grid-cols-[44px_minmax(0,1fr)] gap-3 py-2.5 ${i < Math.min(alerts.length, 3) - 1 ? "border-b border-line" : ""}`}
              >
                <span
                  className={`flex h-11 flex-col items-center justify-center rounded-sm leading-none ${tone}`}
                >
                  <span className="text-base font-extrabold">{d.getDate()}</span>
                  <span className="text-[10px] font-semibold uppercase">
                    {d.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </span>
                <span className="flex flex-col gap-0.5 text-sm">
                  <strong className="font-semibold">
                    {a.opportunityTitle} · {a.message}
                  </strong>
                  <span className={`text-xs font-semibold ${textTone}`}>
                    {relativeDays(a.daysLeft)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/applications" className="mt-auto text-sm font-semibold text-accent no-underline">
        All applications →
      </Link>
    </div>
  );
}
