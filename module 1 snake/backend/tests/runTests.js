import assert from "node:assert/strict";
import { SnakeGame } from "../src/game/snake.js";
import {
  signup,
  login,
  fetchLeaderboard,
  submitScore,
  listLiveMatches,
  streamMatch
} from "../src/backend/api.js";

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
  const matches = listLiveMatches();
  assert.ok(matches.length > 0, "has live matches");
  const frame = await new Promise((resolve) => {
    let handle = null;
    const cb = (f) => {
      if (handle?.stop) handle.stop();
      resolve(f);
    };
    handle = streamMatch(matches[0].id, cb);
  });
  assert.ok(frame.snake.length > 0);
  assert.ok(frame.board.cols > 0);
}

const tests = [
  testPassThroughWrap,
  testWallCollisionEndsGame,
  testFoodGrowth,
  testSelfCollision,
  testSignupLoginAndLeaderboard,
  testLiveMatchesStream
];

async function run() {
  let passed = 0;
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
  if (passed === tests.length) {
    console.log(`All ${passed} tests passed`);
  }
}

run();
