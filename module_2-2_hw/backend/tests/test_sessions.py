import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import INACTIVITY_TIMEOUT, SessionStore, app


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_create_session_returns_id(client):
    resp = client.post("/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert isinstance(data["session_id"], str)
    assert data["session_id"]


def test_join_existing_session_succeeds(client):
    create = client.post("/sessions")
    session_id = create.json()["session_id"]

    join = client.post(f"/sessions/{session_id}")
    assert join.status_code == 200
    data = join.json()
    assert data["session_id"] == session_id
    assert data["language"] == "python"
    assert data["code"] == ""


@pytest.mark.asyncio
async def test_end_session_removes_from_store(client):
    create = client.post("/sessions")
    session_id = create.json()["session_id"]
    store: SessionStore = app.state.session_store

    await store.end_session(session_id, reason="test end")
    with pytest.raises(HTTPException):
        await store.get_session(session_id)


@pytest.mark.asyncio
async def test_expire_inactive_session(client):
    create = client.post("/sessions")
    session_id = create.json()["session_id"]
    store: SessionStore = app.state.session_store
    session = await store.get_session(session_id)

    # make it stale
    session.last_active -= INACTIVITY_TIMEOUT + 1
    expired = await store.expire_stale_once()
    assert session_id in expired
    with pytest.raises(HTTPException):
        await store.get_session(session_id)
