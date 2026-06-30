const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const animalList = document.getElementById("animalList");
const statusPanel = document.getElementById("statusPanel");
const banner = document.getElementById("banner");
const topBar = document.getElementById("topBar");
const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");

const world = {
  width: canvas.width,
  height: canvas.height,
};

const animals = {
  rat: {
    label: "Rat",
    color: "#d7d2c9",
    speed: 210,
    radius: 14,
    maxHealth: 100,
    damageTaken: 1,
    attackDamage: 0,
    abilityCooldown: 0.9,
    description: "Small target. Quick feet. Great at slipping through fire.",
    vulnerability: "Low damage output.",
    abilityName: "Scurry burst",
  },
  elephant: {
    label: "Elephant",
    color: "#98a8b8",
    speed: 145,
    radius: 24,
    maxHealth: 150,
    damageTaken: 1.35,
    attackDamage: 52,
    abilityCooldown: 1.8,
    description: "Tramples enemies in a heavy charge.",
    vulnerability: "Huge target that eats more bullets.",
    abilityName: "Trample",
  },
  fox: {
    label: "Fox",
    color: "#f59f55",
    speed: 195,
    radius: 15,
    maxHealth: 82,
    damageTaken: 1.15,
    attackDamage: 68,
    abilityCooldown: 0.8,
    description: "Quick bite for close assassinations.",
    vulnerability: "Fragile if caught in the open.",
    abilityName: "Bite",
  },
  wolf: {
    label: "Wolf",
    color: "#bcc6cb",
    speed: 188,
    radius: 17,
    maxHealth: 108,
    damageTaken: 1.05,
    attackDamage: 30,
    abilityCooldown: 1.1,
    description: "Wide claw swipe cuts through groups.",
    vulnerability: "Commits into melee range.",
    abilityName: "Claw",
  },
  bird: {
    label: "Bird",
    color: "#f1e0a8",
    speed: 225,
    radius: 13,
    maxHealth: 72,
    damageTaken: 1.2,
    attackDamage: 22,
    abilityCooldown: 1.5,
    description: "Grabs a gunner and drops them hard.",
    vulnerability: "Very low health.",
    abilityName: "Lift & drop",
  },
};

const cageBlueprints = [
  { x: 150, y: 120, animal: "elephant" },
  { x: 760, y: 120, animal: "fox" },
  { x: 180, y: 470, animal: "wolf" },
  { x: 780, y: 460, animal: "bird" },
];

const keys = new Set();

const state = {
  player: null,
  enemies: [],
  boss: null,
  bullets: [],
  pendingSpawns: [],
  healthPacks: [],
  healthPackTimer: 0,
  cages: [],
  unlockedAnimals: ["rat"],
  enemiesDisabled: 0,
  bossDefeated: false,
  victory: false,
  gameOver: false,
  started: false,
  paused: false,
  lastTime: 0,
  message: "",
  messageUntil: 0,
};

function createPlayer(form) {
  const base = animals[form];
  return {
    x: world.width / 2,
    y: world.height / 2,
    vx: 0,
    vy: 0,
    form,
    radius: base.radius,
    hp: base.maxHealth,
    abilityTimer: 0,
    invulnerableTimer: 0,
    effectTimer: 0,
    effectType: "",
    carryingEnemyId: null,
  };
}

function resetGame() {
  state.player = createPlayer("rat");
  state.bullets = [];
  state.pendingSpawns = [];
  state.healthPacks = [];
  state.healthPackTimer = 7;
  state.enemiesDisabled = 0;
  state.boss = null;
  state.bossDefeated = false;
  state.victory = false;
  state.gameOver = false;
  state.started = true;
  state.paused = false;
  state.unlockedAnimals = ["rat"];
  state.cages = cageBlueprints.map((cage, index) => ({
    ...cage,
    id: index,
    freed: false,
  }));
  state.enemies = [];
  spawnEnemies(2);
  spawnHealthPack();
  spawnHealthPack();
  startOverlay.classList.add("hidden");
  showBanner("Free the animals. Every rescue adds another gun barrel.");
}

