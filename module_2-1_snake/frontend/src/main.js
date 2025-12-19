import {
  signup,
  login,
  logout,
  fetchLeaderboard,
  submitScore,
  listLiveMatches,
  streamMatch
} from "./backend/api.js";
import { SnakeGame } from "./game/snake.js";

const gameCanvas = document.getElementById("game-canvas");
const watchCanvas = document.getElementById("watch-canvas");
const scoreEl = document.getElementById("score");
const modeLabel = document.getElementById("mode-label");
const leaderboardEl = document.getElementById("leaderboard");
const watchPlayerEl = document.getElementById("watch-player");
const watchModeEl = document.getElementById("watch-mode");
const watchStatusEl = document.getElementById("watch-status");
const currentUserEl = document.getElementById("current-user");
const userInfo = document.getElementById("user-info");
const authForms = document.querySelector(".auth-forms");

let authToken = null;
let activeGame = null;
let gameLoopId = null;
let activeStream = null;
let liveMatches = [];
let liveIndex = 0;

function setLoggedIn(user, token) {
  authToken = token;
  if (user) {
    currentUserEl.textContent = user.username;
    userInfo.classList.remove("hidden");
    authForms.classList.add("hidden");
  } else {
    currentUserEl.textContent = "";
    userInfo.classList.add("hidden");
    authForms.classList.remove("hidden");
  }
}

function getSelectedMode() {
  const radio = document.querySelector('input[name="mode"]:checked');
  return radio?.value || "pass-through";
}

function renderGame(state) {
  const ctx = gameCanvas.getContext("2d");
  const cellSize = gameCanvas.width / activeGame.cols;
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // grid
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  for (let x = 0; x <= activeGame.cols; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, gameCanvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= activeGame.rows; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(gameCanvas.width, y * cellSize);
    ctx.stroke();
  }

  // food
  ctx.fillStyle = "#7fb0ff";
  ctx.beginPath();
  ctx.roundRect(
    state.food.x * cellSize + 2,
    state.food.y * cellSize + 2,
    cellSize - 4,
    cellSize - 4,
    6
  );
  ctx.fill();

  // snake
  ctx.fillStyle = "#5df2c8";
  state.snake.forEach((segment, idx) => {
    const radius = idx === 0 ? 8 : 4;
    ctx.beginPath();
    ctx.roundRect(
      segment.x * cellSize + 2,
      segment.y * cellSize + 2,
      cellSize - 4,
      cellSize - 4,
      radius
    );
    ctx.fill();
  });

  scoreEl.textContent = state.score;
  modeLabel.textContent = state.mode === "pass-through" ? "Pass-through" : "Walls";
}

function stopLoop() {
  if (gameLoopId) {
    clearInterval(gameLoopId);
    gameLoopId = null;
  }
}

async function handleGameOver(finalState) {
  stopLoop();
  try {
    await submitScore(authToken, finalState.score);
  } catch (err) {
    console.error("Failed to submit score", err);
  }
  refreshLeaderboard();
}

function startGame() {
  stopLoop();
  const mode = getSelectedMode();
  activeGame = new SnakeGame({ cols: 18, rows: 18, mode });
  renderGame(activeGame.getState());
  gameLoopId = setInterval(async () => {
    const state = activeGame.tick();
    renderGame(state);
    if (state.state === "dead") {
      await handleGameOver(state);
    }
  }, 160);
}

function togglePause() {
  if (!activeGame) return;
  if (gameLoopId) {
    stopLoop();
  } else {
    gameLoopId = setInterval(async () => {
      const state = activeGame.tick();
      renderGame(state);
      if (state.state === "dead") {
        await handleGameOver(state);
      }
    }, 160);
  }
}

async function refreshLeaderboard() {
  leaderboardEl.innerHTML = "";
  try {
    const entries = await fetchLeaderboard();
    entries.forEach((entry, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>#${idx + 1} ${entry.username}</span><span>${entry.score}</span>`;
      leaderboardEl.appendChild(li);
    });
  } catch (err) {
    const li = document.createElement("li");
    li.textContent = `Leaderboard unavailable: ${err.message}`;
    leaderboardEl.appendChild(li);
  }
}

function setupAuthForms() {
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  const logoutBtn = document.getElementById("logout-btn");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(loginForm);
    try {
      const { token, user } = await login(formData.get("username"), formData.get("password"));
      setLoggedIn(user, token);
      refreshLeaderboard();
    } catch (err) {
      alert(err.message);
    }
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(signupForm);
    try {
      const { token, user } = await signup(formData.get("username"), formData.get("password"));
      setLoggedIn(user, token);
      refreshLeaderboard();
    } catch (err) {
      alert(err.message);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await logout(authToken);
    setLoggedIn(null, null);
  });
}

function drawWatchFrame(frame) {
  const ctx = watchCanvas.getContext("2d");
  const cellSize = watchCanvas.width / frame.board.cols;
  ctx.clearRect(0, 0, watchCanvas.width, watchCanvas.height);

  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fillRect(0, 0, watchCanvas.width, watchCanvas.height);

  ctx.fillStyle = "#7fb0ff";
  ctx.fillRect(frame.food.x * cellSize + 2, frame.food.y * cellSize + 2, cellSize - 4, cellSize - 4);

  ctx.fillStyle = "#f2d95d";
  frame.snake.forEach(segment => {
    ctx.fillRect(segment.x * cellSize + 1, segment.y * cellSize + 1, cellSize - 2, cellSize - 2);
  });

  watchPlayerEl.textContent = `Player: ${frame.player}`;
  watchModeEl.textContent = `Mode: ${frame.mode}`;
  watchStatusEl.textContent = `Score: ${frame.score}`;
}

function startStream(index) {
  if (activeStream?.stop) activeStream.stop();
  const match = liveMatches[index % liveMatches.length];
  if (!match) {
    watchStatusEl.textContent = "No live matches";
    return;
  }
  watchStatusEl.textContent = "Connecting...";
  activeStream = streamMatch(match.id, (frame) => {
    drawWatchFrame(frame);
    watchStatusEl.textContent = `Score: ${frame.score}`;
  });
}

async function setupWatching() {
  try {
    liveMatches = await listLiveMatches();
  } catch (err) {
    watchStatusEl.textContent = `Live feed unavailable: ${err.message}`;
    return;
  }
  if (!liveMatches.length) {
    watchStatusEl.textContent = "No live matches";
    return;
  }
  liveIndex = 0;
  startStream(liveIndex);
  document.getElementById("switch-stream").addEventListener("click", () => {
    liveIndex = (liveIndex + 1) % liveMatches.length;
    startStream(liveIndex);
  });
}

function setupControls() {
  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("pause-btn").addEventListener("click", togglePause);
  document.getElementById("refresh-leaderboard").addEventListener("click", refreshLeaderboard);
  window.addEventListener("keydown", (evt) => {
    if (!activeGame) return;
    const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
    const dir = map[evt.key];
    if (dir) activeGame.setDirection(dir);
  });
}

async function init() {
  setupAuthForms();
  setupControls();
  await Promise.all([setupWatching(), refreshLeaderboard()]);
}

init();
