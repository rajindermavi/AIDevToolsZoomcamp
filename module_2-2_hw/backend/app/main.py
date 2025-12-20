import asyncio
import contextlib
import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel


INACTIVITY_TIMEOUT = 15 * 60  # seconds
RUN_TIMEOUT = 10  # seconds


class SessionCreateResponse(BaseModel):
    session_id: str


class SessionJoinResponse(BaseModel):
    session_id: str
    language: str
    code: str


class RunResult(BaseModel):
    stdout: str
    stderr: str
    language: str


@dataclass
class Session:
    session_id: str
    language: str = "python"
    code: str = ""
    connections: Set[WebSocket] = field(default_factory=set)
    last_active: float = field(default_factory=lambda: time.monotonic())
    ended: bool = False

    def touch(self) -> None:
        self.last_active = time.monotonic()


class SessionStore:
    def __init__(self) -> None:
        self.sessions: Dict[str, Session] = {}
        self.lock = asyncio.Lock()

    async def create_session(self) -> Session:
        async with self.lock:
            session_id = uuid.uuid4().hex
            session = Session(session_id=session_id)
            self.sessions[session_id] = session
            return session

    async def get_session(self, session_id: str) -> Session:
        session = self.sessions.get(session_id)
        if not session or session.ended:
            raise HTTPException(status_code=404, detail="Session not found or expired")
        return session

    async def end_session(self, session_id: str, reason: str = "ended") -> None:
        async with self.lock:
            session = self.sessions.get(session_id)
            if not session:
                return
            session.ended = True
            connections = list(session.connections)
            session.connections.clear()
            self.sessions.pop(session_id, None)
        payload = json.dumps({"type": "ended", "reason": reason})
        for ws in connections:
            try:
                await ws.send_text(payload)
                await ws.close()
            except Exception:
                continue

    async def expire_stale_once(self) -> List[str]:
        now = time.monotonic()
        expired: List[str] = []
        async with self.lock:
            for session_id, session in list(self.sessions.items()):
                if session.connections:
                    continue
                if now - session.last_active >= INACTIVITY_TIMEOUT:
                    expired.append(session_id)
                    session.ended = True
                    self.sessions.pop(session_id, None)
        return expired

    async def expire_inactive_sessions(self) -> None:
        while True:
            await asyncio.sleep(60)
            await self.expire_stale_once()


async def get_store() -> SessionStore:
    return app.state.session_store


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event() -> None:
    app.state.session_store = SessionStore()
    app.state.cleanup_task = asyncio.create_task(app.state.session_store.expire_inactive_sessions())


@app.on_event("shutdown")
async def shutdown_event() -> None:
    cleanup: asyncio.Task = app.state.cleanup_task
    cleanup.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await cleanup


@app.post("/sessions", response_model=SessionCreateResponse)
async def create_session(store: SessionStore = Depends(get_store)) -> JSONResponse:
    session = await store.create_session()
    return JSONResponse({"session_id": session.session_id})


@app.post("/sessions/{session_id}", response_model=SessionJoinResponse)
async def join_session(session_id: str, store: SessionStore = Depends(get_store)) -> JSONResponse:
    session = await store.get_session(session_id)
    session.touch()
    return JSONResponse({"session_id": session.session_id, "language": session.language, "code": session.code})


async def broadcast(session: Session, message: dict, skip: Optional[WebSocket] = None) -> None:
    payload = json.dumps(message)
    to_remove: List[WebSocket] = []
    for ws in session.connections:
        if ws == skip:
            continue
        try:
            await ws.send_text(payload)
        except Exception:
            to_remove.append(ws)
    for ws in to_remove:
        session.connections.discard(ws)


async def execute_code(language: str, code: str) -> RunResult:
    if language == "python":
        cmd = ["python", "-c", code]
    elif language == "javascript":
        cmd = ["node", "-e", code]
    else:
        return RunResult(stdout="", stderr=f"Unsupported language: {language}", language=language)

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=RUN_TIMEOUT)
        except asyncio.TimeoutError:
            proc.kill()
            return RunResult(stdout="", stderr="Execution timed out", language=language)
        return RunResult(stdout=stdout.decode(), stderr=stderr.decode(), language=language)
    except FileNotFoundError:
        return RunResult(stdout="", stderr=f"Runtime not available for {language}", language=language)
    except Exception as exc:  # pragma: no cover
        return RunResult(stdout="", stderr=f"Execution error: {exc}", language=language)


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str, store: SessionStore = Depends(get_store)) -> None:
    session = await store.get_session(session_id)
    await websocket.accept()
    session.connections.add(websocket)
    await websocket.send_text(json.dumps({"type": "init", "language": session.language, "code": session.code}))
    try:
        while True:
            message = await websocket.receive_text()
            session.touch()
            try:
                payload = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid message"}))
                continue

            mtype = payload.get("type")
            if mtype == "edit":
                session.code = payload.get("code", "")
                await broadcast(session, {"type": "edit", "code": session.code}, skip=websocket)
            elif mtype == "language":
                lang = payload.get("language", session.language)
                session.language = lang
                await broadcast(session, {"type": "language", "language": lang}, skip=websocket)
            elif mtype == "run":
                result = await execute_code(session.language, session.code)
                await broadcast(
                    session,
                    {"type": "run_result", "stdout": result.stdout, "stderr": result.stderr, "language": result.language},
                )
            elif mtype == "end":
                await store.end_session(session_id, reason="ended by user")
                break
            else:
                await websocket.send_text(json.dumps({"type": "error", "message": "Unknown message type"}))
    except WebSocketDisconnect:
        session.connections.discard(websocket)
        session.touch()
    except Exception:
        session.connections.discard(websocket)
        session.touch()
        raise
    finally:
        session.connections.discard(websocket)
        if not session.connections:
            session.touch()
