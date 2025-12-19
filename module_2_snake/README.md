## Running locally (no Docker)

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

## Docker Compose (single app container + Postgres)

Run everything with containers:

```
docker compose up --build
```

Services:
- Postgres at `db:5432` (user `snake`, password `snakepass`, db `snake`)
- Combined app on http://localhost:8000 (FastAPI + static frontend served by uvicorn). The app connects to Postgres via `DB_URL=postgresql+psycopg://snake:snakepass@db:5432/snake`.

Notes:
- The frontend is served from the same container/root as the API; hit http://localhost:8000 for both UI and API.
- To inspect DB: `docker compose exec db psql -U snake -d snake -c "select * from users;"`.
