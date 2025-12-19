import asyncio
import json
from pathlib import Path
from typing import List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from db import db
from models import (
    AuthResponse,
    GameFrame,
    LeaderboardEntry,
    MatchSummary,
    SubmitScoreRequest,
    SubmitScoreResponse,
    User,
    UserCredentials,
)

app = FastAPI(
    title="Snake Arcade API",
    version="1.0.0",
    description="API backing the Snake web client. Supports user authentication, leaderboard submissions, and live match watching.",
)

# Allow local frontend (and other dev clients) to call the API from another origin/port.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files (built or raw) from /frontend inside the container.
frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="static")


def parse_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def require_authenticated_user(authorization: Optional[str] = Header(None)) -> tuple[str, str]:
    token = parse_bearer_token(authorization)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token")
    username = db.get_username_for_token(token)
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token")
    return token, username


def optional_authenticated_user(authorization: Optional[str] = Header(None)) -> Optional[str]:
    if authorization is None:
        return None
    token = parse_bearer_token(authorization)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token")
    username = db.get_username_for_token(token)
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token")
    return username


@app.post("/auth/signup", status_code=status.HTTP_201_CREATED, response_model=AuthResponse)
def signup(credentials: UserCredentials) -> AuthResponse:
    try:
        db.create_user(credentials.username, credentials.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    token = db.authenticate(credentials.username, credentials.password)
    return AuthResponse(token=token, user=User(username=credentials.username))


@app.post("/auth/login", response_model=AuthResponse)
def login(credentials: UserCredentials) -> AuthResponse:
    try:
        token = db.authenticate(credentials.username, credentials.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") from exc
    return AuthResponse(token=token, user=User(username=credentials.username))


@app.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token_and_user: tuple[str, str] = Depends(require_authenticated_user)) -> Response:
    token, _ = token_and_user
    db.invalidate_token(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/auth/me", response_model=User)
def current_user(token_and_user: tuple[str, str] = Depends(require_authenticated_user)) -> User:
    _, username = token_and_user
    return User(username=username)


@app.get("/leaderboard", response_model=List[LeaderboardEntry])
def get_leaderboard() -> List[LeaderboardEntry]:
    return db.leaderboard()


@app.post("/scores", response_model=SubmitScoreResponse)
def submit_score(payload: SubmitScoreRequest, username: Optional[str] = Depends(optional_authenticated_user)) -> SubmitScoreResponse:
    selected_user = username or "guest"
    best = db.record_score(selected_user, payload.score)
    return SubmitScoreResponse(username=selected_user, score=best)


@app.get("/watch/matches", response_model=List[MatchSummary])
def list_matches() -> List[MatchSummary]:
    return db.list_matches()


async def _frame_stream(match_id: str):
    frames = db.get_frames(match_id)
    if not frames:
        return
    for frame in frames:
        payload = json.dumps(frame.model_dump())
        yield f"event: frame\n"
        yield f"data: {payload}\n\n"
        await asyncio.sleep(0)


@app.get("/watch/{matchId}/stream")
async def stream_match(matchId: str):
    match = db.get_match(matchId)
    if match is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    generator = _frame_stream(matchId)
    return StreamingResponse(generator, media_type="text/event-stream")
