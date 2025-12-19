import sys
from importlib import reload
from pathlib import Path

import httpx
import pytest
import pytest_asyncio

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture()
def app_and_db(tmp_path):
    db_path = tmp_path / "integration.db"
    db_url = f"sqlite:///{db_path}"

    import db as db_module

    db_module.init_db(db_url)

    import main as main_module

    reload(main_module)
    return main_module.app, main_module.db


@pytest_asyncio.fixture
async def client(app_and_db):
    app, _ = app_and_db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def test_seeded_matches_exist(app_and_db):
    _, db = app_and_db
    assert db.get_match("arena-1") is not None
    assert db.get_frames("arena-1"), "expected seeded frames for arena-1"


@pytest.mark.asyncio
async def test_signup_and_scores_persist(client):
    signup = await client.post("/auth/signup", json={"username": "ivy", "password": "pw"})
    assert signup.status_code == 201
    token = signup.json()["token"]

    score = await client.post("/scores", json={"score": 42}, headers={"Authorization": f"Bearer {token}"})
    assert score.status_code == 200
    assert score.json()["score"] == 42

    leaderboard = await client.get("/leaderboard")
    assert leaderboard.status_code == 200
    assert leaderboard.json()[0]["username"] == "ivy"


@pytest.mark.asyncio
async def test_live_frames_stream_from_sqlite(client):
    matches = await client.get("/watch/matches")
    assert matches.status_code == 200
    match_id = matches.json()[0]["id"]

    async with client.stream("GET", f"/watch/{match_id}/stream") as response:
        assert response.status_code == 200
        body = await response.aread()
        assert b"event: frame" in body
