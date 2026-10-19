'use strict';
/* ============================================================
   ONE MORE — game core: state, areas, waves, entities, weapons
   The world is an unbounded sheet of paper; the camera follows
   the brush. Three scrolls of ten waves, then the endless sheet.
   ============================================================ */

const G = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* QA hooks (hidden): ?wave=N starts mid-journey, &power=N seeds a build.
     For testing the deep sheets, the Guardians and the ending on film. */
  let qaWave = 0, qaPower = 0;
  try {
    const q = new URLSearchParams(location.search);
    qaWave = Math.max(0, Math.min(199, parseInt(q.get('wave'), 10) || 0));
    qaPower = Math.max(0, Math.min(14, parseInt(q.get('power'), 10) || 0));
  } catch (e) {}

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* ---------------- state ---------------- */
  const S = {
    mode: 'title',
    W: 0, H: 0, dpr: 1,
    reduced: false,

    player: { x: 0, y: 0, r: CFG.player.r, aim: 0, fireT: 0, recoil: 0, vx: 0, vy: 0 },
    cam: { x: 0, y: 0 },
    look: { x: 0, y: 0 },          // camera look-ahead, follows true velocity
    stats: null,
    runMode: 'journey',            // 'journey' | 'endless'
    areaIdx: 0,

    bullets: [], ebullets: [], enemies: [], markers: [], particles: [], popups: [], rings: [], idle: [],
    puddles: [], spirits: [], stamps: [], motes: [], pickups: [],
    arcs: [], vortices: [], bolts: [],
    stainQueue: [],
    queue: [], waveInitial: 0, waveActive: false, spawnTimer: 0, clearedT: 0,

    invulnT: 0, adrenT: 0, shake: 0, dyingT: 0, novaT: 0, clockT: 0,
    fanT: 2.2, spiritT: 1.6, hankoT: 4.0, trailT: 0,
    arcT: 2.0, boomerT: 1.5, vortexT: 3.0,
    combo: 0, comboT: 0, hitstop: 0, magnetT: 0,
    pendingLevels: 0, pendingChests: 0, upKind: 'wave', vacuum: false,
    choices: [], selected: null,

    brush: 'needle',
    beginT: 0,                     // the opening wash of a run
    joy: null,
    inputVec: { x: 0, y: 0 },
  };

  /* ---------------- starting brushes ---------------- */
  const getBrush = () => store.get('om_brush_v1', 'needle');
  function setBrush(id) {
    if (!CFG.brushes[id]) return;
    S.brush = id;
    store.set('om_brush_v1', id);
  }

  function freshStats() {
    const bm = CFG.brushes[S.brush] ? CFG.brushes[S.brush].mods : {};
    return {
      fireCdMult: bm.fireCdMult || 1, dmg: bm.dmg || 1, shots: bm.shots || 1,
      pierce: 0, moveMult: bm.moveMult || 1,
      maxHp: CFG.player.hp + (bm.maxHp || 0), hp: CFG.player.hp + (bm.maxHp || 0),
      bulletSpeedMult: 1,
      adren: 0, shock: false, levels: {},
      echo: 0, orb: 0, nova: 0, slow: 0, crit: 0, ward: false, wardCd: 0,
      fan: 0, trailW: 0, spirit: 0, hanko: 0, arc: 0, boomer: 0, vortex: 0,
      magnet: 0, mends: 0, well: 0, mendsT: 0,
      xp: 0, xpLevel: 0,
      score: 0, kills: 0, time: 0, wave: 0,
    };
  }

  /* ---------------- ink motes & level-ups ---------------- */
  function dropMote(x, y, val, tier) {
    if (S.motes.length >= CFG.xp.cap) {
      /* the sheet is crowded — the oldest mote soaks into the nearest one */
      const old = S.motes.shift();
      val += old.val;
    }
    const a = rand(0, TAU), d = rand(4, 26);
    S.motes.push({
      x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      vx: Math.cos(a) * rand(30, 90), vy: Math.sin(a) * rand(30, 90),
      val, tier: tier || 0, age: 0, seed: (Math.random() * 1e9) | 0,
      pull: false, r: tier === 2 ? 6 : tier === 1 ? 4.6 : 3.4,
    });
  }

  function moteValue(v) { return Math.max(1, Math.round(v * (1 + 0.25 * S.stats.well))); }

  function collectXP(v) {
    const st = S.stats;
    st.xp += v;
    while (st.xp >= CFG.xp.req(st.xpLevel)) {
      st.xp -= CFG.xp.req(st.xpLevel);
      st.xpLevel++;
      S.pendingLevels++;
      S.popups.push({ x: S.player.x, y: S.player.y - 22, txt: '墨 INK RISES', life: 1.1, max: 1.1, red: true });
    }
    if (S.pendingLevels > 0 && S.mode === 'playing') openUpgrade('level');
  }

  /* kill-drop tier by cost: cheap beasts shed small motes */
  function moteTierFor(cost) {
    if (cost >= 4) return 2;
    if (cost >= 2) return 1;
    return 0;
  }

  function dropPickup(kind, x, y) {
    S.pickups.push({ kind, x, y, age: 0, seed: (Math.random() * 1e9) | 0, bob: rand(0, 6.28) });
  }

  function comboMult() {
    return 1 + Math.min(CFG.combo.max - 1, S.combo * CFG.combo.step);
  }

  /* ---------------- persistence ---------------- */
  const getBest = () => store.get('om_best_v1', null);
  const getRuns = () => store.get('om_runs_v1', 0);

  /* ---------------- helpers ---------------- */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* which scroll are we on, and how hard has the endless paper grown */
  function areaStateFor(w) {
    const per = CFG.wave.wavesPerArea;
    const cycle = Math.floor((w - 1) / per);
    const waveInArea = ((w - 1) % per) + 1;
    const themeIdx = S.runMode === 'endless'
      ? cycle % AREAS.length
      : Math.min(cycle, AREAS.length - 1);
    const area = AREAS[themeIdx];
    let hp = area.mult.hp, sp = area.mult.sp, budget = area.mult.budget;
    if (S.runMode === 'endless' && cycle >= AREAS.length) {
      const k = cycle - (AREAS.length - 1);
      hp *= Math.pow(CFG.endless.hpGrowth, k);
      sp *= Math.pow(CFG.endless.spGrowth, k);
      budget *= Math.pow(CFG.endless.budgetGrowth, k);
    }
    return { cycle, waveInArea, themeIdx, area, hp, sp, budget, isElite: waveInArea === per };
  }

  /* a birth point just past the edge of the eye — measured to the
     view RECTANGLE, so spawns always land off-screen on every side */
  function edgePoint(sideHint) {
    const pad = CFG.world.spawnPad;
    for (let tries = 0; tries < 10; tries++) {
      const a = (sideHint != null && tries < 2)
        ? sideHint * (Math.PI / 2) + rand(-0.35, 0.35)
        : rand(0, TAU);
      const cx = Math.cos(a), cy = Math.sin(a);
      const ax = Math.abs(cx) > 1e-4 ? (S.W / 2 + pad) / Math.abs(cx) : Infinity;
      const ay = Math.abs(cy) > 1e-4 ? (S.H / 2 + pad) / Math.abs(cy) : Infinity;
      const t = Math.min(ax, ay) + rand(10, 130);
      return { x: S.player.x + cx * t, y: S.player.y + cy * t };
    }
  }

  function burst(x, y, r, big) {
    const n = big ? 26 : Math.round(clamp(r, 6, 14)) + 4;
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(50, big ? 340 : 240);
      S.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        rot: rand(0, 6.28), vr: rand(-9, 9),
        size: rand(2, big ? 6 : 4.4),
        shape: ['tri', 'dot', 'line'][Math.floor(Math.random() * 3)],
        life: rand(0.3, big ? 0.9 : 0.6), max: 1,
      });
      const p = S.particles[S.particles.length - 1];
      p.max = p.life;
    }
  }

  /* ---------------- enemies ---------------- */
  function spawnEnemy(type, x, y, opts = {}) {
    const def = ENEMIES[type];
    const w = S.stats.wave;
    const st = areaStateFor(w);
    let hp = CFG.wave.hpScale(def.hp, w, def.intro) * st.hp;
    let r = def.r;
    let speed = def.speed * CFG.wave.spScale(w, def.intro) * st.sp;
    if (opts.elite) {
      hp = Math.round(hp * CFG.wave.eliteHpMult);
      r = Math.round(r * CFG.wave.eliteR);
      speed *= 0.86;
    }
    hp = Math.max(1, Math.round(hp));
    const e = {
      type, x, y, r, hp, maxHp: hp,
      speed, elite: !!opts.elite,
      ang: Math.atan2(S.player.y - y, S.player.x - x),
      t: rand(0, 10), hitFlash: 0, kbx: 0, kby: 0,
      state: 'cruise', stateT: rand(0.3, 1.5), seed: rand(0, 6.28), stun: 0,
      slowT: 0, orbCd: 0, dirT: 0, spawnT: type === 'titan' ? 2.5 : 0,
      px: 0, py: 0, // kage perch / crane pass target
    };
    S.enemies.push(e);
    S.rings.push({ x, y, max: r * 2.4, life: 0.3, maxLife: 0.3 });
    return e;
  }

  function killEnemy(e) {
    const def = ENEMIES[e.type];
    const isBoss = !!def.boss;
    const mult = 1 + 0.15 * Math.max(0, S.stats.wave - 1);
    /* the chain: each kill within the breath of the last feeds the score */
    S.combo++;
    S.comboT = CFG.combo.decay;
    const pts = Math.round((def.score * mult * (e.elite ? 6 : 1) * comboMult()) / 5) * 5;
    S.stats.score += pts;
    S.stats.kills++;
    UI.setScore(S.stats.score);
    UI.setCombo(S.combo, comboMult());
    S.popups.push({
      x: e.x, y: e.y - e.r - 4,
      txt: isBoss ? def.name + ' +' + pts : e.elite ? 'GUARDIAN +' + pts : '+' + pts,
      life: isBoss || e.elite ? 1.4 : 0.7, max: isBoss || e.elite ? 1.4 : 0.7, red: e.elite || isBoss,
    });
    burst(e.x, e.y, e.r, isBoss || e.type === 'titan' || e.elite);
    S.stainQueue.push({
      x: e.x, y: e.y, r: e.r * (isBoss ? 3 : e.elite ? 2.2 : 1.45),
      alpha: isBoss ? 0.65 : e.elite ? 0.6 : 0.5,
      red: isBoss || e.elite || e.type === 'oni',
    });
    if (isBoss || e.type === 'slab' || e.type === 'titan' || e.type === 'oni' || e.type === 'golem' || e.elite) SFX.bigKill(); else SFX.kill();
    /* hit-stop: the paper holds its breath on the heavy strokes */
    if (!S.reduced) {
      if (isBoss) S.hitstop = Math.max(S.hitstop, 0.14);
      else if (e.elite || e.type === 'titan' || e.type === 'golem') S.hitstop = Math.max(S.hitstop, 0.09);
      else if (e.type === 'slab' || e.type === 'oni') S.hitstop = Math.max(S.hitstop, 0.045);
    }
    if (e.elite || isBoss) { S.shake = Math.max(S.shake, isBoss ? 13 : 9); }

    /* ink motes spill from every kill */
    const tier = moteTierFor(def.cost);
    if (isBoss) {
      for (let i = 0; i < 14; i++) dropMote(e.x + rand(-30, 30), e.y + rand(-30, 30), moteValue(4), 2);
      dropPickup('pot', e.x + rand(-24, 24), e.y + rand(-24, 24));
      dropPickup('chest', e.x, e.y);
      UI.guardianFalls(def.name);
    } else if (e.elite) {
      for (let i = 0; i < 7; i++) dropMote(e.x + rand(-20, 20), e.y + rand(-20, 20), moteValue(3), 2);
    } else {
      dropMote(e.x, e.y, moteValue(tier === 2 ? 4 : tier === 1 ? 2 : 1), tier);
      /* rare talismans from the heavy bodies */
      const heavy = e.type === 'slab' || e.type === 'titan' || e.type === 'oni' || e.type === 'golem';
      if (heavy && Math.random() < 0.05) dropPickup('pot', e.x, e.y);
      else if (Math.random() < 0.006) dropPickup('magnet', e.x, e.y);
      else if (Math.random() < 0.006) dropPickup('bomb', e.x, e.y);
    }

    if (e.type === 'split') {
      for (const s of [-1, 1]) {
        const c = spawnEnemy('pulseling', e.x + s * 10, e.y + rand(-6, 6));
        c.kbx = s * 190; c.kby = rand(-70, 70);
      }
    }
    if (e.type === 'titan') {
      /* the mother bursts — her brood scatters */
      for (let i = 0; i < 3; i++) {
        const a = rand(0, 6.28);
        const c = spawnEnemy('pulseling', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20);
        c.kbx = Math.cos(a) * 230; c.kby = Math.sin(a) * 230;
      }
    }
    if (e.type === 'golem') {
      /* the colossus breaks into brutes */
      for (const s of [-1, 1]) {
        const c = spawnEnemy('slab', e.x + s * 18, e.y + rand(-8, 8));
        c.kbx = s * 150; c.kby = rand(-60, 60);
      }
    }
    if (e.type === 'popper') {
      /* a popper's death is a burst of hot ink needles */
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rand(-0.2, 0.2);
        S.ebullets.push({
          kind: 'needle',
          x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
          vx: Math.cos(a) * CFG.needle.speed * 0.8, vy: Math.sin(a) * CFG.needle.speed * 0.8,
          ang: a, age: 0, life: 0.85,
        });
      }
      S.rings.push({ x: e.x, y: e.y, max: 58, life: 0.3, maxLife: 0.3 });
      SFX.needle();
    }
    if (S.stats.adren > 0) S.adrenT = CFG.adrenaline.dur(S.stats.adren);
  }

  function nearestEnemy(x, y, maxD) {
    const p = (x == null) ? S.player : { x, y };
    let best = null, bd = maxD != null ? maxD * maxD : Infinity;
    for (const e of S.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ---------------- waves ---------------- */
  function buildQueue(budget, wave, roster) {
    const pool = roster.filter(k => ENEMIES[k].cost > 0 && ENEMIES[k].intro <= wave);
    const q = [];
    let guard = 0;
    while (budget > 0 && guard++ < 700) {
      const avail = pool.filter(k => ENEMIES[k].cost <= budget);
      if (!avail.length) break;
      let total = 0;
      for (const k of avail) total += (ENEMY_WEIGHTS[k] || 1);
      let r = Math.random() * total, pick = avail[0];
      for (const k of avail) { r -= (ENEMY_WEIGHTS[k] || 1); if (r <= 0) { pick = k; break; } }
      q.push(pick);
      budget -= ENEMIES[pick].cost;
    }
    return shuffle(q);
  }

  function startWave(n, opts = {}) {
    const st = S.stats;
    st.wave = n;
    const as = areaStateFor(n);
    S.areaIdx = as.themeIdx;
    const surge = !as.isElite && as.waveInArea % CFG.wave.surgeEvery === 0;
    let budget = CFG.wave.budget(as.waveInArea, as.cycle) * as.budget;
    if (surge) budget *= CFG.wave.surgeMult + 0.09 * as.cycle;   /* surges bite harder deeper in */
    if (as.isElite) budget *= 1.2;
    S.queue = buildQueue(Math.round(budget), n, as.area.roster);
    S.waveInitial = S.queue.length + (as.isElite ? 1 : 0);
    S.waveActive = true;
    S.spawnTimer = 1.0;
    S.clearedT = 0;
    UI.setWave(as.waveInArea);
    UI.setArea(as.area, as.waveInArea, as.isElite);
    UI.setProgress(0);
    if (opts.quiet) return;   /* a cutscene announces this sheet — no banners */
    if (as.waveInArea === 1) {
      /* the scroll turns — a new sheet of paper */
      UI.areaBanner(as.area, as.cycle, S.runMode === 'endless' && as.cycle >= AREAS.length);
      SFX.gong();
    } else {
      UI.banner(as.waveInArea, surge, as.isElite);
      SFX.wave(surge || as.isElite);
    }
    if (as.isElite) {
      /* the Guardian of the sheet enters — a beast with a name */
      const pt = edgePoint();
      S.markers.push({ type: as.area.boss, x: pt.x, y: pt.y, t: 2.2, elite: true, boss: true });
      UI.guardianBanner(as.area, ENEMIES[as.area.boss].name);
    }
  }

  function pickUpgrades(n) {
    const st = S.stats;
    const avail = shuffle(UPGRADES.filter(u => (st.levels[u.id] || 0) < u.max));
    const out = avail.slice(0, n);
    let i = 0;
    while (out.length < n) {
      const k = i++;
      out.push({
        id: 'patch' + k, name: 'Fresh Water', patch: true,
        desc: 'Restore 1 integrity. Clean water for a tired brush.',
        apply: s => { s.hp = Math.min(s.maxHp, s.hp + 1); },
      });
    }
    return out;
  }

  function openUpgrade(kind) {
    if (S.mode !== 'playing') return;
    S.mode = 'upgrade';
    S.upKind = kind === 'level' || kind === 'chest' ? kind : 'wave';
    if (S.upKind === 'level' && S.pendingLevels > 0) S.pendingLevels--;
    if (S.upKind === 'chest' && S.pendingChests > 0) S.pendingChests--;
    /* globs still aloft settle into the paper */
    for (const b of S.ebullets) S.stainQueue.push({ x: b.x, y: b.y, r: 2.4, alpha: 0.22 });
    S.ebullets.length = 0;
    S.choices = pickUpgrades(3);
    S.selected = null;
    const as = areaStateFor(S.stats.wave);
    UI.setUpgradeHeader(as.waveInArea, as.area, S.stats.wave + 1, S.upKind, S.stats.xpLevel);
    UI.fillUpgrades(S.choices, S.stats.levels);
    UI.markSelected(null);
    const nxt = areaStateFor(S.stats.wave + 1);
    UI.setDeploy(false, S.upKind === 'wave' && nxt.waveInArea === 1 ? nxt.area : null, nxt.waveInArea, nxt.cycle, S.upKind);
    UI.show('upgrade');
    SFX.wave();
  }

  /* a QA build: the first N upgrades of a fixed deep-run kit, applied */
  function applyQAPower(n) {
    const kit = ['heavy', 'rapid', 'plate', 'fan', 'pierce', 'spirit', 'split',
                 'arc', 'orbit', 'magnet', 'crit', 'well', 'velo', 'over'];
    let picks = 0;
    for (let pass = 0; pass < 5 && picks < n; pass++) {
      for (const id of kit) {
        if (picks >= n) break;
        const def = UPGRADES.find(x => x.id === id);
        if (!def || (S.stats.levels[id] || 0) >= def.max) continue;
        def.apply(S.stats);
        S.stats.levels[id] = (S.stats.levels[id] || 0) + 1;
        picks++;
      }
    }
    S.stats.xpLevel = picks;   /* keeps the gauge honest */
  }

  /* ---------------- flow ---------------- */
  function startRun(mode) {
    S.runMode = mode === 'endless' ? 'endless' : 'journey';
    S.brush = getBrush();
    S.stats = freshStats();
    S.bullets = []; S.ebullets = []; S.enemies = []; S.markers = [];
    S.particles = []; S.popups = []; S.rings = []; S.stainQueue = [];
    S.puddles = []; S.spirits = []; S.stamps = [];
    S.motes = []; S.pickups = []; S.arcs = []; S.vortices = []; S.bolts = [];
    S.queue = []; S.waveInitial = 0; S.waveActive = false;
    S.invulnT = 0; S.adrenT = 0; S.shake = 0; S.dyingT = 0; S.novaT = 0;
    S.fanT = 2.2; S.spiritT = 1.6; S.hankoT = 4.0; S.trailT = 0;
    S.arcT = 2.0; S.boomerT = 1.5; S.vortexT = 3.0;
    S.combo = 0; S.comboT = 0; S.hitstop = 0; S.magnetT = 0;
    S.pendingLevels = 0; S.pendingChests = 0; S.vacuum = false;
    S.choices = []; S.selected = null; S.idle = [];
    S.areaIdx = 0;
    S.beginT = S.reduced ? 0.01 : 1.7;   // the brush paints the run in

    const runs = getRuns() + 1;
    store.set('om_runs_v1', runs);

    const p = S.player;
    p.x = 0; p.y = 0;
    p.vx = 0; p.vy = 0;
    p.fireT = 0.3; p.recoil = 0;
    S.cam.x = 0; S.cam.y = 0;
    S.look.x = 0; S.look.y = 0;

    UI.show(null);
    UI.hud(true);
    UI.setMode(S.runMode);
    UI.setScore(0);
    UI.setHp(S.stats.hp, S.stats.maxHp);
    UI.setLoadout({});
    UI.setXp(0);
    UI.setCombo(0, 1);
    UI.setBoss(null);
    S.mode = 'playing';
    if (qaWave > 1) {
      if (qaPower > 0) applyQAPower(qaPower);
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave(qaWave);
      return;
    }
    startWave(1);
  }

  function continueEndless() {
    if (S.mode !== 'over') return;
    S.runMode = 'endless';
    UI.setMode(S.runMode);
    UI.show(null);
    UI.hud(true);
    S.beginT = 1.15;               // a shorter wash — the sheet is already known
    S.mode = 'playing';
    startWave(S.stats.wave + 1);
  }

  function abandon() {
    CUT.cancel();
    S.mode = 'title';
    S.bullets = []; S.ebullets = []; S.enemies = []; S.markers = [];
    S.particles = []; S.popups = []; S.rings = []; S.stainQueue = []; S.queue = [];
    S.puddles = []; S.spirits = []; S.stamps = [];
    S.motes = []; S.pickups = []; S.arcs = []; S.vortices = []; S.bolts = [];
    UI.hud(false);
    UI.show('title');
    UI.setBest(getBest());
    UI.setRunNo(getRuns() + 1);
    initAttract();
  }

  function deploy() {
    if (S.mode !== 'upgrade' || S.selected == null) return;
    const kind = S.upKind;
    const u = S.choices[S.selected];
    u.apply(S.stats);
    if (!u.patch) S.stats.levels[u.id] = (S.stats.levels[u.id] || 0) + 1;
    UI.setHp(S.stats.hp, S.stats.maxHp);
    UI.setLoadout(S.stats.levels);
    SFX.deploy();
    /* the chain: more ink rose while this choice hung in the air */
    if (S.pendingLevels > 0) { S.mode = 'playing'; openUpgrade('level'); return; }
    if (S.pendingChests > 0) { S.mode = 'playing'; openUpgrade('chest'); return; }
    S.mode = 'playing';
    UI.show(null);
    const nxt = areaStateFor(S.stats.wave + 1);
    if (kind === 'wave' && nxt.waveInArea === 1 && !S.reduced) {
      /* the sheet turns on film — the new scroll announces itself */
      startWave(S.stats.wave + 1, { quiet: true });
      S.mode = 'cutscene';
      UI.hud(false);
      CUT.start('scroll', {
        area: nxt.area, cycle: nxt.cycle,
        deep: S.runMode === 'endless' && nxt.cycle >= AREAS.length,
      });
      return;
    }
    startWave(S.stats.wave + 1);
    /* 'level' and 'chest' resume the wave where it stood */
  }

  function pickAt(i) {
    if (S.mode !== 'upgrade') return;
    const u = S.choices[i];
    if (!u) return;
    if (S.selected === i) { deploy(); return; }
    S.selected = i;
    UI.markSelected(i);
    const nxt = areaStateFor(S.stats.wave + 1);
    UI.setDeploy(true, S.upKind === 'wave' && nxt.waveInArea === 1 ? nxt.area : null, nxt.waveInArea, nxt.cycle, S.upKind);
    SFX.pick();
  }

  function die() {
    S.mode = 'dying';
    S.dyingT = 1.05;
    S.shake = S.reduced ? 0 : 13;
    burst(S.player.x, S.player.y, 16, true);
    /* the brush spills everything it has left */
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 70;
      S.stainQueue.push({
        x: S.player.x + Math.cos(a) * d,
        y: S.player.y + Math.sin(a) * d,
        r: 9 + Math.random() * 22, alpha: 0.6,
      });
    }
    SFX.over();
  }

  function showOver(victory) {
    const st = S.stats;
    const cleared = Math.max(0, st.wave - 1);
    let rank = 'D';
    for (const [min, r] of CFG.ranks) { if (cleared >= min) { rank = r; break; } }
    const best = getBest();
    const nb = st.score > (best ? best.score : 0);
    if (nb) store.set('om_best_v1', { score: st.score, wave: cleared });
    if (victory) SFX.victory();
    UI.showOver({
      run: getRuns(), waves: cleared, kills: st.kills,
      time: st.time, score: st.score, rank, newBest: nb,
      mode: S.runMode, victory: !!victory,
    });
    UI.hud(false);
    UI.show('over');
    S.mode = 'over';
  }

  function takeHit() {
    const st = S.stats;
    /* the paper ward drinks the blow */
    if (st.ward && st.wardCd <= 0) {
      st.wardCd = CFG.ward.cd;
      S.invulnT = Math.max(S.invulnT, 0.7);
      burst(S.player.x, S.player.y, 12, false);
      S.rings.push({ x: S.player.x, y: S.player.y, max: 64, life: 0.32, maxLife: 0.32 });
      S.shake = Math.max(S.shake, 4);
      SFX.ward();
      return;
    }
    st.hp--;
    S.invulnT = CFG.player.invuln;
    if (!S.reduced) S.shake = 8;
    for (let i = 0; i < 3; i++) {
      S.stainQueue.push({
        x: S.player.x + (Math.random() - 0.5) * 26,
        y: S.player.y + (Math.random() - 0.5) * 26,
        r: 4 + Math.random() * 7, alpha: 0.42,
      });
    }
    UI.flash();
    UI.setHp(st.hp, st.maxHp);
    SFX.hurt();
    if (st.shock) {
      S.rings.push({ x: S.player.x, y: S.player.y, max: CFG.shockwave.radius, life: 0.45, maxLife: 0.45 });
      for (const e of S.enemies) {
        const dx = e.x - S.player.x, dy = e.y - S.player.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < CFG.shockwave.radius) {
          const k = CFG.shockwave.knock * (1 - d / CFG.shockwave.radius + 0.3);
          e.kbx += (dx / d) * k;
          e.kby += (dy / d) * k;
          e.stun = Math.max(e.stun, 0.5);
        }
      }
    }
    if (st.hp <= 0) die();
  }

  /* ---------------- weapons: the new strokes ---------------- */
  function fireFan() {
    const p = S.player, st = S.stats;
    const n = CFG.fan.count(st.fan);
    const spread = CFG.fan.spread;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const a = p.aim + off;
      S.bullets.push({
        x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13,
        vx: Math.cos(a) * CFG.fan.speed, vy: Math.sin(a) * CFG.fan.speed,
        ang: a, dmg: CFG.fan.dmg, hits: 2, age: 0, life: CFG.fan.life,
        kind: 'blade', spin: (i % 2 ? 1 : -1) * rand(9, 14),
      });
    }
    SFX.fan();
  }

  function dropTrail() {
    const st = S.stats;
    S.puddles.push({
      x: S.player.x + rand(-4, 4), y: S.player.y + rand(-4, 4),
      r: CFG.trail.radius(st.trailW), life: CFG.trail.life, max: CFG.trail.life,
      tickT: 0.1, seed: (Math.random() * 1e9) | 0,
    });
    if (S.puddles.length > 26) S.puddles.shift();
  }

  function fireSpirits() {
    const st = S.stats;
    for (let i = 0; i < CFG.spirit.count(st.spirit); i++) {
      const a = rand(0, TAU);
      S.spirits.push({
        x: S.player.x + Math.cos(a) * 12, y: S.player.y + Math.sin(a) * 12,
        ang: a, speed: CFG.spirit.speed * rand(0.9, 1.1),
        age: 0, life: CFG.spirit.life, seed: (Math.random() * 1e9) | 0,
      });
    }
    SFX.spirit();
  }

  function fireHanko() {
    const st = S.stats;
    const tgt = nearestEnemy(S.player.x, S.player.y, 720);
    if (!tgt) { S.hankoT = 0.8; return; }
    const rad = CFG.hanko.radius(st.hanko);
    const dmg = CFG.hanko.dmg(st.hanko);
    S.stamps.push({ x: tgt.x, y: tgt.y, r: rad, life: 0.5, max: 0.5, seed: (Math.random() * 1e9) | 0 });
    S.rings.push({ x: tgt.x, y: tgt.y, max: rad, life: 0.4, maxLife: 0.4, red: true });
    S.stainQueue.push({ x: tgt.x, y: tgt.y, r: rad * 0.34, alpha: 0.34, red: true });
    S.shake = Math.max(S.shake, 6);
    for (let k = S.enemies.length - 1; k >= 0; k--) {
      const e = S.enemies[k];
      const dx = e.x - tgt.x, dy = e.y - tgt.y;
      if (dx * dx + dy * dy <= rad * rad) {
        e.hp -= dmg;
        e.hitFlash = 0.09;
        e.stun = Math.max(e.stun, CFG.hanko.stun);
        e.slowT = Math.max(e.slowT, 0.8);
        if (e.hp <= 0) { S.enemies.splice(k, 1); killEnemy(e); }
      }
    }
    SFX.hanko();
  }

  /* sumi arc: a live stroke that leaps from beast to beast */
  function fireArc() {
    const st = S.stats;
    const first = nearestEnemy(S.player.x, S.player.y, 560);
    if (!first) { S.arcT = 0.5; return; }
    const jumps = CFG.arc.jumps(st.arc);
    const dmg = CFG.arc.dmg(st.arc);
    let from = { x: S.player.x, y: S.player.y };
    let cur = first;
    const hitSet = new Set();
    const pts = [{ x: from.x, y: from.y }];
    for (let j = 0; j < jumps; j++) {
      pts.push({ x: cur.x, y: cur.y });
      hitSet.add(cur);
      const idx = S.enemies.indexOf(cur);
      if (idx >= 0) {
        const dead = damageEnemy(cur, idx, dmg, false, 0);
        if (dead) { /* killEnemy already ran; keep the point for the stroke */ }
      }
      /* find the next link */
      let next = null, nd = CFG.arc.range * CFG.arc.range;
      for (const e of S.enemies) {
        if (hitSet.has(e)) continue;
        const dx = e.x - cur.x, dy = e.y - cur.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nd) { nd = d2; next = e; }
      }
      if (!next) break;
      cur = next;
    }
    S.arcs.push({ pts, life: 0.16, max: 0.16, seed: (Math.random() * 1e9) | 0 });
    SFX.arc();
  }

  /* returning stroke: a wide brushstroke that flies out and recalls */
  function fireBoomer() {
    const st = S.stats;
    const tgt = nearestEnemy(S.player.x, S.player.y, 760);
    const a = tgt ? Math.atan2(tgt.y - S.player.y, tgt.x - S.player.x) : S.player.aim;
    const p = S.player;
    S.bullets.push({
      x: p.x, y: p.y,
      vx: Math.cos(a) * CFG.boomer.speed, vy: Math.sin(a) * CFG.boomer.speed,
      ang: a, dmg: CFG.boomer.dmg(st.boomer), hits: 99, age: 0, life: CFG.boomer.life,
      kind: 'boomer', phase: 'out', dist: 0, maxDist: CFG.boomer.dist(st.boomer),
      ox: p.x, oy: p.y,
    });
    SFX.boomer();
  }

  /* ink vortex: a whirlpool that drowns what it drags */
  function fireVortex() {
    const st = S.stats;
    /* open on the densest knot of beasts near the brush */
    let best = null, bestN = -1;
    for (const e of S.enemies) {
      if (Math.hypot(e.x - S.player.x, e.y - S.player.y) > 620) continue;
      let n = 0;
      for (const o of S.enemies) {
        const dx = o.x - e.x, dy = o.y - e.y;
        if (dx * dx + dy * dy < 130 * 130) n++;
      }
      if (n > bestN) { bestN = n; best = e; }
    }
    if (!best) { S.vortexT = 1.0; return; }
    S.vortices.push({
      x: best.x, y: best.y,
      r: CFG.vortex.radius(st.vortex), dur: CFG.vortex.dur(st.vortex),
      max: CFG.vortex.dur(st.vortex), tickT: 0.15, spin: rand(0, 6.28),
      seed: (Math.random() * 1e9) | 0,
    });
    S.shake = Math.max(S.shake, 4);
    SFX.vortex();
  }

  /* ---------------- updates ---------------- */
  function updatePlayer(dt) {
    const p = S.player, st = S.stats;
    let ix = S.inputVec.x, iy = S.inputVec.y;
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    const sp = CFG.player.speed * st.moveMult * (S.adrenT > 0 ? CFG.adrenaline.mult : 1);
    /* the brush glides: velocity eases toward the hand's intent,
       quick to take up, quicker to let go — never a hard stop */
    const rate = m > 0.01 ? 13.5 : 17.5;
    const k = 1 - Math.exp(-rate * dt);
    p.vx += (ix * sp - p.vx) * k;
    p.vy += (iy * sp - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    /* the sheet is endless — nothing clamps the brush */

    /* the storm eye drags everything toward its center */
    for (const e of S.enemies) {
      if (e.type === 'b_tempest') {
        const dx = e.x - p.x, dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 52 * dt;
        p.y += (dy / d) * 52 * dt;
      }
    }

    /* the camera drifts after the brush, leaning into the stride */
    const lk = 1 - Math.exp(-3.4 * dt);
    S.look.x += (p.vx * 0.13 - S.look.x) * lk;
    S.look.y += (p.vy * 0.13 - S.look.y) * lk;
    const ck = 1 - Math.exp(-7.5 * dt);
    S.cam.x += (p.x + S.look.x - S.cam.x) * ck;
    S.cam.y += (p.y + S.look.y - S.cam.y) * ck;

    if (S.adrenT > 0) S.adrenT -= dt;
    if (S.invulnT > 0) S.invulnT -= dt;
    if (st.wardCd > 0) st.wardCd -= dt;
    if (p.recoil > 0) p.recoil -= dt * 14;

    /* black tide: the ink breathes outward on its own rhythm */
    if (st.nova > 0) {
      if (S.novaT <= 0) S.novaT = CFG.nova.period(st.nova);
      S.novaT -= dt;
      if (S.novaT <= 0) fireNova();
    }

    /* folded fan: a spray of paper blades */
    if (st.fan > 0) {
      S.fanT -= dt;
      if (S.fanT <= 0) { S.fanT = CFG.fan.period(st.fan); if (nearestEnemy()) fireFan(); }
    }

    /* ink trail: smears that bite */
    if (st.trailW > 0) {
      S.trailT -= dt;
      if (S.trailT <= 0 && m > 0.25) { S.trailT = CFG.trail.gap(st.trailW); dropTrail(); }
    }

    /* spirit scribes: lesser brushes that hunt alone */
    if (st.spirit > 0) {
      S.spiritT -= dt;
      if (S.spiritT <= 0) { S.spiritT = CFG.spirit.period(st.spirit); if (nearestEnemy()) fireSpirits(); }
    }

    /* crimson hanko: the great seal falls */
    if (st.hanko > 0) {
      S.hankoT -= dt;
      if (S.hankoT <= 0) fireHanko();
    }

    /* sumi arc: the live stroke leaps */
    if (st.arc > 0) {
      S.arcT -= dt;
      if (S.arcT <= 0) { S.arcT = CFG.arc.period(st.arc); if (nearestEnemy(S.player.x, S.player.y, 560)) fireArc(); }
    }

    /* returning stroke: out and back again */
    if (st.boomer > 0) {
      S.boomerT -= dt;
      if (S.boomerT <= 0) { S.boomerT = CFG.boomer.period(st.boomer); fireBoomer(); }
    }

    /* ink vortex: the whirlpool opens */
    if (st.vortex > 0) {
      S.vortexT -= dt;
      if (S.vortexT <= 0) { S.vortexT = CFG.vortex.period(st.vortex); fireVortex(); }
    }

    /* paper mends: the sheet heals itself */
    if (st.mends > 0) {
      st.mendsT -= dt;
      if (st.mendsT <= 0) {
        st.mendsT = CFG.mends.period(st.mends);
        if (st.hp < st.maxHp) {
          st.hp++;
          UI.setHp(st.hp, st.maxHp);
          S.popups.push({ x: p.x, y: p.y - 18, txt: '+1', life: 0.8, max: 0.8 });
          S.rings.push({ x: p.x, y: p.y, max: 40, life: 0.4, maxLife: 0.4 });
          SFX.heal();
        }
      }
    }

    /* ink orbit: droplets grind what they graze */
    if (st.orb > 0) {
      const orbR = CFG.orbit.radius(st.orb);
      const base = G_time();
      for (let i = 0; i < st.orb; i++) {
        const a = base * CFG.orbit.speed + (i / st.orb) * TAU;
        const ox = p.x + Math.cos(a) * orbR, oy = p.y + Math.sin(a) * orbR;
        for (let kk = S.enemies.length - 1; kk >= 0; kk--) {
          const e = S.enemies[kk];
          if (e.orbCd > 0) continue;
          const dx = e.x - ox, dy = e.y - oy;
          const rr = e.r + 5.5;
          if (dx * dx + dy * dy <= rr * rr) {
            e.hp -= 1;
            e.orbCd = CFG.orbit.dmgCd;
            e.hitFlash = 0.08;
            const d = Math.hypot(dx, dy) || 1;
            e.kbx += (dx / d) * 170; e.kby += (dy / d) * 170;
            SFX.hit();
            if (e.hp <= 0) { S.enemies.splice(kk, 1); killEnemy(e); }
            break;
          }
        }
      }
    }

    p.fireT -= dt;
    if (p.fireT <= 0) {
      const tgt = nearestEnemy();
      if (tgt) {
        p.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        fireVolley();
        p.fireT = CFG.player.fireCd * st.fireCdMult;
      } else {
        p.fireT = 0.08;
      }
    }
  }

  const TAU = Math.PI * 2;
  let clockT = 0; /* driven from update(); used for orbital phase */
  function G_time() { return clockT; }
  function fireNova() {
    const st = S.stats;
    const rad = CFG.nova.radius(st.nova);
    S.rings.push({ x: S.player.x, y: S.player.y, max: rad, life: 0.5, maxLife: 0.5 });
    for (let k = S.enemies.length - 1; k >= 0; k--) {
      const e = S.enemies[k];
      const dx = e.x - S.player.x, dy = e.y - S.player.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < rad) {
        const k2 = CFG.nova.knock * (1 - d / rad + 0.3);
        e.kbx += (dx / d) * k2;
        e.kby += (dy / d) * k2;
        e.stun = Math.max(e.stun, CFG.nova.stun);
        e.hp -= 1;
        e.hitFlash = 0.08;
        if (e.hp <= 0) { S.enemies.splice(k, 1); killEnemy(e); }
      }
    }
    S.shake = Math.max(S.shake, 3);
    SFX.nova();
  }

  function fireVolley() {
    const p = S.player, st = S.stats;
    const n = st.shots;
    const spread = CFG.player.spread * (n - 1);
    const spd = CFG.player.bulletSpeed * st.bulletSpeedMult;
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      const a = p.aim + off;
      S.bullets.push({
        x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        ang: a, dmg: st.dmg, hits: 1 + st.pierce, age: 0, life: CFG.player.bulletLife,
        kind: 'drop', brush: S.brush, seed: 100000 + ((Math.random() * 899999) | 0),
      });
    }
    /* echo stroke: the mirrored volley answers from behind */
    if (st.echo > 0) {
      const en = st.echo;
      const espread = 0.24 * (en - 1);
      for (let i = 0; i < en; i++) {
        const off = en === 1 ? 0 : -espread / 2 + (espread * i) / (en - 1);
        const a = p.aim + Math.PI + off;
        S.bullets.push({
          x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13,
          vx: Math.cos(a) * spd * 0.92, vy: Math.sin(a) * spd * 0.92,
          ang: a, dmg: st.dmg, hits: 1 + st.pierce, age: 0, life: CFG.player.bulletLife,
          kind: 'drop', brush: S.brush, seed: 100000 + ((Math.random() * 899999) | 0),
        });
      }
    }
    p.recoil = 1;
    SFX.shoot();
  }

  function moveBullets(dt) {
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      if (b.kind === 'boomer') {
        /* the returning stroke: out, then home to the brush */
        const spd = CFG.boomer.speed * (b.phase === 'back' ? 1.12 : 1);
        if (b.phase === 'out') {
          b.dist += spd * dt;
          if (b.dist >= b.maxDist) b.phase = 'back';
        } else {
          const dx = S.player.x - b.x, dy = S.player.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          b.vx = (dx / d) * spd; b.vy = (dy / d) * spd;
          b.ang = Math.atan2(dy, dx);
          if (d < 20) {
            S.stainQueue.push({ x: b.x, y: b.y, r: 4, alpha: 0.3 });
            S.bullets.splice(i, 1);
            continue;
          }
        }
        b.age += dt;
        if (b.age > b.life) { S.bullets.splice(i, 1); continue; }
        b.x += b.vx * dt; b.y += b.vy * dt;
        continue;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt;
      if (b.age > b.life) {
        S.stainQueue.push({ x: b.x, y: b.y, r: 2.6, alpha: 0.3 });
        S.bullets.splice(i, 1);
      }
    }
  }

  function damageEnemy(e, idx, dmg, knock, ang, proj) {
    const st = S.stats;
    /* the koi swims beneath the sheet — strokes pass over it */
    if (e.diving) return false;
    /* the gate's shield drinks frontal strikes */
    if (e.type === 'gate' && proj) {
      let diff = ang - e.ang;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      if (Math.abs(diff) < 1.15) {
        S.popups.push({ x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6), txt: '掠', life: 0.4, max: 0.4 });
        SFX.ping();
        return false;
      }
    }
    const critCh = CFG.crit.chance(st.crit);
    let d = dmg;
    if (critCh > 0 && Math.random() < critCh) {
      d *= 2;
      S.popups.push({ x: e.x, y: e.y - e.r - 6, txt: '×2', life: 0.55, max: 0.55, red: true });
    }
    if (st.slow > 0) e.slowT = CFG.slow.dur;
    e.hp -= d;
    e.hitFlash = 0.08;
    if (knock) {
      const boss = ENEMIES[e.type].boss;
      const kf = boss ? 0.06 : e.elite ? 0.15 : (e.type === 'slab' || e.type === 'oni' || e.type === 'golem' ? 0.12 : 0.55);
      e.kbx += Math.cos(ang) * 240 * kf;
      e.kby += Math.sin(ang) * 240 * kf;
    }
    if (e.hp <= 0) {
      S.enemies.splice(idx, 1);
      killEnemy(e);
      return true;
    }
    return false;
  }

  function updateBullets(dt) {
    moveBullets(dt);
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      const br = b.kind === 'boomer' ? 13 : b.kind === 'blade' ? 4 : 3;
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j];
        const dx = e.x - b.x, dy = e.y - b.y;
        const rr = e.r + br;
        if (dx * dx + dy * dy <= rr * rr) {
          const ang = Math.atan2(b.vy, b.vx);
          SFX.hit();
          b.hits--;
          const dead = damageEnemy(e, j, b.dmg, true, ang, true);
          if (b.hits <= 0) {
            if (b.kind === 'blade') burst(b.x, b.y, 3, false);
            S.bullets.splice(i, 1);
          }
          if (dead) j--;
          if (b.hits <= 0) break;
        }
      }
    }
  }

  /* ---------------- ink motes, pickups, vortex fx ---------------- */
  function updateMotes(dt) {
    const st = S.stats;
    const p = S.player;
    const pr = CFG.magnet.radius(st.magnet);
    const pulse = S.magnetT > 0 || S.vacuum;
    for (let i = S.motes.length - 1; i >= 0; i--) {
      const mt = S.motes[i];
      mt.age += dt;
      if (mt.age > CFG.xp.moteLife) { S.motes.splice(i, 1); continue; }
      const dx = p.x - mt.x, dy = p.y - mt.y;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 1;
      if (pulse) {
        mt.pull = true;
      } else if (!mt.pull && d2 < pr * pr) {
        mt.pull = true;
      }
      if (mt.pull) {
        const sp = Math.min(560, 170 + (1 - Math.min(1, d / 420)) * 430);
        mt.vx = (dx / d) * sp; mt.vy = (dy / d) * sp;
      } else {
        const damp = Math.exp(-3.2 * dt);
        mt.vx *= damp; mt.vy *= damp;
      }
      mt.x += mt.vx * dt; mt.y += mt.vy * dt;
      if (d2 < (p.r + 7) * (p.r + 7)) {
        S.motes.splice(i, 1);
        collectXP(mt.val);
        SFX.pickup();
      }
    }
  }

  function updatePickups(dt) {
    const st = S.stats;
    const p = S.player;
    for (let i = S.pickups.length - 1; i >= 0; i--) {
      const pk = S.pickups[i];
      pk.age += dt;
      const dx = p.x - pk.x, dy = p.y - pk.y;
      const d = Math.hypot(dx, dy) || 1;
      /* talismans drift toward an approaching brush */
      if (d < 130 && d > 20) {
        pk.x += (dx / d) * 120 * dt;
        pk.y += (dy / d) * 120 * dt;
      }
      if (d < p.r + 16) {
        S.pickups.splice(i, 1);
        if (pk.kind === 'pot') {
          if (st.hp < st.maxHp) {
            st.hp++;
            UI.setHp(st.hp, st.maxHp);
            S.popups.push({ x: p.x, y: p.y - 20, txt: '+1', life: 0.9, max: 0.9 });
          } else {
            collectXP(12);
          }
          S.rings.push({ x: p.x, y: p.y, max: 46, life: 0.4, maxLife: 0.4 });
          SFX.heal();
        } else if (pk.kind === 'magnet') {
          S.magnetT = CFG.xp.magnetPulse;
          S.popups.push({ x: p.x, y: p.y - 20, txt: '墨 — GATHERED', life: 1.1, max: 1.1, red: true });
          S.rings.push({ x: p.x, y: p.y, max: 120, life: 0.5, maxLife: 0.5 });
          SFX.magnet();
        } else if (pk.kind === 'bomb') {
          S.shake = Math.max(S.shake, 11);
          S.rings.push({ x: p.x, y: p.y, max: Math.max(S.W, S.H) * 0.55, life: 0.6, maxLife: 0.6, red: true });
          for (let j = S.enemies.length - 1; j >= 0; j--) {
            const e = S.enemies[j];
            e.hp -= 7;
            e.hitFlash = 0.1;
            e.stun = Math.max(e.stun, 0.5);
            const a = Math.atan2(e.y - p.y, e.x - p.x);
            e.kbx += Math.cos(a) * 320; e.kby += Math.sin(a) * 320;
            if (e.hp <= 0) { S.enemies.splice(j, 1); killEnemy(e); }
          }
          SFX.bomb();
        } else if (pk.kind === 'chest') {
          S.pendingChests++;
          S.rings.push({ x: p.x, y: p.y, max: 90, life: 0.5, maxLife: 0.5, red: true });
          SFX.chest();
          if (S.mode === 'playing') openUpgrade('chest');
        }
      }
    }
  }

  function updateArcs(dt) {
    for (let i = S.arcs.length - 1; i >= 0; i--) {
      S.arcs[i].life -= dt;
      if (S.arcs[i].life <= 0) S.arcs.splice(i, 1);
    }
  }

  function updateVortices(dt) {
    const st = S.stats;
    for (let i = S.vortices.length - 1; i >= 0; i--) {
      const vz = S.vortices[i];
      vz.dur -= dt;
      vz.spin += dt * 4.4;
      if (vz.dur <= 0) {
        S.stainQueue.push({ x: vz.x, y: vz.y, r: vz.r * 0.4, alpha: 0.3 });
        S.vortices.splice(i, 1);
        continue;
      }
      /* the whirlpool drags everything near its mouth */
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j];
        const dx = vz.x - e.x, dy = vz.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < vz.r * 1.7) {
          const pullF = CFG.vortex.pull * (1 - d / (vz.r * 1.7)) * (ENEMIES[e.type].boss ? 1.2 : 5);
          e.kbx += (dx / d) * pullF * dt;
          e.kby += (dy / d) * pullF * dt;
        }
      }
      vz.tickT -= dt;
      if (vz.tickT <= 0) {
        vz.tickT = CFG.vortex.tick;
        let bit = false;
        for (let j = S.enemies.length - 1; j >= 0; j--) {
          const e = S.enemies[j];
          const dx = e.x - vz.x, dy = e.y - vz.y;
          if (dx * dx + dy * dy < vz.r * vz.r) {
            e.hp -= CFG.vortex.dmg;
            e.hitFlash = 0.07;
            e.slowT = Math.max(e.slowT, 0.4);
            bit = true;
            if (e.hp <= 0) { S.enemies.splice(j, 1); killEnemy(e); }
          }
        }
        if (bit && Math.random() < 0.6) SFX.hit();
      }
    }
  }

  function updateBolts(dt) {
    const p = S.player;
    for (let i = S.bolts.length - 1; i >= 0; i--) {
      const bo = S.bolts[i];
      if (!bo.struck) {
        bo.t -= dt;
        if (bo.t <= 0) {
          bo.struck = true;
          bo.life = 0.16;
          S.shake = Math.max(S.shake, 7);
          S.rings.push({ x: bo.x, y: bo.y, max: bo.r * 1.5, life: 0.3, maxLife: 0.3 });
          S.stainQueue.push({ x: bo.x, y: bo.y, r: bo.r * 0.4, alpha: 0.4 });
          const dx = p.x - bo.x, dy = p.y - bo.y;
          if (dx * dx + dy * dy < bo.r * bo.r) takeHit();
          SFX.thunder();
        }
      } else {
        bo.life -= dt;
        if (bo.life <= 0) S.bolts.splice(i, 1);
      }
    }
  }

  function updatePuddles(dt) {
    for (let i = S.puddles.length - 1; i >= 0; i--) {
      const pd = S.puddles[i];
      pd.life -= dt;
      pd.tickT -= dt;
      if (pd.life <= 0) {
        S.stainQueue.push({ x: pd.x, y: pd.y, r: pd.r * 0.5, alpha: 0.16 });
        S.puddles.splice(i, 1);
        continue;
      }
      if (pd.tickT <= 0) {
        pd.tickT = CFG.trail.tick;
        let bit = false;
        for (let j = S.enemies.length - 1; j >= 0; j--) {
          const e = S.enemies[j];
          const dx = e.x - pd.x, dy = e.y - pd.y;
          const rr = e.r + pd.r * 0.85;
          if (dx * dx + dy * dy <= rr * rr) {
            e.slowT = Math.max(e.slowT, 0.55);
            e.hp -= CFG.trail.dmg;
            e.hitFlash = 0.07;
            bit = true;
            if (e.hp <= 0) { S.enemies.splice(j, 1); killEnemy(e); }
          }
        }
        if (bit && Math.random() < 0.5) SFX.hit();
      }
    }
  }

  function updateSpirits(dt) {
    for (let i = S.spirits.length - 1; i >= 0; i--) {
      const sp = S.spirits[i];
      sp.age += dt;
      if (sp.age > sp.life) {
        S.stainQueue.push({ x: sp.x, y: sp.y, r: 2.2, alpha: 0.2 });
        S.spirits.splice(i, 1);
        continue;
      }
      /* home toward the nearest beast */
      const tgt = nearestEnemy(sp.x, sp.y, 640);
      if (tgt) {
        const want = Math.atan2(tgt.y - sp.y, tgt.x - sp.x);
        let diff = want - sp.ang;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const turn = CFG.spirit.turn * dt;
        sp.ang += clamp(diff, -turn, turn);
      }
      sp.x += Math.cos(sp.ang) * sp.speed * dt;
      sp.y += Math.sin(sp.ang) * sp.speed * dt;
      if (sp.age < 0.12) continue; /* grace period after leaving the brush */
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j];
        const dx = e.x - sp.x, dy = e.y - sp.y;
        const rr = e.r + 4;
        if (dx * dx + dy * dy <= rr * rr) {
          damageEnemy(e, j, CFG.spirit.dmg, true, sp.ang, true);
          burst(sp.x, sp.y, 4, false);
          S.spirits.splice(i, 1);
          break;
        }
      }
    }
  }

  function updateEnemies(dt) {
    const p = S.player;
    /* wardens are few — gather them once instead of scanning per beast */
    let wardens = null;
    for (const w of S.enemies) if (w.type === 'warden') (wardens || (wardens = [])).push(w);
    for (const e of S.enemies) {
      e.t += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.orbCd > 0) e.orbCd -= dt;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.stun > 0) {
        e.stun -= dt;
      } else {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        /* soaked paper drags; the warden's herald-cry quickens the pack */
        let sm = e.slowT > 0 ? CFG.slow.mult : 1;
        if (wardens && e.type !== 'warden') {
          for (const w of wardens) {
            const wx = e.x - w.x, wy = e.y - w.y;
            if (wx * wx + wy * wy < 200 * 200) { sm *= 1.3; break; }
          }
        }
        let vx = 0, vy = 0;
        switch (e.type) {
          case 'pulse':
          case 'pulseling':
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          case 'slab':
          case 'golem':
          case 'titan':
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            /* the mother sheds her brood */
            if (e.type === 'titan') {
              e.spawnT -= dt;
              if (e.spawnT <= 0 && S.enemies.length < CFG.wave.concurrentCap(S.stats.wave, S.areaIdx)) {
                e.spawnT = 4.2;
                for (let i = 0; i < 2; i++) {
                  const a = rand(0, 6.28);
                  const c = spawnEnemy('pulseling', e.x + Math.cos(a) * (e.r + 8), e.y + Math.sin(a) * (e.r + 8));
                  c.kbx = Math.cos(a) * 200; c.kby = Math.sin(a) * 200;
                }
                S.rings.push({ x: e.x, y: e.y, max: e.r * 2.1, life: 0.4, maxLife: 0.4 });
              }
            }
            break;
          case 'dart':
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 300 && e.stateT > 1.6) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.42) { e.state = 'dash'; e.stateT = 0; }
            } else if (e.state === 'dash') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * 460; vy = Math.sin(e.ang) * 460;
              if (e.stateT > 0.42) { e.state = 'rest'; e.stateT = 0; }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 0.7) { e.state = 'cruise'; e.stateT = 1.0; }
            }
            break;
          case 'spit': /* keeps its distance and lobs ink */
            if (e.state === 'cruise') {
              e.ang = Math.atan2(uy, ux);
              if (d > 270) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
              else { /* strafe sideways */
                const sdir = Math.sin(e.seed + e.t * 0.7) > 0 ? 1 : -1;
                vx = -uy * e.speed * 0.85 * sm * sdir;
                vy = ux * e.speed * 0.85 * sm * sdir;
              }
              e.stateT += dt;
              if (d < 330 && e.stateT > 1.5) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.5) {
                e.state = 'spit'; e.stateT = 0;
                const ga = Math.atan2(p.y - e.y, p.x - e.x);
                S.ebullets.push({
                  kind: 'glob',
                  x: e.x + Math.cos(ga) * (e.r + 4), y: e.y + Math.sin(ga) * (e.r + 4),
                  vx: Math.cos(ga) * CFG.glob.speed, vy: Math.sin(ga) * CFG.glob.speed,
                  ang: ga, age: 0, life: CFG.glob.life,
                });
                SFX.glob();
              }
            } else if (e.state === 'spit') {
              e.stateT += dt;
              if (e.stateT > 0.25) { e.state = 'rest'; e.stateT = 0; }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 0.8) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          case 'moth': { /* erratic: fresh heading every few beats */
            e.dirT -= dt;
            if (e.dirT <= 0) {
              e.dirT = rand(0.3, 0.75);
              e.ang = Math.atan2(uy, ux) + rand(-1.15, 1.15);
            }
            const burst = e.speed * (0.65 + 0.55 * Math.abs(Math.sin(e.t * 5 + e.seed)));
            vx = Math.cos(e.ang) * burst * sm;
            vy = Math.sin(e.ang) * burst * sm;
            break;
          }
          case 'shade': /* dissolves, blinks at your back, pounces */
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 320 && e.stateT > 1.3) { e.state = 'dissolve'; e.stateT = 0; }
            } else if (e.state === 'dissolve') {
              e.stateT += dt;
              if (e.stateT > 0.55) {
                /* the blink: a stain is left where it stood */
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.9, alpha: 0.35 });
                const ba = rand(0, 6.28), bd = rand(56, 96);
                e.x = p.x + Math.cos(ba) * bd;
                e.y = p.y + Math.sin(ba) * bd;
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.1, alpha: 0.4 });
                S.rings.push({ x: e.x, y: e.y, max: e.r * 2.2, life: 0.3, maxLife: 0.3 });
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.state = 'pounce'; e.stateT = 0;
                SFX.blink();
              }
            } else if (e.state === 'pounce') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * 300 * sm; vy = Math.sin(e.ang) * 300 * sm;
              if (e.stateT > 0.45) { e.state = 'rest'; e.stateT = 0; }
            } else { /* rest — briefly solid, briefly fair */
              e.stateT += dt;
              if (e.stateT > 0.85) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          case 'wraith': {
            const wob = Math.sin(e.t * 3.4 + e.seed) * 0.85;
            vx = (ux - uy * wob) * e.speed * sm;
            vy = (uy + ux * wob) * e.speed * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'split':
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang += dt * 1.2;
            break;
          case 'kage': { /* circles you like a stain, then cuts straight through */
            if (e.state === 'cruise') {
              /* perch on a ring around the player */
              const ringD = clamp(d, 150, 240);
              const tangent = Math.atan2(uy, ux) + (e.seed > 3.14 ? 1 : -1) * Math.PI / 2;
              const pull = clamp((d - ringD) * 2.2, -60, 60);
              vx = (Math.cos(tangent) * e.speed + ux * pull) * sm;
              vy = (Math.sin(tangent) * e.speed + uy * pull) * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 260 && e.stateT > 1.3 + (e.seed % 0.7)) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.5) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                e.state = 'dash'; e.stateT = 0;
                SFX.blink();
              }
            } else if (e.state === 'dash') {
              e.stateT += dt;
              vx = e.px * 540 * sm; vy = e.py * 540 * sm;
              if (e.stateT > 0.34) { e.state = 'rest'; e.stateT = 0; }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 0.9) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'stilt': { /* keeps far, draws a hair-thin line, then fires a needle */
            if (e.state === 'cruise') {
              e.ang = Math.atan2(uy, ux);
              if (d < 330) { vx = -ux * e.speed * sm; vy = -uy * e.speed * sm; } /* back away */
              else if (d > 440) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
              else { /* glide sideways along its perch */
                const sdir = Math.sin(e.seed * 3 + e.t * 0.5) > 0 ? 1 : -1;
                vx = -uy * e.speed * sm * sdir;
                vy = ux * e.speed * sm * sdir;
              }
              e.stateT += dt;
              if (d < 520 && e.stateT > 1.7) { e.state = 'aim'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'aim') {
              e.ang = Math.atan2(p.y - e.y, p.x - e.x);
              e.stateT += dt;
              if (e.stateT > 0.66) {
                e.state = 'fire'; e.stateT = 0;
                S.ebullets.push({
                  kind: 'needle',
                  x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6),
                  vx: Math.cos(e.ang) * CFG.needle.speed, vy: Math.sin(e.ang) * CFG.needle.speed,
                  ang: e.ang, age: 0, life: CFG.needle.life,
                });
                SFX.needle();
              }
            } else if (e.state === 'fire') {
              e.stateT += dt;
              if (e.stateT > 0.3) { e.state = 'rest'; e.stateT = 0; }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 0.7) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'oni': { /* a heavy charge: windup, then a straight bulldozer run */
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 340 && e.stateT > 1.4) { e.state = 'windup'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'windup') {
              e.stateT += dt;
              if (e.stateT > 0.62) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                e.state = 'charge'; e.stateT = 0;
              }
            } else if (e.state === 'charge') {
              e.stateT += dt;
              vx = e.px * 470; vy = e.py * 470;
              if (e.stateT > 0.6) { e.state = 'skid'; e.stateT = 0; }
            } else if (e.state === 'skid') {
              e.stateT += dt;
              vx = e.px * 120; vy = e.py * 120;
              if (e.stateT > 0.5) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'crane': { /* swoops past in long arcs, never lingers */
            if (e.state === 'cruise' || e.state === 'loop') {
              /* line up the next pass: aim beyond the player */
              e.dirT -= dt;
              if (e.dirT <= 0) {
                e.dirT = 0.4;
                const side = (e.seed + Math.floor(e.t)) % 2 === 0 ? 1 : -1;
                const tx = p.x + -uy * 90 * side;
                const ty = p.y + ux * 90 * side;
                e.ang = Math.atan2(ty - e.y, tx - e.x);
                e.state = 'pass';
              }
              e.stateT += dt;
              vx = Math.cos(e.ang) * e.speed * 0.55;
              vy = Math.sin(e.ang) * e.speed * 0.55;
            } else if (e.state === 'pass') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * e.speed * sm;
              vy = Math.sin(e.ang) * e.speed * sm;
              if (e.stateT > 0.9 && d > 220) { e.state = 'loop'; e.stateT = 0; e.dirT = 0.15; }
            }
            break;
          }
          case 'popper': { /* a fast round bomb of ink — deadly to pop */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          }
          case 'lotus': { /* walks into range, roots, and sprays a fan of ink */
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (d < 310) { e.state = 'root'; e.stateT = 0; }
            } else { /* root */
              e.stateT += dt;
              if (e.stateT > 2.1) {
                e.stateT = 0;
                const base = Math.atan2(uy, ux);
                for (let i = -2; i <= 2; i++) {
                  const a = base + i * 0.22;
                  S.ebullets.push({
                    kind: 'glob',
                    x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
                    vx: Math.cos(a) * 180, vy: Math.sin(a) * 180,
                    ang: a, age: 0, life: CFG.glob.life,
                  });
                }
                SFX.glob();
              }
            }
            break;
          }
          case 'gate': { /* turns slowly — its shield drinks frontal strikes */
            const want = Math.atan2(uy, ux);
            let diff = want - e.ang;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            e.ang += clamp(diff, -0.9 * dt, 0.9 * dt);
            vx = Math.cos(e.ang) * e.speed * sm;
            vy = Math.sin(e.ang) * e.speed * sm;
            break;
          }
          case 'warden': { /* the herald — keeps its distance and quickens the pack */
            e.ang = Math.atan2(uy, ux);
            if (d > 270) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
            else if (d < 180) { vx = -ux * e.speed * sm; vy = -uy * e.speed * sm; }
            else {
              const sdir = Math.sin(e.seed + e.t * 0.6) > 0 ? 1 : -1;
              vx = -uy * e.speed * 0.9 * sm * sdir;
              vy = ux * e.speed * 0.9 * sm * sdir;
            }
            break;
          }
          case 'koi': { /* swims in long sine curves, diving beneath the strokes */
            const wob = Math.sin(e.t * 4.2 + e.seed) * 1.1;
            vx = (ux - uy * wob) * e.speed * sm;
            vy = (uy + ux * wob) * e.speed * sm;
            e.ang = Math.atan2(vy, vx);
            e.diveT = (e.diveT == null ? rand(1.4, 2.8) : e.diveT) - dt;
            if (e.diveT <= -0.85) e.diveT = rand(2.2, 3.6);
            e.diving = e.diveT <= 0;
            break;
          }

          /* ================= THE GUARDIANS ================= */
          case 'b_wheel': { /* THE STAIN — swells, then slams a ring of ink */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            if (e.state === 'cruise' && e.stateT > 2.9) { e.state = 'windup'; e.stateT = 0; SFX.wind(); }
            else if (e.state === 'windup' && e.stateT > 0.7) {
              e.state = 'cruise'; e.stateT = rand(0, 0.6);
              const n = 10, off = rand(0, TAU);
              for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU + off;
                S.ebullets.push({
                  kind: 'glob',
                  x: e.x + Math.cos(a) * (e.r + 8), y: e.y + Math.sin(a) * (e.r + 8),
                  vx: Math.cos(a) * CFG.glob.speed * 0.82, vy: Math.sin(a) * CFG.glob.speed * 0.82,
                  ang: a, age: 0, life: CFG.glob.life * 1.35,
                });
              }
              S.rings.push({ x: e.x, y: e.y, max: 210, life: 0.5, maxLife: 0.5, red: true });
              S.shake = Math.max(S.shake, 8);
              SFX.nova();
            }
            break;
          }
          case 'b_mother': { /* THE NIGHT MOTHER — dissolves, blinks, fans needles, sheds shades */
            e.stateT += dt;
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > 3.4) { e.state = 'dissolve'; e.stateT = 0; }
            } else if (e.state === 'dissolve') {
              if (e.stateT > 0.55) {
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.9, alpha: 0.4 });
                const ba = rand(0, TAU), bd = rand(140, 200);
                e.x = p.x + Math.cos(ba) * bd; e.y = p.y + Math.sin(ba) * bd;
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.1, alpha: 0.45 });
                S.rings.push({ x: e.x, y: e.y, max: e.r * 2.4, life: 0.35, maxLife: 0.35 });
                e.state = 'fan'; e.stateT = 0;
                SFX.blink();
              }
            } else if (e.state === 'fan') {
              if (e.stateT > 0.42) {
                const base = Math.atan2(p.y - e.y, p.x - e.x);
                for (let i = -2; i <= 2; i++) {
                  const a = base + i * 0.17;
                  S.ebullets.push({
                    kind: 'needle',
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * CFG.needle.speed * 0.85, vy: Math.sin(a) * CFG.needle.speed * 0.85,
                    ang: a, age: 0, life: CFG.needle.life,
                  });
                }
                SFX.needle();
                e.sheds = (e.sheds || 0) + 1;
                if (e.sheds % 2 === 0 && S.enemies.length < CFG.wave.concurrentCap(S.stats.wave, S.areaIdx) + 8) {
                  for (const s of [-1, 1]) {
                    const c = spawnEnemy('shade', e.x + s * 40, e.y + rand(-30, 30));
                    c.kbx = s * 160; c.kby = rand(-80, 80);
                  }
                  SFX.blink();
                }
                e.state = 'cruise'; e.stateT = 0;
              }
            }
            break;
          }
          case 'b_warlord': { /* THE CINNABAR ONI — bulldozer charges and spread volleys */
            e.stateT += dt;
            const enraged = e.hp < e.maxHp * 0.5;
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > (enraged ? 1.5 : 2.3)) { e.state = 'windup'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'windup') {
              if (e.stateT > 0.6) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                e.state = 'charge'; e.stateT = 0;
              }
            } else if (e.state === 'charge') {
              vx = e.px * (enraged ? 640 : 540); vy = e.py * (enraged ? 640 : 540);
              if (Math.random() < 0.35) S.stainQueue.push({ x: e.x, y: e.y, r: 7, alpha: 0.3, red: true });
              if (e.stateT > 0.72) { e.state = 'skid'; e.stateT = 0; }
            } else if (e.state === 'skid') {
              vx = e.px * 110; vy = e.py * 110;
              if (e.stateT > 0.35) {
                e.state = 'spit'; e.stateT = 0;
                const base = Math.atan2(p.y - e.y, p.x - e.x);
                for (let i = -3; i <= 3; i++) {
                  const a = base + i * 0.15;
                  S.ebullets.push({
                    kind: 'glob',
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * 230, vy: Math.sin(a) * 230,
                    ang: a, age: 0, life: CFG.glob.life,
                  });
                }
                SFX.glob();
                if (enraged && !e.brood) {
                  e.brood = true;
                  const c = spawnEnemy('oni', e.x + rand(-60, 60), e.y + rand(-60, 60));
                  S.rings.push({ x: c.x, y: c.y, max: 60, life: 0.4, maxLife: 0.4, red: true });
                }
              }
            } else { /* spit settle */
              if (e.stateT > 0.35) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'b_tempest': { /* THE STORM EYE — orbits, drags, spirals needles, calls bolts */
            const ringD = 250;
            const tangent = Math.atan2(uy, ux) + (e.seed > 3.14 ? 1 : -1) * Math.PI / 2;
            const pull = clamp((d - ringD) * 2.2, -80, 80);
            vx = (Math.cos(tangent) * e.speed + ux * pull) * sm;
            vy = (Math.sin(tangent) * e.speed + uy * pull) * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            e.spinT = (e.spinT || 0) + dt;
            if (e.spinT > 2.3) {
              e.spinT = 0;
              const base = e.t * 1.9;
              for (let i = 0; i < 4; i++) {
                const a = base + (i / 4) * TAU;
                S.ebullets.push({
                  kind: 'needle',
                  x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                  vx: Math.cos(a) * CFG.needle.speed * 0.78, vy: Math.sin(a) * CFG.needle.speed * 0.78,
                  ang: a, age: 0, life: CFG.needle.life * 1.2,
                });
              }
              SFX.needle();
            }
            e.boltT = (e.boltT || 0) + dt;
            if (e.boltT > 5.2) {
              e.boltT = 0;
              for (let i = 0; i < 3; i++) {
                const ba = rand(0, TAU), bd = rand(20, 150);
                S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.85 + i * 0.3, r: 54, struck: false, life: 0 });
              }
              SFX.wind();
            }
            break;
          }
          case 'b_origin': { /* THE FIRST BRUSH — three phases: volleys, brood, fury */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            const phase = e.hp < e.maxHp * 0.33 ? 2 : e.hp < e.maxHp * 0.66 ? 1 : 0;
            e.vT = (e.vT || 0) + dt;
            if (e.vT > (phase === 2 ? 2.0 : phase === 1 ? 2.6 : 3.2)) {
              e.vT = 0;
              const n = phase === 2 ? 14 : 10;
              const off = rand(0, TAU);
              for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU + off;
                S.ebullets.push({
                  kind: 'drop',
                  x: e.x + Math.cos(a) * (e.r + 8), y: e.y + Math.sin(a) * (e.r + 8),
                  vx: Math.cos(a) * 195, vy: Math.sin(a) * 195,
                  ang: a, age: 0, life: 2.6,
                });
              }
              SFX.glob();
            }
            e.sT = (e.sT || 0) + dt;
            if (e.sT > 7.5) {
              e.sT = 0;
              if (S.enemies.length < CFG.wave.concurrentCap(S.stats.wave, S.areaIdx) + 8) {
                for (const s of [-1, 1]) {
                  const c = spawnEnemy(phase === 2 ? 'oni' : 'slab', e.x + s * 55, e.y + rand(-40, 40));
                  c.kbx = s * 140; c.kby = rand(-70, 70);
                }
                S.rings.push({ x: e.x, y: e.y, max: 120, life: 0.45, maxLife: 0.45, red: true });
                SFX.elite();
              }
            }
            if (phase >= 1 && e.state === 'cruise' && e.stateT > 4.2) {
              e.state = 'windup'; e.stateT = 0; SFX.wind();
            } else if (e.state === 'windup' && e.stateT > 0.55) {
              e.ang = Math.atan2(p.y - e.y, p.x - e.x);
              e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
              e.state = 'charge'; e.stateT = 0;
            } else if (e.state === 'charge') {
              vx = e.px * 520; vy = e.py * 520;
              if (e.stateT > 0.55) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
        }
        /* a wounded Guardian moves like something cornered */
        if (ENEMIES[e.type].boss && e.hp < e.maxHp * 0.35) {
          const ef = 1.14 + 0.08 * (1 - e.hp / (e.maxHp * 0.35));
          vx *= ef; vy *= ef;
        }
        e.x += vx * dt; e.y += vy * dt;
      }
      e.x += e.kbx * dt; e.y += e.kby * dt;
      const decay = Math.exp(-8 * dt);
      e.kbx *= decay; e.kby *= decay;
    }

    /* soft separation so enemies don't stack */
    for (let i = 0; i < S.enemies.length; i++) {
      for (let j = i + 1; j < S.enemies.length; j++) {
        const a = S.enemies[i], b = S.enemies[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = (a.r + b.r) * 0.8;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.35;
          a.x -= dx * push; a.y -= dy * push;
          b.x += dx * push; b.y += dy * push;
        }
      }
    }

    /* contact damage */
    if (S.invulnT <= 0) {
      for (const e of S.enemies) {
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.r + p.r - 2;
        if (dx * dx + dy * dy < rr * rr) { takeHit(); break; }
      }
    }
  }

  /* the spitter's ink and the sniper's needles, flying back at you */
  function updateEbullets(dt) {
    const p = S.player;
    for (let i = S.ebullets.length - 1; i >= 0; i--) {
      const b = S.ebullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt;
      if (b.age > b.life) {
        S.stainQueue.push({ x: b.x, y: b.y, r: 2.4, alpha: 0.22 });
        S.ebullets.splice(i, 1);
        continue;
      }
      if (S.invulnT <= 0) {
        const dx = b.x - p.x, dy = b.y - p.y;
        const br = (b.kind === 'needle' ? CFG.needle.r : CFG.glob.r);
        const rr = p.r - 1 + br;
        if (dx * dx + dy * dy <= rr * rr) {
          S.ebullets.splice(i, 1);
          S.stainQueue.push({ x: b.x, y: b.y, r: 3.4, alpha: 0.4 });
          takeHit();
        }
      }
    }
  }

  function updateMarkers(dt) {
    for (let i = S.markers.length - 1; i >= 0; i--) {
      const mk = S.markers[i];
      mk.t -= dt;
      if (mk.t <= 0) {
        S.markers.splice(i, 1);
        S.stainQueue.push({ x: mk.x, y: mk.y, r: ENEMIES[mk.type].r * (mk.boss ? 2.4 : mk.elite ? 2 : 1.1), alpha: mk.boss || mk.elite ? 0.55 : 0.42, red: !!mk.elite });
        spawnEnemy(mk.type, mk.x, mk.y, { elite: !!mk.elite && !mk.boss });
        if (mk.boss) { S.shake = Math.max(S.shake, 10); SFX.elite(); }
        else if (mk.elite) { S.shake = Math.max(S.shake, 7); SFX.elite(); }
      }
    }
  }

  function updateSpawning(dt) {
    if (!S.waveActive || !S.queue.length) return;
    S.spawnTimer -= dt;
    const cap = CFG.wave.concurrentCap(S.stats.wave, S.areaIdx);
    const alive = S.enemies.length + S.markers.length;
    if (S.spawnTimer <= 0 && S.markers.length < 6 && alive < cap) {
      const group = Math.min(CFG.wave.groupSize(S.stats.wave, S.areaIdx), S.queue.length, cap - alive);
      const sides = shuffle([0, 1, 2, 3]); /* flank: spread each group around the brush */
      for (let i = 0; i < group; i++) {
        const type = S.queue.pop();
        const pt = edgePoint(sides[i % 4]);
        S.markers.push({ type, x: pt.x, y: pt.y, t: 0.62 });
      }
      S.spawnTimer = CFG.wave.groupInterval(S.stats.wave);
    }
  }

  function updateFx(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      const damp = Math.exp(-5 * dt);
      p.vx *= damp; p.vy *= damp;
      p.rot += p.vr * dt;
      p.life -= dt;
      if (p.life <= 0) {
        S.stainQueue.push({ x: p.x, y: p.y, r: p.size * 1.5, alpha: 0.28 });
        S.particles.splice(i, 1);
      }
    }
    for (let i = S.popups.length - 1; i >= 0; i--) {
      const p = S.popups[i];
      p.y -= 28 * dt; p.life -= dt;
      if (p.life <= 0) S.popups.splice(i, 1);
    }
    for (let i = S.rings.length - 1; i >= 0; i--) {
      const r = S.rings[i];
      r.life -= dt;
      if (r.life <= 0) S.rings.splice(i, 1);
    }
    for (let i = S.stamps.length - 1; i >= 0; i--) {
      const st = S.stamps[i];
      st.life -= dt;
      if (st.life <= 0) S.stamps.splice(i, 1);
    }
    if (S.shake > 0) S.shake *= Math.exp(-6.5 * dt);
  }

  function update(dt) {
    const st = S.stats;
    if (!st) return;
    st.time += dt;
    clockT += dt;
    S.clockT = clockT;
    UI.setTime(st.time);

    if (S.magnetT > 0) S.magnetT -= dt;
    /* the chain breaks when the ink stops flowing */
    if (S.comboT > 0) {
      S.comboT -= dt;
      if (S.comboT <= 0 && S.combo > 0) { S.combo = 0; UI.setCombo(0, 1); }
    }

    updatePlayer(dt);
    updateBullets(dt);
    updateEbullets(dt);
    updateEnemies(dt);
    updatePuddles(dt);
    updateSpirits(dt);
    updateMotes(dt);
    updatePickups(dt);
    updateArcs(dt);
    updateVortices(dt);
    updateBolts(dt);
    updateMarkers(dt);
    updateSpawning(dt);
    updateFx(dt);

    UI.setXp(st.xp / CFG.xp.req(st.xpLevel), st.xpLevel);

    /* the guardian's seal, worn on the top of the sheet */
    let boss = null;
    for (const e of S.enemies) if (ENEMIES[e.type].boss) { boss = e; break; }
    if (!boss) {
      for (const m of S.markers) if (m.boss) { boss = { name: ENEMIES[m.type].name, marker: true }; break; }
    }
    if (boss && !boss.marker) UI.setBoss(ENEMIES[boss.type].name, boss.hp / boss.maxHp);
    else if (boss && boss.marker) UI.setBoss(boss.name, 1);
    else UI.setBoss(null);

    const remaining = S.queue.length + S.markers.length + S.enemies.length;
    UI.setProgress(S.waveInitial ? 1 - remaining / S.waveInitial : 1);

    if (S.waveActive && remaining === 0) {
      S.waveActive = false;
      S.clearedT = 0.7;
      /* the paper drinks its ink — every mote flies home */
      S.vacuum = true;
    }
    if (!S.waveActive && S.clearedT > 0) {
      S.clearedT -= dt;
      if (S.clearedT <= 0) {
        S.vacuum = false;
        /* the fifth sheet, washed clean — the scroll ends on film */
        if (S.runMode === 'journey' && st.wave >= CFG.wave.wavesPerArea * AREAS.length) {
          if (S.reduced) { showOver(true); return; }
          S.mode = 'cutscene';
          UI.hud(false);
          UI.show(null);
          CUT.start('finale', {});
        } else {
          openUpgrade('wave');
        }
      }
    }
  }

  function updateDying(dt) {
    moveBullets(dt);
    for (let i = S.ebullets.length - 1; i >= 0; i--) {
      const b = S.ebullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.age += dt;
      if (b.age > b.life) S.ebullets.splice(i, 1);
    }
    updateFx(dt);
    S.dyingT -= dt;
    if (S.dyingT <= 0) showOver(false);
  }

  /* ---------------- attract mode (title backdrop) ----------------
     beasts drift across an open sheet; the camera rests at the seal */
  function initAttract() {
    S.idle = [];
    const types = ['pulse', 'dart', 'spit', 'split', 'slab', 'shade', 'wraith', 'moth', 'titan', 'kage', 'crane', 'oni'];
    for (let i = 0; i < 9; i++) {
      const type = types[Math.floor(rand(0, types.length))];
      const r = ENEMIES[type].r * (type === 'titan' ? 0.7 : 1);
      const ang = rand(0, 6.28);
      const sp = rand(16, 34);
      const d = rand(60, 330);
      S.idle.push({
        type, r,
        x: Math.cos(ang) * d, y: Math.sin(ang) * d,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        ang, t: rand(0, 10), hitFlash: 0, state: 'cruise', seed: rand(0, 6.28),
      });
    }
  }

  function updateIdle(dt) {
    for (const d of S.idle) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.t += dt;
      d.ang += dt * 0.25;
      /* a soft pull keeps the wanderers near the seal */
      const dist = Math.hypot(d.x, d.y);
      if (dist > 350) {
        d.vx -= (d.x / dist) * 26 * dt;
        d.vy -= (d.y / dist) * 26 * dt;
      }
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 40) { d.vx *= 40 / sp; d.vy *= 40 / sp; }
    }
    updateFx(dt);
  }

  /* ---------------- api ---------------- */
  /* cutscene handoff: a scroll film resumes the run, the finale shows the sheet */
  CUT.onEnd = () => {
    if (CUT.lastKind === 'finale') { showOver(true); return; }
    S.mode = 'playing';
    UI.hud(true);
  };

  return {
    S,
    get mode() { return S.mode; },
    set mode(m) { S.mode = m; },
    startRun, continueEndless, abandon, deploy, pickAt,
    update, updateDying, updateIdle, initAttract,
    getBest, getRuns, getBrush, setBrush,
  };
})();
