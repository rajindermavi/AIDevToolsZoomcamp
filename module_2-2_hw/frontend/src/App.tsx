import { useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { getExtensions, Language } from "./editorConfig";
import { API_URL, WS_URL } from "./config";

type RunResult = {
  stdout: string;
  stderr: string;
  language: string;
};

function App() {
  const params = new URLSearchParams(window.location.search);
  const initialSession = params.get("session") || "";

  const [sessionId, setSessionId] = useState<string>(initialSession);
  const [code, setCode] = useState<string>("# Welcome to the collaborative interview pad\n");
  const [language, setLanguage] = useState<Language>("python");
  const [status, setStatus] = useState<"idle" | "connecting" | "connected">("idle");
  const [error, setError] = useState<string>("");
  const [runResult, setRunResult] = useState<RunResult>({ stdout: "", stderr: "", language: "python" });
  const [joinInput, setJoinInput] = useState<string>(initialSession);
  const socketRef = useRef<WebSocket | null>(null);

  const shareLink = useMemo(() => {
    if (!sessionId) return "";
    const url = new URL(window.location.href);
    url.searchParams.set("session", sessionId);
    return url.toString();
  }, [sessionId]);

  const extractSessionId = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      const fromParam = parsed.searchParams.get("session");
      if (fromParam) return fromParam;
      return parsed.pathname.replace("/", "") || null;
    } catch (_) {
      return trimmed;
    }
  };

  const connectSocket = (id: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }
    setStatus("connecting");
    const ws = new WebSocket(`${WS_URL.replace("http", "ws")}/ws/${id}`);
    socketRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setError("");
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case "init":
          setCode(message.code || "");
          setLanguage(message.language || "python");
          break;
        case "edit":
          setCode(message.code || "");
          break;
        case "language":
          setLanguage(message.language || "python");
          break;
        case "run_result":
          setRunResult({
            stdout: message.stdout || "",
            stderr: message.stderr || "",
            language: message.language || language,
          });
          break;
        case "ended":
          setError(message.reason || "Session ended");
          setSessionId("");
          setStatus("idle");
          ws.close();
          break;
        case "error":
          setError(message.message || "An error occurred");
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      setStatus("idle");
      socketRef.current = null;
    };

    ws.onerror = () => {
      setError("WebSocket error");
      setStatus("idle");
    };
  };

  useEffect(() => {
    let cancelled = false;
    const open = async () => {
      if (!sessionId) return;
      try {
        const res = await fetch(`${API_URL}/sessions/${sessionId}`, { method: "POST" });
        if (!res.ok) {
          setError("Session not found");
          setStatus("idle");
          return;
        }
        const info = await res.json();
        if (cancelled) return;
        setCode(info.code || "");
        setLanguage(info.language || "python");
        connectSocket(sessionId);
        const url = new URL(window.location.href);
        url.searchParams.set("session", sessionId);
        window.history.replaceState({}, "", url);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setError("Could not join session");
          setStatus("idle");
        }
      }
    };
    open();
    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [sessionId]);

  const createSession = async () => {
    setError("");
    try {
      const res = await fetch(`${API_URL}/sessions`, { method: "POST" });
      if (!res.ok) {
        setError("Failed to create session");
        return;
      }
      const data = await res.json();
      setSessionId(data.session_id);
      setJoinInput(data.session_id);
      const joinRes = await fetch(`${API_URL}/sessions/${data.session_id}`, { method: "POST" });
      if (joinRes.ok) {
        const info = await joinRes.json();
        setCode(info.code || "");
        setLanguage(info.language || "python");
      }
    } catch (e) {
      console.error(e);
      setError("Could not create session");
    }
  };

  const joinExisting = async () => {
    const extracted = extractSessionId(joinInput);
    if (!extracted) {
      setError("Enter a session id or link");
      return;
    }
    setError("");
    try {
      const res = await fetch(`${API_URL}/sessions/${extracted}`, { method: "POST" });
      if (!res.ok) {
        setError("Session not found");
        return;
      }
      const info = await res.json();
      setCode(info.code || "");
      setLanguage(info.language || "python");
      setSessionId(info.session_id);
    } catch (e) {
      console.error(e);
      setError("Failed to join session");
    }
  };

  const emit = (payload: Record<string, unknown>) => {
    if (status !== "connected" || !socketRef.current) return;
    socketRef.current.send(JSON.stringify(payload));
  };

  const handleCodeChange = (value: string) => {
    setCode(value);
    emit({ type: "edit", code: value });
  };

  const handleLanguageChange = (next: Language) => {
    setLanguage(next);
    emit({ type: "language", language: next });
  };

  const runCode = () => {
    emit({ type: "run" });
  };

  const endSession = () => {
    emit({ type: "end" });
    setSessionId("");
    setStatus("idle");
    setCode("# Session ended\n");
  };

  const extensions = useMemo(() => getExtensions(language), [language]);

  return (
    <div className="card">
      <div className="header">
        <div className="title">Collaborative Interview Pad</div>
        <div className="controls">
          <button onClick={createSession}>Start Session</button>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="Session ID or link"
            aria-label="Session ID"
          />
          <button className="secondary" onClick={joinExisting}>
            Join Session
          </button>
          <button onClick={endSession} disabled={!sessionId} className="secondary">
            End Session
          </button>
        </div>
      </div>

      <div className="status">
        <span>
          <span className="badge">{sessionId ? "Active session" : "No session"}</span>
          {sessionId && <span>Session ID: {sessionId}</span>}
        </span>
        <span>
          <strong>Connection:</strong> {status}
        </span>
      </div>

      {shareLink && (
        <div className="session-link">
          <strong>Share link:</strong> <code>{shareLink}</code>
        </div>
      )}
      {error && <div className="session-link danger">{error}</div>}

      <div className="controls" style={{ marginTop: 12, marginBottom: 8 }}>
        <label>
          Language:{" "}
          <select value={language} onChange={(e) => handleLanguageChange(e.target.value as Language)}>
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
          </select>
        </label>
        <button onClick={runCode} disabled={!sessionId || status !== "connected"}>
          Run Code
        </button>
      </div>

      <div className="panels">
        <div className="panel">
          <h3>Editor</h3>
          <div className="editor">
            <CodeMirror value={code} height="400px" extensions={extensions} onChange={handleCodeChange} />
          </div>
        </div>
        <div className="panel">
          <h3>Output</h3>
          <div className="output">
            {runResult.stdout && (
              <>
                <strong>stdout</strong>
                <pre>{runResult.stdout}</pre>
              </>
            )}
            {runResult.stderr && (
              <>
                <strong>stderr</strong>
                <pre>{runResult.stderr}</pre>
              </>
            )}
            {!runResult.stdout && !runResult.stderr && <span>Waiting to run…</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
