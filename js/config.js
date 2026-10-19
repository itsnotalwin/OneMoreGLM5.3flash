'use strict';
/* ============================================================
   ONE MORE — tuning constants, ink-beast roster, upgrade pool,
   the five scrolls (areas), their Guardians, and the endless
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

  /* starting brushes — choose one before the run begins */
  brushes: {
    needle: { name: 'THE NEEDLE', kanji: '細', desc: 'A fine tip that barely lifts. Fire comes fast, strokes stay light.',
      mods: { fireCdMult: 0.72, moveMult: 1.08 } },
    broom:  { name: 'THE BROOM', kanji: '掃', desc: 'A wide brush that sweeps two droplets at once, slower between strokes.',
      mods: { shots: 2, fireCdMult: 1.24 } },
    stone:  { name: 'THE STONE', kanji: '岩', desc: 'A heavy hand. Every droplet bites deeper and the paper holds longer.',
      mods: { dmg: 2, maxHp: 4, moveMult: 0.9, fireCdMult: 1.08 } },
  },

  /* the world is unbounded — the brush walks an endless sheet */
  world: {
    spawnPad: 90,      // how far beyond the screen edge beasts are born
    stainCap: 430,     // max dried stains kept on the paper
    stainFade: 0.075,  // alpha lost per second (dried ink fades)
    decoCell: 260,     // world-cell size for ambient paper marks
  },

  wave: {
    wavesPerArea: 10,
    budget: (wInArea, areaIdx) => 6.5 + wInArea * 3.3 + areaIdx * 3.1,
    surgeEvery: 5,                               // every Nth wave of an area is a SURGE
    surgeMult: 1.5,                              // +0.09 per sheet, deeper in (game.js)
    groupInterval: w => Math.max(0.34, 1.45 - w * 0.06),
    groupSize: (w, areaIdx) => 3 + Math.floor(w / 3) + areaIdx,
    concurrentCap: (w, areaIdx) => Math.min(72, 14 + w * 2 + areaIdx * 8),
    hpScale: (base, w, intro) => Math.max(1, Math.round(base * (1 + 0.085 * (w - intro)))),
    spScale: (w, intro) => Math.min(1.32, 1 + 0.007 * (w - intro)),
    eliteHpMult: 5.2,
    eliteR: 1.62,
  },

  /* ---- ink motes & level-ups: the survivors' loop ---- */
  xp: {
    req: lv => Math.round(6 + 5 * lv + 0.18 * lv * lv), // ink needed for level lv→lv+1
    moteLife: 26,      // s before a mote dries into the paper
    pickupR: 68,       // base collection radius (magnet passive extends it)
    magnetPulse: 3.2,  // s the magnet talisman vacuums everything
    cap: 240,          // max motes on the sheet
  },

  /* combo: chained kills multiply the score */
  combo: {
    decay: 2.3,        // s before the chain breaks
    step: 0.02,        // score mult per chain count
    max: 5,            // score mult ceiling
    showAt: 8,         // chain count before the chip appears
  },

  /* the endless paper keeps growing teeth */
  endless: { hpGrowth: 1.15, spGrowth: 1.012, budgetGrowth: 1.18 },

  shockwave: { radius: 230, knock: 420 },
  adrenaline: { mult: 1.22, dur: lv => 1.4 + 0.45 * (lv - 1) },

  /* brush skills */
  orbit:   { radius: lv => 40 + lv * 5, speed: 2.7, dmgCd: 0.45 },
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
  hanko:  { period: lv => 6.4 - 0.8 * (lv - 1), radius: lv => 92 + lv * 22, dmg: lv => 2 + lv, stun: 0.3 },
  arc:    { period: lv => 2.5 - 0.22 * (lv - 1), jumps: lv => 2 + lv, range: 210, dmg: lv => 1 + Math.ceil(lv / 2) },
  boomer: { period: lv => 2.9 - 0.25 * (lv - 1), speed: 620, dist: lv => 300 + lv * 40, dmg: lv => 1 + lv, life: 3 },
  vortex: { period: lv => 7.5 - 0.7 * (lv - 1), radius: lv => 90 + lv * 24, dur: lv => 2 + 0.25 * lv, pull: 340, tick: 0.36, dmg: 1 },

  /* enemy ink globs and needles */
  glob:   { speed: 215, life: 2.4, r: 5 },
  needle: { speed: 470, life: 1.7, r: 3 },

  // total waves cleared → rank, else 'D'
  ranks: [[40, 'S+'], [34, 'S'], [26, 'A'], [18, 'B'], [8, 'C']],

  /* ---- ink engine knobs (consumed by render.js) ---- */
  ink: {
    boilRate: 0.115,        // s per hand-drawn frame (line boil)
    stainFadePerSec: 0.055, // legacy knob (world stains use world.stainFade)
    trailGap: 0.085,        // s between player ink-trail stamps
  },
};

