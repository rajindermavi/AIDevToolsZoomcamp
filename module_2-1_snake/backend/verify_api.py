import asyncio
import os
import random
import string
from typing import Any, Dict, Optional

import httpx


BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000")


def _random_username(prefix: str = "verifier") -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}-{suffix}"


def _require_status(response: httpx.Response, expected: int) -> Dict[str, Any]:
    if response.status_code != expected:
        raise RuntimeError(f"{response.request.method} {response.request.url} expected {expected}, got {response.status_code}: {response.text}")
    if response.headers.get("content-type", "").startswith("application/json"):
        return response.json()
    return {}


async def main() -> None:
    username = _random_username()
    password = "secret"
    print(f"Using base URL: {BASE_URL}")
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10) as client:
        # Signup (or login if user already exists)
        print("Signing up user...")
        signup = await client.post("/auth/signup", json={"username": username, "password": password})
        if signup.status_code == 400:
            print("User exists, logging in...")
            signup = await client.post("/auth/login", json={"username": username, "password": password})
            _require_status(signup, 200)
        else:
            _require_status(signup, 201)
        token = signup.json()["token"]
        auth_headers = {"Authorization": f"Bearer {token}"}
        print(f"Authenticated as {username}")

        print("Checking /auth/me...")
        me = await client.get("/auth/me", headers=auth_headers)
        payload = _require_status(me, 200)
        assert payload["username"] == username

        print("Submitting authenticated score...")
        score_resp = await client.post("/scores", json={"score": 15}, headers=auth_headers)
        payload = _require_status(score_resp, 200)
        assert payload["username"] == username

        print("Submitting guest score...")
        guest_resp = await client.post("/scores", json={"score": 5})
        _require_status(guest_resp, 200)

        print("Checking leaderboard...")
        leaderboard = await client.get("/leaderboard")
        entries = _require_status(leaderboard, 200)
        assert any(entry["username"] == username for entry in entries), "User missing from leaderboard"

        print("Listing matches...")
        matches = await client.get("/watch/matches")
        match_list = _require_status(matches, 200)
        first_match: Optional[str] = match_list[0]["id"] if match_list else None
        if first_match:
            print(f"Streaming first match {first_match}...")
            async with client.stream("GET", f"/watch/{first_match}/stream") as stream:
                _require_status(stream, 200)
                body = await stream.aread()
                if b"event: frame" not in body:
                    raise RuntimeError("No frame events received from stream")
        else:
            print("No matches available to stream.")

        print("Logging out...")
        logout = await client.post("/auth/logout", headers=auth_headers)
        _require_status(logout, 204)

    print("API verification completed successfully.")


if __name__ == "__main__":
    asyncio.run(main())