function initializeStartState() {
  state.player = createPlayer("rat");
  state.cages = cageBlueprints.map((cage, index) => ({
    ...cage,
    id: index,
    freed: false,
  }));
  state.enemies = [];
  state.boss = null;
  state.pendingSpawns = [];
  state.healthPacks = [];
  state.unlockedAnimals = ["rat"];
  state.bossDefeated = false;
  state.victory = false;
  state.gameOver = false;
  state.started = false;
  state.paused = false;
}

function rescuedAnimalCount() {
  return state.cages.filter((cage) => cage.freed).length;
}

function finalLockedCage() {
  if (rescuedAnimalCount() !== 3 || state.bossDefeated) {
    return null;
  }

  return state.cages.find((cage) => !cage.freed) || null;
}

function isFinalCageLocked(cage) {
  const locked = finalLockedCage();
  return Boolean(locked && locked.id === cage.id);
}

function spawnBoss() {
  const position = randomOpenPosition(110, 140, [state.player, ...state.cages.filter((cage) => !cage.freed), ...state.enemies]);
  state.boss = {
    x: position.x,
    y: position.y,
    radius: 34,
    hp: 280,
    maxHp: 280,
    fireCooldown: 1.15,
    fireTimer: 0.8,
    angle: 0,
    weakSpotRadius: 11,
  };
  queueRandomBoardSpawns(6, 0.15);
}

function spawnEnemies(count) {
  queueEnemySpawns(count, 0);
}

function queueEnemySpawns(count, delay = 0.7) {
  const edgeSpawns = [
    { x: 70, y: 70 },
    { x: world.width - 70, y: 70 },
    { x: 70, y: world.height - 70 },
    { x: world.width - 70, y: world.height - 70 },
    { x: world.width / 2, y: 70 },
    { x: world.width / 2, y: world.height - 70 },
  ];

  for (let i = 0; i < count; i += 1) {
    const minimumPlayerGap = 170;
    const viableSpawns = edgeSpawns.filter(
      (slot) => distance(slot, state.player) >= minimumPlayerGap
    );
    const spawnPool = viableSpawns.length > 0 ? viableSpawns : edgeSpawns;
    const slot = spawnPool[(state.enemies.length + state.pendingSpawns.length + i) % spawnPool.length];
    const spawnPosition = findReinforcementPosition(slot);
    state.pendingSpawns.push({
      x: spawnPosition.x,
      y: spawnPosition.y,
      timer: delay + i * 0.12,
    });
  }
}

function queueRandomBoardSpawns(count, delay = 0.4) {
  for (let i = 0; i < count; i += 1) {
    const blockers = [
      state.player,
      ...(state.boss ? [state.boss] : []),
      ...state.enemies,
      ...state.pendingSpawns,
      ...state.cages.filter((cage) => !cage.freed),
    ];
    const spawnPosition = randomOpenPosition(60, 48, blockers);
    state.pendingSpawns.push({
      x: spawnPosition.x,
      y: spawnPosition.y,
      timer: delay + i * 0.08,
    });
  }
}

function findReinforcementPosition(slot) {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const candidate = {
      x: clamp(slot.x + Math.random() * 44 - 22, 24, world.width - 24),
      y: clamp(slot.y + Math.random() * 44 - 22, 24, world.height - 24),
    };
    const overlapsEnemy = state.enemies.some((enemy) => distance(candidate, enemy) < enemy.radius * 2 + 10);
    const overlapsPending = state.pendingSpawns.some((spawn) => distance(candidate, spawn) < 52);
    const overlapsBoss = state.boss && distance(candidate, state.boss) < state.boss.radius + 40;

    if (!overlapsEnemy && !overlapsPending && !overlapsBoss) {
      return candidate;
    }
  }

  return { x: slot.x, y: slot.y };
}

function materializeEnemy(spawn) {
  const maxHp = 54 + Math.random() * 18;
  state.enemies.push({
    id: crypto.randomUUID(),
    x: spawn.x,
    y: spawn.y,
    radius: 20,
    hp: maxHp,
    maxHp,
    fireCooldown: 0.65 + Math.random() * 0.7,
    fireTimer: 0.4 + Math.random() * 0.8,
    angle: 0,
    disabledTimer: 0,
  });
}

