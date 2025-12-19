import assert from "node:assert/strict";
import { SnakeGame } from "../src/game/snake.js";

function bearerFromHeader(header) {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  return token || null;
}

function headerValue(headers, key) {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(key);
  const lowerKey = key.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowerKey) return Array.isArray(v) ? v[0] : v;
  }
  return null;
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_err) {
      return {};
    }
  }
  if (body instanceof Uint8Array) {
    try {
      return JSON.parse(new TextDecoder().decode(body));
    } catch (_err) {
      return {};
    }
  }
  return {};
}

function installFetchMock() {
  const baseUrl = "http://mock.backend";
  const users = new Map([["seed", { username: "seed", password: "snake" }]]);
  const sessions = new Map();
  const leaderboard = new Map([["seed", 80]]);
  const matches = [
    { id: "arena-1", player: "spectre", mode: "pass-through" },
    { id: "arena-2", player: "cirrus", mode: "walls" }
  ];
  const originalFetch = global.fetch;

  function tokenFor(username) {
    return `${username}-${Math.random().toString(36).slice(2)}`;
  }

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  global.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (!url.href.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    const method = (init.method || "GET").toUpperCase();
    const authHeader = headerValue(init.headers, "authorization");
    const bearer = bearerFromHeader(authHeader);
    const body = parseBody(init.body);

    if (method === "POST" && url.pathname === "/auth/signup") {
      if (!body.username || !body.password) return jsonResponse(400, { detail: "Username and password required" });
      if (users.has(body.username)) return jsonResponse(400, { detail: "User already exists" });
      users.set(body.username, { username: body.username, password: body.password });
      leaderboard.set(body.username, 0);
      const token = tokenFor(body.username);
      sessions.set(token, body.username);
      return jsonResponse(201, { token, user: { username: body.username } });
    }

    if (method === "POST" && url.pathname === "/auth/login") {
      const record = users.get(body.username);
      if (!record || record.password !== body.password) return jsonResponse(401, { detail: "Invalid credentials" });
      const token = tokenFor(body.username);
      sessions.set(token, body.username);
      return jsonResponse(200, { token, user: { username: body.username } });
    }

    if (method === "POST" && url.pathname === "/auth/logout") {
      if (!bearer || !sessions.has(bearer)) return jsonResponse(401, { detail: "Missing or invalid token" });
      sessions.delete(bearer);
      return new Response(null, { status: 204 });
    }

    if (method === "GET" && url.pathname === "/auth/me") {
      if (!bearer || !sessions.has(bearer)) return jsonResponse(401, { detail: "Missing or invalid token" });
      return jsonResponse(200, { username: sessions.get(bearer) });
    }

    if (method === "GET" && url.pathname === "/leaderboard") {
      const sorted = Array.from(leaderboard.entries())
        .map(([username, score]) => ({ username, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);
      return jsonResponse(200, sorted);
    }

    if (method === "POST" && url.pathname === "/scores") {
      if (typeof body.score !== "number" || body.score < 0) return jsonResponse(400, { detail: "Invalid score" });
      const username = (bearer && sessions.get(bearer)) || "guest";
      const best = Math.max(leaderboard.get(username) ?? 0, body.score);
      leaderboard.set(username, best);
      return jsonResponse(200, { username, score: best });
    }

    if (method === "GET" && url.pathname === "/watch/matches") {
      return jsonResponse(200, matches);
    }

    if (method === "GET" && url.pathname.startsWith("/watch/") && url.pathname.endsWith("/stream")) {
      const matchId = url.pathname.split("/")[2];
      const match = matches.find((m) => m.id === matchId);
      if (!match) return jsonResponse(404, { detail: "Match not found" });
      const frame = {
        id: match.id,
        player: match.player,
        mode: match.mode,
        board: { cols: 10, rows: 10 },
        snake: [{ x: 5, y: 5 }],
        food: { x: 2, y: 3 },
        score: 40,
        state: "running"
      };
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: frame\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
          controller.close();
        }
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" }
      });
    }

    return jsonResponse(404, { detail: "Not found" });
  };

  return {
    baseUrl,
    restore() {
      global.fetch = originalFetch;
    }
  };
}

