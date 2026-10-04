"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { useLogout, useMe } from "@/lib/hooks";
import { type StepKey, useJourney } from "@/lib/journey";
import {
  BellIcon,
  BookIcon,
  BriefcaseIcon,
  ChatIcon,
  CheckIcon,
  CloseIcon,
  HomeIcon,
  MoreIcon,
} from "./icons";

interface NavItem {
  label: string;
  href: string;
  /** The journey step this page belongs to, for the done tick and the "Next" badge. */
  step?: StepKey;
}

/**
 * The 12 student pages grouped by what the student is doing: Plan is mostly done once, Learn is the daily loop,
 * Progress is readiness, Careers is opportunities and applications.
 */
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Plan",
    items: [
      { label: "Discover", href: "/discovery", step: "discovery" },
      { label: "Domains", href: "/domains", step: "domain" },
      { label: "Skill gap", href: "/skill-gap", step: "skill-gap" },
    ],
  },
  {
    title: "Learn",
    items: [
      { label: "Learning path", href: "/learning-path", step: "learning-path" },
      { label: "Mentor", href: "/mentor" },
      { label: "Assessments", href: "/assessments", step: "assessment" },
      { label: "Mock evaluation", href: "/mock-eval", step: "mock-eval" },
    ],
  },
  { title: "Progress", items: [{ label: "Readiness", href: "/readiness", step: "readiness" }] },
  {
    title: "Careers",
    items: [
      { label: "Opportunities", href: "/opportunities" },
      { label: "Applications", href: "/applications" },
    ],
  },
];

const ADMIN_GROUP = {
  title: "Admin",
  items: [
    { label: "Domains", href: "/admin/domains" },
    { label: "Study material", href: "/admin/study-material" },
    { label: "Assessments", href: "/admin/assessments" },
    { label: "Opportunities", href: "/admin/opportunities" },
    { label: "Analytics", href: "/admin/analytics" },
  ],
};

const isActive = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Wraps signed-in pages: redirects to /login when unauthenticated and renders the navigation. */
export function AppShell({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const router = useRouter();
  const me = useMe();

  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 401) router.replace("/login");
  }, [me.error, router]);

  if (me.isLoading || !me.data) {
    return (
      <p className="p-8" role="status">
        {me.isError ? "Redirecting…" : "Loading…"}
      </p>
    );
  }

  const isAdmin = me.data.role === "admin";
  return (
    <Shell name={me.data.name} isAdmin={isAdmin}>
      {adminOnly && !isAdmin ? (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-danger-ink">
          You need an administrator account to view this page.
        </p>
      ) : (
        children
      )}
    </Shell>
  );
}

