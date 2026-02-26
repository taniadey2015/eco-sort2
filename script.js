// ========================================
// ECO SORT 2 - Waste Management Game
// Modern redesign with Web Audio API
// ========================================

(() => {
  "use strict";

  // ===== DOM ELEMENTS =====
  const el = {
    // Top bar
    level: document.getElementById("level"),
    score: document.getElementById("score"),
    lives: document.getElementById("lives"),
    highScore: document.getElementById("highScore"),
    landfillFill: document.getElementById("landfillFill"),
    landfillPercent: document.getElementById("landfillPercent"),

    // Controls
    btnStart: document.getElementById("btnStart"),
    btnPause: document.getElementById("btnPause"),
    btnUpgrades: document.getElementById("btnUpgrades"),
    btnMute: document.getElementById("btnMute"),

    // Game area
    gameArea: document.getElementById("gameArea"),
    binsContainer: document.getElementById("binsContainer"),
    tipText: document.getElementById("tipText"),

    // Overlays
    overlay: document.getElementById("overlay"),
    overlayStart: document.getElementById("overlayStart"),
    playerName: document.getElementById("playerName"),
    previewScores: document.getElementById("previewScores"),

    levelCompleteOverlay: document.getElementById("levelCompleteOverlay"),
    completedLevel: document.getElementById("completedLevel"),
    levelScore: document.getElementById("levelScore"),
    itemsSorted: document.getElementById("itemsSorted"),
    accuracy: document.getElementById("accuracy"),
    btnContinueLevel: document.getElementById("btnContinueLevel"),

    gameOverOverlay: document.getElementById("gameOverOverlay"),
    gameOverReason: document.getElementById("gameOverReason"),
    finalScore: document.getElementById("finalScore"),
    finalLevel: document.getElementById("finalLevel"),
    totalItemsSorted: document.getElementById("totalItemsSorted"),
    highScoresList: document.getElementById("highScoresList"),
    btnPlayAgain: document.getElementById("btnPlayAgain"),
    btnMainMenu: document.getElementById("btnMainMenu"),

    // Upgrades
    upgradePanel: document.getElementById("upgradePanel"),
    closeUpgrades: document.getElementById("closeUpgrades"),

    // Penalty popup
    penaltyPopup: document.getElementById("penaltyPopup"),
    penaltyBinsGuide: document.getElementById("penaltyBinsGuide"),
    penaltyCountdown: document.getElementById("penaltyCountdown"),

    // Particles
    particleContainer: document.getElementById("particleContainer"),
  };

  // ===== WEB AUDIO API (Procedural Sound Generation) =====
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.enabled = (localStorage.getItem("ecoSortSound") ?? "on") === "on";
    }

    ensureContext() {
      if (!this.ctx) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem("ecoSortSound", this.enabled ? "on" : "off");
      return this.enabled;
    }

    beep({
      freq = 440,
      type = "sine",
      time = 0.12,
      gain = 0.08,
      slideTo = null,
    } = {}) {
      if (!this.enabled) return;
      this.ensureContext();

      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) {
        osc.frequency.linearRampToValueAtTime(slideTo, t0 + time);
      }

      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + time);

      osc.connect(g).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + time);
    }

    thud({ time = 0.15, gain = 0.08 } = {}) {
      if (!this.enabled) return;
      this.ensureContext();

      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * time));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.ctx.destination);
      src.start();
    }

    // Sound effects
    click() {
      this.beep({ freq: 700, type: "square", time: 0.06, gain: 0.04 });
    }

    spawn() {
      this.beep({ freq: 520, type: "triangle", time: 0.06, gain: 0.045 });
    }

    correct() {
      this.beep({ freq: 740, type: "sine", time: 0.08, gain: 0.06 });
      setTimeout(() => {
        this.beep({ freq: 988, type: "sine", time: 0.08, gain: 0.06 });
      }, 70);
    }

    wrong() {
      this.beep({
        freq: 220,
        type: "sawtooth",
        time: 0.12,
        gain: 0.06,
        slideTo: 140,
      });
    }

    landfillHit() {
      this.thud({ time: 0.15, gain: 0.07 });
    }

    levelUp() {
      this.beep({ freq: 523, type: "sine", time: 0.15, gain: 0.07 });
      setTimeout(
        () => this.beep({ freq: 659, type: "sine", time: 0.15, gain: 0.07 }),
        100,
      );
      setTimeout(
        () => this.beep({ freq: 784, type: "sine", time: 0.2, gain: 0.07 }),
        200,
      );
    }

    gameOver() {
      this.beep({
        freq: 260,
        type: "sine",
        time: 0.25,
        gain: 0.08,
        slideTo: 120,
      });
    }
  }

  const SOUND = new SoundEngine();

  // ===== GAME CONFIGURATION =====
  const CONFIG = {
    INITIAL_LIVES: 3,
    MISTAKE_PENALTY: 10, // Landfill % increase
    REMINDER_MISTAKES: 3,
    REMINDER_DURATION: 3000,
    BASE_POINTS: 10,
  };

  // ===== LEVEL CONFIGURATIONS =====
  const LEVELS = [
    {
      level: 1,
      categories: ["recyclable", "organic"],
      fallSpeed: 7000,
      spawnRate: 2500,
      itemsToComplete: 15,
    },
    {
      level: 2,
      categories: ["recyclable", "organic", "general"],
      fallSpeed: 5500,
      spawnRate: 2000,
      itemsToComplete: 20,
    },
    {
      level: 3,
      categories: ["recyclable", "organic", "general", "hazardous"],
      fallSpeed: 4200,
      spawnRate: 1700,
      itemsToComplete: 25,
    },
    {
      level: 4,
      categories: ["recyclable", "organic", "general", "hazardous", "glass"],
      fallSpeed: 3200,
      spawnRate: 1400,
      itemsToComplete: 30,
    },
    {
      level: 5,
      categories: [
        "recyclable",
        "organic",
        "general",
        "hazardous",
        "glass",
        "electronic",
      ],
      fallSpeed: 2400,
      spawnRate: 1200,
      itemsToComplete: 35,
    },
  ];

  // ===== WASTE DATABASE =====
  const WASTE_CATALOG = {
    recyclable: {
      name: "Recyclable",
      icon: "♻️",
      items: [
        { icon: "📄", name: "Paper" },
        { icon: "🥫", name: "Can" },
        { icon: "🧃", name: "Juice Box" },
        { icon: "📦", name: "Cardboard" },
        { icon: "📰", name: "Newspaper" },
        { icon: "🍾", name: "Plastic Bottle" },
      ],
    },
    organic: {
      name: "Organic",
      icon: "🌱",
      items: [
        { icon: "🍎", name: "Apple Core" },
        { icon: "🍌", name: "Banana Peel" },
        { icon: "🍃", name: "Leaves" },
        { icon: "🥕", name: "Vegetable Scraps" },
        { icon: "🍞", name: "Bread" },
        { icon: "☕", name: "Coffee Grounds" },
      ],
    },
    general: {
      name: "General",
      icon: "🗑️",
      items: [
        { icon: "🧦", name: "Old Cloth" },
        { icon: "🧻", name: "Tissue" },
        { icon: "🎈", name: "Balloon" },
        { icon: "🧽", name: "Sponge" },
        { icon: "🎨", name: "Markers" },
      ],
    },
    hazardous: {
      name: "Hazardous",
      icon: "⚠️",
      items: [
        { icon: "🔋", name: "Battery" },
        { icon: "🧪", name: "Chemicals" },
        { icon: "💊", name: "Medicine" },
        { icon: "🌡️", name: "Thermometer" },
      ],
    },
    glass: {
      name: "Glass",
      icon: "🍶",
      items: [
        { icon: "🍷", name: "Wine Bottle" },
        { icon: "🫙", name: "Jar" },
        { icon: "🪟", name: "Window Glass" },
      ],
    },
    electronic: {
      name: "Electronic",
      icon: "💻",
      items: [
        { icon: "📱", name: "Phone" },
        { icon: "⌨️", name: "Keyboard" },
        { icon: "🖱️", name: "Mouse" },
        { icon: "🎮", name: "Controller" },
      ],
    },
  };

  // ===== TIPS =====
  const TIPS = [
    "Tip: Drag items into bins quickly to prevent landfill overflow!",
    "Tip: Clean recyclables improve processing efficiency.",
    "Tip: Food scraps and leaves go to organic composting.",
    "Tip: Use keyboard shortcuts 1-6 for quick sorting!",
    "Tip: Purchase upgrades to slow down falling speed.",
    "Tip: Hazardous items need special handling - don't mix them!",
  ];

  // ===== GAME STATE =====
  const GAME = {
    running: false,
    paused: false,
    currentLevel: 1,
    score: 0,
    lives: CONFIG.INITIAL_LIVES,
    highScore: Number(localStorage.getItem("ecoSort2High") || 0),
    landfill: 0,
    consecutiveMistakes: 0,
    itemsSorted: 0,
    itemsMissed: 0,
    totalItems: 0,
    playerName: "Player",
    items: [],
    spawnInterval: null,
    animationId: null,
    lastSpawn: 0,
    lastUpdate: 0,
    tipIndex: 0,
    bins: [],
    upgrades: {
      slowMotion: false,
      extraLife: false,
      recyclingEducation: false,
      binHighlight: false,
    },
  };

  // Penalty state
  let penaltyActive = false;
  let penaltyTimer = null;

  // High scores (session-based)
  let highScores = [];

  // ===== UTILITY FUNCTIONS =====
  const random = (min, max) => Math.random() * (max - min) + min;
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  // ===== PARTICLE EFFECTS =====
  function createParticles(x, y, isSuccess = true) {
    const emojis = isSuccess ? ["✨", "⭐", "💚", "♻️"] : ["❌", "💥", "⚠️"];
    const count = isSuccess ? 15 : 10;

    for (let i = 0; i < count; i++) {
      const particle = document.createElement("div");
      particle.className = "particle";
      particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      particle.style.left = x + "px";
      particle.style.top = y + "px";
      particle.style.fontSize = random(10, 20) + "px";

      const tx = random(-150, 150);
      const ty = random(-150, 150);
      const tr = random(-360, 360);

      particle.style.setProperty("--tx", tx + "px");
      particle.style.setProperty("--ty", ty + "px");
      particle.style.setProperty(" --tr", tr + "deg");

      el.particleContainer.appendChild(particle);
      setTimeout(() => particle.remove(), 1000);
    }
  }

  // ===== UPDATE UI =====
  function updateHUD() {
    el.level.textContent = GAME.currentLevel;
    el.score.textContent = GAME.score;
    el.lives.textContent = "❤️".repeat(Math.max(0, GAME.lives));
    el.highScore.textContent = GAME.highScore;

    const percent = Math.round(GAME.landfill);
    el.landfillFill.style.width = percent + "%";
    el.landfillPercent.textContent = percent + "%";

    const meter = el.landfillFill.parentElement.parentElement;
    if (GAME.landfill >= 70) {
      meter.classList.add("danger");
    } else {
      meter.classList.remove("danger");
    }
  }

  function rotateTip() {
    el.tipText.textContent = TIPS[GAME.tipIndex % TIPS.length];
    GAME.tipIndex++;
  }

  // ===== BINS MANAGEMENT =====
  function setupBins() {
    el.binsContainer.innerHTML = "";
    GAME.bins = [];

    const levelConfig = LEVELS[GAME.currentLevel - 1];

    levelConfig.categories.forEach((category) => {
      const binData = WASTE_CATALOG[category];
      const bin = document.createElement("div");
      bin.className = `bin ${category}`;
      bin.dataset.category = category;

      const examples = binData.items
        .slice(0, 3)
        .map((item) => item.icon)
        .join(" ");

      bin.innerHTML = `
        <div class="bin-icon">${binData.icon}</div>
        <div class="bin-label">${binData.name}</div>
        <div class="bin-desc">${examples}</div>
      `;

      el.binsContainer.appendChild(bin);
      GAME.bins.push({ element: bin, category });
    });
  }

  // ===== SPAWN ITEMS =====
  function spawnItem() {
    const levelConfig = LEVELS[GAME.currentLevel - 1];
    const categories = levelConfig.categories;
    const randomCategory =
      categories[Math.floor(Math.random() * categories.length)];
    const categoryData = WASTE_CATALOG[randomCategory];
    const randomItem =
      categoryData.items[Math.floor(Math.random() * categoryData.items.length)];

    const item = document.createElement("div");
    item.className = "item";
    item.textContent = randomItem.icon;
    item.dataset.category = randomCategory;
    item.dataset.name = randomItem.name;

    const containerWidth = el.gameArea.offsetWidth;
    const x = random(20, containerWidth - 60);
    item.style.left = x + "px";
    item.style.top = "-50px";

    el.gameArea.appendChild(item);
    SOUND.spawn();

    let fallSpeed = levelConfig.fallSpeed;
    if (GAME.upgrades.slowMotion) {
      fallSpeed *= 1.2;
    }

    const itemObj = {
      element: item,
      x: x,
      y: -50,
      vy: (el.gameArea.offsetHeight + 50) / (fallSpeed / 1000),
      category: randomCategory,
      grabbed: false,
      removed: false,
    };

    enableDrag(itemObj);
    GAME.items.push(itemObj);
    GAME.totalItems++;
  }

  // ===== DRAG & DROP SYSTEM =====
  function enableDrag(itemObj) {
    const item = itemObj.element;
    let startX = 0,
      startY = 0,
      offsetX = 0,
      offsetY = 0;

    const onDown = (e) => {
      e.preventDefault();
      if (GAME.paused || penaltyActive) return;

      itemObj.grabbed = true;
      item.classList.add("grabbing");

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = item.getBoundingClientRect();
      const gameRect = el.gameArea.getBoundingClientRect();

      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;

      if (GAME.upgrades.binHighlight) {
        highlightBin(itemObj.category);
      }

      SOUND.click();
    };

    const onMove = (e) => {
      if (!itemObj.grabbed || GAME.paused || penaltyActive) return;

      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const gameRect = el.gameArea.getBoundingClientRect();

      let newX = clientX - gameRect.left - offsetX;
      let newY = clientY - gameRect.top - offsetY;

      newX = clamp(newX, 0, el.gameArea.offsetWidth - 50);
      newY = clamp(newY, 0, el.gameArea.offsetHeight - 50);

      itemObj.x = newX;
      itemObj.y = newY;
      item.style.left = newX + "px";
      item.style.top = newY + "px";
    };

    const onUp = (e) => {
      if (!itemObj.grabbed) return;

      // Check if dropped on a bin
      const itemRect = item.getBoundingClientRect();
      const itemCenterX = itemRect.left + itemRect.width / 2;
      const itemCenterY = itemRect.top + itemRect.height / 2;

      let droppedOnBin = null;
      for (const binData of GAME.bins) {
        const binRect = binData.element.getBoundingClientRect();
        if (
          itemCenterX >= binRect.left &&
          itemCenterX <= binRect.right &&
          itemCenterY >= binRect.top &&
          itemCenterY <= binRect.bottom
        ) {
          droppedOnBin = binData;
          break;
        }
      }

      if (droppedOnBin) {
        handleDrop(itemObj, droppedOnBin);
      } else {
        // Only release grab if not dropped on a bin
        itemObj.grabbed = false;
        item.classList.remove("grabbing");
      }

      clearHighlights();
    };

    item.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    item.addEventListener("touchstart", onDown, { passive: false });
    item.addEventListener("touchmove", onMove, { passive: false });
    item.addEventListener("touchend", onUp, { passive: false });
  }

  function highlightBin(category) {
    GAME.bins.forEach((bin) => {
      if (bin.category === category) {
        bin.element.classList.add("highlight");
      }
    });
  }

  function clearHighlights() {
    GAME.bins.forEach((bin) => {
      bin.element.classList.remove("highlight");
    });
  }

  // ===== DROP HANDLING =====
  function handleDrop(itemObj, binData) {
    const rect = itemObj.element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    if (itemObj.category === binData.category) {
      handleCorrect(itemObj, x, y);
    } else {
      handleWrong(itemObj, x, y);
    }

    removeItem(itemObj);
    binData.element.classList.add("hit");
    setTimeout(() => binData.element.classList.remove("hit"), 300);
  }

  function handleCorrect(itemObj, x, y) {
    SOUND.correct();
    createParticles(x, y, true);

    const points = CONFIG.BASE_POINTS * GAME.currentLevel;
    GAME.score += points;
    GAME.itemsSorted++;
    GAME.consecutiveMistakes = 0;

    updateHUD();
    checkLevelComplete();
  }

  function handleWrong(itemObj, x, y) {
    SOUND.wrong();
    createParticles(x, y, false);
    el.gameArea.classList.add("shake");
    setTimeout(() => el.gameArea.classList.remove("shake"), 500);

    let penalty = CONFIG.MISTAKE_PENALTY;
    if (GAME.upgrades.recyclingEducation) {
      penalty *= 0.7;
    }

    GAME.landfill += penalty;
    GAME.consecutiveMistakes++;
    GAME.itemsMissed++;

    updateHUD();

    if (GAME.consecutiveMistakes >= CONFIG.REMINDER_MISTAKES) {
      showReminder();
    }

    checkGameOver();
  }

  function handleMissed(itemObj) {
    SOUND.landfillHit();

    let penalty = CONFIG.MISTAKE_PENALTY;
    if (GAME.upgrades.recyclingEducation) {
      penalty *= 0.7;
    }

    GAME.landfill += penalty;
    GAME.consecutiveMistakes++;
    GAME.itemsMissed++;

    updateHUD();

    if (GAME.consecutiveMistakes >= CONFIG.REMINDER_MISTAKES) {
      showReminder();
    }

    checkGameOver();
  }

  function removeItem(itemObj) {
    itemObj.removed = true;
    if (itemObj.element && itemObj.element.parentNode) {
      itemObj.element.remove();
    }
    GAME.items = GAME.items.filter((i) => i !== itemObj);
  }

  // ===== REMINDER POPUP =====
  function showReminder() {
    if (penaltyActive) return;

    penaltyActive = true;
    GAME.paused = true;
    GAME.consecutiveMistakes = 0;

    // Generate bin guide
    el.penaltyBinsGuide.innerHTML = "";
    const levelConfig = LEVELS[GAME.currentLevel - 1];

    levelConfig.categories.forEach((category) => {
      const binData = WASTE_CATALOG[category];
      const examples = binData.items
        .slice(0, 3)
        .map((i) => i.icon)
        .join(" ");

      const binItem = document.createElement("div");
      binItem.className = "penalty-bin-item";
      binItem.innerHTML = `
        <span class="bin-icon">${binData.icon}</span>
        <div class="bin-name">${binData.name}</div>
        <div class="bin-examples">${examples}</div>
      `;
      el.penaltyBinsGuide.appendChild(binItem);
    });

    el.penaltyPopup.classList.add("active");

    let remaining = 3;
    el.penaltyCountdown.textContent = remaining;

    clearInterval(penaltyTimer);
    penaltyTimer = setInterval(() => {
      remaining--;
      el.penaltyCountdown.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(penaltyTimer);
        el.penaltyPopup.classList.remove("active");
        penaltyActive = false;
        if (GAME.running && !checkGameOver()) {
          GAME.paused = false;
        }
      }
    }, 1000);
  }

  // ===== LEVEL MANAGEMENT =====
  function checkLevelComplete() {
    const levelConfig = LEVELS[GAME.currentLevel - 1];
    if (GAME.itemsSorted >= levelConfig.itemsToComplete) {
      levelComplete();
    }
  }

  function levelComplete() {
    GAME.paused = true;
    cancelAnimationFrame(GAME.animationId);
    clearInterval(GAME.spawnInterval);
    SOUND.levelUp();

    // Clear remaining items
    GAME.items.forEach((item) => removeItem(item));

    const accuracy = Math.round((GAME.itemsSorted / GAME.totalItems) * 100);

    el.completedLevel.textContent = GAME.currentLevel;
    el.levelScore.textContent = GAME.score;
    el.itemsSorted.textContent = GAME.itemsSorted;
    el.accuracy.textContent = accuracy;

    el.levelCompleteOverlay.classList.add("active");
  }

  function continueToNextLevel() {
    el.levelCompleteOverlay.classList.remove("active");

    if (GAME.currentLevel < LEVELS.length) {
      GAME.currentLevel++;
      GAME.itemsSorted = 0;
      GAME.totalItems = 0;
      GAME.paused = false;
      setupBins();
      startGameLoop();
    } else {
      gameOver("🎉 Congratulations! You completed all levels!");
    }
  }

  // ===== GAME OVER =====
  function checkGameOver() {
    if (GAME.landfill >= 100) {
      gameOver("Landfill overflowed!");
      return true;
    }
    return false;
  }

  function gameOver(reason) {
    GAME.running = false;
    GAME.paused = false;
    cancelAnimationFrame(GAME.animationId);
    clearInterval(GAME.spawnInterval);
    SOUND.gameOver();

    // Update high score
    if (GAME.score > GAME.highScore) {
      GAME.highScore = GAME.score;
      localStorage.setItem("ecoSort2High", GAME.highScore);
      el.highScore.textContent = GAME.highScore;
    }

    // Add to session high scores
    highScores.push({
      name: GAME.playerName,
      score: GAME.score,
      level: GAME.currentLevel,
    });
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 10);

    // Display game over
    el.gameOverReason.textContent = reason;
    el.finalScore.textContent = GAME.score;
    el.finalLevel.textContent = GAME.currentLevel;
    el.totalItemsSorted.textContent = GAME.itemsSorted;

    displayHighScores(el.highScoresList);
    el.gameOverOverlay.classList.add("active");
  }

  // ===== HIGH SCORES =====
  function displayHighScores(container) {
    container.innerHTML = "";

    if (highScores.length === 0) {
      container.innerHTML = '<p class="empty">No scores yet. Be the first!</p>';
      return;
    }

    highScores.forEach((score, index) => {
      const item = document.createElement("div");
      item.className = "score-item";
      item.innerHTML = `
        <div class="score-rank">#${index + 1}</div>
        <div class="score-name">${score.name}</div>
        <div class="score-value">${score.score}</div>
        <div class="score-level">Lvl ${score.level}</div>
      `;
      container.appendChild(item);
    });
  }

  // ===== GAME LOOP =====
  function update(dt) {
    if (GAME.paused || penaltyActive) return;

    const now = performance.now();
    const levelConfig = LEVELS[GAME.currentLevel - 1];

    let spawnRate = levelConfig.spawnRate;
    if (GAME.upgrades.slowMotion) {
      spawnRate *= 1.3;
    }

    if (now - GAME.lastSpawn >= spawnRate) {
      spawnItem();
      GAME.lastSpawn = now;
    }

    const gameHeight = el.gameArea.offsetHeight;
    for (const item of GAME.items) {
      if (item.removed || item.grabbed) continue;

      item.y += (item.vy * dt) / 1000;
      item.element.style.top = item.y + "px";

      if (item.y >= gameHeight - 50) {
        handleMissed(item);
        removeItem(item);
      }
    }
  }

  function gameLoop(timestamp) {
    if (!GAME.running) return;

    const dt = timestamp - GAME.lastUpdate || 16;
    GAME.lastUpdate = timestamp;

    update(dt);

    GAME.animationId = requestAnimationFrame(gameLoop);
  }

  // ===== START/RESET GAME =====
  function startGame() {
    resetGame();
    GAME.running = true;
    GAME.paused = false;
    GAME.playerName = el.playerName.value.trim() || "Player";

    el.overlay.classList.remove("active");
    el.btnStart.disabled = true;
    el.btnPause.disabled = false;
    el.btnPause.textContent = "Pause";

    setupBins();
    updateHUD();
    startGameLoop();
  }

  function startGameLoop() {
    GAME.lastSpawn = performance.now();
    GAME.lastUpdate = performance.now();
    GAME.animationId = requestAnimationFrame(gameLoop);
  }

  function resetGame() {
    GAME.items.forEach((item) => removeItem(item));
    GAME.items = [];
    GAME.currentLevel = 1;
    GAME.score = 0;
    GAME.lives = CONFIG.INITIAL_LIVES;
    GAME.landfill = 0;
    GAME.consecutiveMistakes = 0;
    GAME.itemsSorted = 0;
    GAME.itemsMissed = 0;
    GAME.totalItems = 0;
    GAME.upgrades = {
      slowMotion: false,
      extraLife: false,
      recyclingEducation: false,
      binHighlight: false,
    };

    clearInterval(penaltyTimer);
    penaltyActive = false;
    el.penaltyPopup.classList.remove("active");

    updateUpgradesUI();
  }

  function pauseGame() {
    if (!GAME.running || penaltyActive) return;

    GAME.paused = !GAME.paused;
    el.btnPause.textContent = GAME.paused ? "Resume" : "Pause";

    if (!GAME.paused) {
      GAME.lastUpdate = performance.now();
      GAME.animationId = requestAnimationFrame(gameLoop);
    }
  }

  function returnToMenu() {
    cancelAnimationFrame(GAME.animationId);
    clearInterval(GAME.spawnInterval);
    GAME.items.forEach((item) => removeItem(item));

    el.overlay.classList.add("active");
    el.levelCompleteOverlay.classList.remove("active");
    el.gameOverOverlay.classList.remove("active");

    GAME.running = false;
    GAME.paused = false;
    el.btnStart.disabled = false;
    el.btnPause.disabled = true;

    displayHighScores(el.previewScores);
  }

  // ===== UPGRADES =====
  function updateUpgradesUI() {
    const upgrades = [
      { id: "upSlowMotion", key: "slowMotion" },
      { id: "upExtraLife", key: "extraLife" },
      { id: "upRecyclingEducation", key: "recyclingEducation" },
      { id: "upBinHighlight", key: "binHighlight" },
    ];

    upgrades.forEach(({ id, key }) => {
      const btn = document.getElementById(id);
      const status = btn.querySelector(".u-status");
      if (GAME.upgrades[key]) {
        btn.disabled = true;
        status.textContent = "Owned";
        status.classList.add("owned");
      } else {
        btn.disabled = false;
        status.textContent = "Available";
        status.classList.remove("owned");
      }
    });
  }

  function purchaseUpgrade(key, cost) {
    if (GAME.score < cost || GAME.upgrades[key]) {
      SOUND.wrong();
      return;
    }

    GAME.score -= cost;
    GAME.upgrades[key] = true;

    if (key === "extraLife") {
      GAME.lives++;
    }

    SOUND.correct();
    updateHUD();
    updateUpgradesUI();
  }

  // ===== EVENT LISTENERS =====
  el.btnStart.addEventListener("click", () => {
    SOUND.click();
    startGame();
  });

  el.overlayStart.addEventListener("click", () => {
    SOUND.click();
    startGame();
  });

  el.btnPause.addEventListener("click", () => {
    SOUND.click();
    pauseGame();
  });

  el.btnUpgrades.addEventListener("click", () => {
    SOUND.click();
    el.upgradePanel.classList.toggle("hidden");
  });

  el.closeUpgrades?.addEventListener("click", () => {
    SOUND.click();
    el.upgradePanel.classList.add("hidden");
  });

  el.btnMute.addEventListener("click", () => {
    const enabled = SOUND.toggle();
    el.btnMute.setAttribute("aria-pressed", enabled ? "true" : "false");
    el.btnMute.textContent = enabled ? "🔊 Sound" : "🔇 Sound";
    if (enabled) SOUND.click();
  });

  el.btnContinueLevel.addEventListener("click", () => {
    SOUND.click();
    continueToNextLevel();
  });

  el.btnPlayAgain.addEventListener("click", () => {
    SOUND.click();
    el.gameOverOverlay.classList.remove("active");
    startGame();
  });

  el.btnMainMenu.addEventListener("click", () => {
    SOUND.click();
    returnToMenu();
  });

  // Upgrade purchases
  document.getElementById("upSlowMotion")?.addEventListener("click", () => {
    purchaseUpgrade("slowMotion", 500);
  });

  document.getElementById("upExtraLife")?.addEventListener("click", () => {
    purchaseUpgrade("extraLife", 800);
  });

  document
    .getElementById("upRecyclingEducation")
    ?.addEventListener("click", () => {
      purchaseUpgrade("recyclingEducation", 600);
    });

  document.getElementById("upBinHighlight")?.addEventListener("click", () => {
    purchaseUpgrade("binHighlight", 400);
  });

  // Keyboard shortcuts (1-6 for quick sorting)
  window.addEventListener("keydown", (e) => {
    if (penaltyActive || GAME.paused || !GAME.running) return;

    const keyMap = {
      1: 0,
      2: 1,
      3: 2,
      4: 3,
      5: 4,
      6: 5,
    };

    if (keyMap[e.key] !== undefined && GAME.bins[keyMap[e.key]]) {
      const nearestItem = GAME.items
        .filter((i) => !i.grabbed && !i.removed)
        .sort((a, b) => b.y - a.y)[0];

      if (nearestItem) {
        handleDrop(nearestItem, GAME.bins[keyMap[e.key]]);
      }
    }

    if (e.key === " " || e.key === "Escape") {
      e.preventDefault();
      pauseGame();
    }
  });

  // Rotate tips
  setInterval(rotateTip, 6000);

  // ===== INITIALIZE =====
  updateHUD();
  updateUpgradesUI();
  displayHighScores(el.previewScores);

  // Sync mute button
  const enabled = SOUND.enabled;
  el.btnMute.setAttribute("aria-pressed", enabled ? "true" : "false");
  el.btnMute.textContent = enabled ? "🔊 Sound" : "🔇 Sound";
})();
