import { cosine } from "./matching";

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. Enough for the resume dataset. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // drop a byte-order mark
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface ResumeRow {
  category: string;
  domain: string;
  text: string;
}

export function rowsFromCsv(text: string): ResumeRow[] {
  const [header, ...body] = parseCsv(text);
  const col = (n: string) => header.indexOf(n);
  const [ci, di, ti] = [col("category"), col("domain"), col("text")];
  if (ci < 0 || di < 0 || ti < 0) throw new Error("CSV needs category, domain and text columns");
  return body.map((r) => ({ category: r[ci], domain: r[di], text: r[ti] }));
}

export interface EvalReport {
  total: number;
  top1: number;
  top3: number;
  /** Accuracy of always guessing the most common domain: the number to beat. */
  majorityBaseline: number;
  perDomain: Record<string, { n: number; top1: number; top3: number }>;
  /** actual domain -> predicted domain -> count, for the errors only. */
  confusions: Record<string, Record<string, number>>;
}

/**
 * Predicts each resume's domain as the domain whose description is nearest in embedding space, and reports how often that
 * matches the resume's labelled category. `domainVectors` and `resumeVectors` come from the same embedding model.
 */
export function evaluate(
  rows: ResumeRow[],
  resumeVectors: number[][],
  domainVectors: Record<string, number[]>,
): EvalReport {
  const slugs = Object.keys(domainVectors);
  const perDomain: EvalReport["perDomain"] = {};
  const confusions: EvalReport["confusions"] = {};
  const counts: Record<string, number> = {};
  let top1 = 0;
  let top3 = 0;

  for (const [i, row] of rows.entries()) {
    const ranked = slugs
      .map((s) => ({ s, sim: cosine(resumeVectors[i], domainVectors[s]) }))
      .sort((a, b) => b.sim - a.sim)
      .map((r) => r.s);
    const hit1 = ranked[0] === row.domain;
    const hit3 = ranked.slice(0, 3).includes(row.domain);
    counts[row.domain] = (counts[row.domain] ?? 0) + 1;
    const d = (perDomain[row.domain] ??= { n: 0, top1: 0, top3: 0 });
    d.n++;
    if (hit1) {
      top1++;
      d.top1++;
    }
    if (hit3) {
      top3++;
      d.top3++;
    }
    if (!hit1) {
      const c = (confusions[row.domain] ??= {});
      c[ranked[0]] = (c[ranked[0]] ?? 0) + 1;
    }
  }
  const total = rows.length;
  const r = (n: number) => Math.round((n / (total || 1)) * 1000) / 1000;
  return {
    total,
    top1: r(top1),
    top3: r(top3),
    majorityBaseline: r(Math.max(0, ...Object.values(counts))),
    perDomain: Object.fromEntries(
      Object.entries(perDomain).map(([k, v]) => [
        k,
        {
          n: v.n,
          top1: Math.round((v.top1 / v.n) * 1000) / 1000,
          top3: Math.round((v.top3 / v.n) * 1000) / 1000,
        },
      ]),
    ),
    confusions,
  };
}
