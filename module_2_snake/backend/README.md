## Overview

FastAPI backend for the Snake Arcade API (see `openapi.yaml`). A mock in-memory store backs authentication, scores/leaderboard, and match streaming; swap `db.py` later for a real database.

## Getting Started

```
uv sync --extra dev
```

Run the server (defaults to port 8000):

```
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

## API Docs

- OpenAPI spec: `openapi.yaml`
- Interactive docs (when server is running): `http://localhost:8000/docs`
- Raw schema: `http://localhost:8000/openapi.json`

## Key Endpoints

- `POST /auth/signup` — create user, returns token
- `POST /auth/login` — authenticate, returns token
- `POST /auth/logout` — invalidate token (requires Bearer token)
- `GET /auth/me` — current user (requires Bearer token)
- `GET /leaderboard` — top scores
- `POST /scores` — submit score (auth optional; defaults to guest)
- `GET /watch/matches` — list matches
- `GET /watch/{matchId}/stream` — SSE frames for a match

## Testing

Run the async test suite:

```
uv run pytest
```

## Smoke Check Against a Running Server

`verify_api.py` exercises the live API end-to-end. With the server running:

```
uv run python verify_api.py
# or point to a different host/port:
API_BASE_URL=http://localhost:8000 uv run python verify_api.py
```

It signs up/logs in, checks `/auth/me`, submits scores (auth + guest), verifies the leaderboard, lists matches, streams frames, and logs out.
