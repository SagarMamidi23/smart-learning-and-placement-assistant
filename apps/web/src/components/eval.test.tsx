import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttemptDto, MockEvalDto, Question } from "@slp/shared";
import type { AdminAssessment } from "@/lib/evalHooks";
import { AssessmentEditor, describeProblem } from "./AssessmentEditor";
import { AssessmentTaker, formatDuration } from "./AssessmentTaker";
import { MockEvalForm, MockEvalResults } from "./MockEvalView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true),
  );
  window.scrollTo = vi.fn();
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const attempt: AttemptDto = {
  id: "a1",
  assessmentId: "s1",
  status: "in-progress",
  startedAt: new Date().toISOString(),
  timeLimitMinutes: 10,
  questions: [
    {
      id: "q1",
      kind: "mcq",
      prompt: "Which is a sorting algorithm?",
      options: ["Quicksort", "Dijkstra", "Prim", "Kruskal"],
      maxMarks: 1,
    },
    {
      id: "q2",
      kind: "practical",
      prompt: "Explain how a hash table handles collisions.",
      maxMarks: 5,
    },
  ],
};

describe("formatDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(0)).toBe("0:00");
  });
});

describe("AssessmentTaker", () => {
  it("shows the questions and a running count, with a timer that is only advisory", () => {
    wrap(<AssessmentTaker attempt={attempt} />);
    expect(screen.getByText("0 of 2 answered")).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/Suggested time left/);
    expect(screen.getByText(/Which is a sorting algorithm/)).toBeInTheDocument();
  });

  it("submits mcq choices as indexes and written answers as text", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        attempt: {
          ...attempt,
          status: "submitted",
          score: 75,
          timeTakenSec: 125,
          results: [
            {
              questionId: "q1",
              kind: "mcq",
              prompt: attempt.questions[0].prompt,
              options: ["Quicksort", "Dijkstra", "Prim", "Kruskal"],
              selected: 0,
              correctIndex: 0,
              correct: true,
              awarded: 1,
              max: 1,
              explanation: "Quicksort sorts.",
            },
            {
              questionId: "q2",
              kind: "practical",
              prompt: attempt.questions[1].prompt,
              answerText: "Chaining.",
              awarded: 2.5,
              max: 5,
              explanation: "",
              modelAnswer: "Chaining or open addressing.",
              feedback: "Mention open addressing too.",
            },
          ],
        },
      }),
    );
    wrap(<AssessmentTaker attempt={attempt} />);
    await userEvent.click(screen.getByRole("radio", { name: "Quicksort" }));
    await userEvent.type(screen.getByRole("textbox"), "Chaining.");
    expect(screen.getByText("2 of 2 answered")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/assessments/attempts/a1/submit");
    expect(JSON.parse(init.body)).toEqual({
      answers: [
        { questionId: "q1", selected: 0 },
        { questionId: "q2", text: "Chaining." },
      ],
    });
    // Results appear in place, with the answer key revealed.
    expect(await screen.findByText("Your score: 75%")).toBeInTheDocument();
    expect(screen.getByText("Time taken: 2:05")).toBeInTheDocument();
    expect(screen.getByText("Quicksort sorts.")).toBeInTheDocument();
    expect(screen.getByText(/Mention open addressing too/)).toBeInTheDocument();
    expect(screen.getByText(/2.5 \/ 5 marks/)).toBeInTheDocument();
  });

  it("asks before submitting with unanswered questions, and does nothing if the student says no", async () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    wrap(<AssessmentTaker attempt={attempt} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("2 question(s) are unanswered"),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the answers and shows the message when the server fails", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: "LLM_BUSY", message: "The AI service is busy right now." } }, 503),
    );
    wrap(<AssessmentTaker attempt={attempt} />);
    await userEvent.type(screen.getByRole("textbox"), "My answer");
    await userEvent.click(screen.getByRole("button", { name: "Submit answers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("busy");
    expect(screen.getByRole("textbox")).toHaveValue("My answer");
  });
});

const evaluation: MockEvalDto = {
  id: "m1",
  domain: "software",
  type: "interview",
  mode: "text",
  status: "in-progress",
  createdAt: "2026-10-04T00:00:00Z",
  questions: [
    { id: "e1", prompt: "Tell me about a project you built.", focus: "Projects and experience" },
    { id: "e2", prompt: "How would you debug a slow query?" },
  ],
  rubric: [
    { criterion: "Technical knowledge", weight: 0.6 },
    { criterion: "Communication", weight: 0.4 },
  ],
};

