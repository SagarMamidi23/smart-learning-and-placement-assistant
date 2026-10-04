import { z } from "zod";
import { DATA_RULE, fence } from "./common";

export function matchReasonSchema(ids: string[]) {
  const allowed = new Set(ids);
  return z
    .object({
      matches: z.array(
        z.object({
          id: z.string(),
          reason: z.string().trim().min(15).max(400),
          caution: z.string().trim().max(300).nullable().default(null),
        }),
      ),
    })
    .superRefine((v, ctx) => {
      const seen = new Set<string>();
      for (const m of v.matches) {
        if (!allowed.has(m.id))
          ctx.addIssue({ code: "custom", path: ["matches"], message: `unknown id ${m.id}` });
        seen.add(m.id);
      }
      const missing = ids.filter((id) => !seen.has(id));
      if (missing.length)
        ctx.addIssue({
          code: "custom",
          path: ["matches"],
          message: `missing explanations for: ${missing.join(", ")}`,
        });
    })
    .transform((v) => ({
      // An empty or "none" caution is not a caution.
      matches: v.matches.map((m) => ({
        ...m,
        caution: m.caution && !/^(none|n\/a|null)\.?$/i.test(m.caution) ? m.caution : null,
      })),
    }));
}

export function buildMatchPrompt(args: {
  domainName: string;
  profileText: string;
  items: {
    id: string;
    title: string;
    organisation: string;
    type: string;
    eligibility: string;
    description: string;
  }[];
}) {
  const system = [
    `You explain to a student why specific ${args.domainName} opportunities (exams, jobs, fellowships and so on) might suit them.`,
    "Use ONLY the student's profile and the opportunity text you are given. Do not add facts about the opportunity that are not in its text: no invented dates, salaries, cut-offs or requirements.",
    'For each opportunity write "reason": one or two sentences addressed to the student ("you"), pointing at specific things in their profile (education, skills, interests) that connect to it. If the profile gives little to go on, say the fit is a general one for this domain.',
    '"caution": anything in the eligibility text the student should verify against the official notification (such as degree, age or attempt limits). If the eligibility text is generic or empty, say to check the official notification. Use null only if there is truly nothing to check.',
    DATA_RULE,
    'Reply with ONLY a JSON object: {"matches": [{"id": string, "reason": string, "caution": string or null}]} with exactly one entry per opportunity, using the ids given.',
  ].join("\n");

  const prompt = [
    fence("student_data", args.profileText),
    "",
    "OPPORTUNITIES:",
    ...args.items.map(
      (i) =>
        `- id: ${i.id}\n  title: ${i.title} (${i.type}, ${i.organisation})\n  eligibility: ${i.eligibility || "not stated"}\n  about: ${i.description.slice(0, 350)}`,
    ),
  ].join("\n");

  return { system, prompt };
}