/* The ink-born. Every creature is a living blot of sumi ink. */
const ENEMIES = {
  pulse:     { name: 'BLOT',    trait: 'DRIFTER',  cost: 1, intro: 1,  hp: 2,  r: 12, speed: 92,  score: 10, shape: 'circle'  },
  dart:      { name: 'SPEAR',   trait: 'LUNGER',   cost: 2, intro: 2,  hp: 1,  r: 9,  speed: 80,  score: 15, shape: 'tri'     },
  spit:      { name: 'SPIT',    trait: 'GUNNER',   cost: 3, intro: 4,  hp: 2,  r: 11, speed: 74,  score: 25, shape: 'spit'    },
  popper:    { name: 'POPPER',  trait: 'BOMBER',   cost: 2, intro: 5,  hp: 2,  r: 10, speed: 148, score: 20, shape: 'popper'  },
  moth:      { name: 'MOTH',    trait: 'ERRATIC',  cost: 2, intro: 5,  hp: 2,  r: 10, speed: 122, score: 20, shape: 'moth'    },
  split:     { name: 'DRIP',    trait: 'DIVIDER',  cost: 2, intro: 6,  hp: 3,  r: 12, speed: 95,  score: 15, shape: 'diamond' },
  slab:      { name: 'BRUTE',   trait: 'BRUISER',  cost: 3, intro: 8,  hp: 8,  r: 17, speed: 42,  score: 30, shape: 'square'  },
  shade:     { name: 'SHADE',   trait: 'PHANTOM',  cost: 3, intro: 7,  hp: 3,  r: 12, speed: 88,  score: 35, shape: 'shade'   },
  wraith:    { name: 'WISP',    trait: 'WEAVER',   cost: 2, intro: 10, hp: 2,  r: 11, speed: 105, score: 20, shape: 'ring'    },
  titan:     { name: 'TITAN',   trait: 'MOTHER',   cost: 5, intro: 12, hp: 18, r: 28, speed: 24,  score: 90, shape: 'titan'   },
  pulseling: { name: 'BLIP',    trait: 'SHARD',    cost: 1, intro: 6,  hp: 1,  r: 6,  speed: 150, score: 5,  shape: 'dot'     },
  kage:      { name: 'KAGE',    trait: 'STALKER',  cost: 3, intro: 11, hp: 3,  r: 12, speed: 118, score: 40, shape: 'kage'    },
  lotus:     { name: 'LOTUS',   trait: 'ROOTED',   cost: 3, intro: 13, hp: 5,  r: 13, speed: 58,  score: 35, shape: 'lotus'   },
  warden:    { name: 'WARDEN',  trait: 'HERALD',   cost: 3, intro: 15, hp: 3,  r: 12, speed: 70,  score: 45, shape: 'warden'  },
  stilt:     { name: 'STILT',   trait: 'SNIPER',   cost: 3, intro: 12, hp: 2,  r: 11, speed: 62,  score: 45, shape: 'stilt'   },
  oni:       { name: 'ONI',     trait: 'CHARGER',  cost: 4, intro: 21, hp: 10, r: 18, speed: 44,  score: 60, shape: 'oni'     },
  crane:     { name: 'CRANE',   trait: 'SWOOPER',  cost: 2, intro: 22, hp: 2,  r: 11, speed: 205, score: 25, shape: 'crane'   },
  gate:      { name: 'GATE',    trait: 'SHIELDED', cost: 4, intro: 23, hp: 8,  r: 15, speed: 38,  score: 55, shape: 'gate'    },
  koi:       { name: 'KOI',     trait: 'SINEW',    cost: 2, intro: 31, hp: 2,  r: 10, speed: 195, score: 30, shape: 'koi'     },
  golem:     { name: 'GOLEM',   trait: 'COLOSSUS', cost: 5, intro: 33, hp: 26, r: 24, speed: 30,  score: 110, shape: 'golem'   },

  /* ---- the five Guardians, one per sheet ---- */
  b_wheel:   { name: 'THE STAIN',       trait: 'GUARDIAN I',   cost: 0, intro: 10, hp: 240,  r: 34, speed: 46, score: 500, shape: 'boss', boss: 1 },
  b_mother:  { name: 'THE NIGHT MOTHER',trait: 'GUARDIAN II',  cost: 0, intro: 20, hp: 400,  r: 30, speed: 52, score: 800, shape: 'boss', boss: 1 },
  b_warlord: { name: 'THE CINNABAR ONI',trait: 'GUARDIAN III', cost: 0, intro: 30, hp: 620,  r: 33, speed: 50, score: 1200, shape: 'boss', boss: 1 },
  b_tempest: { name: 'THE STORM EYE',   trait: 'GUARDIAN IV',  cost: 0, intro: 40, hp: 780,  r: 30, speed: 58, score: 1700, shape: 'boss', boss: 1 },
  b_origin:  { name: 'THE FIRST BRUSH', trait: 'GUARDIAN V',   cost: 0, intro: 50, hp: 900,  r: 36, speed: 44, score: 2400, shape: 'boss', boss: 1 },
};

