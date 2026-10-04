"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProgressBar } from "@/components/AiNotice";
import { useLearningPath, useSkillGap } from "@/lib/aiHooks";
import { ReadinessGauge } from "@/components/ReadinessGauge";
import { useAssessments, useMockEvals } from "@/lib/evalHooks";
import { useAlerts, useApplications } from "@/lib/opportunityHooks";
import { useReadiness } from "@/lib/readinessHooks";
import { useMe, useProfile } from "@/lib/hooks";

export default function DashboardPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}

function Dashboard() {
  const me = useMe();
  const profile = useProfile();
  const p = profile.data;
  const hasDomain = Boolean(p?.activeDomain);
  const report = useSkillGap(hasDomain);
  const path = useLearningPath(hasDomain);
  const assessments = useAssessments(hasDomain);
  const mocks = useMockEvals(hasDomain);
  const readiness = useReadiness(hasDomain);
  const applications = useApplications(hasDomain);
  const alerts = useAlerts(hasDomain);

  const steps = [
    {
      done: !!p && (p.skills.length > 0 || p.education.length > 0),
      label: "Complete your profile",
      href: "/profile",
    },
    { done: !!p?.hasResume, label: "Upload your resume (optional)", href: "/profile" },
    {
      done: !!p?.careerDiscoveryResult,
      label: "Take the career discovery quiz",
      href: "/discovery",
    },
    {
      done: hasDomain,
      label: p?.activeDomain ? `Your domain: ${p.activeDomain}` : "Choose a career domain",
      href: "/domains",
    },
    {
      done: !!report.data,
      label: report.data
        ? `Skill-gap report: ${report.data.coverage}% of the benchmark covered`
        : "Analyse your skill gaps",
      href: "/skill-gap",
    },
    {
      done: !!path.data,
      label: path.data ? "Your learning path" : "Generate your learning path",
      href: "/learning-path",
    },
    {
      done: !!assessments.data?.some((a) => (a.attempts ?? 0) > 0),
      label: "Take an assessment",
      href: "/assessments",
    },
    {
      done: !!mocks.data?.some((m) => m.status === "completed"),
      label: "Do a mock evaluation",
      href: "/mock-eval",
    },
    {
      done: !!readiness.data,
      label: readiness.data
        ? `Career readiness: ${Math.round(readiness.data.score)} of 100 (target ${readiness.data.target})`
        : "Check your career readiness",
      href: "/readiness",
    },
    {
      done: !!applications.data?.length,
      label: applications.data?.length
        ? `Tracking ${applications.data.length} opportunit${applications.data.length === 1 ? "y" : "ies"}`
        : "Find opportunities to track",
      href: applications.data?.length ? "/applications" : "/opportunities",
    },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold">Welcome, {me.data?.name}</h1>
      {path.data && (
        <div className="mt-6 max-w-md">
          <ProgressBar value={path.data.completionPct} label="Learning path progress" />
        </div>
      )}
      {readiness.data && (
        <Link
          href="/readiness"
          className="mt-6 inline-block"
          aria-label="View your career readiness"
        >
          <ReadinessGauge score={readiness.data.score} target={readiness.data.target} size={200} />
        </Link>
      )}
      {!!alerts.data?.length && (
        <Link
          href="/applications"
          className="mt-6 block max-w-xl rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          {alerts.data.length} upcoming deadline{alerts.data.length === 1 ? "" : "s"}:{" "}
          {alerts.data[0].opportunityTitle}
          {alerts.data.length > 1 ? " and more" : ""}
        </Link>
      )}
      <h2 className="mt-8 text-lg font-semibold">Your next steps</h2>
      <ul className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <span aria-hidden>{s.done ? "✅" : "⬜"}</span>
            <span className="sr-only">{s.done ? "Done:" : "To do:"}</span>
            <Link href={s.href} className="text-indigo-600 underline dark:text-indigo-400">
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
