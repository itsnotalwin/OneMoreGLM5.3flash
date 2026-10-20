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

  /* ---- THE 10-WAVE SYSTEM, THE 10-LEVEL SYSTEM ----
     A sheet (paper) holds ten levels; a level holds ten waves.
     A scroll opens only when the scroll before it lies finished:
     ten levels, ten waves each, its Guardian felled. The pressure
     climbs twice — wave by wave inside a level, and level by level
     inside the sheet, so the tenth level of a sheet always bites
     far harder than its first.
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
    budget: (w, depth) => 4.2 + w * 2.7 + depth * 0.8,   // depth = level + 10*(sheet-1), 0-based
    levelBudget: lv => 1 + 0.06 * (lv - 1),        // the climb INSIDE a sheet: L10 spends ~1.54× L1
    levelHp:     lv => 1 + 0.045 * (lv - 1),       // and its beasts stand ~1.4× taller
    surgeWaves: [5, 9],                            // the surge waves of a level
    surgeMult: 1.5,                                // + a little per depth (game.js)
    groupInterval: w => Math.max(0.26, 1.3 - w * 0.06),
    groupSize: (w, depth) => 3 + Math.floor(w / 3) + Math.floor(depth / 3),
    concurrentCap: (w, depth) => Math.min(120, 12 + w * 1.7 + depth * 2.9),
    hpScale: (base, w, intro) => Math.max(1, Math.round(base * (1 + 0.035 * (w - intro)))),
    spScale: (w, intro) => Math.min(1.35, 1 + 0.005 * (w - intro)),
    eliteHpMult: 5.5,
    eliteR: 1.62,
    sealBudget: 1.25,                              // honor-guard fodder on seal waves
    elitesAt: depth => 1 + Math.min(3, Math.floor(depth / 13)),   // seals grow heavier
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
  hanko:  { period: lv => 7.2 - 0.9 * (lv - 1), radius: lv => 96 + lv * 16, dmg: lv => 4 + lv * 2, stun: 0.45 },
  arc:    { period: lv => 2.5 - 0.22 * (lv - 1), jumps: lv => 2 + lv, range: 210, dmg: lv => 1 + Math.ceil(lv / 2) },
  boomer: { period: lv => 2.9 - 0.25 * (lv - 1), speed: 620, dist: lv => 300 + lv * 40, dmg: lv => 1 + lv, life: 3 },
  vortex: { period: lv => 7.5 - 0.7 * (lv - 1), radius: lv => 90 + lv * 24, dur: lv => 2 + 0.25 * lv, pull: 340, tick: 0.36, dmg: 1 },

  /* enemy ink globs and needles */
  glob:   { speed: 215, life: 2.4, r: 5 },
  needle: { speed: 470, life: 1.7, r: 3 },

  // total waves cleared → rank, else 'D' (the journey is five hundred waves)
  ranks: [[420, 'S+'], [340, 'S'], [250, 'A'], [160, 'B'], [60, 'C']],

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

  /* ---- SHEET III · CINNABAR FIELD — vermillion-stained ink ---- */
  oni:       { name: 'ONI',        trait: 'CHARGER',  cost: 4, intro: 201, hp: 10, r: 18, speed: 44,  score: 60, shape: 'oni'     },
  ember:     { name: 'EMBER',      trait: 'DASHER',   cost: 2, intro: 206, hp: 2,  r: 9,  speed: 96,  score: 30, shape: 'ember'   },
  crane:     { name: 'CRANE',      trait: 'SWOOPER',  cost: 2, intro: 211, hp: 2,  r: 11, speed: 205, score: 25, shape: 'crane'   },
  sealbearer:{ name: 'SEALBEARER', trait: 'SEALED',   cost: 4, intro: 216, hp: 9,  r: 15, speed: 40,  score: 65, shape: 'sealbearer' },
  gate:      { name: 'GATE',       trait: 'SHIELDED', cost: 4, intro: 221, hp: 8,  r: 15, speed: 38,  score: 55, shape: 'gate'    },

  /* ---- SHEET IV · STORM SHEET — rain-grey ink ---- */
  raindrake: { name: 'RAINDRAKE',  trait: 'CALLER',   cost: 3, intro: 301, hp: 3,  r: 12, speed: 88,  score: 48, shape: 'raindrake' },
  gale:      { name: 'GALE',       trait: 'GUST',     cost: 2, intro: 306, hp: 1,  r: 10, speed: 120, score: 32, shape: 'gale'    },
  koi:       { name: 'KOI',        trait: 'SINEW',    cost: 2, intro: 311, hp: 2,  r: 10, speed: 195, score: 30, shape: 'koi'     },

  /* ---- SHEET V · GILT SCROLL — gold-dusted ink ---- */
  gildling:  { name: 'GILDLING',   trait: 'GILDED',   cost: 3, intro: 401, hp: 6,  r: 13, speed: 52,  score: 50, shape: 'gildling' },
  phoenix:   { name: 'PHOENIX',    trait: 'DIVING',   cost: 3, intro: 406, hp: 3,  r: 12, speed: 235, score: 55, shape: 'phoenix' },
  golem:     { name: 'GOLEM',      trait: 'COLOSSUS', cost: 5, intro: 411, hp: 26, r: 24, speed: 30,  score: 110, shape: 'golem'   },

  /* shards shed by dividers and mothers */
  pulseling: { name: 'BLIP',       trait: 'SHARD',    cost: 1, intro: 1,   hp: 1,  r: 6,  speed: 150, score: 5,  shape: 'dot'     },

  /* ---- the five Guardians, one per sheet, on its tenth level ---- */
  b_wheel:   { name: 'THE STAIN',       trait: 'GUARDIAN I',   cost: 0, intro: 100, hp: 240,  r: 34, speed: 46, score: 500, shape: 'boss', boss: 1 },
  b_mother:  { name: 'THE NIGHT MOTHER',trait: 'GUARDIAN II',  cost: 0, intro: 200, hp: 400,  r: 30, speed: 52, score: 800, shape: 'boss', boss: 1 },
  b_warlord: { name: 'THE CINNABAR ONI',trait: 'GUARDIAN III', cost: 0, intro: 300, hp: 620,  r: 33, speed: 50, score: 1200, shape: 'boss', boss: 1 },
  b_tempest: { name: 'THE STORM EYE',   trait: 'GUARDIAN IV',  cost: 0, intro: 400, hp: 780,  r: 30, speed: 58, score: 1700, shape: 'boss', boss: 1 },
  b_origin:  { name: 'THE FIRST BRUSH', trait: 'GUARDIAN V',   cost: 0, intro: 500, hp: 900,  r: 36, speed: 44, score: 2400, shape: 'boss', boss: 1 },
};

