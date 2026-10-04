import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ReadinessResultDto } from "@slp/shared";
import { ReadinessGauge } from "./ReadinessGauge";
import { ReadinessView, evidenceCount } from "./ReadinessView";

afterEach(cleanup);

const base: ReadinessResultDto = {
  id: "r1",
  domain: "software",
  score: 58.4,
  target: 70,
  decision: "learning",
  modelVersion: "readiness-random_forest-20261004-abc",
  isFallback: false,
  createdAt: "2026-10-04T10:00:00Z",
  features: {
    assessment_avg: 62,
    mock_eval_avg: 0,
    path_completion_pct: 35,
    skill_gap_coverage_pct: 48.5,
    mentor_engagement: 4,
    days_active: 9,
    recency_days: 2,
  },
  factors: [
    {
      feature: "mock_eval_avg",
      label: "Mock evaluation results",
      value: 0,
      typical: 41.2,
      impact: -11.3,
      direction: "lowers",
    },
    {
      feature: "days_active",
      label: "Days active (last 30 days)",
      value: 9,
      typical: 12.1,
      impact: -3.4,
      direction: "lowers",
    },
    {
      feature: "assessment_avg",
      label: "Assessment results",
      value: 62,
      typical: 45.9,
      impact: 5.1,
      direction: "raises",
    },
  ],
  evidence: {
    assessments: true,
    mockEvaluations: false,
    learningPath: true,
    skillGap: true,
    mentor: true,
  },
  focusAreas: [{ skill: "Databases and SQL", priority: "high", currentLevel: 1, targetLevel: 3 }],
  nextActions: [
    { label: "Do a mock evaluation", href: "/mock-eval" },
    { label: "Keep working through your learning path", href: "/learning-path" },
  ],
};

describe("ReadinessGauge", () => {
  it("describes the score and target in words, not just colour", () => {
    render(<ReadinessGauge score={58.4} target={70} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Readiness 58 out of 100. Target 70. 12 points below target.",
    );
    expect(screen.getByText("Target 70")).toBeInTheDocument();
    expect(screen.getByText("58")).toBeInTheDocument();
  });

  it("says when the target is met, including exactly at the target", () => {
    render(<ReadinessGauge score={70} target={70} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Target met\./);
  });

  it("copes with a score of zero", () => {
    render(<ReadinessGauge score={0} target={65} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/Readiness 0 out of 100/);
  });
});

describe("ReadinessView", () => {
  it("below target: says how far to go, lists next actions, focus areas and what moved the score", () => {
    render(<ReadinessView result={base} />);
    expect(screen.getByRole("heading", { name: "12 points to go" })).toBeInTheDocument();
    expect(screen.getByText("Below target · keep learning")).toBeInTheDocument();
    expect(screen.getByText(/against a target of 70/)).toBeInTheDocument();
    const next = screen.getByRole("heading", { name: "What will help most" }).closest("section")!;
    expect(within(next).getByRole("link", { name: "Do a mock evaluation" })).toHaveAttribute(
      "href",
      "/mock-eval",
    );
    expect(
      within(next).getByRole("link", { name: /Close your Databases and SQL gap/ }),
    ).toHaveAttribute("href", "/skill-gap");
    expect(within(next).getByText("Level 1 of 3 · high priority")).toBeInTheDocument();
    // Signed impacts, with the typical value for comparison.
    expect(screen.getByText("−11.3")).toBeInTheDocument();
    expect(screen.getByText("+5.1")).toBeInTheDocument();
    expect(screen.getByText(/against a typical 41.2/)).toBeInTheDocument();
    expect(screen.getByText(/ML model/)).toBeInTheDocument();
  });

  it("at target: congratulates and points to opportunities", () => {
    render(
      <ReadinessView
        result={{
          ...base,
          score: 74,
          decision: "opportunities",
          focusAreas: [],
          nextActions: [
            { label: "Browse opportunities that match your profile", href: "/opportunities" },
          ],
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "You've reached the target" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse opportunities/ })).toHaveAttribute(
      "href",
      "/opportunities",
    );
    expect(screen.queryByRole("link", { name: /Close your/ })).not.toBeInTheDocument();
  });

  it("flags a fallback score and names the simple formula", () => {
    render(
      <ReadinessView
        result={{ ...base, isFallback: true, modelVersion: "fallback-weighted-v1" }}
      />,
    );
    expect(screen.getByText(/prediction service was unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/Calculated .* · simple formula/)).toBeInTheDocument();
  });

  it("warns when the score rests on almost no activity", () => {
    const none = {
      assessments: false,
      mockEvaluations: false,
      learningPath: false,
      skillGap: false,
      mentor: false,
    };
    expect(evidenceCount(none)).toBe(0);
    render(<ReadinessView result={{ ...base, evidence: none }} />);
    expect(screen.getByText(/rests on very little activity/)).toBeInTheDocument();
  });

  it("does not warn when there is real evidence", () => {
    expect(evidenceCount(base.evidence)).toBe(4);
    render(<ReadinessView result={base} />);
    expect(screen.queryByText(/rests on very little activity/)).not.toBeInTheDocument();
  });

  it("states what the score is and is not", () => {
    render(<ReadinessView result={base} />);
    expect(screen.getByText(/not a prediction of any exam or hiring outcome/)).toBeInTheDocument();
  });

  it("lists every signal that fed the score", () => {
    render(<ReadinessView result={base} />);
    const table = screen
      .getByRole("heading", { name: "The signals behind it" })
      .closest("section")!;
    // A header row plus one row per signal.
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(within(table).getByText("48.5")).toBeInTheDocument();
    // No mock evaluation yet reads as "No result", not as a score of 0.
    expect(within(table).getByText("No result")).toBeInTheDocument();
  });
});
