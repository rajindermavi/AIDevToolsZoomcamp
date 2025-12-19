import os
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import JSON, Column, ForeignKey, Integer, String, create_engine, func, select
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import StaticPool

from models import Board, GameFrame, LeaderboardEntry, MatchSummary, Point

Base = declarative_base()


class UserModel(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True)
    password = Column(String, nullable=False)


class TokenModel(Base):
    __tablename__ = "tokens"
    token = Column(String, primary_key=True)
    username = Column(String, ForeignKey("users.username"), nullable=False)


class ScoreModel(Base):
    __tablename__ = "scores"
    username = Column(String, primary_key=True)
    score = Column(Integer, nullable=False)


class MatchModel(Base):
    __tablename__ = "matches"
    id = Column(String, primary_key=True)
    player = Column(String, nullable=False)
    mode = Column(String, nullable=False)


class FrameModel(Base):
    __tablename__ = "frames"
    id = Column(Integer, primary_key=True, autoincrement=True)
    match_id = Column(String, ForeignKey("matches.id"), nullable=False)
    payload = Column(JSON, nullable=False)


class Database:
    def __init__(self, database_url: Optional[str] = None) -> None:
        self.database_url = database_url or os.getenv("DB_URL", "sqlite:///./app.db")
        self.engine = self._create_engine(self.database_url)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)
        Base.metadata.create_all(self.engine)
        self._ensure_seed_data()

    @staticmethod
    def _normalize_username(username: str) -> str:
        return username.strip().lower()

    def _create_engine(self, url: str):
        kwargs = {"future": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
            if ":memory:" in url:
                kwargs["poolclass"] = StaticPool
        return create_engine(url, **kwargs)

    def _session(self):
        return self.SessionLocal()

    def _ensure_seed_data(self) -> None:
        with self._session() as session:
            existing = session.execute(select(func.count(MatchModel.id))).scalar_one()
            if existing:
                return
            matches = [
                MatchModel(id="arena-1", player="spectre", mode="pass-through"),
                MatchModel(id="arena-2", player="ember", mode="walls"),
            ]
            session.add_all(matches)
            session.flush()  # ensure matches exist before inserting frames with FK
            frames = {
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
            for match_id, frame_list in frames.items():
                for frame in frame_list:
                    session.add(FrameModel(match_id=match_id, payload=frame.model_dump()))
            session.commit()

    def create_user(self, username: str, password: str) -> None:
        username = self._normalize_username(username)
        with self._session() as session:
            exists = session.get(UserModel, username)
            if exists:
                raise ValueError("User already exists")
            session.add(UserModel(username=username, password=password))
            session.commit()

    def authenticate(self, username: str, password: str) -> str:
        username = self._normalize_username(username)
        with self._session() as session:
            user = session.get(UserModel, username)
            if user is None or user.password != password:
                raise ValueError("Invalid credentials")
            token = uuid4().hex
            session.add(TokenModel(token=token, username=username))
            session.commit()
            return token

    def invalidate_token(self, token: str) -> None:
        with self._session() as session:
            session.query(TokenModel).filter(TokenModel.token == token).delete()
            session.commit()

    def get_username_for_token(self, token: str) -> Optional[str]:
        with self._session() as session:
            record = session.get(TokenModel, token)
            return record.username if record else None

    def record_score(self, username: str, score: int) -> int:
        with self._session() as session:
            current = session.get(ScoreModel, username)
            best = max(current.score if current else 0, score)
            if current:
                current.score = best
            else:
                session.add(ScoreModel(username=username, score=best))
            session.commit()
            return best

    def leaderboard(self) -> List[LeaderboardEntry]:
        with self._session() as session:
            rows = session.execute(
                select(ScoreModel.username, ScoreModel.score).order_by(ScoreModel.score.desc()).limit(10)
            ).all()
            return [LeaderboardEntry(username=row.username, score=row.score) for row in rows]

    def list_matches(self) -> List[MatchSummary]:
        with self._session() as session:
            rows = session.execute(select(MatchModel.id, MatchModel.player, MatchModel.mode)).all()
            return [MatchSummary(id=row.id, player=row.player, mode=row.mode) for row in rows]

    def reset(self) -> None:
        with self._session() as session:
            session.query(TokenModel).delete()
            session.query(ScoreModel).delete()
            session.query(UserModel).delete()
            session.commit()

    def get_match(self, match_id: str) -> Optional[MatchSummary]:
        with self._session() as session:
            match = session.get(MatchModel, match_id)
            if not match:
                return None
            return MatchSummary(id=match.id, player=match.player, mode=match.mode)

    def get_frames(self, match_id: str) -> List[GameFrame]:
        with self._session() as session:
            rows = session.execute(
                select(FrameModel.payload).where(FrameModel.match_id == match_id).order_by(FrameModel.id.asc())
            ).all()
            return [GameFrame.model_validate(row.payload) for row in rows]

    @property
    def matches(self) -> List[MatchSummary]:
        """Backward-compatible accessor for list of matches."""
        return self.list_matches()


def init_db(database_url: Optional[str] = None) -> Database:
    global db
    db = Database(database_url)
    return db


# shared instance (defaults to env DB_URL or local sqlite file)
db = Database()
