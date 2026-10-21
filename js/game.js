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
    qaWave = Math.max(0, Math.min(999, parseInt(q.get('wave'), 10) || 0));
    qaPower = Math.max(0, Math.min(30, parseInt(q.get('power'), 10) || 0));
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
    arcs: [], vortices: [], bolts: [], telgs: [],   /* telgs: boss attack telegraphs */
    stainQueue: [],
    queue: [], waveInitial: 0, waveActive: false, spawnTimer: 0, clearedT: 0,
    spawnPattern: 'flank',           // flank | ring | flood — the wave's shape
    levelMarks: [],                  // the painter's scene inscriptions, one per level
    inklings: [],                    // small brush accents laid down at each wave

    invulnT: 0, adrenT: 0, shake: 0, dyingT: 0, novaT: 0, clockT: 0,
    playerSlowT: 0,               /* the smother's grip: the brush wades slow */
    arrived: false, washStamp: false,
    fanT: 2.2, spiritT: 1.6, hankoT: 4.0, trailT: 0,
    arcT: 2.0, boomerT: 1.5, vortexT: 3.0,
    combo: 0, comboT: 0, hitstop: 0, magnetT: 0, pendingSeal: false,
    pendingLevels: 0, pendingChests: 0, upKind: 'wave', vacuum: false,
    choices: [], selected: null,

    brush: 'needle',
    beginT: 0,                     // the opening wash of a run
    landscapeWave: 0,              // how far the sheet is painted
    waveRevealT: 0,                // when the newest layer was inked
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
    if (S.pendingLevels > 0 && S.mode === 'playing') {
      /* a broken seal owns the screen: the choice (onward naked, or
         home) comes first, and the naked rebuild forfeits owed picks */
      const sealWait = S.runMode === 'journey' && !S.waveActive && S.pendingSeal;
      if (!sealWait) openUpgrade('level');
    }
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
  /* the shelf of scrolls: what is unrolled, what lies finished.
     om_unlocked_v1 — the highest sheet the journey may enter (1-based).
     om_cleared_v1  — the highest sheet whose Guardian has fallen.
     om_prog_v1     — per sheet, the deepest level the brush has reached. */
  const getUnlocked = () => Math.max(1, store.get('om_unlocked_v1', 1), store.get('om_furthest_v1', 1));
  function setUnlocked(n) { if (n > getUnlocked()) store.set('om_unlocked_v1', n); }
  const getCleared = () => store.get('om_cleared_v1', 0);
  function setCleared(n) { if (n > getCleared()) store.set('om_cleared_v1', n); }
  const getProg = () => store.get('om_prog_v1', {});
  function noteLevel(sheet, level) {
    const p = getProg();
    if ((p[sheet] || 0) < level) { p[sheet] = level; store.set('om_prog_v1', p); }
  }
  /* om_seal_v1 — per sheet, the deepest scene whose seal was pressed
     (a scene may be entered without ever being sealed — the fall sees
     to that — and the shelf must tell the two apart) */
  const getSeals = () => store.get('om_seal_v1', {});
  function noteSeal(sheet, level) {
    const p = getSeals();
    if ((p[sheet] || 0) < level) { p[sheet] = level; store.set('om_seal_v1', p); }
  }
  /* the frontier of a sheet: the deepest scene the hand may walk —
     everything the brush has reached, and the page after the last
     seal. a cleared sheet's frontier stands on its Guardian: the
     finale stays walkable, as does every scene before it. */
  function frontierLevel(sheet) {
    if (sheet <= getCleared()) return CFG.wave.levelsPerArea;
    const top = Math.max(getProg()[sheet] || 0, (getSeals()[sheet] || 0) + 1);
    return Math.min(CFG.wave.levelsPerArea, top);
  }
  /* legacy name — the title's continue door reads the unlocked shelf */
  const getFurthest = getUnlocked;

  /* ---------------- helpers ---------------- */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* which sheet, which level, which wave — the journey reads
     wave N as: sheet = N / 100, level = N / 10 within the sheet,
     wave = N within the level. Endless turns past sheet 五. */
  function areaStateFor(w) {
    const per = CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea;   // 100 waves a sheet
    const cycle = Math.floor((w - 1) / per);
    const inCycle = (w - 1) % per;
    const level = Math.floor(inCycle / CFG.wave.wavesPerLevel) + 1;   // 1..10
    const waveInLevel = (inCycle % CFG.wave.wavesPerLevel) + 1;       // 1..10
    const themeIdx = S.runMode === 'endless'
      ? cycle % AREAS.length
      : Math.min(cycle, AREAS.length - 1);
    const area = AREAS[themeIdx];
    let hp = area.mult.hp, sp = area.mult.sp, budget = area.mult.budget;
    /* the climb inside a sheet: each level presses harder than the last,
       so a sheet's tenth level always bites far harder than its first */
    hp *= CFG.wave.levelHp(level);
    budget *= CFG.wave.levelBudget(level);
    if (S.runMode === 'endless' && cycle >= AREAS.length) {
      const k = cycle - (AREAS.length - 1);
      hp *= Math.pow(CFG.endless.hpGrowth, k);
      sp *= Math.pow(CFG.endless.spGrowth, k);
      budget *= Math.pow(CFG.endless.budgetGrowth, k);
    }
    const depth = (S.runMode === 'journey' ? Math.min(cycle, AREAS.length - 1) : cycle)
      * CFG.wave.levelsPerArea + (level - 1);
    const isLevelEnd = waveInLevel === CFG.wave.wavesPerLevel;
    const isGuardianWave = isLevelEnd && level === CFG.wave.levelsPerArea;
    const isSurge = !isLevelEnd && CFG.wave.surgeWaves.indexOf(waveInLevel) >= 0;
    return { cycle, level, waveInLevel, themeIdx, area, hp, sp, budget, depth,
             isLevelEnd, isGuardianWave, isSurge, isElite: isLevelEnd };
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

  function burst(x, y, r, big, red) {
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
        red: !!red,
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
    let hp, r = def.r;
    if (def.boss === 2) {
      /* keepers: area and level pressure, but a gentle capped growth
         between their debuts — a boss, never a wall of numbers */
      hp = def.hp * st.hp *
        Math.min(CFG.keeper.hpGrowCap, 1 + CFG.keeper.hpGrow * Math.max(0, w - def.intro));
    } else {
      hp = CFG.wave.hpScale(def.hp, w, def.intro) * st.hp;
    }
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
      slowT: 0, orbCd: 0, dirT: 0, spawnT: type === 'titan' || def.boss ? 2.5 : 0,
      px: 0, py: 0, // kage perch / crane pass target
    };
    S.enemies.push(e);
    S.rings.push({ x, y, max: r * 2.4, life: 0.3, maxLife: 0.3 });
    return e;
  }

  function killEnemy(e) {
    if (e.dead && e._killed) return;   /* one death, one harvest */
    e.dead = true;
    e._killed = true;
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
    const keeper = isBoss && def.boss === 2;
    burst(e.x, e.y, e.r, isBoss || e.type === 'titan' || e.elite, isBoss);
    S.stainQueue.push({
      x: e.x, y: e.y, r: e.r * (isBoss ? 3 : e.elite ? 2.2 : 1.45),
      alpha: isBoss ? 0.65 : e.elite ? 0.6 : 0.5,
      red: isBoss || e.elite || e.type === 'oni',
    });
    if (isBoss || e.type === 'slab' || e.type === 'titan' || e.type === 'oni' || e.type === 'golem' || e.elite) SFX.bigKill(); else SFX.kill();
    /* hit-stop: the paper holds its breath on the heavy strokes */
    if (!S.reduced) {
      if (isBoss) S.hitstop = Math.max(S.hitstop, keeper ? 0.2 : 0.27);
      else if (e.elite || e.type === 'titan' || e.type === 'golem') S.hitstop = Math.max(S.hitstop, 0.09);
      else if (e.type === 'slab' || e.type === 'oni') S.hitstop = Math.max(S.hitstop, 0.045);
    }
    if (e.elite || isBoss) { S.shake = Math.max(S.shake, isBoss ? (keeper ? 15 : 19) : 9); }
    if (isBoss) {
      /* a boss dies in red: a flash across the eye, twin red novas,
         and the paper drinks a deep seal of vermilion */
      S.redFlash = Math.max(S.redFlash || 0, keeper ? 0.42 : 0.58);
      S.rings.push({ x: e.x, y: e.y, max: keeper ? 250 : 340, life: 0.66, maxLife: 0.66, red: true });
      S.rings.push({ x: e.x, y: e.y, max: keeper ? 150 : 210, life: 0.5, maxLife: 0.5, red: true });
    }

    /* ink motes spill from every kill */
    const tier = moteTierFor(def.cost);
    if (isBoss) {
      if (keeper) {
        /* the keeper's hoard: a flush of ink and a flask of clean water */
        for (let i = 0; i < 10; i++) dropMote(e.x + rand(-26, 26), e.y + rand(-26, 26), moteValue(4), 2);
        dropPickup('pot', e.x + rand(-20, 20), e.y + rand(-20, 20));
      } else {
        for (let i = 0; i < 14; i++) dropMote(e.x + rand(-30, 30), e.y + rand(-30, 30), moteValue(4), 2);
        dropPickup('pot', e.x + rand(-24, 24), e.y + rand(-24, 24));
        dropPickup('chest', e.x, e.y);
      }
      /* the sheet's seal breaks: the scroll is finished, and the next
         scroll unrolls — on film when motion is welcome (the run holds
         its breath while the sheet announces itself), by banner cry
         when the hand asks for stillness */
      let unroll = null;
      if (S.runMode === 'journey') {
        const per = CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea;
        const sheet = Math.floor((S.stats.wave - 1) / per) + 1;
        const asNow = areaStateFor(S.stats.wave);
        /* only a Guardian's own wave may press the seal — a boss
           death anywhere else never credits a sheet */
        if (asNow.isGuardianWave && sheet > getCleared()) {
          setCleared(sheet);
          const next = AREAS[sheet] || null;   /* sheet is 1-based; AREAS[sheet] is the next */
          if (next) {
            setUnlocked(sheet + 1);
            if (!S.reduced) unroll = { area: asNow.area, next };
            else UI.unlockBanner(asNow.area, next, false);
          }
          else UI.unlockBanner(asNow.area, null, true);
        }
      }
      if (unroll) {
        S.mode = 'cutscene';
        UI.hud(false);
        UI.show(null);
        CUT.start('unroll', unroll);
      } else {
        UI.bossFalls(def.name, def.boss === 2);
      }
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
    if (e.type === 'gildling') {
      /* the gilt shell cracks — two gold shards skitter out */
      for (const s of [-1, 1]) {
        const c = spawnEnemy('pulseling', e.x + s * 12, e.y + rand(-6, 6));
        c.kbx = s * 210; c.kby = rand(-80, 80);
      }
      S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.4, alpha: 0.4 });
    }
    if (e.type === 'raindrake') {
      /* its last call: rain falls where it stood */
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + rand(-0.2, 0.2);
        S.ebullets.push({
          kind: 'glob',
          x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
          vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
          ang: a, age: 0, life: 1.1,
        });
      }
    }
    if (e.type === 'phoenix') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + rand(-0.25, 0.25);
        S.ebullets.push({
          kind: 'needle',
          x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
          vx: Math.cos(a) * CFG.needle.speed * 0.7, vy: Math.sin(a) * CFG.needle.speed * 0.7,
          ang: a, age: 0, life: 0.8,
        });
      }
    }
    if (e.type === 'blotter' && (e.soak || 0) > 0) {
      /* even in death the sponge gives back what it drank */
      const n = 2 + Math.min(3, e.soak) * 2;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.25, 0.25);
        S.ebullets.push({
          kind: 'needle',
          x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
          vx: Math.cos(a) * CFG.needle.speed * 0.65, vy: Math.sin(a) * CFG.needle.speed * 0.65,
          ang: a, age: 0, life: 0.7,
        });
      }
      SFX.needle();
    }
    if (e.type === 'surge') {
      /* the wave's last wash breaks where it fell */
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(-0.3, 0.3);
        S.ebullets.push({
          kind: 'glob',
          x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
          vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
          ang: a, age: 0, life: 1.2,
        });
      }
      S.rings.push({ x: e.x, y: e.y, max: 66, life: 0.35, maxLife: 0.35 });
    }
    if (e.type === 'mirror') {
      /* the glass shatters — two bright shards fly */
      for (const s of [-1, 1]) {
        const a = e.ang + s * 1.2;
        S.ebullets.push({
          kind: 'needle',
          x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
          vx: Math.cos(a) * CFG.needle.speed * 0.6, vy: Math.sin(a) * CFG.needle.speed * 0.6,
          ang: a, age: 0, life: 0.6,
        });
      }
    }
    if (e.type === 'koban') {
      /* the coin spills its worth — a chase well paid */
      for (let i = 0; i < 6; i++) dropMote(e.x + rand(-18, 18), e.y + rand(-18, 18), moteValue(3), 2);
      if (Math.random() < 0.22) dropPickup('pot', e.x, e.y);
      S.rings.push({ x: e.x, y: e.y, max: 62, life: 0.4, maxLife: 0.4, red: true });
    }
    if (e.type === 'nightshade' || e.type === 'gale') SFX.blink();
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
  function buildQueue(budget, wave, roster, featured) {
    const pool = roster.filter(k => ENEMIES[k].cost > 0 && ENEMIES[k].intro <= wave);
    const q = [];
    let guard = 0;
    while (budget > 0 && guard++ < 900) {
      const avail = pool.filter(k => ENEMIES[k].cost <= budget);
      if (!avail.length) break;
      let total = 0;
      for (const k of avail) {
        total += (ENEMY_WEIGHTS[k] || 1) * (k === featured ? 3 : 1);
      }
      let r = Math.random() * total, pick = avail[0];
      for (const k of avail) {
        r -= (ENEMY_WEIGHTS[k] || 1) * (k === featured ? 3 : 1);
        if (r <= 0) { pick = k; break; }
      }
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
    const paperStart = as.level === 1 && as.waveInLevel === 1;
    /* the sheet paints itself, one scene per LEVEL — the tenth
       level presses the red seal and the page is complete */
    S.landscapeWave = as.level;
    S.waveRevealT = performance.now() / 1000;
    if (paperStart) {
      S.levelMarks = [];
      S.inklings = [];
      if (S.runMode === 'journey') noteLevel(as.cycle + 1, 1);
    }
    /* the deeper the brush walks into a sheet, the more the paper remembers */
    if (S.runMode === 'journey') noteLevel(as.cycle + 1, as.level);
    /* the painter inscribes the scene where the brush now stands */
    if (as.waveInLevel === 1) {
      S.levelMarks.push({
        x: S.player.x + ((as.cycle * 7 + as.level * 13) % 2 ? 130 : -130),
        y: S.player.y - 40,
        kanji: as.area.names[as.level - 1] || '無題',
        t: performance.now() / 1000,
        seal: as.level === CFG.wave.levelsPerArea,
      });
    }
    /* every wave leaves a small accent somewhere near the brush */
    const ik = (S.inkKind = ((S.inkKind || 0) + 1) % 3);
    S.inklings.push({
      x: S.player.x + (((n * 73) % 17) - 8) * 34,
      y: S.player.y + (((n * 31) % 13) - 6) * 30,
      kind: ['reeds', 'rockS', 'crane'][ik],
      t: performance.now() / 1000,
      seed: (n * 2654435761) >>> 0,
    });
    if (S.inklings.length > 24) S.inklings.shift();

    /* the wave's shape */
    S.spawnPattern = as.isGuardianWave || as.isLevelEnd ? 'flank'
      : as.waveInLevel === 5 ? 'ring'
      : as.waveInLevel === 8 ? 'flood' : 'flank';

    let budget = CFG.wave.budget(as.waveInLevel, as.depth) * as.budget;
    if (as.isSurge) budget *= CFG.wave.surgeMult + 0.012 * as.depth;
    if (as.isLevelEnd) budget *= CFG.wave.sealBudget;
    /* the level's own beast leads the third wave, haunts the rest;
       a beast's TRUE debut — the first wave it may walk — outranks
       the calendar, so every new ink-born gets its walk-on wave */
    let featured = as.area.order ? as.area.order[as.level - 1] : null;
    for (const k of as.area.roster) {
      if (ENEMIES[k].intro === n && ENEMIES[k].cost > 0) { featured = k; break; }
    }
    S.queue = buildQueue(Math.round(budget), n, as.area.roster,
      (as.waveInLevel === 3 || as.waveInLevel === 6) ? featured : null);
    /* a true-debut wave: the new ink-born walks in force, not by chance */
    if (featured && ENEMIES[featured].intro === n) {
      S.queue.push(featured, featured, featured);
    }
    let elites = 0;
    if (as.isGuardianWave) {
      /* the Guardian of the sheet enters — a beast with a name */
      const pt = edgePoint();
      S.markers.push({ type: as.area.boss, x: pt.x, y: pt.y, t: 2.2, elite: true, boss: true });
      elites = 1;
    } else if (as.isLevelEnd) {
      /* the seal wave is a BOSS FIGHT: the scene's Keeper — the
         Guardian's lesser red kin — walks the paper, a halved
         honor guard at its heels */
      const pt = edgePoint();
      S.markers.push({ type: as.area.keeper, x: pt.x, y: pt.y, t: 2.2, elite: true, boss: true });
      elites = Math.max(1, Math.ceil(CFG.wave.elitesAt(as.depth) * 0.5));
      for (let i = 0; i < elites; i++) {
        const pt = edgePoint(i % 4);
        S.markers.push({ type: as.area.elite, x: pt.x, y: pt.y, t: 1.6 + i * 0.5, elite: true });
      }
    }
    S.waveInitial = S.queue.length + S.markers.length;
    S.waveActive = true;
    S.spawnTimer = 1.0;
    S.clearedT = 0;
    UI.setWave(as.waveInLevel);
    UI.setArea(as.area, as.level, as.waveInLevel, as.isLevelEnd);
    UI.setProgress(0);
    if (opts.quiet) return;   /* a cutscene announces this sheet — no banners */
    if (paperStart) {
      /* the scroll turns — a new sheet of paper */
      UI.areaBanner(as.area, as.cycle, S.runMode === 'endless' && as.cycle >= AREAS.length);
      SFX.gong();
    } else if (as.waveInLevel === 1) {
      /* a new scene grows on the same page */
      UI.levelBanner(as.area, as.level, as.area.names[as.level - 1]);
      SFX.wave(true);
    } else {
      UI.banner(as.waveInLevel, as.isSurge, as.isGuardianWave ? 'guardian' : as.isLevelEnd ? 'seal' : 'wave');
      SFX.wave(as.isSurge || as.isLevelEnd);
    }
    if (as.isGuardianWave) {
      UI.bossBanner(as.area, ENEMIES[as.area.boss].name, false, as.level);
      SFX.gong();
    } else if (as.isLevelEnd) {
      UI.bossBanner(as.area, ENEMIES[as.area.keeper].name, true, as.level);
      SFX.gong();
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
    UI.setUpgradeHeader(as.waveInLevel, as.level, as.area, S.upKind, S.stats.xpLevel);
    UI.fillUpgrades(S.choices, S.stats.levels);
    UI.markSelected(null);
    const nxt = areaStateFor(S.stats.wave + 1);
    UI.setDeploy(false, S.upKind === 'wave' && nxt.level === 1 ? nxt.area : null, nxt.level, nxt.cycle, S.upKind);
    UI.show('upgrade');
    SFX.wave();
  }

  /* a QA build: the first N upgrades of a fixed deep-run kit, applied.
     The kit leads with the weapons — a run this deep would carry them —
     so the sealed sheets and Guardians stay testable against the curve. */
  function applyQAPower(n) {
    const kit = ['heavy', 'rapid', 'plate', 'fan', 'spirit', 'arc', 'hanko', 'pierce',
                 'split', 'orbit', 'magnet', 'crit', 'well', 'velo', 'over'];
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
  function startRun(mode, opts = {}) {
    const prevWave = S.stats ? (S.stats.wave | 0) : 0;   /* where the last run fell */
    S.runMode = mode === 'endless' ? 'endless' : 'journey';
    S.brush = getBrush();
    S.stats = freshStats();
    S.bullets = []; S.ebullets = []; S.enemies = []; S.markers = []; S.telgs = [];
    S.particles = []; S.popups = []; S.rings = []; S.stainQueue = [];
    S.puddles = []; S.spirits = []; S.stamps = [];
    S.motes = []; S.pickups = []; S.arcs = []; S.vortices = []; S.bolts = [];
    S.queue = []; S.waveInitial = 0; S.waveActive = false;
    S.invulnT = 0; S.adrenT = 0; S.shake = 0; S.dyingT = 0; S.novaT = 0;
    S.fanT = 2.2; S.spiritT = 1.6; S.hankoT = 4.0; S.trailT = 0;
    S.arcT = 2.0; S.boomerT = 1.5; S.vortexT = 3.0;
    S.combo = 0; S.comboT = 0; S.hitstop = 0; S.magnetT = 0; S.playerSlowT = 0;
    S.redFlash = 0;   /* the red wash that bleeds across the eye when a boss dies */
    S.pendingLevels = 0; S.pendingChests = 0; S.vacuum = false; S.pendingSeal = false;
    S.arrived = S.reduced; S.washStamp = S.reduced;   // reduced motion: no entrance rite
    S.choices = []; S.selected = null; S.idle = [];
    S.levelMarks = []; S.inklings = []; S.spawnPattern = 'flank';
    S.areaIdx = 0;
    S.landscapeWave = 1;
    S.waveRevealT = performance.now() / 1000;
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
    /* resuming the journey from a sheet the paper remembers:
       the brush arrives with the kit a run that far would carry —
       and the shelf opens a scroll to any scene the ink has reached
       or sealed, never past the frontier (the kit grows with the road) */
    if (opts.sheet && S.runMode === 'journey' && qaWave < 1) {
      /* the shelf answers only what is unrolled — a locked scroll cannot open */
      const sheet = Math.max(1, Math.min(AREAS.length, Math.min(opts.sheet | 0, getUnlocked())));
      const level = Math.max(1, Math.min(frontierLevel(sheet),
        Math.min(CFG.wave.levelsPerArea, (opts.level | 0) || 1)));
      applyQAPower(1 + Math.floor(((sheet - 1) * CFG.wave.levelsPerArea + (level - 1)) / 2));
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave((sheet - 1) * CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea +
        (level - 1) * CFG.wave.wavesPerLevel + 1);
      return;
    }
    /* ONE MORE: the brush returns to the scene it fell in, not to the
       first page of the journey — the fall costs only the scene's road */
    if (opts.retry && S.runMode === 'journey' && qaWave < 1 && prevWave > 1) {
      const sheet = Math.max(1, Math.min(AREAS.length,
        Math.floor((prevWave - 1) / (CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea)) + 1));
      const clamped = Math.max(1, Math.min(frontierLevel(sheet), areaStateFor(prevWave).level));
      applyQAPower(1 + Math.floor(((sheet - 1) * CFG.wave.levelsPerArea + (clamped - 1)) / 2));
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave((sheet - 1) * CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea +
        (clamped - 1) * CFG.wave.wavesPerLevel + 1);
      return;
    }
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
    /* the hand takes the brush back: the field the scribe fell on is
       swept clean — the horde and its loosed ink gone, the pot refilled,
       a breath of grace granted — so a continue can never replay the
       very death it rescues (the wave still advances: the sheet is spent) */
    S.bullets.length = 0; S.ebullets.length = 0; S.enemies.length = 0; S.markers.length = 0;
    S.telgs.length = 0;
    S.motes.length = 0; S.pickups.length = 0; S.arcs.length = 0; S.vortices.length = 0;
    S.bolts.length = 0; S.particles.length = 0; S.popups.length = 0; S.rings.length = 0;
    S.spirits.length = 0; S.stamps.length = 0; S.puddles.length = 0;
    S.queue.length = 0; S.waveInitial = 0; S.waveActive = false;
    S.invulnT = 1.2; S.adrenT = 0; S.shake = 0; S.hitstop = 0; S.magnetT = 0;
    S.playerSlowT = 0; S.novaT = 0; S.redFlash = 0; S.combo = 0; S.comboT = 0;
    S.pendingLevels = 0; S.pendingChests = 0; S.vacuum = false; S.pendingSeal = false;
    S.stats.hp = S.stats.maxHp;   /* the continue refills what the fall spilled */
    UI.setHp(S.stats.hp, S.stats.maxHp);
    UI.setXp(Math.min(1, S.stats.xp / CFG.xp.req(S.stats.xpLevel)), S.stats.xpLevel);
    const p = S.player;
    p.vx = 0; p.vy = 0; p.fireT = 0.3; p.recoil = 0;
    S.beginT = 1.15;               // a shorter wash — the sheet is already known
    S.arrived = false; S.washStamp = false;
    S.mode = 'playing';
    startWave(S.stats.wave + 1);
  }

  /* ---------------- the level-clear rest ----------------
     a seal breaks and the run pauses for a breath: the hand either
     walks on — the next scene begins UNADORNED, every upgrade
     surrendered, the brush naked as at the first wave — or goes
     home, the sheet keeping what was pressed into it. */
  function showLevelClear() {
    const st = S.stats;
    const as = areaStateFor(st.wave);
    /* the paper remembers how deep the seals are pressed */
    noteSeal(Math.floor((st.wave - 1) /
      (CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea)) + 1, as.level);
    S.mode = 'clear';
    S.pendingSeal = false;
    S.pendingLevels = 0; S.pendingChests = 0;
    UI.hud(false);
    const guardian = as.level === CFG.wave.levelsPerArea;
    let nextArea = null;
    if (guardian) {
      const sheet = Math.floor((st.wave - 1) /
        (CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea)) + 1;
      nextArea = AREAS[sheet] || null;   /* null only on the fifth — the finale answers first */
    }
    UI.showClear({ area: as.area, level: as.level, guardian, nextArea });
    SFX.victory();
  }

  /* onward: a washed page, a naked brush — the build is surrendered
     at the seal, and the next scene's ten waves rebuild it from ink */
  function clearNext() {
    if (S.mode !== 'clear') return;
    const st = S.stats;
    const keep = { score: st.score, kills: st.kills, time: st.time, wave: st.wave };
    S.stats = freshStats();
    Object.assign(S.stats, keep);   /* the ledger endures; the kit does not */
    S.bullets.length = 0; S.ebullets.length = 0; S.enemies.length = 0; S.markers.length = 0;
    S.telgs.length = 0;
    S.motes.length = 0; S.pickups.length = 0; S.arcs.length = 0; S.vortices.length = 0;
    S.bolts.length = 0; S.particles.length = 0; S.popups.length = 0; S.rings.length = 0;
    S.spirits.length = 0; S.stamps.length = 0; S.puddles.length = 0;
    S.queue.length = 0; S.waveInitial = 0; S.waveActive = false;
    S.invulnT = 1.2; S.adrenT = 0; S.shake = 0; S.hitstop = 0; S.magnetT = 0;
    S.playerSlowT = 0; S.novaT = 0; S.combo = 0; S.comboT = 0;
    S.pendingLevels = 0; S.pendingChests = 0; S.vacuum = false; S.pendingSeal = false;
    S.levelMarks = []; S.inklings = []; S.spawnPattern = 'flank';
    if (R.resetStains) R.resetStains();   /* a fresh page for the new scene */
    S.beginT = S.reduced ? 0.01 : 1.15;   /* the brush paints the scene in */
    S.arrived = S.reduced; S.washStamp = S.reduced;
    const p = S.player;
    p.vx = 0; p.vy = 0; p.fireT = 0.3; p.recoil = 0;
    UI.show(null);
    UI.hud(true);
    UI.setLoadout({});
    UI.setXp(0);
    UI.setHp(S.stats.hp, S.stats.maxHp);
    S.mode = 'playing';
    startWave(st.wave + 1);
  }

  /* home: the run ends where it stands — the best is kept,
     the seals already pressed speak for the journey */
  function clearHome() {
    if (S.mode !== 'clear') return;
    const st = S.stats;
    const best = getBest();
    if (st.score > (best ? best.score : 0)) {
      store.set('om_best_v1', { score: st.score, wave: Math.max(0, st.wave - 1) });
    }
    if (R.resetStains) R.resetStains();   /* the title receives a clean sheet */
    abandon();
  }

  function abandon() {
    CUT.cancel();
    S.mode = 'title';
    S.bullets = []; S.ebullets = []; S.enemies = []; S.markers = []; S.telgs = [];
    S.particles = []; S.popups = []; S.rings = []; S.stainQueue = []; S.queue = [];
    S.puddles = []; S.spirits = []; S.stamps = [];
    S.motes = []; S.pickups = []; S.arcs = []; S.vortices = []; S.bolts = [];
    S.pendingSeal = false; S.pendingLevels = 0; S.pendingChests = 0; S.playerSlowT = 0;
    UI.hud(false);
    UI.show('title');
    UI.setBest(getBest());
    UI.setRunNo(getRuns() + 1);
    UI.setSheetContinue(getFurthest());
    UI.buildJourney();
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
    /* the level's seal was earned — its pick is still owed.
       (endless only: the journey answers the seal with a choice, not a stroke) */
    if (S.pendingSeal && kind !== 'wave' && S.runMode !== 'journey') { S.pendingSeal = false; openUpgrade('wave'); return; }
    if (kind === 'wave') S.pendingSeal = false;
    UI.show(null);
    const nxt = areaStateFor(S.stats.wave + 1);
    if (kind === 'wave' && nxt.level === 1 && !S.reduced) {
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
    /* 'level' and 'chest' resume the wave where it stood — a pick
       taken mid-wave must not advance the count nor loose its beasts
       across a boundary (a leaked Guardian would credit its kill to
       the wrong sheet); the wave ends on its own terms */
    if (kind !== 'wave' && S.waveActive) return;
    /* a pick taken while the seal wave's motes still flew must not
       steal the choice — the journey pauses at the broken seal */
    if (S.runMode === 'journey' && !S.waveActive && areaStateFor(S.stats.wave).isLevelEnd) {
      showLevelClear();
      return;
    }
    startWave(S.stats.wave + 1);
  }

  function pickAt(i) {
    if (S.mode !== 'upgrade') return;
    const u = S.choices[i];
    if (!u) return;
    if (S.selected === i) { deploy(); return; }
    S.selected = i;
    UI.markSelected(i);
    const nxt = areaStateFor(S.stats.wave + 1);
    UI.setDeploy(true, S.upKind === 'wave' && nxt.level === 1 ? nxt.area : null, nxt.level, nxt.cycle, S.upKind);
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
    /* the seal falls ONCE per breath — the clock is always repaid,
       or the stamp would hammer every frame and wipe the sheet */
    S.hankoT = CFG.hanko.period(st.hanko);
    if (!tgt) { S.hankoT = 0.8; return; }
    const rad = CFG.hanko.radius(st.hanko);
    const dmg = CFG.hanko.dmg(st.hanko);
    S.stamps.push({ x: tgt.x, y: tgt.y, r: rad, life: 0.62, max: 0.62, seed: (Math.random() * 1e9) | 0 });
    S.rings.push({ x: tgt.x, y: tgt.y, max: rad, life: 0.4, maxLife: 0.4, red: true });
    S.stainQueue.push({ x: tgt.x, y: tgt.y, r: rad * 0.34, alpha: 0.34, red: true });
    S.shake = Math.max(S.shake, 6);
    for (let k = S.enemies.length - 1; k >= 0; k--) {
      const e = S.enemies[k];
      const dx = e.x - tgt.x, dy = e.y - tgt.y;
      if (dx * dx + dy * dy <= rad * rad) {
        /* great beasts respect the seal — half the bite for elites
           and Guardians, so one stamp can never clear the sheet */
        const d2 = (e.elite || ENEMIES[e.type].boss)
          ? Math.max(1, Math.ceil(dmg * 0.45))
          : dmg;
        e.hp -= d2;
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
    /* the scribe arrives with the opening wash: as the wet edge passes
       the brush's place, a drop of ink falls and the figure rises out
       of it — once, only while the wash is still on the sheet */
    if (!S.arrived && S.beginT > 0 && S.beginT <= 1.42) {
      S.arrived = true;
      if (!S.reduced) {
        burst(p.x, p.y + 7, 9, false);
        S.stainQueue.push({ x: p.x, y: p.y + 9, r: 8.5, alpha: 0.5 });
        S.rings.push({ x: p.x, y: p.y + 4, max: 46, life: 0.55, maxLife: 0.55 });
        p.recoil = 1.0;             /* the brush flicks as it settles */
        S.shake = Math.max(S.shake, 2.5);
        SFX.arrive();
      }
    }
    let ix = S.inputVec.x, iy = S.inputVec.y;
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    const sp = CFG.player.speed * st.moveMult * (S.adrenT > 0 ? CFG.adrenaline.mult : 1)
      * (S.playerSlowT > 0 ? 0.62 : 1);   /* the smother's wet weight */
    /* the brush glides: velocity eases toward the hand's intent,
       quick to take up, quicker to let go — never a hard stop */
    const rate = m > 0.01 ? 13.5 : 17.5;
    const k = 1 - Math.exp(-rate * dt);
    p.vx += (ix * sp - p.vx) * k;
    p.vy += (iy * sp - p.vy) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    /* the sheet is endless — nothing clamps the brush */

    /* the storm eye drags everything toward its center;
       the maelstrom's undertow is smaller, and only near */
    for (const e of S.enemies) {
      if (e.type === 'b_tempest') {
        const dx = e.x - p.x, dy = e.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        p.x += (dx / d) * 52 * dt;
        p.y += (dy / d) * 52 * dt;
      } else if (e.type === 'maelstrom') {
        const dx = e.x - p.x, dy = e.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 250 * 250) {
          const d = Math.sqrt(d2) || 1;
          const f = 44 * (1 - d / 250);
          p.x += (dx / d) * f * dt;
          p.y += (dy / d) * f * dt;
        }
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
    if (S.playerSlowT > 0) S.playerSlowT -= dt;
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

  function damageEnemy(e, idx, dmg, knock, ang, proj, refl) {
    const st = S.stats;
    /* a corpse cannot die twice — grid-referenced bodies stay
       visible to strokes that were cast in the same breath */
    if (e.dead) return false;
    /* the koi swims beneath the sheet — strokes pass over it */
    if (e.diving) return false;
    /* the blotter drinks frontal strokes — three, and it bursts */
    if (e.type === 'blotter' && proj && !e.bloat) {
      e.soak = (e.soak || 0) + 1;
      e.r = Math.min(19, e.r + 1.2);
      S.popups.push({ x: e.x, y: e.y - e.r - 5, txt: '飲', life: 0.45, max: 0.45 });
      SFX.ping();
      if (e.soak >= 3) {
        e.bloat = true;
        /* it cannot hold the drink — the sponge sprays */
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + rand(-0.2, 0.2);
          S.ebullets.push({
            kind: 'needle',
            x: e.x + Math.cos(a) * (e.r + 3), y: e.y + Math.sin(a) * (e.r + 3),
            vx: Math.cos(a) * CFG.needle.speed * 0.7, vy: Math.sin(a) * CFG.needle.speed * 0.7,
            ang: a, age: 0, life: 0.75,
          });
        }
        SFX.needle();
      }
      return false;
    }
    /* the gate's shield and the sealbearer's red seal drink frontal strikes.
       Frontal = the stroke travels against the beast's facing (it came
       from where the beast looks), so the test is on the REVERSED
       heading — the old raw-diff test never once blocked a bullet. */
    if ((e.type === 'gate' || e.type === 'sealbearer') && proj) {
      let diff = ang - e.ang + Math.PI;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      if (Math.abs(diff) < 1.15) {
        S.popups.push({ x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6), txt: '掠', life: 0.4, max: 0.4 });
        SFX.ping();
        return false;
      }
    }
    /* the gilt mirror turns a frontal stroke back at the horde —
       a returned stroke is never returned again */
    if (e.type === 'mirror' && proj && !refl) {
      let diff = ang - e.ang + Math.PI;
      while (diff > Math.PI) diff -= TAU;
      while (diff < -Math.PI) diff += TAU;
      if (Math.abs(diff) < 1.15) {
        const ra = ang + Math.PI;
        S.bullets.push({
          x: e.x + Math.cos(ra) * (e.r + 5), y: e.y + Math.sin(ra) * (e.r + 5),
          vx: Math.cos(ra) * CFG.player.bulletSpeed * 0.9, vy: Math.sin(ra) * CFG.player.bulletSpeed * 0.9,
          ang: ra, dmg: 1, hits: 1, age: 0, life: 0.8,
          kind: 'drop', brush: 'needle', seed: 100000 + ((Math.random() * 899999) | 0), refl: true,
        });
        S.popups.push({ x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6), txt: '返', life: 0.4, max: 0.4 });
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
      /* the index a caller carried may be stale by now — resolve
         it fresh, so a splice never takes the wrong beast */
      e.dead = true;
      const i = S.enemies.indexOf(e);
      if (i >= 0) S.enemies.splice(i, 1);
      killEnemy(e);
      return true;
    }
    return false;
  }

  /* ---------------- the hit grid ----------------
     One uniform hash per substep, shared by every stroke that
     seeks flesh: bullets query three-by-three cells around their
     own cell instead of walking the whole horde. Cell 96 px
     covers the widest beast plus the fastest projectile. */
  const HIT = 96;
  const hitGrid = new Map();
  const hitPool = [];
  let hitPoolN = 0;
  const hitKey = (gx, gy) => (gx + 16384) * 33554432 + (gy + 16384);
  function buildHitGrid() {
    hitPoolN = 0;
    hitGrid.clear();
    const list = S.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const key = hitKey(Math.floor(e.x / HIT), Math.floor(e.y / HIT));
      let arr = hitGrid.get(key);
      if (!arr) {
        if (hitPoolN < hitPool.length) arr = hitPool[hitPoolN++];
        else { arr = []; hitPool.push(arr); hitPoolN++; }
        hitGrid.set(key, arr);
      }
      arr.push(e);
    }
  }

  function updateBullets(dt) {
    moveBullets(dt);
    for (let i = S.bullets.length - 1; i >= 0; i--) {
      const b = S.bullets[i];
      const br = b.kind === 'boomer' ? 13 : b.kind === 'blade' ? 4 : 3;
      const gx = Math.floor(b.x / HIT), gy = Math.floor(b.y / HIT);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = hitGrid.get(hitKey(gx + ox, gy + oy));
          if (!arr) continue;
          for (let m = 0; m < arr.length; m++) {
            const e = arr[m];
            if (e.dead) continue;
            const dx = e.x - b.x, dy = e.y - b.y;
            const rr = e.r + br;
            if (dx * dx + dy * dy <= rr * rr) {
              const ang = Math.atan2(b.vy, b.vx);
              SFX.hit();
              b.hits--;
              damageEnemy(e, -1, b.dmg, true, ang, true, !!b.refl);
              if (b.hits <= 0) {
                if (b.kind === 'blade') burst(b.x, b.y, 3, false);
                S.bullets.splice(i, 1);
                ox = 2; oy = 2; break;   /* this droplet is spent */
              }
            }
          }
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
          /* the seal's choice outranks a chest — it waits for the popup */
          const sealWait = S.runMode === 'journey' && !S.waveActive && S.pendingSeal;
          if (S.mode === 'playing' && !sealWait) openUpgrade('chest');
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
          S.rings.push({ x: bo.x, y: bo.y, max: bo.r * 1.5, life: 0.3, maxLife: 0.3, red: !!bo.red });
          S.stainQueue.push({ x: bo.x, y: bo.y, r: bo.r * 0.4, alpha: 0.4, red: !!bo.red });
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
    /* the true depth of the run, computed once — the brood-mothers
       used to read the sheet index as depth and capped their young
       far too early on the deeper sheets */
    const asNow = areaStateFor(S.stats.wave);
    const broodCap = CFG.wave.concurrentCap(asNow.waveInLevel, asNow.depth);
    /* wardens are few — gather them once instead of scanning per beast */
    let wardens = null;
    for (const w of S.enemies) if (w.type === 'warden') (wardens || (wardens = [])).push(w);
    /* the swarm's heart: one centroid pass feeds every gnat */
    let gnatCx = 0, gnatCy = 0, gnatN = 0;
    for (const w of S.enemies) if (w.type === 'gnat') { gnatCx += w.x; gnatCy += w.y; gnatN++; }
    if (gnatN > 1) { gnatCx /= gnatN; gnatCy /= gnatN; }
    /* the rank: ashigaru are few — gather them once */
    let ashigaru = null;
    for (const w of S.enemies) if (w.type === 'ashigaru') (ashigaru || (ashigaru = [])).push(w);
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
          case 'gildling':   /* the gilded beetle walks like a blot, but armored */
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
              if (e.spawnT <= 0 && S.enemies.length < broodCap) {
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
          case 'crane': case 'palecrane': case 'phoenix': { /* swoops past in long arcs, never lingers */
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
              if (e.stateT > 0.9 && d > 220) {
                /* the phoenix shakes golden needles from its wings as it turns */
                if (e.type === 'phoenix') {
                  const base = e.ang + Math.PI / 2;
                  for (let i = -1; i <= 1; i++) {
                    const a = base + i * 0.3;
                    S.ebullets.push({
                      kind: 'needle',
                      x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
                      vx: Math.cos(a) * CFG.needle.speed * 0.72, vy: Math.sin(a) * CFG.needle.speed * 0.72,
                      ang: a, age: 0, life: CFG.needle.life * 0.9,
                    });
                  }
                  SFX.needle();
                }
                e.state = 'loop'; e.stateT = 0; e.dirT = 0.15;
              }
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

          /* ---------- the papers' own specials, born of their ink ---------- */
          case 'washling': { /* pale wash that breathes as it drifts */
            const breath = 0.5 + 0.7 * Math.abs(Math.sin(e.t * 1.15 + e.seed));
            const wob = Math.sin(e.t * 2.0 + e.seed) * 0.55;
            vx = (ux - uy * wob) * e.speed * breath * sm;
            vy = (uy + ux * wob) * e.speed * breath * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'nightshade': { /* the night's own shade — blinks sooner, bites faster */
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (e.stateT > (d < 300 ? 0.9 : 1.7)) { e.state = 'dissolve'; e.stateT = 0; }
            } else if (e.state === 'dissolve') {
              e.stateT += dt;
              if (e.stateT > 0.4) {
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.85, alpha: 0.38 });
                const ba = rand(0, TAU), bd = rand(150, 205);
                e.x = p.x + Math.cos(ba) * bd; e.y = p.y + Math.sin(ba) * bd;
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.05, alpha: 0.42 });
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.state = 'pounce'; e.stateT = 0;
                SFX.blink();
              }
            } else if (e.state === 'pounce') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * 340 * sm; vy = Math.sin(e.ang) * 340 * sm;
              if (e.stateT > 0.4) { e.state = 'rest'; e.stateT = 0; }
            } else {
              e.stateT += dt;
              if (e.stateT > 0.55) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'gloom': { /* a slow fog — the farther you run, the harder it breathes */
            const far = clamp((d - 160) / 420, 0, 1);
            const puff = 0.35 + 1.35 * far * (0.6 + 0.4 * Math.sin(e.t * 0.9 + e.seed));
            const wob = Math.sin(e.t * 1.4 + e.seed) * 0.4;
            vx = (ux - uy * wob) * e.speed * puff * sm;
            vy = (uy + ux * wob) * e.speed * puff * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'ember': { /* a live coal of ink — quick telegraph, quicker dash */
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 380 && e.stateT > 0.85) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.3) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.state = 'dash'; e.stateT = 0;
              }
            } else if (e.state === 'dash') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * 560; vy = Math.sin(e.ang) * 560;
              if (Math.random() < 0.4) S.stainQueue.push({ x: e.x, y: e.y, r: 4, alpha: 0.3, red: true });
              if (e.stateT > 0.32) { e.state = 'rest'; e.stateT = 0; }
            } else {
              e.stateT += dt;
              if (e.stateT > 0.5) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'sealbearer': { /* a slow mass behind a red seal that spits when near */
            const want = Math.atan2(uy, ux);
            let diff = want - e.ang;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            e.ang += clamp(diff, -0.8 * dt, 0.8 * dt);
            vx = Math.cos(e.ang) * e.speed * sm;
            vy = Math.sin(e.ang) * e.speed * sm;
            e.stateT += dt;
            if (d < 330 && e.stateT > 2.4) {
              e.stateT = 0;
              const base = Math.atan2(p.y - e.y, p.x - e.x);
              for (let i = -1; i <= 1; i++) {
                const a = base + i * 0.2;
                S.ebullets.push({
                  kind: 'glob',
                  x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
                  vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
                  ang: a, age: 0, life: CFG.glob.life,
                });
              }
              SFX.glob();
            }
            break;
          }
          case 'raindrake': { /* calls the rain — strafes at a distance and casts it down */
            e.ang = Math.atan2(uy, ux);
            if (d > 300) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
            else if (d < 210) { vx = -ux * e.speed * 0.8 * sm; vy = -uy * e.speed * 0.8 * sm; }
            else {
              const sdir = Math.sin(e.seed + e.t * 0.55) > 0 ? 1 : -1;
              vx = -uy * e.speed * 0.95 * sm * sdir;
              vy = ux * e.speed * 0.95 * sm * sdir;
            }
            e.stateT += dt;
            if (d < 420 && e.stateT > 2.3) {
              e.stateT = 0;
              const base = Math.atan2(p.y - e.y, p.x - e.x);
              for (let i = -1; i <= 1; i++) {
                const a = base + i * 0.24;
                S.ebullets.push({
                  kind: 'glob',
                  x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
                  vx: Math.cos(a) * 175, vy: Math.sin(a) * 175,
                  ang: a, age: 0, life: CFG.glob.life * 1.2,
                });
              }
              SFX.glob();
            }
            break;
          }
          case 'gale': { /* the wind given a body — draws a line, then is gone along it */
            if (e.state === 'cruise') {
              const wob = Math.sin(e.t * 3.1 + e.seed) * 0.9;
              vx = (ux - uy * wob) * e.speed * 0.5 * sm;
              vy = (uy + ux * wob) * e.speed * 0.5 * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 460 && e.stateT > 0.7) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.45) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.state = 'dash'; e.stateT = 0;
              }
            } else if (e.state === 'dash') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * 640; vy = Math.sin(e.ang) * 640;
              if (Math.random() < 0.3) S.stainQueue.push({ x: e.x, y: e.y, r: 3, alpha: 0.2 });
              if (e.stateT > 0.5) { e.state = 'skid'; e.stateT = 0; }
            } else {
              e.stateT += dt;
              if (e.stateT > 0.35) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'gnat': { /* the swarm: each gnat seeks you, but the swarm holds together */
            const wob = Math.sin(e.t * 9 + e.seed) * 0.8;
            let sx = ux, sy = uy;
            if (gnatN > 1) {
              const cd = Math.hypot(gnatCx - e.x, gnatCy - e.y) || 1;
              sx += ((gnatCx - e.x) / cd) * 0.55;
              sy += ((gnatCy - e.y) / cd) * 0.55;
            }
            const sl = Math.hypot(sx, sy) || 1;
            vx = (sx / sl - uy * wob * 0.35) * e.speed * sm;
            vy = (sy / sl + ux * wob * 0.35) * e.speed * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'blotter': { /* the sponge walks slow; bloated, slower still */
            const bm = e.bloat ? 0.5 : 0.85;
            vx = ux * e.speed * bm * sm; vy = uy * e.speed * bm * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          }
          case 'owl': { /* the watcher: marks where you stand, then the needles fall there */
            e.ang = Math.atan2(uy, ux);
            if (e.state === 'cruise') {
              if (d < 330) { vx = -ux * e.speed * sm; vy = -uy * e.speed * sm; }
              else if (d > 470) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
              else {
                const sdir = Math.sin(e.seed + e.t * 0.5) > 0 ? 1 : -1;
                vx = -uy * e.speed * 0.8 * sm * sdir;
                vy = ux * e.speed * 0.8 * sm * sdir;
              }
              e.stateT += dt;
              if (d < 560 && e.stateT > 1.9) {
                e.state = 'mark'; e.stateT = 0; e.px = p.x; e.py = p.y;
                S.rings.push({ x: p.x, y: p.y, max: 44, life: 1.05, maxLife: 1.05 });
                SFX.wind();
              }
            } else if (e.state === 'mark') {
              e.stateT += dt;
              if (e.stateT > 1.05) {
                e.state = 'fire'; e.stateT = 0;
                const fa = Math.atan2(e.py - e.y, e.px - e.x);
                for (let i = -1; i <= 1; i++) {
                  const a = fa + i * 0.14;
                  S.ebullets.push({
                    kind: 'needle',
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * CFG.needle.speed, vy: Math.sin(a) * CFG.needle.speed,
                    ang: a, age: 0, life: CFG.needle.life,
                  });
                }
                SFX.needle();
              }
            } else if (e.state === 'fire') {
              e.stateT += dt;
              if (e.stateT > 0.3) { e.state = 'rest'; e.stateT = 0; }
            } else {
              e.stateT += dt;
              if (e.stateT > 0.9) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'smother': { /* a low stain that crawls — its touch weighs the brush down */
            const wob = Math.sin(e.t * 2.2 + e.seed) * 0.35;
            vx = (ux - uy * wob) * e.speed * sm;
            vy = (uy + ux * wob) * e.speed * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'ashigaru': { /* marches in rank — shields to shoulder, quicker together */
            let rank = 0;
            if (ashigaru && ashigaru.length > 1) {
              for (const o of ashigaru) {
                if (o === e) continue;
                const ox2 = e.x - o.x, oy2 = e.y - o.y;
                if (ox2 * ox2 + oy2 * oy2 < 96 * 96 && ++rank >= 3) break;
              }
            }
            const rm = 1 + Math.min(3, rank) * 0.16;
            vx = ux * e.speed * rm * sm; vy = uy * e.speed * rm * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          }
          case 'stamper': { /* the seal-carrier presses a red stamp onto the paper where you stood */
            e.ang = Math.atan2(uy, ux);
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.stateT += dt;
            if (e.state === 'cruise' && d < 430 && e.stateT > 2.2) {
              e.state = 'raise'; e.stateT = 0; e.px = p.x; e.py = p.y; SFX.wind();
            } else if (e.state === 'raise' && e.stateT > 0.55) {
              e.state = 'cruise'; e.stateT = rand(0, 0.4);
              S.bolts.push({ x: e.px, y: e.py, t: 0.5, r: 46, struck: false, life: 0, red: true });
            }
            break;
          }
          case 'surge': { /* a wave that builds, curls, and breaks where you stood */
            if (e.state === 'cruise') {
              vx = ux * e.speed * 0.42 * sm; vy = uy * e.speed * 0.42 * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 420 && e.stateT > 1.7) { e.state = 'rise'; e.stateT = 0; }
            } else if (e.state === 'rise') {
              e.stateT += dt;
              vx = -uy * e.speed * 0.4 * sm; vy = ux * e.speed * 0.4 * sm;   /* the crest curls */
              if (e.stateT > 0.5) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                e.state = 'break'; e.stateT = 0; SFX.wind();
              }
            } else if (e.state === 'break') {
              e.stateT += dt;
              vx = e.px * e.speed * 2.9 * sm; vy = e.py * e.speed * 2.9 * sm;
              if (e.stateT > 0.6) {
                e.state = 'wash'; e.stateT = 0;
                for (let i = 0; i < 4; i++) {
                  const a = (i / 4) * TAU + rand(-0.2, 0.2);
                  S.ebullets.push({
                    kind: 'glob',
                    x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
                    vx: Math.cos(a) * 165, vy: Math.sin(a) * 165,
                    ang: a, age: 0, life: 1.5,
                  });
                }
                S.rings.push({ x: e.x, y: e.y, max: 74, life: 0.35, maxLife: 0.35 });
                SFX.glob();
              }
            } else {
              e.stateT += dt;
              if (e.stateT > 0.7) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'maelstrom': { /* the undertow — it barely moves, and that is the danger */
            const wob = Math.sin(e.t * 1.1 + e.seed) * 0.5;
            vx = (ux - uy * wob) * e.speed * sm;
            vy = (uy + ux * wob) * e.speed * sm;
            e.ang = e.t * 0.8;
            break;
          }
          case 'mirror': { /* the gilt glass — it faces you, and your strokes answer to it */
            const want = Math.atan2(uy, ux);
            let diff = want - e.ang;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            e.ang += clamp(diff, -0.8 * dt, 0.8 * dt);
            vx = Math.cos(e.ang) * e.speed * sm;
            vy = Math.sin(e.ang) * e.speed * sm;
            break;
          }
          case 'koban': { /* the coin-spirit does not fight — it runs, and it is worth the chase */
            const flee = Math.atan2(-uy, -ux);
            let diff = flee - e.ang;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            e.ang += clamp(diff, -3.4 * dt, 3.4 * dt);
            if ((e.dirT -= dt) <= 0) { e.dirT = rand(0.4, 0.9); e.ang = flee + rand(-0.9, 0.9); }
            vx = Math.cos(e.ang) * e.speed * sm;
            vy = Math.sin(e.ang) * e.speed * sm;
            break;
          }

          /* ============ THE GUARDIANS & THEIR KEEPERS ============ */
          case 'b_wheel': case 'k_blight': { /* THE STAIN / THE BLIGHT — swells, then slams a ring of ink */
            const mini = ENEMIES[e.type].boss === 2;
            const enr = e.hp < e.maxHp * 0.5;
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            if (e.state === 'cruise' && e.stateT > (enr ? 1.9 : mini ? 3.3 : 2.9)) {
              e.state = 'windup'; e.stateT = 0; SFX.wind();
              /* the paper blushes where the ring will land */
              S.telgs.push({ e, kind: 'ring', r: mini ? 165 : 205, life: 0.7, maxLife: 0.7 });
            }
            else if (e.state === 'windup' && e.stateT > 0.7) {
              e.state = 'cruise'; e.stateT = rand(0, 0.6);
              const n = (mini ? 7 : 10) + (enr ? 3 : 0), off = rand(0, TAU);
              for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU + off;
                S.ebullets.push({
                  kind: 'glob', red: true,
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
          case 'b_mother': case 'k_husk': { /* THE NIGHT MOTHER / THE HUSK — dissolves, blinks, fans needles, sheds shades */
            const mini = ENEMIES[e.type].boss === 2;
            const enr = e.hp < e.maxHp * 0.5;
            e.stateT += dt;
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > (enr ? 2.3 : mini ? 3.9 : 3.4)) { e.state = 'dissolve'; e.stateT = 0; }
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
                const half = mini ? (enr ? 2 : 1) : (enr ? 3 : 2);
                for (let i = -half; i <= half; i++) {
                  const a = base + i * 0.17;
                  S.ebullets.push({
                    kind: 'needle', red: true,
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * CFG.needle.speed * 0.85, vy: Math.sin(a) * CFG.needle.speed * 0.85,
                    ang: a, age: 0, life: CFG.needle.life,
                  });
                }
                SFX.needle();
                e.sheds = (e.sheds || 0) + 1;
                if (e.sheds % 2 === 0 && S.enemies.length < broodCap + 8) {
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
          case 'b_warlord': case 'k_cinder': { /* THE CINNABAR ONI / THE CINDER — bulldozer charges and spread volleys */
            const mini = ENEMIES[e.type].boss === 2;
            e.stateT += dt;
            const enraged = e.hp < e.maxHp * 0.5;
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > (enraged ? 1.5 : mini ? 2.7 : 2.3)) { e.state = 'windup'; e.stateT = 0; SFX.wind(); S.telgs.push({ e, kind: 'line', len: mini ? 300 : 360, life: 0.6, maxLife: 0.6 }); }
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
                const half = mini ? 2 : 3;
                for (let i = -half; i <= half; i++) {
                  const a = base + i * 0.15;
                  S.ebullets.push({
                    kind: 'glob', red: true,
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
          case 'b_tempest': case 'k_veil': { /* THE STORM EYE / THE RAINVEIL — orbits, drags, spirals needles, calls bolts */
            const mini = ENEMIES[e.type].boss === 2;
            const enr = e.hp < e.maxHp * 0.5;
            const ringD = 250;
            const tangent = Math.atan2(uy, ux) + (e.seed > 3.14 ? 1 : -1) * Math.PI / 2;
            const pull = clamp((d - ringD) * 2.2, -80, 80);
            vx = (Math.cos(tangent) * e.speed + ux * pull) * sm;
            vy = (Math.sin(tangent) * e.speed + uy * pull) * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            e.spinT = (e.spinT || 0) + dt;
            if (e.spinT > (enr ? 1.5 : mini ? 2.7 : 2.3)) {
              e.spinT = 0;
              const base = e.t * 1.9;
              const nn = (mini ? 3 : 4) + (enr ? 2 : 0);
              for (let i = 0; i < nn; i++) {
                const a = base + (i / nn) * TAU;
                S.ebullets.push({
                  kind: 'needle', red: true,
                  x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                  vx: Math.cos(a) * CFG.needle.speed * 0.78, vy: Math.sin(a) * CFG.needle.speed * 0.78,
                  ang: a, age: 0, life: CFG.needle.life * 1.2,
                });
              }
              SFX.needle();
            }
            e.boltT = (e.boltT || 0) + dt;
            if (e.boltT > (enr ? 3.6 : mini ? 6.2 : 5.2)) {
              e.boltT = 0;
              const nb = mini ? 2 : 3;
              for (let i = 0; i < nb; i++) {
                const ba = rand(0, TAU), bd = rand(20, 150);
                S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.85 + i * 0.3, r: 54, struck: false, life: 0 });
              }
              SFX.wind();
            }
            break;
          }
          case 'b_origin': case 'k_nib': { /* THE FIRST BRUSH / THE NIB — three phases: volleys, brood, fury */
            const mini = ENEMIES[e.type].boss === 2;
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            const phase = e.hp < e.maxHp * 0.33 ? 2 : e.hp < e.maxHp * 0.66 ? 1 : 0;
            e.vT = (e.vT || 0) + dt;
            if (e.vT > (phase === 2 ? 2.0 : phase === 1 ? 2.6 : mini ? 3.8 : 3.2)) {
              e.vT = 0;
              const n = (mini ? 7 : 10) + (phase === 2 ? 4 : 0);
              const off = rand(0, TAU);
              for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU + off;
                S.ebullets.push({
                  kind: 'drop', red: true,
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
              if (S.enemies.length < broodCap + 8) {
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
              S.telgs.push({ e, kind: 'line', len: mini ? 300 : 360, life: 0.55, maxLife: 0.55 });
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

    /* soft separation so enemies don't stack — a uniform spatial
       hash keeps it near O(n): at a flood's 150-beast ceiling the
       old all-pairs scan cost ~11k pair checks per substep, twice
       a frame. Same pushes, same strengths, same behavior. */
    const SEP = 84;   /* >= the widest beast's diameter */
    const grid = new Map();
    const list = S.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e._si = i;
      const key = (Math.floor(e.x / SEP) + 16384) * 33554432 + (Math.floor(e.y / SEP) + 16384);
      const arr = grid.get(key);
      if (arr) arr.push(e); else grid.set(key, [e]);
    }
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const gx = Math.floor(a.x / SEP), gy = Math.floor(a.y / SEP);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const arr = grid.get((gx + ox + 16384) * 33554432 + (gy + oy + 16384));
          if (!arr) continue;
          for (let m = 0; m < arr.length; m++) {
            const b = arr[m];
            if (b._si <= a._si) continue;   /* each pair once, array order kept */
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
      }
    }

    /* contact damage */
    if (S.invulnT <= 0) {
      for (const e of S.enemies) {
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.r + p.r - 2;
        if (dx * dx + dy * dy < rr * rr) {
          /* the smother's grip: its touch weighs the brush down */
          if (e.type === 'smother' && S.playerSlowT <= 0.35) {
            S.playerSlowT = 1.2;
            S.popups.push({ x: p.x, y: p.y - 20, txt: '纏', life: 0.7, max: 0.7 });
          }
          takeHit(); break;
        }
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
    const st = S.stats;
    const as = areaStateFor(st.wave);
    const cap = CFG.wave.concurrentCap(as.waveInLevel, as.depth);
    const alive = S.enemies.length + S.markers.length;
    if (S.spawnTimer <= 0 && S.markers.length < 6 && alive < cap) {
      const group = Math.min(CFG.wave.groupSize(as.waveInLevel, as.depth), S.queue.length, cap - alive);
      if (S.spawnPattern === 'ring') {
        /* a ring closes around the brush — the surge encircles */
        const off = Math.random() * Math.PI * 2;
        for (let i = 0; i < group; i++) {
          const type = S.queue.pop();
          const a = off + (i / group) * Math.PI * 2;
          const pad = CFG.world.spawnPad;
          const ax = Math.abs(Math.cos(a)) > 1e-4 ? (S.W / 2 + pad) / Math.abs(Math.cos(a)) : Infinity;
          const ay = Math.abs(Math.sin(a)) > 1e-4 ? (S.H / 2 + pad) / Math.abs(Math.sin(a)) : Infinity;
          const t2 = Math.min(ax, ay) + rand(20, 110);
          S.markers.push({ type, x: S.player.x + Math.cos(a) * t2, y: S.player.y + Math.sin(a) * t2, t: 0.62 });
        }
      } else if (S.spawnPattern === 'flood') {
        /* two opposite banks empty themselves into the page */
        const side = (Math.floor(st.time * 0.5) % 2) * 2;
        for (let i = 0; i < group; i++) {
          const type = S.queue.pop();
          const pt = edgePoint(side + (i % 2));
          S.markers.push({ type, x: pt.x, y: pt.y, t: 0.62 });
        }
      } else {
        const sides = shuffle([0, 1, 2, 3]); /* flank: spread each group around the brush */
        for (let i = 0; i < group; i++) {
          const type = S.queue.pop();
          const pt = edgePoint(sides[i % 4]);
          S.markers.push({ type, x: pt.x, y: pt.y, t: 0.62 });
        }
      }
      S.spawnTimer = CFG.wave.groupInterval(as.waveInLevel);
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
    /* boss telegraphs die with their moment — or with their beast */
    for (let i = S.telgs.length - 1; i >= 0; i--) {
      const tg = S.telgs[i];
      tg.life -= dt;
      if (tg.life <= 0 || !tg.e || tg.e.dead || tg.e.hp <= 0) S.telgs.splice(i, 1);
    }
    /* the red wash across the eye bleeds out */
    if (S.redFlash > 0) S.redFlash = Math.max(0, S.redFlash - dt * 1.35);
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
    buildHitGrid();   /* one hash per substep; every seeking stroke reads it */
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

    /* the red beast's seal, worn on the top of the sheet */
    let boss = null;
    for (const e of S.enemies) if (ENEMIES[e.type].boss) { boss = e; break; }
    if (!boss) {
      for (const m of S.markers) if (m.boss) { boss = { name: ENEMIES[m.type].name, marker: true, keeper: ENEMIES[m.type].boss === 2 }; break; }
    }
    const asBar = areaStateFor(st.wave);
    if (boss && !boss.marker) {
      const bdef = ENEMIES[boss.type];
      UI.setBoss(bdef.name, boss.hp / boss.maxHp,
        bdef.boss === 2 ? '守 KEEPER — SCENE ' + asBar.level : '守 GUARDIAN — SHEET ' + asBar.area.id);
    }
    else if (boss && boss.marker) UI.setBoss(boss.name, 1, boss.keeper ? '守 KEEPER — SCENE ' + asBar.level : '守 GUARDIAN — SHEET ' + asBar.area.id);
    else UI.setBoss(null);

    const remaining = S.queue.length + S.markers.length + S.enemies.length;
    UI.setProgress(S.waveInitial ? 1 - remaining / S.waveInitial : 1);

    if (S.waveActive && remaining === 0) {
      S.waveActive = false;
      S.clearedT = 0.7;
      /* if the seal earned a pick and a mote-upgrade steals the screen,
         the pick is still owed — remember it */
      S.pendingSeal = areaStateFor(st.wave).isLevelEnd;
      /* the seal breaks — cry the scene complete before the counter
         climbs, so a new level never reads as the wave restarting */
      if (S.pendingSeal) {
        const asNow = areaStateFor(st.wave);
        UI.sealBanner(asNow.area, asNow.level);
        /* the journey's choice waits for the cry to finish —
           the banner speaks, then the hand is asked */
        if (S.runMode === 'journey') S.clearedT = 2.15;
      }
      /* the paper drinks its ink — every mote flies home */
      S.vacuum = true;
    }
    if (!S.waveActive && S.clearedT > 0) {
      S.clearedT -= dt;
      if (S.clearedT <= 0) {
        S.vacuum = false;
        const as = areaStateFor(st.wave);
        /* the fifth sheet, washed clean — the scroll ends on film */
        if (S.runMode === 'journey' && st.wave >= CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea * AREAS.length) {
          if (S.reduced) { showOver(true); return; }
          S.mode = 'cutscene';
          UI.hud(false);
          UI.show(null);
          CUT.start('finale', {});
        } else if (as.isLevelEnd) {
          /* the journey stops at the broken seal: onward naked, or home.
             (the endless scroll never rests — its seal still owes a stroke) */
          if (S.runMode === 'journey') showLevelClear();
          else openUpgrade('wave');
        } else {
          /* the next wave of the level follows on the same page */
          startWave(st.wave + 1);
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
     a few light spirits drift through the valley band below the
     ring — faint, slow, part of the landscape rather than noise */
  function initAttract() {
    S.idle = [];
    const types = ['pulse', 'dart', 'spit', 'split', 'moth', 'wraith'];
    for (let i = 0; i < 5; i++) {
      const type = types[Math.floor(rand(0, types.length))];
      const r = ENEMIES[type].r * 0.62;
      const x = rand(-420, 420);
      const y = rand(70, 300);
      const ang = rand(0, 6.28);
      const sp = rand(9, 19);
      S.idle.push({
        type, r,
        x, y,
        vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.5,
        ang, t: rand(0, 10), hitFlash: 0, state: 'cruise', seed: rand(0, 6.28),
      });
    }
  }

  function updateIdle(dt) {
    for (const d of S.idle) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.t += dt;
      d.ang += dt * 0.25;
      /* the valley keeps them: a soft pull home, a band they don't leave */
      if (d.x > 460) d.vx -= 30 * dt; else if (d.x < -460) d.vx += 30 * dt;
      if (d.y > 330) d.vy -= 34 * dt; else if (d.y < 46) d.vy += 34 * dt;
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 22) { d.vx *= 22 / sp; d.vy *= 22 / sp; }
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
    startRun, continueEndless, abandon, deploy, pickAt, clearNext, clearHome,
    update, updateDying, updateIdle, initAttract,
    getBest, getRuns, getFurthest, getUnlocked, getCleared, getProg, getSeals, frontierLevel, getBrush, setBrush,
  };
})();
