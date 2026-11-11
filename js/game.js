'use strict';
/* ============================================================
   ONE MORE — game core: state, areas, waves, entities, weapons
   The world is an unbounded sheet of paper; the camera follows
   the brush. Three scrolls of ten waves, then the endless sheet.
   ============================================================ */

const G = (() => {
  /* ---- the seeded hand: a daily sheet deals the SAME paper to every
   scribe on Earth. Outside the daily, RNG is Math.random and the paper
   stays as wild as ever. Gameplay rolls (spawns, drops, crits, upgrade
   shuffles) all pour through RNG; pure ink-noise keeps Math.random. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let RNG = Math.random;
const rand = (a, b) => a + RNG() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* QA hooks (hidden): ?wave=N starts mid-journey, &power=N seeds a build.
     For testing the deep sheets, the Guardians and the ending on film. */
  let qaWave = 0, qaPower = 0, qaHard = false, qaDaily = false, qaDay = '', qaGod = false, qaCharms = -1;
  let qaScenes = -1;   /* ?scenes=N — probe the sealed-brush gate without sealing scenes */
  try {
    const q = new URLSearchParams(location.search);
    qaWave = Math.max(0, Math.min(999, parseInt(q.get('wave'), 10) || 0));
    qaPower = Math.max(0, Math.min(30, parseInt(q.get('power'), 10) || 0));
    qaHard = q.get('hard') === '1';
    qaDaily = q.get('daily') === '1';
    qaDay = (q.get('day') || '').slice(0, 10);
    qaGod = q.get('god') === '1';   /* ?god=1 — the scribe cannot bleed: for probes that
                                       must outlive a wave-300 instant swarm */
    if (q.get('charms') != null) qaCharms = Math.max(0, parseInt(q.get('charms'), 10) || 0);
    if (q.get('scenes') != null) qaScenes = Math.max(0, Math.min(60, parseInt(q.get('scenes'), 10) || 0));
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
    puddles: [], spirits: [], scribes: [], stamps: [], motes: [], pickups: [],
    arcs: [], vortices: [], bolts: [], telgs: [],   /* telgs: boss attack telegraphs */
    rec: null,          /* the ghost's scribe: this run, stroke by stroke */
    ghost: null,        /* a past run's echo, walking beside the brush */
    stainQueue: [],
    queue: [], waveInitial: 0, waveActive: false, spawnTimer: 0, clearedT: 0,
    spawnPattern: 'flank',           // flank | ring | flood — the wave's shape
    levelMarks: [],                  // the painter's scene inscriptions, one per level
    inklings: [],                    // small brush accents laid down at each wave

    invulnT: 0, adrenT: 0, shake: 0, dyingT: 0, novaT: 0, clockT: 0,
    playerSlowT: 0,               /* the smother's grip: the brush wades slow */
    arrived: false, washStamp: false,
    fanT: 1.2, spiritT: 1.6, hankoT: 1.6, trailT: 0, wakeT: 0, castN: 0,
    arcT: 2.0, boomerT: 1.5, vortexT: 3.0,
    combo: 0, comboT: 0, hitstop: 0, magnetT: 0, pendingSeal: false,
    pendingLevels: 0, pendingChests: 0, upKind: 'wave', vacuum: false,
    choices: [], selected: null,

    brush: 'needle',
    hardMode: false,               /* REALLY HARD — the red toggle */
    beginT: 0,                     // the opening wash of a run
    landscapeWave: 0,              // how far the sheet is painted
    waveRevealT: 0,                // when the newest layer was inked
    joy: null,
    inputVec: { x: 0, y: 0 },
  };

  /* ---------------- starting brushes ----------------
     Three honest starters from the first stroke; four sealed
     brushes wake as the journey's scenes are SEALED — a scene
     seals when its Keeper falls on the tenth wave. The count is
     the key; the title's cards show the lid. */
  const getBrush = () => store.get('om_brush_v1', 'needle');
  /* the sheet's ink by CHOICE (v19): 'auto' wears the highest unlocked
     scroll's ink; any named theme pins the paper to itself */
  const THEME_KEYS = ['auto', 'pale', 'dark', 'red', 'storm', 'gilt', 'silk'];
  const getThemeSetting = () => {
    const v = store.get('om_theme_v1', 'auto');
    return THEME_KEYS.indexOf(v) >= 0 ? v : 'auto';
  };
  function setThemeSetting(v) {
    if (THEME_KEYS.indexOf(v) < 0) return;
    store.set('om_theme_v1', v);
    /* the render loop re-tunes the ink every frame from
       activeThemeKey(), so the title re-wears its paper at once */
  }
  /* every scene the journey has sealed, all sheets together —
     a sheet counts at most its ten scenes */
  function scenesSealed() {
    if (qaScenes >= 0) return qaScenes;
    const s = getSeals();
    let n = 0;
    for (let sheet = 1; sheet <= AREAS.length; sheet++) {
      n += Math.min(s[sheet] || 0, CFG.wave.levelsPerArea);
    }
    return n;
  }
  function brushUnlocked(id) {
    const b = CFG.brushes[id];
    return !!b && (!b.unlock || scenesSealed() >= b.unlock);
  }
  function setBrush(id) {
    if (!CFG.brushes[id]) return;
    if (!brushUnlocked(id)) return;   /* a sealed brush does not take the hand */
    S.brush = id;
    store.set('om_brush_v1', id);
  }

  /* REALLY HARD — the title's red toggle, remembered on this device.
     A hard page bites: taller beasts, faster beasts, thicker waves —
     and the ledger pays double for every stroke that survives it. */
  const getHard = () => !!store.get('om_hard_v1', false);
  function setHard(v) {
    S.hardMode = !!v;
    store.set('om_hard_v1', !!v);
  }
  S.hardMode = getHard();

  /* ---------------- the ink purse (符) — v8.8 ----------------
     what the runs press out, kept between runs. om_charms_v1
     carries the ink, every charm's rank, and the one-time feats
     (the six sheets signed). The settings room's WIPE already
     sweeps every om_* key — the purse empties with the rest. */
  const CHARMS_KEY = 'om_charms_v1';
  function charmsSave() {
    const c = store.get(CHARMS_KEY, null);
    return c && typeof c === 'object'
      ? { ink: c.ink | 0, earned: c.earned | 0, lv: c.lv || {}, feats: c.feats || {} }
      : { ink: 0, earned: 0, lv: {}, feats: {} };
  }
  const getInk = () => charmsSave().ink;
  function setInk(n) {   /* QA probe: ?charms=1 seeds the purse */
    const c = charmsSave(); c.ink = Math.max(0, n | 0);
    store.set(CHARMS_KEY, c);
  }
  const charmLv = id => (charmsSave().lv[id] || 0);
  if (qaCharms >= 0) setInk(qaCharms);   /* ?charms=N — seed the purse for probes */
  const charmRankCount = () => Object.values(charmsSave().lv).reduce((a, b) => a + (b | 0), 0);
  /* v20 THE SEALED LADDER: the scrolls gate the board. The highest
     sheet the journey has unrolled caps every charm — the first
     scroll sells three ranks of anything, and every unrolled scroll
     opens one more (2 + unlocked). A rank beyond the cap cannot be
     bought, whatever the purse holds. */
  const charmCap = () => 2 + getUnlocked();
  function buyCharm(id) {
    const def = CHARMS.find(c => c.id === id);
    if (!def) return false;
    const c = charmsSave();
    const rank = c.lv[id] || 0;
    if (rank >= def.cost.length) return false;
    if (rank + 1 > charmCap()) return false;   /* the scroll keeps it sealed */
    const price = def.cost[rank];
    if ((c.ink | 0) < price) return false;
    c.ink -= price; c.lv[id] = rank + 1;
    store.set(CHARMS_KEY, c);
    return true;
  }
  /* the earned line: waves pressed into drops, sheet-falls and the
     victory feat ride on top, the multipliers press deeper. paid
     marks what this run already surrendered (a continued run —
     the finale's endless sheet — pays only its further waves). */
  function inkForRun(cleared, paid, opts) {
    const E = CFG.charmEarn;
    let sum = 0;
    for (let w = paid + 1; w <= cleared; w++) sum += E.perWave * (w > E.loopFrom ? E.loopMult : 1);
    if (sum <= 0 && !(opts.victory && !opts.victoryPaid)) return 0;
    sum += (Math.floor(cleared / 100) - Math.floor(paid / 100)) * E.sheetFall;
    /* THE SCHOLAR: study pays — every wave presses a tenth deeper per rank */
    sum *= 1 + 0.1 * charmLv('scholar');
    if (opts.practice) {
      sum *= E.practiceMult;                    /* practice presses a fifth */
    } else {
      if (opts.hard) sum *= E.hardMult;
      if (opts.best) sum *= E.bestMult;
    }
    if (opts.victory && !opts.victoryPaid) sum += E.victoryFeat;
    return Math.round(sum);
  }

  function freshStats() {
    const bdef = CFG.brushes[S.brush] || {};
    const bm = bdef.mods || {};
    const ret = {
      fireCdMult: 1, dmg: 1, shots: 1,
      pierce: 0, moveMult: bm.moveMult || 1,
      maxHp: CFG.player.hp + (bm.maxHp || 0), hp: CFG.player.hp + (bm.maxHp || 0),
      bulletSpeedMult: 1,
      adren: 0, shock: false, levels: {},
      echo: 0, orb: 0, nova: 0, slow: 0, crit: 0, ward: false, wardCd: 0,
      fan: 0, trailW: 0, spirit: 0, hanko: 0, arc: 0, boomer: 0, vortex: 0,
      magnet: 0, mends: 0, well: 0, mendsT: 0, critC: 0,
      /* the brush's own arts (v19) — one track, one hand */
      nrain: 0, ndeep: 0, nsilk: 0, bwide: 0, bbrist: 0, bwet: 0,
      sshat: 0, squake: 0, sbould: 0, wtwin: 0, whaunt: 0,
      fbloom: 0, fgale: 0, fedge: 0,
      nrip: 0, nswell: 0, nunder: 0, nspring: 0,
      htwin: 0, hbroad: 0, hpress: 0, hrain: 0,
      ssecond: 0, sswift: 0, slong: 0, swake: 0, sdeep: 0,
      /* the stone's own charms: THE FIRST STROKE / THE SWIFT HAND */
      firststroke: 0, swiftbrush: 0,
      xp: 0, xpLevel: 0,
      score: 0, kills: 0, time: 0, wave: 0,
    };
    /* ONE BRUSH, ONE BLADE: the brush's born power wakes at rank 1 —
       the Wisp's spirit, the Fan's gust, the Tide's surge, the Red
       Seal's stamp, the Scribe's living stroke */
    ret.spirit = bm.spirit || 0;
    ret.fan = bm.fan || 0;
    ret.nova = bm.nova || 0;
    ret.hanko = bm.hanko || 0;
    ret.scribe = bm.scribe || 0;
    /* the charms ride every fresh page — journey, endless, daily,
       the shelf's resumed scenes, the ONE MORE retry, all of them */
    applyCharms(ret);
    return ret;
  }

  function applyCharms(st) {
    const lv = charmsSave().lv;
    for (const c of CHARMS) {
      const n = lv[c.id] | 0;
      for (let i = 0; i < n; i++) c.apply(st);
    }
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
      S.popups.push({ x: S.player.x, y: S.player.y - 22, txt: 'INK RISES', life: 1.1, max: 1.1, red: true });
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

  /* ---------------- the daily sheet ----------------
     one seeded endless paper per day; the first sheet a device
     walks is the one that counts and may post to the ledger —
     every sheet after it is practice against today's ink. */
  const DAILY_KEY = 'om_daily_v1';
  const dayKey = (d = new Date()) =>
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const seedOf = (key) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  function dailyLabel(key) {
    const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(key || '');
    return m ? MONTHS[+m[1] - 1] + ' ' + (+m[2]) : 'TODAY';
  }
  function dailyState() {
    const day = qaDay || dayKey();
    const rec = store.get(DAILY_KEY, null);
    const mine = rec && rec.day === day ? rec : null;
    return { day, label: dailyLabel(day), played: !!mine,
             wave: mine ? mine.wave | 0 : 0, score: mine ? mine.score | 0 : 0, hard: mine ? !!mine.hard : false };
  }

  /* ---------------- persistence ---------------- */
  /* a corrupt save must never NaN its way into charmCap or the frontier:
     wrong-typed values fall back to their defaults here, in one place */
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : null;
  const getBest = () => obj(store.get('om_best_v1', null));
  const getRuns = () => num(store.get('om_runs_v1', 0)) || 0;
  /* the shelf of scrolls: what is unrolled, what lies finished.
     om_unlocked_v1 — the highest sheet the journey may enter (1-based).
     om_cleared_v1  — the highest sheet whose Guardian has fallen.
     om_prog_v1     — per sheet, the deepest level the brush has reached. */
  const getUnlocked = () => Math.max(1, num(store.get('om_unlocked_v1', 1)) || 1, num(store.get('om_furthest_v1', 1)) || 1);
  function setUnlocked(n) { if (n > getUnlocked()) store.set('om_unlocked_v1', n); }
  const getCleared = () => num(store.get('om_cleared_v1', 0)) || 0;
  function setCleared(n) { if (n > getCleared()) store.set('om_cleared_v1', n); }
  const getProg = () => obj(store.get('om_prog_v1', {})) || {};
  function noteLevel(sheet, level) {
    const p = getProg();
    if ((p[sheet] || 0) < level) { p[sheet] = level; store.set('om_prog_v1', p); }
  }
  /* om_seal_v1 — per sheet, the deepest scene whose seal was pressed
     (a scene may be entered without ever being sealed — the fall sees
     to that — and the shelf must tell the two apart) */
  const getSeals = () => obj(store.get('om_seal_v1', {})) || {};
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
  /* the kit a scene hands the brush when the shelf sends it back:
     a run that far would carry roughly half its depth in picks, plus
     one — the same rule the shelf prints on every walkable strip, so
     the choice is made with open eyes */
  function checkpointPower(sheet, level) {
    return 1 + Math.floor(((sheet - 1) * CFG.wave.levelsPerArea + (level - 1)) / 2);
  }
  /* legacy name — the title's continue door reads the unlocked shelf */
  const getFurthest = getUnlocked;

  /* ---------------- helpers ---------------- */
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(RNG() * (i + 1));
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
    const themeIdx = S.runMode !== 'journey'
      ? cycle % AREAS.length
      : Math.min(cycle, AREAS.length - 1);
    const area = AREAS[themeIdx];
    let hp = area.mult.hp, sp = area.mult.sp, budget = area.mult.budget;
    /* the climb inside a sheet: each level presses harder than the last,
       so a sheet's tenth level always bites far harder than its first */
    hp *= CFG.wave.levelHp(level);
    budget *= CFG.wave.levelBudget(level);
    if (S.runMode !== 'journey' && cycle >= AREAS.length) {
      const k = cycle - (AREAS.length - 1);
      hp *= Math.pow(CFG.endless.hpGrowth, k);
      sp *= Math.pow(CFG.endless.spGrowth, k);
      budget *= Math.pow(CFG.endless.budgetGrowth, k);
    }
    /* REALLY HARD: every multiplier bites deeper — the paper's own
       pressure climbs with the road, so the toggle rides on top of
       whatever sheet, level or loop the brush stands on */
    if (S.hardMode) {
      hp *= CFG.hard.hp;
      sp *= CFG.hard.sp;
      budget *= CFG.hard.budget;
    }
    const depth = (S.runMode === 'journey' ? Math.min(cycle, AREAS.length - 1) : cycle)
      * CFG.wave.levelsPerArea + (level - 1);
    const isLevelEnd = waveInLevel === CFG.wave.wavesPerLevel;
    const isGuardianWave = isLevelEnd && level === CFG.wave.levelsPerArea;
    const isSurge = !isLevelEnd && CFG.wave.surgeWaves.indexOf(waveInLevel) >= 0;
    return { cycle, level, waveInLevel, themeIdx, area, hp, sp, budget, depth,
             isLevelEnd, isGuardianWave, isSurge, isElite: isLevelEnd };
  }

  /* the bounded page: THE JOURNEY and the daily sheet live inside a
     fixed arena — the same paper on every screen. THE ENDLESS SCROLL
     alone keeps the unbroken sheet. */
  function arenaOn() { return S.runMode === 'journey' || S.runMode === 'daily'; }
  function clampArena(o, pad) {
    const A = CFG.world.arena;
    const ix = A.w / 2 - pad, iy = A.h / 2 - pad;
    if (o.x < -ix) o.x = -ix; else if (o.x > ix) o.x = ix;
    if (o.y < -iy) o.y = -iy; else if (o.y > iy) o.y = iy;
  }

  /* a birth point just past the edge of the eye — measured to the
     view RECTANGLE, so spawns always land off-screen on every side.
     On a bounded page the beasts walk in from the page's own margin,
     never closer to the brush than the margin's honest distance. */
  function edgePoint(sideHint) {
    if (arenaOn()) {
      const A = CFG.world.arena, gap = CFG.world.arenaSpawnGap;
      const ix = A.w / 2 - 64, iy = A.h / 2 - 64;
      let best = null, bestD = -1;
      for (let tries = 0; tries < 12; tries++) {
        const side = (sideHint != null && tries < 3) ? sideHint : (Math.random() * 4) | 0;
        let x, y;
        if (side === 0) { x = ix; y = rand(-iy, iy); }       /* east */
        else if (side === 1) { x = rand(-ix, ix); y = iy; }  /* south */
        else if (side === 2) { x = -ix; y = rand(-iy, iy); } /* west */
        else { x = rand(-ix, ix); y = -iy; }                 /* north */
        const d = Math.hypot(x - S.player.x, y - S.player.y);
        if (d >= gap) return { x, y };
        if (d > bestD) { bestD = d; best = { x, y }; }
      }
      return best;
    }
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
    /* the fx budget: past the soft cap every burst thins, past the
       hard cap the oldest flecks are recycled — the storm keeps its
       look and can never bury the frame (v8.2 perf sweep) */
    const over = S.particles.length - CFG.fx.softCap;
    let n = big ? 26 : Math.round(clamp(r, 6, 14)) + 4;
    if (over > 0) n = Math.max(1, Math.round(n * Math.max(0.15, 1 - over / CFG.fx.particleCap)));
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
    const excess = S.particles.length - CFG.fx.particleCap;
    if (excess > 0) S.particles.splice(0, excess);
  }

  /* ---------------- enemies ---------------- */
  function spawnEnemy(type, x, y, opts = {}) {
    const def = ENEMIES[type];
    const w = S.stats.wave;
    const st = areaStateFor(w);
    let hp, r = def.r;
    if (def.boss === 2) {
      /* keepers: area and level pressure, a growth that follows the
         scribe's real power, and the boss-ink levy on top */
      hp = def.hp * st.hp *
        Math.min(CFG.keeper.hpGrowCap, 1 + CFG.keeper.hpGrow * Math.max(0, w - def.intro)) *
        CFG.boss.keeperHp;
    } else if (def.boss === 1) {
      /* Guardians: the same sheet pressure, then the full boss levy —
         the sheet's closing duel is the longest stroke on the page */
      hp = CFG.wave.hpScale(def.hp, w, def.intro) * st.hp * CFG.boss.hp;
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
    /* the reseal's first death only re-presses the stamp — it walks
       again at less than half its ink, and only the second stroke ends it */
    if (e.type === 'reseal' && !e.rose) {
      e.rose = true;
      e.dead = false; e._killed = false;
      e.hp = Math.max(1, Math.round(e.maxHp * 0.45));
      e.hitFlash = 0.25;
      S.enemies.push(e);
      S.rings.push({ x: e.x, y: e.y, max: e.r * 3.2, life: 0.5, maxLife: 0.5, red: true });
      S.popups.push({ x: e.x, y: e.y - e.r - 10, txt: 'RESTAMPED', life: 1.0, max: 1.0, red: true });
      SFX.elite();
      return;
    }
    e.dead = true;
    e._killed = true;
    const def = ENEMIES[e.type];
    const isBoss = !!def.boss;
    const mult = 1 + 0.15 * Math.max(0, S.stats.wave - 1);
    /* the chain: each kill within the breath of the last feeds the score */
    S.combo++;
    S.comboT = CFG.combo.decay;
    const pts = Math.round((def.score * mult * (e.elite ? 6 : 1) * comboMult() *
      (S.hardMode ? CFG.hard.score : 1)) / 5) * 5;
    S.stats.score += pts;
    S.stats.kills++;
    UI.setScore(S.stats.score);
    UI.setCombo(S.combo, comboMult());
    S.popups.push({
      x: e.x, y: e.y - e.r - 4,
      txt: isBoss ? def.name + ' +' + pts : e.elite ? 'GUARDIAN +' + pts : def.captain ? 'CAPTAIN +' + pts : '+' + pts,
      life: isBoss || e.elite || def.captain ? 1.4 : 0.7, max: isBoss || e.elite || def.captain ? 1.4 : 0.7, red: e.elite || isBoss || def.captain,
    });
    const keeper = isBoss && def.boss === 2;
    burst(e.x, e.y, e.r, isBoss || e.type === 'titan' || e.elite, isBoss);
    S.stainQueue.push({
      x: e.x, y: e.y, r: e.r * (isBoss ? 3 : e.elite ? 2.2 : 1.45),
      alpha: isBoss ? 0.65 : e.elite ? 0.6 : 0.5,
      red: isBoss || e.elite || e.type === 'oni',
    });
    if (isBoss || e.type === 'slab' || e.type === 'titan' || e.type === 'oni' || e.type === 'golem' || e.elite || def.captain || e.type === 's_nest' || e.type === 's_toller') SFX.bigKill(); else SFX.kill();
    /* hit-stop: the paper holds its breath on the heavy strokes */
    if (!S.reduced) {
      if (isBoss) S.hitstop = Math.max(S.hitstop, keeper ? 0.2 : 0.27);
      else if (e.elite || def.captain || e.type === 'titan' || e.type === 'golem' || e.type === 's_nest') S.hitstop = Math.max(S.hitstop, 0.09);
      else if (e.type === 'slab' || e.type === 'oni') S.hitstop = Math.max(S.hitstop, 0.045);
    }
    if (e.elite || isBoss || def.captain) { S.shake = Math.max(S.shake, isBoss ? (keeper ? 15 : 19) : def.captain ? 10 : 9); }
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
      /* the keeper's hoard: a flush of ink and a flask of clean water
         (an echo of the Assembly pays a thinner hoard — the sheet
         itself pays the full one) */
      if (keeper) {
        const n = e.echo ? 5 : 10;
        for (let i = 0; i < n; i++) dropMote(e.x + rand(-26, 26), e.y + rand(-26, 26), moteValue(4), 2);
        if (!e.echo) dropPickup('pot', e.x + rand(-20, 20), e.y + rand(-20, 20));
      } else {
        for (let i = 0; i < 14; i++) dropMote(e.x + rand(-30, 30), e.y + rand(-30, 30), moteValue(4), 2);
        dropPickup('pot', e.x + rand(-24, 24), e.y + rand(-24, 24));
        dropPickup('chest', e.x, e.y);
      }
      /* the sheet's seal breaks: the scroll is finished, and the next
         scroll unrolls — on film AFTER the Assembly falls (the echoes
         must die first; the unroll waits at S.pendingUnroll for the
         wave to empty), by banner cry when the hand asks for stillness */
      if (S.runMode === 'journey') {
        const per = CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea;
        const sheet = Math.floor((S.stats.wave - 1) / per) + 1;
        const asNow = areaStateFor(S.stats.wave);
        /* only the GUARDIAN's own fall may press the seal — a keeper
           or an Assembly echo dying on this wave never credits a sheet */
        if (asNow.isGuardianWave && def.boss === 1 && sheet > getCleared()) {
          setCleared(sheet);
          const next = AREAS[sheet] || null;   /* sheet is 1-based; AREAS[sheet] is the next */
          if (next) {
            setUnlocked(sheet + 1);
            if (!S.reduced) {
              /* the unroll waits: the echoes must fall first — the
                 sheet seals only when the arena stands empty */
              S.pendingUnroll = { area: asNow.area, next };
            }
            else UI.unlockBanner(asNow.area, next, false);
          }
          else UI.unlockBanner(asNow.area, null, true);
        }
      }
      UI.bossFalls(def.name, def.boss === 2);
    } else if (e.elite) {
      for (let i = 0; i < 7; i++) dropMote(e.x + rand(-20, 20), e.y + rand(-20, 20), moteValue(3), 2);
    } else {
      dropMote(e.x, e.y, moteValue(tier === 2 ? 4 : tier === 1 ? 2 : 1), tier);
      /* rare talismans from the heavy bodies */
      const heavy = e.type === 'slab' || e.type === 'titan' || e.type === 'oni' || e.type === 'golem' || def.captain;
      if (heavy && RNG() < 0.05) dropPickup('pot', e.x, e.y);
      else if (RNG() < 0.006) dropPickup('magnet', e.x, e.y);
      else if (RNG() < 0.006) dropPickup('bomb', e.x, e.y);
    }

    /* ---- the officers' fall: the rank breaks with them ---- */
    if (def.captain) {
      /* the banner drops: a breath of stillness for every beast that marched under it */
      const R2 = CFG.captain.deathR * CFG.captain.deathR;
      let felled = 0;
      for (const o of S.enemies) {
        const dx = o.x - e.x, dy = o.y - e.y;
        if (dx * dx + dy * dy <= R2 && !ENEMIES[o.type].boss) {
          o.stun = Math.max(o.stun, CFG.captain.deathStun);
          felled++;
        }
      }
      S.rings.push({ x: e.x, y: e.y, max: CFG.captain.deathR * 1.35, life: 0.5, maxLife: 0.5, red: true });
      if (felled > 0) S.popups.push({ x: e.x, y: e.y - e.r - 20, txt: 'THE RANK BREAKS', life: 1.0, max: 1.0, red: true });
      /* the captain's purse: officers pay better than the rank */
      for (let i = 0; i < 4; i++) dropMote(e.x + rand(-18, 18), e.y + rand(-18, 18), moteValue(3), 2);
    }
    /* the nest bursts — its last brood scatters */
    if (e.type === 's_nest') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(-0.3, 0.3);
        const c = spawnEnemy('gnat', e.x + Math.cos(a) * (e.r + 6), e.y + Math.sin(a) * (e.r + 6));
        c.kbx = Math.cos(a) * 210; c.kby = Math.sin(a) * 210;
      }
      S.popups.push({ x: e.x, y: e.y - e.r - 8, txt: 'THE BROOD SCATTERS', life: 0.9, max: 0.9 });
    }
    /* the ledger spills what it taxed back onto the paper */
    if (e.type === 's_ledger' && (e.ate || 0) > 0) {
      const back = Math.min(10, Math.ceil(e.ate / 2));
      for (let i = 0; i < back; i++) dropMote(e.x + rand(-22, 22), e.y + rand(-22, 22), moteValue(2), 1);
      S.popups.push({ x: e.x, y: e.y - e.r - 8, txt: 'THE TAX REFUNDED', life: 0.9, max: 0.9, red: true });
    }
    /* the sizing bursts — a puddle of glue soaks the hand's road */
    if (e.type === 'sizing') {
      S.puddles.push({ x: e.x, y: e.y, r: 62, life: 4.2, max: 4.2, tickT: 9, seed: (RNG() * 1e9) | 0, hostile: 1 });
      S.popups.push({ x: e.x, y: e.y - e.r - 8, txt: 'THE GLUE SPILLS', life: 0.8, max: 0.8 });
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
    if (e.type === 'crest') {
      /* the crest breaks — two gusts scatter out of the foam */
      for (const s of [-1, 1]) {
        const c = spawnEnemy('gale', e.x + s * 12, e.y + rand(-6, 6));
        c.kbx = s * 220; c.kby = rand(-80, 80);
      }
      S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.5, alpha: 0.38 });
    }
    if (e.type === 'cask') {
      /* the cask shatters — its hoard of coin-spirits scatters, worth the chase */
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + rand(-0.3, 0.3);
        const c = spawnEnemy('koban', e.x + Math.cos(a) * 14, e.y + Math.sin(a) * 14);
        c.kbx = Math.cos(a) * 240; c.kby = Math.sin(a) * 240;
      }
      S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.6, alpha: 0.42 });
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
      if (RNG() < 0.22) dropPickup('pot', e.x, e.y);
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

  function nearestEnemy(x, y, maxD, not) {
    const p = (x == null) ? S.player : { x, y };
    let best = null, bd = maxD != null ? maxD * maxD : Infinity;
    for (const e of S.enemies) {
      if (e.faint) continue;   /* the underdrawing is not there to aim at */
      if (not && e === not) continue;   /* RED RAIN: a different body for the second seal */
      const dx = e.x - p.x, dy = e.y - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ---------------- waves ----------------
     buildQueue(budget, wave, roster, featured, carry):
     the STANDING ARMY (v19.4) wades at seven-tenths weight — each
     paper's own newcomers lead the roll, the beasts of every sheet
     before it walk behind them, and the debut beast still reads ×3 */
  function buildQueue(budget, wave, roster, featured, carry) {
    const pool = roster.filter(k => ENEMIES[k].cost > 0 && ENEMIES[k].intro <= wave);
    const wOf = k => {
      const w = ENEMY_WEIGHTS[k] || 1;
      return (carry && carry.indexOf(k) >= 0) ? w * 0.7 : w;
    };
    const q = [];
    let guard = 0;
    while (budget > 0 && guard++ < 900) {
      const avail = pool.filter(k => ENEMIES[k].cost <= budget);
      if (!avail.length) break;
      let total = 0;
      for (const k of avail) {
        total += wOf(k) * (k === featured ? 3 : 1);
      }
      let r = RNG() * total, pick = avail[0];
      for (const k of avail) {
        r -= wOf(k) * (k === featured ? 3 : 1);
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
    const ik = (S.inkKind = ((S.inkKind || 0) + 1) % 2);
    S.inklings.push({
      x: S.player.x + (((n * 73) % 17) - 8) * 34,
      y: S.player.y + (((n * 31) % 13) - 6) * 30,
      kind: ['reeds', 'crane'][ik],
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
      (as.waveInLevel === 3 || as.waveInLevel === 6) ? featured : null,
      as.area.carry);
    /* a true-debut wave: the new ink-born walks in force, not by chance */
    if (featured && ENEMIES[featured].intro === n) {
      S.queue.push(featured, featured, featured);
    }
    let elites = 0;
    S.assembly = null;
    if (as.isGuardianWave) {
      /* the Guardian of the sheet enters — a beast with a name.
         v19.1: on the tenth scene the SHEET COMES WITH IT — the
         ten seals return as echoes at three beats of the duel
         (the ASSEMBLY, run from updateAssembly below). */
      const pt = edgePoint();
      S.markers.push({ type: as.area.boss, x: pt.x, y: pt.y, t: 2.2, elite: true, boss: true });
      elites = 1;
      S.assembly = { area: as.area, fired: 0,
        beats: [{ hp: 0.72, n: 3 }, { hp: 0.45, n: 3 }, { hp: 0.2, n: 4 }] };
    } else if (as.isLevelEnd) {
      /* the seal wave is a BOSS FIGHT: the scene's OWN Keeper —
         v19.1 gives every scene its own red-sealed boss, its own
         body, ink and kit — walks the paper, a halved honor guard
         at its heels */
      const pt = edgePoint();
      const kid = as.area.keepers ? as.area.keepers[as.level - 1] : as.area.keeper;
      S.markers.push({ type: kid, x: pt.x, y: pt.y, t: 2.2, elite: true, boss: true });
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
    S.pendingUnroll = null;
    UI.setWave(as.waveInLevel);
    UI.setArea(as.area, as.level, as.waveInLevel, as.isLevelEnd);
    UI.setProgress(0);
    if (opts.quiet) return;   /* a cutscene announces this sheet — no banners */
    if (paperStart) {
      /* the scroll turns — a new sheet of paper. A run's first page
         names the run itself: THE JOURNEY — RUN 007. */
      UI.areaBanner(as.area, as.cycle, S.runMode !== 'journey' && as.cycle >= AREAS.length,
        opts.runStart ? getRuns() : 0);
      SFX.gong();
      if (opts.runStart && S.hardMode) {
        /* the red seal, cried after the run is named: a hard page
           announces itself once, then the 難 on the HUD does the talking */
        setTimeout(() => {
          if (S.mode === 'playing' && S.stats && S.stats.wave === n) UI.hardBanner();
        }, 2650);
      }
    } else if (as.waveInLevel === 1) {
      /* a new scene grows on the same page */
      UI.levelBanner(as.area, as.level, as.area.names[as.level - 1]);
      SFX.wave(true);
    } else {
      UI.banner(as.waveInLevel, as.isSurge, as.isGuardianWave ? 'guardian' : as.isLevelEnd ? 'seal' : 'wave');
      SFX.wave(as.isSurge || as.isLevelEnd);
    }
    if (as.isGuardianWave) {
      UI.bossBanner(as.area, ENEMIES[as.area.boss].name, false, as.level, as.area.boss);
      SFX.gong();
    } else if (as.isLevelEnd) {
      const kid = as.area.keepers ? as.area.keepers[as.level - 1] : as.area.keeper;
      UI.bossBanner(as.area, ENEMIES[kid].name, true, as.level, kid);
      SFX.gong();
    }
  }

  function pickUpgrades(n) {
    const st = S.stats;
    /* the shelf answers the hand: the brush's own arts ride only for
       their brush (u.for), the cast-stroke arts only for brushes that
       cast (u.proj), and no trap picks — the Paper Ward charm owns
       the ward, so its in-run pick retires while the charm rides */
    const atk = CFG.brushes[S.brush] && CFG.brushes[S.brush].atk;
    const projBrush = !!atk && (atk.kind === 'bolts' || atk.kind === 'gust');
    const avail = shuffle(UPGRADES.filter(u =>
      (st.levels[u.id] || 0) < u.max &&
      !(u.for && u.for !== S.brush) &&
      !(u.proj && !projBrush) &&
      !(u.id === 'ward' && charmLv('ward') > 0)));
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

  /* ---------------- the checkpoint kit ----------------
     The shelf's resumed scenes and the ONE MORE retry hand the brush
     a kit a run that far would carry — drawn from the STAT pool only.
     v19 law: NO WEAPON EVER ARRIVES THE HAND DID NOT PICK. The old
     fixed kit carried the Fan, the spirits, the arc and the stamp —
     which is how brushes woke mid-level wearing arms they never
     chose. The kit cycles the universal stats, so a resumed run has
     an honest base and picks its own weapons from the shelf. */
  const CHECK_KIT = ['heavy', 'rapid', 'plate', 'over', 'magnet', 'crit', 'well', 'velo', 'pierce', 'split', 'echo', 'slow'];
  function applyCheckpoint(n) {
    const atk = CFG.brushes[S.brush] && CFG.brushes[S.brush].atk;
    const projBrush = !!atk && (atk.kind === 'bolts' || atk.kind === 'gust');
    let picks = 0;
    for (let pass = 0; pass < 6 && picks < n; pass++) {
      for (const id of CHECK_KIT) {
        if (picks >= n) break;
        const def = UPGRADES.find(x => x.id === id);
        if (!def || (def.proj && !projBrush)) continue;
        if ((S.stats.levels[id] || 0) >= def.max) continue;
        def.apply(S.stats);
        S.stats.levels[id] = (S.stats.levels[id] || 0) + 1;
        picks++;
      }
    }
    S.stats.xpLevel = picks;   /* keeps the gauge honest */
  }

  /* a QA deep link (?power=N) arms the probe kit: the checkpoint
     stats first, then the learned powers a run this deep would
     carry — so the sealed sheets and Guardians stay testable
     against the curve. Never used for a player's resume. */
  const QA_KIT_POWERS = ['arc', 'orbit', 'vortex', 'boomer', 'nova', 'spirit', 'trail', 'hanko', 'fan'];
  function applyQAPower(n) {
    /* the probe kit splits: the first 60% buys stats, the rest buys
       the learned powers — a run this deep would carry both */
    applyCheckpoint(Math.ceil(n * 0.6));
    let picks = 0;
    for (const id of CHECK_KIT) picks += (S.stats.levels[id] || 0);
    for (const id of QA_KIT_POWERS) picks += (S.stats.levels[id] || 0);
    for (let pass = 0; pass < 4 && picks < n; pass++) {
      for (const id of QA_KIT_POWERS) {
        if (picks >= n) break;
        const def = UPGRADES.find(x => x.id === id);
        if (!def || (S.stats.levels[id] || 0) >= def.max) continue;
        def.apply(S.stats);
        S.stats.levels[id] = (S.stats.levels[id] || 0) + 1;
        picks++;
      }
    }
    S.stats.xpLevel = picks;
  }

  /* ---------------- the ghost ----------------
     your own best endless carry — and today's daily sheet — recorded
     as a trail of strokes and replayed as a pale echo walking beside
     the living brush. The board arms strangers' echoes too: a row
     carrying 影 lends its scribe's recording to the next race. The
     recording itself stays local ink until a PB post carries it to
     the ledger, where another hand may download it. */
  const GHOST_ENDLESS_KEY = 'om_ghost_endless_v1';
  const GHOST_DAILY_KEY = 'om_ghost_daily_v1';
  const GHOST_RIVAL_KEY = 'om_ghost_rival_v1';
  const GHOST_DT = 0.12;          /* one stroke every eighth of a breath */
  const GHOST_MAX = 14000;        /* ~28 minutes of paper, then the pen rests */

  function ghostSave(kind, stats, dayOverride) {
    try {
      const rec = S.rec;
      if (!rec || rec.frames.length < 8) return false;
      const payload = {
        score: stats.score | 0, wave: Math.max(1, stats.wave | 0),
        kills: stats.kills | 0, hard: !!S.hardMode,
        date: dayOverride || dayKey(), dt: GHOST_DT, n: rec.frames.length,
        data: rec.frames.join(';'),
      };
      localStorage.setItem(kind === 'daily' ? GHOST_DAILY_KEY : GHOST_ENDLESS_KEY, JSON.stringify(payload));
      return true;
    } catch (e) { return false; }
  }

  /* a recorded echo, unfurled — the raw payload plus whose it was */
  function ghostParse(g, name) {
    if (!g || !g.data || !g.n) return null;
    const pts = g.data.split(';').map(fr => {
      const a = fr.split(',');
      return [ +a[0], +a[1], +a[2] ];
    });
    if (pts.length < 4) return null;
    for (let k = 0; k < pts.length; k++) {
      if (!isFinite(pts[k][0]) || !isFinite(pts[k][1]) || !isFinite(pts[k][2])) return null;
    }
    return { wave: g.wave | 0, score: g.score | 0, kills: g.kills | 0, hard: !!g.hard,
             name: name || null,
             dt: g.dt || GHOST_DT, pts,
             t: 0, i: 1, x: pts[0][1], y: pts[0][2],
             dead: false, deathT: pts[pts.length - 1][0],
             deathX: pts[pts.length - 1][1], deathY: pts[pts.length - 1][2] };
  }

  /* the rival: a stranger's echo, armed from the board */
  function rivalArmed() {
    try { return JSON.parse(localStorage.getItem(GHOST_RIVAL_KEY) || 'null'); } catch (e) { return null; }
  }
  function setRival(r) {
    try {
      if (!r || !r.payload || !r.payload.data) return false;
      const daily = r.kind === 'daily';
      localStorage.setItem(GHOST_RIVAL_KEY, JSON.stringify({
        kind: daily ? 'daily' : 'endless',
        day: daily ? String(r.day || '') : '',
        name: String(r.name || 'INK DRIFTER').slice(0, 24),
        wave: Math.max(1, r.wave | 0), score: r.score | 0,
        payload: {
          wave: Math.max(1, (r.payload.wave | 0) || 1), score: r.payload.score | 0,
          kills: r.payload.kills | 0, hard: !!r.payload.hard,
          date: String(r.payload.date || ''), dt: +r.payload.dt || GHOST_DT,
          n: r.payload.n | 0, data: String(r.payload.data),
        },
      }));
      return true;
    } catch (e) { return false; }
  }

  /* the own-page payload — the turnover gate must never read the rival */
  function ghostLoadOwn(kind) {
    try {
      const raw = localStorage.getItem(kind === 'daily' ? GHOST_DAILY_KEY : GHOST_ENDLESS_KEY);
      if (!raw) return null;
      const g = JSON.parse(raw);
      if (!g || !g.data || !g.n) return null;
      if (kind === 'daily' && g.date !== dayKey()) return null;   /* yesterday's sheet haunts nobody */
      return g;
    } catch (e) { return null; }
  }

  function ghostLoad(kind) {
    try {
      if (store.get('om_ghost_off_v1', false)) return null;   /* settings: the rival rests */
      /* an armed stranger's echo walks first — an endless rival haunts
         the endless scroll; a daily rival only the day it was walked */
      const rv = rivalArmed();
      if (rv && rv.payload && rv.payload.data) {
        if (kind === 'daily') {
          if (rv.kind === 'daily' && rv.day === dayKey()) {
            const rg = ghostParse(rv.payload, rv.name);
            if (rg) return rg;
          }
        } else if (rv.kind === 'endless') {
          const rg = ghostParse(rv.payload, rv.name);
          if (rg) return rg;
        }
      }
      return ghostParse(ghostLoadOwn(kind), null);
    } catch (e) { return null; }
  }

  function ghostAdvance(dt) {
    const gh = S.ghost;
    if (!gh || gh.dead) return;
    gh.t += dt;
    const pts = gh.pts;
    while (gh.i < pts.length && pts[gh.i][0] <= gh.t) {
      gh.x = pts[gh.i][1]; gh.y = pts[gh.i][2];
      gh.i++;
    }
    if (gh.i >= pts.length) {
      gh.dead = true;
      gh.x = gh.deathX; gh.y = gh.deathY;
      return;
    }
    /* glide between the recorded strokes */
    const a = pts[gh.i - 1], b = pts[gh.i];
    const span = Math.max(0.0001, b[0] - a[0]);
    const k = Math.min(1, Math.max(0, (gh.t - a[0]) / span));
    gh.x = a[1] + (b[1] - a[1]) * k;
    gh.y = a[2] + (b[2] - a[2]) * k;
  }

  /* ---------------- flow ---------------- */
  function startRun(mode, opts = {}) {
    const prevWave = S.stats ? (S.stats.wave | 0) : 0;   /* where the last run fell */
    S.runMode = mode === 'endless' ? 'endless' : mode === 'daily' ? 'daily' : 'journey';
    /* the daily deals one fixed paper: the same seed, the same beasts,
       the same luck for every scribe who unrolls today's sheet */
    if (S.runMode === 'daily') {
      RNG = mulberry32(seedOf(dailyState().day));
      S.dailyCounting = !dailyState().played;
      S.dailyDay = dailyState().day;      /* pin the sheet: a run that crosses midnight files where it began */
    } else {
      RNG = Math.random;
      S.dailyCounting = false;
      S.dailyDay = null;
    }
    /* the ghost's scribe dips its pen: endless and daily runs record
       their strokes (the journey's scenes are too short to race) */
    S.rec = S.runMode === 'journey' ? null : { t: 0, acc: 0, frames: [] };
    S.ghost = S.runMode === 'journey' ? null : ghostLoad(S.runMode === 'daily' ? 'daily' : 'endless');
    S.brush = getBrush();
    /* a wiped shelf can strand a sealed brush on the title — the
       hand falls back to the needle rather than carry a stolen kit */
    if (!brushUnlocked(S.brush)) S.brush = 'needle';
    S.hardMode = qaHard || getHard();   /* the red toggle rides every fresh page */
    S.stats = freshStats();
    S.inkWave = 0;   /* the purse counts this run's waves from zero */
    S.bullets = []; S.ebullets = []; S.enemies = []; S.markers = []; S.telgs = [];
    S.particles = []; S.popups = []; S.rings = []; S.stainQueue = [];
    S.puddles = []; S.spirits = []; S.stamps = [];
    S.motes = []; S.pickups = []; S.arcs = []; S.vortices = []; S.bolts = [];
    S.queue = []; S.waveInitial = 0; S.waveActive = false;
    S.invulnT = 0; S.adrenT = 0; S.shake = 0; S.dyingT = 0; S.novaT = 0;
    S.fanT = 1.2; S.spiritT = 1.6; S.hankoT = 1.6; S.trailT = 0; S.wakeT = 0;
    S.arcT = 2.0; S.boomerT = 1.5; S.vortexT = 3.0;
    S.scribes = [];   /* the living strokes wake with the run */
    S.castN = 0; S.fanCasts = 0; S.hankoQueue = [];
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
    UI.setMode(S.runMode, S.runMode === 'daily' ? dailyLabel(dailyState().day) : '');
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
      /* v20 THE HONEST HAND: a resumed scene wears the STAT kit a run
         this far would carry — never the QA power kit. The old call
         handed resumed runs the learned weapons (arc, orbit, spirits,
         the fan, the stamp…) — so a brush born without projectiles
         woke firing a volley the hand never picked. NO WEAPON EVER
         ARRIVES THE HAND DID NOT PICK. */
      applyCheckpoint(checkpointPower(sheet, level));
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave((sheet - 1) * CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea +
        (level - 1) * CFG.wave.wavesPerLevel + 1, { runStart: true });
      return;
    }
    /* ONE MORE: the brush returns to the scene it fell in, not to the
       first page of the journey — the fall costs only the scene's road */
    if (opts.retry && S.runMode === 'journey' && qaWave < 1 && prevWave > 1) {
      const sheet = Math.max(1, Math.min(AREAS.length,
        Math.floor((prevWave - 1) / (CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea)) + 1));
      const clamped = Math.max(1, Math.min(frontierLevel(sheet), areaStateFor(prevWave).level));
      /* the ONE MORE retry wears the honest STAT kit too — see the
         shelf resume above; the QA kit is for ?power= probes alone */
      applyCheckpoint(checkpointPower(sheet, clamped));
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave((sheet - 1) * CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea +
        (clamped - 1) * CFG.wave.wavesPerLevel + 1);
      return;
    }
    if (qaDaily && qaWave < 1) {
      if (qaPower > 0) applyQAPower(qaPower);
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave(1, { runStart: true });
      return;
    }
    if (qaWave > 1) {
      if (qaPower > 0) applyQAPower(qaPower);
      UI.setHp(S.stats.hp, S.stats.maxHp);
      UI.setLoadout(S.stats.levels);
      UI.setXp(0, S.stats.xpLevel);
      startWave(qaWave, { runStart: true });
      return;
    }
    startWave(1, { runStart: true });
  }

  function continueEndless() {
    if (S.mode !== 'over') return;
    S.runMode = 'endless';
    UI.setMode(S.runMode);   /* a daily continue becomes an endless sheet */
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
    S.scribes.length = 0; S.hankoQueue = []; S.castN = 0; S.fanCasts = 0;
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
    S.scribes.length = 0; S.hankoQueue = []; S.castN = 0; S.fanCasts = 0;
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
    initAttract();
  }

  function deploy() {
    if (S.mode !== 'upgrade' || S.selected == null) return;
    const kind = S.upKind;
    const u = S.choices[S.selected];
    const lvBefore = u.patch ? 0 : (S.stats.levels[u.id] || 0);
    u.apply(S.stats);
    if (!u.patch) {
      S.stats.levels[u.id] = lvBefore + 1;
      /* the weapon completes itself — a maxed stroke earns its own name,
         and the paper cries it once across the sheet */
      if (u.maxSpec && lvBefore + 1 === u.max) {
        S.popups.push({ x: S.player.x, y: S.player.y - 26, txt: u.maxSpec.split(' — ')[0], life: 1.9, max: 1.9, red: true });
        S.rings.push({ x: S.player.x, y: S.player.y, max: 190, life: 0.65, maxLife: 0.65, red: true });
        S.shake = Math.max(S.shake, 5);
        SFX.elite();
      }
    }
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
    if (kind === 'wave' && nxt.level === 1 && !S.reduced && S.runMode === 'journey') {
      /* the sheet turns on film — the journey's new scroll announces
         itself. THE ENDLESS never stops for a film: its seal pays its
         stroke, the banner cries the new sheet, and the next wave
         walks on — the film would only interrupt the flow the mode
         lives for. (The area banner + gong remain: the quiet gap
         between waves is where the hand plans, and it is brief.) */
      startWave(S.stats.wave + 1, { quiet: true });
      S.mode = 'cutscene';
      UI.hud(false);
      CUT.start('scroll', {
        area: nxt.area, cycle: nxt.cycle,
        deep: S.runMode !== 'journey' && nxt.cycle >= AREAS.length,
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
    /* the daily sheet files its one true entry on the day it is walked
       (declared before the over sheet reads it — no ink before its name) */
    let dailyDay = null, dailyCounting = false;
    if (S.runMode === 'daily') {
      const ds = dailyState();
      dailyDay = S.dailyDay || ds.day; dailyCounting = !!S.dailyCounting;
      if (S.dailyCounting) {
        store.set(DAILY_KEY, {
          day: dailyDay, wave: Math.max(1, st.wave | 0), score: st.score | 0,
          kills: st.kills | 0, time: st.time || 0, hard: S.hardMode,
        });
        ghostSave('daily', st, dailyDay);   /* today's counting sheet becomes tomorrow's rival */
        if (UI.setDailyChip) UI.setDailyChip(dailyState());
      }
    } else if (S.runMode === 'endless') {
      /* the endless echo only turns over when the carry went further
         (ghostLoadOwn — an armed rival must never gate the turnover) */
      const prev = ghostLoadOwn('endless');
      if (!prev || (st.score | 0) > (prev.score | 0)) ghostSave('endless', st);
    }
    /* ---- the purse: the run presses its ink back (v8.8) ----
       death and victory alike press; a run continued past the
       finale pays only the waves it walked further. Practice
       sheets press a fifth; the ledger's double still stands. */
    let inkGain = 0, inkTotal = 0;
    {
      const cs = charmsSave();
      inkGain = inkForRun(cleared, S.inkWave | 0, {
        victory: !!victory, victoryPaid: !!cs.feats.victory,
        practice: S.runMode === 'daily' && !S.dailyCounting,
        hard: !!S.hardMode, best: !!nb,
      });
      if (inkGain > 0) {
        cs.ink = (cs.ink | 0) + inkGain;
        cs.earned = (cs.earned | 0) + inkGain;
        if (victory && !cs.feats.victory) cs.feats.victory = true;
        store.set(CHARMS_KEY, cs);
      }
      S.inkWave = cleared;
      inkTotal = cs.ink | 0;
    }
    /* the brush's last recording rides to the ledger — the echo another
       scribe may race (a death inside a breath leaves too few strokes) */
    const recPayload = S.rec && S.rec.frames.length >= 8
      ? { wave: Math.max(1, st.wave | 0), score: st.score | 0, kills: st.kills | 0,
          hard: !!S.hardMode, date: dayKey(), dt: GHOST_DT,
          n: S.rec.frames.length, data: S.rec.frames.join(';') }
      : null;
    UI.showOver({
      run: getRuns(), waves: cleared, kills: st.kills,
      time: st.time, score: st.score, rank, newBest: nb,
      mode: S.runMode, victory: !!victory, hard: S.hardMode,
      day: dailyDay, practice: S.runMode === 'daily' && !dailyCounting,
      ghost: S.ghost ? { wave: S.ghost.wave, score: S.ghost.score,
                         name: S.ghost.name || null } : null,
      ink: inkGain, inkTotal,
      charms: charmRankCount(),
    });
    UI.hud(false);
    UI.show('over');
    S.mode = 'over';
    UI.setInkLine(inkTotal);            /* the title's purse, freshly read */
    if (typeof CH !== 'undefined' && CH.refreshChip) CH.refreshChip();
    /* the endless ledger takes its entry when an endless run truly
       ends — the journey answers only to its own seals (LB is the
       ledger module; absent it, the game plays exactly as before) */
    if (typeof LB !== 'undefined' && LB.onRunEnd) {
      LB.onRunEnd({
        mode: S.runMode, victory: !!victory, hard: S.hardMode,
        wave: Math.max(1, st.wave | 0), score: st.score | 0,
        kills: st.kills | 0, time: st.time || 0,
        day: dailyDay, counting: dailyCounting,
        rec: recPayload,
      });
    }
  }

  function takeHit() {
    if (qaGod) return;   /* ?god=1 — the paper cannot be cut: probes outlive swarms */
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
  /* the folded fan: a cone of paper blades with every swing — the
     Fan brush's own weapon, or a power any hand may learn. Every
     fifth cast snaps full-circle; THE FULL BLOOM makes it every
     fourth. More blades ride the ranks, Edge Wind, and Twin Stroke. */
  function fireFan() {
    const p = S.player, st = S.stats;
    S.fanCasts = (S.fanCasts || 0) + 1;
    const fullEvery = st.fbloom ? 4 : 5;
    const fullBloom = S.fanCasts % fullEvery === 0;
    const n = CFG.fan.blades(st.fan) + (st.fedge || 0) + (st.shots - 1);
    const spread = CFG.fan.spread;
    const dmg = primaryDmg(1);
    const cast = (a, bloom) => {
      S.bullets.push({
        x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13,
        vx: Math.cos(a) * CFG.fan.speed, vy: Math.sin(a) * CFG.fan.speed,
        ang: a, dmg, hits: 2, age: 0, life: CFG.fan.life,
        kind: 'blade', spin: (Math.random() < 0.5 ? 1 : -1) * rand(9, 14),
        bloom, push: st.fgale ? 300 : 110,
      });
    };
    if (fullBloom) {
      /* THE FULL BLOOM: the fan snaps open all the way around */
      for (let i = 0; i < n * 2; i++) {
        cast((i / (n * 2)) * TAU + (S.fanCasts % 8 === 0 ? Math.PI / (n * 2) : 0), true);
      }
      S.rings.push({ x: p.x, y: p.y, max: 118, life: 0.4, maxLife: 0.4 });
      S.shake = Math.max(S.shake, 3);
    } else {
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
        cast(p.aim + off, false);
      }
    }
    SFX.fan();
  }

  function dropTrail() {
    const st = S.stats;
    const maxed = st.trailW >= 3;
    S.puddles.push({
      x: S.player.x + rand(-4, 4), y: S.player.y + rand(-4, 4),
      r: CFG.trail.radius(st.trailW), life: CFG.trail.life, max: CFG.trail.life,
      tickT: 0.1, seed: (Math.random() * 1e9) | 0,
      /* THE LINGERING POOL: a maxed trail's ink bites twice as fast */
      tickPeriod: maxed ? CFG.trail.tick * 0.5 : CFG.trail.tick,
      dmg: 1 + (st.dmg - 1),
    });
    if (S.puddles.length > (maxed ? 40 : 26)) S.puddles.shift();
  }

  function fireSpirits() {
    const st = S.stats;
    const litany = st.spirit >= 3;   /* THE LITANY: spirits run bodies through */
    for (let i = 0; i < CFG.spirit.count(st.spirit); i++) {
      const a = rand(0, TAU);
      S.spirits.push({
        x: S.player.x + Math.cos(a) * 12, y: S.player.y + Math.sin(a) * 12,
        ang: a, speed: CFG.spirit.speed * rand(0.9, 1.1) * (litany ? 1.4 : 1),
        age: 0, life: CFG.spirit.life, seed: (Math.random() * 1e9) | 0,
        pierce: litany ? 3 : 0,
      });
    }
    SFX.spirit();
  }

  /* the seal falls: one great red stamp, shared by the hanko and its twin */
  function stampStrike(x, y, rad, dmg, slowT) {
    S.stamps.push({ x, y, r: rad, life: 0.62, max: 0.62, seed: (Math.random() * 1e9) | 0 });
    S.rings.push({ x, y, max: rad, life: 0.4, maxLife: 0.4, red: true });
    S.stainQueue.push({ x, y, r: rad * 0.34, alpha: 0.34, red: true });
    S.shake = Math.max(S.shake, 6);
    for (let k = S.enemies.length - 1; k >= 0; k--) {
      const e = S.enemies[k];
      const dx = e.x - x, dy = e.y - y;
      if (dx * dx + dy * dy <= rad * rad) {
        /* great beasts respect the seal — half the bite for elites
           and Guardians, so one stamp can never clear the sheet */
        const d2 = (e.elite || ENEMIES[e.type].boss)
          ? Math.max(1, Math.ceil(dmg * 0.45))
          : dmg;
        e.hp -= d2;
        e.hitFlash = 0.09;
        e.stun = Math.max(e.stun, CFG.hanko.stun);
        e.slowT = Math.max(e.slowT, slowT);
        if (e.hp <= 0) { S.enemies.splice(k, 1); killEnemy(e); }
      }
    }
    SFX.hanko();
  }

  function fireHanko() {
    const st = S.stats;
    const tgt = nearestEnemy(S.player.x, S.player.y, 720);
    /* the seal falls ONCE per breath — the clock is always repaid,
       or the stamp would hammer every frame and wipe the sheet */
    S.hankoT = CFG.hanko.period(st.hanko);
    if (!tgt) { S.hankoT = 0.8; return; }
    const rad = CFG.hanko.radius(st.hanko) * (1 + 0.25 * (st.hbroad || 0));
    const dmg = CFG.hanko.dmg(st.hanko) + (st.dmg - 1) + (st.hpress || 0) + ownInk();
    S.castN++;
    stampStrike(tgt.x, tgt.y, rad, dmg, 0.8);
    /* THE TWIN STAMP: the seal is followed by a lighter echo */
    if (st.hanko >= 3 || st.htwin) {
      (S.hankoQueue = S.hankoQueue || []).push({ t: 0.32, dmg: Math.max(1, Math.ceil(dmg * 0.6)) });
    }
    /* RED RAIN: every fifth stamp falls twice — the two thickest
       hordes both. The second seal hunts a DIFFERENT body. */
    if (st.hrain && S.castN % 5 === 0) {
      const t2 = nearestEnemy(tgt.x, tgt.y, 520, tgt);
      if (t2) stampStrike(t2.x, t2.y, rad * 0.85, Math.max(1, Math.ceil(dmg * 0.75)), 0.6);
    }
  }

  /* sumi arc: a live stroke that leaps from beast to beast */
  function fireArc() {
    const st = S.stats;
    const first = nearestEnemy(S.player.x, S.player.y, 560);
    if (!first) { S.arcT = 0.5; return; }
    /* THE LIVING LINE: a maxed arc leaps three links farther afield */
    const maxed = st.arc >= 4;
    const jumps = CFG.arc.jumps(st.arc) + (maxed ? 3 : 0);
    const range = maxed ? CFG.arc.maxRange : CFG.arc.range;
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
      let next = null, nd = range * range;
      for (const e of S.enemies) {
        if (hitSet.has(e)) continue;
        const dx = e.x - cur.x, dy = e.y - cur.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nd) { nd = d2; next = e; }
      }
      if (!next) break;
      cur = next;
    }
    S.arcs.push({ pts, life: 0.16, max: 0.16, seed: (Math.random() * 1e9) | 0, living: maxed });
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
    /* the endless sheet is boundless — but a bounded page has margins,
       and the brush stops at them (journey and daily only) */
    if (arenaOn()) {
      clampArena(p, p.r + 12);
      const A = CFG.world.arena, ix = A.w / 2 - (p.r + 12), iy = A.h / 2 - (p.r + 12);
      if (p.x <= -ix || p.x >= ix) p.vx = 0;
      if (p.y <= -iy || p.y >= iy) p.vy = 0;
    }

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
    /* the bounded page: the eye never looks past the margins */
    if (arenaOn()) {
      const A = CFG.world.arena;
      const mx = Math.max(0, A.w / 2 - S.W / 2), my = Math.max(0, A.h / 2 - S.H / 2);
      S.cam.x = clamp(S.cam.x, -mx, mx);
      S.cam.y = clamp(S.cam.y, -my, my);
    }

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
      /* THE TWIN STAMP: the echo seal lands its own moment later */
      if (S.hankoQueue && S.hankoQueue.length) {
        for (let i = S.hankoQueue.length - 1; i >= 0; i--) {
          const hq = S.hankoQueue[i];
          hq.t -= dt;
          if (hq.t <= 0) {
            S.hankoQueue.splice(i, 1);
            const t2 = nearestEnemy(S.player.x, S.player.y, 720);
            if (t2) stampStrike(t2.x, t2.y, CFG.hanko.radius(st.hanko), hq.dmg, 0.6);
          }
        }
      }
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

    /* ink orbit: droplets circle in a wide ring, grinding ALL they graze */
    if (st.orb > 0) {
      const orbR = CFG.orbit.radius(st.orb);
      const base = G_time();
      /* the ring bites with the brush's own ink — Bitter Ink deepens it */
      const odmg = 1 + Math.ceil(st.dmg * 0.5);
      for (let i = 0; i < st.orb; i++) {
        const a = base * CFG.orbit.speed + (i / st.orb) * TAU;
        const ox = p.x + Math.cos(a) * orbR, oy = p.y + Math.sin(a) * orbR;
        for (let kk = S.enemies.length - 1; kk >= 0; kk--) {
          const e = S.enemies[kk];
          if (e.orbCd > 0) continue;
          const dx = e.x - ox, dy = e.y - oy;
          const rr = e.r + 6.5;
          if (dx * dx + dy * dy <= rr * rr) {
            e.hp -= odmg;
            e.orbCd = CFG.orbit.dmgCd;
            e.hitFlash = 0.08;
            const d = Math.hypot(dx, dy) || 1;
            e.kbx += (dx / d) * 170; e.kby += (dy / d) * 170;
            SFX.hit();
            if (e.hp <= 0) { S.enemies.splice(kk, 1); killEnemy(e); }
            /* no break — the ring grinds every body it touches this breath */
          }
        }
      }
      /* THE GRAVE RING: a maxed ring sends an orbital hunting */
      if (st.orb >= 3) {
        S.orbFlingT = (S.orbFlingT == null ? CFG.orbit.flingEvery : S.orbFlingT) - dt;
        if (S.orbFlingT <= 0) {
          const tgt = nearestEnemy(p.x, p.y, 720);
          if (tgt) {
            S.orbFlingT = CFG.orbit.flingEvery;
            const fa = base * CFG.orbit.speed;
            S.spirits.push({
              x: p.x + Math.cos(fa) * orbR, y: p.y + Math.sin(fa) * orbR,
              ang: Math.atan2(tgt.y - p.y, tgt.x - p.x),
              speed: 460, age: 0, life: 2.4, seed: (Math.random() * 1e9) | 0,
              dmg: odmg * 2, pierce: 0, grave: true,
            });
            SFX.spirit();
          } else S.orbFlingT = 0.8;
        }
      }
    }

    /* ---- ONE BRUSH, ONE BLADE: the primary weapon ----
       kind 'bolts' — the brush casts its own strokes at the nearest
       beast (the needle's thread, the broom's sweep, the stone's
       lob, the wisp's homing breath). kind 'gust' and kind 'none'
       carry no cast at all: the fan, tide, seal and scribe brushes
       speak through their loops below — the loops ARE the weapon. */
    const atk = CFG.brushes[S.brush] && CFG.brushes[S.brush].atk;
    if (atk && atk.kind === 'bolts') {
      p.fireT -= dt;
      if (p.fireT <= 0) {
        const tgt = nearestEnemy();
        if (tgt) {
          p.aim = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          fireBrush(atk);
          p.fireT = primaryCd(atk);
        } else {
          p.fireT = 0.08;
        }
      }
    }

    /* the tide's wet wake: where the brush walks, its ink still bites */
    if (S.brush === 'tide') {
      S.wakeT -= dt;
      if (S.wakeT <= 0 && m > 0.2) {
        S.wakeT = CFG.wake.gap * (st.nunder ? 0.5 : 1);
        S.puddles.push({
          x: p.x + rand(-3, 3), y: p.y + rand(-3, 3),
          r: CFG.wake.radius, life: CFG.wake.life, max: CFG.wake.life,
          tickT: 0.08, seed: (Math.random() * 1e9) | 0,
          tickPeriod: CFG.wake.tick, dmg: primaryDmg(CFG.wake.dmg), wake: 1,
        });
        if (S.puddles.length > 30) S.puddles.shift();
      }
    }

    /* the scribe's living stroke: one perpetual weave per rank,
       returned to the hand when nothing walks the paper */
    if (st.scribe > 0) {
      const want = 1 + (st.ssecond || 0);
      while (S.scribes.length < want) {
        S.scribes.push({
          x: p.x, y: p.y, ang: rand(0, TAU), phase: rand(0, TAU),
          seed: (Math.random() * 1e9) | 0,
        });
        S.rings.push({ x: p.x, y: p.y, max: 34, life: 0.4, maxLife: 0.4 });
      }
      while (S.scribes.length > want) S.scribes.pop();
    }
  }

  const TAU = Math.PI * 2;
  let clockT = 0; /* driven from update(); used for orbital phase */
  function G_time() { return clockT; }

  /* ---- ONE BRUSH, ONE BLADE — the primary weapon ----
     Bitter Ink raises every stroke the hand lays. THE FIRST STROKE
     presses deeper still — but only into the brush's OWN ink: the
     learned powers do not drink it. */
  function ownInk() {
    return S.brush === 'fan' || S.brush === 'tide' || S.brush === 'seal' ||
           S.brush === 'scribe' || (CFG.brushes[S.brush] && CFG.brushes[S.brush].atk && CFG.brushes[S.brush].atk.kind === 'bolts')
      ? S.stats.firststroke : 0;
  }
  function primaryDmg(base) {
    return base + (S.stats.dmg - 1) + ownInk();
  }
  function primaryCd(atk) {
    let cd = atk.cd * S.stats.fireCdMult * Math.pow(0.90, S.stats.swiftbrush || 0);
    if (atk.bkind === 'wisp') cd *= Math.pow(0.88, S.stats.whaunt || 0);
    return Math.max(0.09, cd);
  }
  function fireBrush(atk) {
    const p = S.player, st = S.stats;
    const n = Math.max(1, atk.shots + (st.shots - 1) + (atk.bkind === 'wisp' ? st.wtwin : 0));
    let spread = atk.spread * (n - 1);
    if (atk.bkind === 'drop') spread += (st.bwide || 0) * 0.15 * n;   /* the sweep opens wider */
    const spd = atk.speed * st.bulletSpeedMult *
      (atk.bkind === 'stone' ? Math.pow(1.08, st.sbould || 0) : 1);
    let life = atk.life;
    if (atk.bkind === 'needle') life *= Math.pow(1.2, st.nsilk || 0);   /* the thread flies farther */
    const cast = (a, lf) => {
      S.bullets.push({
        x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13,
        vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
        ang: a,
        dmg: primaryDmg(atk.dmg +
          (atk.bkind === 'needle' ? st.ndeep : 0) +
          (atk.bkind === 'broom' ? st.bbrist : 0) +
          (atk.bkind === 'stone' ? st.sbould : 0)),
        hits: 1 + st.pierce, age: 0, life: lf,
        kind: atk.bkind, brush: S.brush, seed: 100000 + ((Math.random() * 899999) | 0),
        homing: atk.homing ? atk.homing * (1 + 0.25 * (st.whaunt || 0)) : 0,
        splash: atk.splash ? atk.splash * Math.pow(1.45, st.sshat || 0) : 0,
        quake: atk.bkind === 'stone' && st.squake ? 1 : 0,
        slow: atk.bkind === 'drop' && st.bwet ? CFG.slow.dur : 0,
        push: atk.bkind === 'drop' ? 150 : 0,
      });
    };
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
      cast(p.aim + off, life);
    }
    /* echo stroke: the mirrored cast answers from behind */
    if (st.echo > 0) {
      const en = st.echo;
      const espread = 0.24 * (en - 1);
      for (let i = 0; i < en; i++) {
        const off = en === 1 ? 0 : -espread / 2 + (espread * i) / (en - 1);
        const a = p.aim + Math.PI + off;
        S.bullets.push({
          x: p.x + Math.cos(a) * 13, y: p.y + Math.sin(a) * 13,
          vx: Math.cos(a) * spd * 0.92, vy: Math.sin(a) * spd * 0.92,
          ang: a, dmg: primaryDmg(atk.dmg), hits: 1 + st.pierce, age: 0, life: life * 0.9,
          kind: atk.bkind, brush: S.brush, seed: 100000 + ((Math.random() * 899999) | 0),
          homing: atk.homing || 0, splash: atk.splash || 0, quake: 0, slow: 0, push: 0,
        });
      }
    }
    S.castN++;
    /* THE NEEDLE RAIN: every sixth cast opens into a six-thread fan */
    if (atk.bkind === 'needle' && st.nrain && S.castN % 6 === 0) {
      for (let i = 0; i < 6; i++) cast(p.aim + (i - 2.5) * 0.17, life * 1.1);
      SFX.fan();
    }
    p.recoil = 1;
    SFX.shoot();
  }

  /* the tide answers: a black surge rolls outward from the brush.
     Bitter Ink deepens it; the tide's own arts deepen it further. */
  function fireNova() {
    const st = S.stats;
    const rad = CFG.nova.radius(st.nova) * (1 + 0.2 * (st.nspring || 0));
    const dmg = primaryDmg(1 + (st.nswell || 0));
    const knock = CFG.nova.knock * (1 + 0.6 * (st.nrip || 0));
    const stun = CFG.nova.stun + 0.15 * (st.nrip || 0);
    S.rings.push({ x: S.player.x, y: S.player.y, max: rad, life: 0.5, maxLife: 0.5 });
    for (let k = S.enemies.length - 1; k >= 0; k--) {
      const e = S.enemies[k];
      const dx = e.x - S.player.x, dy = e.y - S.player.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < rad) {
        const k2 = knock * (1 - d / rad + 0.3);
        e.kbx += (dx / d) * k2;
        e.kby += (dy / d) * k2;
        e.stun = Math.max(e.stun, stun);
        e.hp -= dmg;
        e.hitFlash = 0.08;
        if (e.hp <= 0) { S.enemies.splice(k, 1); killEnemy(e); }
      }
    }
    S.shake = Math.max(S.shake, 3);
    SFX.nova();
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
            /* THE MIRROR RETURN: a maxed stroke bursts into an ink ring at home */
            if (S.stats.boomer >= 4) {
              S.rings.push({ x: b.x, y: b.y, max: 150, life: 0.45, maxLife: 0.45 });
              S.shake = Math.max(S.shake, 5);
              for (let j = S.enemies.length - 1; j >= 0; j--) {
                const e = S.enemies[j];
                const dx = e.x - b.x, dy = e.y - b.y;
                const dd = Math.hypot(dx, dy) || 1;
                if (dd <= 150) {
                  e.hp -= 2; e.hitFlash = 0.08;
                  e.kbx += (dx / dd) * 300; e.kby += (dy / dd) * 300;
                  if (e.hp <= 0) { S.enemies.splice(j, 1); killEnemy(e); }
                }
              }
              SFX.nova();
            }
            S.bullets.splice(i, 1);
            continue;
          }
        }
        b.age += dt;
        if (b.age > b.life) { S.bullets.splice(i, 1); continue; }
        /* the homing breath: wisp bolts lean toward the nearest body */
        if (b.homing) {
          const tgt = nearestEnemy(b.x, b.y, 480);
          if (tgt) {
            const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
            let diff = want - b.ang;
            while (diff > Math.PI) diff -= TAU;
            while (diff < -Math.PI) diff += TAU;
            const turn = b.homing * dt;
            b.ang += clamp(diff, -turn, turn);
            const spd = Math.hypot(b.vx, b.vy) || 1;
            b.vx = Math.cos(b.ang) * spd; b.vy = Math.sin(b.ang) * spd;
          }
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        continue;
      }
      /* the homing breath rides the ordinary casts too (wisp bolts) */
      if (b.homing) {
        const tgt = nearestEnemy(b.x, b.y, 480);
        if (tgt) {
          const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
          let diff = want - b.ang;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const turn = b.homing * dt;
          b.ang += clamp(diff, -turn, turn);
          const spd = Math.hypot(b.vx, b.vy) || 1;
          b.vx = Math.cos(b.ang) * spd; b.vy = Math.sin(b.ang) * spd;
        }
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
    /* the sketch is only drawn — while faint, every stroke passes through */
    if (e.faint) return false;
    /* the blotter drinks frontal strokes — three, and it bursts */
    if (e.type === 'blotter' && proj && !e.bloat) {
      e.soak = (e.soak || 0) + 1;
      e.r = Math.min(19, e.r + 1.2);
      S.popups.push({ x: e.x, y: e.y - e.r - 5, txt: 'SOAK', life: 0.45, max: 0.45 });
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
        S.popups.push({ x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6), txt: 'DEFLECT', life: 0.4, max: 0.4 });
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
          vx: Math.cos(ra) * 500, vy: Math.sin(ra) * 500,
          ang: ra, dmg: 1, hits: 1, age: 0, life: 0.8,
          kind: 'drop', brush: 'needle', seed: 100000 + ((Math.random() * 899999) | 0), refl: true,
        });
        S.popups.push({ x: e.x + Math.cos(e.ang) * (e.r + 6), y: e.y + Math.sin(e.ang) * (e.r + 6), txt: 'RETURNED', life: 0.4, max: 0.4 });
        SFX.ping();
        return false;
      }
    }
    const critCh = CFG.crit.chance(st.crit) + (st.critC || 0);
    let d = dmg;
    if (critCh > 0 && RNG() < critCh) {
      d *= 2;
      S.popups.push({ x: e.x, y: e.y - e.r - 6, txt: '×2', life: 0.55, max: 0.55, red: true });
    }
    if (st.slow > 0) e.slowT = CFG.slow.dur;
    e.hp -= d;
    e.hitFlash = 0.08;
    if (knock) {
      const boss = ENEMIES[e.type].boss;
      const kf = boss ? 0.06 : e.elite ? 0.15 : (e.type === 'slab' || e.type === 'oni' || e.type === 'golem' ||
        e.type === 's_nest' || e.type === 's_toller' || ENEMIES[e.type].captain ? 0.12 : 0.55);
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
        if (hitPoolN < hitPool.length) { arr = hitPool[hitPoolN++]; arr.length = 0; }
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
            if (e.faint) continue;   /* the droplet sails through the underdrawing */
            const dx = e.x - b.x, dy = e.y - b.y;
            const rr = e.r + br;
            if (dx * dx + dy * dy <= rr * rr) {
              const ang = Math.atan2(b.vy, b.vx);
              SFX.hit();
              b.hits--;
              damageEnemy(e, -1, b.dmg, true, ang, true, !!b.refl);
              /* the sweep's wet bristles and the gale's shove ride the cast */
              if (b.slow) e.slowT = Math.max(e.slowT, b.slow);
              if (b.push) { e.kbx += Math.cos(ang) * b.push; e.kby += Math.sin(ang) * b.push; }
              if (b.hits <= 0) {
                /* the stone's splash: where it lands, the ink spatters */
                if (b.splash) {
                  S.rings.push({ x: b.x, y: b.y, max: b.splash, life: 0.32, maxLife: 0.32 });
                  for (let j = S.enemies.length - 1; j >= 0; j--) {
                    const o = S.enemies[j];
                    const ddx = o.x - b.x, ddy = o.y - b.y;
                    if (ddx * ddx + ddy * ddy <= b.splash * b.splash) {
                      o.hp -= b.dmg;
                      o.hitFlash = 0.08;
                      if (b.quake) o.stun = Math.max(o.stun, 0.32);
                      const dd = Math.hypot(ddx, ddy) || 1;
                      o.kbx += (ddx / dd) * 140; o.kby += (ddy / dd) * 140;
                      if (o.hp <= 0) { S.enemies.splice(j, 1); killEnemy(o); }
                    }
                  }
                }
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
      /* the ledger's claimed ink flies to the ledger's mouth, not to the hand */
      if (mt.ledger) {
        const lg = mt.ledger;
        if (lg.dead || lg.hp <= 0) { mt.ledger = null; }
        else {
          const lx = lg.x - mt.x, ly = lg.y - mt.y;
          const ld = Math.hypot(lx, ly) || 1;
          mt.vx = (lx / ld) * 250; mt.vy = (ly / ld) * 250;
          mt.x += mt.vx * dt; mt.y += mt.vy * dt;
          if (ld < 16) {
            lg.ate = (lg.ate || 0) + 1;
            S.motes.splice(i, 1);
          }
          continue;
        }
      }
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
          S.popups.push({ x: p.x, y: p.y - 20, txt: 'INK — GATHERED', life: 1.1, max: 1.1, red: true });
          S.rings.push({ x: p.x, y: p.y, max: 120, life: 0.5, maxLife: 0.5 });
          SFX.magnet();
        } else if (pk.kind === 'bomb') {
          S.shake = Math.max(S.shake, 11);
          const RAD = Math.max(S.W, S.H) * 0.55;   /* the blast hurts only what the ring reaches */
          S.rings.push({ x: p.x, y: p.y, max: RAD, life: 0.6, maxLife: 0.6, red: true });
          for (let j = S.enemies.length - 1; j >= 0; j--) {
            const e = S.enemies[j];
            const bdx = e.x - p.x, bdy = e.y - p.y;
            if (bdx * bdx + bdy * bdy > RAD * RAD) continue;
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
        /* THE WHORL TEETH: a maxed whirlpool bites what remains inside */
        if (st.vortex >= 3) {
          for (let j = S.enemies.length - 1; j >= 0; j--) {
            const e = S.enemies[j];
            const dx = e.x - vz.x, dy = e.y - vz.y;
            if (dx * dx + dy * dy < vz.r * vz.r) {
              e.hp -= 3; e.hitFlash = 0.1;
              e.stun = Math.max(e.stun, 0.6);
              if (e.hp <= 0) { S.enemies.splice(j, 1); killEnemy(e); }
            }
          }
          S.rings.push({ x: vz.x, y: vz.y, max: vz.r * 1.25, life: 0.45, maxLife: 0.45, red: true });
          S.shake = Math.max(S.shake, 6);
          SFX.hanko();
        }
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
          if (bo.seal) SFX.hanko(); else SFX.thunder();
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
      if (pd.hostile) {
        /* the sizing's glue — it does not bite the horde, it holds the HAND */
        if (pd.life <= 0) {
          S.stainQueue.push({ x: pd.x, y: pd.y, r: pd.r * 0.55, alpha: 0.12 });
          S.puddles.splice(i, 1);
          continue;
        }
        const q = S.player;
        const qx = q.x - pd.x, qy = q.y - pd.y;
        if (qx * qx + qy * qy < pd.r * pd.r) {
          S.playerSlowT = Math.max(S.playerSlowT, 0.3);
        }
        continue;
      }
      pd.tickT -= dt;
      if (pd.life <= 0) {
        S.stainQueue.push({ x: pd.x, y: pd.y, r: pd.r * 0.5, alpha: 0.16 });
        S.puddles.splice(i, 1);
        continue;
      }
      if (pd.tickT <= 0) {
        pd.tickT = pd.tickPeriod || CFG.trail.tick;
        const pdDmg = pd.dmg || CFG.trail.dmg;
        let bit = false;
        for (let j = S.enemies.length - 1; j >= 0; j--) {
          const e = S.enemies[j];
          const dx = e.x - pd.x, dy = e.y - pd.y;
          const rr = e.r + pd.r * 0.85;
          if (dx * dx + dy * dy <= rr * rr) {
            e.slowT = Math.max(e.slowT, 0.55);
            e.hp -= pdDmg;
            e.hitFlash = 0.07;
            bit = true;
            if (e.hp <= 0) { S.enemies.splice(j, 1); killEnemy(e); }
          }
        }
        if (bit && Math.random() < 0.5) SFX.hit();
      }
    }
  }

  /* ---------------- the scribe's living stroke ----------------
     THE SCRIBE brush's whole answer: a perpetual line of ink that
     weaves through the horde and bites what it passes. No projectiles
     — the stroke IS the weapon. When nothing walks the paper it
     circles the hand like a faithful dog of ink. The bite is ticked
     per body, so three scribes cover the field rather than melt one
     unfortunate beast. */
  function updateScribes(dt) {
    const st = S.stats;
    if (!S.scribes.length) return;
    const p = S.player;
    const speed = CFG.scribe.speed * (1 + 0.25 * (st.sswift || 0));
    const dmg = 1 + (st.dmg - 1) + (st.sdeep || 0) + ownInk();
    const rad = CFG.scribe.r * (1 + 0.3 * (st.slong || 0));
    for (const sc of S.scribes) {
      sc.phase += dt * CFG.scribe.weave;
      const tgt = nearestEnemy(sc.x, sc.y, 560);
      if (tgt) {
        const want = Math.atan2(tgt.y - sc.y, tgt.x - sc.x);
        let diff = want - sc.ang;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const turn = CFG.scribe.turn * dt;
        sc.ang += clamp(diff, -turn, turn);
        /* the weave: the line snakes as it hunts */
        sc.ang += Math.sin(sc.phase) * 2.1 * dt;
      } else {
        /* no beast walks: the stroke circles the hand */
        const dx = p.x - sc.x, dy = p.y - sc.y;
        const d = Math.hypot(dx, dy) || 1;
        const toward = Math.atan2(dy, dx);
        const want2 = d > 92 ? toward : toward + Math.PI / 2;
        let diff = want2 - sc.ang;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        sc.ang += clamp(diff, -3.4 * dt, 3.4 * dt);
      }
      sc.x += Math.cos(sc.ang) * speed * dt;
      sc.y += Math.sin(sc.ang) * speed * dt;
      /* THE INK WAKE: where the stroke has passed, its ink lingers */
      if (st.swake) {
        sc.trailT = (sc.trailT || 0) - dt;
        if (sc.trailT <= 0) {
          sc.trailT = 0.3;
          S.puddles.push({
            x: sc.x, y: sc.y, r: 16, life: 0.9, max: 0.9,
            tickT: 0.1, seed: (Math.random() * 1e9) | 0,
            tickPeriod: CFG.trail.tick, dmg,
          });
          if (S.puddles.length > 46) S.puddles.shift();
        }
      }
      /* the bite: contact, ticked per body */
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j];
        if (e.scribeCd > 0) continue;
        const dx = e.x - sc.x, dy = e.y - sc.y;
        const rr = e.r + rad;
        if (dx * dx + dy * dy <= rr * rr) {
          e.scribeCd = CFG.scribe.tick;
          damageEnemy(e, -1, dmg, true, sc.ang, true, false);
          burst(sc.x, sc.y, 3, false);
        }
      }
    }
    /* the bodies' bite clocks run down once, here */
    for (const e of S.enemies) if (e.scribeCd > 0) e.scribeCd -= dt;
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
      if (sp.lastHitT > 0) sp.lastHitT -= dt;
      for (let j = S.enemies.length - 1; j >= 0; j--) {
        const e = S.enemies[j];
        if (e === sp.lastHit && sp.lastHitT > 0) continue;
        const dx = e.x - sp.x, dy = e.y - sp.y;
        const rr = e.r + 4;
        if (dx * dx + dy * dy <= rr * rr) {
          damageEnemy(e, j, sp.dmg || CFG.spirit.dmg, true, sp.ang, true);
          burst(sp.x, sp.y, sp.pierce > 0 ? 3 : 4, false);
          if (sp.pierce > 0) {
            /* THE LITANY: the spirit runs the body through and flies on */
            sp.pierce--;
            sp.lastHit = e; sp.lastHitT = 0.22;
          } else {
            S.spirits.splice(i, 1);
          }
          break;
        }
      }
    }
  }

  /* ---------------- the bosses' three phases ----------------
     A duel climbs twice: at two-thirds ink and one-third ink the
     beast TURNS — a cry pressed into the paper, a red ring, a hit
     of stillness, and a faster, meaner rhythm. Hard by design,
     fair by telegraph: every phase is readable, none is a trick. */
  function bossPhaseOf(e) {
    return e.hp < e.maxHp * 0.33 ? 2 : e.hp < e.maxHp * 0.66 ? 1 : 0;
  }
  /* the ten seals carry their cry on their own def (v19.1); the old
     twelve keep their lines here, and every def.cry merges in below */
  const ENRAGE_CRY = {
    b_wheel: 'THE STAIN SPREADS',    k_blight: 'THE BLIGHT BLOOMS',
    b_mother: 'THE BROOD WAKES',     k_husk: 'THE HUSK SPLITS',
    b_warlord: 'THE HORNS SHARPEN',  k_cinder: 'THE CINDER ROARS',
    b_tempest: 'THE EYE TURNS',      k_veil: 'THE VEIL THINS',
    b_origin: 'THE OLD INK REMEMBERS', k_nib: 'THE NIB RE-DIPS',
    b_blank: 'THE PAGE TURNS',       k_edge: 'THE MARGIN WIDENS',
  };
  for (const id in ENEMIES) if (ENEMIES[id].cry) ENRAGE_CRY[id] = ENEMIES[id].cry;

  /* ---------------- THE KEEPER KIT (v19.1) ----------------
     The ten seals fight from one composable kit: every new keeper
     walks like a boss (slow chase, three enrage phases) and casts
     TWO abilities of its own — a signature and a support — from
     fourteen primitives. Telegraphed or fast, never both: each
     state-changing cast only starts from a quiet cruise. */
  function kitTelegraph(e, kind, life) {
    S.telgs.push({ e, kind, r: kind === 'ring' ? 205 : undefined, len: kind === 'line' ? 340 : undefined, life, maxLife: life });
  }
  function kitChase(e, ux, uy, sm, ph) {
    const run = ph >= 1 ? 1.15 : 1;
    if (e.state === 'chg') return null;              /* the dash moves it */
    if (e.state === 'orbit') return null;            /* the orbit steers it */
    return [ux * e.speed * sm * run, uy * e.speed * sm * run];
  }
  function kitSpawnKin(e, type, n, halve, cap) {
    if (S.enemies.length >= cap + 8) return;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const c = spawnEnemy(type, e.x + Math.cos(a) * (e.r + 10), e.y + Math.sin(a) * (e.r + 10));
      c.kbx = Math.cos(a) * 170; c.kby = Math.sin(a) * 170;
      if (halve) { c.maxHp = Math.max(1, Math.ceil(c.maxHp * 0.5)); c.hp = c.maxHp; }
    }
    S.rings.push({ x: e.x, y: e.y, max: 115, life: 0.45, maxLife: 0.45, red: true });
    SFX.elite();
  }
  /* one kit cast; returns true when it consumed the beast's state.
     cap = the wave's concurrent ceiling (passed from updateEnemies). */
  function kitAct(e, slot, kind, dt, ph, d, p, ux, uy, cap) {
    const tK = slot ? 'kT1' : 'kT0';
    const fast = ph === 2 ? 0.66 : ph === 1 ? 0.82 : 1;   /* enraged casts come sooner */
    e[tK] = (e[tK] == null ? 1.2 : e[tK]) - dt;
    if (e[tK] > 0) return false;
    switch (kind) {
      case 'ring':   /* radial burst — telegraphed, then the ring of red globs */
        if (e.state !== 'cruise') return false;
        e[tK] = 3.3 * fast; e.state = 'windup'; e.stateT = 0;
        kitTelegraph(e, 'ring', 0.6); SFX.wind();
        return true;
      case 'fan':    /* aimed needle fan */
        if (d > 460) return false;
        e[tK] = 2.7 * fast;
        { const base = Math.atan2(p.y - e.y, p.x - e.x), half = 1 + ph;
          for (let i = -half; i <= half; i++) {
            const a = base + i * 0.19;
            S.ebullets.push({ kind: 'needle', red: true,
              x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
              vx: Math.cos(a) * CFG.needle.speed * 0.82, vy: Math.sin(a) * CFG.needle.speed * 0.82,
              ang: a, age: 0, life: CFG.needle.life * 1.15 });
          }
          SFX.needle(); }
        return false;
      case 'volley': /* aimed triple of fat drops */
        if (d > 470) return false;
        e[tK] = 2.5 * fast;
        { const base = Math.atan2(p.y - e.y, p.x - e.x);
          for (let i = -1; i <= 1; i++) {
            const a = base + i * 0.2;
            S.ebullets.push({ kind: 'drop', red: true,
              x: e.x + Math.cos(a) * (e.r + 7), y: e.y + Math.sin(a) * (e.r + 7),
              vx: Math.cos(a) * 215, vy: Math.sin(a) * 215, ang: a, age: 0, life: 2.3 });
          }
          SFX.glob(); }
        return false;
      case 'brood':  /* two — three, enraged — of its chosen kin */
        if (S.enemies.length >= cap + 8) return false;
        e[tK] = (ph === 2 ? 5.2 : 7.2) * fast;
        kitSpawnKin(e, ENEMIES[e.type].kin, ph === 2 ? 3 : 2, false, cap);
        return false;
      case 'brood1': /* one kin, again and again — a slow tide of its own */
        if (S.enemies.length >= cap + 8) return false;
        e[tK] = (ph === 2 ? 3.4 : 4.6) * fast;
        kitSpawnKin(e, ENEMIES[e.type].kin, 1, false, cap);
        return false;
      case 'mirror': /* two half-ink copies of its kin — which one is real? */
        if (S.enemies.length >= cap + 8) return false;
        e[tK] = (ph === 2 ? 4.4 : 6.0) * fast;
        kitSpawnKin(e, ENEMIES[e.type].kin, 2, true, cap);
        S.popups.push({ x: e.x, y: e.y - e.r - 12, txt: 'MIRRORED', life: 0.9, max: 0.9, red: true });
        return false;
      case 'charge': /* telegraphed road through the paper */
        if (e.state !== 'cruise' || d > 430) return false;
        e[tK] = (ph === 2 ? 3.1 : 4.1) * fast; e.state = 'chg-wind'; e.stateT = 0;
        kitTelegraph(e, 'line', 0.5); SFX.wind();
        return true;
      case 'blink':  /* dissolve, and the paper forgets where it stood */
        if (e.state !== 'cruise') return false;
        e[tK] = (ph === 2 ? 3.7 : 5.0) * fast; e.state = 'dissolve'; e.stateT = 0;
        return true;
      case 'stamp':  /* red seals pressed where you stand */
        if (d > 560) return false;
        e[tK] = (ph === 2 ? 3.1 : 4.3) * fast;
        { const n = 1 + (ph >= 1 ? 1 : 0) + (ph === 2 ? 1 : 0);
          for (let i = 0; i < n; i++) {
            const ba = rand(0, TAU), bd = i === 0 ? rand(10, 60) : rand(70, 150);
            S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.9, r: 62, struck: false, life: 0, red: true, seal: 1 });
          }
          SFX.wind(); }
        return false;
      case 'rain':   /* the sky opens over the brush */
        e[tK] = (ph === 2 ? 3.6 : 5.0) * fast;
        { const nb = 2 + ph;
          for (let i = 0; i < nb; i++) {
            const ba = rand(0, TAU), bd = rand(20, 150);
            S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.85 + i * 0.3, r: 54, struck: false, life: 0 });
          }
          SFX.wind(); }
        return false;
      case 'spiral': /* two arms of needles, turning */
        if (e.state !== 'cruise') return false;
        e[tK] = (ph === 2 ? 3.2 : 4.4) * fast; e.state = 'spiral'; e.stateT = 0; e.spA = rand(0, TAU);
        return true;
      case 'orbit':  /* hold the ring — and plink at the brush from it */
        if (d > 460) return false;
        e[tK] = (ph === 2 ? 1.9 : 2.6) * fast;
        { const a = Math.atan2(p.y - e.y, p.x - e.x) + rand(-0.15, 0.15);
          S.ebullets.push({ kind: 'drop', red: true,
            x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
            vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, ang: a, age: 0, life: 2.1 });
          SFX.glob(); }
        return false;
      case 'haste':  /* its cry quickens every beast near it */
        e[tK] = (ph === 2 ? 4.2 : 5.8) * fast;
        { let felled = 0;
          for (const o of S.enemies) {
            if (o === e || ENEMIES[o.type].boss) continue;
            const dx = o.x - e.x, dy = o.y - e.y;
            if (dx * dx + dy * dy < 240 * 240) { o.hornT = 2.5; felled++; }
          }
          S.rings.push({ x: e.x, y: e.y, max: 240, life: 0.5, maxLife: 0.5, red: true });
          if (felled) S.popups.push({ x: e.x, y: e.y - e.r - 12, txt: 'QUICKENED', life: 0.9, max: 0.9, red: true });
          SFX.elite(); }
        return false;
      default:
        e[tK] = 3;
        return false;
    }
  }
  /* the windup→payoff half of the state-casting abilities */
  function kitState(e, dt, ph, p) {
    if (e.state === 'windup') {
      e.stateT += dt;
      if (e.stateT > 0.6) {
        e.state = 'cruise'; e.stateT = 0;
        const n = 8 + ph * 3, off = rand(0, TAU);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + off;
          S.ebullets.push({ kind: 'glob', red: true,
            x: e.x + Math.cos(a) * (e.r + 8), y: e.y + Math.sin(a) * (e.r + 8),
            vx: Math.cos(a) * CFG.glob.speed * 0.82, vy: Math.sin(a) * CFG.glob.speed * 0.82,
            ang: a, age: 0, life: CFG.glob.life * 1.3 });
        }
        S.rings.push({ x: e.x, y: e.y, max: 205, life: 0.5, maxLife: 0.5, red: true });
        S.shake = Math.max(S.shake, 7); SFX.nova();
      }
      return true;
    }
    if (e.state === 'chg-wind') {
      e.stateT += dt;
      if (e.stateT > 0.5) {
        e.ang = Math.atan2(p.y - e.y, p.x - e.x);
        e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
        e.state = 'chg'; e.stateT = 0;
      }
      return true;
    }
    if (e.state === 'chg') {
      e.stateT += dt;
      if (Math.random() < 0.35) S.stainQueue.push({ x: e.x, y: e.y, r: 7, alpha: 0.3, red: true });
      if (e.stateT > 0.45) { e.state = 'cruise'; e.stateT = 0; }
      return true;
    }
    if (e.state === 'dissolve') {
      e.stateT += dt;
      if (e.stateT > 0.5) {
        S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.85, alpha: 0.4 });
        const bd = ph === 2 ? rand(110, 160) : rand(140, 200), ba = rand(0, TAU);
        e.x = p.x + Math.cos(ba) * bd; e.y = p.y + Math.sin(ba) * bd;
        S.stainQueue.push({ x: e.x, y: e.y, r: e.r, alpha: 0.45 });
        S.rings.push({ x: e.x, y: e.y, max: e.r * 2.3, life: 0.35, maxLife: 0.35 });
        e.state = 'cruise'; e.stateT = 0; SFX.blink();
      }
      return true;
    }
    if (e.state === 'spiral') {
      e.stateT += dt;
      e.spA += dt * 4.6;
      e.spE = (e.spE || 0) - dt;
      if (e.spE <= 0) {
        e.spE = 0.09;
        for (const arm of [0, Math.PI]) {
          const a = e.spA + arm;
          S.ebullets.push({ kind: 'needle', red: true,
            x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
            vx: Math.cos(a) * CFG.needle.speed * 0.72, vy: Math.sin(a) * CFG.needle.speed * 0.72,
            ang: a, age: 0, life: CFG.needle.life * 1.2 });
        }
        if (Math.random() < 0.3) SFX.needle();
      }
      if (e.stateT > 1.15) { e.state = 'cruise'; e.stateT = 0; }
      return true;
    }
    return false;
  }
  function enrageCheck(e, cry) {
    const ph = bossPhaseOf(e);
    if (ph > (e.pSeen || 0)) {
      e.pSeen = ph;
      S.popups.push({ x: e.x, y: e.y - e.r - 14, txt: cry, life: 1.3, max: 1.3, red: true });
      S.rings.push({ x: e.x, y: e.y, max: e.r * 5, life: 0.55, maxLife: 0.55, red: true });
      S.shake = Math.max(S.shake, 12);
      if (!S.reduced) S.hitstop = Math.max(S.hitstop, 0.12);
      SFX.elite();
      e.state = 'cruise'; e.stateT = 0;   /* the old rhythm breaks */
    }
    return ph;
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
    /* the captains likewise: few, and their aura is one pass */
    let captains = null;
    for (const w of S.enemies) if (ENEMIES[w.type].captain) (captains || (captains = [])).push(w);
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
      if (e.auraT > 0) e.auraT -= dt;
      if (e.stun > 0) {
        e.stun -= dt;
      } else {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        /* soaked paper drags; the warden's herald-cry quickens the pack;
           a captain's march quickens it more, and its beasts wear the mark */
        let sm = e.slowT > 0 ? CFG.slow.mult : 1;
        if (wardens && e.type !== 'warden') {
          for (const w of wardens) {
            const wx = e.x - w.x, wy = e.y - w.y;
            if (wx * wx + wy * wy < 200 * 200) { sm *= 1.3; break; }
          }
        }
        if (captains && !ENEMIES[e.type].captain) {
          const aR2 = CFG.captain.auraR * CFG.captain.auraR;
          for (const cpt of captains) {
            const ax = e.x - cpt.x, ay = e.y - cpt.y;
            if (ax * ax + ay * ay < aR2) { sm *= CFG.captain.auraMult; e.auraT = 0.3; break; }
          }
        }
        /* the warhorn's muster: beasts it has breathed on run hotter */
        if (e.hornT > 0) { e.hornT -= dt; sm *= 1.32; }
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
          case 'cask':   /* the relic cask plods like the heavy kin it trusts */
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
          case 'shiki': { /* the paper doll — keeps its distance and calls lesser ink to serve */
            if (e.state === 'cruise') {
              e.ang = Math.atan2(uy, ux);
              if (d > 280) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
              else { /* a slow ceremonial strafe */
                const sdir = Math.sin(e.seed + e.t * 0.5) > 0 ? 1 : -1;
                vx = -uy * e.speed * 0.7 * sm * sdir;
                vy = ux * e.speed * 0.7 * sm * sdir;
              }
              e.stateT += dt;
              if (d < 360 && e.stateT > 3.4) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              /* the rite: a ring draws itself around the doll */
              e.stateT += dt;
              vx = uy * 0.001; vy = -ux * 0.001;
              if (e.stateT > 0.75) {
                e.state = 'rest'; e.stateT = 0;
                if (S.enemies.length < broodCap) {
                  for (let i = 0; i < 2; i++) {
                    const a = rand(0, TAU);
                    const c = spawnEnemy('ember', e.x + Math.cos(a) * (e.r + 9), e.y + Math.sin(a) * (e.r + 9));
                    c.kbx = Math.cos(a) * 190; c.kby = Math.sin(a) * 190;
                  }
                  S.rings.push({ x: e.x, y: e.y, max: e.r * 2.6, life: 0.45, maxLife: 0.45 });
                  S.popups.push({ x: e.x, y: e.y - e.r - 8, txt: 'SUMMONED', life: 0.8, max: 0.8, red: true });
                  SFX.elite();
                }
              }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 1.1) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'crest': { /* the swell — the farther it runs, the harder it rears */
            const rear = 1 + 0.55 * (1 - Math.min(d, 420) / 420);
            vx = ux * e.speed * rear * sm; vy = uy * e.speed * rear * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          }
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

          /* ---------- the blank silk's own half-drawn things ---------- */
          case 'sketch': { /* the underdrawing — it is not always THERE */
            const cyc = (e.t + e.seed) % 5.2;
            const nowFaint = cyc > 2.7;
            if (nowFaint !== !!e.faint && nowFaint) {
              S.popups.push({ x: e.x, y: e.y - e.r - 6, txt: 'UNDRAWN', life: 0.55, max: 0.55 });
            }
            e.faint = nowFaint;
            const drift = e.faint ? 0.45 : 1;
            vx = ux * e.speed * drift * sm; vy = uy * e.speed * drift * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          }
          case 'stitch': { /* the seam — it holds, aims, and runs its line */
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              if (d < 340 && e.stateT > 1.3) { e.state = 'tele'; e.stateT = 0; }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.32) { e.state = 'dash'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'dash') {
              e.stateT += dt;
              vx = Math.cos(e.ang) * 400; vy = Math.sin(e.ang) * 400;
              if (Math.random() < 0.25) S.stainQueue.push({ x: e.x, y: e.y, r: 3.5, alpha: 0.22 });
              if (e.stateT > 0.5) { e.state = 'rest'; e.stateT = 0; }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 0.55) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'reseal': /* the twice-stamped — slow, and it refuses the first death */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          case 'sizing': /* the glue — a slow soak that spills where it dies */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          case 'binder': { /* the mount — it herds the horde toward the brush */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.herdT = (e.herdT == null ? 0.8 : e.herdT) - dt;
            if (e.herdT <= 0) {
              e.herdT = 0.7;
              const hr2 = 190 * 190;
              for (const o of S.enemies) {
                if (o === e || o.dead || ENEMIES[o.type].boss) continue;
                const ox = o.x - e.x, oy = o.y - e.y;
                if (ox * ox + oy * oy < hr2) {
                  const hx = p.x - o.x, hy = p.y - o.y;
                  const hd = Math.hypot(hx, hy) || 1;
                  o.kbx += (hx / hd) * 120; o.kby += (hy / hd) * 120;
                }
              }
            }
            break;
          }
          case 'weft': { /* the loom — it holds its distance and throws the cross-weave */
            if (e.state === 'cruise') {
              e.ang = Math.atan2(uy, ux);
              if (d > 300) { vx = ux * e.speed * sm; vy = uy * e.speed * sm; }
              else {
                const sdir = Math.sin(e.seed + e.t * 0.6) > 0 ? 1 : -1;
                vx = -uy * e.speed * 0.8 * sm * sdir;
                vy = ux * e.speed * 0.8 * sm * sdir;
              }
              e.stateT += dt;
              if (d < 380 && e.stateT > 2.1) { e.state = 'tele'; e.stateT = 0; SFX.wind(); }
            } else if (e.state === 'tele') {
              e.stateT += dt;
              if (e.stateT > 0.45) {
                e.state = 'rest'; e.stateT = 0;
                const base = Math.atan2(p.y - e.y, p.x - e.x);
                for (const off of [-0.34, 0.34]) {
                  const a = base + off;
                  S.ebullets.push({
                    kind: 'needle',
                    x: e.x + Math.cos(a) * (e.r + 4), y: e.y + Math.sin(a) * (e.r + 4),
                    vx: Math.cos(a) * CFG.needle.speed * 0.62, vy: Math.sin(a) * CFG.needle.speed * 0.62,
                    ang: a, age: 0, life: CFG.needle.life * 1.15,
                  });
                }
                /* the warp line: a third thread runs straight at the hand */
                S.ebullets.push({
                  kind: 'needle',
                  x: e.x + Math.cos(base) * (e.r + 4), y: e.y + Math.sin(base) * (e.r + 4),
                  vx: Math.cos(base) * CFG.needle.speed * 0.5, vy: Math.sin(base) * CFG.needle.speed * 0.5,
                  ang: base, age: 0, life: CFG.needle.life * 1.3,
                });
                SFX.needle();
              }
            } else { /* rest */
              e.stateT += dt;
              if (e.stateT > 0.9) { e.state = 'cruise'; e.stateT = 0; }
            }
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

          /* ============ THE SPECIALS — the paper's odd mechanics ============ */
          case 's_nest': { /* roots itself and breeds gnats until it is broken */
            vx = 0; vy = 0;
            e.ang = Math.atan2(uy, ux);
            e.broodT = (e.broodT == null ? 1.6 : e.broodT) - dt;
            if (e.broodT <= 0 && S.enemies.length < broodCap) {
              e.broodT = 2.6;
              for (let i = 0; i < 2; i++) {
                const a = rand(0, TAU);
                const c = spawnEnemy('gnat', e.x + Math.cos(a) * (e.r + 7), e.y + Math.sin(a) * (e.r + 7));
                c.kbx = Math.cos(a) * 170; c.kby = Math.sin(a) * 170;
              }
              S.rings.push({ x: e.x, y: e.y, max: e.r * 2.2, life: 0.4, maxLife: 0.4 });
              SFX.blink();
            }
            break;
          }
          case 's_mender': { /* drifts with the pack and stitches the wounded back up */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stitchT = (e.stitchT == null ? 1.8 : e.stitchT) - dt;
            if (e.stitchT <= 0) {
              e.stitchT = 3.2;
              let tgt = null, bd = 280 * 280;
              for (const o of S.enemies) {
                if (o === e || o.dead || o.hp >= o.maxHp || ENEMIES[o.type].boss) continue;
                const ox = o.x - e.x, oy = o.y - e.y, o2 = ox * ox + oy * oy;
                if (o2 < bd) { bd = o2; tgt = o; }
              }
              if (tgt) {
                tgt.hp = Math.min(tgt.maxHp, tgt.hp + 7);
                tgt.hitFlash = 0.12;
                S.rings.push({ x: tgt.x, y: tgt.y, max: tgt.r * 2.4, life: 0.35, maxLife: 0.35, red: true });
                S.popups.push({ x: tgt.x, y: tgt.y - tgt.r - 6, txt: 'STITCHED', life: 0.6, max: 0.6, red: true });
                SFX.heal();
              }
            }
            break;
          }
          case 's_toller': { /* the bell: it draws a ring on the paper, then the sound shoves you */
            e.ang = Math.atan2(uy, ux);
            if (e.state !== 'toll') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.tollT = (e.tollT == null ? 2.2 : e.tollT) - dt;
              if (e.tollT <= 0 && d < 460) {
                e.state = 'toll'; e.stateT = 0;
                S.telgs.push({ e, kind: 'ring', r: 170, life: 0.55, maxLife: 0.55 });
                SFX.wind();
              }
            } else {
              e.stateT += dt;
              vx = 0; vy = 0;
              if (e.stateT > 0.55) {
                e.state = 'cruise'; e.tollT = 4.4;
                for (let i = 0; i < 6; i++) {
                  const a = (i / 6) * TAU + rand(-0.15, 0.15);
                  S.ebullets.push({
                    kind: 'glob',
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * 165, vy: Math.sin(a) * 165,
                    ang: a, age: 0, life: CFG.glob.life * 1.1,
                  });
                }
                /* the sound-wave shoves the brush off its stroke */
                if (d < 260) { p.vx += ux * 260; p.vy += uy * 260; }
                S.rings.push({ x: e.x, y: e.y, max: 150, life: 0.4, maxLife: 0.4 });
                SFX.nova();
              }
            }
            break;
          }
          case 's_ledger': { /* the usurer — it eats the ink you spilled, then bites back */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            /* claim the motes that lie near its mouth */
            const lr2 = 150 * 150;
            for (const mt of S.motes) {
              if (mt.ledger) continue;
              const mx = mt.x - e.x, my = mt.y - e.y;
              if (mx * mx + my * my < lr2) mt.ledger = e;
            }
            e.taxT = (e.taxT || 0) + dt;
            if (e.ate >= 4 && e.taxT > 0.8) {
              /* every fourth mouthful: a gold needle volley back at the hand */
              e.ate -= 4; e.taxT = 0;
              const base = Math.atan2(p.y - e.y, p.x - e.x);
              for (let i = -1; i <= 1; i++) {
                const a = base + i * 0.18;
                S.ebullets.push({
                  kind: 'needle', red: true,
                  x: e.x + Math.cos(a) * (e.r + 5), y: e.y + Math.sin(a) * (e.r + 5),
                  vx: Math.cos(a) * CFG.needle.speed * 0.85, vy: Math.sin(a) * CFG.needle.speed * 0.85,
                  ang: a, age: 0, life: CFG.needle.life,
                });
              }
              SFX.needle();
            }
            break;
          }
          case 's_trace': { /* the tracer — it inks faint copies of whatever walks the paper */
            vx = ux * e.speed * sm * 0.8; vy = uy * e.speed * sm * 0.8;
            e.ang = Math.atan2(uy, ux);
            e.traceT = (e.traceT == null ? 3.5 : e.traceT) - dt;
            if (e.traceT <= 0 && S.enemies.length < broodCap) {
              /* a live ordinary beast to remember — never bosses, never its own kind */
              let pick = null;
              for (let tries = 0; tries < 6 && !pick; tries++) {
                const o = S.enemies[(RNG() * S.enemies.length) | 0];
                if (o && !o.dead && o !== e && !o.trace &&
                    !ENEMIES[o.type].boss && !ENEMIES[o.type].special && ENEMIES[o.type].cost > 0) pick = o.type;
              }
              if (pick) {
                e.traceT = 7;
                const a = rand(0, TAU);
                const c = spawnEnemy(pick, e.x + Math.cos(a) * (e.r + 12), e.y + Math.sin(a) * (e.r + 12));
                c.hp = Math.max(1, Math.round(c.maxHp * 0.55));
                c.trace = 1;
                c.kbx = Math.cos(a) * 150; c.kby = Math.sin(a) * 150;
                S.rings.push({ x: c.x, y: c.y, max: c.r * 2.4, life: 0.4, maxLife: 0.4, red: true });
                S.popups.push({ x: e.x, y: e.y - e.r - 10, txt: 'TRACED', life: 0.8, max: 0.8, red: true });
                SFX.elite();
              } else e.traceT = 2;
            }
            break;
          }

          /* ============ THE SECOND BREEDING (v19) ============
             nine new beasts, each bending the fight its own way */
          case 'rill': { /* the rill weaves — a stream that never runs straight */
            const wv = Math.sin(e.t * 3.4 + e.seed) * 0.85;
            vx = (ux - uy * wv) * e.speed * sm; vy = (uy + ux * wv) * e.speed * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'specter': { /* the specter phases — nearer every few breaths, unhurried */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.blinkT = (e.blinkT == null ? rand(2.2, 3.4) : e.blinkT) - dt;
            if (e.blinkT <= 0) {
              e.blinkT = 3.6;
              S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.8, alpha: 0.3 });
              const bd = rand(120, 180), ba = Math.atan2(p.y - e.y, p.x - e.x) + rand(-0.5, 0.5);
              e.x = p.x - Math.cos(ba) * bd; e.y = p.y - Math.sin(ba) * bd;
              S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.8, alpha: 0.35 });
              S.rings.push({ x: e.x, y: e.y, max: e.r * 2, life: 0.3, maxLife: 0.3 });
              SFX.blink();
            }
            break;
          }
          case 'horn': { /* the warhorn musters — its pulse drives the pack mad */
            vx = ux * e.speed * sm * 0.9; vy = uy * e.speed * sm * 0.9;
            e.ang = Math.atan2(uy, ux);
            e.hornT = (e.hornT == null ? rand(2, 3.2) : e.hornT) - dt;
            if (e.hornT <= 0) {
              e.hornT = 4.5;
              for (const o of S.enemies) {
                if (o === e || o.dead || ENEMIES[o.type].boss || ENEMIES[o.type].captain) continue;
                const ox = o.x - e.x, oy = o.y - e.y;
                if (ox * ox + oy * oy < 240 * 240) o.hornT = 2.2;
              }
              S.rings.push({ x: e.x, y: e.y, max: 240, life: 0.5, maxLife: 0.5 });
              S.popups.push({ x: e.x, y: e.y - e.r - 10, txt: 'MUSTERED', life: 0.7, max: 0.7, red: true });
              SFX.elite();
            }
            break;
          }
          case 'squall': { /* the squall circles — a storm that closes its hand */
            const tang = Math.atan2(uy, ux) + (e.seed > 3.14 ? 1 : -1) * Math.PI / 2;
            const pull = clamp((d - 40) * 1.6, -60, 90);
            vx = (Math.cos(tang) * e.speed + ux * pull) * sm;
            vy = (Math.sin(tang) * e.speed + uy * pull) * sm;
            e.ang = Math.atan2(uy, ux);
            break;
          }
          case 'eel': { /* the eel rushes in rivers — fast, and never straight */
            const wv = Math.sin(e.t * 5.2 + e.seed) * 1.1;
            vx = (ux - uy * wv) * e.speed * sm; vy = (uy + ux * wv) * e.speed * sm;
            e.ang = Math.atan2(vy, vx);
            break;
          }
          case 'giltwing': { /* the giltwing skirmishes — wounded, it flies rich and away */
            const flee = e.hp < e.maxHp;
            vx = ux * e.speed * sm * (flee ? -0.7 : 1); vy = uy * e.speed * sm * (flee ? -0.7 : 1);
            e.ang = Math.atan2(uy, ux);
            break;
          }
          case 'midas': { /* the midas transmutes — lesser beasts become coin */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.transT = (e.transT == null ? rand(3, 5) : e.transT) - dt;
            if (e.transT <= 0) {
              e.transT = 6;
              for (let tries = 0; tries < 8; tries++) {
                const o = S.enemies[(RNG() * S.enemies.length) | 0];
                if (o && o !== e && !o._trans && !ENEMIES[o.type].boss && !ENEMIES[o.type].special &&
                    !ENEMIES[o.type].captain && ENEMIES[o.type].cost > 0 && ENEMIES[o.type].cost <= 2) {
                  o._trans = 1;
                  S.popups.push({ x: o.x, y: o.y - o.r - 8, txt: 'TO COIN', life: 0.7, max: 0.7, red: true });
                  break;
                }
              }
            }
            break;
          }
          case 'stencil': { /* the stencil stamps — red seals pressed where you stand */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stenT = (e.stenT == null ? rand(2.4, 3.6) : e.stenT) - dt;
            if (e.stenT <= 0) {
              e.stenT = 4.2;
              S.bolts.push({ x: p.x + rand(-14, 14), y: p.y + rand(-14, 14), t: 0.9, r: 58, struck: false, life: 0, red: true, seal: 1 });
              SFX.wind();
            }
            break;
          }
          case 'fray': { /* the fray unravels — the seam sheds its stitches */
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.shedT = (e.shedT == null ? rand(2.5, 4) : e.shedT) - dt;
            if (e.shedT <= 0 && S.enemies.length < broodCap) {
              e.shedT = 5;
              for (let i = 0; i < 2; i++) {
                const a = rand(0, TAU);
                const c = spawnEnemy('stitchling', e.x + Math.cos(a) * (e.r + 8), e.y + Math.sin(a) * (e.r + 8));
                c.kbx = Math.cos(a) * 170; c.kby = Math.sin(a) * 170;
              }
              S.rings.push({ x: e.x, y: e.y, max: e.r * 2, life: 0.35, maxLife: 0.35 });
              SFX.blink();
            }
            break;
          }

          /* ============ THE CAPTAINS — the horde's officers ============ */
          case 'c_drum': case 'c_choir': case 'c_banner': case 'c_gale': case 'c_gild': case 'c_hush': {
            e.stateT += dt;
            const hurt = e.hp < e.maxHp * 0.5;
            /* ---- THE SURGE (v19) ----
               every few breaths the officer plants its feet, draws a
               telegraphed road through the paper, and TAKES it — the
               march breaks, the rank's heart hurls itself at the
               brush. The Hush surges silently: no wind, no cry. */
            e.surgeT = (e.surgeT == null ? rand(2.2, 3.4) : e.surgeT) - dt;
            if (e.surgeT <= 0 && e.state !== 'surge' && e.state !== 'surge-wind') {
              e.surgeT = CFG.captain.surgeEvery;
              e.state = 'surge-wind'; e.stateT = 0;
              if (e.type !== 'c_hush') {
                SFX.wind();
                S.telgs.push({ e, kind: 'line', len: 300, life: CFG.captain.surgeWind, maxLife: CFG.captain.surgeWind });
              }
            }
            if (e.state === 'surge-wind') {
              /* it plants its feet — a slow drift, the road still dark */
              vx = ux * e.speed * 0.3 * sm; vy = uy * e.speed * 0.3 * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > CFG.captain.surgeWind) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                e.state = 'surge'; e.stateT = 0;
                S.rings.push({ x: e.x, y: e.y, max: 60, life: 0.3, maxLife: 0.3, red: true });
                if (e.type !== 'c_hush') SFX.wind();
              }
            } else if (e.state === 'surge') {
              vx = e.px * CFG.captain.surgeSpeed; vy = e.py * CFG.captain.surgeSpeed;
              if (Math.random() < 0.35) S.stainQueue.push({ x: e.x, y: e.y, r: 6, alpha: 0.25, red: true });
              if (e.stateT > CFG.captain.surgeDur) { e.state = 'cruise'; e.stateT = 0; }
            } else if (e.type === 'c_gild') {
              /* the Paymaster sidesteps like the coin it is; the rest march at you */
              const sdir = Math.sin(e.seed + e.t * 0.6) > 0 ? 1 : -1;
              vx = (ux * 0.6 - uy * 0.55 * sdir) * e.speed * sm;
              vy = (uy * 0.6 + ux * 0.55 * sdir) * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
            } else {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
            }
            /* ---- THE MUSTER (v19) ----
               the officer does not trickle one replacement in: under
               its flag the rank remakes itself — a true swarm of its
               kindred fans out and hunts the brush. Wounded officers
               muster harder. Break the officer and the swarm stands
               still (the death-stun does its old work). */
            e.rallyT = (e.rallyT == null ? rand(2.4, 3.8) : e.rallyT) - dt;
            if (e.rallyT <= 0 && S.enemies.length < broodCap + 6) {
              e.rallyT = CFG.captain.swarmEvery;
              const kind = ENEMIES[e.type].summon;
              const n = hurt ? CFG.captain.swarmN + 2 : CFG.captain.swarmN;
              for (let i = 0; i < n; i++) {
                const a = rand(0, TAU);
                const c = spawnEnemy(kind, e.x + Math.cos(a) * (e.r + 12), e.y + Math.sin(a) * (e.r + 12));
                c.kbx = Math.cos(a) * 200; c.kby = Math.sin(a) * 200;
              }
              S.rings.push({ x: e.x, y: e.y, max: e.r * 3.2, life: 0.45, maxLife: 0.45, red: true });
              S.popups.push({ x: e.x, y: e.y - e.r - 10, txt: 'THE RANK MUSTERS', life: 0.8, max: 0.8, red: true });
              SFX.elite();
            }
            /* the command: each officer fights its own way */
            if (e.type === 'c_drum') {
              /* the drum beats — a red ring of slow ink when you press it */
              e.atkT = (e.atkT == null ? rand(1.5, 2.5) : e.atkT) - dt;
              if (e.atkT <= 0 && d < 380) {
                e.atkT = hurt ? 3.2 : 4.4;
                const n = hurt ? 8 : 6, off = rand(0, TAU);
                for (let i = 0; i < n; i++) {
                  const a = (i / n) * TAU + off;
                  S.ebullets.push({
                    kind: 'glob', red: true,
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * CFG.glob.speed * 0.8, vy: Math.sin(a) * CFG.glob.speed * 0.8,
                    ang: a, age: 0, life: CFG.glob.life,
                  });
                }
                S.rings.push({ x: e.x, y: e.y, max: 96, life: 0.3, maxLife: 0.3 });
                SFX.nova();
              }
            } else if (e.type === 'c_choir') {
              /* the choir sings — an aimed fan of five slow globs */
              e.atkT = (e.atkT == null ? rand(1.5, 2.5) : e.atkT) - dt;
              if (e.atkT <= 0 && d < 460) {
                e.atkT = hurt ? 3.4 : 4.6;
                const base = Math.atan2(p.y - e.y, p.x - e.x);
                for (let i = -2; i <= 2; i++) {
                  const a = base + i * 0.2;
                  S.ebullets.push({
                    kind: 'glob',
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * 185, vy: Math.sin(a) * 185,
                    ang: a, age: 0, life: CFG.glob.life * 1.2,
                  });
                }
                SFX.glob();
              }
            } else if (e.type === 'c_banner') {
              /* the banner marches THROUGH you — a lesser charge, telegraphed */
              if (e.state === 'cruise') {
                e.atkT = (e.atkT == null ? rand(1.6, 2.6) : e.atkT) - dt;
                if (e.atkT <= 0 && d < 400) {
                  e.state = 'windup'; e.stateT = 0; SFX.wind();
                  S.telgs.push({ e, kind: 'line', len: 280, life: 0.55, maxLife: 0.55 });
                }
              } else if (e.state === 'windup') {
                vx = 0; vy = 0;
                if (e.stateT > 0.55) {
                  e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                  e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                  e.state = 'charge'; e.stateT = 0;
                }
              } else if (e.state === 'charge') {
                vx = e.px * 440; vy = e.py * 440;
                if (Math.random() < 0.3) S.stainQueue.push({ x: e.x, y: e.y, r: 5, alpha: 0.26, red: true });
                if (e.stateT > 0.5) { e.state = 'cruise'; e.stateT = 0; e.atkT = hurt ? 2.4 : 3.4; }
              }
            } else if (e.type === 'c_gale') {
              /* the stormcaller marks the paper where you stand */
              e.atkT = (e.atkT == null ? rand(1.8, 2.8) : e.atkT) - dt;
              if (e.atkT <= 0 && d < 520) {
                e.atkT = hurt ? 4.2 : 5.6;
                for (let i = 0; i < 2; i++) {
                  const ba = rand(0, TAU), bd = rand(16, 120);
                  S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.85 + i * 0.3, r: 48, struck: false, life: 0, red: true });
                }
                SFX.wind();
              }
            } else if (e.type === 'c_gild') { /* the paymaster flings its gold back at the hand */
              /* (the hush carries no attack of its own — it only rallies,
                 and the silence around it IS its officer's voice) */
              e.atkT = (e.atkT == null ? rand(1.4, 2.4) : e.atkT) - dt;
              if (e.atkT <= 0 && d < 440) {
                e.atkT = hurt ? 3.0 : 4.2;
                const base = Math.atan2(p.y - e.y, p.x - e.x);
                for (let i = -1; i <= 1; i++) {
                  const a = base + i * 0.22;
                  S.ebullets.push({
                    kind: 'glob', red: true,
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * 205, vy: Math.sin(a) * 205,
                    ang: a, age: 0, life: CFG.glob.life,
                  });
                }
                SFX.glob();
              }
            }
            break;
          }

          /* ============ THE GUARDIANS & THEIR KEEPERS ============ */
          /* Every duel climbs three phases: the beast's old habit,
             a second habit laid over it, and the ENRAGED turn — a cry,
             a ring, a hit of stillness, and a faster, meaner rhythm.
             Hard by design, fair by telegraph. */
          case 'b_wheel': case 'k_blight': { /* THE STAIN / THE BLIGHT — slam, spit, then SPREAD */
            const mini = ENEMIES[e.type].boss === 2;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type]);
            const run = ph >= 1 ? 1.18 : 1;
            vx = ux * e.speed * sm * run; vy = uy * e.speed * sm * run;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            /* the ring slam — the old drum, faster every phase */
            if (e.state === 'cruise' && e.stateT > (ph === 2 ? 2.1 : ph === 1 ? 2.4 : mini ? 3.3 : 2.9)) {
              e.state = 'windup'; e.stateT = 0; SFX.wind();
              /* the paper blushes where the ring will land */
              S.telgs.push({ e, kind: 'ring', r: mini ? 165 : 205, life: 0.7, maxLife: 0.7 });
            }
            else if (e.state === 'windup' && e.stateT > 0.7) {
              e.state = 'cruise'; e.stateT = rand(0, 0.6);
              const n = (mini ? 7 : 10) + (ph >= 1 ? 3 : 0) + (ph === 2 ? 3 : 0) + (!mini && ph === 2 ? 10 : 0), off = rand(0, TAU);
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
            /* phase one: it spits between slams — an aimed three-fan */
            e.fanT = (e.fanT == null ? 1.4 : e.fanT) - dt;
            if (ph >= 1 && e.fanT <= 0 && e.state === 'cruise' && d < 430) {
              e.fanT = ph === 2 ? 1.5 : 2.1;
              const base = Math.atan2(p.y - e.y, p.x - e.x);
              for (let i = -1; i <= 1; i++) {
                const a = base + i * 0.24;
                S.ebullets.push({
                  kind: 'glob', red: true,
                  x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                  vx: Math.cos(a) * 210, vy: Math.sin(a) * 210,
                  ang: a, age: 0, life: CFG.glob.life,
                });
              }
              SFX.glob();
            }
            /* phase two: THE STAIN SPREADS — it bulldozes the page */
            if (ph === 2 && e.state === 'cruise') {
              e.chgT = (e.chgT == null ? 1.2 : e.chgT) - dt;
              if (e.chgT <= 0 && d < 420) {
                e.chgT = 3.4; e.state = 'chg-wind'; e.stateT = 0; SFX.wind();
                S.telgs.push({ e, kind: 'line', len: 340, life: 0.5, maxLife: 0.5 });
              }
            }
            if (e.state === 'chg-wind' && e.stateT > 0.5) {
              e.ang = Math.atan2(p.y - e.y, p.x - e.x);
              e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
              e.state = 'chg'; e.stateT = 0;
            } else if (e.state === 'chg') {
              vx = e.px * 520; vy = e.py * 520;
              if (Math.random() < 0.4) S.stainQueue.push({ x: e.x, y: e.y, r: 7, alpha: 0.3, red: true });
              if (e.stateT > 0.45) { e.state = 'cruise'; e.stateT = 0; }
            }
            /* GUARDIAN ONLY — the stain keeps its own kin: sponges
               drink the spillover of every slam (phase one on) */
            if (!mini && ph >= 1) {
              e.kinT = (e.kinT == null ? 5 : e.kinT) - dt;
              if (e.kinT <= 0 && S.enemies.length < broodCap + 6) {
                e.kinT = 8;
                for (const s of [-1, 1]) {
                  const c = spawnEnemy('blotter', e.x + s * 55, e.y + rand(-40, 40));
                  c.kbx = s * 140; c.kby = rand(-70, 70);
                }
                S.rings.push({ x: e.x, y: e.y, max: 110, life: 0.45, maxLife: 0.45, red: true });
                SFX.elite();
              }
            }
            break;
          }
          case 'b_mother': case 'k_husk': { /* THE NIGHT MOTHER / THE HUSK — blink, fan, spiral, brood */
            const mini = ENEMIES[e.type].boss === 2;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type]);
            e.stateT += dt;
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > (ph === 2 ? 1.7 : ph === 1 ? 2.5 : mini ? 3.9 : 3.4)) { e.state = 'dissolve'; e.stateT = 0; }
            } else if (e.state === 'dissolve') {
              if (e.stateT > 0.55) {
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 0.9, alpha: 0.4 });
                /* enraged, she surfaces CLOSER — the night leans in */
                const bd = ph === 2 ? rand(110, 160) : rand(140, 200);
                const ba = rand(0, TAU);
                e.x = p.x + Math.cos(ba) * bd; e.y = p.y + Math.sin(ba) * bd;
                S.stainQueue.push({ x: e.x, y: e.y, r: e.r * 1.1, alpha: 0.45 });
                S.rings.push({ x: e.x, y: e.y, max: e.r * 2.4, life: 0.35, maxLife: 0.35 });
                e.state = 'fan'; e.stateT = 0;
                SFX.blink();
              }
            } else if (e.state === 'fan') {
              if (e.stateT > 0.42) {
                const base = Math.atan2(p.y - e.y, p.x - e.x);
                const half = mini ? (ph >= 1 ? 2 : 1) : (ph === 2 ? 3 : 2);
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
                /* the brood: every second fan sheds — enraged, EVERY fan
                   sheds; the GUARDIAN's brood doubles again (four wide) */
                e.sheds = (e.sheds || 0) + 1;
                if ((ph === 2 || e.sheds % 2 === 0) && S.enemies.length < broodCap + 8) {
                  for (const s of (!mini && ph === 2 ? [-2, -1, 1, 2] : [-1, 1])) {
                    const c = spawnEnemy('shade', e.x + s * 40, e.y + rand(-30, 30));
                    c.kbx = s * 160; c.kby = rand(-80, 80);
                  }
                  SFX.blink();
                }
                e.state = 'cruise'; e.stateT = 0;
              }
            }
            /* phase one: the spiral — needles shed in a slow turning ring */
            e.spinT = (e.spinT || 0) + dt;
            if (ph >= 1 && e.spinT > (ph === 2 ? 2.0 : 2.7)) {
              e.spinT = 0;
              const nn = (mini ? 4 : 6) + (ph === 2 ? 2 : 0);
              const base = e.t * 2.2;
              for (let i = 0; i < nn; i++) {
                const a = base + (i / nn) * TAU;
                S.ebullets.push({
                  kind: 'needle', red: true,
                  x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                  vx: Math.cos(a) * CFG.needle.speed * 0.72, vy: Math.sin(a) * CFG.needle.speed * 0.72,
                  ang: a, age: 0, life: CFG.needle.life * 1.1,
                });
              }
              SFX.needle();
            }
            /* GUARDIAN ONLY — the night's own watch: an owl rides her
               shadow from phase one on */
            if (!mini && ph >= 1) {
              e.owlT = (e.owlT == null ? 6 : e.owlT) - dt;
              if (e.owlT <= 0 && S.enemies.length < broodCap + 6) {
                e.owlT = 10;
                const c = spawnEnemy('owl', e.x + rand(-60, 60), e.y + rand(-60, 60));
                S.rings.push({ x: c.x, y: c.y, max: 60, life: 0.4, maxLife: 0.4, red: true });
                SFX.elite();
              }
            }
            break;
          }
          case 'b_warlord': case 'k_cinder': { /* THE CINNABAR ONI / THE CINDER — charges that come AGAIN */
            const mini = ENEMIES[e.type].boss === 2;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type]);
            e.stateT += dt;
            if (e.state === 'cruise') {
              vx = ux * e.speed * sm; vy = uy * e.speed * sm;
              e.ang = Math.atan2(uy, ux);
              if (e.stateT > (ph === 2 ? 1.2 : ph === 1 ? 1.7 : mini ? 2.7 : 2.3)) {
                e.state = 'windup'; e.stateT = 0;
                e.charges = ph === 2 ? 2 : ph === 1 ? 1 : 0;   /* the roads behind you */
                SFX.wind(); S.telgs.push({ e, kind: 'line', len: mini ? 300 : 360, life: 0.6, maxLife: 0.6 });
              }
            } else if (e.state === 'windup') {
              if (e.stateT > 0.6) {
                e.ang = Math.atan2(p.y - e.y, p.x - e.x);
                e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
                e.state = 'charge'; e.stateT = 0;
              }
            } else if (e.state === 'charge') {
              vx = e.px * (ph === 2 ? 680 : ph === 1 ? 620 : 540); vy = e.py * (ph === 2 ? 680 : ph === 1 ? 620 : 540);
              if (Math.random() < 0.35) S.stainQueue.push({ x: e.x, y: e.y, r: 7, alpha: 0.3, red: true });
              if (e.stateT > 0.72) { e.state = 'skid'; e.stateT = 0; }
            } else if (e.state === 'skid') {
              vx = e.px * 110; vy = e.py * 110;
              if (e.stateT > 0.35) {
                if (e.charges > 0) {
                  /* ANOTHER road through: it re-plants and comes again */
                  e.charges--;
                  e.state = 'windup'; e.stateT = 0;
                  SFX.wind(); S.telgs.push({ e, kind: 'line', len: mini ? 300 : 360, life: 0.45, maxLife: 0.45 });
                } else {
                  e.state = 'spit'; e.stateT = 0;
                  /* GUARDIAN ONLY — the charge ends in a slam: the
                     paper itself knocks the brush back */
                  if (!mini) {
                    if (d < 170) { p.vx += ux * 380; p.vy += uy * 380; }
                    S.rings.push({ x: e.x, y: e.y, max: 170, life: 0.4, maxLife: 0.4, red: true });
                    S.shake = Math.max(S.shake, 9);
                    SFX.nova();
                  }
                  const base = Math.atan2(p.y - e.y, p.x - e.x);
                  const half = ph === 2 ? (mini ? 3 : 5) : mini ? 2 : 3;
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
                }
              }
            } else { /* spit settle */
              if (e.stateT > 0.35) { e.state = 'cruise'; e.stateT = 0; }
            }
            /* phase two: the warlord calls its kin, every nine breaths */
            if (ph === 2) {
              e.kinT = (e.kinT == null ? 4.5 : e.kinT) - dt;
              if (e.kinT <= 0 && S.enemies.length < broodCap + 8) {
                e.kinT = 9;
                /* GUARDIAN ONLY — TWO kin answer the horn */
                for (let ki = 0; ki < (mini ? 1 : 2); ki++) {
                  const c = spawnEnemy('oni', e.x + rand(-60, 60), e.y + rand(-60, 60));
                  S.rings.push({ x: c.x, y: c.y, max: 60, life: 0.4, maxLife: 0.4, red: true });
                }
                SFX.elite();
              }
            }
            break;
          }
          case 'b_tempest': case 'k_veil': { /* THE STORM EYE / THE RAINVEIL — orbit, spiral, bolts, and the eye that STOPS */
            const mini = ENEMIES[e.type].boss === 2;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type]);
            if (e.state === 'still') {
              /* phase two: THE EYE TURNS — it stops, the paper holds its breath */
              vx = 0; vy = 0;
              e.stateT += dt;
              if (e.stateT > 0.9) {
                e.state = 'cruise'; e.stateT = 0; e.spinT = 0;
                const nn = (mini ? 8 : 12) + (ph === 2 ? 4 : 0);
                const off = rand(0, TAU);
                for (let i = 0; i < nn; i++) {
                  const a = (i / nn) * TAU + off;
                  S.ebullets.push({
                    kind: 'needle', red: true,
                    x: e.x + Math.cos(a) * (e.r + 6), y: e.y + Math.sin(a) * (e.r + 6),
                    vx: Math.cos(a) * CFG.needle.speed * 0.85, vy: Math.sin(a) * CFG.needle.speed * 0.85,
                    ang: a, age: 0, life: CFG.needle.life * 1.2,
                  });
                }
                S.rings.push({ x: e.x, y: e.y, max: 230, life: 0.5, maxLife: 0.5, red: true });
                S.shake = Math.max(S.shake, 9);
                SFX.nova();
              }
            } else {
              const ringD = 250;
              const tangent = Math.atan2(uy, ux) + (e.seed > 3.14 ? 1 : -1) * Math.PI / 2;
              const pull = clamp((d - ringD) * 2.2, -80, 80);
              vx = (Math.cos(tangent) * e.speed + ux * pull) * sm;
              vy = (Math.sin(tangent) * e.speed + uy * pull) * sm;
              e.ang = Math.atan2(uy, ux);
              e.stateT += dt;
              e.spinT = (e.spinT || 0) + dt;
              if (e.spinT > (ph === 2 ? 1.4 : ph === 1 ? 1.8 : mini ? 2.7 : 2.3)) {
                e.spinT = 0;
                const base = e.t * 1.9;
                const nn = (mini ? 3 : 4) + (ph >= 1 ? 2 : 0);
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
              if (e.boltT > (ph === 2 ? 3.0 : ph === 1 ? 4.2 : mini ? 6.2 : 5.2)) {
                e.boltT = 0;
                const nb = mini ? 2 : ph === 2 ? 6 : ph >= 1 ? 4 : 3;
                for (let i = 0; i < nb; i++) {
                  const ba = rand(0, TAU), bd = rand(20, 150);
                  S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.85 + i * 0.3, r: 54, struck: false, life: 0 });
                }
                SFX.wind();
              }
              /* GUARDIAN ONLY — the storm's own birds ride its edge */
              if (!mini && ph >= 1) {
                e.crT = (e.crT == null ? 7 : e.crT) - dt;
                if (e.crT <= 0 && S.enemies.length < broodCap + 6) {
                  e.crT = 11;
                  for (const s of [-1, 1]) {
                    const c = spawnEnemy('crane', e.x + s * 70, e.y + rand(-40, 40));
                    c.kbx = s * 160; c.kby = rand(-60, 60);
                  }
                  SFX.elite();
                }
              }
              /* phase two: the storm closes — telegraphed, then the ring breaks */
              if (ph === 2) {
                e.eyeT = (e.eyeT == null ? 3.5 : e.eyeT) - dt;
                if (e.eyeT <= 0) {
                  e.eyeT = 6.5; e.state = 'still'; e.stateT = 0;
                  S.telgs.push({ e, kind: 'ring', r: 230, life: 0.9, maxLife: 0.9 });
                  SFX.wind();
                }
              }
            }
            break;
          }
          case 'b_origin': case 'k_nib': { /* THE FIRST BRUSH / THE NIB — volleys, fan, brood, charge: the whole kit */
            const mini = ENEMIES[e.type].boss === 2;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type]);
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            /* the volley — its oldest habit, denser every phase */
            e.vT = (e.vT || 0) + dt;
            if (e.vT > (ph === 2 ? 1.8 : ph === 1 ? 2.3 : mini ? 3.8 : 3.2)) {
              e.vT = 0;
              const n = (mini ? 7 : 10) + (ph === 1 ? 2 : 0) + (ph === 2 ? 4 : 0);
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
            /* phase one: the aimed fan between volleys — the old brush takes aim */
            e.aT = (e.aT || 0) + dt;
            if (ph >= 1 && e.aT > (ph === 2 ? 1.8 : 2.4) && d < 460) {
              e.aT = 0;
              const base = Math.atan2(p.y - e.y, p.x - e.x);
              /* GUARDIAN ONLY — the aimed fan opens to NINE blades */
              const ahalf = (!mini && ph === 2) ? 4 : 2;
              for (let i = -ahalf; i <= ahalf; i++) {
                const a = base + i * 0.19;
                S.ebullets.push({
                  kind: 'drop', red: true,
                  x: e.x + Math.cos(a) * (e.r + 8), y: e.y + Math.sin(a) * (e.r + 8),
                  vx: Math.cos(a) * 235, vy: Math.sin(a) * 235,
                  ang: a, age: 0, life: 2.2,
                });
              }
              SFX.glob();
            }
            /* the brood — its students walk in phase two sooner */
            e.sT = (e.sT || 0) + dt;
            if (e.sT > (ph === 2 ? 5.5 : 7.5)) {
              e.sT = 0;
              if (S.enemies.length < broodCap + 8) {
                /* GUARDIAN ONLY — the enraged students come four wide */
                const sPair = (!mini && ph === 2) ? [-2, -1, 1, 2] : [-1, 1];
                for (const s of sPair) {
                  const kind = (!mini && ph === 2 && Math.abs(s) === 2) ? 'kage' : (ph === 2 ? 'oni' : 'slab');
                  const c = spawnEnemy(kind, e.x + s * 55, e.y + rand(-40, 40));
                  c.kbx = s * 140; c.kby = rand(-70, 70);
                }
                S.rings.push({ x: e.x, y: e.y, max: 120, life: 0.45, maxLife: 0.45, red: true });
                SFX.elite();
              }
            }
            /* the charge */
            if (ph >= 1 && e.state === 'cruise' && e.stateT > (ph === 2 ? 3.2 : 4.2)) {
              e.state = 'windup'; e.stateT = 0; SFX.wind();
              S.telgs.push({ e, kind: 'line', len: mini ? 300 : 360, life: 0.55, maxLife: 0.55 });
            } else if (e.state === 'windup' && e.stateT > 0.55) {
              e.ang = Math.atan2(p.y - e.y, p.x - e.x);
              e.px = Math.cos(e.ang); e.py = Math.sin(e.ang);
              e.state = 'charge'; e.stateT = 0;
            } else if (e.state === 'charge') {
              vx = e.px * (ph === 2 ? 600 : 520); vy = e.py * (ph === 2 ? 600 : 520);
              if (e.stateT > 0.55) { e.state = 'cruise'; e.stateT = 0; }
            }
            break;
          }
          case 'b_blank': case 'k_edge': { /* THE UNWRITTEN / THE MARGIN — it erases, re-stamps, and redraws */
            const mini = ENEMIES[e.type].boss === 2;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type]);
            vx = ux * e.speed * sm; vy = uy * e.speed * sm;
            e.ang = Math.atan2(uy, ux);
            e.stateT += dt;
            /* the erase pulse — a breath of blank that sweeps the hand's ink
               back off the page: droplets burst, motes are pushed outward */
            e.eT = (e.eT == null ? (mini ? 3.4 : 2.8) : e.eT) - dt;
            if (e.eT <= 0) {
              e.eT = ph === 2 ? (mini ? 3.6 : 3.0) : mini ? 5.2 : 4.4;
              e.state = 'erase'; e.stateT = 0;
              S.telgs.push({ e, kind: 'ring', r: 240, life: 0.8, maxLife: 0.8 });
              SFX.wind();
            }
            if (e.state === 'erase' && e.stateT > 0.8) {
              e.state = 'cruise'; e.stateT = 0;
              for (let i = S.bullets.length - 1; i >= 0; i--) {
                const b = S.bullets[i];
                const dx = b.x - e.x, dy = b.y - e.y;
                if (dx * dx + dy * dy < 240 * 240) { burst(b.x, b.y, 3, false); S.bullets.splice(i, 1); }
              }
              for (const mt of S.motes) {
                const dx = mt.x - e.x, dy = mt.y - e.y;
                const dd = Math.hypot(dx, dy);
                if (dd < 260 && dd > 0.01) { mt.x = e.x + (dx / dd) * 260; mt.y = e.y + (dy / dd) * 260; }
              }
              if (d < 250) { p.vx += ux * 300; p.vy += uy * 300; }
              S.rings.push({ x: e.x, y: e.y, max: 240, life: 0.45, maxLife: 0.45, red: true });
              S.shake = Math.max(S.shake, 8);
              S.popups.push({ x: e.x, y: e.y - e.r - 12, txt: 'ERASED', life: 0.9, max: 0.9, red: true });
              SFX.nova();
            }
            /* the seal slams — telegraphed stamps pressed where you stand (phase one) */
            if (ph >= 1 && e.state === 'cruise') {
              e.sT2 = (e.sT2 == null ? 2.4 : e.sT2) - dt;
              if (e.sT2 <= 0 && d < 560) {
                e.sT2 = ph === 2 ? 3.0 : 4.4;
                const n = !mini ? (ph === 2 ? 3 : 2) : (ph === 2 ? 2 : 1);
                for (let i = 0; i < n; i++) {
                  const ba = rand(0, TAU), bd = i === 0 ? rand(10, 60) : rand(70, 150);
                  S.bolts.push({ x: p.x + Math.cos(ba) * bd, y: p.y + Math.sin(ba) * bd, t: 0.9, r: 62, struck: false, life: 0, red: true, seal: 1 });
                }
                SFX.wind();
              }
            }
            /* GUARDIAN ONLY — what was erased comes back RESTAMPED */
            if (ph === 2 && !mini) {
              e.resT = (e.resT == null ? 6 : e.resT) - dt;
              if (e.resT <= 0 && S.enemies.length < broodCap + 8) {
                e.resT = 12;
                const c = spawnEnemy('reseal', e.x + rand(-60, 60), e.y + rand(-60, 60));
                S.rings.push({ x: c.x, y: c.y, max: 80, life: 0.4, maxLife: 0.4, red: true });
                SFX.elite();
              }
            }
            /* the brood — the page redraws its underdrawing (phase two) */
            if (ph === 2 && !mini) {
              e.bT = (e.bT == null ? 3.0 : e.bT) - dt;
              if (e.bT <= 0 && S.enemies.length < broodCap + 8) {
                e.bT = 8;
                for (const s of [-1, 1]) {
                  const c = spawnEnemy('sketch', e.x + s * 55, e.y + rand(-40, 40));
                  c.kbx = s * 150; c.kby = rand(-70, 70);
                }
                S.rings.push({ x: e.x, y: e.y, max: 120, life: 0.45, maxLife: 0.45, red: true });
                SFX.elite();
              }
            }
            break;
          }

          /* ============ THE TEN SEALS (v19.1) ============
             every def.form boss fights from the keeper kit: chase,
             three enrage phases, and the two abilities its def names */
          default: {
            const kdef = ENEMIES[e.type];
            if (!kdef.form) break;
            const ph = enrageCheck(e, ENRAGE_CRY[e.type] || (kdef.name + ' TURNS'));
            /* state-casts run their own rhythm; a quiet beast walks */
            if (kitState(e, dt, ph, p)) { vx = 0; vy = 0; break; }
            if (e.state === 'chg') {
              vx = e.px * 520; vy = e.py * 520;
            } else if (kdef.ab[0] === 'orbit' || kdef.ab[1] === 'orbit') {
              /* hold the ring at a spear's length — the duel circles */
              const ringD = 250;
              const tangent = Math.atan2(uy, ux) + (e.seed > 3.14 ? 1 : -1) * Math.PI / 2;
              const pull = clamp((d - ringD) * 2.2, -80, 80);
              vx = (Math.cos(tangent) * e.speed + ux * pull) * sm;
              vy = (Math.sin(tangent) * e.speed + uy * pull) * sm;
              e.ang = Math.atan2(uy, ux);
            } else {
              const ch = kitChase(e, ux, uy, sm, ph);
              if (ch) { vx = ch[0]; vy = ch[1]; e.ang = Math.atan2(uy, ux); }
            }
            kitAct(e, 0, kdef.ab[0], dt, ph, d, p, ux, uy, broodCap);
            kitAct(e, 1, kdef.ab[1], dt, ph, d, p, ux, uy, broodCap);
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

    /* the midas's coin: transmutations settle after the march —
       the touched body pays its score and returns as a koban */
    for (let i = S.enemies.length - 1; i >= 0; i--) {
      const o = S.enemies[i];
      if (!o._trans) continue;
      const px = o.x, py = o.y;
      S.enemies.splice(i, 1);
      killEnemy(o);
      const c = spawnEnemy('koban', px, py);
      c.transmuted = 1;
      S.rings.push({ x: px, y: py, max: 70, life: 0.45, maxLife: 0.45 });
      SFX.elite();
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
        if (e.faint) continue;   /* the underdrawing has no body to touch */
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.r + p.r - 2;
        if (dx * dx + dy * dy < rr * rr) {
          /* the smother's grip: its touch weighs the brush down */
          if (e.type === 'smother' && S.playerSlowT <= 0.35) {
            S.playerSlowT = 1.2;
            S.popups.push({ x: p.x, y: p.y - 20, txt: 'GRIPPED', life: 0.7, max: 0.7 });
          }
          takeHit(); break;
        }
      }
    }

    /* the bounded page holds its beasts: nothing wanders past the margins */
    if (arenaOn()) for (const e of S.enemies) clampArena(e, e.r);
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
        const sp = spawnEnemy(mk.type, mk.x, mk.y, { elite: !!mk.elite && !mk.boss });
        /* an Assembly echo arrives thinned: the scene's boss, one
           third of its ink, its kit and its color intact */
        if (mk.echo) {
          sp.echo = 1;
          sp.maxHp = Math.max(1, Math.round(sp.maxHp * 0.32));
          sp.hp = sp.maxHp;
        }
        if (mk.boss) { S.shake = Math.max(S.shake, 10); SFX.elite(); }
        else if (mk.elite) { S.shake = Math.max(S.shake, 7); SFX.elite(); }
      }
    }
  }

  /* ---------------- THE ASSEMBLY (v19.1) ----------------
     the tenth scene's tenth wave: the Guardian fights, and the
     sheet's ten seals come back to stand beside it. Three beats —
     at 72%, 45% and 20% of the Guardian's ink — three, three and
     four echoes rise at the paper's edge, each the scene's own
     boss at a third of its ink. By the last beat the arena holds
     the whole scroll at once. */
  function updateAssembly(dt) {
    const A = S.assembly;
    if (!A || !S.waveActive) return;
    const g = S.enemies.find(e => e.type === A.area.boss && !e.dead);
    if (!g) { if (S.markers.every(m => m.type !== A.area.boss)) S.assembly = null; return; }
    const frac = g.hp / g.maxHp;
    const beat = A.beats[A.fired];
    if (!beat || frac > beat.hp) return;
    A.fired++;
    const list = A.area.keepers || [A.area.keeper];
    const start = A.fired === 1 ? 0 : A.fired === 2 ? 3 : 6;
    const ids = list.slice(start, start + beat.n);
    ids.forEach((id, i) => {
      const pt = edgePoint(i % 4);
      S.markers.push({ type: id, x: pt.x, y: pt.y, t: 2.2 + i * 0.45, elite: true, boss: true, echo: 1 });
    });
    S.rings.push({ x: g.x, y: g.y, max: 320, life: 0.7, maxLife: 0.7, red: true });
    S.shake = Math.max(S.shake, 14);
    const cry = A.fired === 1 ? 'THE ASSEMBLY — THE FIRST SEAL RETURNS' : A.fired === 2 ? 'THE ASSEMBLY — THE SHEET STIRS' : 'THE ASSEMBLY — ALL TEN STAND';
    S.popups.push({ x: g.x, y: g.y - g.r - 24, txt: cry, life: 1.6, max: 1.6, red: true });
    S.redFlash = Math.max(S.redFlash || 0, 0.3);
    SFX.gong();
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
        /* a ring closes around the brush — the surge encircles.
           On a bounded page the ring flattens against the margins. */
        const off = Math.random() * Math.PI * 2;
        for (let i = 0; i < group; i++) {
          const type = S.queue.pop();
          const a = off + (i / group) * Math.PI * 2;
          const pad = CFG.world.spawnPad;
          const ax = Math.abs(Math.cos(a)) > 1e-4 ? (S.W / 2 + pad) / Math.abs(Math.cos(a)) : Infinity;
          const ay = Math.abs(Math.sin(a)) > 1e-4 ? (S.H / 2 + pad) / Math.abs(Math.sin(a)) : Infinity;
          const t2 = Math.min(ax, ay) + rand(20, 110);
          const mk = { type, x: S.player.x + Math.cos(a) * t2, y: S.player.y + Math.sin(a) * t2, t: 0.62 };
          if (arenaOn()) clampArena(mk, 70);
          S.markers.push(mk);
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
    /* the ghost's scribe writes its stroke, a breath behind the hand */
    if (S.rec && S.rec.frames.length < GHOST_MAX) {
      S.rec.acc += dt;
      if (S.rec.acc >= GHOST_DT) {
        S.rec.acc -= GHOST_DT;
        S.rec.t += GHOST_DT;
        S.rec.frames.push(S.rec.t.toFixed(1) + ',' + Math.round(S.player.x) + ',' + Math.round(S.player.y));
      }
    }
    if (S.ghost && S.mode === 'playing') ghostAdvance(dt);
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
    updateScribes(dt);
    updateSpirits(dt);
    updateMotes(dt);
    updatePickups(dt);
    updateArcs(dt);
    updateVortices(dt);
    updateBolts(dt);
    updateMarkers(dt);
    updateAssembly(dt);
    updateSpawning(dt);
    updateFx(dt);

    /* the fx budget: rings and score words keep their caps too */
    if (S.rings.length > CFG.fx.ringCap) S.rings.splice(0, S.rings.length - CFG.fx.ringCap);
    if (S.popups.length > CFG.fx.popupCap) S.popups.splice(0, S.popups.length - CFG.fx.popupCap);

    UI.setXp(st.xp / CFG.xp.req(st.xpLevel), st.xpLevel);

    /* the red beast's seal, worn on the top of the sheet.
       The Guardian outranks its echoes; when several stand, the
       bar says so. */
    let boss = null, bossN = 0;
    for (const e of S.enemies) if (ENEMIES[e.type].boss) { bossN++; if (!boss || ENEMIES[e.type].boss === 1) boss = e; }
    if (!boss) {
      for (const m of S.markers) if (m.boss) { boss = { name: ENEMIES[m.type].name, marker: true, keeper: ENEMIES[m.type].boss === 2 }; break; }
    }
    const asBar = areaStateFor(st.wave);
    if (boss && !boss.marker) {
      const bdef = ENEMIES[boss.type];
      const kick = bossN > 1
        ? 'THE ASSEMBLY — ' + bossN + ' STAND'
        : bdef.boss === 2 ? 'KEEPER — SCENE ' + asBar.level : 'GUARDIAN — SHEET ' + asBar.area.id;
      UI.setBoss(bdef.name, boss.hp / boss.maxHp, kick);
    }
    else if (boss && boss.marker) UI.setBoss(boss.name, 1, boss.keeper ? 'KEEPER — SCENE ' + asBar.level : 'GUARDIAN — SHEET ' + asBar.area.id);
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
             (the endless scroll never rests — its seal still owes a stroke)
             v19.1: on a guardian wave the UNROLL waits here — the
             sheet seals on film only when the last echo has fallen */
          if (S.pendingUnroll) {
            const pu = S.pendingUnroll; S.pendingUnroll = null;
            S.mode = 'cutscene';
            UI.hud(false);
            UI.show(null);
            CUT.start('unroll', pu);
          }
          else if (S.runMode === 'journey') showLevelClear();
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
    if (S.dyingT <= 0) {
      S.dyingT = Infinity;   /* the fall reports once — the purse pays once */
      showOver(false);
    }
  }

  /* ---------------- attract mode (title backdrop) ----------------
     a few light spirits drift through a band BELOW the menu's ink —
     scenery, never a smear across the title's words (v15: the old
     band sat exactly on the tagline and the rail). The band is cut
     from the live viewport height so it holds on every paper. */
  function attractBand() {
    const top = Math.max(120, S.H * 0.30);
    return [top, Math.max(top + 40, S.H * 0.44)];
  }
  function initAttract() {
    S.idle = [];
    const types = ['pulse', 'dart', 'spit', 'split', 'moth', 'wraith'];
    const [bandTop, bandBot] = attractBand();
    for (let i = 0; i < 5; i++) {
      const type = types[Math.floor(rand(0, types.length))];
      const r = ENEMIES[type].r * 0.62;
      const x = rand(-420, 420);
      const y = rand(bandTop, bandBot);
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
    const [bandTop, bandBot] = attractBand();
    for (const d of S.idle) {
      d.x += d.vx * dt; d.y += d.vy * dt; d.t += dt;
      d.ang += dt * 0.25;
      /* the band keeps them: a soft pull home, below the words */
      if (d.x > 460) d.vx -= 30 * dt; else if (d.x < -460) d.vx += 30 * dt;
      if (d.y > bandBot) d.vy -= 34 * dt; else if (d.y < bandTop) d.vy += 34 * dt;
      const sp = Math.hypot(d.vx, d.vy);
      if (sp > 22) { d.vx *= 22 / sp; d.vy *= 22 / sp; }
    }
    updateFx(dt);
  }

  /* ---------------- api ---------------- */
  /* cutscene handoff: a scroll film resumes the run, the unroll film
     hands the sealed sheet to the level-clear rest (the seal was
     earned — the SCROLL TURNS box must follow the film, or the run
     stalls on an empty page and the tenth seal never records), the
     finale shows the sheet */
  CUT.onEnd = () => {
    if (CUT.lastKind === 'finale') { showOver(true); return; }
    if (CUT.lastKind === 'unroll') { showLevelClear(); return; }
    S.mode = 'playing';
    UI.hud(true);
  };

  return {
    S,
    get mode() { return S.mode; },
    set mode(m) { S.mode = m; },
    startRun, continueEndless, abandon, deploy, pickAt, clearNext, clearHome,
    update, updateDying, updateIdle, initAttract,
    getBest, getRuns, getFurthest, getUnlocked, getCleared, getProg, getSeals, frontierLevel, checkpointPower, getBrush, setBrush,
    scenesSealed, brushUnlocked,
    getHard, setHard, setRival, rivalArmed, dailyState,
    /* the purse (v8.8): the charm room and the QA probes read these */
    getInk, setInk, charmLv, charmRankCount, charmCap, buyCharm, getThemeSetting, setThemeSetting,
    get qaDaily() { return qaDaily; },
    /* ?god=1 sibling probe: synthetic ink storms for the perf sweep */
    qaBurst(n, big) { for (let i = 0; i < n; i++) burst(S.player.x + (Math.random() - 0.5) * 500, S.player.y + (Math.random() - 0.5) * 500, 12, !!big); },
  };
})();
