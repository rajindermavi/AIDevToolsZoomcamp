import asyncio
import json
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


class UserCredentials(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


class AuthResponse(BaseModel):
    token: str
    user: User


class SubmitScoreRequest(BaseModel):
    score: int = Field(..., ge=0)


class SubmitScoreResponse(BaseModel):
    username: str
    score: int


class LeaderboardEntry(BaseModel):
    username: str
    score: int


class MatchSummary(BaseModel):
    id: str
    player: str
    mode: str


class Board(BaseModel):
    cols: int
    rows: int


class Point(BaseModel):
    x: int
    y: int


class GameFrame(BaseModel):
    id: str
    player: str
    mode: str
    board: Board
    snake: List[Point]
    food: Point
    score: int
    state: str


class MockDatabase:
    def __init__(self) -> None:
        self.users: Dict[str, str] = {}
        self.tokens: Dict[str, str] = {}
        self.scores: Dict[str, int] = {}
        self.matches: List[MatchSummary] = [
            MatchSummary(id="arena-1", player="spectre", mode="pass-through"),
            MatchSummary(id="arena-2", player="ember", mode="walls"),
        ]
        self.frames: Dict[str, List[GameFrame]] = {
            "arena-1": [
                GameFrame(
                    id="arena-1",
                    player="spectre",
                    mode="pass-through",
                    board=Board(cols=10, rows=10),
                    snake=[Point(x=5, y=5), Point(x=5, y=4)],
                    food=Point(x=3, y=7),
                    score=20,
                    state="running",
                )
            ],
            "arena-2": [
                GameFrame(
                    id="arena-2",
                    player="ember",
                    mode="walls",
                    board=Board(cols=12, rows=12),
                    snake=[Point(x=6, y=6)],
                    food=Point(x=2, y=9),
                    score=10,
                    state="running",
                )
            ],
        }

    def create_user(self, username: str, password: str) -> None:
        if username in self.users:
            raise ValueError("User already exists")
        self.users[username] = password

    def authenticate(self, username: str, password: str) -> str:
        stored = self.users.get(username)
        if stored is None or stored != password:
            raise ValueError("Invalid credentials")
        token = uuid4().hex
        self.tokens[token] = username
        return token

    def invalidate_token(self, token: str) -> None:
        self.tokens.pop(token, None)

    def get_username_for_token(self, token: str) -> Optional[str]:
        return self.tokens.get(token)

    def record_score(self, username: str, score: int) -> int:
        best = max(self.scores.get(username, 0), score)
        self.scores[username] = best
        return best

    def leaderboard(self) -> List[LeaderboardEntry]:
        entries = [
            LeaderboardEntry(username=username, score=score)
            for username, score in self.scores.items()
        ]
        entries.sort(key=lambda entry: entry.score, reverse=True)
        return entries[:10]

    def reset(self) -> None:
        self.users.clear()
        self.tokens.clear()
        self.scores.clear()

    def get_match(self, match_id: str) -> Optional[MatchSummary]:
        return next((m for m in self.matches if m.id == match_id), None)

    def get_frames(self, match_id: str) -> List[GameFrame]:
        return self.frames.get(match_id, [])


db = MockDatabase()

app = FastAPI(
    title="Snake Arcade API",
    version="1.0.0",
    description="API backing the Snake web client. Supports user authentication, leaderboard submissions, and live match watching.",
)


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
    return db.matches


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
