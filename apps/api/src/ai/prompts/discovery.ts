import { z } from "zod";
import { DATA_RULE, fence, renderProfile, type ProfileEvidence } from "./common";

export interface DomainChoice {
  slug: string;
  name: string;
  description: string;
}

export interface QuizAnswerLine {
  question: string;
  answer: string;
}

/** The recommendation count: three when we can, fewer if fewer domains are active. */
export const recommendationCount = (domains: DomainChoice[]) => Math.min(3, domains.length);

export function discoverySchema(domains: DomainChoice[]) {
  const slugs = domains.map((d) => d.slug) as [string, ...string[]];
  return z
    .object({
      summary: z.string().trim().min(20).max(700),
      recommendations: z
        .array(
          z.object({
            slug: z.enum(slugs),
            reason: z.string().trim().min(10).max(500),
            matchScore: z
              .number()
              .min(0)
              .max(100)
              .transform((n) => Math.round(n)),
            strengths: z.array(z.string().trim().min(1).max(100)).min(1).max(4),
          }),
        )
        .length(recommendationCount(domains)),
    })
    .superRefine((v, ctx) => {
      const seen = new Set<string>();
      for (const r of v.recommendations) {
        if (seen.has(r.slug)) {
          ctx.addIssue({
            code: "custom",
            path: ["recommendations"],
            message: `slug "${r.slug}" is repeated; each recommendation must be a different domain`,
          });
        }
        seen.add(r.slug);
      }
    });
}

export function buildDiscoveryPrompt(args: {
  domains: DomainChoice[];
  profile: ProfileEvidence;
  answers: QuizAnswerLine[];
}) {
  const n = recommendationCount(args.domains);
  const system = [
    "You are an experienced career counsellor for students and early-career job seekers in India.",
    "You recommend career domains from a fixed list, using only the evidence provided. Be encouraging but honest, and never promise outcomes.",
    DATA_RULE,
    `Reply with ONLY a JSON object of this exact shape:`,
    `{"summary": string (2-3 sentences addressing the student as "you"), "recommendations": [{"slug": string (one of the allowed slugs, exactly as written), "reason": string (1-2 sentences tied to their answers or profile), "matchScore": integer 0-100, "strengths": [2-3 short strings]}]}`,
    `Give exactly ${n} recommendations, best match first, each a different slug.`,
  ].join("\n");

  const prompt = [
    "ALLOWED DOMAINS (use the slug exactly):",
    ...args.domains.map((d) => `- ${d.slug}: ${d.name}. ${d.description}`),
    "",
    fence("student_data", renderProfile(args.profile)),
    "",
    fence("quiz_answers", args.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")),
  ].join("\n");

  return { system, prompt };
}
