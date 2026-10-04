import type { InputHTMLAttributes } from "react";

export const inputClass =
  "mt-1 block w-full rounded-sm border border-line bg-surface px-3 py-2 hover:border-muted focus-visible:border-accent";

// Labels sit flush left, as in the design. Focus rings come from the global :focus-visible style.
export const primaryButton =
  "inline-flex min-h-10 items-center justify-start gap-2 rounded-sm bg-accent px-4 py-2 text-left font-extrabold text-on-accent transition-colors hover:bg-accent-hover active:bg-accent-press disabled:cursor-not-allowed disabled:opacity-45";

export const secondaryButton =
  "inline-flex min-h-10 items-center justify-start gap-2 rounded-sm border border-ink/30 bg-transparent px-3.5 py-2 text-left font-semibold text-ink transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";

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
        <p className="rounded-md bg-danger-soft p-3 text-sm text-danger-ink">{message}</p>
      )}
    </div>
  );
}
