import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";

type MockMessageEvent = { data: string };

class MockWebSocket {
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: MockMessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn();

  constructor(url: string) {
    this.url = url;
    setTimeout(() => this.onopen && this.onopen(), 0);
    sockets.push(this);
  }
}

let sockets: MockWebSocket[] = [];

beforeEach(() => {
  sockets = [];
  global.WebSocket = MockWebSocket as any;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ session_id: "abc123", language: "python", code: "" }),
  }) as any;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("renders app without crashing", () => {
  render(<App />);
  expect(screen.getByText(/Collaborative Interview Pad/i)).toBeInTheDocument();
});

test("code editor renders", () => {
  render(<App />);
  expect(document.querySelector(".cm-editor")).toBeInTheDocument();
});

test("start session triggers API call", async () => {
  render(<App />);
  fireEvent.click(screen.getByText(/Start Session/i));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringMatching(/sessions$/), expect.any(Object)));
  expect(sockets.length).toBeGreaterThan(0);
});

test("language dropdown updates state", async () => {
  render(<App />);
  const select = screen.getByLabelText(/Language/i) as HTMLSelectElement;
  await userEvent.selectOptions(select, "javascript");
  expect(select.value).toBe("javascript");
});

test("run code sends run message over WebSocket", async () => {
  render(<App />);
  // start session to open socket
  fireEvent.click(screen.getByText(/Start Session/i));
  await waitFor(() => sockets[0]?.onopen);
  sockets[0]?.onopen && sockets[0].onopen();
  const runBtn = await screen.findByText(/Run Code/i);
  await userEvent.click(runBtn);
  expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: "run" }));
});

test("output panel shows execution result", async () => {
  render(<App />);
  fireEvent.click(screen.getByText(/Start Session/i));
  await waitFor(() => sockets[0]);
  const socket = sockets[0];
  socket.onmessage &&
    socket.onmessage({
      data: JSON.stringify({ type: "run_result", stdout: "hello", stderr: "" }),
    });
  expect(await screen.findByText(/stdout/i)).toBeInTheDocument();
  expect(screen.getByText(/hello/)).toBeInTheDocument();
});
