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
    fireCd: 0.42,      // s between volleys
    bulletSpeed: 560,  // px/s
    bulletLife: 0.95,  // s aloft (range = speed * life)
    spread: 0.13,      // rad between extra droplets
  },

  /* starting brushes — choose one before the run begins.
     The sealed brushes open as the journey's scenes are SEALED
     (a scene seals when its tenth wave's Keeper falls): three
     scenes wake the Wisp, six the Fan, ten — one whole sheet —
     the Tide, fourteen the Red Seal. Locked brushes cannot be
     chosen; the shelf of seals is the key. */
  brushes: {
    needle: { name: 'THE NEEDLE', kanji: '細', desc: 'A fine tip that barely lifts. Fire comes fast, strokes stay light.',
      mods: { fireCdMult: 0.72, moveMult: 1.08 } },
    broom:  { name: 'THE BROOM', kanji: '掃', desc: 'A wide brush that sweeps two droplets at once, slower between strokes.',
      mods: { shots: 2, fireCdMult: 1.24 } },
    stone:  { name: 'THE STONE', kanji: '岩', desc: 'A heavy hand. Every droplet bites deeper and the paper holds longer.',
      mods: { dmg: 2, maxHp: 4, moveMult: 0.9, fireCdMult: 1.08 } },
    wisp:   { name: 'THE WISP', kanji: '幽', unlock: 3,
      desc: 'The brush never fights alone: a lesser spirit wakes beside it and hunts on its own.',
      mods: { spirit: 1, fireCdMult: 1.05, moveMult: 0.98 } },
    fan:    { name: 'THE FAN', kanji: '扇', unlock: 6,
      desc: 'Carries a folded fan. The volley comes slower; every few breaths the fan snaps open instead.',
      mods: { fan: 1, fireCdMult: 1.14 } },
    tide:   { name: 'THE TIDE', kanji: '潮', unlock: 10,
      desc: 'The black tide answers it: every few breaths the ink surges outward and shoves the paper back.',
      mods: { nova: 1, moveMult: 0.95 } },
    seal:   { name: 'THE RED SEAL', kanji: '印', unlock: 14,
      desc: 'A heavy hand and a great hanko. Every eleventh breath the stamp falls on the thickest horde.',
      mods: { hanko: 1, fireCdMult: 1.16, moveMult: 0.95 } },
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

  /* ---- THE INKSTONE (硯) — what the runs press out ----
     When a run ends, the press squeezes its ink back into the stone:
     a currency that survives the paper, spent on CHARMS between runs.
     Every wave survived presses 6 drops (waves past the six sheets
     press double — the endless loops go deeper than the journey ever
     asked); each Guardian felled this run adds 80; the six sheets
     signed adds 300, once ever. A new personal best presses 1.25×,
     REALLY HARD presses the ledger's own double, and a practiced
     daily sheet presses only a fifth — practice is for the hand,
     not the stone. Checked in scripts/economy_calc.js. */
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
     it quickens every beast near it, calls fresh ink into the paper,
     and when it falls its whole fan stuns — break the officer and
     the rank breaks with it. One per sheet, cut from that sheet's ink. */
  captain: { auraR: 210, auraMult: 1.32, deathStun: 1.15, deathR: 235 },

  shockwave: { radius: 230, knock: 420 },
  adrenaline: { mult: 1.22, dur: lv => 1.4 + 0.45 * (lv - 1) },

  /* brush skills */
  orbit:   { radius: lv => 96 + lv * 28, speed: 2.9, dmgCd: 0.4, flingEvery: 4 },
  nova:    { period: lv => 6.6 - 0.9 * (lv - 1), radius: lv => 165 + lv * 38, knock: 330, stun: 0.4 },
  ward:    { cd: 22 },
  slow:    { dur: 1.6, mult: 0.55 },
  crit:    { chance: lv => 0.16 * lv },
  magnet:  { radius: lv => CFG.xp.pickupR * (1 + 0.42 * lv) },
  mends:   { period: lv => 40 - 9 * lv },

  /* weapons */
  fan:    { period: lv => 3.4 - 0.35 * (lv - 1), count: lv => 4 + lv, speed: 430, life: 0.62, spread: 1.15, dmg: 1 },
  trail:  { gap: lv => 0.5 - 0.08 * (lv - 1), radius: lv => 26 + lv * 7, life: 2.7, tick: 0.42, dmg: 1 },
  spirit: { period: lv => 3.1 - 0.3 * (lv - 1), count: lv => 1 + lv, speed: 300, turn: 7.5, life: 3.2, dmg: 1 },
  hanko:  { period: lv => 11.5 - 1.1 * (lv - 1), radius: lv => 84 + lv * 10, dmg: lv => 3 + lv, stun: 0.4 },
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
     multipliers (hp 1 → 6.6) do the climbing across the journey, so
     these fall as the papers darken on purpose: every Guardian is a
     ~35–60s set piece, and the First Brush is the longest fight in
     the game. In the endless paper the wave growth re-tallens them. */
  b_wheel:   { name: 'THE STAIN',       trait: 'GUARDIAN I',   cost: 0, intro: 100, hp: 1400,  r: 34, speed: 46, score: 500, shape: 'boss', boss: 1 },
  b_mother:  { name: 'THE NIGHT MOTHER',trait: 'GUARDIAN II',  cost: 0, intro: 200, hp: 800,  r: 30, speed: 52, score: 800, shape: 'boss', boss: 1 },
  b_warlord: { name: 'THE CINNABAR ONI',trait: 'GUARDIAN III', cost: 0, intro: 300, hp: 820,  r: 33, speed: 50, score: 1200, shape: 'boss', boss: 1 },
  b_tempest: { name: 'THE STORM EYE',   trait: 'GUARDIAN IV',  cost: 0, intro: 400, hp: 620, r: 30, speed: 58, score: 1700, shape: 'boss', boss: 1 },
  b_origin:  { name: 'THE FIRST BRUSH', trait: 'GUARDIAN V',   cost: 0, intro: 500, hp: 700, r: 36, speed: 44, score: 2400, shape: 'boss', boss: 1 },
  b_blank:   { name: 'THE UNWRITTEN',   trait: 'GUARDIAN VI',  cost: 0, intro: 600, hp: 660, r: 32, speed: 50, score: 2600, shape: 'boss', boss: 1 },

  /* ---- the six Keepers, one per sheet, on EVERY tenth wave ----
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
  /* the officers and the odd mechanics — present, never flooding */
  c_drum: 0.75, c_choir: 0.75, c_banner: 0.75, c_gale: 0.75, c_gild: 0.75, c_hush: 0.75,
  s_nest: 0.9, s_mender: 0.8, s_toller: 0.9, s_ledger: 0.8, s_trace: 0.8,
  /* the blank silk's own half-drawn things */
  sketch: 1.5, stitch: 1.4, reseal: 0.9, sizing: 1.2, binder: 0.9, weft: 1.3,
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
    roster: ['pulse', 'dart', 'popper', 'washling', 'moth', 'split', 'palecrane', 'slab', 'wraith', 'gnat', 'blotter', 'c_drum'],
    order: ['pulse', 'dart', 'popper', 'washling', 'moth', 'split', 'palecrane', 'slab', 'wraith'],
    names: ['初描', '新樹', '遠山', '淡游', '霧起', '垂露', '鶴舞', '古松', '暮色', '落款'],
    elite: 'slab', boss: 'b_wheel', keeper: 'k_blight',
  },
  {
    id: 'II', name: 'NIGHT SCROLL', kanji: '夜', theme: 'dark',
    ink: '濃墨',                                     // lamp-black, heavy
    desc: 'The ink deepens. Things move inside it.',
    mult: { hp: 1.7, sp: 1.06, budget: 1.45 },
    roster: ['spit', 'shade', 'kage', 'nightshade', 'stilt', 'lotus', 'gloom', 'warden', 'titan', 'owl', 'smother', 's_nest', 'c_choir'],
    order: ['spit', 'shade', 'kage', 'nightshade', 'stilt', 'lotus', 'gloom', 'warden', 'titan'],
    names: ['入夜', '遠浦', '梟鳴', '夜影', '高軒', '蓮池', '墨霧', '旌旗', '母胎', '落款'],
    elite: 'shade', boss: 'b_mother', keeper: 'k_husk',
  },
  {
    id: 'III', name: 'CINNABAR FIELD', kanji: '紅', theme: 'red',
    ink: '朱墨',                                     // vermillion-stained
    desc: 'A vermillion wash dries underfoot. The last stroke is heaviest.',
    mult: { hp: 2.7, sp: 1.1, budget: 2.0 },
    roster: ['oni', 'ember', 'crane', 'sealbearer', 'gate', 'spit', 'kage', 'titan', 'slab', 'ashigaru', 'stamper', 'shiki', 'c_banner', 's_mender'],
    order: ['oni', 'ember', 'crane', 'sealbearer', 'gate', 'spit', 'kage', 'titan', 'slab'],
    names: ['朱土', '飛火', '鶴影', '印卒', '鳥居', '遠崖', '影踏', '古巣', '絕壁', '落款'],
    elite: 'oni', boss: 'b_warlord', keeper: 'k_cinder',
  },
  {
    id: 'IV', name: 'STORM SHEET', kanji: '嵐', theme: 'storm',
    ink: '雨墨',                                     // rain-grey
    desc: 'Rain hammers the paper. The ink runs like rivers.',
    mult: { hp: 4.2, sp: 1.16, budget: 2.7 },
    roster: ['raindrake', 'gale', 'koi', 'crane', 'dart', 'wraith', 'warden', 'popper', 'moth', 'surge', 'maelstrom', 'crest', 'c_gale', 's_toller'],
    order: ['raindrake', 'gale', 'koi', 'crane', 'dart', 'wraith', 'warden', 'popper', 'moth'],
    names: ['雲垂', '陣風', '鯉躍', '雨晴', '疾矢', '霧海', '旌搖', '雨簾', '怒濤', '落款'],
    elite: 'stilt', boss: 'b_tempest', keeper: 'k_veil',
  },
  {
    id: 'V', name: 'GILT SCROLL', kanji: '金', theme: 'gilt',
    ink: '金墨',                                     // gold-dusted
    desc: 'Old gold leaf underfoot. The last sheet is the heaviest.',
    mult: { hp: 6.6, sp: 1.22, budget: 3.4 },
    roster: ['gildling', 'phoenix', 'golem', 'oni', 'gate', 'titan', 'kage', 'warden', 'spit', 'mirror', 'koban', 'cask', 'c_gild', 's_ledger'],
    order: ['gildling', 'phoenix', 'golem', 'oni', 'gate', 'titan', 'kage', 'warden', 'spit'],
    names: ['金泥', '鳳來', '石像', '鬼門', '樓閣', '母金', '影金', '旌耀', '雨期', '落款'],
    elite: 'oni', boss: 'b_origin', keeper: 'k_nib',
  },
  {
    id: 'VI', name: 'THE BLANK SILK', kanji: '素', theme: 'silk',
    ink: '素墨',                                     // cool ink on unstained silk
    desc: 'The silk the first stroke landed on. Some things are still only drawn.',
    mult: { hp: 7.9, sp: 1.26, budget: 4.1 },
    roster: ['sketch', 'stitch', 'reseal', 'sizing', 'binder', 'weft', 'kage', 'crane', 'gate', 'warden', 'titan', 'golem', 's_trace', 'c_hush'],
    order: ['sketch', 'stitch', 'reseal', 'sizing', 'binder', 'weft', 'gate', 'titan', 'golem'],
    names: ['素紙', '下絵', '糸影', '糊染', '再印', '織端', '絹目', '古鏡', '無字', '落款'],
    elite: 'sketch', boss: 'b_blank', keeper: 'k_edge',
  },
];

