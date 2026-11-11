'use strict';
/* ============================================================
   ONE MORE — tuning constants, ink-beast roster, upgrade pool,
   the six scrolls (areas), their Guardians, and the endless
   paper. Edit this file to rebalance the world.
   ============================================================ */

const CFG = {
  player: {
    r: 10,
    speed: 250,        // px/s
    hp: 3,
    invuln: 1.1,       // s of immunity after a hit
  },

  /* starting brushes — THE ONE BRUSH, ONE BLADE law (v19).
     The brush IS the weapon: choose one and the run begins with that
     arm and nothing else — there is no universal volley hiding behind
     it. Each atk block is the weapon's own body:
       kind 'bolts' — the brush fires its own projectiles: the
         needle's thread, the broom's sweep, the stone's lob, the
         wisp's homing breath;
       kind 'gust'  — the folded fan: a cone of paper blades driven
         by the fan loop, seeded at rank 1;
       kind 'none'  — no projectiles at all: the Tide answers with
         its nova, the Red Seal with its stamp, the Scribe with the
         living stroke that weaves through the horde.
     The sealed brushes open as the journey's scenes are SEALED (a
     scene seals when its tenth wave's Keeper falls): three scenes
     wake the Wisp, six the Fan, ten — one whole sheet — the Tide,
     fourteen the Red Seal, eighteen the Scribe. Locked brushes
     cannot be chosen; the shelf of seals is the key. */
  brushes: {
    needle: { name: 'THE NEEDLE', kanji: '細', desc: 'A fine tip that barely lifts. A thread of ink, cast fast and true.',
      atk: { kind: 'bolts', cd: 0.30, shots: 1, dmg: 1, speed: 640, life: 0.78, spread: 0.10, bkind: 'needle' } },
    broom:  { name: 'THE BROOM', kanji: '掃', desc: 'A wide brush that sweeps two droplets at once, broad and slow.',
      atk: { kind: 'bolts', cd: 0.58, shots: 2, dmg: 1, speed: 520, life: 0.60, spread: 0.34, bkind: 'drop' } },
    stone:  { name: 'THE STONE', kanji: '岩', desc: 'A heavy hand. A slow lob that bites deep and splashes where it lands.',
      atk: { kind: 'bolts', cd: 0.92, shots: 1, dmg: 3, speed: 430, life: 0.92, spread: 0.06, bkind: 'stone', splash: 46 },
      mods: { maxHp: 4, moveMult: 0.9 } },
    wisp:   { name: 'THE WISP', kanji: '幽', unlock: 3,
      desc: 'The brush breathes homing wisps — and a lesser spirit wakes beside it, hunting on its own.',
      atk: { kind: 'bolts', cd: 0.80, shots: 1, dmg: 1, speed: 330, life: 2.4, spread: 0.05, bkind: 'wisp', homing: 6.5 },
      mods: { spirit: 1 } },
    fan:    { name: 'THE FAN', kanji: '扇', unlock: 6,
      desc: 'Carries a folded fan. A cone of paper blades with every swing; every fifth snaps full-circle.',
      atk: { kind: 'gust' },
      mods: { fan: 1 } },
    tide:   { name: 'THE TIDE', kanji: '潮', unlock: 10,
      desc: 'No arrows — the ink itself answers: a black surge rolls outward, and the wake you leave still bites.',
      atk: { kind: 'none' },
      mods: { nova: 1 } },
    seal:   { name: 'THE RED SEAL', kanji: '印', unlock: 14,
      desc: 'A great hanko. Every few breaths the stamp falls on the thickest horde — and few under it rise fast.',
      atk: { kind: 'none' },
      mods: { hanko: 1 } },
    scribe: { name: 'THE SCRIBE', kanji: '書', unlock: 18,
      desc: 'The master\u2019s way: no arrows at all. One living stroke weaves through the horde, unbroken, biting all it passes.',
      atk: { kind: 'none' },
      mods: { scribe: 1 } },
  },

  /* the world is unbounded — the brush walks an endless sheet.
     THE JOURNEY and the daily sheet are different papers: they live
     INSIDE a fixed arena (a page with margins), the same size on
     every screen; only THE ENDLESS SCROLL keeps the unbroken sheet. */
  world: {
    spawnPad: 90,      // how far beyond the screen edge beasts are born
    stainCap: 430,     // max dried stains kept on the paper
    stainFade: 0.075,  // alpha lost per second (dried ink fades)
    decoCell: 260,     // world-cell size for ambient paper marks
    arena: { w: 2240, h: 1600, inset: 26 },  // the bounded page (journey/daily)
    arenaSpawnGap: 420, // beasts never walk in closer than this to the brush
  },

  /* ---- THE 10-WAVE SYSTEM, THE 10-LEVEL SYSTEM ----
     A sheet (paper) holds ten levels; a level holds ten waves.
     A scroll opens only when the scroll before it lies finished:
     ten levels, ten waves each, its Guardian felled. The pressure
     climbs twice — wave by wave inside a level, and level by level
     inside the sheet, so the tenth level of a sheet always bites
     far harder than its first — and the sheets themselves climb,
     so the last paper is a silk no first-paper hand survives.
     Each wave of the ten has a shape:
       1 opening   — a light trickle to read the page
       2 press     — the ordinary weight of the sheet
       3 debut     — the level's new beast walks in, featured
       4 press     —
       5 SURGE     — a ring closes around the brush
       6 press     — the debut beast now mixes with the rest
       7 SEAL HUNT — elites walk the paper
       8 FLOOD     — everything from two sides at once
       9 SURGE     — the storm before the seal
       10 SEAL     — the level's seal wave: an elite pack to break,
                     and on the tenth level, the Guardian itself */
  wave: {
    wavesPerLevel: 10,
    levelsPerArea: 10,                             // ten levels a sheet
    budget: (w, depth) => 4.6 + w * 3.2 + depth * 1.12, // depth = level + 10*(sheet-1), 0-based
    levelBudget: lv => 1 + 0.09 * (lv - 1),        // the climb INSIDE a sheet: L10 spends ~1.81× L1
    levelHp:     lv => 1 + 0.07 * (lv - 1),        // and its beasts stand ~1.63× taller
    surgeWaves: [5, 9],                            // the surge waves of a level
    surgeMult: 1.75,                               // + a little per depth (game.js)
    groupInterval: w => Math.max(0.18, 1.12 - w * 0.07),
    groupSize: (w, depth) => Math.min(16, 3 + Math.floor(w / 2.5) + Math.floor(depth / 2.6)),
    concurrentCap: (w, depth) => Math.min(150, 13 + w * 2.0 + depth * 3.3),
    hpScale: (base, w, intro) => Math.max(1, Math.round(base * (1 + 0.05 * (w - intro)))),
    spScale: (w, intro) => Math.min(1.5, 1 + 0.007 * (w - intro)),
    eliteHpMult: 6.5,
    eliteR: 1.62,
    sealBudget: 1.4,                               // honor-guard fodder on seal waves
    elitesAt: depth => 1 + Math.min(4, Math.floor(depth / 9)),   // seals grow heavier, sooner
  },

  /* ---- ink motes & level-ups: the survivors' loop ---- */
  xp: {
    req: lv => Math.round(7 + 5.4 * lv + 0.2 * lv * lv), // ink needed for level lv→lv+1
    moteLife: 26,      // s before a mote dries into the paper
    pickupR: 68,       // base collection radius (magnet passive extends it)
    magnetPulse: 3.2,  // s the magnet talisman vacuums everything
    cap: 240,          // max motes on the sheet
  },

  /* fx budget: a flood may kill hundreds of beasts a second — without
     a ceiling the ink storm buries the frame (6k live particles
     measured at ~12 fps headless). Over the soft budget every burst
     thins; past the hard cap the oldest flecks are recycled. */
  fx: {
    particleCap: 900,  // hard ceiling on live flecks
    softCap: 600,      // bursts begin thinning here
    ringCap: 80,       // shockwave rings
    popupCap: 60,      // floating score words
  },

  /* combo: chained kills multiply the score */
  combo: {
    decay: 2.3,        // s before the chain breaks
    step: 0.02,        // score mult per chain count
    max: 5,            // score mult ceiling
    showAt: 8,         // chain count before the chip appears
  },

  /* the endless paper keeps growing teeth — and the teeth grow fangs */
  endless: { hpGrowth: 1.24, spGrowth: 1.016, budgetGrowth: 1.32 },

  /* ---- REALLY HARD ----
     the title's red toggle, remembered on this device. A hard page
     bites: every beast stands ~1.4× taller, arrives ~1.15× faster,
     and the waves spend ~1.45× more — the ledger pays double for
     every stroke that survives it. */
  hard: { hp: 1.4, sp: 1.15, budget: 1.45, score: 2.0 },

  /* ---- THE INK PURSE (符) — what the runs press out ----
     When a run ends, the press squeezes its ink back into the purse:
     a currency that survives the paper, spent on CHARMS between runs.
     Every wave survived presses 6 drops (waves past the six sheets
     press double — the endless loops go deeper than the journey ever
     asked); each Guardian felled this run adds 80; the six sheets
     signed adds 300, once ever. A new personal best presses 1.25×,
     REALLY HARD presses the ledger's own double, and a practiced
     daily sheet presses only a fifth — practice is for the hand,
     not the purse. Checked in scripts/economy_calc.js. */
  charmEarn: {
    perWave: 6,        // ink pressed per wave survived
    loopFrom: 600,     // waves past the six sheets pay double
    loopMult: 2,
    sheetFall: 80,     // per Guardian felled this run
    victoryFeat: 300,  // the six sheets signed — once, ever
    bestMult: 1.25,    // a new personal best presses deeper
    hardMult: 2,       // REALLY HARD — the ledger's own law
    practiceMult: 0.2, // a practiced sheet presses a fifth
  },

  /* ---- per-level KEEPERS ----
     Every level's tenth wave is a boss fight: the scene's Keeper —
     a red-sealed beast, lesser kin of the sheet's Guardian — walks
     the paper with a halved honor guard. Bases are measured against
     the scribe's NATURAL build at each debut (the XP ladder, not the
     shelf kit) so a debut duel runs ~20–35s of honest fighting;
     hpGrow carries repeats deeper into the sheet. */
  keeper: { hpGrow: 0.014, hpGrowCap: 2.4 },

  /* ---- BOSS INK — the named beasts stand taller than any horde.
     Every boss (Guardians and Keepers alike) is born with this much
     more ink in its body: the duel is the point of the scene, and a
     Guardian is a set piece, not a big minion. Tuned against the
     scribe's true measured builds, not the paper's mercy. */
  boss: { hp: 1.75, keeperHp: 1.45 },

  /* ---- CAPTAINS — the horde's officers ----
     A captain walks INSIDE the pack (never alone, never a boss bar):
     it quickens every beast near it, SURGES at the brush every few
     breaths — a telegraphed road through the paper — and RALLIES a
     true swarm of its kindred under the flag (v19: the officer does
     not trickle one replacement in, it musters the rank). When it
     falls its whole fan stuns — break the officer and the rank
     breaks with it. One per sheet, cut from that sheet's ink. */
  captain: {
    auraR: 210, auraMult: 1.32, deathStun: 1.15, deathR: 235,
    surgeEvery: 5.2, surgeSpeed: 560, surgeDur: 0.44, surgeWind: 0.55,
    swarmEvery: 5.4, swarmN: 4,
  },

  shockwave: { radius: 230, knock: 420 },
  adrenaline: { mult: 1.22, dur: lv => 1.4 + 0.45 * (lv - 1) },

  /* brush skills */
  orbit:   { radius: lv => 96 + lv * 28, speed: 2.9, dmgCd: 0.4, flingEvery: 4 },
  /* the tide's surge — born at the rhythm a PRIMARY weapon needs
     (the Tide brush answers with it every few breaths); ranks buy
     radius and cadence, the arts buy damage and undertow */
  nova:    { period: lv => 3.1 * Math.pow(0.88, lv - 1), radius: lv => 165 + (lv - 1) * 34, knock: 340, stun: 0.35 },
  ward:    { cd: 22 },
  slow:    { dur: 1.6, mult: 0.55 },
  crit:    { chance: lv => 0.16 * lv },
  magnet:  { radius: lv => CFG.xp.pickupR * (1 + 0.42 * lv) },
  mends:   { period: lv => 40 - 9 * lv },

  /* the scribe — THE SCRIBE brush's living stroke: a perpetual
     seeking line that weaves through the horde and bites on touch.
     No projectiles. It never rests, never expires; when no beast
     walks the paper it returns to circle the hand. */
  scribe:  { speed: 430, turn: 5.2, r: 8, tick: 0.4, weave: 3.1, weaveAmp: 150 },

  /* the tide's wet wake — where the brush walks, its ink still bites */
  wake:    { gap: 0.26, radius: 21, life: 1.15, tick: 0.55, dmg: 1 },

  /* the wisp bolt — the homing breath of the Wisp brush */
  wisp:    { turn: 6.5 },

  /* weapons — every loop is a power any brush may learn; the brush
     that is BORN to one carries its first rank from the first wave */
  fan:    { period: lv => 0.72 * Math.pow(0.9, lv - 1), blades: lv => 3 + lv, speed: 470, life: 0.52, spread: 0.95 },
  trail:  { gap: lv => 0.5 - 0.08 * (lv - 1), radius: lv => 26 + lv * 7, life: 2.7, tick: 0.42, dmg: 1 },
  spirit: { period: lv => 2.6 * Math.pow(0.9, lv - 1), count: lv => lv, speed: 300, turn: 7.5, life: 3.2, dmg: 1 },
  hanko:  { period: lv => 2.3 * Math.pow(0.88, lv - 1), radius: lv => 88 + (lv - 1) * 12, dmg: lv => 3 + Math.floor((lv - 1) / 2), stun: 0.45 },
  arc:    { period: lv => 2.5 - 0.22 * (lv - 1), jumps: lv => 2 + lv, range: 210, maxRange: 270, dmg: lv => 1 + Math.ceil(lv / 2) },
  boomer: { period: lv => 2.9 - 0.25 * (lv - 1), speed: 620, dist: lv => 300 + lv * 40, dmg: lv => 1 + lv, life: 3 },
  vortex: { period: lv => 7.5 - 0.7 * (lv - 1), radius: lv => 90 + lv * 24, dur: lv => 2 + 0.25 * lv, pull: 340, tick: 0.36, dmg: 1 },

  /* enemy ink globs and needles */
  glob:   { speed: 215, life: 2.4, r: 5 },
  needle: { speed: 470, life: 1.7, r: 3 },

  // total waves cleared → rank, else 'D' (the journey is six hundred waves)
  ranks: [[500, 'S+'], [400, 'S'], [300, 'A'], [190, 'B'], [70, 'C']],

  /* ---- ink engine knobs (consumed by render.js) ---- */
  ink: {
    boilRate: 0.115,        // s per hand-drawn frame (line boil)
    stainFadePerSec: 0.055, // legacy knob (world stains use world.stainFade)
    trailGap: 0.085,        // s between player ink-trail stamps
  },
};