function spawnHealthPack() {
  const margin = 70;
  let attempts = 0;

  while (attempts < 20) {
    const pack = {
      id: crypto.randomUUID(),
      x: margin + Math.random() * (world.width - margin * 2),
      y: margin + Math.random() * (world.height - margin * 2),
      size: 24,
      healAmount: 30,
    };

    const overlappingCage = state.cages.some((cage) => distance(pack, cage) < 58);
    const overlappingEnemy = state.enemies.some((enemy) => distance(pack, enemy) < 54);
    const overlappingPack = state.healthPacks.some((existing) => distance(pack, existing) < 40);

    if (!overlappingCage && !overlappingEnemy && !overlappingPack) {
      state.healthPacks.push(pack);
      return;
    }

    attempts += 1;
  }
}

function randomOpenPosition(margin, separation, blockers = []) {
  for (let attempts = 0; attempts < 30; attempts += 1) {
    const candidate = {
      x: margin + Math.random() * (world.width - margin * 2),
      y: margin + Math.random() * (world.height - margin * 2),
    };
    const overlaps = blockers.some((item) => {
      const radius = item.radius ?? 24;
      return distance(candidate, item) < separation + radius;
    });

    if (!overlaps) {
      return candidate;
    }
  }

  return { x: world.width / 2, y: world.height / 2 };
}

function currentAnimal() {
  return animals[state.player.form];
}

function switchForm(form) {
  if (state.player.carryingEnemyId) {
    showBanner("Drop the carried guard before switching animals.");
    return;
  }

  if (!state.unlockedAnimals.includes(form) || state.player.form === form) {
    return;
  }

  const previous = currentAnimal();
  const next = animals[form];
  const healthRatio = state.player.hp / previous.maxHealth;

  state.player.form = form;
  state.player.radius = next.radius;
  state.player.hp = Math.min(next.maxHealth, Math.max(18, next.maxHealth * healthRatio));
  state.player.abilityTimer = Math.min(state.player.abilityTimer, next.abilityCooldown);
  showBanner(`${next.label} ready: ${next.abilityName}. Vulnerability: ${next.vulnerability}`);
}

function freeNearbyCage() {
  const cage = state.cages.find((item) => {
    if (item.freed) {
      return false;
    }
    return distance(state.player, item) < 54;
  });

  if (!cage) {
    return;
  }

  if (isFinalCageLocked(cage)) {
    showBanner("The last cage is locked. Beat the boss to free this animal.");
    return;
  }

  cage.freed = true;
  state.unlockedAnimals.push(cage.animal);
  spawnEnemies(1);
  showBanner(
    `${animals[cage.animal].label} rescued. A new gun barrel joins the hunt. Press ${state.unlockedAnimals.length} to switch.`
  );

  if (rescuedAnimalCount() === 3 && !state.boss && !state.bossDefeated) {
    spawnBoss();
    showBanner("Three animals are out. The last cage locks down and the boss arrives.");
    return;
  }

  if (state.cages.every((item) => item.freed)) {
    state.victory = true;
    showBanner("All animals freed. Escape the compound!");
  }
}