/* default weights used by the spawn roll (per roster enemy) */
const ENEMY_WEIGHTS = {
  pulse: 5, dart: 3, spit: 2.2, moth: 2.4, split: 2.1, slab: 1.5,
  shade: 1.7, wraith: 1.9, titan: 0.8, kage: 1.6, stilt: 1.4, oni: 1.2, crane: 1.8,
  popper: 2.0, lotus: 1.5, warden: 1.3, gate: 1.2, koi: 1.9, golem: 0.9,
  /* the paper's own specials */
  washling: 2.2, palecrane: 1.6, nightshade: 1.6, gloom: 1.2, ember: 1.8,
  sealbearer: 1.1, raindrake: 1.4, gale: 1.9, gildling: 1.1, phoenix: 1.4,
};

/* ------------------------------------------------------------
   THE FIVE SCROLLS — each sheet is a different paper washed in
   its own ink: 淡 pale wash, 濃 lamp-black, 朱 vermillion,
   雨 rain-grey, 金 gold-dust. Ten levels a sheet; the tenth
   level bears the Guardian. Each level debuts a beast of its
   own (order) and paints the next scene of the page (names).
   ------------------------------------------------------------ */
const AREAS = [
  {
    id: 'I', name: 'FIRST WASH', kanji: '一', theme: 'pale',
    ink: '淡墨',                                     // pale warm wash
    desc: 'Fresh washi. The first strokes land soft.',
    mult: { hp: 1, sp: 1, budget: 1 },
    roster: ['pulse', 'dart', 'popper', 'washling', 'moth', 'split', 'palecrane', 'slab', 'wraith'],
    order: ['pulse', 'dart', 'popper', 'washling', 'moth', 'split', 'palecrane', 'slab', 'wraith'],
    names: ['初描', '新樹', '遠山', '淡游', '霧起', '垂露', '鶴舞', '古松', '暮色', '落款'],
    elite: 'slab', boss: 'b_wheel',
  },
  {
    id: 'II', name: 'NIGHT SCROLL', kanji: '夜', theme: 'dark',
    ink: '濃墨',                                     // lamp-black, heavy
    desc: 'The ink deepens. Things move inside it.',
    mult: { hp: 1.55, sp: 1.05, budget: 1.35 },
    roster: ['spit', 'shade', 'kage', 'nightshade', 'stilt', 'lotus', 'gloom', 'warden', 'titan'],
    order: ['spit', 'shade', 'kage', 'nightshade', 'stilt', 'lotus', 'gloom', 'warden', 'titan'],
    names: ['入夜', '遠浦', '梟鳴', '夜影', '高軒', '蓮池', '墨霧', '旌旗', '母胎', '落款'],
    elite: 'shade', boss: 'b_mother',
  },
  {
    id: 'III', name: 'CINNABAR FIELD', kanji: '紅', theme: 'red',
    ink: '朱墨',                                     // vermillion-stained
    desc: 'A vermillion wash dries underfoot. The last stroke is heaviest.',
    mult: { hp: 2.35, sp: 1.1, budget: 1.75 },
    roster: ['oni', 'ember', 'crane', 'sealbearer', 'gate', 'spit', 'kage', 'titan', 'slab'],
    order: ['oni', 'ember', 'crane', 'sealbearer', 'gate', 'spit', 'kage', 'titan', 'slab'],
    names: ['朱土', '飛火', '鶴影', '印卒', '鳥居', '遠崖', '影踏', '古巣', '絕壁', '落款'],
    elite: 'oni', boss: 'b_warlord',
  },
  {
    id: 'IV', name: 'STORM SHEET', kanji: '嵐', theme: 'storm',
    ink: '雨墨',                                     // rain-grey
    desc: 'Rain hammers the paper. The ink runs like rivers.',
    mult: { hp: 3.4, sp: 1.15, budget: 2.25 },
    roster: ['raindrake', 'gale', 'koi', 'crane', 'dart', 'wraith', 'warden', 'popper', 'moth'],
    order: ['raindrake', 'gale', 'koi', 'crane', 'dart', 'wraith', 'warden', 'popper', 'moth'],
    names: ['雲垂', '陣風', '鯉躍', '雨晴', '疾矢', '霧海', '旌搖', '雨簾', '怒濤', '落款'],
    elite: 'stilt', boss: 'b_tempest',
  },
  {
    id: 'V', name: 'GILT SCROLL', kanji: '金', theme: 'gilt',
    ink: '金墨',                                     // gold-dusted
    desc: 'Old gold leaf underfoot. The last sheet is the heaviest.',
    mult: { hp: 5.0, sp: 1.2, budget: 2.75 },
    roster: ['gildling', 'phoenix', 'golem', 'oni', 'gate', 'titan', 'kage', 'warden', 'spit'],
    order: ['gildling', 'phoenix', 'golem', 'oni', 'gate', 'titan', 'kage', 'warden', 'spit'],
    names: ['金泥', '鳳來', '石像', '鬼門', '樓閣', '母金', '影金', '旌耀', '雨期', '落款'],
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