/* The ink-born. Every creature is a living blot of sumi ink.
   `intro` is the global wave where the beast first walks the paper —
   each level of each sheet debuts at least one new beast. */
const ENEMIES = {
  /* ---- SHEET I · FIRST WASH — pale ink on fresh washi ---- */
  pulse:     { name: 'BLOT',       trait: 'DRIFTER',  cost: 1, intro: 1,   hp: 2,  r: 12, speed: 92,  score: 10, shape: 'circle'  },
  dart:      { name: 'SPEAR',      trait: 'LUNGER',   cost: 2, intro: 11,  hp: 1,  r: 9,  speed: 80,  score: 15, shape: 'tri'     },
  popper:    { name: 'POPPER',     trait: 'BOMBER',   cost: 2, intro: 21,  hp: 2,  r: 10, speed: 148, score: 20, shape: 'popper'  },
  washling:  { name: 'WASHLING',   trait: 'PALE WANDERER', cost: 2, intro: 31, hp: 2, r: 12, speed: 104, score: 22, shape: 'washling' },
  moth:      { name: 'MOTH',       trait: 'ERRATIC',  cost: 2, intro: 41,  hp: 2,  r: 10, speed: 122, score: 20, shape: 'moth'    },
  split:     { name: 'DRIP',       trait: 'DIVIDER',  cost: 2, intro: 51,  hp: 3,  r: 12, speed: 95,  score: 15, shape: 'diamond' },
  palecrane: { name: 'PALE CRANE', trait: 'SWOOPER',  cost: 2, intro: 61,  hp: 2,  r: 11, speed: 225, score: 28, shape: 'crane'   },
  slab:      { name: 'BRUTE',      trait: 'BRUISER',  cost: 3, intro: 71,  hp: 8,  r: 17, speed: 42,  score: 30, shape: 'square'  },
  wraith:    { name: 'WISP',       trait: 'WEAVER',   cost: 2, intro: 81,  hp: 2,  r: 11, speed: 105, score: 20, shape: 'ring'    },
  gnat:      { name: 'GNAT',       trait: 'SWARM',    cost: 1, intro: 16,  hp: 1,  r: 5,  speed: 138, score: 8,  shape: 'gnat'    },
  blotter:   { name: 'BLOTTER',    trait: 'SPONGE',   cost: 2, intro: 36,  hp: 3,  r: 11, speed: 66,  score: 25, shape: 'blotter' },

  /* ---- SHEET II · NIGHT SCROLL — lamp-black ink on dark paper ---- */
  spit:      { name: 'SPIT',       trait: 'GUNNER',   cost: 3, intro: 101, hp: 2,  r: 11, speed: 74,  score: 25, shape: 'spit'    },
  shade:     { name: 'SHADE',      trait: 'PHANTOM',  cost: 3, intro: 111, hp: 3,  r: 12, speed: 88,  score: 35, shape: 'shade'   },
  kage:      { name: 'KAGE',       trait: 'STALKER',  cost: 3, intro: 121, hp: 3,  r: 12, speed: 118, score: 40, shape: 'kage'    },
  nightshade:{ name: 'NIGHTSHADE', trait: 'BLINKER',  cost: 3, intro: 126, hp: 3,  r: 12, speed: 96,  score: 42, shape: 'nightshade' },
  stilt:     { name: 'STILT',      trait: 'SNIPER',   cost: 3, intro: 141, hp: 2,  r: 11, speed: 62,  score: 45, shape: 'stilt'   },
  lotus:     { name: 'LOTUS',      trait: 'ROOTED',   cost: 3, intro: 151, hp: 5,  r: 13, speed: 58,  score: 35, shape: 'lotus'   },
  gloom:     { name: 'GLOOM',      trait: 'BREATH',   cost: 3, intro: 156, hp: 4,  r: 16, speed: 72,  score: 45, shape: 'gloom'   },
  warden:    { name: 'WARDEN',     trait: 'HERALD',   cost: 3, intro: 171, hp: 3,  r: 12, speed: 70,  score: 45, shape: 'warden'  },
  titan:     { name: 'TITAN',      trait: 'MOTHER',   cost: 5, intro: 181, hp: 18, r: 28, speed: 24,  score: 90, shape: 'titan'   },
  owl:       { name: 'OWL',        trait: 'WATCHER',  cost: 3, intro: 131, hp: 2,  r: 12, speed: 58,  score: 45, shape: 'owl'     },
  smother:   { name: 'SMOTHER',    trait: 'CREEP',    cost: 2, intro: 156, hp: 4,  r: 13, speed: 54,  score: 40, shape: 'smother' },

  /* ---- SHEET III · CINNABAR FIELD — vermillion-stained ink ---- */
  oni:       { name: 'ONI',        trait: 'CHARGER',  cost: 4, intro: 201, hp: 10, r: 18, speed: 44,  score: 60, shape: 'oni'     },
  ember:     { name: 'EMBER',      trait: 'DASHER',   cost: 2, intro: 206, hp: 2,  r: 9,  speed: 96,  score: 30, shape: 'ember'   },
  crane:     { name: 'CRANE',      trait: 'SWOOPER',  cost: 2, intro: 211, hp: 2,  r: 11, speed: 205, score: 25, shape: 'crane'   },
  sealbearer:{ name: 'SEALBEARER', trait: 'SEALED',   cost: 4, intro: 216, hp: 9,  r: 15, speed: 40,  score: 65, shape: 'sealbearer' },
  gate:      { name: 'GATE',       trait: 'SHIELDED', cost: 4, intro: 221, hp: 8,  r: 15, speed: 38,  score: 55, shape: 'gate'    },
  ashigaru:  { name: 'ASHIGARU',   trait: 'RANK',     cost: 2, intro: 211, hp: 4,  r: 11, speed: 76,  score: 40, shape: 'ashigaru' },
  stamper:   { name: 'STAMPER',    trait: 'SEALSMITH',cost: 4, intro: 241, hp: 8,  r: 15, speed: 34,  score: 70, shape: 'stamper' },
  shiki:     { name: 'SHIKI',      trait: 'SUMMONER', cost: 3, intro: 246, hp: 4,  r: 13, speed: 78,  score: 50, shape: 'shiki'   },

  /* ---- SHEET IV · STORM SHEET — rain-grey ink ---- */
  raindrake: { name: 'RAINDRAKE',  trait: 'CALLER',   cost: 3, intro: 301, hp: 3,  r: 12, speed: 88,  score: 48, shape: 'raindrake' },
  gale:      { name: 'GALE',       trait: 'GUST',     cost: 2, intro: 306, hp: 1,  r: 10, speed: 120, score: 32, shape: 'gale'    },
  koi:       { name: 'KOI',        trait: 'SINEW',    cost: 2, intro: 311, hp: 2,  r: 10, speed: 195, score: 30, shape: 'koi'     },
  surge:     { name: 'SURGE',      trait: 'BREAKER',  cost: 3, intro: 316, hp: 6,  r: 16, speed: 48,  score: 55, shape: 'surge'   },
  maelstrom: { name: 'MAELSTROM',  trait: 'UNDERTOW', cost: 4, intro: 351, hp: 7,  r: 14, speed: 26,  score: 60, shape: 'maelstrom' },
  crest:     { name: 'WAVE CREST', trait: 'SWELL',    cost: 3, intro: 356, hp: 6,  r: 15, speed: 88,  score: 55, shape: 'crest'   },

  /* ---- SHEET V · GILT SCROLL — gold-dusted ink ---- */
  gildling:  { name: 'GILDLING',   trait: 'GILDED',   cost: 3, intro: 401, hp: 6,  r: 13, speed: 52,  score: 50, shape: 'gildling' },
  phoenix:   { name: 'PHOENIX',    trait: 'DIVING',   cost: 3, intro: 406, hp: 3,  r: 12, speed: 235, score: 55, shape: 'phoenix' },
  golem:     { name: 'GOLEM',      trait: 'COLOSSUS', cost: 5, intro: 411, hp: 26, r: 24, speed: 30,  score: 110, shape: 'golem'   },
  mirror:    { name: 'MIRROR',     trait: 'REFLECT',  cost: 4, intro: 421, hp: 6,  r: 13, speed: 30,  score: 75, shape: 'mirror'  },
  koban:     { name: 'KOBAN',      trait: 'GREED',    cost: 2, intro: 436, hp: 3,  r: 10, speed: 148, score: 80, shape: 'koban'   },
  cask:      { name: 'RELIC CASK', trait: 'TREASURY', cost: 4, intro: 441, hp: 14, r: 18, speed: 34,  score: 70, shape: 'cask'    },

  /* ---- SHEET VI · THE BLANK SILK — cool ink on unstained silk ---- */
  sketch:    { name: 'SKETCH',      trait: 'UNDRAWN',  cost: 2, intro: 501, hp: 4,  r: 12, speed: 78, score: 55, shape: 'sketch'  },
  stitch:    { name: 'STITCH',      trait: 'SEAM',     cost: 2, intro: 511, hp: 3,  r: 10, speed: 74, score: 50, shape: 'stitch'  },
  reseal:    { name: 'RESEAL',      trait: 'RESTAMPED',cost: 4, intro: 521, hp: 9,  r: 15, speed: 42, score: 65, shape: 'reseal'  },
  sizing:    { name: 'SIZING',      trait: 'GLUE',     cost: 3, intro: 531, hp: 6,  r: 14, speed: 40, score: 60, shape: 'sizing'  },
  binder:    { name: 'BINDER',      trait: 'MOUNT',    cost: 4, intro: 541, hp: 10, r: 16, speed: 34, score: 70, shape: 'binder'  },
  weft:      { name: 'WEFT',        trait: 'LOOM',     cost: 3, intro: 551, hp: 4,  r: 12, speed: 68, score: 58, shape: 'weft'    },

  /* ---- V19 · THE SECOND BREEDING ----
     Nine new beasts, one to three a sheet, each bending the fight
     a different way: the rill weaves, the specter phases, the
     warhorn musters, the squall circles, the eel rushes in rivers,
     the giltwing wounds and flees, the midas turns flesh to coin,
     the stencil presses seals where you stand, the fray unravels
     into shards. The stale papers (IV and V leaned on Sheet I's
     old ink) now walk their own blood again. */
  rill:      { name: 'RILL',        trait: 'WEAVER',    cost: 2, intro: 51,  hp: 2, r: 11, speed: 128, score: 24, shape: 'rill' },
  specter:   { name: 'SPECTER',     trait: 'PHASER',    cost: 3, intro: 171, hp: 4, r: 13, speed: 70,  score: 55, shape: 'specter' },
  horn:      { name: 'WARHORN',     trait: 'MUSTER',    cost: 4, intro: 281, hp: 6, r: 15, speed: 46,  score: 80, shape: 'horn' },
  squall:    { name: 'SQUALL',      trait: 'CIRCLER',   cost: 2, intro: 331, hp: 2, r: 10, speed: 205, score: 45, shape: 'squall' },
  eel:       { name: 'EEL',         trait: 'RUSHER',    cost: 2, intro: 341, hp: 3, r: 10, speed: 165, score: 42, shape: 'eel' },
  giltwing:  { name: 'GILTWING',    trait: 'SKIRMISHER',cost: 3, intro: 431, hp: 3, r: 12, speed: 235, score: 80, shape: 'giltwing' },
  midas:     { name: 'THE MIDAS',   trait: 'ALCHEMIST', cost: 4, intro: 441, hp: 5, r: 14, speed: 40,  score: 120, shape: 'midas' },
  stencil:   { name: 'STENCIL',     trait: 'STAMPER',   cost: 3, intro: 541, hp: 5, r: 13, speed: 50,  score: 70, shape: 'stencil' },
  fray:      { name: 'THE FRAY',    trait: 'UNRAVELER', cost: 4, intro: 551, hp: 6, r: 14, speed: 58,  score: 80, shape: 'fray' },
  stitchling:{ name: 'STITCHLING',  trait: 'SHARD',     cost: 1, intro: 551, hp: 1, r: 6,  speed: 155, score: 6,  shape: 'dot' },

  /* shards shed by dividers and mothers */
  pulseling: { name: 'BLIP',       trait: 'SHARD',    cost: 1, intro: 1,   hp: 1,  r: 6,  speed: 150, score: 5,  shape: 'dot'     },

  /* ---- SPECIALS — the paper's odd mechanics, one per sheet from
     the second scroll on. Each bends the fight around itself:
     breed, mend, toll, or tax. Kill them first, or fight the
     horde they make. */
  s_nest:    { name: 'THE NEST',     trait: 'BROODSITE', cost: 4, intro: 166, hp: 14, r: 17, speed: 0,   score: 70, shape: 'nest', special: 1 },
  s_mender:  { name: 'THE MENDER',   trait: 'STITCHER',  cost: 3, intro: 236, hp: 6,  r: 12, speed: 76,  score: 85, shape: 'mender', special: 1 },
  s_toller:  { name: 'THE TOLLER',   trait: 'BELL',      cost: 3, intro: 361, hp: 7,  r: 15, speed: 36,  score: 95, shape: 'toller', special: 1 },
  s_ledger:  { name: 'THE LEDGER',   trait: 'USURER',    cost: 3, intro: 446, hp: 9,  r: 14, speed: 64,  score: 115, shape: 'ledger', special: 1 },
  s_trace:   { name: 'THE TRACE',    trait: 'TRACER',    cost: 3, intro: 546, hp: 8,  r: 14, speed: 58,  score: 95, shape: 'trace', special: 1 },

  /* ---- CAPTAINS — the horde's officers, one cut from each sheet's
     ink. They quicken the pack around them, call fresh beasts into
     the paper, and when one falls its whole fan stuns. Walk the
     wave, find the flag, break the rank. */
  c_drum:    { name: 'THE DRUM',       trait: 'CAPTAIN · RALLY',  cost: 4, intro: 46,  hp: 15, r: 16, speed: 50, score: 75,  shape: 'captain', captain: 1, summon: 'pulse' },
  c_choir:   { name: 'THE CHOIR',      trait: 'CAPTAIN · SONG',   cost: 4, intro: 146, hp: 13, r: 15, speed: 56, score: 95,  shape: 'captain', captain: 1, summon: 'shade' },
  c_banner:  { name: 'THE BANNER',     trait: 'CAPTAIN · MARCH',  cost: 4, intro: 231, hp: 11, r: 16, speed: 48, score: 125, shape: 'captain', captain: 1, summon: 'ashigaru' },
  c_gale:    { name: 'THE STORMCALLER',trait: 'CAPTAIN · STORM',  cost: 4, intro: 346, hp: 9,  r: 15, speed: 60, score: 155, shape: 'captain', captain: 1, summon: 'ember' },
  c_gild:    { name: 'THE PAYMASTER',  trait: 'CAPTAIN · GREED',  cost: 4, intro: 426, hp: 8,  r: 17, speed: 42, score: 185, shape: 'captain', captain: 1, summon: 'gildling' },
  c_hush:    { name: 'THE HUSH',       trait: 'CAPTAIN · SILENCE',cost: 4, intro: 516, hp: 8,  r: 16, speed: 46, score: 185, shape: 'captain', captain: 1, summon: 'sketch' },

  /* ---- the six Guardians, one per sheet, on its tenth level ----
     Bases are the beast's own ink mass, measured against the
     NATURAL build a scribe carries at each sheet's gate — the sheet
     multipliers (hp 1 → 13) do the climbing across the journey, so
     these fall as the papers darken on purpose: every Guardian is a
     ~35–60s set piece, and the First Brush is the longest fight in
     the game. In the endless paper the wave growth re-tallens them. */
  b_wheel:   { name: 'THE STAIN',       trait: 'GUARDIAN I',   cost: 0, intro: 100, hp: 1400,  r: 34, speed: 46, score: 500, shape: 'boss', boss: 1 },
  b_mother:  { name: 'THE NIGHT MOTHER',trait: 'GUARDIAN II',  cost: 0, intro: 200, hp: 800,  r: 30, speed: 52, score: 800, shape: 'boss', boss: 1 },
  b_warlord: { name: 'THE CINNABAR ONI',trait: 'GUARDIAN III', cost: 0, intro: 300, hp: 820,  r: 33, speed: 50, score: 1200, shape: 'boss', boss: 1 },
  b_tempest: { name: 'THE STORM EYE',   trait: 'GUARDIAN IV',  cost: 0, intro: 400, hp: 620, r: 30, speed: 58, score: 1700, shape: 'boss', boss: 1 },
  b_origin:  { name: 'THE FIRST BRUSH', trait: 'GUARDIAN V',   cost: 0, intro: 500, hp: 700, r: 36, speed: 44, score: 2400, shape: 'boss', boss: 1 },
  b_blank:   { name: 'THE UNWRITTEN',   trait: 'GUARDIAN VI',  cost: 0, intro: 600, hp: 660, r: 32, speed: 50, score: 2600, shape: 'boss', boss: 1 },

  /* ---- v19.1 · THE TEN SEALS — a keeper for EVERY scene ----
     Each of a sheet's ten levels owns its own red-sealed boss: its
     own body (form), its own cry, and its own two abilities cut
     from the keeper kit — and since v20 every one of them wears
     the Guardian's own vermillion (the red/black law: red is the
     bosses' ink, black the horde's; render.js paints the class). The sheet's tenth scene
     keeps the old Keeper — the Guardian's true lesser kin — and at
     that sheet's tenth wave all ten come back with it (game.js,
     THE ASSEMBLY). Bases follow the same law as the old shared
     keeper: measured against the scribe's natural build, scaled by
     scene weight (0.84 + 0.045 × scene), introduced at the sheet's
     gate wave so the journey's climb carries them. Hues are
     contrast-checked against each sheet's paper (>= 4.5:1). */
  k1_1: { name: 'THE POOL', trait: 'KEEPER I · SCENE 1', cost: 0, intro: 10, hp: 210, r: 24, speed: 59, score: 185, shape: 'boss', boss: 2, form: 'pool', cry: 'THE POOL SPREADS', ab: ['ring', 'brood'], kin: 'gnat' },
  k1_2: { name: 'THE SAPLING', trait: 'KEEPER I · SCENE 2', cost: 0, intro: 10, hp: 225, r: 23, speed: 66, score: 200, shape: 'boss', boss: 2, form: 'tree', cry: 'THE SAPLING BENDS', ab: ['brood', 'fan'], kin: 'pulse' },
  k1_3: { name: 'THE FAR PEAK', trait: 'KEEPER I · SCENE 3', cost: 0, intro: 10, hp: 235, r: 27, speed: 56, score: 210, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE PEAK BREAKS', ab: ['charge', 'ring'] },
  k1_4: { name: 'THE DRIFT', trait: 'KEEPER I · SCENE 4', cost: 0, intro: 10, hp: 245, r: 21, speed: 63, score: 220, shape: 'boss', boss: 2, form: 'koi', cry: 'THE DRIFT TURNS', ab: ['orbit', 'volley'] },
  k1_5: { name: 'THE RISING MIST', trait: 'KEEPER I · SCENE 5', cost: 0, intro: 10, hp: 255, r: 21, speed: 53, score: 230, shape: 'boss', boss: 2, form: 'wraith', cry: 'THE MIST THICKENS', ab: ['blink', 'fan'] },
  k1_6: { name: 'THE DEW', trait: 'KEEPER I · SCENE 6', cost: 0, intro: 10, hp: 265, r: 20, speed: 60, score: 240, shape: 'boss', boss: 2, form: 'moth', cry: 'THE DEW GATHERS', ab: ['rain', 'mirror'], kin: 'gnat' },
  k1_7: { name: 'THE DANCING CRANE', trait: 'KEEPER I · SCENE 7', cost: 0, intro: 10, hp: 275, r: 20, speed: 67, score: 255, shape: 'boss', boss: 2, form: 'crane', cry: 'THE CRANE TURNS', ab: ['charge', 'fan'] },
  k1_8: { name: 'THE OLD PINE', trait: 'KEEPER I · SCENE 8', cost: 0, intro: 10, hp: 290, r: 23, speed: 57, score: 265, shape: 'boss', boss: 2, form: 'tree', cry: 'THE PINE SHEDS', ab: ['ring', 'haste'] },
  k1_9: { name: 'THE FIRST DUSK', trait: 'KEEPER I · SCENE 9', cost: 0, intro: 10, hp: 300, r: 22, speed: 64, score: 275, shape: 'boss', boss: 2, form: 'mask', cry: 'THE DUSK DEEPENS', ab: ['blink', 'volley'] },
  k2_1: { name: 'THE PAPER LANTERN', trait: 'KEEPER II · SCENE 1', cost: 0, intro: 110, hp: 415, r: 22, speed: 59, score: 255, shape: 'boss', boss: 2, form: 'lantern', cry: 'THE LANTERN SWINGS', ab: ['orbit', 'ring'] },
  k2_2: { name: 'THE TALON', trait: 'KEEPER II · SCENE 2', cost: 0, intro: 110, hp: 435, r: 20, speed: 66, score: 270, shape: 'boss', boss: 2, form: 'crane', cry: 'THE TALON DIVES', ab: ['charge', 'fan'] },
  k2_3: { name: 'THE SIFTER', trait: 'KEEPER II · SCENE 3', cost: 0, intro: 110, hp: 460, r: 24, speed: 56, score: 285, shape: 'boss', boss: 2, form: 'spider', cry: 'THE SIFTER CREEPS', ab: ['brood', 'ring'], kin: 'shade' },
  k2_4: { name: 'THE WICK', trait: 'KEEPER II · SCENE 4', cost: 0, intro: 110, hp: 480, r: 20, speed: 63, score: 300, shape: 'boss', boss: 2, form: 'moth', cry: 'THE WICK FLARES', ab: ['blink', 'spiral'] },
  k2_5: { name: 'THE NIGHT EDDY', trait: 'KEEPER II · SCENE 5', cost: 0, intro: 110, hp: 500, r: 24, speed: 53, score: 315, shape: 'boss', boss: 2, form: 'pool', cry: 'THE EDDY WIDENS', ab: ['ring', 'mirror'], kin: 'shade' },
  k2_6: { name: 'THE SILENT BANNER', trait: 'KEEPER II · SCENE 6', cost: 0, intro: 110, hp: 520, r: 22, speed: 60, score: 330, shape: 'boss', boss: 2, form: 'banner', cry: 'THE BANNER RISES', ab: ['haste', 'brood1'], kin: 'owl' },
  k2_7: { name: 'THE NOH MASK', trait: 'KEEPER II · SCENE 7', cost: 0, intro: 110, hp: 545, r: 22, speed: 67, score: 345, shape: 'boss', boss: 2, form: 'mask', cry: 'THE MASK TURNS', ab: ['fan', 'blink'] },
  k2_8: { name: 'THE LONG MAN', trait: 'KEEPER II · SCENE 8', cost: 0, intro: 110, hp: 565, r: 22, speed: 57, score: 360, shape: 'boss', boss: 2, form: 'banner', cry: 'THE LONG MAN STIRS', ab: ['rain', 'volley'] },
  k2_9: { name: 'THE DROWSE', trait: 'KEEPER II · SCENE 9', cost: 0, intro: 110, hp: 585, r: 25, speed: 64, score: 375, shape: 'boss', boss: 2, form: 'toad', cry: 'THE DROWSE WAKES', ab: ['brood', 'ring'], kin: 'smother' },
  k3_1: { name: 'THE FIRST GATE', trait: 'KEEPER III · SCENE 1', cost: 0, intro: 210, hp: 480, r: 27, speed: 59, score: 325, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE GATE CLOSES', ab: ['stamp', 'ring'] },
  k3_2: { name: 'THE CINDER FOX', trait: 'KEEPER III · SCENE 2', cost: 0, intro: 210, hp: 500, r: 21, speed: 66, score: 340, shape: 'boss', boss: 2, form: 'koi', cry: 'THE FOX RUNS', ab: ['charge', 'fan'] },
  k3_3: { name: 'THE WAR FAN', trait: 'KEEPER III · SCENE 3', cost: 0, intro: 210, hp: 525, r: 20, speed: 56, score: 360, shape: 'boss', boss: 2, form: 'moth', cry: 'THE WAR FAN OPENS', ab: ['fan', 'haste'] },
  k3_4: { name: 'THE GATEWARDEN', trait: 'KEEPER III · SCENE 4', cost: 0, intro: 210, hp: 550, r: 22, speed: 63, score: 380, shape: 'boss', boss: 2, form: 'mask', cry: 'THE WARDEN STEPS', ab: ['stamp', 'brood'], kin: 'ashigaru' },
  k3_5: { name: 'THE EMBER OX', trait: 'KEEPER III · SCENE 5', cost: 0, intro: 210, hp: 575, r: 27, speed: 53, score: 400, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE OX LOWERS', ab: ['charge', 'ring'] },
  k3_6: { name: 'THE RED COURIER', trait: 'KEEPER III · SCENE 6', cost: 0, intro: 210, hp: 600, r: 20, speed: 60, score: 420, shape: 'boss', boss: 2, form: 'crane', cry: 'THE COURIER COMES', ab: ['orbit', 'volley'] },
  k3_7: { name: 'THE FORGE HEART', trait: 'KEEPER III · SCENE 7', cost: 0, intro: 210, hp: 625, r: 27, speed: 67, score: 435, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE FORGE BREATHES', ab: ['rain', 'ring'] },
  k3_8: { name: 'THE SEALWRIGHT', trait: 'KEEPER III · SCENE 8', cost: 0, intro: 210, hp: 650, r: 21, speed: 57, score: 455, shape: 'boss', boss: 2, form: 'stamp', cry: 'THE SEALWRIGHT DIPS', ab: ['stamp', 'brood'], kin: 'ember' },
  k3_9: { name: 'THE CLIFF ROAD', trait: 'KEEPER III · SCENE 9', cost: 0, intro: 210, hp: 670, r: 27, speed: 64, score: 475, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE ROAD BREAKS', ab: ['charge', 'spiral'] },
  k4_1: { name: 'THE CLOUD HEAD', trait: 'KEEPER IV · SCENE 1', cost: 0, intro: 310, hp: 550, r: 21, speed: 59, score: 390, shape: 'boss', boss: 2, form: 'wraith', cry: 'THE CLOUD LOWERS', ab: ['rain', 'ring'] },
  k4_2: { name: 'THE WIND VANE', trait: 'KEEPER IV · SCENE 2', cost: 0, intro: 310, hp: 575, r: 23, speed: 66, score: 415, shape: 'boss', boss: 2, form: 'wheel', cry: 'THE VANE SPINS', ab: ['orbit', 'fan'] },
  k4_3: { name: 'THE LEAPING KOI', trait: 'KEEPER IV · SCENE 3', cost: 0, intro: 310, hp: 605, r: 21, speed: 56, score: 435, shape: 'boss', boss: 2, form: 'koi', cry: 'THE KOI LEAPS', ab: ['charge', 'rain'] },
  k4_4: { name: 'THE ROLLING SKY', trait: 'KEEPER IV · SCENE 4', cost: 0, intro: 310, hp: 630, r: 24, speed: 63, score: 460, shape: 'boss', boss: 2, form: 'pool', cry: 'THE SKY ROLLS', ab: ['ring', 'spiral'] },
  k4_5: { name: 'THE RIVERBEND', trait: 'KEEPER IV · SCENE 5', cost: 0, intro: 310, hp: 660, r: 21, speed: 53, score: 485, shape: 'boss', boss: 2, form: 'ribbon', cry: 'THE RIVER TURNS', ab: ['charge', 'mirror'], kin: 'eel' },
  k4_6: { name: 'THE DOWNPOUR', trait: 'KEEPER IV · SCENE 6', cost: 0, intro: 310, hp: 690, r: 20, speed: 60, score: 505, shape: 'boss', boss: 2, form: 'moth', cry: 'THE RAIN HARDENS', ab: ['rain', 'haste'] },
  k4_7: { name: 'THE WHITE CREST', trait: 'KEEPER IV · SCENE 7', cost: 0, intro: 310, hp: 715, r: 21, speed: 67, score: 530, shape: 'boss', boss: 2, form: 'ribbon', cry: 'THE CREST BREAKS', ab: ['charge', 'ring'] },
  k4_8: { name: 'THE STORM LANTERN', trait: 'KEEPER IV · SCENE 8', cost: 0, intro: 310, hp: 745, r: 22, speed: 57, score: 550, shape: 'boss', boss: 2, form: 'lantern', cry: 'THE LANTERN FLICKERS', ab: ['spiral', 'blink'] },
  k4_9: { name: 'THE RAIN BANNER', trait: 'KEEPER IV · SCENE 9', cost: 0, intro: 310, hp: 770, r: 22, speed: 64, score: 575, shape: 'boss', boss: 2, form: 'banner', cry: 'THE BANNER SOAKS', ab: ['rain', 'brood1'], kin: 'gale' },
  k5_1: { name: 'THE GILD MOTHER', trait: 'KEEPER V · SCENE 1', cost: 0, intro: 410, hp: 460, r: 24, speed: 59, score: 475, shape: 'boss', boss: 2, form: 'spider', cry: 'THE MOTHER COUNTS', ab: ['mirror', 'ring'], kin: 'gildling' },
  k5_2: { name: 'THE FOUNDRY', trait: 'KEEPER V · SCENE 2', cost: 0, intro: 410, hp: 485, r: 27, speed: 66, score: 505, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE FOUNDRY POURS', ab: ['rain', 'brood1'], kin: 'koban' },
  k5_3: { name: 'THE ASHEN WING', trait: 'KEEPER V · SCENE 3', cost: 0, intro: 410, hp: 505, r: 20, speed: 56, score: 530, shape: 'boss', boss: 2, form: 'crane', cry: 'THE WING BURNS', ab: ['charge', 'fan'] },
  k5_4: { name: 'THE WEIGHT', trait: 'KEEPER V · SCENE 4', cost: 0, intro: 410, hp: 530, r: 27, speed: 63, score: 560, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE WEIGHT FALLS', ab: ['charge', 'stamp'] },
  k5_5: { name: 'THE GILT MASK', trait: 'KEEPER V · SCENE 5', cost: 0, intro: 410, hp: 555, r: 22, speed: 53, score: 590, shape: 'boss', boss: 2, form: 'mask', cry: 'THE MASK GLINTS', ab: ['fan', 'blink'] },
  k5_6: { name: 'THE COIN RIVER', trait: 'KEEPER V · SCENE 6', cost: 0, intro: 410, hp: 575, r: 21, speed: 60, score: 615, shape: 'boss', boss: 2, form: 'ribbon', cry: 'THE RIVER SPENDS', ab: ['orbit', 'mirror'], kin: 'koban' },
  k5_7: { name: 'THE IDOL', trait: 'KEEPER V · SCENE 7', cost: 0, intro: 410, hp: 600, r: 27, speed: 67, score: 645, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE IDOL WATCHES', ab: ['stamp', 'ring'] },
  k5_8: { name: 'THE TRANSMUTE', trait: 'KEEPER V · SCENE 8', cost: 0, intro: 410, hp: 625, r: 23, speed: 57, score: 670, shape: 'boss', boss: 2, form: 'wheel', cry: 'THE WHEEL TURNS ALL', ab: ['spiral', 'haste'] },
  k5_9: { name: 'THE GOLDEN HOUR', trait: 'KEEPER V · SCENE 9', cost: 0, intro: 410, hp: 645, r: 22, speed: 64, score: 700, shape: 'boss', boss: 2, form: 'lantern', cry: 'THE HOUR BENDS', ab: ['orbit', 'rain'] },
  k6_1: { name: 'THE UNDERDRAWING', trait: 'KEEPER VI · SCENE 1', cost: 0, intro: 510, hp: 565, r: 21, speed: 59, score: 510, shape: 'boss', boss: 2, form: 'wraith', cry: 'THE DRAWING SHIFTS', ab: ['mirror', 'fan'], kin: 'stitch' },
  k6_2: { name: 'THE SEAM', trait: 'KEEPER VI · SCENE 2', cost: 0, intro: 510, hp: 595, r: 21, speed: 66, score: 540, shape: 'boss', boss: 2, form: 'ribbon', cry: 'THE SEAM PULLS', ab: ['charge', 'ring'] },
  k6_3: { name: 'THE RESTAMPED', trait: 'KEEPER VI · SCENE 3', cost: 0, intro: 510, hp: 625, r: 21, speed: 56, score: 570, shape: 'boss', boss: 2, form: 'stamp', cry: 'THE STAMP PRESSES', ab: ['stamp', 'brood1'], kin: 'stitchling' },
  k6_4: { name: 'THE GLUEWORK', trait: 'KEEPER VI · SCENE 4', cost: 0, intro: 510, hp: 655, r: 25, speed: 63, score: 600, shape: 'boss', boss: 2, form: 'toad', cry: 'THE GLUE SETS', ab: ['stamp', 'rain'] },
  k6_5: { name: 'THE MOUNTING', trait: 'KEEPER VI · SCENE 5', cost: 0, intro: 510, hp: 680, r: 22, speed: 53, score: 630, shape: 'boss', boss: 2, form: 'banner', cry: 'THE SILK STRETCHES', ab: ['haste', 'brood1'], kin: 'stitchling' },
  k6_6: { name: 'THE GRAIN', trait: 'KEEPER VI · SCENE 6', cost: 0, intro: 510, hp: 710, r: 23, speed: 60, score: 660, shape: 'boss', boss: 2, form: 'wheel', cry: 'THE GRAIN RIDGES', ab: ['spiral', 'ring'] },
  k6_7: { name: 'THE OLD MIRROR', trait: 'KEEPER VI · SCENE 7', cost: 0, intro: 510, hp: 740, r: 22, speed: 67, score: 690, shape: 'boss', boss: 2, form: 'mask', cry: 'THE MIRROR CLOUDS', ab: ['mirror', 'volley'], kin: 'sketch' },
  k6_8: { name: 'THE MARGINALIA', trait: 'KEEPER VI · SCENE 8', cost: 0, intro: 510, hp: 770, r: 20, speed: 57, score: 720, shape: 'boss', boss: 2, form: 'moth', cry: 'THE MARGIN WRITES', ab: ['blink', 'fan'] },
  k6_9: { name: 'THE BLANK CROWN', trait: 'KEEPER VI · SCENE 9', cost: 0, intro: 510, hp: 795, r: 27, speed: 64, score: 750, shape: 'boss', boss: 2, form: 'mountain', cry: 'THE CROWN PRESSES', ab: ['stamp', 'rain'] },

  /* ---- the six Keepers, one per sheet, on its tenth scene ----
     lesser bosses cut from the same ink as their Guardian — they
     share its body and its hunger, thinned for a scene's climax.
     Bases are measured against the scribe's natural build at each
     sheet's gate — a debut duel runs twenty-to-thirty honest
     seconds; growth + the boss levy carry repeats deeper.
     boss: 2 marks the keeper tier (red, named, bar-worn). */
  k_blight: { name: 'THE BLIGHT',   trait: 'KEEPER I',   cost: 0, intro: 10,  hp: 240,  r: 24, speed: 58, score: 220, shape: 'boss', boss: 2 },
  k_husk:   { name: 'THE HUSK',     trait: 'KEEPER II',  cost: 0, intro: 110, hp: 470, r: 23, speed: 62, score: 300, shape: 'boss', boss: 2 },
  k_cinder: { name: 'THE CINDER',   trait: 'KEEPER III', cost: 0, intro: 210, hp: 540, r: 25, speed: 56, score: 380, shape: 'boss', boss: 2 },
  k_veil:   { name: 'THE RAINVEIL', trait: 'KEEPER IV',  cost: 0, intro: 310, hp: 620, r: 24, speed: 64, score: 460, shape: 'boss', boss: 2 },
  k_nib:    { name: 'THE NIB',      trait: 'KEEPER V',   cost: 0, intro: 410, hp: 520, r: 27, speed: 52, score: 560, shape: 'boss', boss: 2 },
  k_edge:   { name: 'THE MARGIN',   trait: 'KEEPER VI',  cost: 0, intro: 510, hp: 640, r: 24, speed: 60, score: 600, shape: 'boss', boss: 2 },
};

/* default weights used by the spawn roll (per roster enemy) */
const ENEMY_WEIGHTS = {
  pulse: 5, dart: 3, spit: 2.2, moth: 2.4, split: 2.1, slab: 1.5,
  shade: 1.7, wraith: 1.9, titan: 0.8, kage: 1.6, stilt: 1.4, oni: 1.2, crane: 1.8,
  popper: 2.0, lotus: 1.5, warden: 1.3, gate: 1.2, koi: 1.9, golem: 0.9,
  /* the paper's own specials */
  washling: 2.2, palecrane: 1.6, nightshade: 1.6, gloom: 1.2, ember: 1.8,
  sealbearer: 1.1, raindrake: 1.4, gale: 1.9, gildling: 1.1, phoenix: 1.4,
  /* the second breed of each paper */
  gnat: 2.6, blotter: 1.6, owl: 1.4, smother: 1.5, ashigaru: 1.9,
  stamper: 1.0, surge: 1.3, maelstrom: 1.0, mirror: 0.9, koban: 0.85,
  shiki: 1.1, crest: 1.4, cask: 0.9,
  /* the officers and the odd mechanics — present, never flooding.
     v20: the officers walk a hand heavier — the captains are back
     in the eye (their red flags now burn at the boss's own ink). */
  c_drum: 1.0, c_choir: 1.0, c_banner: 1.0, c_gale: 1.0, c_gild: 1.0, c_hush: 1.0,
  s_nest: 0.9, s_mender: 0.8, s_toller: 0.9, s_ledger: 0.8, s_trace: 0.8,
  /* the blank silk's own half-drawn things */
  sketch: 1.5, stitch: 1.4, reseal: 0.9, sizing: 1.2, binder: 0.9, weft: 1.3,
  /* the second breeding (v19) */
  rill: 2.0, specter: 1.4, horn: 1.0, squall: 1.7, eel: 1.6,
  giltwing: 1.3, midas: 0.9, stencil: 1.1, fray: 1.0,
};

/* ------------------------------------------------------------
   THE SIX SCROLLS — each sheet is a different paper washed in
   its own ink: 淡 pale wash, 濃 lamp-black, 朱 vermillion,
   雨 rain-grey, 金 gold-dust, 素 the blank silk. Ten levels a
   sheet; the tenth level bears the Guardian. Each level debuts
   a beast of its own (order) and paints the next scene of the
   page (names).
   ------------------------------------------------------------ */
const AREAS = [
  {
    id: 'I', name: 'FIRST WASH', kanji: '一', theme: 'pale',
    ink: '淡墨',                                     // pale warm wash
    desc: 'Fresh washi. The first strokes land soft.',
    mult: { hp: 1, sp: 1, budget: 1 },
    roster: ['pulse', 'dart', 'popper', 'washling', 'moth', 'rill', 'split', 'palecrane', 'slab', 'wraith', 'gnat', 'blotter', 'c_drum'],
    order: ['pulse', 'dart', 'popper', 'washling', 'moth', 'rill', 'palecrane', 'slab', 'wraith'],
    names: ['初描', '新樹', '遠山', '淡游', '霧起', '垂露', '鶴舞', '古松', '暮色', '落款'],
    elite: 'slab', boss: 'b_wheel', keeper: 'k_blight',
    keepers: ['k1_1', 'k1_2', 'k1_3', 'k1_4', 'k1_5', 'k1_6', 'k1_7', 'k1_8', 'k1_9', 'k_blight'],
  },
  {
    id: 'II', name: 'NIGHT SCROLL', kanji: '夜', theme: 'dark',
    ink: '濃墨',                                     // lamp-black, heavy
    desc: 'The ink deepens. Things move inside it.',
    mult: { hp: 2.0, sp: 1.06, budget: 1.5 },
    roster: ['spit', 'shade', 'kage', 'specter', 'nightshade', 'stilt', 'lotus', 'gloom', 'warden', 'titan', 'owl', 'smother', 's_nest', 'c_choir'],
    order: ['spit', 'shade', 'kage', 'nightshade', 'specter', 'stilt', 'lotus', 'gloom', 'titan'],
    names: ['入夜', '遠浦', '梟鳴', '夜影', '高軒', '蓮池', '墨霧', '旌旗', '母胎', '落款'],
    elite: 'shade', boss: 'b_mother', keeper: 'k_husk',
    keepers: ['k2_1', 'k2_2', 'k2_3', 'k2_4', 'k2_5', 'k2_6', 'k2_7', 'k2_8', 'k2_9', 'k_husk'],
  },
  {
    id: 'III', name: 'CINNABAR FIELD', kanji: '紅', theme: 'red',
    ink: '朱墨',                                     // vermillion-stained
    desc: 'A vermillion wash dries underfoot. The last stroke is heaviest.',
    mult: { hp: 3.6, sp: 1.1, budget: 2.1 },
    roster: ['oni', 'ember', 'crane', 'sealbearer', 'gate', 'spit', 'kage', 'titan', 'horn', 'slab', 'ashigaru', 'stamper', 'shiki', 'c_banner', 's_mender'],
    order: ['oni', 'ember', 'crane', 'sealbearer', 'gate', 'spit', 'kage', 'titan', 'horn'],
    names: ['朱土', '飛火', '鶴影', '印卒', '鳥居', '遠崖', '影踏', '古巣', '絕壁', '落款'],
    elite: 'oni', boss: 'b_warlord', keeper: 'k_cinder',
    keepers: ['k3_1', 'k3_2', 'k3_3', 'k3_4', 'k3_5', 'k3_6', 'k3_7', 'k3_8', 'k3_9', 'k_cinder'],
  },
  {
    id: 'IV', name: 'STORM SHEET', kanji: '嵐', theme: 'storm',
    ink: '雨墨',                                     // rain-grey
    desc: 'Rain hammers the paper. The ink runs like rivers.',
    mult: { hp: 6.0, sp: 1.16, budget: 2.9 },
    roster: ['raindrake', 'gale', 'koi', 'squall', 'eel', 'crane', 'dart', 'warden', 'surge', 'maelstrom', 'crest', 'c_gale', 's_toller'],
    order: ['raindrake', 'gale', 'koi', 'squall', 'eel', 'crane', 'warden', 'surge', 'maelstrom'],
    names: ['雲垂', '陣風', '鯉躍', '雨晴', '疾矢', '霧海', '旌搖', '雨簾', '怒濤', '落款'],
    elite: 'stilt', boss: 'b_tempest', keeper: 'k_veil',
    keepers: ['k4_1', 'k4_2', 'k4_3', 'k4_4', 'k4_5', 'k4_6', 'k4_7', 'k4_8', 'k4_9', 'k_veil'],
  },
  {
    id: 'V', name: 'GILT SCROLL', kanji: '金', theme: 'gilt',
    ink: '金墨',                                     // gold-dusted
    desc: 'Old gold leaf underfoot. The last sheet is the heaviest.',
    mult: { hp: 9.5, sp: 1.22, budget: 3.8 },
    roster: ['gildling', 'phoenix', 'golem', 'giltwing', 'midas', 'oni', 'gate', 'titan', 'kage', 'warden', 'spit', 'mirror', 'koban', 'cask', 'c_gild', 's_ledger'],
    order: ['gildling', 'phoenix', 'golem', 'giltwing', 'midas', 'mirror', 'koban', 'oni', 'gate'],
    names: ['金泥', '鳳來', '石像', '鬼門', '樓閣', '母金', '影金', '旌耀', '雨期', '落款'],
    elite: 'oni', boss: 'b_origin', keeper: 'k_nib',
    keepers: ['k5_1', 'k5_2', 'k5_3', 'k5_4', 'k5_5', 'k5_6', 'k5_7', 'k5_8', 'k5_9', 'k_nib'],
  },
  {
    id: 'VI', name: 'THE BLANK SILK', kanji: '素', theme: 'silk',
    ink: '素墨',                                     // cool ink on unstained silk
    desc: 'The silk the first stroke landed on. Some things are still only drawn.',
    mult: { hp: 13.0, sp: 1.26, budget: 4.6 },
    roster: ['sketch', 'stitch', 'reseal', 'sizing', 'stencil', 'fray', 'binder', 'weft', 'kage', 'crane', 'gate', 'warden', 'titan', 'golem', 's_trace', 'c_hush'],
    order: ['sketch', 'stitch', 'reseal', 'sizing', 'stencil', 'fray', 'binder', 'weft', 'golem'],
    names: ['素紙', '下絵', '糸影', '糊染', '再印', '織端', '絹目', '古鏡', '無字', '落款'],
    elite: 'sketch', boss: 'b_blank', keeper: 'k_edge',
    keepers: ['k6_1', 'k6_2', 'k6_3', 'k6_4', 'k6_5', 'k6_6', 'k6_7', 'k6_8', 'k6_9', 'k_edge'],
  },
];

/* ---- THE STANDING ARMY (v19.4) ----
   every sheet walks with everything the brush has already met:
   each roster inherits the whole horde of the sheets before it, so
   the deeper scrolls muster every ink-born thing the journey has
   debuted — sheet VI leads a nation of sixty-plus kin, not its own
   nine. The newcomers still lead their own paper (their weight is
   the paper's voice; the army wades behind at seven-tenths), the
   debut wave still features its own beast, and the officers (c_)
   and the odd mechanics (s_) stay sheet-bound: one captain, one
   special per paper, cut from that sheet's ink. Horde beasts draw
   in the SHEET's ink (render paints the horde with the paper's own
   INK, and every boss burns the boss's own red), so the army
   inherits each paper's contrast by design. */
(function buildArmy() {
  const seen = [];
  for (const a of AREAS) {
    const carry = seen.filter(k => a.roster.indexOf(k) < 0);
    if (carry.length) a.roster = carry.concat(a.roster);
    a.carry = carry;
    for (const k of a.roster) {
      if (/^c_/.test(k) || /^s_/.test(k)) continue;   // officers & specials stay home
      if (seen.indexOf(k) < 0) seen.push(k);
    }
  }
})();

const UPGRADES = [
  /* ---- the hand's universal arts ----
     rapid/heavy speak to the BRUSH ITSELF (primary cadence, the
     depth of every stroke the hand lays); split/pierce/velo/echo
     speak to cast strokes and hide for the projectile-less brushes
     (Tide, Red Seal, Scribe); the rest are the scribe's body. */
  { id: 'rapid',  name: 'Quick Hand',   desc: 'The brush lifts 15% sooner between casts. Whatever it lays.',  max: 5, apply: s => { s.fireCdMult *= 0.85; } },
  { id: 'heavy',  name: 'Bitter Ink',   desc: 'Every stroke the hand lays bites one deeper — bolt, surge, stamp, scribe.', max: 4, apply: s => { s.dmg += 1; } },
  { id: 'split',  name: 'Twin Stroke',  desc: '+1 stroke per cast, fanned like brush hairs.',                max: 3, proj: 1, apply: s => { s.shots += 1; } },
  { id: 'pierce', name: 'Through Mist', desc: 'Cast strokes pass through +1 target before breaking.',        max: 3, proj: 1, apply: s => { s.pierce += 1; } },
  { id: 'velo',   name: 'Flick',        desc: '+22% cast-stroke speed. Reach grows with the wrist.',         max: 3, proj: 1, apply: s => { s.bulletSpeedMult *= 1.22; } },
  { id: 'over',   name: 'Fleeting Foot',desc: '+12% movement. Be elsewhere before the ink lands.',           max: 4, apply: s => { s.moveMult *= 1.12; } },
  { id: 'plate',  name: 'Thick Ink',    desc: '+1 max integrity and restore 1. You dilute slower.',          max: 3, apply: s => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { id: 'adren',  name: 'Red Seal',     desc: 'Every kill presses a seal: a short 1.2\u00d7 stride surge.',  max: 3, apply: s => { s.adren += 1; } },
  { id: 'shock',  name: 'Ink Burst',    desc: 'Taking a hit splashes everything nearby away. Once per hit.', max: 1, apply: s => { s.shock = true; } },
  { id: 'echo',   name: 'Echo Stroke',  desc: 'A mirrored cast answers behind your back. +1 stroke.',        max: 2, proj: 1, apply: s => { s.echo += 1; } },
  { id: 'orbit',  name: 'Ink Orbit',    desc: 'Droplets circle the brush in a wide ring, grinding all they graze.', max: 3, apply: s => { s.orb += 1; },
    maxSpec: 'THE GRAVE RING — an orbital hunts what it sees, every few breaths' },
  { id: 'slow',   name: 'Wet Paper',    desc: 'Struck beasts wade through soaked paper — slowed briefly.',   max: 2, apply: s => { s.slow += 1; } },
  { id: 'crit',   name: 'Crimson Tip',  desc: 'One stroke in six bites twice as deep. Deeper per rank.',     max: 2, apply: s => { s.crit += 1; } },
  { id: 'ward',   name: 'Paper Ward',   desc: 'A dry talisman swallows one hit whole, then reforms.',        max: 1, apply: s => { s.ward = true; } },
  { id: 'magnet', name: 'Ink Hunger',   desc: 'The paper pulls harder — +42% gathering radius per rank.',    max: 3, apply: s => { s.magnet += 1; } },
  { id: 'mends',  name: 'Paper Mends',  desc: 'The sheet heals itself: +1 integrity every so often.',        max: 2, apply: s => { s.mends += 1; s.mendsT = CFG.mends.period(s.mends); } },
  { id: 'well',   name: 'Deep Well',    desc: 'Every mote of ink is worth +25% more to the brush.',          max: 2, apply: s => { s.well += 1; } },
  /* ---- the learned powers ----
     Any brush may learn them; the brush born to one wears its first
     rank from the first wave, and every further pick deepens it. */
  { id: 'nova',   name: 'Black Tide',   desc: 'The ink surges outward every few breaths, shoving all back.', max: 3, ability: 1, apply: s => { s.nova += 1; },
    maxSpec: 'THE Risen SEA — the surge comes faster and reaches farther' },
  { id: 'fan',    name: 'Folded Fan',   desc: 'A cone of paper blades with every swing — more blades, faster.', max: 4, ability: 1, apply: s => { s.fan += 1; },
    maxSpec: 'THE FULL BLOOM — the fan snaps open full-circle' },
  { id: 'spirit', name: 'Spirit Scribes',desc: 'Lesser brushes wake and hunt on their own, seeking the nearest blot.', max: 3, ability: 1, apply: s => { s.spirit += 1; },
    maxSpec: 'THE LITANY — spirits run through up to three bodies and fly faster' },
  { id: 'hanko',  name: 'Crimson Hanko',desc: 'The great seal falls on the thickest horde — faster, broader.', max: 3, ability: 1, apply: s => { s.hanko += 1; },
    maxSpec: 'THE TWIN STAMP — a second, lighter seal follows the first' },
  { id: 'trail',  name: 'Ink Trail',    desc: 'Wherever you walk, the ink you leave still bites. Smears linger.', max: 3, ability: 1, apply: s => { s.trailW += 1; },
    maxSpec: 'THE LINGERING POOL — the ink bites twice as fast and pools deeper' },
  { id: 'arc',    name: 'Sumi Arc',     desc: 'A live stroke leaps from beast to beast, chaining like spilled lightning.', max: 4, ability: 1, apply: s => { s.arc += 1; },
    maxSpec: 'THE LIVING LINE — the stroke leaps three links farther' },
  { id: 'boomer', name: 'Returning Stroke', desc: 'A wide brushstroke flies out, then recalls itself — biting twice.', max: 4, ability: 1, apply: s => { s.boomer += 1; },
    maxSpec: 'THE MIRROR RETURN — the homing stroke bursts into an ink ring' },
  { id: 'vortex', name: 'Ink Vortex',   desc: 'A whirlpool of living ink opens, dragging beasts in and drowning them.', max: 3, ability: 1, apply: s => { s.vortex += 1; },
    maxSpec: 'THE WHORL TEETH — the closing whirlpool bites what remains' },
  /* ---- the brush's own arts ----
     One track per brush, no other hand may learn it: the weapon's
     own techniques, unique to the tool the run began with. */
  { id: 'nrain',  name: 'Needle Rain',  for: 'needle', art: 1, max: 1,
    desc: 'Every sixth cast opens into a six-thread fan, wide as a window.',
    apply: s => { s.nrain = 1; } },
  { id: 'ndeep',  name: 'Deep Point',   for: 'needle', art: 1, max: 2,
    desc: 'The needle’s own thread bites one deeper. Nothing else changes.',
    apply: s => { s.ndeep += 1; } },
  { id: 'nsilk',  name: 'Silk Thread',  for: 'needle', art: 1, max: 2,
    desc: 'The thread flies a fifth farther before it dries.',
    apply: s => { s.nsilk += 1; } },
  { id: 'bwide',  name: 'Wide Sweep',   for: 'broom', art: 1, max: 2,
    desc: 'The sweep opens wider — and at the second rank a third droplet joins.',
    apply: s => { s.bwide += 1; if (s.bwide >= 2) s.shots += 1; } },
  { id: 'bbrist', name: 'Heavy Bristles', for: 'broom', art: 1, max: 2,
    desc: 'The broom’s own droplets bite one deeper.',
    apply: s => { s.bbrist += 1; } },
  { id: 'bwet',   name: 'Wet Sweep',    for: 'broom', art: 1, max: 1,
    desc: 'What the sweep touches wades — struck beasts slow, briefly.',
    apply: s => { s.bwet = 1; } },
  { id: 'sshat',  name: 'Shatter',      for: 'stone', art: 1, max: 2,
    desc: 'Where the stone lands, the splash reaches nearly half again.',
    apply: s => { s.sshat += 1; } },
  { id: 'squake', name: 'Quake',        for: 'stone', art: 1, max: 1,
    desc: 'The splash stuns — beasts caught in it stand dazed a breath.',
    apply: s => { s.squake = 1; } },
  { id: 'sbould', name: 'Boulder',      for: 'stone', art: 1, max: 2,
    desc: 'A heavier lob: the stone bites one deeper and flies faster.',
    apply: s => { s.sbould += 1; } },
  { id: 'wtwin',  name: 'Twin Wisps',   for: 'wisp', art: 1, max: 2,
    desc: 'The brush breathes a second, then a third wisp with every cast.',
    apply: s => { s.wtwin += 1; } },
  { id: 'whaunt', name: 'Swift Haunt',  for: 'wisp', art: 1, max: 2,
    desc: 'The wisps hunt keener: faster casts, tighter turns.',
    apply: s => { s.whaunt += 1; } },
  { id: 'fbloom', name: 'Full Bloom',   for: 'fan', art: 1, max: 1,
    desc: 'Every FOURTH swing snaps open full-circle — ten blades, all around.',
    apply: s => { s.fbloom = 1; } },
  { id: 'fgale',  name: 'Gale Push',    for: 'fan', art: 1, max: 1,
    desc: 'The gust shoves — blades knock the horde back as they cut.',
    apply: s => { s.fgale = 1; } },
  { id: 'fedge',  name: 'Edge Wind',    for: 'fan', art: 1, max: 2,
    desc: 'One more blade rides every swing of the fan.',
    apply: s => { s.fedge += 1; } },
  { id: 'nrip',   name: 'Riptide',      for: 'tide', art: 1, max: 2,
    desc: 'The surge shoves half again harder, and stuns a breath longer.',
    apply: s => { s.nrip += 1; } },
  { id: 'nswell', name: 'Deep Swell',   for: 'tide', art: 1, max: 2,
    desc: 'The surge’s own bite deepens by one. The sea grows teeth.',
    apply: s => { s.nswell += 1; } },
  { id: 'nunder', name: 'Undertow',     for: 'tide', art: 1, max: 1,
    desc: 'The wake bites twice as fast — the wet ink hungers.',
    apply: s => { s.nunder = 1; } },
  { id: 'nspring',name: 'Spring Tide',  for: 'tide', art: 1, max: 2,
    desc: 'The surge reaches a fifth farther, rank by rank.',
    apply: s => { s.nspring += 1; } },
  { id: 'htwin',  name: 'Twin Stamp',   for: 'seal', art: 1, max: 1,
    desc: 'A second, lighter seal follows the first, a breath behind.',
    apply: s => { s.htwin = 1; } },
  { id: 'hbroad', name: 'Broad Seal',   for: 'seal', art: 1, max: 2,
    desc: 'The stamp presses a quarter broader, rank by rank.',
    apply: s => { s.hbroad += 1; } },
  { id: 'hpress', name: 'Deep Press',   for: 'seal', art: 1, max: 2,
    desc: 'The stamp’s own bite deepens by one.',
    apply: s => { s.hpress += 1; } },
  { id: 'hrain',  name: 'Red Rain',     for: 'seal', art: 1, max: 1,
    desc: 'Every fifth stamp falls twice — the two thickest hordes both.',
    apply: s => { s.hrain = 1; } },
  { id: 'ssecond',name: 'Second Scribe', for: 'scribe', art: 1, max: 2,
    desc: 'Another living stroke wakes and weaves beside the first.',
    apply: s => { s.ssecond += 1; } },
  { id: 'sswift', name: 'Swift Line',   for: 'scribe', art: 1, max: 2,
    desc: 'The stroke weaves a quarter faster through the horde.',
    apply: s => { s.sswift += 1; } },
  { id: 'slong',  name: 'Long Stroke',  for: 'scribe', art: 1, max: 2,
    desc: 'The stroke grows — all it passes feels its width.',
    apply: s => { s.slong += 1; } },
  { id: 'swake',  name: 'Ink Wake',     for: 'scribe', art: 1, max: 1,
    desc: 'Where the stroke has passed, its ink lingers and bites.',
    apply: s => { s.swake = 1; } },
  { id: 'sdeep',  name: 'Deep Ink',     for: 'scribe', art: 1, max: 2,
    desc: 'The stroke’s own bite deepens by one, rank by rank.',
    apply: s => { s.sdeep += 1; } },
]

/* ---- CHARMS (符) — what the purse buys ----
   Permanent upgrades, pressed between runs. The purse holds the
   ink (om_charms_v1); a charm's rank rides every page the hand
   opens — journey, endless, daily, the shelf's resumed scenes.
   V20 — THE SEALED LADDER: the board presses WAY heavier now.
   Every charm climbs to eight ranks, the prices climb steeper than
   the ranks do (the deep ranks cost whole journeys, not waves),
   and the SCROLLS GATE THE LADDER — the highest sheet the journey
   has unrolled caps every charm at 2 + that count, so the first
   scroll sells only three ranks of anything and each unrolled
   scroll opens one more. The board only ever buys the hand's basic
   arts — cadence, footwork, bite, integrity, gathering, the
   purse itself — and the brush's own two upgrades. NO CHARM EVER
   UNLOCKS A WEAPON: a brush arrives by the seals alone and speaks
   through the in-game picks. Total board: INK 351,450 over 79
   ranks. Checked in scripts/economy_calc.js. */
const CHARMS = [
  { id: 'hunger', kanji: '引', name: 'INK HUNGER',   cost: [90, 220, 520, 1100, 2200, 4200, 7200, 11500],
    desc: 'The paper pulls harder. Gathering radius widens, rank by rank.',
    apply: s => { s.magnet += 1; } },
  { id: 'breath', kanji: '息', name: 'LONG BREATH',  cost: [100, 260, 600, 1300, 2600, 4900, 8200, 13000],
    desc: 'The hand\u2019s strokes fly seven parts farther in ten, rank by rank.',
    apply: s => { s.bulletSpeedMult *= 1.07; } },
  { id: 'quick',  kanji: '疾', name: 'QUICK HAND',   cost: [120, 300, 700, 1500, 3000, 5600, 9200, 14500],
    desc: 'The brush lifts five parts in a hundred sooner between casts, rank by rank.',
    apply: s => { s.fireCdMult *= 0.95; } },
  { id: 'flick',  kanji: '歩', name: 'FLICK',        cost: [110, 280, 650, 1400, 2800, 5200, 8600, 13500],
    desc: 'The hand moves lighter. Be elsewhere before the ink lands.',
    apply: s => { s.moveMult *= 1.05; } },
  { id: 'thick',  kanji: '厚', name: 'THICK PAPER',  cost: [160, 400, 900, 1900, 3700, 6800, 11000, 17000],
    desc: 'One more integrity, pressed into every run. The sheet holds.',
    apply: s => { s.maxHp += 1; s.hp += 1; } },
  { id: 'bitter', kanji: '重', name: 'BITTER INK',   cost: [190, 480, 1100, 2300, 4500, 8200, 13000, 20000],
    desc: 'Every stroke the hand lays bites one deeper. Dense, dark, permanent.',
    apply: s => { s.dmg += 1; } },
  { id: 'redtip', kanji: '赤', name: 'RED TIP',      cost: [170, 420, 980, 2100, 4100, 7500, 12000, 18500],
    desc: 'Five strokes in a hundred bite twice as deep, whatever the hand carries.',
    apply: s => { s.critC += 0.05; } },
  { id: 'oldink', kanji: '遺', name: 'THE OLD INK',  cost: [300, 700, 1500, 3000, 5600],
    desc: 'Every mote of ink is worth a fourth more to the brush. The old ink remembers.',
    apply: s => { s.well += 1; } },
  { id: 'ward',   kanji: '守', name: 'THE PAPER WARD', cost: [560],
    desc: 'Every run begins warded. A dry talisman swallows the first blow whole.',
    apply: s => { s.ward = true; } },
  /* the brush's own tracks — the weapon itself, pressed permanent */
  { id: 'firststroke', kanji: '筆', name: 'THE FIRST STROKE', cost: [260, 620, 1400, 2900, 5600, 10000, 15500, 24000],
    desc: 'The brush you carry bites one deeper — its own ink, and nothing else\u2019s.',
    apply: s => { s.firststroke += 1; } },
  { id: 'swiftbrush', kanji: '手', name: 'THE SWIFT HAND', cost: [240, 580, 1300, 2700, 5200],
    desc: 'The brush you carry casts a tenth part sooner, rank by rank.',
    apply: s => { s.swiftbrush += 1; } },
  { id: 'scholar', kanji: '学', name: 'THE SCHOLAR', cost: [380, 860, 1800, 3600],
    desc: 'Every wave survived presses a tenth more into the purse. Study pays.',
    apply: s => {} },   /* read by inkForRun through charmLv — the ledger's own charm */
];

/* ---- THE BOSS BANNER SPEAKS ----
   Every named beast announces itself with one line — the duel's
   tone set before the first stroke lands: hard, and glad of it. */
const BOSS_TAUNTS = {
  b_wheel:   'IT DRINKS THE SHEET. DRINK IT BACK.',
  k_blight:  'THE STAIN SENDS ITS FIRST SERVANT.',
  b_mother:  'THE DARK HAS A HEART. LISTEN TO IT BEAT.',
  k_husk:    'A PIECE OF THE NIGHT, STILL HUNGRY.',
  b_warlord: 'FOUR HORNS, ONE ROAD — AND THE ROAD IS BEHIND YOU.',
  k_cinder:  'THE ONI\u2019S SHADOW, STILL BURNING.',
  b_tempest: 'STAND IN THE RAIN. THEN STAND SOMEWHERE ELSE.',
  k_veil:    'THE STORM LEAVES ITS VEIL BEHIND.',
  b_origin:  'THE FIRST STROKE IS STILL WET.',
  k_nib:     'THE OLD BRUSH\u2019S TIP — IT REMEMBERS YOUR HAND.',
  b_blank:   'THE PAGE IS STILL BLANK. IT WANTS YOUR HAND.',
  k_edge:    'THE MARGIN HOLDS WHAT THE BRUSH FORGOT.',
  /* the ten seals speak — one line per scene-keeper, the duel set before the first stroke */
  k1_1: 'A SPILL THAT LEARNED TO HUNGER.',
  k1_2: 'IT GREW OVERNIGHT. IT BITES BY DAWN.',
  k1_3: 'THE MOUNTAIN CAME DOWN TO SEE YOU.',
  k1_4: 'IT SWIMS WHERE YOU WILL BE.',
  k1_5: 'BREATHE. IT IS ALREADY IN YOUR LUNGS.',
  k1_6: 'EVERY DROP REMEMBERS FALLING.',
  k1_7: 'ONE LEG. ONE STROKE. ONE OF YOU WALKS AWAY.',
  k1_8: 'ROOTS FIRST. NEEDLES AFTER.',
  k1_9: 'THE DAY ENDS WHERE IT STANDS.',
  k2_1: 'IT LIGHTS THE DARK TO SEE YOU BETTER.',
  k2_2: 'THE NIGHT HUNTS ON WING.',
  k2_3: 'IT DRINKS THE DARK AND SPITS TEETH.',
  k2_4: 'FLAME REMEMBERS. SO DOES THE WAX.',
  k2_5: 'THE DARK POOLS WHERE YOU STAND.',
  k2_6: 'NO ONE MARCHES UNDER IT. EVERYONE DOES.',
  k2_7: 'IT WORE A FACE ONCE. IT KEPT IT.',
  k2_8: 'TALL ENOUGH TO WATCH. FAR ENOUGH TO WAIT.',
  k2_9: 'IT SLEEPS IN INK. YOUR STEP IS THE ALARM.',
  k3_1: 'THE GATE STANDS. YOU WALK THROUGH IT.',
  k3_2: 'THE FIELD REMEMBERS EVERY FIRE.',
  k3_3: 'IT OPENS. THE FIELD KNEELS.',
  k3_4: 'NOBODY PASSES UNSTAMPED.',
  k3_5: 'IT CARRIES THE KILN IN ITS CHEST.',
  k3_6: 'IT DELIVERS. IT DOES NOT KNOCK.',
  k3_7: 'THE HAMMER FELL. THE SPARKS WALK.',
  k3_8: 'EVERY STROKE IT SEES, IT SIGNS.',
  k3_9: 'THE PATH IS BEHIND YOU. IT IS THE ONLY ONE.',
  k4_1: 'THE SKY LEANED DOWN TO LOOK.',
  k4_2: 'IT POINTS. THE WIND OBEYS.',
  k4_3: 'THE RIVER REMEMBERS EVERY LEAP.',
  k4_4: 'THE RAIN HAS A CENTER. YOU ARE IN IT.',
  k4_5: 'THE RIVER TOOK A TURN. IT TOOK YOU.',
  k4_6: 'EVERY DROP ASKS YOUR NAME.',
  k4_7: 'THE WAVE STOOD UP. IT SAW YOU.',
  k4_8: 'LIGHTNING KEEPS ITS OWN TIME.',
  k4_9: 'THE MARCH IS WET. THE MARCH GOES ON.',
  k5_1: 'EVERYTHING SHE TOUCHES OWES HER.',
  k5_2: 'THE MOLD IS BROKEN. THE COINS ARE NOT.',
  k5_3: 'IT BURNED ONCE. GOLD CAME OUT.',
  k5_4: 'THE LEDGER ALWAYS BALANCES. IT IS THE LEDGER.',
  k5_5: 'IT SMILES IN GOLD. IT MEANS NOTHING BY IT.',
  k5_6: 'RICHES ROLL DOWNHILL. SO DOES IT.',
  k5_7: 'KNEELING IS OPTIONAL. FALLING IS NOT.',
  k5_8: 'FLESH IN. GOLD OUT.',
  k5_9: 'THE LAST LIGHT IS THE MOST EXPENSIVE.',
  k6_1: 'DRAWN FIRST. ERASED NEVER.',
  k6_2: 'HOLDING IT TOGETHER IS ITS WHOLE JOB.',
  k6_3: 'REJECTED ONCE. IT CAME BACK SIGNED.',
  k6_4: 'IT HOLDS. EVERYTHING HOLDS. FOREVER.',
  k6_5: 'THE SILK STRETCHES. THE SILK REMEMBERS.',
  k6_6: 'RUN YOUR HAND ALONG IT. IT RUNS BACK.',
  k6_7: 'IT SHOWS YOU FINISHED.',
  k6_8: 'WRITTEN IN THE MARGIN. IN RED.',
  k6_9: 'THE PAGE ENDS HERE. IT DECIDED.',
};