function Shell({
  name,
  isAdmin,
  children,
}: {
  name: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const logout = useLogout();
  const journey = useJourney();
  const [moreOpen, setMoreOpen] = useState(false);
  const signOut = () => logout.mutate(undefined, { onSettled: () => router.replace("/login") });

  // Close the mobile sheet whenever the page changes.
  useEffect(() => setMoreOpen(false), [pathname]);

  const groups = isAdmin ? [...GROUPS, ADMIN_GROUP] : GROUPS;
  const nextKey = journey.nextIndex >= 0 ? journey.steps[journey.nextIndex].key : undefined;
  const r = journey.readiness;

  /** Right-hand detail on a sidebar link: a tick, a percentage, the readiness score, a count or "Next". */
  function adornment(item: NavItem) {
    const step = journey.steps.find((s) => s.key === item.step);
    if (item.step && item.step === nextKey) {
      return (
        <span className="rounded-full bg-accent px-[7px] py-0.5 text-[11px] font-semibold text-on-accent">
          Next
        </span>
      );
    }
    if (item.href === "/learning-path" && journey.path) {
      return (
        <span className="text-xs text-muted tabular-nums">
          {Math.round(journey.path.completionPct)}%
        </span>
      );
    }
    if (item.href === "/readiness" && r) {
      return (
        <span className="text-xs text-muted tabular-nums">
          {Math.round(r.score)} / {r.target}
        </span>
      );
    }
    if (item.href === "/applications" && journey.alerts.length > 0) {
      return (
        <span className="min-w-5 rounded-full bg-danger-soft px-1.5 py-0.5 text-center text-[11px] font-semibold text-danger-ink">
          <span className="sr-only">Upcoming deadlines: </span>
          {journey.alerts.length}
        </span>
      );
    }
    if (step?.done && GROUPS[0].items.includes(item)) {
      return (
        <span className="text-success">
          <CheckIcon size={14} strokeWidth={2.5} />
          <span className="sr-only">(done)</span>
        </span>
      );
    }
    return null;
  }

  const navLink = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-9 items-center justify-between gap-2 rounded-sm px-2.5 text-sm transition-colors ${
          active
            ? "bg-accent-soft font-semibold text-accent-soft-ink"
            : "text-ink hover:bg-surface-2"
        }`}
      >
        {item.label}
        {adornment(item)}
      </Link>
    );
  };

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* Desktop: grouped sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r-2 border-rule px-3.5 py-6 lg:flex">
        <Brand />
        <nav aria-label="Main" className="flex flex-col gap-5">
          {navLink({ label: "Dashboard", href: "/dashboard" })}
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-0.5">
              <div className="kicker px-2.5 pb-1.5 text-muted">{g.title}</div>
              {g.items.map(navLink)}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-2.5 border-t-2 border-rule px-2.5 pt-4">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-extrabold"
          >
            {initial}
          </span>
          <span className="flex min-w-0 flex-col text-[13px] leading-tight">
            <span className="truncate font-semibold">{name}</span>
            <Link href="/profile" className="text-xs text-muted no-underline hover:text-accent">
              Profile and settings
            </Link>
          </span>
          <button
            onClick={signOut}
            className="ml-auto rounded-sm px-2 py-1 text-xs font-semibold text-muted hover:bg-surface-2 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile: top bar */}
      <header className="flex items-center justify-between border-b-2 border-rule py-1.5 pr-3 pl-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-base font-extrabold">
          <span aria-hidden className="size-5 rounded-sm bg-accent" />
          Smart Learning
        </Link>
        <Link
          href="/applications"
          aria-label={
            journey.alerts.length
              ? `Upcoming deadlines, ${journey.alerts.length}`
              : "Upcoming deadlines"
          }
          className="relative grid size-11 place-items-center rounded-sm text-ink hover:bg-surface-2"
        >
          <BellIcon size={22} />
          {journey.alerts.length > 0 && (
            <span className="absolute top-[9px] right-[9px] size-2 rounded-full bg-danger" />
          )}
        </Link>
      </header>

      <main className="min-w-0 px-4 pt-5 pb-28 lg:px-10 lg:pt-8 lg:pb-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Mobile: bottom tabs. Mentor gets its own tab because students return to it most often. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t-2 border-rule bg-canvas px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)] lg:hidden"
      >
        <Tab
          href="/dashboard"
          label="Home"
          icon={<HomeIcon size={22} />}
          active={isActive(pathname, "/dashboard")}
        />
        <Tab
          href="/learning-path"
          label="Learn"
          icon={<BookIcon size={22} />}
          active={["/learning-path", "/assessments", "/mock-eval"].some((h) =>
            isActive(pathname, h),
          )}
        />
        <Tab
          href="/mentor"
          label="Mentor"
          icon={<ChatIcon size={22} />}
          active={isActive(pathname, "/mentor")}
        />
        <Tab
          href="/opportunities"
          label="Jobs"
          icon={<BriefcaseIcon size={22} />}
          active={["/opportunities", "/applications"].some((h) => isActive(pathname, h))}
          dot={journey.alerts.length > 0}
        />
        <button
          aria-expanded={moreOpen}
          aria-controls="more-sheet"
          onClick={() => setMoreOpen((o) => !o)}
          className="flex min-h-13 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted"
        >
          <MoreIcon size={22} />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div
            id="more-sheet"
            role="dialog"
            aria-label="All pages"
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[10px] bg-canvas px-4 pt-3 pb-8 shadow-raised [animation:slp-rise_220ms_var(--ease)]"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-extrabold">All pages</span>
              <button
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
                className="grid size-11 place-items-center rounded-sm hover:bg-surface-2"
              >
                <CloseIcon />
              </button>
            </div>
            <nav aria-label="All pages" className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.title} className="flex flex-col gap-0.5">
                  <div className="kicker px-2.5 pb-1 text-muted">{g.title}</div>
                  {g.items.map(navLink)}
                </div>
              ))}
              <div className="flex items-center justify-between border-t-2 border-rule pt-3">
                <Link href="/profile" className="px-2.5 text-sm font-semibold text-ink">
                  Profile and settings
                </Link>
                <button
                  onClick={signOut}
                  className="rounded-sm px-2.5 py-2 text-sm font-semibold text-muted hover:bg-surface-2"
                >
                  Sign out
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-2.5 text-ink no-underline">
      <span aria-hidden className="size-6 shrink-0 rounded-sm bg-accent" />
      <span className="flex flex-col leading-tight">
        <span className="text-[15px] font-extrabold">Smart Learning</span>
        <span className="text-xs text-muted">&amp; Placement Assistant</span>
      </span>
    </Link>
  );
}

function Tab({
  href,
  label,
  icon,
  active,
  dot = false,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  dot?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-13 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold no-underline ${
        active ? "text-accent" : "text-muted"
      }`}
    >
      {icon}
      {label}
      {dot && (
        <span className="absolute top-1.5 left-[calc(50%+8px)] size-2 rounded-full bg-danger">
          <span className="sr-only">(upcoming deadlines)</span>
        </span>
      )}
    </Link>
  );
}
