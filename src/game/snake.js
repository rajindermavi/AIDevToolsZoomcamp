const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

function isOpposite(a, b) {
  return (a === "up" && b === "down") ||
         (a === "down" && b === "up") ||
         (a === "left" && b === "right") ||
         (a === "right" && b === "left");
}

function pointKey(p) {
  return `${p.x},${p.y}`;
}

export class SnakeGame {
  constructor({ cols = 12, rows = 12, mode = "pass-through" } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.mode = mode;
    this.reset();
  }

  reset() {
    const centerX = Math.floor(this.cols / 2);
    const centerY = Math.floor(this.rows / 2);
    this.direction = "right";
    this.nextDirection = "right";
    this.snake = [
      { x: centerX + 1, y: centerY },
      { x: centerX, y: centerY },
      { x: centerX - 1, y: centerY }
    ];
    this.state = "running";
    this.score = 0;
    this.food = this._spawnFood();
  }

  setMode(mode) {
    this.mode = mode;
  }

  setDirection(dir) {
    if (!DIRS[dir]) return;
    if (isOpposite(this.direction, dir)) return;
    this.nextDirection = dir;
  }

  setFoodPosition(pos) {
    this.food = { ...pos };
  }

  getState() {
    return {
      mode: this.mode,
      direction: this.direction,
      snake: this.snake.map(s => ({ ...s })),
      food: { ...this.food },
      state: this.state,
      score: this.score
    };
  }

  tick() {
    if (this.state === "dead") {
      return this.getState();
    }

    this.direction = this.nextDirection;
    const delta = DIRS[this.direction];
    let newHead = { x: this.snake[0].x + delta.x, y: this.snake[0].y + delta.y };

    if (this.mode === "pass-through") {
      newHead = this._wrap(newHead);
    } else if (this._hitsWall(newHead)) {
      this.state = "dead";
      return this.getState();
    }

    if (this._hitsSelf(newHead)) {
      this.state = "dead";
      return this.getState();
    }

    const ateFood = newHead.x === this.food.x && newHead.y === this.food.y;

    this.snake.unshift(newHead);
    if (ateFood) {
      this.score += 10;
      this.food = this._spawnFood();
    } else {
      this.snake.pop();
    }

    return this.getState();
  }

  _wrap(point) {
    let { x, y } = point;
    if (x < 0) x = this.cols - 1;
    if (x >= this.cols) x = 0;
    if (y < 0) y = this.rows - 1;
    if (y >= this.rows) y = 0;
    return { x, y };
  }

  _hitsWall(point) {
    return point.x < 0 || point.x >= this.cols || point.y < 0 || point.y >= this.rows;
  }

  _hitsSelf(point) {
    const set = new Set(this.snake.map(pointKey));
    return set.has(pointKey(point));
  }

  _spawnFood() {
    const occupied = new Set(this.snake.map(pointKey));
    let attempts = 0;
    while (attempts < 200) {
      const pos = { x: Math.floor(Math.random() * this.cols), y: Math.floor(Math.random() * this.rows) };
      if (!occupied.has(pointKey(pos))) return pos;
      attempts += 1;
    }
    // fallback to first free cell
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const pos = { x, y };
        if (!occupied.has(pointKey(pos))) return pos;
      }
    }
    return { x: 0, y: 0 };
  }
}
