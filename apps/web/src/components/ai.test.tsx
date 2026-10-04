import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningPathDto, QuizDefinition } from "@slp/shared";
import { LearningPathView } from "./LearningPathView";
import { QuizForm, unanswered } from "./QuizForm";

const quiz: QuizDefinition = {
  version: 1,
  questions: [
    { id: "i-code", type: "likert", text: "I enjoy puzzles.", required: true },
    {
      id: "c-setting",
      type: "choice",
      text: "Where would you like to work?",
      required: true,
      options: [
        { value: "desk", label: "At a desk" },
        { value: "lab", label: "In a lab" },
      ],
    },
    {
      id: "t-proud",
      type: "text",
      text: "Something you are proud of (optional).",
      required: false,
    },
  ],
};

const wrap = (ui: React.ReactElement, client = new QueryClient()) =>
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe("QuizForm", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("lists the required questions that are still unanswered", () => {
    expect(unanswered(quiz, {}).map((q) => q.id)).toEqual(["i-code", "c-setting"]);
    expect(unanswered(quiz, { "i-code": 3 }).map((q) => q.id)).toEqual(["c-setting"]);
    expect(unanswered(quiz, { "i-code": 3, "c-setting": "lab" })).toEqual([]);
  });

  it("blocks submit and flags each unanswered question without calling the API", async () => {
    wrap(<QuizForm quiz={quiz} />);
    expect(screen.getByText("0 of 2 required questions answered")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Get my recommendations" }));
    expect(screen.getAllByText("Please answer this question")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits numeric likert answers, option values and optional text", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        result: { generatedAt: "now", quizVersion: 1, summary: "s", recommendations: [] },
      }),
    );
    const onDone = vi.fn();
    wrap(<QuizForm quiz={quiz} onDone={onDone} />);
    await userEvent.click(screen.getByRole("radio", { name: "Agree" }));
    await userEvent.click(screen.getByRole("radio", { name: "In a lab" }));
    await userEvent.type(screen.getByLabelText(/proud of/), "A robot");
    await userEvent.click(screen.getByRole("button", { name: "Get my recommendations" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/discovery/result");
    expect(JSON.parse(init.body)).toEqual({
      answers: { "i-code": 4, "c-setting": "lab", "t-proud": "A robot" },
    });
  });

  it("shows a friendly message when the AI service is busy", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "LLM_BUSY", message: "The AI service is busy right now." } },
        503,
      ),
    );
    wrap(<QuizForm quiz={quiz} />);
    await userEvent.click(screen.getByRole("radio", { name: "Neutral" }));
    await userEvent.click(screen.getByRole("radio", { name: "At a desk" }));
    await userEvent.click(screen.getByRole("button", { name: "Get my recommendations" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is busy");
  });
});

const path: LearningPathDto = {
  id: "p1",
  domain: "software",
  version: 1,
  generatedAt: "2026-10-03T00:00:00Z",
  hoursPerWeek: 8,
  stale: false,
  completionPct: 0,
  weeks: [
    {
      week: 1,
      title: "Foundations",
      status: "not-started",
      goals: [
        { text: "Read chapter one", done: false },
        { text: "Solve ten problems", done: false },
      ],
      topics: ["Arrays", "Sorting"],
      resources: [{ title: "Introduction to Algorithms", type: "book" }],
      focusSkills: ["Data Structures and Algorithms"],
    },
  ],
};

describe("LearningPathView", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("shows goals, topics, resources and the AI disclaimer", () => {
    wrap(<LearningPathView path={path} />);
    expect(screen.getByText(/Resource titles are AI suggestions/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Read chapter one" })).not.toBeChecked();
    expect(screen.getByText("Sorting")).toBeInTheDocument();
    expect(screen.getByText(/Introduction to Algorithms/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Plan progress" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
  });

  it("ticks a goal immediately and sends the update", async () => {
    const done = {
      ...path,
      completionPct: 50,
      weeks: [
        {
          ...path.weeks[0],
          status: "in-progress" as const,
          goals: [
            { text: "Read chapter one", done: true },
            { text: "Solve ten problems", done: false },
          ],
        },
      ],
    };
    fetchMock.mockResolvedValueOnce(jsonResponse({ path: done }));
    const client = new QueryClient();
    client.setQueryData(["learning-path"], path);
    wrap(<LearningPathView path={path} />, client);

    await userEvent.click(screen.getByRole("checkbox", { name: "Read chapter one" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/learning-path/progress");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ week: 1, goalIndex: 0, done: true });
    await waitFor(() =>
      expect(client.getQueryData<LearningPathDto>(["learning-path"])?.completionPct).toBe(50),
    );
  });

  it("rolls the checkbox back when the server rejects the change", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "X", message: "no" } }, 500));
    const client = new QueryClient();
    client.setQueryData(["learning-path"], path);
    wrap(<LearningPathView path={path} />, client);

    await userEvent.click(screen.getByRole("checkbox", { name: "Read chapter one" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
    const cached = client.getQueryData<LearningPathDto>(["learning-path"])!;
    expect(cached.weeks[0].goals[0].done).toBe(false);
    expect(
      within(document.body).getByRole("checkbox", { name: "Read chapter one" }),
    ).not.toBeChecked();
  });
});
