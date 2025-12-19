const defaultBase = "http://localhost:8000";

function resolveBaseUrl() {
  if (typeof window !== "undefined" && window.API_BASE_URL) return window.API_BASE_URL;
  if (typeof process !== "undefined" && process.env.API_BASE_URL) return process.env.API_BASE_URL;
  return defaultBase;
}

const API_BASE_URL = resolveBaseUrl();

function buildHeaders(token, extra = {}) {
  const headers = { Accept: "application/json", ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function requestJson(path, { method = "GET", token, body } = {}) {
  const opts = {
    method,
    headers: buildHeaders(token, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined
  };
  const response = await fetch(`${API_BASE_URL}${path}`, opts);
  if (!response.ok) {
    let detail = `Request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch (_err) {
      // ignore parse failures
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

export async function signup(username, password) {
  return requestJson("/auth/signup", {
    method: "POST",
    body: { username, password }
  });
}

export async function login(username, password) {
  return requestJson("/auth/login", {
    method: "POST",
    body: { username, password }
  });
}

export async function logout(token) {
  await requestJson("/auth/logout", {
    method: "POST",
    token
  });
}

export async function getCurrentUser(token) {
  return requestJson("/auth/me", { token });
}

export async function submitScore(token, score) {
  return requestJson("/scores", {
    method: "POST",
    token,
    body: { score }
  });
}

export async function fetchLeaderboard() {
  return requestJson("/leaderboard");
}

export async function listLiveMatches() {
  return requestJson("/watch/matches");
}

function parseSseChunk(chunk, onFrame) {
  const events = chunk.split("\n\n");
  const leftover = events.pop() || "";
  for (const event of events) {
    const lines = event.split("\n");
    let name = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        name = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (name === "frame" && dataLines.length) {
      try {
        const payload = JSON.parse(dataLines.join("\n"));
        onFrame(payload);
      } catch (err) {
        console.error("Failed to parse SSE frame", err);
      }
    }
  }
  return leftover;
}

function streamWithFetch(url, onFrame) {
  const controller = new AbortController();
  const decoder = new TextDecoder();

  fetch(url, { signal: controller.signal }).then(async (response) => {
    if (!response.ok || !response.body) {
      throw new Error(`Stream request failed with status ${response.status}`);
    }
    const reader = response.body.getReader();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = parseSseChunk(buffer, onFrame);
    }
  }).catch((err) => {
    if (controller.signal.aborted) return;
    console.error("SSE stream error", err);
  });

  return {
    stop() {
      controller.abort();
    }
  };
}

export function streamMatch(matchId, onFrame) {
  const url = `${API_BASE_URL}/watch/${encodeURIComponent(matchId)}/stream`;
  if (typeof EventSource !== "undefined") {
    const source = new EventSource(url);
    source.addEventListener("frame", (event) => {
      try {
        onFrame(JSON.parse(event.data));
      } catch (err) {
        console.error("Failed to parse EventSource frame", err);
      }
    });
    return {
      stop() {
        source.close();
      }
    };
  }
  return streamWithFetch(url, onFrame);
}
