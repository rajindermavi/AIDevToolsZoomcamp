## Running frontend and backend together

From `frontend/`, install deps (adds `concurrently`):

```
npm install
```

Then run both services in one command:

```
npm run dev
```

What it does:
- Starts FastAPI via `uv run uvicorn main:app --host 0.0.0.0 --port 8000`
- Serves the static frontend via `python -m http.server 8080`

Open the game at http://localhost:8080 (frontend talks to backend on 8000 by default; override with `API_BASE_URL` if needed).
