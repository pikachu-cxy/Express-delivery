(() => {
  "use strict";

  const CFG = {
    startGold: 50,
    ordersMin: 4,
    ordersMax: 8,
    highInterval: 40,
    protectSec: 2,
    sameSpotWait: 0.8,
    vehicles: {
      bike:  { id: "bike",  name: "单车", speed: 100, cost: 0,   color: "#4dabf7", need: 0 },
      ebike: { id: "ebike", name: "电动", speed: 135, cost: 80,  color: "#3dd68c", need: 1 },
      moto:  { id: "moto",  name: "摩托", speed: 168, cost: 150, color: "#ff6b2c", need: 0 }
    },
    tiers: [
      { id: "N", base: 100, time: 45, gold: 40, w: 55, color: "#ffd166" },
      { id: "G", base: 160, time: 35, gold: 55, w: 28, color: "#ff9f1c" },
      { id: "H", base: 280, time: 40, gold: 80, w: 14, color: "#ff6b2c" },
      { id: "S", base: 450, time: 50, gold: 120, w: 3,  color: "#ff2e63" }
    ],
    skills: {
      boost: { cd: 12, dur: 2, mult: 1.4 },
      oil:   { cd: 14, dur: 2, mult: 0.5, windup: 0.35, cost: 60 },
      bait:  { cd: 16, dur: 3, cost: 60 }
    }
  };

  // —— Campus map (bright cartoon) ——
  const WORLD = { w: 1400, h: 1000 };
  const buildings = [
    // dorms south
    [120, 720, 200, 180], [360, 740, 180, 160],
    // teaching east
    [980, 180, 160, 280], [1180, 200, 140, 220],
    // canteen north
    [420, 80, 280, 160], [740, 70, 160, 140],
    // west gate shops
    [60, 360, 140, 200], [60, 180, 120, 140],
    // center blocks
    [520, 380, 160, 120], [760, 420, 140, 140],
    [300, 300, 140, 120], [1000, 520, 180, 140]
  ];
  const shops = [
    { x: 480, y: 280, name: "好饱食堂" },
    { x: 700, y: 250, name: "校园鸡排" },
    { x: 200, y: 320, name: "西门奶茶" },
    { x: 860, y: 300, name: "面馆" },
    { x: 250, y: 560, name: "便利店" },
    { x: 1100, y: 480, name: "咖啡" }
  ];
  const customers = [
    { x: 200, y: 800 }, { x: 420, y: 820 }, { x: 560, y: 780 },
    { x: 1080, y: 260 }, { x: 1220, y: 360 }, { x: 1050, y: 420 },
    { x: 180, y: 240 }, { x: 900, y: 700 }, { x: 700, y: 850 },
    { x: 1280, y: 700 }
  ];
  const stations = [
    { x: 640, y: 520 },
    { x: 220, y: 480 }
  ];
  const landmarks = [
    { x: 560, y: 160, label: "食堂", color: "#ff8787" },
    { x: 220, y: 800, label: "宿舍", color: "#ffa94d" },
    { x: 1100, y: 300, label: "教学楼", color: "#748ffc" },
    { x: 140, y: 400, label: "校门", color: "#69db7c" },
    { x: 700, y: 520, label: "喷泉", color: "#66d9e8" }
  ];
  const spawns = [
    { x: 620, y: 600 }, { x: 780, y: 600 },
    { x: 620, y: 440 }, { x: 780, y: 440 }
  ];

  // DOM
  const $ = (id) => document.getElementById(id);
  const screens = {
    lobby: $("screen-lobby"),
    game: $("screen-game"),
    result: $("screen-result")
  };
  const canvas = $("cv");
  const ctx = canvas.getContext("2d");

  let viewW = 480, viewH = 640;
  let state = null;
  let joy = { active: false, dx: 0, dy: 0, id: null };
  const keys = Object.create(null);

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.classList.toggle("hidden", k !== name);
    });
  }

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1500);
  }

  function banner(msg) {
    const b = $("banner");
    b.textContent = msg;
    b.classList.remove("hidden");
    clearTimeout(banner._t);
    banner._t = setTimeout(() => b.classList.add("hidden"), 2000);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function hitBuilding(x, y, r) {
    for (const [bx, by, bw, bh] of buildings) {
      const nx = clamp(x, bx, bx + bw);
      const ny = clamp(y, by, by + bh);
      if (Math.hypot(x - nx, y - ny) < r) return true;
    }
    return false;
  }

  function moveEnt(ent, dx, dy, speed, dt) {
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return;
    const mx = (dx / len) * speed * dt;
    const my = (dy / len) * speed * dt;
    const nx = ent.x + mx;
    const ny = ent.y + my;
    if (!hitBuilding(nx, ent.y, ent.r)) ent.x = nx;
    if (!hitBuilding(ent.x, ny, ent.r)) ent.y = ny;
    ent.x = clamp(ent.x, 24, WORLD.w - 24);
    ent.y = clamp(ent.y, 24, WORLD.h - 24);
  }

  function pickTier(forceS) {
    if (forceS) return CFG.tiers[3];
    const sum = CFG.tiers.reduce((s, t) => s + t.w, 0);
    let r = Math.random() * sum;
    for (const t of CFG.tiers) {
      r -= t.w;
      if (r <= 0) return t;
    }
    return CFG.tiers[0];
  }

  function createOrder(forceS) {
    const tier = pickTier(forceS);
    let shop = shops[(Math.random() * shops.length) | 0];
    let cust = customers[(Math.random() * customers.length) | 0];
    let n = 0;
    while (dist(shop, cust) < 200 && n++ < 30) {
      cust = customers[(Math.random() * customers.length) | 0];
    }
    return {
      id: Math.random().toString(36).slice(2, 9),
      tier: tier.id,
      base: tier.base,
      gold: tier.gold,
      color: tier.color,
      timeLimit: tier.time,
      shop: { x: shop.x, y: shop.y, name: shop.name },
      cust: { x: cust.x, y: cust.y },
      owner: null,
      phase: "open",
      expireAt: null,
      bait: false,
      bubble: { x: shop.x + 28, y: shop.y - 36 }
    };
  }

  function ensureOrders() {
    while (state.orders.filter((o) => o.phase === "open" && !o.bait).length < CFG.ordersMin) {
      if (state.orders.filter((o) => o.phase === "open").length >= CFG.ordersMax) break;
      state.orders.push(createOrder(false));
    }
  }

  function resize() {
    const stage = $("stage");
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewW = Math.max(300, rect.width);
    viewH = Math.max(240, rect.height);
    canvas.width = viewW * dpr;
    canvas.height = viewH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function heldBy(who) {
    return state.orders.find((o) => o.owner === who && !o.bait);
  }

  function claimOrder(order, who) {
    if (order.phase !== "open") return false;
    if (order.bait) {
      if (who === "player") {
        toast("假单！被骗了～");
        state.orders = state.orders.filter((o) => o.id !== order.id);
        if (state.tutorialStep === 1) {/* stay */}
      }
      return false;
    }
    if (heldBy(who)) {
      if (who === "player") toast("先送完当前单");
      return false;
    }
    // contested: if AI and player both near — first click wins for player path
    order.owner = who;
    order.phase = "to_shop";
    order.expireAt = state.simTime + order.timeLimit;
    if (who === "player") {
      toast(`抢到 ${order.tier} 单 · 去取货`);
      if (state.tutorialStep === 1) advanceTutorial(2);
    } else {
      const names = { ai1: "小红", ai2: "阿强" };
      toast(`${names[who] || "对手"} 抢走一单`);
    }
    return true;
  }

  function scoreOrder(order, who) {
    const remain = Math.max(0, order.expireAt - state.simTime);
    const ratio = remain / order.timeLimit;
    const bonus = ratio >= 0.5 ? 1.2 : ratio >= 0.2 ? 1.0 : 0.8;
    let points = Math.round(order.base * bonus);
    const rider = state.riders[who];
    if (who === "player") {
      state.streak += 1;
      if (state.streak === 2) points += 20;
      else if (state.streak === 3) points += 40;
      else if (state.streak >= 4) points += 60;
      rider.score += points;
      state.gold += order.gold;
      state.doneOrders += 1;
      toast(`送达 +${points}`);
      if (state.tutorialStep === 3) advanceTutorial(4);
    } else {
      rider.score += points;
    }
    state.orders = state.orders.filter((o) => o.id !== order.id);
    ensureOrders();
  }

  function failOrder(order) {
    if (order.owner === "player") {
      state.streak = 0;
      toast("超时，订单失败");
    }
    state.orders = state.orders.filter((o) => o.id !== order.id);
    ensureOrders();
  }

  function nearStation(p) {
    return stations.find((s) => dist(p, s) < 48) || null;
  }

  function effSpeed(rider) {
    let s = CFG.vehicles[rider.vehicle].speed;
    if (rider.boostUntil > state.simTime) s *= CFG.skills.boost.mult;
    if (rider.slowUntil > state.simTime) s *= CFG.skills.oil.mult;
    // bike narrow path bonus: near buildings edges
    if (rider.vehicle === "bike") s *= 1.08;
    return s;
  }

  function advanceTutorial(step) {
    state.tutorialStep = step;
    const box = $("tutorial");
    const text = $("tutorial-text");
    if (step === 1) {
      box.classList.remove("hidden");
      text.textContent = "第一步：点击橙色气泡，抢一单";
    } else if (step === 2) {
      text.textContent = "第二步：跟着虚线去蓝色取货点";
    } else if (step === 3) {
      text.textContent = "第三步：送到紫色顾客点";
    } else {
      box.classList.add("hidden");
      state.tutorialDone = true;
      toast("上手完成，加油送！");
    }
  }

  function openSwapPanel() {
    if (!nearStation(state.riders.player)) {
      toast("靠近蓝色换车站");
      return;
    }
    const list = $("swap-list");
    list.innerHTML = "";
    Object.values(CFG.vehicles).forEach((v) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "swap-item" + (state.riders.player.vehicle === v.id ? " current" : "");
      const locked = v.need && state.doneOrders < v.need;
      const poor = v.cost > 0 && state.gold < v.cost && state.riders.player.vehicle !== v.id;
      btn.disabled = locked || poor;
      let tip = v.cost ? `${v.cost} 币` : "免费";
      if (locked) tip = `完成${v.need}单解锁`;
      if (state.riders.player.vehicle === v.id) tip = "当前";
      btn.innerHTML = `<span>${v.name}</span><span>${tip}</span>`;
      btn.onclick = () => startSwap(v.id);
      list.appendChild(btn);
    });
    $("swap-panel").classList.remove("hidden");
  }

  function startSwap(vehId) {
    $("swap-panel").classList.add("hidden");
    if (state.riders.player.vehicle === vehId) return;
    const v = CFG.vehicles[vehId];
    if (v.need && state.doneOrders < v.need) return;
    if (v.cost > state.gold && vehId !== "bike") {
      toast("金币不足");
      return;
    }
    state.swapUntil = state.simTime + 1.5;
    state.pendingVehicle = vehId;
    toast("换车中 1.5 秒…");
  }

  function useSkill() {
    if (!state.running) return;
    const p = state.riders.player;
    const kind = state.activeSkill;
    if (kind === "boost") {
      if (state.cd.boost > 0) return;
      p.boostUntil = state.simTime + CFG.skills.boost.dur;
      state.cd.boost = CFG.skills.boost.cd;
      toast("加速冲刺！");
    } else if (kind === "oil") {
      if (state.cd.oil > 0) return;
      state.oilWindup = CFG.skills.oil.windup;
      state.oilPending = true;
      toast("倒油前摇…");
    } else if (kind === "bait") {
      if (state.cd.bait > 0) return;
      const bait = createOrder(false);
      bait.bait = true;
      bait.base = 999;
      bait.color = "#adb5bd";
      bait.tier = "假";
      bait.bubble = { x: p.x + 40, y: p.y - 30 };
      bait.shop = { x: p.x + 80, y: p.y, name: "假店" };
      state.orders.push(bait);
      state.cd.bait = CFG.skills.bait.cd;
      setTimeout(() => {
        if (!state) return;
        state.orders = state.orders.filter((o) => o.id !== bait.id);
      }, CFG.skills.bait.dur * 1000);
      toast("假单诱饵已放出");
      // AI might go for bait if close — handled in AI as normal open order visual
    }
    refreshSkillBtn();
  }

  function refreshSkillBtn() {
    const btn = $("btn-skill");
    const names = { boost: "加速", oil: "倒油", bait: "诱饵" };
    const cds = state.cd;
    const cd = cds[state.activeSkill] || 0;
    btn.disabled = !state.running || cd > 0 || state.oilPending;
    btn.textContent = cd > 0 ? `${names[state.activeSkill]} ${Math.ceil(cd)}` : names[state.activeSkill];
  }

  function updateRankbar() {
    const rows = Object.values(state.riders)
      .slice()
      .sort((a, b) => b.score - a.score);
    $("rankbar").innerHTML = rows.map((r, i) => {
      const me = r.id === "player" ? " me" : "";
      return `<span class="${me}">${i + 1}.${r.name} ${r.score}</span>`;
    }).join("");
  }

  function makeRider(id, name, color, spawn, isPlayer) {
    return {
      id, name, color, isPlayer,
      x: spawn.x, y: spawn.y, r: 15,
      vehicle: "bike",
      score: 0,
      boostUntil: 0,
      slowUntil: 0,
      waitUntil: 0
    };
  }

  function startGame(duration) {
    const skipTut = localStorage.getItem("js_waimai_tut") === "1";
    state = {
      running: true,
      duration,
      timeLeft: duration,
      simTime: 0,
      gold: CFG.startGold,
      doneOrders: 0,
      streak: 0,
      orders: [],
      cam: { x: 0, y: 0 },
      activeSkill: "boost",
      owned: { oil: false, bait: false },
      cd: { boost: 0, oil: 0, bait: 0 },
      swapUntil: 0,
      pendingVehicle: null,
      oilPending: false,
      oilWindup: 0,
      nextHigh: CFG.highInterval,
      tutorialStep: skipTut ? 4 : 1,
      tutorialDone: skipTut,
      adDoubled: false,
      riders: {
        player: makeRider("player", "你", "#20c997", spawns[0], true),
        ai1: makeRider("ai1", "小红", "#fa5252", spawns[1], false),
        ai2: makeRider("ai2", "阿强", "#845ef7", spawns[2], false)
      }
    };
    ensureOrders();
    showScreen("game");
    $("swap-panel").classList.add("hidden");
    $("btn-buy-oil").disabled = false;
    $("btn-buy-bait").disabled = false;
    resize();
    if (!skipTut) advanceTutorial(1);
    else $("tutorial").classList.add("hidden");
    refreshSkillBtn();
    updateHud();
    toast("开局！大学城高峰来了");
  }

  function endGame() {
    state.running = false;
    $("swap-panel").classList.add("hidden");
    const ranked = Object.values(state.riders).sort((a, b) => b.score - a.score);
    const place = ranked.findIndex((r) => r.id === "player") + 1;
    let scoreShow = state.riders.player.score;
    if (state.adDoubled) scoreShow *= 2;
    $("result-rank").textContent = `第 ${place} 名`;
    $("result-detail").textContent =
      `得分 ${state.riders.player.score}` +
      (state.adDoubled ? `（展示×2 → ${scoreShow}）` : "") +
      ` · 完成 ${state.doneOrders} 单 · 金币 ${state.gold}`;
    let hi = "";
    if (state.doneOrders >= ranked.every((r) => r.id === "player" || state.doneOrders >= 0)) {
      const mostOrders = state.doneOrders >= 3;
      if (place === 1) hi = "高光：金牌外卖员";
      else if (mostOrders) hi = "高光：勤奋小哥";
      else hi = "高光：还差一点点";
    }
    $("result-highlight").textContent = hi;
    $("btn-ad").disabled = state.adDoubled;
    showScreen("result");
  }

  function updateHud() {
    if (!state) return;
    const m = Math.floor(state.timeLeft / 60);
    const s = Math.floor(state.timeLeft % 60);
    $("hud-time").textContent = `${m}:${s.toString().padStart(2, "0")}`;
    $("hud-score").textContent = String(state.riders.player.score);
    $("hud-gold").textContent = String(state.gold);
    $("hud-veh").textContent = CFG.vehicles[state.riders.player.vehicle].name;

    const mine = heldBy("player");
    const card = $("order-card");
    if (!mine) {
      card.textContent = "无订单：点击橙色气泡抢单";
    } else {
      const left = Math.max(0, mine.expireAt - state.simTime);
      const protect = mine.phase === "to_cust" && left <= CFG.protectSec;
      card.innerHTML = mine.phase === "to_shop"
        ? `<b>去取货</b><br>${mine.shop.name || "商家"} · 剩余 ${left.toFixed(0)}s`
        : `<b>去送达</b><br>顾客点 · 剩余 ${left.toFixed(0)}s${protect ? "<br>✓ 保护中" : ""}`;
    }
    updateRankbar();
    refreshSkillBtn();
    $("btn-interact").disabled = !nearStation(state.riders.player) || state.swapUntil > state.simTime;
  }

  function updatePlayer(dt) {
    const p = state.riders.player;
    let dx = joy.dx;
    let dy = joy.dy;
    if (keys.KeyW || keys.ArrowUp) dy -= 1;
    if (keys.KeyS || keys.ArrowDown) dy += 1;
    if (keys.KeyA || keys.ArrowLeft) dx -= 1;
    if (keys.KeyD || keys.ArrowRight) dx += 1;
    if (state.swapUntil > state.simTime) {
      // locked during swap
    } else if (dx || dy) {
      moveEnt(p, dx, dy, effSpeed(p), dt);
    }

    if (state.pendingVehicle && state.simTime >= state.swapUntil) {
      const v = CFG.vehicles[state.pendingVehicle];
      if (v.id !== "bike") state.gold -= v.cost;
      p.vehicle = v.id;
      state.pendingVehicle = null;
      state.swapUntil = 0;
      toast(`已换成${v.name}`);
    }

    if (state.oilPending) {
      state.oilWindup -= dt;
      if (state.oilWindup <= 0) {
        state.oilPending = false;
        state.cd.oil = CFG.skills.oil.cd;
        // hit nearest AI not in protect
        let best = null;
        let bestD = 9999;
        for (const r of Object.values(state.riders)) {
          if (r.isPlayer) continue;
          const d = dist(p, r);
          if (d < bestD) { bestD = d; best = r; }
        }
        if (best && bestD < 220) {
          const o = heldBy(best.id);
          const isProtected = o && o.phase === "to_cust" && (o.expireAt - state.simTime) <= CFG.protectSec;
          if (isProtected) toast("对方保护中，倒油失败");
          else {
            best.slowUntil = state.simTime + CFG.skills.oil.dur;
            state.riders.player.score += 15;
            toast(`倒油命中 ${best.name} +15`);
          }
        } else toast("倒油落空");
      }
    }

    const mine = heldBy("player");
    if (mine) {
      if (mine.phase === "to_shop" && dist(p, mine.shop) < 32) {
        mine.phase = "to_cust";
        toast("取货成功！去送达");
        if (state.tutorialStep === 2) advanceTutorial(3);
      } else if (mine.phase === "to_cust" && dist(p, mine.cust) < 32) {
        scoreOrder(mine, "player");
      }
    }
  }

  function updateAI(rider, dt) {
    if (rider.waitUntil > state.simTime) return;
    let order = heldBy(rider.id);
    if (!order) {
      const open = state.orders.filter((o) => o.phase === "open");
      if (open.length) {
        open.sort((a, b) => {
          const score = (o) => (o.bait ? 50 : o.base) / (dist(rider, o.bubble) + 40);
          return score(b) - score(a);
        });
        const target = open[0];
        if (dist(rider, target.bubble) < 28) {
          if (target.bait) {
            // AI fooled
            state.orders = state.orders.filter((o) => o.id !== target.id);
            rider.waitUntil = state.simTime + 0.6;
            return;
          }
          claimOrder(target, rider.id);
          order = target;
        } else {
          moveEnt(rider, target.bubble.x - rider.x, target.bubble.y - rider.y, effSpeed(rider) * 0.92, dt);
          return;
        }
      }
    }
    if (order) {
      const t = order.phase === "to_shop" ? order.shop : order.cust;
      moveEnt(rider, t.x - rider.x, t.y - rider.y, effSpeed(rider) * 0.95, dt);
      if (order.phase === "to_shop" && dist(rider, order.shop) < 30) {
        if (!rider._pickAt) rider._pickAt = state.simTime + CFG.sameSpotWait * 0.5;
        if (state.simTime >= rider._pickAt) {
          order.phase = "to_cust";
          rider._pickAt = 0;
        }
      } else if (order.phase === "to_cust" && dist(rider, order.cust) < 30) {
        scoreOrder(order, rider.id);
      }
    } else {
      // wander toward fountain
      moveEnt(rider, 700 - rider.x, 520 - rider.y, effSpeed(rider) * 0.5, dt);
    }
  }

  function update(dt) {
    if (!state || !state.running) return;
    state.simTime += dt;
    state.timeLeft -= dt;
    state.cd.boost = Math.max(0, state.cd.boost - dt);
    state.cd.oil = Math.max(0, state.cd.oil - dt);
    state.cd.bait = Math.max(0, state.cd.bait - dt);
    state.nextHigh -= dt;

    if (state.nextHigh <= 0) {
      state.nextHigh = CFG.highInterval;
      if (Math.random() < 0.4) {
        state.orders.push(createOrder(true));
        banner("天价单出现！");
      }
    }

    for (const o of [...state.orders]) {
      if (o.owner && o.expireAt != null && state.simTime >= o.expireAt) failOrder(o);
    }

    updatePlayer(dt);
    updateAI(state.riders.ai1, dt);
    updateAI(state.riders.ai2, dt);

    const p = state.riders.player;
    state.cam.x = clamp(p.x - viewW / 2, 0, Math.max(0, WORLD.w - viewW));
    state.cam.y = clamp(p.y - viewH / 2, 0, Math.max(0, WORLD.h - viewH));

    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame();
    }
    updateHud();
  }

  function drawRider(r) {
    const v = CFG.vehicles[r.vehicle];
    // vehicle body
    ctx.fillStyle = v.color;
    if (r.vehicle === "bike") {
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + 4, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (r.vehicle === "ebike") {
      ctx.fillRect(r.x - 12, r.y - 4, 24, 12);
      ctx.fillStyle = "#212529";
      ctx.fillRect(r.x + 6, r.y - 14, 10, 12);
    } else {
      ctx.beginPath();
      ctx.ellipse(r.x, r.y + 2, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // head
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(r.x, r.y - 10, 9, 0, Math.PI * 2);
    ctx.fill();
    if (r.isPlayer) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y - 10, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    if (r.boostUntil > state.simTime) {
      ctx.strokeStyle = "#74c0fc";
      ctx.beginPath();
      ctx.arc(r.x, r.y, 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (r.slowUntil > state.simTime) {
      ctx.strokeStyle = "#ffd166";
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(r.x, r.y, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#fff";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(r.name, r.x, r.y + 22);
  }

  function draw() {
    if (!state) return;
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.translate(-state.cam.x, -state.cam.y);

    // grass
    ctx.fillStyle = "#8fd460";
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    // roads
    ctx.fillStyle = "#cfd4da";
    ctx.fillRect(0, 460, WORLD.w, 90);
    ctx.fillRect(560, 0, 100, WORLD.h);
    ctx.fillRect(0, 240, WORLD.w, 70);
    ctx.fillRect(200, 0, 70, WORLD.h);
    ctx.fillRect(900, 0, 70, WORLD.h);
    // road lines
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 505);
    ctx.lineTo(WORLD.w, 505);
    ctx.moveTo(610, 0);
    ctx.lineTo(610, WORLD.h);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;

    // buildings
    for (const [bx, by, bw, bh] of buildings) {
      ctx.fillStyle = "#f1f3f5";
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = "#adb5bd";
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = "#ffd8a8";
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(bx + 12 + i * 28, by + 16, 14, 14);
      }
    }

    for (const lm of landmarks) {
      ctx.fillStyle = lm.color;
      ctx.beginPath();
      ctx.arc(lm.x, lm.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(31,42,55,0.75)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(lm.label, lm.x, lm.y - 14);
    }

    // fountain
    ctx.fillStyle = "#66d9e8";
    ctx.beginPath();
    ctx.arc(700, 520, 28, 0, Math.PI * 2);
    ctx.fill();

    for (const s of shops) {
      ctx.fillStyle = "#4a90e2";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("取", s.x, s.y + 3);
    }
    for (const c of customers) {
      ctx.fillStyle = "#be4bdb";
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("客", c.x, c.y + 3);
    }
    for (const s of stations) {
      ctx.fillStyle = "#339af0";
      ctx.fillRect(s.x - 26, s.y - 18, 52, 36);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("换", s.x, s.y + 5);
    }

    // orders
    for (const o of state.orders) {
      if (o.phase === "open") {
        const bx = o.bubble.x;
        const by = o.bubble.y;
        ctx.fillStyle = o.bait ? "#ced4da" : o.color;
        ctx.beginPath();
        ctx.arc(bx, by, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = o.bait ? "#495057" : "#1a1208";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(o.bait ? "假" : String(o.base), bx, by + 4);
        ctx.fillStyle = o.bait ? "#868e96" : o.color;
        ctx.font = "10px sans-serif";
        ctx.fillText(o.tier, bx, by - 22);
      }
    }

    // guide line
    const mine = heldBy("player");
    const p = state.riders.player;
    if (mine) {
      const t = mine.phase === "to_shop" ? mine.shop : mine.cust;
      ctx.strokeStyle = "#ffd166";
      ctx.setLineDash([8, 8]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      const protect = mine.phase === "to_cust" && (mine.expireAt - state.simTime) <= CFG.protectSec;
      if (protect) {
        ctx.strokeStyle = "#3dd68c";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    if (state.oilPending) {
      ctx.strokeStyle = "#ff922b";
      ctx.lineWidth = 2;
      for (const r of Object.values(state.riders)) {
        if (r.isPlayer) continue;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 34, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    if (state.swapUntil > state.simTime) {
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("换车", p.x, p.y + 4);
    }

    drawRider(state.riders.ai1);
    drawRider(state.riders.ai2);
    drawRider(state.riders.player);

    ctx.restore();
  }

  // input
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (!state || !state.running) return;
    if (e.code === "KeyE") useSkill();
    if (e.code === "KeyF") openSwapPanel();
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  window.addEventListener("resize", resize);

  canvas.addEventListener("click", (e) => {
    if (!state || !state.running) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * viewW + state.cam.x;
    const y = ((e.clientY - rect.top) / rect.height) * viewH + state.cam.y;
    for (const o of state.orders) {
      if (o.phase !== "open") continue;
      if (Math.hypot(x - o.bubble.x, y - o.bubble.y) < 24) {
        claimOrder(o, "player");
        break;
      }
    }
  });

  // joystick
  const joyEl = $("joystick");
  const knob = $("joy-knob");
  function setKnob(dx, dy) {
    const max = 32;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (dx / len) * Math.min(len, max);
    const ny = (dy / len) * Math.min(len, max);
    knob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    joy.dx = nx / max;
    joy.dy = ny / max;
  }
  function resetJoy() {
    joy.active = false;
    joy.dx = 0;
    joy.dy = 0;
    joy.id = null;
    knob.style.transform = "translate(-50%, -50%)";
  }
  function joyPos(e, el) {
    const rect = el.getBoundingClientRect();
    const t = e.changedTouches ? e.changedTouches[0] : e;
    return { x: t.clientX - rect.left - rect.width / 2, y: t.clientY - rect.top - rect.height / 2 };
  }
  joyEl.addEventListener("pointerdown", (e) => {
    joy.active = true;
    joy.id = e.pointerId;
    joyEl.setPointerCapture(e.pointerId);
    const p = joyPos(e, joyEl);
    setKnob(p.x, p.y);
  });
  joyEl.addEventListener("pointermove", (e) => {
    if (!joy.active || e.pointerId !== joy.id) return;
    const p = joyPos(e, joyEl);
    setKnob(p.x, p.y);
  });
  joyEl.addEventListener("pointerup", resetJoy);
  joyEl.addEventListener("pointercancel", resetJoy);

  // buttons
  $("btn-play-180").onclick = () => startGame(180);
  $("btn-play-90").onclick = () => startGame(90);
  $("btn-again").onclick = () => startGame(state ? state.duration : 180);
  $("btn-lobby").onclick = () => showScreen("lobby");
  $("btn-ad").onclick = () => {
    state.adDoubled = true;
    $("btn-ad").disabled = true;
    toast("模拟激励视频完成，展示奖励×2");
    const base = state.riders.player.score;
    $("result-detail").textContent =
      `得分 ${base}（展示×2 → ${base * 2}） · 完成 ${state.doneOrders} 单 · 金币 ${state.gold}`;
  };
  $("btn-skip-tutorial").onclick = () => {
    localStorage.setItem("js_waimai_tut", "1");
    advanceTutorial(4);
  };
  $("btn-close-swap").onclick = () => $("swap-panel").classList.add("hidden");
  $("btn-interact").onclick = () => openSwapPanel();
  $("btn-skill").onclick = () => useSkill();
  $("btn-buy-oil").onclick = () => {
    if (!state || !state.running || state.owned.oil) return;
    if (state.gold < 60) return toast("金币不足");
    state.gold -= 60;
    state.owned.oil = true;
    state.activeSkill = "oil";
    $("btn-buy-oil").disabled = true;
    toast("已装备倒油（点技能键释放）");
    refreshSkillBtn();
  };
  $("btn-buy-bait").onclick = () => {
    if (!state || !state.running || state.owned.bait) return;
    if (state.gold < 60) return toast("金币不足");
    state.gold -= 60;
    state.owned.bait = true;
    state.activeSkill = "bait";
    $("btn-buy-bait").disabled = true;
    toast("已装备诱饵");
    refreshSkillBtn();
  };

  // long-press skill to cycle owned skills
  let skillTimer = null;
  $("btn-skill").addEventListener("pointerdown", () => {
    skillTimer = setTimeout(() => {
      if (!state) return;
      const opts = ["boost"];
      if (state.owned.oil) opts.push("oil");
      if (state.owned.bait) opts.push("bait");
      const i = opts.indexOf(state.activeSkill);
      state.activeSkill = opts[(i + 1) % opts.length];
      toast(`切换技能：${state.activeSkill === "boost" ? "加速" : state.activeSkill === "oil" ? "倒油" : "诱饵"}`);
      refreshSkillBtn();
    }, 450);
  });
  $("btn-skill").addEventListener("pointerup", () => clearTimeout(skillTimer));
  $("btn-skill").addEventListener("pointerleave", () => clearTimeout(skillTimer));

  // loop
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state && state.running) update(dt);
    if (state && !screens.game.classList.contains("hidden")) draw();
    requestAnimationFrame(loop);
  }
  showScreen("lobby");
  requestAnimationFrame(loop);
})();
