import fs from "node:fs";
import path from "node:path";
import type { QuizDefinition } from "@slp/shared";
import { defaultSeedDir } from "../domains/seed";
import { AppError } from "../errors";
import type { QuizAnswerLine } from "./prompts/discovery";

const LIKERT = ["strongly disagree", "disagree", "neutral", "agree", "strongly agree"];

let cached: QuizDefinition | undefined;

/** The quiz is data (data/seeds/discovery_quiz.json), so questions can change without code changes. */
export function loadQuiz(): QuizDefinition {
  cached ??= JSON.parse(
    fs.readFileSync(path.join(defaultSeedDir(), "discovery_quiz.json"), "utf8"),
  ) as QuizDefinition;
  return cached;
}

/** Checks every answer against its question and returns readable question/answer lines for the prompt. */
export function resolveAnswers(
  quiz: QuizDefinition,
  answers: Record<string, string | number>,
): QuizAnswerLine[] {
  const errors: Record<string, string[]> = {};
  const lines: QuizAnswerLine[] = [];
  const known = new Set(quiz.questions.map((q) => q.id));

  for (const id of Object.keys(answers)) {
    if (!known.has(id)) errors[id] = ["Unknown question"];
  }

  for (const q of quiz.questions) {
    const raw = answers[q.id];
    const blank = raw === undefined || (typeof raw === "string" && raw.trim() === "");
    if (blank) {
      if (q.required) errors[q.id] = ["An answer is required"];
      continue;
    }
    if (q.type === "likert") {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) errors[q.id] = ["Choose a rating from 1 to 5"];
      else lines.push({ question: q.text, answer: `${n} of 5 (${LIKERT[n - 1]})` });
    } else if (q.type === "choice") {
      const option = q.options?.find((o) => o.value === raw);
      if (!option) errors[q.id] = ["Choose one of the listed options"];
      else lines.push({ question: q.text, answer: option.label });
    } else {
      lines.push({ question: q.text, answer: String(raw).trim() });
    }
  }

  if (Object.keys(errors).length) {
    throw new AppError(400, "INVALID_ANSWERS", "Some quiz answers are missing or invalid", {
      fieldErrors: errors,
    });
  }
  return lines;
}