/* default weights used by the spawn roll (per roster enemy) */
const ENEMY_WEIGHTS = {
  pulse: 5, dart: 3, spit: 2.2, moth: 2.4, split: 2.1, slab: 1.5,
  shade: 1.7, wraith: 1.9, titan: 0.8, kage: 1.6, stilt: 1.4, oni: 1.2, crane: 1.8,
  popper: 2.0, lotus: 1.5, warden: 1.3, gate: 1.2, koi: 1.9, golem: 0.9,
};

/* ------------------------------------------------------------
   THE FIVE SCROLLS — each area is a different sheet of paper,
   with its own weather, beasts and Guardian.
   Ten waves a sheet; the tenth bears the Guardian.
   ------------------------------------------------------------ */
const AREAS = [
  {
    id: 'I', name: 'FIRST WASH', kanji: '一', theme: 'pale',
    desc: 'Fresh washi. The first strokes land soft.',
    mult: { hp: 1, sp: 1, budget: 1 },
    roster: ['pulse', 'dart', 'spit', 'popper', 'moth', 'split', 'wraith', 'slab'],
    elite: 'slab', boss: 'b_wheel',
  },
  {
    id: 'II', name: 'NIGHT SCROLL', kanji: '夜', theme: 'dark',
    desc: 'The ink deepens. Things move inside it.',
    mult: { hp: 1.55, sp: 1.05, budget: 1.35 },
    roster: ['wraith', 'shade', 'moth', 'kage', 'stilt', 'lotus', 'warden', 'dart'],
    elite: 'shade', boss: 'b_mother',
  },
  {
    id: 'III', name: 'CINNABAR FIELD', kanji: '紅', theme: 'red',
    desc: 'A vermillion wash dries underfoot. The last stroke is heaviest.',
    mult: { hp: 2.35, sp: 1.1, budget: 1.75 },
    roster: ['slab', 'spit', 'oni', 'crane', 'split', 'titan', 'kage', 'gate'],
    elite: 'oni', boss: 'b_warlord',
  },
  {
    id: 'IV', name: 'STORM SHEET', kanji: '嵐', theme: 'storm',
    desc: 'Rain hammers the paper. The ink runs like rivers.',
    mult: { hp: 3.4, sp: 1.15, budget: 2.15 },
    roster: ['crane', 'dart', 'kage', 'stilt', 'wraith', 'koi', 'warden', 'moth', 'popper'],
    elite: 'stilt', boss: 'b_tempest',
  },
  {
    id: 'V', name: 'GILT SCROLL', kanji: '金', theme: 'gilt',
    desc: 'Old gold leaf underfoot. The last sheet is the heaviest.',
    mult: { hp: 4.8, sp: 1.2, budget: 2.6 },
    roster: ['oni', 'slab', 'golem', 'gate', 'spit', 'warden', 'titan', 'kage', 'koi'],
    elite: 'oni', boss: 'b_origin',
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
  { id: 'orbit',  name: 'Ink Orbit',    desc: 'A droplet circles the brush, grinding what it touches.',     max: 3, apply: s => { s.orb += 1; } },
  { id: 'nova',   name: 'Black Tide',   desc: 'Every few breaths the ink surges outward, shoving all back.', max: 3, apply: s => { s.nova += 1; } },
  { id: 'slow',   name: 'Wet Paper',    desc: 'Struck beasts wade through soaked paper — slowed briefly.',  max: 2, apply: s => { s.slow += 1; } },
  { id: 'crit',   name: 'Crimson Tip',  desc: 'One stroke in six bites twice as deep. Deeper per rank.',    max: 2, apply: s => { s.crit += 1; } },
  { id: 'ward',   name: 'Paper Ward',   desc: 'A dry talisman swallows one hit whole, then reforms.',       max: 1, apply: s => { s.ward = true; } },
  { id: 'magnet', name: 'Ink Hunger',   desc: 'The paper pulls harder — +42% gathering radius per rank.',   max: 3, apply: s => { s.magnet += 1; } },
  { id: 'mends',  name: 'Paper Mends',  desc: 'The sheet heals itself: +1 integrity every so often.',       max: 2, apply: s => { s.mends += 1; s.mendsT = CFG.mends.period(s.mends); } },
  { id: 'well',   name: 'Deep Well',    desc: 'Every mote of ink is worth +25% more to the brush.',         max: 2, apply: s => { s.well += 1; } },
  /* ---- weapons ---- */
  { id: 'fan',    name: 'Folded Fan',   desc: 'Every few breaths the fan snaps open — a spray of paper blades.', max: 4, weapon: true, apply: s => { s.fan += 1; } },
  { id: 'trail',  name: 'Ink Trail',    desc: 'Wherever you walk, the ink you leave still bites. Smears linger.', max: 3, weapon: true, apply: s => { s.trailW += 1; } },
  { id: 'spirit', name: 'Spirit Scribes',desc: 'Lesser brushes wake and hunt on their own, seeking the nearest blot.', max: 3, weapon: true, apply: s => { s.spirit += 1; } },
  { id: 'hanko',  name: 'Crimson Hanko',desc: 'A great red seal slams down on the nearest horde and crushes it.', max: 3, weapon: true, apply: s => { s.hanko += 1; } },
  { id: 'arc',    name: 'Sumi Arc',     desc: 'A live stroke leaps from beast to beast, chaining like spilled lightning.', max: 4, weapon: true, apply: s => { s.arc += 1; } },
  { id: 'boomer', name: 'Returning Stroke', desc: 'A wide brushstroke flies out, then recalls itself — biting twice.', max: 4, weapon: true, apply: s => { s.boomer += 1; } },
  { id: 'vortex', name: 'Ink Vortex',   desc: 'A whirlpool of living ink opens, dragging beasts in and drowning them.', max: 3, weapon: true, apply: s => { s.vortex += 1; } },
];