function activateAbility() {
  if (state.gameOver) {
    return;
  }

  const form = state.player.form;
  const animal = currentAnimal();

  if (form === "bird") {
    if (state.player.carryingEnemyId || state.player.abilityTimer > 0) {
      return;
    }

    const target = nearestEnemy(84);
    if (target) {
      pickupEnemyByBird(target);
      showBanner("Bird grabbed a guard. Hold Space to carry, release to drop.");
    }
    return;
  }

  if (state.player.abilityTimer > 0) {
    return;
  }

  state.player.abilityTimer = animal.abilityCooldown;

  if (form === "rat") {
    state.player.effectTimer = 0.35;
    state.player.effectType = "dash";
    state.player.invulnerableTimer = Math.max(state.player.invulnerableTimer, 0.25);
    showBanner("Rat burst: short speed spike and brief bullet immunity.");
    return;
  }

  const nearby = state.enemies.filter((enemy) => distance(state.player, enemy) < 88);
  const bossInRange = state.boss && distance(state.player, bossWeakSpotPosition()) < 104 ? state.boss : null;

  if (form === "elephant") {
    state.player.effectTimer = 0.5;
    state.player.effectType = "trample";
    nearby.forEach((enemy) => damageEnemy(enemy, animal.attackDamage));
    if (bossInRange) {
      damageBoss(animal.attackDamage);
    }
    showBanner("Elephant trample flattens nearby gunners.");
    return;
  }

  if (form === "fox") {
    const target = nearestEnemy(62) || (state.boss && distance(state.player, state.boss) < 70 ? state.boss : null);
    if (target) {
      if (target === state.boss) {
        damageBoss(animal.attackDamage);
      } else {
        damageEnemy(target, animal.attackDamage);
      }
      showBanner("Fox bite lands a brutal close strike.");
    }
    return;
  }

  if (form === "wolf") {
    nearby.forEach((enemy) => damageEnemy(enemy, animal.attackDamage));
    if (bossInRange) {
      damageBoss(animal.attackDamage);
    }
    showBanner("Wolf claws rake through a wider melee arc.");
    return;
  }

}

function nearestEnemy(range) {
  let best = null;
  let bestDistance = Infinity;
  state.enemies.forEach((enemy) => {
    const gap = distance(state.player, enemy);
    if (gap < range && gap < bestDistance) {
      best = enemy;
      bestDistance = gap;
    }
  });
  return best;
}

function damageEnemy(enemy, amount) {
  const stillExists = state.enemies.some((item) => item.id === enemy.id);
  if (!stillExists) {
    return;
  }

  enemy.hp -= amount;
  if (enemy.hp <= 0) {
    state.enemiesDisabled += 1;
    state.enemies = state.enemies.filter((item) => item.id !== enemy.id);
    spawnEnemies(2);
    showBanner("A shooter went down, but two more rushed in.");
  }
}

function damageBoss(amount) {
  if (!state.boss) {
    return;
  }

  state.boss.hp -= amount;
  if (state.boss.hp <= 0) {
    state.boss = null;
    state.bossDefeated = true;
    showBanner("Boss defeated. The last cage is unlocked.");
  }
}

function bossWeakSpotPosition() {
  if (!state.boss) {
    return null;
  }

  const offset = state.boss.radius - 2;
  return {
    x: state.boss.x - Math.cos(state.boss.angle) * offset,
    y: state.boss.y - Math.sin(state.boss.angle) * offset,
  };
}

function pickupEnemyByBird(enemy) {
  state.player.carryingEnemyId = enemy.id;
  enemy.disabledTimer = Number.POSITIVE_INFINITY;
  enemy.fireTimer = Math.max(enemy.fireTimer, 0.8);
}

function carriedEnemy() {
  if (!state.player.carryingEnemyId) {
    return null;
  }

  return state.enemies.find((enemy) => enemy.id === state.player.carryingEnemyId) || null;
}

function updateCarriedEnemy() {
  const enemy = carriedEnemy();
  if (!enemy) {
    state.player.carryingEnemyId = null;
    return;
  }

  enemy.x = clamp(state.player.x, enemy.radius + 12, world.width - enemy.radius - 12);
  enemy.y = clamp(state.player.y - state.player.radius - enemy.radius - 8, enemy.radius + 12, world.height - enemy.radius - 12);
  enemy.angle = -Math.PI / 2;
}

function dropEnemyByBird() {
  const enemy = carriedEnemy();
  state.player.carryingEnemyId = null;

  if (!enemy) {
    return;
  }

  enemy.x = clamp(state.player.x, enemy.radius + 12, world.width - enemy.radius - 12);
  enemy.y = clamp(state.player.y + state.player.radius + enemy.radius + 8, enemy.radius + 12, world.height - enemy.radius - 12);
  enemy.disabledTimer = 0.8;
  enemy.fireTimer = Math.max(enemy.fireTimer, 0.9);
  damageEnemy(enemy, animals.bird.attackDamage);
  state.player.abilityTimer = animals.bird.abilityCooldown;
  showBanner("Bird dropped the guard into a new position.");
}

