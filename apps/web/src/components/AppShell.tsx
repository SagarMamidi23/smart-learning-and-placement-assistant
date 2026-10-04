"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError } from "@/lib/api";
import { useLogout, useMe } from "@/lib/hooks";
import { secondaryButton } from "./ui";

/** Wraps signed-in pages: redirects to /login when unauthenticated and renders the nav. */
export function AppShell({
  children,
  adminOnly = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
}) {
  const router = useRouter();
  const me = useMe();
  const logout = useLogout();

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
    <>
      <header className="border-b border-slate-200 dark:border-slate-800">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3"
        >
          <Link href="/dashboard" className="font-semibold">
            Smart Learning
          </Link>
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <Link href="/domains" className="hover:underline">
            Domains
          </Link>
          <Link href="/discovery" className="hover:underline">
            Discover
          </Link>
          <Link href="/skill-gap" className="hover:underline">
            Skill gap
          </Link>
          <Link href="/learning-path" className="hover:underline">
            Learning path
          </Link>
          <Link href="/mentor" className="hover:underline">
            Mentor
          </Link>
          <Link href="/assessments" className="hover:underline">
            Assessments
          </Link>
          <Link href="/mock-eval" className="hover:underline">
            Mock eval
          </Link>
          <Link href="/readiness" className="hover:underline">
            Readiness
          </Link>
          <Link href="/opportunities" className="hover:underline">
            Opportunities
          </Link>
          <Link href="/applications" className="hover:underline">
            Applications
          </Link>
          <Link href="/profile" className="hover:underline">
            Profile
          </Link>
          {isAdmin && (
            <>
              <Link href="/admin/domains" className="hover:underline">
                Admin
              </Link>
              <Link href="/admin/study-material" className="hover:underline">
                Study material
              </Link>
              <Link href="/admin/assessments" className="hover:underline">
                Assessments (admin)
              </Link>
              <Link href="/admin/opportunities" className="hover:underline">
                Opportunities (admin)
              </Link>
              <Link href="/admin/analytics" className="hover:underline">
                Analytics
              </Link>
            </>
          )}
          <span className="ml-auto text-sm text-slate-500">{me.data.name}</span>
          <button
            className={secondaryButton}
            onClick={() => logout.mutate(undefined, { onSettled: () => router.replace("/login") })}
          >
            Sign out
          </button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        {adminOnly && !isAdmin ? (
          <p role="alert" className="text-red-700 dark:text-red-300">
            You need an administrator account to view this page.
          </p>
        ) : (
          children
        )}
      </main>
    </>
  );
}