const UPGRADES = [
  { id: 'rapid',  name: 'Quick Hand',   desc: '−15% time between volleys. The brush barely lifts.',         max: 5, apply: s => { s.fireCdMult *= 0.85; } },
  { id: 'heavy',  name: 'Bitter Ink',   desc: '+1 damage per droplet. Dense, dark, final.',                 max: 4, apply: s => { s.dmg += 1; } },
  { id: 'split',  name: 'Twin Stroke',  desc: '+1 droplet per volley, fanned like brush hairs.',            max: 3, apply: s => { s.shots += 1; } },
  { id: 'pierce', name: 'Through Mist', desc: 'Droplets pass through +1 target before breaking.',           max: 3, apply: s => { s.pierce += 1; } },
  { id: 'velo',   name: 'Flick',        desc: '+22% droplet speed. Reach grows with the wrist.',            max: 3, apply: s => { s.bulletSpeedMult *= 1.22; } },
  { id: 'over',   name: 'Fleeting Foot',desc: '+12% movement. Be elsewhere before the ink lands.',          max: 4, apply: s => { s.moveMult *= 1.12; } },
  { id: 'plate',  name: 'Thick Ink',    desc: '+1 max integrity and restore 1. You dilute slower.',         max: 3, apply: s => { s.maxHp += 1; s.hp = Math.min(s.maxHp, s.hp + 1); } },
  { id: 'adren',  name: 'Red Seal',     desc: 'Every kill presses a seal: a short 1.2× stride surge.',      max: 3, apply: s => { s.adren += 1; } },
  { id: 'shock',  name: 'Ink Burst',    desc: 'Taking a hit splashes everything nearby away. Once per hit.', max: 1, apply: s => { s.shock = true; } },
  { id: 'echo',   name: 'Echo Stroke',  desc: 'A mirrored volley answers behind your back. +1 droplet.',    max: 2, apply: s => { s.echo += 1; } },
  { id: 'orbit',  name: 'Ink Orbit',    desc: 'Droplets circle the brush in a wide ring, grinding all they graze.', max: 3, apply: s => { s.orb += 1; },
    maxSpec: 'THE GRAVE RING — an orbital hunts what it sees, every few breaths' },
  { id: 'nova',   name: 'Black Tide',   desc: 'Every few breaths the ink surges outward, shoving all back.', max: 3, apply: s => { s.nova += 1; } },
  { id: 'slow',   name: 'Wet Paper',    desc: 'Struck beasts wade through soaked paper — slowed briefly.',  max: 2, apply: s => { s.slow += 1; } },
  { id: 'crit',   name: 'Crimson Tip',  desc: 'One stroke in six bites twice as deep. Deeper per rank.',    max: 2, apply: s => { s.crit += 1; } },
  { id: 'ward',   name: 'Paper Ward',   desc: 'A dry talisman swallows one hit whole, then reforms.',       max: 1, apply: s => { s.ward = true; } },
  { id: 'magnet', name: 'Ink Hunger',   desc: 'The paper pulls harder — +42% gathering radius per rank.',   max: 3, apply: s => { s.magnet += 1; } },
  { id: 'mends',  name: 'Paper Mends',  desc: 'The sheet heals itself: +1 integrity every so often.',       max: 2, apply: s => { s.mends += 1; s.mendsT = CFG.mends.period(s.mends); } },
  { id: 'well',   name: 'Deep Well',    desc: 'Every mote of ink is worth +25% more to the brush.',         max: 2, apply: s => { s.well += 1; } },
  /* ---- weapons ---- */
  { id: 'fan',    name: 'Folded Fan',   desc: 'Every few breaths the fan snaps open — a spray of paper blades.', max: 4, weapon: true, apply: s => { s.fan += 1; },
    maxSpec: 'THE FULL BLOOM — every fourth cast snaps open full-circle' },
  { id: 'trail',  name: 'Ink Trail',    desc: 'Wherever you walk, the ink you leave still bites. Smears linger.', max: 3, weapon: true, apply: s => { s.trailW += 1; },
    maxSpec: 'THE LINGERING POOL — the ink bites twice as fast and pools deeper' },
  { id: 'spirit', name: 'Spirit Scribes',desc: 'Lesser brushes wake and hunt on their own, seeking the nearest blot.', max: 3, weapon: true, apply: s => { s.spirit += 1; },
    maxSpec: 'THE LITANY — spirits run through up to three bodies and fly faster' },
  { id: 'hanko',  name: 'Crimson Hanko',desc: 'Every eleventh breath a great red seal slams the nearest horde — elites bend it, few break it.', max: 3, weapon: true, apply: s => { s.hanko += 1; },
    maxSpec: 'THE TWIN STAMP — a second, lighter seal follows the first' },
  { id: 'arc',    name: 'Sumi Arc',     desc: 'A live stroke leaps from beast to beast, chaining like spilled lightning.', max: 4, weapon: true, apply: s => { s.arc += 1; },
    maxSpec: 'THE LIVING LINE — the stroke leaps three links farther' },
  { id: 'boomer', name: 'Returning Stroke', desc: 'A wide brushstroke flies out, then recalls itself — biting twice.', max: 4, weapon: true, apply: s => { s.boomer += 1; },
    maxSpec: 'THE MIRROR RETURN — the homing stroke bursts into an ink ring' },
  { id: 'vortex', name: 'Ink Vortex',   desc: 'A whirlpool of living ink opens, dragging beasts in and drowning them.', max: 3, weapon: true, apply: s => { s.vortex += 1; },
    maxSpec: 'THE WHORL TEETH — the closing whirlpool bites what remains' },
];