function showBanner(text) {
  state.message = text;
  state.messageUntil = performance.now() + 2400;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function update(dt, now) {
  banner.textContent = state.message;
  banner.classList.toggle("visible", now < state.messageUntil);

  if (!state.started) {
    return;
  }

  if (state.paused) {
    return;
  }

  if (state.gameOver) {
    return;
  }

  if (state.victory && state.player.x > world.width - 40) {
    state.gameOver = true;
    showBanner("Escape complete. All animals got out. Press R to restart.");
  }

  updatePlayer(dt);
  updateCarriedEnemy();
  updateHealthPacks(dt);
  updatePendingSpawns(dt);
  updateEnemies(dt);
  updateBoss(dt);
  updateBullets(dt);

  state.player.abilityTimer = Math.max(0, state.player.abilityTimer - dt);
  state.player.invulnerableTimer = Math.max(0, state.player.invulnerableTimer - dt);
  state.player.effectTimer = Math.max(0, state.player.effectTimer - dt);
  if (state.player.effectTimer === 0) {
    state.player.effectType = "";
  }

  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.gameOver = true;
    showBanner("You were stopped. Press R to try the escape again.");
  }
}

function updateHealthPacks(dt) {
  const animal = currentAnimal();
  state.healthPackTimer -= dt;

  if (state.healthPackTimer <= 0 && state.healthPacks.length < 4) {
    spawnHealthPack();
    state.healthPackTimer = 8 + Math.random() * 4;
  }

  state.healthPacks = state.healthPacks.filter((pack) => {
    if (distance(pack, state.player) < state.player.radius + pack.size * 0.7) {
      const before = state.player.hp;
      state.player.hp = Math.min(animal.maxHealth, state.player.hp + pack.healAmount);
      if (state.player.hp > before) {
        showBanner(`Health crate collected. +${Math.round(state.player.hp - before)} health.`);
      }
      return false;
    }
    return true;
  });
}

function updatePendingSpawns(dt) {
  for (let i = state.pendingSpawns.length - 1; i >= 0; i -= 1) {
    const spawn = state.pendingSpawns[i];
    spawn.timer -= dt;
    if (spawn.timer <= 0) {
      materializeEnemy(spawn);
      state.pendingSpawns.splice(i, 1);
    }
  }
}

function updatePlayer(dt) {
  const animal = currentAnimal();
  let dx = 0;
  let dy = 0;

  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;

  const magnitude = Math.hypot(dx, dy) || 1;
  const boost = state.player.effectType === "dash" ? 1.9 : state.player.effectType === "trample" ? 1.3 : 1;
  state.player.vx = (dx / magnitude) * animal.speed * boost;
  state.player.vy = (dy / magnitude) * animal.speed * boost;

  state.player.x = clamp(state.player.x + state.player.vx * dt, state.player.radius, world.width - state.player.radius);
  state.player.y = clamp(state.player.y + state.player.vy * dt, state.player.radius, world.height - state.player.radius);
}

function updateEnemies(dt) {
  state.enemies.forEach((enemy) => {
    if (enemy.id === state.player.carryingEnemyId) {
      return;
    }

    const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
    enemy.angle = angle;
    enemy.fireTimer -= dt;
    enemy.disabledTimer = Math.max(0, enemy.disabledTimer - dt);

    if (enemy.disabledTimer > 0) {
      return;
    }

    if (enemy.fireTimer <= 0) {
      enemy.fireTimer = enemy.fireCooldown;
      const speed = 180 + state.unlockedAnimals.length * 18;
      const wobble = (Math.random() - 0.5) * 0.1;
      state.bullets.push({
        x: enemy.x + Math.cos(angle) * 18,
        y: enemy.y + Math.sin(angle) * 18,
        vx: Math.cos(angle + wobble) * speed,
        vy: Math.sin(angle + wobble) * speed,
        radius: 5,
      });
    }
  });
}

