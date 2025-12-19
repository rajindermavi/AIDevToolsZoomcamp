import sys
from pathlib import Path

import pytest
import httpx
import pytest_asyncio

# Ensure the backend source directory is importable regardless of invocation path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from main import app
from db import db


@pytest.fixture(autouse=True)
def reset_db():
    db.reset()
    yield
    db.reset()


@pytest_asyncio.fixture
async def client():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_signup_and_me(client):
    response = await client.post("/auth/signup", json={"username": "alice", "password": "secret"})
    assert response.status_code == 201
    token = response.json()["token"]

    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "alice"


@pytest.mark.asyncio
async def test_login_invalid_credentials(client):
    await client.post("/auth/signup", json={"username": "bob", "password": "hunter2"})
    response = await client.post("/auth/login", json={"username": "bob", "password": "wrong"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_token(client):
    signup = await client.post("/auth/signup", json={"username": "cathy", "password": "pw"})
    token = signup.json()["token"]

    logout = await client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert logout.status_code == 204

    me = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_submit_score_authenticated_and_guest(client):
    signup = await client.post("/auth/signup", json={"username": "drew", "password": "pw"})
    token = signup.json()["token"]

    auth_score = await client.post("/scores", json={"score": 10}, headers={"Authorization": f"Bearer {token}"})
    assert auth_score.status_code == 200
    assert auth_score.json() == {"username": "drew", "score": 10}

    # submitting lower score keeps the best one
    lower = await client.post("/scores", json={"score": 2}, headers={"Authorization": f"Bearer {token}"})
    assert lower.json()["score"] == 10

    guest_score = await client.post("/scores", json={"score": 7})
    assert guest_score.status_code == 200
    assert guest_score.json()["username"] == "guest"

    leaderboard = await client.get("/leaderboard")
    assert leaderboard.status_code == 200
    entries = leaderboard.json()
    assert entries[0]["username"] == "drew"
    assert entries[0]["score"] == 10


@pytest.mark.asyncio
async def test_submit_score_rejects_invalid_token(client):
    response = await client.post("/scores", json={"score": 5}, headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_matches_and_stream(client):
    matches = await client.get("/watch/matches")
    assert matches.status_code == 200
    payload = matches.json()
    assert any(match["id"] == "arena-1" for match in payload)

    async with client.stream("GET", "/watch/arena-1/stream") as response:
        assert response.status_code == 200
        body = await response.aread()
        assert b"event: frame" in body

    invalid = await client.get("/watch/unknown/stream")
    assert invalid.status_code == 404
