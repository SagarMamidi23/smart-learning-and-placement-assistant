/** Responsible-AI notice for safety-critical domains (Healthcare, Law). Driven by the domain's config. */
export function SafetyNotice({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <aside
      role="note"
      aria-label="Safety notice"
      className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
    >
      <strong className="font-semibold">Please note: </strong>
      {text}
    </aside>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const formatMonths = (months: number[]) =>
  months.length
    ? [...months]
        .sort((a, b) => a - b)
        .map((m) => MONTHS[m - 1])
        .join(", ")
    : "Varies";
