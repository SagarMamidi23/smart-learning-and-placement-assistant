import { createHash } from "node:crypto";
import type { MatchDto } from "@slp/shared";
import { getEmbedder } from "../ai/embeddings";
import { getLLM } from "../ai/llm";
import { buildMatchPrompt, matchReasonSchema } from "../ai/prompts/matching";
import { renderProfile, hasEvidence, type ProfileEvidence } from "../ai/prompts/common";
import { logger } from "../logger";
import { Application } from "../models/Application";
import { MatchReason } from "../models/MatchReason";
import { Opportunity, toOpportunityDto } from "../models/Opportunity";

const DAY_MS = 86_400_000;
/** Cosine similarities for this embedding model: related text scores about 0.55-0.8, unrelated about 0.35-0.45. */
const COS_LOW = 0.35;
const COS_HIGH = 0.75;

export const cosine = (a: number[], b: number[]) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/** Maps a cosine similarity onto a 0-100 "match" a student can read. A scale for display, not a probability. */
export const matchPercent = (cos: number) =>
  Math.round(Math.min(1, Math.max(0, (cos - COS_LOW) / (COS_HIGH - COS_LOW))) * 100);

const STOP = new Set(
  "the and for with from that this are was were has have not you your our can will into about their they them than then also such".split(
    " ",
  ),
);
const tokens = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w)));

/** Keyword-overlap score (0-100), used only when embeddings are unavailable. Crude, and flagged as such to the student. */
export function keywordScore(profileText: string, oppText: string): number {
  const p = tokens(profileText);
  const o = tokens(oppText);
  if (p.size === 0 || o.size === 0) return 0;
  let shared = 0;
  for (const w of o) if (p.has(w)) shared++;
  return Math.round(Math.min(1, shared / Math.sqrt(o.size) / 4) * 100);
}

export const profileHash = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 24);

const startOfTodayUtc = (now: Date) => new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);

export interface MatchInput {
  userId: string;
  domain: { slug: string; name: string; opportunityTypes: string[] };
  profile: ProfileEvidence;
  types?: string[];
  limit?: number;
  now?: Date;
}

/**
 * Ranks the student's domain opportunities. Hard filters first (domain, still open, wanted types), then similarity between the
 * student's profile and each description, then a short cached explanation for the top few. Every layer degrades on its own:
 * no embeddings -> keyword ranking, no LLM -> matches without explanations.
 */
export async function matchOpportunities(
  input: MatchInput,
): Promise<{ matches: MatchDto[]; rankingFallback: boolean; reasonsUnavailable: boolean }> {
  const now = input.now ?? new Date();
  const limit = Math.min(input.limit ?? 8, 12);
  const types = input.types?.length
    ? input.types.filter((t) => input.domain.opportunityTypes.includes(t))
    : input.domain.opportunityTypes;

  const candidates = await Opportunity.find({
    domain: input.domain.slug,
    isActive: true,
    type: { $in: types },
    $or: [{ deadline: null }, { deadline: { $gte: startOfTodayUtc(now) } }], // expired ones are filtered out
  })
    .select("+embedding")
    .lean();
  if (candidates.length === 0)
    return { matches: [], rankingFallback: false, reasonsUnavailable: false };

  const profileText = `${input.domain.name} career. ${renderProfile(input.profile)}`.slice(0, 3500);

  let rankingFallback = false;
  let scores: number[];
  try {
    const [qv] = await getEmbedder().embed([profileText]);
    const withVectors = candidates.filter((c) => c.embedding?.length);
    if (withVectors.length === 0) throw new Error("no opportunity has an embedding yet");
    scores = candidates.map((c) =>
      c.embedding?.length ? matchPercent(cosine(qv, c.embedding)) : 0,
    );
  } catch (e) {
    logger.warn(
      { err: (e as Error).message },
      "embedding unavailable for matching; using keyword overlap",
    );
    rankingFallback = true;
    scores = candidates.map((c) =>
      keywordScore(profileText, `${c.title} ${c.organisation} ${c.description} ${c.eligibility}`),
    );
  }

  const ranked = candidates
    .map((c, i) => ({ c, score: scores[i] }))
    // Earlier deadlines break ties, so the more urgent of two equal matches comes first.
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.c.deadline?.getTime() ?? Infinity) - (b.c.deadline?.getTime() ?? Infinity),
    )
    .slice(0, limit);

  // Explanations: reuse cached ones for this exact profile, ask the LLM only for the rest.
  const hash = profileHash(profileText);
  const cached = await MatchReason.find({
    userId: input.userId,
    profileHash: hash,
    opportunityId: { $in: ranked.map((r) => r.c._id) },
  }).lean();
  const reasons = new Map(
    cached.map((r) => [String(r.opportunityId), { reason: r.reason, caution: r.caution ?? null }]),
  );
  let reasonsUnavailable = false;

  const missing = ranked.filter((r) => !reasons.has(String(r.c._id)));
  if (missing.length > 0 && hasEvidence(input.profile)) {
    try {
      const { system, prompt } = buildMatchPrompt({
        domainName: input.domain.name,
        profileText,
        items: missing.map((r) => ({
          id: String(r.c._id),
          title: r.c.title,
          organisation: r.c.organisation,
          type: r.c.type,
          eligibility: r.c.eligibility ?? "",
          description: r.c.description,
        })),
      });
      const out = await getLLM().generateJson({
        feature: "opportunity_match_reasons",
        system,
        prompt,
        schema: matchReasonSchema(missing.map((r) => String(r.c._id))),
        temperature: 0.3,
      });
      for (const m of out.matches) {
        reasons.set(m.id, { reason: m.reason, caution: m.caution });
        await MatchReason.updateOne(
          { userId: input.userId, opportunityId: m.id, profileHash: hash },
          { $set: { reason: m.reason, caution: m.caution } },
          { upsert: true },
        );
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "could not write match explanations");
      reasonsUnavailable = true;
    }
  } else if (missing.length > 0) {
    reasonsUnavailable = true; // nothing about the student to explain from
  }

  const apps = await Application.find({
    userId: input.userId,
    opportunityId: { $in: ranked.map((r) => r.c._id) },
  }).lean();
  const appBy = new Map(apps.map((a) => [String(a.opportunityId), a]));

  return {
    rankingFallback,
    reasonsUnavailable,
    matches: ranked.map(({ c, score }) => {
      const r = reasons.get(String(c._id));
      const a = appBy.get(String(c._id));
      return {
        opportunity: toOpportunityDto(c, now),
        match: score,
        reason: r?.reason ?? null,
        caution: r?.caution ?? null,
        application: a ? { id: String(a._id), status: a.status } : undefined,
      };
    }),
  };
}
