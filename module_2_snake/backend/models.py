from typing import List

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