let apiModulePromise = null;
let restoreFetch = null;

async function getApi() {
  if (!apiModulePromise) {
    const mock = installFetchMock();
    restoreFetch = mock.restore;
    process.env.API_BASE_URL = mock.baseUrl;
    apiModulePromise = import("../src/backend/api.js");
  }
  return apiModulePromise;
}

async function testPassThroughWrap() {
  const game = new SnakeGame({ cols: 4, rows: 4, mode: "pass-through" });
  game.snake = [
    { x: 3, y: 0 },
    { x: 2, y: 0 },
    { x: 1, y: 0 }
  ];
  game.direction = "right";
  game.nextDirection = "right";
  game.setFoodPosition({ x: 0, y: 3 });
  game.tick();
  const head = game.snake[0];
  assert.equal(head.x, 0, "wraps to opposite edge on X");
  assert.equal(head.y, 0);
}

async function testWallCollisionEndsGame() {
  const game = new SnakeGame({ cols: 4, rows: 4, mode: "walls" });
  game.setDirection("up");
  for (let i = 0; i < 4; i++) game.tick();
  assert.equal(game.state, "dead", "dies on wall collision");
}

async function testFoodGrowth() {
  const game = new SnakeGame({ cols: 6, rows: 6, mode: "walls" });
  const head = game.snake[0];
  game.setFoodPosition({ x: head.x + 1, y: head.y });
  game.tick();
  assert.equal(game.snake.length, 4, "snake grows by one");
  assert.equal(game.score, 10, "score increments");
}

async function testSelfCollision() {
  const game = new SnakeGame({ cols: 5, rows: 5, mode: "pass-through" });
  game.snake = [
    { x: 2, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 }
  ];
  game.direction = "left";
  game.nextDirection = "left";
  game.setFoodPosition({ x: 0, y: 0 });
  game.tick();
  assert.equal(game.state, "dead", "detects self collision");
}

async function testSignupLoginAndLeaderboard() {
  const { signup, login, submitScore, fetchLeaderboard } = await getApi();
  const { token, user } = await signup("tester", "abc123");
  assert.ok(token && user.username === "tester");
  const loginResult = await login("tester", "abc123");
  assert.ok(loginResult.token);
  await submitScore(loginResult.token, 200);
  const leaderboard = await fetchLeaderboard();
  assert.equal(leaderboard[0].username, "tester");
  assert.equal(leaderboard[0].score, 200);
}

async function testLiveMatchesStream() {
  const { listLiveMatches, streamMatch } = await getApi();
  const matches = await listLiveMatches();
  assert.ok(matches.length > 0, "has live matches");
  const frame = await new Promise((resolve, reject) => {
    let timeout;
    let handle = null;
    const cb = (f) => {
      clearTimeout(timeout);
      if (handle?.stop) handle.stop();
      resolve(f);
    };
    timeout = setTimeout(() => {
      handle?.stop();
      reject(new Error("Timed out waiting for stream frame"));
    }, 500);
    handle = streamMatch(matches[0].id, cb);
  });
  assert.ok(frame.snake.length > 0);
  assert.ok(frame.board.cols > 0);
}

async function run() {
  const tests = [
    testPassThroughWrap,
    testWallCollisionEndsGame,
    testFoodGrowth,
    testSelfCollision,
    testSignupLoginAndLeaderboard,
    testLiveMatchesStream
  ];

  let passed = 0;
  try {
    for (const test of tests) {
      try {
        await test();
        passed += 1;
        console.log(`✓ ${test.name}`);
      } catch (err) {
        console.error(`✗ ${test.name}`);
        console.error(err);
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    if (restoreFetch) restoreFetch();
  }
  if (passed === tests.length) {
    console.log(`All ${passed} tests passed`);
  }
}

run();
