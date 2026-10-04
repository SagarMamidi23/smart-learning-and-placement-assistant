import type { InputHTMLAttributes } from "react";

export const inputClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

export const primaryButton =
  "rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

export const secondaryButton =
  "rounded-md border border-slate-300 px-4 py-2 font-medium hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

export function Field({
  label,
  error,
  id,
  ...props
}: { label: string; error?: string; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function ErrorAlert({ message }: { message?: string }) {
  return (
    <div role="alert" aria-live="polite">
      {message && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {message}
        </p>
      )}
    </div>
  );
}