describe("MockEvalForm", () => {
  it("will not submit with nothing answered", async () => {
    wrap(<MockEvalForm evaluation={evaluation} />);
    await userEvent.click(screen.getByRole("button", { name: "Submit for scoring" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Answer at least one question");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends every question, with blank text for skipped ones", async () => {
    fetchMock.mockResolvedValueOnce(json({ evaluation: { ...evaluation, status: "completed" } }));
    wrap(<MockEvalForm evaluation={evaluation} />);
    await userEvent.type(screen.getByLabelText(/Tell me about a project/), "I built a tracker.");
    await userEvent.click(screen.getByRole("button", { name: "Submit for scoring" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      answers: [
        { questionId: "e1", text: "I built a tracker." },
        { questionId: "e2", text: "" },
      ],
    });
  });
});

describe("MockEvalResults", () => {
  it("shows the overall score, weighted rubric rows, feedback and skipped answers", () => {
    render(
      <MockEvalResults
        evaluation={{
          ...evaluation,
          status: "completed",
          overallScore: 72,
          answers: [
            { questionId: "e1", text: "I built a tracker." },
            { questionId: "e2", text: "" },
          ],
          rubricScores: [
            {
              criterion: "Technical knowledge",
              weight: 0.6,
              score: 8,
              comment: "Solid on the basics.",
            },
            { criterion: "Communication", weight: 0.4, score: 5.5, comment: "Rambling in places." },
          ],
          questionFeedback: [{ questionId: "e1", feedback: "Good detail." }],
          feedback: {
            summary: "A decent attempt overall.",
            strengths: ["Concrete example"],
            improvements: ["Be more concise"],
          },
        }}
      />,
    );
    expect(screen.getByText("Overall score: 72/100")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", {
      name: /Technical knowledge \(weight 60%\): 8\/10/,
    });
    expect(bar).toHaveAttribute("aria-valuenow", "80");
    expect(screen.getByText("Rambling in places.")).toBeInTheDocument();
    expect(screen.getByText("Concrete example")).toBeInTheDocument();
    expect(screen.getByText("Be more concise")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getByText("Good detail.")).toBeInTheDocument();
  });
});

const mcq = (id: string, correctIndex = 0): Question => ({
  id,
  kind: "mcq",
  prompt: `Which option is right for ${id}?`,
  options: ["Alpha", "Beta", "Gamma", "Delta"],
  correctIndex,
  explanation: "Because alpha.",
  difficulty: 2,
  maxMarks: 1,
});

const adminAssessment = (over: Partial<AdminAssessment> = {}): AdminAssessment => ({
  id: "s1",
  domain: "software",
  title: "Core concepts check",
  type: "mcq",
  status: "draft",
  questionCount: 3,
  timeLimitMinutes: 10,
  grounded: false,
  groundedOn: [],
  reviewed: false,
  llm: "groq/openai/gpt-oss-120b",
  questions: [mcq("a"), mcq("b"), mcq("c")],
  ...over,
});

describe("describeProblem", () => {
  it("names the question the reviewer needs to fix", () => {
    expect(describeProblem(["questions", 1, "options"], "Options must all be different")).toBe(
      "Question 2 › options: Options must all be different",
    );
    expect(describeProblem(["title"], "Too short")).toBe("title: Too short");
  });
});

describe("AssessmentEditor", () => {
  it("warns when a draft was not written from study material", () => {
    wrap(<AssessmentEditor assessment={adminAssessment()} />);
    expect(screen.getByText(/skill list only, so check the facts carefully/)).toBeInTheDocument();
  });

  it("saves the reviewer's change to the answer key", async () => {
    fetchMock.mockResolvedValueOnce(json({ assessment: adminAssessment() }));
    wrap(<AssessmentEditor assessment={adminAssessment()} />);
    await userEvent.click(screen.getAllByRole("radio", { name: "Option 3 is correct" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/admin/assessments/s1");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body).questions[0].correctIndex).toBe(2);
  });

  it("blocks saving duplicate options and says which question", async () => {
    wrap(<AssessmentEditor assessment={adminAssessment()} />);
    const input = screen.getAllByLabelText("Question 1 option 2")[0];
    await userEvent.clear(input);
    await userEvent.type(input, "Alpha");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText(/Question 1 › options: Options must all be different/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lets the reviewer delete a question", async () => {
    fetchMock.mockResolvedValueOnce(json({ assessment: adminAssessment() }));
    wrap(<AssessmentEditor assessment={adminAssessment()} />);
    await userEvent.click(screen.getAllByRole("button", { name: "Delete" })[1]);
    expect(screen.queryByText(/for b\?/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    // Two questions left is below the publish minimum but fine for a draft; the server decides on publish.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).questions).toHaveLength(2);
  });

  it("saves then publishes, and tells the reviewer when it fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ assessment: adminAssessment() })) // save
      .mockResolvedValueOnce(
        json(
          { error: { code: "TOO_FEW_QUESTIONS", message: "Publish needs at least 3 questions." } },
          400,
        ),
      );
    wrap(<AssessmentEditor assessment={adminAssessment()} />);
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at least 3 questions");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(fetchMock.mock.calls[1][0]).toContain("/publish");
  });

  it("is read-only once published, with unpublish and duplicate instead of edit", () => {
    wrap(<AssessmentEditor assessment={adminAssessment({ status: "published" })} />);
    expect(screen.getByText(/read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Duplicate as draft" })).toBeInTheDocument();
    expect(within(document.body).getAllByRole("radio")[0]).toBeDisabled();
  });
});
