from typing import Dict, List, Optional
from uuid import uuid4

from models import Board, GameFrame, LeaderboardEntry, MatchSummary, Point


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


# shared in-memory instance
db = MockDatabase()