function updateBoss(dt) {
  if (!state.boss) {
    return;
  }

  const boss = state.boss;
  const angle = Math.atan2(state.player.y - boss.y, state.player.x - boss.x);
  boss.angle = angle;
  boss.fireTimer -= dt;

  if (boss.fireTimer <= 0) {
    boss.fireTimer = boss.fireCooldown;
    const speed = 240;
    const spread = 0.18;
    [-spread, spread].forEach((offset) => {
      state.bullets.push({
        x: boss.x + Math.cos(angle) * 26,
        y: boss.y + Math.sin(angle) * 26,
        vx: Math.cos(angle + offset) * speed,
        vy: Math.sin(angle + offset) * speed,
        radius: 8,
        damage: 30,
        ignoresMultiplier: true,
        tint: "#f2cb6b",
      });
    });
  }
}

function updateBullets(dt) {
  const animal = currentAnimal();

  state.bullets = state.bullets.filter((bullet) => {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    const outOfBounds =
      bullet.x < -20 ||
      bullet.x > world.width + 20 ||
      bullet.y < -20 ||
      bullet.y > world.height + 20;

    if (outOfBounds) {
      return false;
    }

    if (state.player.invulnerableTimer <= 0 && distance(bullet, state.player) < bullet.radius + state.player.radius) {
      const damage = bullet.damage ?? 13;
      state.player.hp -= bullet.ignoresMultiplier ? damage : damage * animal.damageTaken;
      state.player.invulnerableTimer = 0.22;
      return false;
    }

    return true;
  });
}

function render() {
  drawArena();
  drawCages();
  drawExit();
  drawHealthPacks();
  drawPendingSpawns();
  drawBoss();
  drawEnemies();
  drawBullets();
  drawPlayer();
  drawHud();
}

function drawHealthPacks() {
  state.healthPacks.forEach((pack) => {
    ctx.save();
    ctx.translate(pack.x, pack.y);
    ctx.fillStyle = "#f4f0da";
    ctx.fillRect(-pack.size / 2, -pack.size / 2, pack.size, pack.size);
    ctx.strokeStyle = "#3f5f53";
    ctx.lineWidth = 2;
    ctx.strokeRect(-pack.size / 2, -pack.size / 2, pack.size, pack.size);

    ctx.strokeStyle = "#88d498";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(6, 0);
    ctx.moveTo(0, -6);
    ctx.lineTo(0, 6);
    ctx.stroke();
    ctx.restore();
  });
}

function drawArena() {
  ctx.clearRect(0, 0, world.width, world.height);

  ctx.fillStyle = "#426a56";
  ctx.fillRect(0, 0, world.width, world.height);

  ctx.fillStyle = "rgba(13, 27, 23, 0.18)";
  for (let x = 0; x < world.width; x += 48) {
    for (let y = 0; y < world.height; y += 48) {
      ctx.fillRect(x + 8, y + 8, 24, 24);
    }
  }
}

