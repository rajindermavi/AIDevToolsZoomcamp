import { SnakeGame } from "../game/snake.js";

const delay = (ms = 120) => new Promise(resolve => setTimeout(resolve, ms));

const users = new Map([
  ["nora", { username: "nora", password: "snake123" }],
  ["kai", { username: "kai", password: "hunter2" }],
  ["val", { username: "val", password: "passpass" }]
]);

const leaderboardScores = new Map([
  ["nora", 140],
  ["kai", 110],
  ["val", 95]
]);

const sessions = new Map(); // token -> username

function tokenFor(username) {
  return `${username}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUsername(name) {
  return name.trim().toLowerCase();
}

export async function signup(username, password) {
  await delay();
  const key = normalizeUsername(username);
  if (users.has(key)) throw new Error("User already exists");
  const record = { username: key, password };
  users.set(key, record);
  leaderboardScores.set(key, 0);
  const token = tokenFor(key);
  sessions.set(token, key);
  return { token, user: { username: key } };
}

export async function login(username, password) {
  await delay();
  const key = normalizeUsername(username);
  const record = users.get(key);
  if (!record || record.password !== password) {
    throw new Error("Invalid credentials");
  }
  const token = tokenFor(key);
  sessions.set(token, key);
  return { token, user: { username: key } };
}

export async function logout(token) {
  await delay();
  sessions.delete(token);
}

export async function getCurrentUser(token) {
  await delay();
  const username = sessions.get(token);
  if (!username) return null;
  return { username };
}

export async function submitScore(token, score) {
  await delay();
  const username = sessions.get(token) || "guest";
  const prev = leaderboardScores.get(username) ?? 0;
  const next = Math.max(prev, score);
  leaderboardScores.set(username, next);
  return { username, score: next };
}

export async function fetchLeaderboard() {
  await delay();
  return Array.from(leaderboardScores.entries())
    .map(([username, score]) => ({ username, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// ---- Live watching mocks ----

const liveSeeds = [
  { id: "arena-1", player: "spectre", mode: "pass-through" },
  { id: "arena-2", player: "cirrus", mode: "walls" },
  { id: "arena-3", player: "nova", mode: "pass-through" }
];

const liveGames = liveSeeds.map(seed => {
  const game = new SnakeGame({ cols: 10, rows: 10, mode: seed.mode });
  return { ...seed, game, stepsAlive: 0 };
});

function chooseDirection(game) {
  const head = game.snake[0];
  const { food } = game;
  const candidates = [
    { dir: "up", priority: food.y < head.y ? 1 : 2 },
    { dir: "down", priority: food.y > head.y ? 1 : 2 },
    { dir: "left", priority: food.x < head.x ? 1 : 2 },
    { dir: "right", priority: food.x > head.x ? 1 : 2 }
  ];
  candidates.sort((a, b) => a.priority - b.priority);
  for (const candidate of candidates) {
    game.setDirection(candidate.dir);
    const delta = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[candidate.dir];
    const next = { x: head.x + delta.x, y: head.y + delta.y };
    const wrapped = game.mode === "pass-through" ? game._wrap(next) : next;
    if (game.mode === "walls" && game._hitsWall(next)) continue;
    if (game._hitsSelf(wrapped)) continue;
    return candidate.dir;
  }
  return "right";
}

function shapeFrame(liveGame) {
  const { game, id, player, mode } = liveGame;
  return {
    id,
    player,
    mode,
    board: { cols: game.cols, rows: game.rows },
    snake: game.snake.map(s => ({ ...s })),
    food: { ...game.food },
    score: game.score,
    state: game.state
  };
}

export function listLiveMatches() {
  return liveSeeds.map(seed => ({ id: seed.id, player: seed.player, mode: seed.mode }));
}

export function streamMatch(matchId, onFrame) {
  const liveGame = liveGames.find(m => m.id === matchId) || liveGames[0];
  if (!liveGame) throw new Error("No live matches");
  const interval = setInterval(() => {
    if (liveGame.game.state === "dead" || liveGame.stepsAlive > 80) {
      liveGame.game.reset();
      liveGame.stepsAlive = 0;
    }
    const dir = chooseDirection(liveGame.game);
    liveGame.game.setDirection(dir);
    liveGame.game.tick();
    liveGame.stepsAlive += 1;
    onFrame(shapeFrame(liveGame));
  }, 260);

  // Emit initial frame immediately.
  onFrame(shapeFrame(liveGame));

  return {
    stop() {
      clearInterval(interval);
    }
  };
}