/* ---- CHARMS (符) — what the inkstone buys ----
   Permanent upgrades, pressed between runs. The stone holds the
   ink (om_charms_v1); a charm's rank rides every page the hand
   opens — journey, endless, daily, the shelf's resumed scenes.
   The ladder is best-practice shaped: the cheapest charm lands on
   the FIRST run, quality-of-life leads, damage is capped at half
   a real build, and the ward's in-run pick retires once the charm
   owns it (no trap options). Total board: 硯 4,890 over 19 ranks. */
const CHARMS = [
  { id: 'hunger', kanji: '引', name: 'INK HUNGER',   cost: [50, 130],
    desc: 'The paper pulls harder. Gathering radius widens, rank by rank.',
    apply: s => { s.magnet += 1; } },
  { id: 'breath', kanji: '息', name: 'LONG BREATH',  cost: [70, 180],
    desc: 'Droplets fly ten parts farther in ten. The wrist never tires.',
    apply: s => { s.bulletSpeedMult *= 1.10; } },
  { id: 'quick',  kanji: '疾', name: 'QUICK HAND',   cost: [90, 220, 500],
    desc: 'The brush lifts eight parts in a hundred faster, between volleys.',
    apply: s => { s.fireCdMult *= 0.92; } },
  { id: 'flick',  kanji: '歩', name: 'FLICK',        cost: [80, 200, 460],
    desc: 'The hand moves lighter. Be elsewhere before the ink lands.',
    apply: s => { s.moveMult *= 1.08; } },
  { id: 'thick',  kanji: '厚', name: 'THICK PAPER',  cost: [140, 360],
    desc: 'One more integrity, pressed into every run. The sheet holds.',
    apply: s => { s.maxHp += 1; s.hp += 1; } },
  { id: 'bitter', kanji: '重', name: 'BITTER INK',   cost: [160, 420],
    desc: 'Every droplet bites one deeper. Dense, dark, permanent.',
    apply: s => { s.dmg += 1; } },
  { id: 'redtip', kanji: '赤', name: 'RED TIP',      cost: [150, 400],
    desc: 'Six strokes in a hundred bite twice as deep, whatever the hand carries.',
    apply: s => { s.critC += 0.06; } },
  { id: 'oldink', kanji: '遺', name: 'THE OLD INK',  cost: [240, 560],
    desc: 'Every mote of ink is worth a fourth more to the brush. The old ink remembers.',
    apply: s => { s.well += 1; } },
  { id: 'ward',   kanji: '守', name: 'THE PAPER WARD', cost: [480],
    desc: 'Every run begins warded. A dry talisman swallows the first blow whole.',
    apply: s => { s.ward = true; } },
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
};
