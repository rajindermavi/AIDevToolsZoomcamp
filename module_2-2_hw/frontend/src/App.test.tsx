import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

type MockMessageEvent = { data: string };

class MockWebSocket {
  url: string;
  protocols?: string | string[];
  readyState = 1; // OPEN
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MockMessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    setTimeout(() => {
      act(() => {
        this.onopen?.(new Event("open"));
      });
    }, 0);
    sockets.push(this);
  }
}

let sockets: MockWebSocket[] = [];

const flushPromises = async () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  sockets = [];
  const mockFetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ session_id: "abc123", language: "python", code: "" }),
  });
  // Casting through unknown to satisfy the DOM globals in jsdom
  (global as unknown as { WebSocket: typeof WebSocket }).WebSocket =
    MockWebSocket as unknown as typeof WebSocket;
  (global as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

test("renders app without crashing", () => {
  render(<App />);
  expect(screen.getByText(/Collaborative Interview Pad/i, { selector: ".title" })).toBeInTheDocument();
});

test("code editor renders", () => {
  render(<App />);
  expect(document.querySelector(".cm-editor")).toBeInTheDocument();
});

test("start session triggers API call", async () => {
  render(<App />);
  await act(async () => {
    fireEvent.click(screen.getByText(/Start Session/i));
  });
  await flushPromises();
  await waitFor(() =>
    expect((global as any).fetch).toHaveBeenCalledWith(expect.stringMatching(/sessions$/), expect.any(Object)),
  );
  await waitFor(() => expect(sockets.length).toBeGreaterThan(0));
});

test("language dropdown updates state", async () => {
  render(<App />);
  const select = screen.getByLabelText(/Language/i) as HTMLSelectElement;
  await act(async () => {
    await userEvent.selectOptions(select, "javascript");
  });
  expect(select.value).toBe("javascript");
});

test("run code sends run message over WebSocket", async () => {
  render(<App />);
  // start session to open socket
  await act(async () => {
    fireEvent.click(screen.getByText(/Start Session/i));
  });
  await flushPromises();
  await waitFor(() => expect(sockets[0]).toBeDefined());
  await act(async () => sockets[0]?.onopen && sockets[0].onopen(new Event("open")));
  const runBtn = await screen.findByText(/Run Code/i);
  await userEvent.click(runBtn);
  expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: "run" }));
});

test("output panel shows execution result", async () => {
  render(<App />);
  await act(async () => {
    fireEvent.click(screen.getByText(/Start Session/i));
  });
  await flushPromises();
  await waitFor(() => expect(sockets[0]).toBeDefined());
  const socket = sockets[0]!;
  await act(async () =>
    socket.onmessage?.({
      data: JSON.stringify({ type: "run_result", stdout: "hello", stderr: "" }),
    }),
  );
  expect(await screen.findByText(/stdout/i)).toBeInTheDocument();
  expect(screen.getByText(/hello/)).toBeInTheDocument();
});
