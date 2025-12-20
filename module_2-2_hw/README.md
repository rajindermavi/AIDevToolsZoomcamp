# Collaborative Coding Interview Prototype

A minimal full-stack prototype for real-time collaborative coding interviews. Includes a React + CodeMirror frontend and a FastAPI backend with WebSocket synchronization and code execution for Python and JavaScript.

## Project structure

- `frontend/` – React single-page app with CodeMirror editor.
- `backend/` – FastAPI service with in-memory sessions, WebSocket sync, and code execution.
- `package.json` – Development helper script using `concurrently` to run both services.

## Prerequisites

- Node.js 18+ (for the frontend and dev tooling).
- Python 3.10+.
- `uv` installed (`pip install uv` or see https://github.com/astral-sh/uv).
- Local `python` and `node` CLIs available for code execution.

## Setup and run (development)

1. Install frontend deps:
   ```bash
   cd frontend
   npm install
   ```
2. Install backend deps with uv:
   ```bash
   cd backend
   uv sync
   ```
3. From the project root, run both services together:
   ```bash
   npm install
   npm run dev
   ```
   - Backend: http://localhost:8000
   - Frontend: http://localhost:5173

You can also run them separately:
```bash
cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# in another shell
cd frontend && npm run dev -- --host --port 5173
```

## API overview

- `POST /sessions` → create a new session `{ "session_id": "..." }`.
- `POST /sessions/{session_id}` → join/check an existing session and fetch its state.
- `WS /ws/{session_id}` → real-time channel for edits, language changes, run requests, and session end events.

## Notes

- Sessions are held in memory and expire after 15 minutes of inactivity (no connected users).
- Execution is basic and uses local `python`/`node` binaries with a short timeout. Do not run untrusted code.
- The included `uv.lock` provides pinned backend dependencies; regenerate with `uv lock` after dependency changes.
