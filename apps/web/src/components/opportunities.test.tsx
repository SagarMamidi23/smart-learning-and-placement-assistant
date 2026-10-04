import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertDto, ApplicationDto, MatchDto, OpportunityDto } from "@slp/shared";
import { AlertsPanel, ApplicationBoard } from "./ApplicationBoard";
import { OpportunityCard, deadlineText } from "./OpportunityCard";

afterEach(cleanup);

const opp = (over: Partial<OpportunityDto> = {}): OpportunityDto => ({
  id: "o1",
  domain: "software",
  type: "exam",
  title: "GATE (CSE)",
  organisation: "IIT",
  location: "India",
  eligibility: "Final-year B.Tech or graduate",
  deadline: "2026-12-31",
  link: "https://gate2027.iitm.ac.in/",
  description: "National exam for postgraduate admission and some PSU hiring.",
  isActive: true,
  daysLeft: 5,
  ...over,
});

const app = (over: Partial<ApplicationDto> = {}): ApplicationDto => ({
  id: "a1",
  status: "saved",
  notes: "",
  deadlines: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  history: [{ status: "saved", at: "2026-10-01T00:00:00Z" }],
  opportunity: opp(),
  ...over,
});

describe("deadlineText", () => {
  it("is honest about missing, future, today and past dates", () => {
    expect(deadlineText({ deadline: null, daysLeft: null })).toMatch(/check the official notice/);
    expect(deadlineText({ deadline: "2026-12-31", daysLeft: 5 })).toBe(
      "Closes 31 Dec 2026 (in 5 days)",
    );
    expect(deadlineText({ deadline: "2026-12-31", daysLeft: 1 })).toMatch(/in 1 day\)/);
    expect(deadlineText({ deadline: "2026-12-31", daysLeft: 0 })).toMatch(/today/);
    expect(deadlineText({ deadline: "2026-12-31", daysLeft: -2 })).toBe("Closed 31 Dec 2026");
  });
});

describe("OpportunityCard", () => {
  const match = (over: Partial<MatchDto> = {}): MatchDto => ({
    opportunity: opp(),
    match: 74,
    reason: "Your computer science background matches the exam syllabus.",
    caution: "Check the age limit in the official brochure.",
    ...over,
  });

  it("shows the match, reason and caution, and a safe external link", () => {
    render(<OpportunityCard opportunity={opp()} match={match()} onTrack={() => {}} />);
    expect(screen.getByText("74% match")).toBeInTheDocument();
    expect(screen.getByText(/computer science background/)).toBeInTheDocument();
    expect(screen.getByText(/age limit/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Official page/ });
    expect(link).toHaveAttribute("href", "https://gate2027.iitm.ac.in/");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("tracks on click, and shows the status instead once tracked", () => {
    const onTrack = vi.fn();
    const { rerender } = render(<OpportunityCard opportunity={opp()} onTrack={onTrack} />);
    fireEvent.click(screen.getByRole("button", { name: "Track GATE (CSE)" }));
    expect(onTrack).toHaveBeenCalledWith("o1");

    rerender(
      <OpportunityCard
        opportunity={opp()}
        match={match({ application: { id: "a1", status: "applied" } })}
        onTrack={onTrack}
      />,
    );
    expect(screen.queryByRole("button", { name: /Track/ })).not.toBeInTheDocument();
    expect(screen.getByText("Tracking: applied")).toBeInTheDocument();
  });

  it("omits the explanation blocks when there are none", () => {
    render(<OpportunityCard opportunity={opp()} match={match({ reason: null, caution: null })} />);
    expect(screen.queryByText(/Check:/)).not.toBeInTheDocument();
  });
});

describe("ApplicationBoard", () => {
  it("puts each card in its status column", () => {
    render(
      <ApplicationBoard
        applications={[
          app(),
          app({ id: "a2", status: "applied", opportunity: opp({ title: "Other" }) }),
        ]}
        onUpdate={() => {}}
        onRemove={() => {}}
      />,
    );
    const saved = screen.getByRole("region", { name: /Saved/ });
    const applied = screen.getByRole("region", { name: /Applied/ });
    expect(within(saved).getByText("GATE (CSE)")).toBeInTheDocument();
    expect(within(applied).getByText("Other")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: /Offered/ })).getByText("Nothing here yet."),
    ).toBeInTheDocument();
  });

  it("moves a card with the labelled status control", () => {
    const onUpdate = vi.fn();
    render(<ApplicationBoard applications={[app()]} onUpdate={onUpdate} onRemove={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Status of GATE/), { target: { value: "shortlisted" } });
    expect(onUpdate).toHaveBeenCalledWith("a1", { status: "shortlisted" });
  });

  it("saves notes, adds and removes reminders, and can stop tracking", () => {
    const onUpdate = vi.fn();
    const onRemove = vi.fn();
    render(
      <ApplicationBoard
        applications={[app({ deadlines: [{ label: "Admit card", date: "2026-11-02" }] })]}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Notes and reminders/ }));

    expect(screen.getByRole("button", { name: "Save notes" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Notes for/), { target: { value: "Register early" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    expect(onUpdate).toHaveBeenLastCalledWith("a1", { notes: "Register early" });

    expect(screen.getByRole("button", { name: "Add reminder" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reminder name"), { target: { value: "Interview" } });
    fireEvent.change(screen.getByLabelText("Reminder date"), { target: { value: "2026-12-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add reminder" }));
    expect(onUpdate).toHaveBeenLastCalledWith("a1", {
      deadlines: [
        { label: "Admit card", date: "2026-11-02" },
        { label: "Interview", date: "2026-12-01" },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove reminder Admit card" }));
    expect(onUpdate).toHaveBeenLastCalledWith("a1", { deadlines: [] });

    fireEvent.click(screen.getByRole("button", { name: /Stop tracking GATE/ }));
    expect(onRemove).toHaveBeenCalledWith("a1");
  });

  it("copes with an application whose opportunity was removed", () => {
    render(
      <ApplicationBoard
        applications={[app({ opportunity: null })]}
        onUpdate={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(screen.getByText("Removed opportunity")).toBeInTheDocument();
  });
});

describe("AlertsPanel", () => {
  const alert = (over: Partial<AlertDto>): AlertDto => ({
    kind: "deadline",
    message: "Application deadline",
    date: "2026-10-09",
    daysLeft: 5,
    applicationId: "a1",
    opportunityTitle: "GATE",
    ...over,
  });

  it("says so when nothing is due", () => {
    render(<AlertsPanel alerts={[]} />);
    expect(screen.getByText(/No deadlines in the next two weeks/)).toBeInTheDocument();
  });

  it("words overdue, today and upcoming items", () => {
    render(
      <AlertsPanel
        alerts={[
          alert({ kind: "overdue", daysLeft: -2, message: "Application deadline passed" }),
          alert({ daysLeft: 0, opportunityTitle: "Today thing" }),
          alert({
            daysLeft: 1,
            kind: "custom",
            message: "Admit card",
            opportunityTitle: "Tomorrow thing",
          }),
        ]}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Upcoming deadlines" })).getAllByRole(
      "listitem",
    );
    expect(items[0]).toHaveTextContent("2 days ago");
    expect(items[1]).toHaveTextContent("today");
    expect(items[2]).toHaveTextContent("Admit card");
    expect(items[2]).toHaveTextContent("in 1 day)");
  });
});
