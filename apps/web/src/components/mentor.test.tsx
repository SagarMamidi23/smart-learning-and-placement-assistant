import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSseParser } from "@/lib/stream";
import { MentorChat, withCitations } from "./MentorChat";

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const source = {
  n: 1,
  title: "Thermodynamics Basics",
  page: 3,
  snippet: "Excerpt from the course notes.",
};

afterEach(cleanup);

describe("createSseParser", () => {
  it("returns complete events and buffers a partial one until it finishes", () => {
    const parse = createSseParser();
    const text = sse("token", { text: "Hel" }) + sse("token", { text: "lo" });
    expect(parse(text.slice(0, 30))).toEqual([]);
    const rest = parse(text.slice(30));
    expect(rest).toEqual([
      { event: "token", data: { text: "Hel" } },
      { event: "token", data: { text: "lo" } },
    ]);
  });

  it("skips malformed events without breaking the stream", () => {
    const parse = createSseParser();
    const out = parse("event: token\ndata: {oops\n\n" + sse("done", { refused: false, cited: [] }));
    expect(out).toEqual([{ event: "done", data: { refused: false, cited: [] } }]);
  });
});

describe("withCitations", () => {
  it("also renders full-width citation brackets", () => {
    render(<p>{withCitations("Entropy rises【1】.", [source])}</p>);
    expect(screen.getByRole("link", { name: /Source 1/ })).toBeInTheDocument();
  });

  it("turns known [n] markers into labelled links and leaves unknown ones as text", () => {
    render(<p>{withCitations("Entropy rises [1] and more [7].", [source])}</p>);
    const link = screen.getByRole("link", { name: "Source 1: Thermodynamics Basics, page 3" });
    expect(link).toHaveAttribute("href", "#source-1");
    expect(screen.getByText(/more \[7\]\./)).toBeInTheDocument();
  });
});

describe("MentorChat", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    cleanup();
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  const renderChat = (history = [] as React.ComponentProps<typeof MentorChat>["history"]) =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MentorChat history={history} />
      </QueryClientProvider>,
    );

  /** A streaming response the test can feed piece by piece. */
  function controlledStream() {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
      },
    });
    return {
      response: new Response(body, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
      push: (s: string) => controller.enqueue(enc.encode(s)),
      close: () => controller.close(),
    };
  }

  it("streams the answer in as it arrives, with citation badges and sources", async () => {
    const s = controlledStream();
    fetchMock.mockResolvedValueOnce(s.response);
    renderChat();
    await userEvent.type(screen.getByLabelText("Your question"), "What is entropy?");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ message: "What is entropy?" });
    expect(screen.getByText("What is entropy?")).toBeInTheDocument();

    s.push(sse("sources", { sources: [source] }));
    s.push(sse("token", { text: "Entropy never " }));
    await waitFor(() => expect(screen.getByText(/Entropy never/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Answering…" })).toBeDisabled(); // no double-submit mid-answer

    s.push(sse("token", { text: "decreases [1]." }));
    s.push(sse("done", { refused: false, cited: [1] }));
    await waitFor(() => expect(screen.getByRole("link", { name: /Source 1/ })).toBeInTheDocument());
    expect(screen.getByText(/Entropy never decreases/)).toBeInTheDocument();
    expect(screen.getByText(/Thermodynamics Basics, page 3/)).toBeInTheDocument();
    s.close();
    // The busy state ends once the stream closes (the empty input keeps "Ask" itself disabled).
    await waitFor(() => expect(screen.queryByRole("button", { name: "Answering…" })).toBeNull());
    expect(screen.getByLabelText("Your question")).toBeEnabled();
  });

  it("styles a refusal differently from an answer and shows no sources", async () => {
    const s = controlledStream();
    fetchMock.mockResolvedValueOnce(s.response);
    renderChat();
    await userEvent.type(screen.getByLabelText("Your question"), "Tell me about contracts");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    s.push(sse("sources", { sources: [] }));
    s.push(sse("token", { text: "I couldn't find this in the study material." }));
    s.push(sse("done", { refused: true, cited: [] }));
    const msg = await screen.findByText(/couldn't find this/);
    expect(msg.closest("div")?.className).toContain("amber");
    expect(screen.queryByText(/Sources \(/)).not.toBeInTheDocument();
    s.close();
  });

  it("shows an error event from the server", async () => {
    const s = controlledStream();
    fetchMock.mockResolvedValueOnce(s.response);
    renderChat();
    await userEvent.type(screen.getByLabelText("Your question"), "hello there");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    s.push(sse("sources", { sources: [source] }));
    s.push(sse("error", { code: "LLM_BUSY", message: "The AI service is busy right now." }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The AI service is busy");
    s.close();
  });

  it("shows a plain error when the request itself is rejected", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "NO_ACTIVE_DOMAIN", message: "Choose a career domain first." },
        }),
        {
          status: 409,
        },
      ),
    );
    renderChat();
    await userEvent.type(screen.getByLabelText("Your question"), "hello there");
    await userEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a career domain first.");
  });

  it("renders saved history with its sources", () => {
    renderChat([
      { role: "user", content: "What is entropy?", sources: [], refused: false, createdAt: "t" },
      {
        role: "assistant",
        content: "A measure of disorder [1].",
        sources: [source],
        refused: false,
        createdAt: "t",
      },
    ]);
    expect(screen.getByText("What is entropy?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Source 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear conversation" })).toBeInTheDocument();
  });
});
