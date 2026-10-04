import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalyticsDto } from "@slp/shared";
import { AnalyticsView } from "./AnalyticsView";

afterEach(cleanup);

const data = (over: Partial<AnalyticsDto> = {}): AnalyticsDto => ({
  generatedAt: "2026-10-04T10:00:00Z",
  windowDays: 30,
  users: { students: 40, admins: 2, newStudents: 6, activeStudents: 25 },
  domains: [
    {
      slug: "software",
      name: "Software",
      students: 20,
      scored: 10,
      avgReadiness: 61.5,
      target: 70,
      atOrAboveTarget: 4,
      pctAtOrAboveTarget: 40,
    },
    {
      slug: "law",
      name: "Law",
      students: 0,
      scored: 0,
      avgReadiness: null,
      target: 65,
      atOrAboveTarget: 0,
      pctAtOrAboveTarget: null,
    },
  ],
  modules: [
    { key: "mentor", label: "AI mentor chats", total: 120, users: 30, recent: 50, recentUsers: 18 },
  ],
  readiness: { scored: 10, fallbackScores: 0 },
  assessments: [
    { id: "a1", title: "Banking basics", domain: "banking", attempts: 9, avgScore: 72.5 },
  ],
  applications: {
    total: 5,
    byStatus: { saved: 2, applied: 2, shortlisted: 1, rejected: 0, offered: 0 },
  },
  opportunities: { total: 61, active: 60, missingVectors: 0 },
  ...over,
});

describe("AnalyticsView", () => {
  it("shows the summary and shows a dash, not 0, for a domain nobody is scored in", () => {
    render(<AnalyticsView data={data()} />);
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("40")).toBeInTheDocument();
    expect(within(summary).getByText("63% of students")).toBeInTheDocument();
    expect(within(summary).getByText("all from the model")).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Readiness by domain" });
    const sw = within(table).getByRole("row", { name: /Software/ });
    expect(sw).toHaveTextContent("4 of 10 (40%)");
    const law = within(table).getByRole("row", { name: /Law/ });
    expect(law).not.toHaveTextContent("0%");
    expect(within(law).getAllByText("–").length).toBeGreaterThanOrEqual(2);
  });

  it("warns that small cohorts are noisy, but not large ones", () => {
    const { rerender } = render(
      <AnalyticsView
        data={data({ users: { students: 3, admins: 1, newStudents: 3, activeStudents: 2 } })}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/Only 3 students/);
    rerender(<AnalyticsView data={data()} />);
    expect(screen.queryByText(/Only \d+ student/)).not.toBeInTheDocument();
  });

  it("flags fallback scores and opportunities without vectors", () => {
    render(
      <AnalyticsView
        data={data({
          readiness: { scored: 10, fallbackScores: 3 },
          opportunities: { total: 61, active: 60, missingVectors: 2 },
        })}
      />,
    );
    expect(screen.getByText(/3 from the fallback formula/)).toBeInTheDocument();
    expect(screen.getByText(/2 opportunities have no matching vector/)).toBeInTheDocument();
  });

  it("lists module usage, the funnel, and handles no assessments", () => {
    const { rerender } = render(<AnalyticsView data={data()} />);
    const mod = within(screen.getByRole("table", { name: "Module usage" })).getByRole("row", {
      name: /AI mentor/,
    });
    expect(mod).toHaveTextContent("30");
    expect(mod).toHaveTextContent("18");
    expect(screen.getByText("Applications (5)")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Banking basics/ })).toHaveTextContent("72.5%");

    rerender(<AnalyticsView data={data({ assessments: [] })} />);
    expect(screen.getByText("No submitted attempts yet.")).toBeInTheDocument();
  });

  it("renders the slotted charts", () => {
    render(<AnalyticsView data={data()} charts={<div>chart slot</div>} />);
    expect(screen.getByText("chart slot")).toBeInTheDocument();
  });
});
