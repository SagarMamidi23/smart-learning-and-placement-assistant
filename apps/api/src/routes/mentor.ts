import { Router, type Response } from "express";
import { z } from "zod";
import { loadStudentContext } from "../ai/context";
import { getLLM } from "../ai/llm";
import {
  NO_MATERIAL,
  REFUSAL,
  buildMentorMessages,
  citedNumbers,
  normalizeCitations,
  snippetOf,
} from "../ai/prompts/mentor";
import { aiLimiter } from "../ai/rateLimit";
import { materialStats, retrieve } from "../ai/rag/retrieve";
import { AppError, asyncHandler, parse } from "../errors";
import { authenticate } from "../middleware/auth";
import {
  MAX_STORED_MESSAGES,
  MentorChat,
  toMessageDto,
  type SourceRef,
} from "../models/MentorChat";
import { StudentProfile } from "../models/StudentProfile";

export const mentorRouter = Router();
mentorRouter.use(authenticate);

const chatSchema = z.object({ message: z.string().trim().min(1).max(1000) }).strict();
const HISTORY_TURNS = 6;

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Is there study material for the active domain? Lets the UI explain an empty mentor instead of failing. */
mentorRouter.get(
  "/status",
  asyncHandler(async (req, res) => {
    const { domain } = await loadStudentContext(req.auth!.userId);
    res.json({ domain: domain.slug, ...(await materialStats(domain.slug)) });
  }),
);

mentorRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findOne({ userId: req.auth!.userId });
    if (!profile?.activeDomain) {
      throw new AppError(409, "NO_ACTIVE_DOMAIN", "Choose a career domain first.");
    }
    const chat = await MentorChat.findOne({
      userId: req.auth!.userId,
      domain: profile.activeDomain,
    });
    res.json({ domain: profile.activeDomain, messages: (chat?.messages ?? []).map(toMessageDto) });
  }),
);

mentorRouter.delete(
  "/history",
  asyncHandler(async (req, res) => {
    const profile = await StudentProfile.findOne({ userId: req.auth!.userId });
    if (profile?.activeDomain) {
      await MentorChat.deleteOne({ userId: req.auth!.userId, domain: profile.activeDomain });
    }
    res.status(204).end();
  }),
);

/**
 * RAG chat over the active domain's study material, streamed as server-sent events:
 *   sources -> token* -> done   (or error)
 * Retrieval is filtered to the student's domain. If nothing relevant is found the answer is a fixed refusal
 * and no model is called, so the mentor never answers a question its material does not cover.
 */
mentorRouter.post(
  "/chat",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const { message } = parse(chatSchema, req.body);
    const userId = req.auth!.userId;
    const { domain } = await loadStudentContext(userId);

    const chat =
      (await MentorChat.findOne({ userId, domain: domain.slug })) ??
      new MentorChat({ userId, domain: domain.slug, messages: [] });
    const previous = chat.messages.slice(-HISTORY_TURNS).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Short follow-ups ("and why?") retrieve poorly alone, so add the previous question for context.
    const lastUser = [...previous].reverse().find((m) => m.role === "user")?.content ?? "";
    const query = message.length < 60 && lastUser ? `${lastUser} ${message}` : message;
    const hits = await retrieve(domain.slug, query);
    const stats = hits.length === 0 ? await materialStats(domain.slug) : null;

    const sources: SourceRef[] = hits.map((h, i) => ({
      n: i + 1,
      title: h.title,
      page: h.page,
      snippet: snippetOf(h.text),
    }));

    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    sse(res, "sources", { sources });

    const save = async (answer: string, refused: boolean) => {
      chat.messages.push(
        { role: "user", content: message, sources: [], refused: false, createdAt: new Date() },
        { role: "assistant", content: answer, sources, refused, createdAt: new Date() },
      );
      if (chat.messages.length > MAX_STORED_MESSAGES) {
        chat.messages.splice(0, chat.messages.length - MAX_STORED_MESSAGES);
      }
      await chat.save();
    };

    if (hits.length === 0) {
      const text = stats && stats.chunks === 0 ? NO_MATERIAL : REFUSAL;
      sse(res, "token", { text });
      await save(text, true);
      sse(res, "done", { refused: true, cited: [] });
      return void res.end();
    }

    const abort = new AbortController();
    res.on("close", () => abort.abort());
    let answer = "";
    try {
      const messages = buildMentorMessages({
        domainName: domain.name,
        safetyNotice: domain.safetyNotice ?? undefined,
        history: previous,
        question: message,
        hits,
      });
      for await (const delta of getLLM().streamText({
        feature: "mentor_chat",
        messages,
        signal: abort.signal,
      })) {
        answer += delta;
        sse(res, "token", { text: delta });
      }
      answer = normalizeCitations(answer);
      await save(answer, false);
      sse(res, "done", { refused: false, cited: citedNumbers(answer, hits.length) });
    } catch (e) {
      const err =
        e instanceof AppError ? e : new AppError(500, "INTERNAL", "Something went wrong.");
      sse(res, "error", { code: err.code, message: err.message });
    }
    res.end();
  }),
);