function drawCages() {
  state.cages.forEach((cage, index) => {
    ctx.save();
    ctx.translate(cage.x, cage.y);

    ctx.fillStyle = cage.freed ? "rgba(141, 212, 152, 0.18)" : "rgba(36, 26, 18, 0.54)";
    ctx.fillRect(-28, -24, 56, 48);

    ctx.strokeStyle = cage.freed ? "#88d498" : "#e3d7c1";
    if (isFinalCageLocked(cage)) {
      ctx.strokeStyle = "#f47b65";
    }
    ctx.lineWidth = 3;
    ctx.strokeRect(-28, -24, 56, 48);

    for (let i = -16; i <= 16; i += 10) {
      ctx.beginPath();
      ctx.moveTo(i, -24);
      ctx.lineTo(i, 24);
      ctx.stroke();
    }

    ctx.fillStyle = animals[cage.animal].color;
    ctx.beginPath();
    ctx.arc(0, 2, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f4f0da";
    ctx.font = "12px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(isFinalCageLocked(cage) ? "LOCKED" : `${index + 2}`, 0, -34);
    ctx.restore();
  });
}

function drawExit() {
  if (!state.victory) {
    return;
  }

  ctx.fillStyle = "rgba(242, 203, 107, 0.25)";
  ctx.fillRect(world.width - 30, 180, 30, 240);
  ctx.fillStyle = "#f2cb6b";
  ctx.font = "16px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("EXIT", world.width - 16, 170);
}

function drawBoss() {
  if (!state.boss) {
    return;
  }

  const boss = state.boss;
  const healthRatio = clamp(boss.hp / boss.maxHp, 0, 1);
  const weakSpot = bossWeakSpotPosition();

  ctx.save();
  ctx.translate(boss.x, boss.y - boss.radius - 16);
  ctx.fillStyle = "rgba(7, 11, 10, 0.7)";
  ctx.fillRect(-44, 0, 88, 8);
  ctx.fillStyle = "#f2cb6b";
  ctx.fillRect(-44, 0, 88 * healthRatio, 8);
  ctx.restore();

  ctx.save();
  ctx.translate(boss.x, boss.y);
  ctx.rotate(boss.angle);
  ctx.fillStyle = "#53201f";
  ctx.beginPath();
  ctx.arc(0, 0, boss.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2cb6b";
  ctx.fillRect(4, -10, 36, 8);
  ctx.fillRect(4, 2, 36, 8);
  ctx.fillStyle = "#781f1d";
  ctx.beginPath();
  ctx.arc(-boss.radius + 12, 0, boss.weakSpotRadius + 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = "#fff4a8";
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#f2cb6b";
  ctx.beginPath();
  ctx.arc(weakSpot.x, weakSpot.y, boss.weakSpotRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemies() {
  state.enemies.forEach((enemy) => {
    const healthRatio = clamp(enemy.hp / enemy.maxHp, 0, 1);

    ctx.save();
    ctx.translate(enemy.x, enemy.y - enemy.radius - 14);
    ctx.fillStyle = "rgba(7, 11, 10, 0.62)";
    ctx.fillRect(-20, 0, 40, 5);
    ctx.fillStyle = enemy.disabledTimer > 0 ? "#7ba9a4" : "#f47b65";
    ctx.fillRect(-20, 0, 40 * healthRatio, 5);
    ctx.restore();

    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(enemy.angle);

    ctx.fillStyle = enemy.disabledTimer > 0 ? "#7ba9a4" : "#6f2b2b";
    ctx.beginPath();
    ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d8c8b4";
    ctx.fillRect(0, -4, 26, 8);
    ctx.restore();
  });
}

function drawPendingSpawns() {
  state.pendingSpawns.forEach((spawn) => {
    const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.18;
    ctx.save();
    ctx.translate(spawn.x, spawn.y);
    ctx.strokeStyle = "rgba(242, 123, 101, 0.92)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18 * pulse, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(244, 240, 218, 0.7)";
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(8, 0);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 8);
    ctx.stroke();
    ctx.restore();
  });
}

function drawBullets() {
  state.bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.tint || "#f4f0da";
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPlayer() {
  const animal = currentAnimal();
  ctx.save();
  ctx.translate(state.player.x, state.player.y);

  if (state.player.invulnerableTimer > 0) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = "#fff2b4";
  }

  ctx.fillStyle = animal.color;
  ctx.beginPath();
  ctx.arc(0, 0, state.player.radius, 0, Math.PI * 2);
  ctx.fill();

  if (state.player.effectType === "trample") {
    ctx.strokeStyle = "#f2cb6b";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, state.player.radius + 12, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawHud() {
  if (state.gameOver) {
    ctx.fillStyle = "rgba(6, 10, 9, 0.78)";
    ctx.fillRect(220, 210, 520, 170);
    ctx.fillStyle = "#f4f0da";
    ctx.textAlign = "center";
    ctx.font = "34px Trebuchet MS";
    ctx.fillText(state.player.hp <= 0 ? "Escape Failed" : "Escape Complete", world.width / 2, 270);
    ctx.font = "18px Trebuchet MS";
    ctx.fillText(state.player.hp <= 0 ? "Press R to restart" : "All animals escaped. Press R to restart.", world.width / 2, 318);
  }

  if (state.paused) {
    ctx.fillStyle = "rgba(6, 10, 9, 0.7)";
    ctx.fillRect(220, 210, 520, 170);
    ctx.fillStyle = "#f4f0da";
    ctx.textAlign = "center";
    ctx.font = "34px Trebuchet MS";
    ctx.fillText("Paused", world.width / 2, 270);
    ctx.font = "18px Trebuchet MS";
    ctx.fillText("Press 0 to resume", world.width / 2, 318);
  }
}

function updatePanels() {
  if (!state.started) {
    topBar.innerHTML = `
      <div class="top-bar-row">
        <div>
          <div class="top-bar-label">Status</div>
          <div class="top-bar-value">Waiting to start</div>
        </div>
        <div class="top-bar-meta">
          <div>Press the button over the arena</div>
          <div>The breakout begins when you are ready</div>
        </div>
      </div>
      <div class="health-track" aria-label="Player health">
        <div class="health-fill" style="width: 0%"></div>
      </div>
    `;
    return;
  }

  const animal = currentAnimal();
  const healthRatio = clamp(state.player.hp / animal.maxHealth, 0, 1) * 100;

  topBar.innerHTML = `
    <div class="top-bar-row">
      <div>
        <div class="top-bar-label">Current Form</div>
        <div class="top-bar-value">${animal.label}</div>
      </div>
      <div class="top-bar-meta">
        <div>${Math.ceil(state.player.hp)} / ${animal.maxHealth} health</div>
        <div>${animal.abilityName} • ${state.enemies.length + state.pendingSpawns.length + (state.boss ? 1 : 0)} threats active</div>
      </div>
    </div>
    <div class="health-track" aria-label="Player health">
      <div class="health-fill" style="width: ${healthRatio}%"></div>
    </div>
  `;

  animalList.innerHTML = `
    <h2>Animal Forms</h2>
    ${Object.entries(animals)
      .map(([key, animal], index) => {
        const unlocked = state.unlockedAnimals.includes(key);
        const active = state.player.form === key;
        return `
          <div class="animal-entry ${active ? "active" : ""}">
            <span>${index + 1}. ${animal.label}${unlocked ? "" : " (locked)"}</span>
            <strong>${animal.abilityName}</strong>
          </div>
        `;
      })
      .join("")}
  `;

  statusPanel.innerHTML = `
    <h2>Mission Status</h2>
    <div class="status-row"><span>Animals freed</span><strong>${state.unlockedAnimals.length - 1}/${cageBlueprints.length}</strong></div>
    <div class="status-row"><span>Gunners disabled</span><strong>${state.enemiesDisabled}</strong></div>
    <div class="status-row"><span>Boss</span><strong>${state.boss ? "Active" : state.bossDefeated ? "Defeated" : "Dormant"}</strong></div>
    <div class="status-row"><span>Current vulnerability</span><strong>${currentAnimal().vulnerability}</strong></div>
    <div class="status-row"><span>Objective</span><strong>${state.victory ? "Reach the exit" : state.boss ? "Defeat the boss" : finalLockedCage() ? "Last cage is locked" : "Find the next cage"}</strong></div>
  `;
}

function loop(timestamp) {
  const dt = Math.min(0.032, (timestamp - state.lastTime) / 1000 || 0);
  state.lastTime = timestamp;
  update(dt, timestamp);
  render();
  updatePanels();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (!state.started && key !== "r") {
    return;
  }

  if (key === "0") {
    state.paused = !state.paused;
    showBanner(state.paused ? "Paused." : "Back in the escape.");
    keys.clear();
    return;
  }

  keys.add(key);

  if (state.paused) {
    return;
  }

  if (key === "e") {
    freeNearbyCage();
  }

  if (key === " ") {
    event.preventDefault();
    activateAbility();
  }

  if (key === "r" && state.gameOver) {
    resetGame();
  }

  const formIndex = Number(key) - 1;
  const formKeys = Object.keys(animals);
  if (formIndex >= 0 && formIndex < formKeys.length) {
    switchForm(formKeys[formIndex]);
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  keys.delete(key);

  if (key === " " && state.player.form === "bird" && state.player.carryingEnemyId) {
    event.preventDefault();
    dropEnemyByBird();
  }
});

startButton.addEventListener("click", () => {
  resetGame();
});

initializeStartState();
updatePanels();
requestAnimationFrame(loop);
