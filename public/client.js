const statusEl = document.getElementById("status");

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#111820",
  physics: {
    default: "matter",
    matter: {
      gravity: { y: 0 }
    }
  },
  scene: {
    preload,
    create,
    update
  }
};

let game;
let socket;
let localId = null;
let localSide = null;
let serverState = null;
let predictedPlayer = null;
let lastInputSent = 0;
let maxFullness = 100;

const MOVE_SPEED = 220;
const MAX_ANGULAR_SPEED = 4.5;
const CHOPSTICK_LENGTH = 80;
const CONE_RADIUS = 70;
const CONE_HALF_ANGLE = Math.PI / 7;
const MOUTH_RADIUS = 18;

function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function wrapAngle(angle) {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
}

function rotateTowards(current, target, maxDelta) {
  const delta = wrapAngle(target - current);
  const clamped = Math.max(-maxDelta, Math.min(maxDelta, delta));
  return wrapAngle(current + clamped);
}

function tipPosition(player) {
  return {
    x: player.x + Math.cos(player.angle) * CHOPSTICK_LENGTH,
    y: player.y + Math.sin(player.angle) * CHOPSTICK_LENGTH
  };
}

function mouthPosition(player) {
  const offset = player.side === "left" ? 22 : -22;
  return { x: player.x + offset, y: player.y - 8 };
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${window.location.host}`);

  socket.addEventListener("open", () => {
    statusEl.textContent = "等待玩家加入...";
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "welcome") {
      localId = msg.id;
      localSide = msg.side;
      maxFullness = msg.config.maxFullness;
      if (!game) {
        config.width = msg.config.width;
        config.height = msg.config.height;
        game = new Phaser.Game(config);
      }
    }
    if (msg.type === "state") {
      serverState = msg;
      if (msg.gameOver) {
        const winText =
          msg.loserId === localId ? "你被吃撑了！" : "对手被吃撑了！";
        statusEl.textContent = `比赛结束：${winText}`;
      } else {
        const hasOpponent =
          msg.players.filter((player) => player.id !== localId).length > 0;
        statusEl.textContent = hasOpponent ? "战斗中" : "等待玩家加入...";
      }
    }
    if (msg.type === "full") {
      statusEl.textContent = "房间已满";
    }
  });
}

function preload() {}

function create() {
  this.graphics = this.add.graphics();
  this.uiText = this.add.text(16, 80, "", {
    fontSize: "14px",
    color: "#f2e9d8"
  });
  this.cursors = this.input.keyboard.addKeys({
    up: "W",
    down: "S",
    left: "A",
    right: "D",
    release: "SPACE"
  });
  this.input.on("pointermove", () => {});
}

function update(time, delta) {
  if (!serverState || !localId) return;
  const dt = delta / 1000;
  const player = serverState.players.find((p) => p.id === localId);
  if (!player) return;

  if (!predictedPlayer) {
    predictedPlayer = { ...player };
  }

  const moveInput = getMoveInput(this.cursors);
  const targetAim = getAimAngle(this, predictedPlayer);

  predictedPlayer.angle = rotateTowards(
    predictedPlayer.angle,
    targetAim,
    MAX_ANGULAR_SPEED * dt
  );
  predictedPlayer.x += moveInput.x * MOVE_SPEED * dt;
  predictedPlayer.y += moveInput.y * MOVE_SPEED * dt;
  predictedPlayer.x = Phaser.Math.Clamp(predictedPlayer.x, 60, config.width - 60);
  predictedPlayer.y = Phaser.Math.Clamp(predictedPlayer.y, 80, config.height - 60);

  const serverPlayer = player;
  const distance = Phaser.Math.Distance.Between(
    predictedPlayer.x,
    predictedPlayer.y,
    serverPlayer.x,
    serverPlayer.y
  );
  const angleDiff = Math.abs(wrapAngle(serverPlayer.angle - predictedPlayer.angle));
  if (distance > 40 || angleDiff > 0.9) {
    predictedPlayer.x = serverPlayer.x;
    predictedPlayer.y = serverPlayer.y;
    predictedPlayer.angle = serverPlayer.angle;
  } else {
    predictedPlayer.x = Phaser.Math.Linear(
      predictedPlayer.x,
      serverPlayer.x,
      0.1
    );
    predictedPlayer.y = Phaser.Math.Linear(
      predictedPlayer.y,
      serverPlayer.y,
      0.1
    );
    predictedPlayer.angle = rotateTowards(
      predictedPlayer.angle,
      serverPlayer.angle,
      MAX_ANGULAR_SPEED * dt
    );
  }

  const release = Phaser.Input.Keyboard.JustDown(this.cursors.release);
  sendInput(time, moveInput, targetAim, release);

  renderScene(this, predictedPlayer, serverState);
}

function getMoveInput(keys) {
  const x = (keys.right.isDown ? 1 : 0) - (keys.left.isDown ? 1 : 0);
  const y = (keys.down.isDown ? 1 : 0) - (keys.up.isDown ? 1 : 0);
  return normalize(x, y);
}

function getAimAngle(scene, player) {
  const pointer = scene.input.activePointer;
  return Math.atan2(pointer.worldY - player.y, pointer.worldX - player.x);
}

function sendInput(time, move, aim, release) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  if (time - lastInputSent < 16) return;
  lastInputSent = time;
  socket.send(
    JSON.stringify({
      type: "input",
      move: { x: move.x, y: move.y },
      aim,
      release
    })
  );
}

function renderScene(scene, localPlayer, state) {
  const g = scene.graphics;
  g.clear();
  g.fillStyle(0x111820, 1);
  g.fillRect(0, 0, config.width, config.height);

  const players = state.players.map((player) => {
    if (player.id === localId) {
      return { ...localPlayer, side: player.side, fullness: player.fullness };
    }
    return player;
  });

  for (const player of players) {
    const color = player.side === "left" ? 0x5aa9e6 : 0xf38ba0;
    g.fillStyle(color, 1);
    g.fillCircle(player.x, player.y, 18);

    const tip = tipPosition(player);
    g.lineStyle(4, 0xf2e9d8, 1);
    g.beginPath();
    g.moveTo(player.x, player.y);
    g.lineTo(tip.x, tip.y);
    g.strokePath();

    const mouth = mouthPosition(player);
    g.lineStyle(2, 0xffd86b, 0.7);
    g.strokeCircle(mouth.x, mouth.y, MOUTH_RADIUS);

    drawCone(g, tip, player.angle, CONE_RADIUS, CONE_HALF_ANGLE, 0x4b7867);
  }

  for (const food of state.foods) {
    let color = 0xf5d76e;
    if (food.state === "held") {
      const holder = players.find((p) => p.id === food.heldBy);
      color = holder?.side === "left" ? 0x4fc3f7 : 0xff7043;
    }
    g.fillStyle(color, 1);
    g.fillCircle(food.x, food.y, 10);
  }

  scene.uiText.setText(buildHud(players, state));
}

function buildHud(players, state) {
  const left = players.find((p) => p.side === "left");
  const right = players.find((p) => p.side === "right");
  const leftValue = left ? Math.min(left.fullness, maxFullness) : 0;
  const rightValue = right ? Math.min(right.fullness, maxFullness) : 0;
  const leftBar = makeBar(leftValue, maxFullness);
  const rightBar = makeBar(rightValue, maxFullness);
  const status = state.gameOver
    ? state.loserId === localId
      ? "你被吃撑了"
      : "对手被吃撑了"
    : "对战中";
  return `左侧饱腹 ${leftBar}  ${leftValue}/${maxFullness}\n右侧饱腹 ${rightBar}  ${rightValue}/${maxFullness}\n状态：${status}`;
}

function makeBar(value, max) {
  const total = 12;
  const filled = Math.round((value / max) * total);
  return "=".repeat(filled) + ".".repeat(total - filled);
}

function drawCone(graphics, origin, angle, radius, halfAngle, color) {
  const startAngle = angle - halfAngle;
  const endAngle = angle + halfAngle;
  graphics.lineStyle(2, color, 0.6);
  graphics.beginPath();
  graphics.moveTo(origin.x, origin.y);
  graphics.lineTo(
    origin.x + Math.cos(startAngle) * radius,
    origin.y + Math.sin(startAngle) * radius
  );
  graphics.moveTo(origin.x, origin.y);
  graphics.lineTo(
    origin.x + Math.cos(endAngle) * radius,
    origin.y + Math.sin(endAngle) * radius
  );
  graphics.strokePath();
  graphics.lineStyle(1, color, 0.25);
  graphics.strokeCircle(origin.x, origin.y, radius);
}

connect();
