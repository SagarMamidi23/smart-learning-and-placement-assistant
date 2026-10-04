import type { Question } from "@slp/shared";
import { gradeAttempt, percent } from "./assessmentService";
import { assessmentGenSchema, practicalGradeSchema, shuffleOptions } from "./prompts/assessment";
import { overallScore } from "./prompts/mockEval";

const mcq = (id: string, correctIndex = 1): Question => ({
  id,
  kind: "mcq",
  prompt: `Question ${id} text goes here`,
  options: ["A", "B", "C", "D"],
  correctIndex,
  explanation: `Because ${id}`,
  difficulty: 2,
  maxMarks: 1,
});
const practical = (id: string, maxMarks = 5): Question => ({
  id,
  kind: "practical",
  prompt: `Practical ${id} task description`,
  modelAnswer: "Key points: first, second and third.",
  explanation: "",
  difficulty: 2,
  maxMarks,
});

describe("gradeAttempt", () => {
  it("marks mcqs against the key and reveals the answers", () => {
    const { results, score } = gradeAttempt(
      [mcq("q1", 1), mcq("q2", 2), mcq("q3", 0), mcq("q4", 3)],
      [
        { questionId: "q1", selected: 1 }, // right
        { questionId: "q2", selected: 0 }, // wrong
        { questionId: "q3", selected: 0 }, // right
        // q4 unanswered
      ],
      [],
    );
    expect(results.map((r) => r.awarded)).toEqual([1, 0, 1, 0]);
    expect(score).toBe(50);
    expect(results[1]).toMatchObject({
      correct: false,
      selected: 0,
      correctIndex: 2,
      explanation: "Because q2",
    });
    expect(results[3]).toMatchObject({ correct: false, selected: undefined });
  });

  it("takes the grader's marks for practical questions, capped at the maximum", () => {
    const { results, score } = gradeAttempt(
      [practical("p1", 5), practical("p2", 4)],
      [
        { questionId: "p1", text: "My answer" },
        { questionId: "p2", text: "Another answer" },
      ],
      [
        { questionId: "p1", awarded: 3.5, feedback: "Missing the third point." },
        { questionId: "p2", awarded: 99, feedback: "Great." },
      ],
    );
    expect(results.map((r) => r.awarded)).toEqual([3.5, 4]);
    expect(results[0].feedback).toBe("Missing the third point.");
    expect(results[0].modelAnswer).toContain("Key points");
    expect(score).toBe(83.3); // 7.5 of 9
  });

  it("gives zero for blank practical answers whatever the grader said", () => {
    const { results } = gradeAttempt(
      [practical("p1")],
      [{ questionId: "p1", text: "   " }],
      [{ questionId: "p1", awarded: 5, feedback: "x" }],
    );
    expect(results[0]).toMatchObject({ awarded: 0, feedback: "No answer given." });
  });

  it("mixes mcq and practical marks by their maximums", () => {
    const { score } = gradeAttempt(
      [mcq("q1", 0), practical("p1", 5)],
      [
        { questionId: "q1", selected: 0 },
        { questionId: "p1", text: "ok" },
      ],
      [{ questionId: "p1", awarded: 2.5, feedback: "half" }],
    );
    expect(score).toBe(58.3); // 3.5 of 6
  });

  it("handles an empty attempt without dividing by zero", () => {
    expect(gradeAttempt([], [], []).score).toBe(0);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("shuffleOptions", () => {
  it("keeps the correct answer pointing at the same text after shuffling", () => {
    const q = { options: ["right", "w1", "w2", "w3"], correctIndex: 0 };
    for (let seed = 0; seed < 20; seed++) {
      let s = seed + 1;
      const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
      const out = shuffleOptions(q, rand);
      expect(out.options[out.correctIndex]).toBe("right");
      expect([...out.options].sort()).toEqual(["right", "w1", "w2", "w3"]);
    }
  });

  it("actually moves the answer around", () => {
    const positions = new Set<number>();
    for (let i = 0; i < 60; i++) {
      positions.add(
        shuffleOptions({ options: ["right", "a", "b", "c"], correctIndex: 0 }).correctIndex,
      );
    }
    expect(positions.size).toBeGreaterThan(2);
  });
});

describe("assessmentGenSchema", () => {
  const goodMcq = (n: number) => ({
    kind: "mcq",
    prompt: `Which statement number ${n} is correct?`,
    options: ["one", "two", "three", "four"],
    correctIndex: 0,
    explanation: "Because.",
    skill: "statistics",
  });
  const run = (questions: unknown[], count = 2, practical = 0) =>
    assessmentGenSchema(count, practical, ["Statistics"]).safeParse({
      title: "Quiz title",
      questions,
    });

  it("accepts a well-formed set and restores the skill's own spelling", () => {
    const r = run([goodMcq(1), goodMcq(2)]);
    expect(r.success && r.data.questions[0].skill).toBe("Statistics");
  });

  it("rejects the wrong count, wrong practical mix, duplicates and bad options", () => {
    expect(run([goodMcq(1)]).success).toBe(false);
    expect(run([goodMcq(1), goodMcq(2)], 2, 1).success).toBe(false);
    expect(run([goodMcq(1), goodMcq(1)]).success).toBe(false);
    expect(run([{ ...goodMcq(1), options: ["x", "x", "y", "z"] }, goodMcq(2)]).success).toBe(false);
    expect(
      run([{ ...goodMcq(1), options: ["x", "y", "z", "All of the above"] }, goodMcq(2)]).success,
    ).toBe(false);
    expect(run([{ ...goodMcq(1), correctIndex: 4 }, goodMcq(2)]).success).toBe(false);
  });

  it("drops a skill tag that is not a real skill instead of failing the draft", () => {
    const r = run([{ ...goodMcq(1), skill: "Invented" }, goodMcq(2)]);
    expect(r.success && r.data.questions[0].skill).toBeUndefined();
  });
});

describe("practicalGradeSchema", () => {
  const items = [
    { id: "p1", max: 5 },
    { id: "p2", max: 4 },
  ];
  const ok = (r: unknown[]) => practicalGradeSchema(items).safeParse({ results: r });

  it("requires a grade for every question, within range, for known questions", () => {
    expect(ok([{ questionId: "p1", awarded: 3, feedback: "fine" }]).success).toBe(false); // missing p2
    expect(
      ok([
        { questionId: "p1", awarded: 6, feedback: "too many" },
        { questionId: "p2", awarded: 1, feedback: "ok ok" },
      ]).success,
    ).toBe(false);
    expect(
      ok([
        { questionId: "p1", awarded: 3, feedback: "fine" },
        { questionId: "zzz", awarded: 1, feedback: "who" },
        { questionId: "p2", awarded: 1, feedback: "ok ok" },
      ]).success,
    ).toBe(false);
  });

  it("rounds marks to half points", () => {
    const r = ok([
      { questionId: "p1", awarded: 3.3, feedback: "fine" },
      { questionId: "p2", awarded: 1.8, feedback: "ok ok" },
    ]);
    expect(r.success && r.data.results.map((x) => x.awarded)).toEqual([3.5, 2]);
  });
});

describe("overallScore", () => {
  it("is the weighted rubric score on a 0-100 scale", () => {
    expect(
      overallScore([
        { weight: 0.5, score: 8 },
        { weight: 0.3, score: 5 },
        { weight: 0.2, score: 10 },
      ]),
    ).toBe(75); // 0.5*0.8 + 0.3*0.5 + 0.2*1.0 = 0.75
  });
});
