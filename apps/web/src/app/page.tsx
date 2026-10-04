import Link from "next/link";

const button =
  "rounded-md px-5 py-2.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-bold">Smart Learning &amp; Placement Assistant</h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
        AI career guidance, personalised learning paths and placement support.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/register" className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}>
          Get started
        </Link>
        <Link
          href="/login"
          className={`${button} border border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-900`}
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
