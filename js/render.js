'use strict';
/* ============================================================
   ONE MORE — sumi-e ink renderer
   The world is an endless sheet of washi that scrolls beneath
   the brush: tiling paper, ambient brush marks, a persistent
   layer of dried ink stains (sprite-cached), and three paper
   themes — pale washi, the night scroll, the cinnabar field.
   ============================================================ */

const R = (() => {
  const RED = '#b23a2b';
  const TAU = Math.PI * 2;

  /* ---------------- paper themes ----------------
     Each sheet is washed in its own ink: 淡 pale warm wash,
     濃 lamp-black, 朱 vermillion-stained, 雨 rain-grey,
     金 gold-dust. `tint` bends the whole world's ink toward
     that paper's colour — beasts, strokes and inscriptions
     are all ground in the same ink as the sheet they haunt. */
  const THEMES = {
    pale:  { paper: '#ede7d9', ink: '#1a1714', tint: '#322616', vig: '58,52,40',  wash: '112,102,80',  washA: 0.021, fiber: [70,62,48],  speck: '50,45,36',    weather: 'motes'  },
    dark:  { paper: '#17130f', ink: '#e9e2d2', tint: '#f6efdc', vig: '0,0,0',     wash: '237,231,217', washA: 0.017, fiber: [200,194,178], speck: '220,214,198', weather: 'embers' },
    red:   { paper: '#eadbc4', ink: '#1a1714', tint: '#4a211a', vig: '122,42,26', wash: '178,58,43',   washA: 0.031, fiber: [70,62,48],  speck: '50,45,36',    weather: 'petals' },
    storm: { paper: '#c7cdc9', ink: '#161c1f', tint: '#1e3240', vig: '26,38,44',  wash: '58,74,84',    washA: 0.03,  fiber: [56,66,70],  speck: '40,52,58',    weather: 'rain'   },
    gilt:  { paper: '#e7d6ad', ink: '#241c12', tint: '#4a360e', vig: '96,70,20',  wash: '166,124,44',  washA: 0.035, fiber: [96,78,44],  speck: '120,92,40',   weather: 'gold'   },
  };
  let INK = THEMES.pale.ink;
  let PAPER = THEMES.pale.paper;
  let themeKey = 'pale';

  /* grind two ink colours together — the sheet's ink is a blend */
  function mixHex(a, b, k) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round((pa >> 16 & 255) + (((pb >> 16 & 255) - (pa >> 16 & 255)) * k));
    const g = Math.round((pa >> 8 & 255) + (((pb >> 8 & 255) - (pa >> 8 & 255)) * k));
    const bl = Math.round((pa & 255) + (((pb & 255) - (pa & 255)) * k));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  /* ---------------- tiny deterministic rng ---------------- */
  function mulberry(s) {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash2(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /* ---------------- layers ---------------- */
  const TILE = 480;
  let tiles = {};            // theme -> canvas (built lazily)
  let tileDpr = 0;
  let patHatchDark = null;   // dark-ink hatch (pale & red sheets)
  let patHatchPale = null;   // pale-ink hatch (night sheet)
  let patHatch = null;       // active hatch, follows theme
  let lw = 0, lh = 0, ldpr = 1;
  let lastT = 0, lastTrailT = -1;
  /* cached screen-space gradients: key -> gradient object */
  const vg = { key: '', grad: null, rbKey: '', rGrad: null };

  /* dried ink lives in world space, each stain its own sprite */
  let stains = [];

  function ensurePatterns(ctx) {
    if (patHatchDark) return;
    const mk = rgba => {
      const hc = document.createElement('canvas');
      hc.width = hc.height = 10;
      const h = hc.getContext('2d');
      h.strokeStyle = rgba;
      h.lineWidth = 1.4; h.lineCap = 'round';
      h.beginPath();
      h.moveTo(-2, 9.5); h.lineTo(9.5, -2);
      h.moveTo(3, 13); h.lineTo(13, 3);
      h.stroke();
      return ctx.createPattern(hc, 'repeat');
    };
    patHatchDark = mk('rgba(26,23,20,0.6)');
    patHatchPale = mk('rgba(233,226,210,0.5)');
    patHatch = patHatchDark;
  }

  function setTheme(key) {
    if (key === themeKey) return;
    themeKey = key;
    const th = THEMES[key];
    /* the whole sheet is painted in its own ink — the beasts, the
       strokes and the inscriptions all grind in the same colour */
    INK = mixHex(th.ink, th.tint, 0.42);
    PAPER = th.paper;
    patHatch = key === 'dark' ? patHatchPale : patHatchDark;
    /* the DOM chrome (HUD, banners, screens) follows the sheet's ink,
       so the night scroll never traps dark text on dark paper */
    try {
      const b = document.body;
      if (b.dataset.theme !== key) b.dataset.theme = key;
    } catch (e) {}
  }

  function activeThemeKey() {
    const S = G.S;
    if (S.mode === 'playing' || S.mode === 'paused' || S.mode === 'upgrade' || S.mode === 'dying' || S.mode === 'cutscene') {
      /* a scroll film keeps the OLD sheet's ink beneath its rolling edge */
      if (S.mode === 'cutscene' && typeof CUT !== 'undefined' && CUT.isLive() &&
          CUT.kindName() === 'scroll' && !CUT.covered()) {
        const prev = AREAS[(S.areaIdx + AREAS.length - 1) % AREAS.length];
        return prev.theme;
      }
      const area = AREAS[S.areaIdx % AREAS.length];
      return area.theme;
    }
    return themeKey; /* title & over keep whatever sheet they lie on */
  }

  /* ---------------- tiled washi paper ---------------- */
  function buildTile(key, dpr) {
    const th = THEMES[key];
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(TILE * dpr);
    const p = c.getContext('2d');
    p.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = mulberry(20260101 + key.charCodeAt(0) * 77);

    p.fillStyle = th.paper;
    p.fillRect(0, 0, TILE, TILE);

    /* laid lines — grain that tiles cleanly (8 divides 480) */
    p.lineWidth = 1;
    p.strokeStyle = key === 'dark' ? 'rgba(237,231,217,0.03)' : `rgba(${th.speck},0.035)`;
    for (let y = 4; y < TILE; y += 8) {
      p.beginPath(); p.moveTo(0, y + (rnd() - 0.5)); p.lineTo(TILE, y + (rnd() - 0.5)); p.stroke();
    }
    /* fibers */
    const fibers = Math.round((TILE * TILE) / 850);
    for (let i = 0; i < fibers; i++) {
      const x = rnd() * TILE, y = rnd() * TILE;
      const a = (rnd() - 0.5) * 0.9 + (rnd() < 0.5 ? 0 : Math.PI / 2);
      const l = 1.5 + rnd() * 3.5;
      const base = th.fiber;
      p.strokeStyle = `rgba(${base[0]},${base[1]},${base[2]},${0.03 + rnd() * 0.045})`;
      p.lineWidth = 0.7;
      p.beginPath();
      p.moveTo(x, y);
      p.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      p.stroke();
    }
    /* speckles */
    const dots = Math.round((TILE * TILE) / 2400);
    for (let i = 0; i < dots; i++) {
      p.fillStyle = `rgba(${th.speck},${0.02 + rnd() * 0.05})`;
      p.beginPath();
      p.arc(rnd() * TILE, rnd() * TILE, 0.3 + rnd() * 0.8, 0, TAU);
      p.fill();
    }
    /* broad faint washes, kept off the tile rim so seams stay invisible */
    for (let i = 0; i < 5; i++) {
      const r = TILE * (0.1 + rnd() * 0.2);
      const x = r + rnd() * (TILE - r * 2), y = r + rnd() * (TILE - r * 2);
      const g = p.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${th.wash},${th.washA + rnd() * 0.014})`);
      g.addColorStop(1, `rgba(${th.wash},0)`);
      p.fillStyle = g;
      p.fillRect(x - r, y - r, r * 2, r * 2);
    }
    /* a couple of dried drips for the red field */
    if (key === 'red') {
      for (let i = 0; i < 2; i++) {
        const x = 40 + rnd() * (TILE - 80), y = 40 + rnd() * (TILE - 80);
        const len = 26 + rnd() * 60;
        inkStroke(p, [
          { x, y },
          { x: x + (rnd() - 0.5) * 6, y: y + len * 0.6 },
          { x: x + (rnd() - 0.5) * 4, y: y + len },
        ], 2.6, { alpha: 0.1, color: RED });
        blobPath(p, x + (rnd() - 0.5) * 4, y + len, 3.4, (rnd() * 1e9) | 0, 0.3, 8);
        p.fillStyle = RED; p.globalAlpha = 0.14; p.fill(); p.globalAlpha = 1;
      }
    }
    /* gold leaf flecks pressed into the gilt scroll */
    if (key === 'gilt') {
      for (let i = 0; i < 7; i++) {
        const x = 20 + rnd() * (TILE - 40), y = 20 + rnd() * (TILE - 40);
        p.save();
        p.translate(x, y);
        p.rotate(rnd() * TAU);
        p.globalAlpha = 0.05 + rnd() * 0.09;
        p.fillStyle = '#a67c2c';
        const s = 1.4 + rnd() * 3.2;
        p.beginPath();
        p.moveTo(0, -s); p.lineTo(s * 0.7, 0); p.lineTo(0, s); p.lineTo(-s * 0.7, 0);
        p.closePath(); p.fill();
        p.restore();
      }
      for (let i = 0; i < 2; i++) {
        const x = 40 + rnd() * (TILE - 80), y = 40 + rnd() * (TILE - 80);
        const len = 20 + rnd() * 44;
        inkStroke(p, [
          { x, y },
          { x: x + (rnd() - 0.5) * 5, y: y + len * 0.6 },
          { x: x + (rnd() - 0.5) * 3, y: y + len },
        ], 2.2, { alpha: 0.08 });
      }
    }
    /* rain-beaten streaks run across the storm sheet */
    if (key === 'storm') {
      p.strokeStyle = 'rgba(40,54,60,0.05)';
      p.lineWidth = 1.1;
      for (let i = 0; i < 9; i++) {
        const x = rnd() * TILE, y = rnd() * TILE;
        const l = 16 + rnd() * 34;
        p.beginPath();
        p.moveTo(x, y);
        p.lineTo(x - l * 0.32, y + l);
        p.stroke();
      }
    }
    return c;
  }

  function ensureTiles(ctx, dpr) {
    ensurePatterns(ctx);
    if (tileDpr === dpr && tiles.pale && tiles.storm && tiles.gilt) return;
    tileDpr = dpr;
    tiles = {
      pale: buildTile('pale', dpr),
      dark: buildTile('dark', dpr),
      red: buildTile('red', dpr),
      storm: buildTile('storm', dpr),
      gilt: buildTile('gilt', dpr),
    };
  }

  /* ---------------- brush primitives ---------------- */
  function blobPath(c, x, y, r, seed, wob = 0.16, n = 11) {
    const rnd = mulberry(seed);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + (rnd() * 2 - 1) * wob);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    c.beginPath();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[n - 1], pts[0]);
    c.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) {
      const q = pts[(i + 1) % n];
      m = mid(pts[i], q);
      c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    c.closePath();
  }

  /* tapered calligraphic stroke through pts (max width at belly) */
  function inkStroke(c, pts, maxW, o = {}) {
    if (pts.length < 2) return;
    const n = pts.length;
    const rnd = mulberry(o.seed ?? 7);
    const taper = o.taper ?? 0.75;
    const jit = o.jit ?? 0.18;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(n - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
      let dx = q.x - r0.x, dy = q.y - r0.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const t = i / (n - 1);
      const prof = Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.max(0.001, t))), taper);
      const w = Math.max(0.35, maxW * prof * (1 - jit + rnd() * jit * 2));
      left.push({ x: pts[i].x - dy * w / 2, y: pts[i].y + dx * w / 2 });
      right.push({ x: pts[i].x + dy * w / 2, y: pts[i].y - dx * w / 2 });
    }
    c.save();
    c.beginPath();
    c.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) c.lineTo(left[i].x, left[i].y);
    for (let i = n - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
    c.closePath();
    c.globalAlpha = o.alpha ?? 1;
    c.fillStyle = o.color ?? INK;
    c.fill();
    if (o.dry && maxW > 5) {
      c.clip();
      c.strokeStyle = o.dryColor ?? PAPER;
      c.globalAlpha = (o.alpha ?? 1) * 0.4;
      c.lineWidth = 1.1; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const off = (rnd() - 0.5) * maxW * 0.7;
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const q = pts[Math.min(n - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
          let dx = q.x - r0.x, dy = q.y - r0.y;
          const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const x = pts[i].x - dy * off, y = pts[i].y + dx * off;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
  }

  /* teardrop pointing +x, path only (r = body radius) */
  function teardrop(c, r) {
    c.beginPath();
    c.moveTo(r * 1.75, 0);
    c.quadraticCurveTo(r * 0.35, r * 0.95, -r * 0.15, r * 0.62);
    c.arc(-r * 0.15, 0, r * 0.62, Math.PI * 0.5, Math.PI * 1.5);
    c.quadraticCurveTo(r * 0.35, -r * 0.95, r * 1.75, 0);
    c.closePath();
  }

  function splatPaint(c, x, y, r, seed, alpha = 0.5, color = INK) {
    const rnd = mulberry(seed);
    c.save();
    c.fillStyle = color;
    c.globalAlpha = alpha;
    blobPath(c, x, y, r * 0.6, seed, 0.42, 10);
    c.fill();
    const k = 4 + Math.floor(rnd() * 5);
    for (let i = 0; i < k; i++) {
      const a = rnd() * TAU;
      const d = r * (0.85 + rnd() * 1.5);
      c.save();
      c.translate(x + Math.cos(a) * d, y + Math.sin(a) * d);
      c.rotate(a);
      teardrop(c, r * (0.1 + rnd() * 0.2));
      c.fill();
      c.restore();
    }
    const sk = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < sk; i++) {
      const a = rnd() * TAU;
      const len = r * (0.8 + rnd() * 1.2);
      inkStroke(c, [
        { x: x + Math.cos(a) * r * 0.35, y: y + Math.sin(a) * r * 0.35 },
        { x: x + Math.cos(a) * (r * 0.35 + len), y: y + Math.sin(a) * (r * 0.35 + len) },
      ], Math.max(1.2, r * 0.14), { alpha: alpha * 0.55, color });
    }
    c.restore();
  }

  /* angry paper eyes on an ink body */
  function eyeSlits(c, ang, r, len = 1) {
    c.save();
    c.strokeStyle = PAPER;
    c.lineCap = 'round';
    c.lineWidth = Math.max(1.7, r * 0.14);
    for (const s of [-1, 1]) {
      const a = ang + s * 0.55;
      const ex = Math.cos(a) * r * 0.42, ey = Math.sin(a) * r * 0.42;
      const tilt = a + s * 0.4;
      const l = r * 0.5 * len;
      c.beginPath();
      c.moveTo(ex - Math.cos(tilt) * l / 2, ey - Math.sin(tilt) * l / 2);
      c.lineTo(ex + Math.cos(tilt) * l / 2, ey + Math.sin(tilt) * l / 2);
      c.stroke();
    }
    c.restore();
  }

  /* ---------------- stains: dried ink, cached as sprites ---------------- */
  function stampStains(S) {
    if (!S.stainQueue.length) return;
    for (const q of S.stainQueue) {
      const r = Math.max(2.4, q.r);
      const scale = 2; /* render sprites at 2x for crisp hidpi */
      const half = Math.ceil(r * 3.3);   /* headroom: no splat ever clips square */
      const spr = document.createElement('canvas');
      spr.width = spr.height = half * 2 * scale;
      const g = spr.getContext('2d');
      g.setTransform(scale, 0, 0, scale, half * scale, half * scale);
      splatPaint(g, 0, 0, r, (Math.random() * 1e9) | 0, q.alpha ?? 0.5, q.red ? RED : INK);
      stains.push({ x: q.x, y: q.y, a: q.alpha ?? 0.5, age: 0, spr, half });
    }
    S.stainQueue.length = 0;
    while (stains.length > CFG.world.stainCap) stains.shift();
  }

  function updateStains(dt) {
    const fade = CFG.world.stainFade;
    for (let i = stains.length - 1; i >= 0; i--) {
      const st = stains[i];
      st.age += dt;
      if (st.a * (1 - st.age * fade) <= 0.02) {
        stains[i] = stains[stains.length - 1];
        stains.pop();
      }
    }
  }

  function resetStains() { stains.length = 0; }

  /* ---------------- ambient paper marks (world decor) ----------------
     faint hairs, flecks and ghost seals scattered across the sheet,
     so the endless paper still feels like a hand-made object */
  const KANJI_DECO = ['風', '月', '花', '山', '川', '紙', '雲'];
  function drawDecor(c, x0, y0, x1, y1) {
    const cell = CFG.world.decoCell;
    const cx0 = Math.floor(x0 / cell), cx1 = Math.floor(x1 / cell);
    const cy0 = Math.floor(y0 / cell), cy1 = Math.floor(y1 / cell);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const r0 = hash2(cx, cy);
        if (r0 < 0.42) continue;
        const rx = hash2(cx * 3 + 1, cy * 7 + 2);
        const ry = hash2(cx * 5 + 9, cy * 11 + 4);
        const x = cx * cell + rx * cell;
        const y = cy * cell + ry * cell;
        const v = Math.floor(r0 * 997) % 6;
        if (v === 0) { /* a stray hair from the brush */
          const a = hash2(cx + 13, cy + 17) * TAU;
          const l = 14 + rx * 22;
          inkStroke(c, [
            { x, y },
            { x: x + Math.cos(a) * l * 0.6, y: y + Math.sin(a) * l * 0.4 + 3 },
            { x: x + Math.cos(a) * l, y: y + Math.sin(a) * l },
          ], 1.5, { alpha: 0.09, jit: 0.3, seed: (cx * 31 + cy) | 0 });
        } else if (v === 1) { /* flecks */
          c.fillStyle = INK;
          c.globalAlpha = 0.1;
          for (let k = 0; k < 3; k++) {
            c.beginPath();
            c.arc(x + (hash2(cx + k, cy) - 0.5) * 26, y + (hash2(cx, cy + k) - 0.5) * 26, 0.7 + hash2(cx + k * 3, cy + k) * 1.4, 0, TAU);
            c.fill();
          }
          c.globalAlpha = 1;
        } else if (v === 2) { /* a faint pool of old ink */
          c.globalAlpha = 0.045;
          c.fillStyle = INK;
          blobPath(c, x, y, 12 + rx * 16, (cx * 97 + cy * 31) | 0, 0.4, 9);
          c.fill();
          c.globalAlpha = 1;
        } else if (v === 3) { /* a ghost droplet */
          c.save();
          c.translate(x, y);
          c.rotate(hash2(cx * 7, cy * 3) * TAU);
          c.globalAlpha = 0.07;
          c.fillStyle = INK;
          teardrop(c, 4 + rx * 5);
          c.fill();
          c.restore();
          c.globalAlpha = 1;
        } else if (v === 4 && r0 > 0.93) { /* a vermillion ghost seal */
          c.save();
          c.translate(x, y);
          c.rotate(-0.1 + rx * 0.2);
          c.globalAlpha = 0.06;
          c.fillStyle = RED;
          c.fillRect(-7, -7, 14, 14);
          c.restore();
          c.globalAlpha = 1;
        } else if (v === 5 && r0 > 0.9) { /* a huge, faint character */
          const ch = KANJI_DECO[Math.floor(r0 * 1000) % KANJI_DECO.length];
          c.save();
          c.translate(x, y);
          c.rotate((rx - 0.5) * 0.2);
          c.globalAlpha = 0.045;
          c.fillStyle = INK;
          c.font = `${64 + Math.floor(ry * 56)}px "Zen Antique", serif`;
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(ch, 0, 0);
          c.restore();
          c.globalAlpha = 1;
        }
      }
    }
  }

  /* ---------------- creatures ---------------- */
  function seedFor(e, tick) { return ((e.seed * 8191) | 0) ^ (tick * 7919); }

  /* ============================================================
     THE PAINTING GROWS — the sheet paints itself, wave by wave
     Wave one lays a few trees. Wave two lifts a distant mountain.
     By wave ten the page carries its master washes, its poetic
     inscriptions, and the red seal that closes the painting.
     Master washes are real public-domain paintings — Fan Kuan,
     Guo Xi, Sesshū's haboku, Shubun, Kōrin's waves — luminance-
     extracted into pure ink alpha. Near scenery is brush-drawn
     once into small offscreen sprites, then stamped per world
     cell, so a fully painted sheet still costs only a handful
     of drawImages per frame.
     ============================================================ */
  const WASH_FILES = ['kuan', 'cliff', 'guo', 'guo2', 'hab1', 'hab2',
                      'shu', 'shu2', 'trees', 'shore', 'waves', 'waves2'];
  const WASH = {};
  (function loadWashes() {
    for (const k of WASH_FILES) {
      const d = new Image(); d.src = 'img/wash_' + k + '.webp';
      const p = new Image(); p.src = 'img/wash_' + k + '_p.webp';
      WASH[k] = { d, p };
    }
  })();
  function washReady(key) {
    const w = WASH[key];
    const i = themeKey === 'dark' ? w.p : w.d;
    return (i.complete && i.naturalWidth > 0) ? i : null;
  }

  /* --- near-scenery sprites, rebuilt per theme (ink is baked in) --- */
  let SPR = null, SPR_KEY = '';
  function buildSprites() {
    const B = {};
    const reg = (name, w, h, fn) => {
      const dpr = 2;
      const cv = document.createElement('canvas');
      cv.width = w * dpr; cv.height = h * dpr;
      const p = cv.getContext('2d');
      p.setTransform(dpr, 0, 0, dpr, 0, 0);
      p.translate(w / 2, h / 2);
      fn(p);
      B[name] = { cv, w, h };
    };
    const cloud = (p, x, y, r, a, seed) => {
      blobPath(p, x, y, r, seed, 0.42, 9);
      p.globalAlpha = a; p.fillStyle = INK; p.fill(); p.globalAlpha = 1;
    };
    const leafFan = (p, x, y, n, len, seed) => {
      const rnd = mulberry(seed);
      p.save(); p.translate(x, y);
      for (let i = 0; i < n; i++) {
        const ang = -0.35 - rnd() * 2.3;
        inkStroke(p, [
          { x: 0, y: 0 },
          { x: Math.cos(ang) * len * 0.5, y: Math.sin(ang) * len * 0.5 },
          { x: Math.cos(ang) * len, y: Math.sin(ang) * len },
        ], 2.4, { alpha: 0.72, taper: 1.5, jit: 0.1, seed: seed + i });
      }
      p.restore();
    };

    /* 古松 — the old twisted pine */
    reg('pineOld', 170, 200, p => {
      inkStroke(p, [{x:-8,y:92},{x:-3,y:46},{x:9,y:4},{x:3,y:-34}], 12, {alpha:0.92, taper:0.55, seed:11, dry:true});
      inkStroke(p, [{x:5,y:-8},{x:38,y:-28},{x:60,y:-26}], 4.5, {alpha:0.85, taper:0.9, seed:12});
      inkStroke(p, [{x:0,y:-24},{x:-30,y:-46},{x:-52,y:-48}], 4.2, {alpha:0.85, taper:0.9, seed:13});
      inkStroke(p, [{x:3,y:-34},{x:8,y:-58},{x:6,y:-72}], 3.4, {alpha:0.8, taper:1, seed:14});
      cloud(p, 56, -34, 14, 0.82, 21); cloud(p, 34, -44, 10, 0.6, 22);
      cloud(p, -48, -56, 13, 0.82, 23); cloud(p, -26, -62, 9, 0.56, 24);
      cloud(p, 5, -76, 12, 0.78, 25); cloud(p, -12, -58, 8, 0.48, 26);
      inkStroke(p, [{x:-14,y:90},{x:-24,y:96}], 3.4, {alpha:0.7, seed:15});
      inkStroke(p, [{x:10,y:90},{x:20,y:95}], 3.2, {alpha:0.7, seed:16});
    });

    /* 幼松 — a young pine */
    reg('pineYoung', 100, 150, p => {
      inkStroke(p, [{x:-2,y:66},{x:-1,y:28},{x:3,y:-6},{x:1,y:-30}], 5, {alpha:0.9, taper:0.6, seed:31, dry:true});
      inkStroke(p, [{x:1,y:-8},{x:16,y:-20}], 2.5, {alpha:0.8, taper:1, seed:32});
      inkStroke(p, [{x:-1,y:-18},{x:-14,y:-30}], 2.2, {alpha:0.8, taper:1, seed:33});
      cloud(p, 14, -26, 9, 0.8, 34); cloud(p, -12, -36, 8, 0.74, 35);
      cloud(p, 2, -44, 7, 0.7, 36);
      inkStroke(p, [{x:-6,y:66},{x:-11,y:71}], 2, {alpha:0.6, seed:37});
      inkStroke(p, [{x:5,y:66},{x:10,y:70}], 2, {alpha:0.6, seed:38});
    });

    /* 竹林 — bamboo, three stalks */
    reg('bamboo', 150, 185, p => {
      const stalk = (x, tilt, w, seed) => {
        const rnd = mulberry(seed);
        let y = 80;
        p.save(); p.translate(x, 0); p.rotate(tilt);
        while (y > -74) {
          const seg = 26 + rnd() * 12;
          const ny = Math.max(-80, y - seg);
          inkStroke(p, [{x:0,y}, {x:(rnd()-0.5)*2, y:(y+ny)/2}, {x:0, y:ny}], w, {alpha:0.88, taper:0.25, jit:0.05, seed});
          y = ny - 2.6;   /* the node gap */
        }
        p.restore();
      };
      stalk(-30, 0.05, 4.6, 41); stalk(4, -0.03, 3.7, 42); stalk(34, 0.07, 3.1, 43);
      leafFan(p, -30, -52, 4, 21, 44); leafFan(p, 4, -74, 5, 23, 45);
      leafFan(p, 34, -46, 4, 19, 46); leafFan(p, 16, -20, 3, 15, 47);
    });

    /* 紅葉 — the maple */
    reg('maple', 150, 155, p => {
      inkStroke(p, [{x:-4,y:62},{x:-2,y:30},{x:6,y:2},{x:2,y:-22}], 9, {alpha:0.9, taper:0.6, seed:51, dry:true});
      inkStroke(p, [{x:4,y:-8},{x:24,y:-22},{x:34,y:-24}], 3, {alpha:0.8, taper:1, seed:52});
      inkStroke(p, [{x:-2,y:-14},{x:-22,y:-28}], 3, {alpha:0.8, taper:1, seed:53});
      cloud(p, 30, -32, 13, 0.72, 54); cloud(p, -20, -38, 12, 0.68, 55);
      cloud(p, 6, -50, 11, 0.74, 56);
      for (const [cx, cy, cr, sd] of [[30,-32,13,57],[-20,-38,12,58],[6,-50,11,59]]) {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + sd;
          inkStroke(p, [
            { x: cx + Math.cos(a) * cr * 0.7, y: cy + Math.sin(a) * cr * 0.7 },
            { x: cx + Math.cos(a) * (cr + 5), y: cy + Math.sin(a) * (cr + 5) },
          ], 2, { alpha: 0.5, taper: 1.3, seed: sd * 10 + i });
        }
      }
    });

    /* 古木 — the bare tree */
    reg('deadTree', 140, 175, p => {
      inkStroke(p, [{x:-6,y:76},{x:-2,y:36},{x:8,y:-2},{x:4,y:-38},{x:8,y:-58}], 10, {alpha:0.9, taper:0.5, seed:61, dry:true});
      inkStroke(p, [{x:6,y:-14},{x:30,y:-34},{x:44,y:-38}], 3.5, {alpha:0.82, taper:1, seed:62});
      inkStroke(p, [{x:-2,y:-24},{x:-26,y:-46},{x:-40,y:-52}], 3.5, {alpha:0.82, taper:1, seed:63});
      inkStroke(p, [{x:5,y:-40},{x:18,y:-58},{x:20,y:-70}], 2.6, {alpha:0.78, taper:1, seed:64});
      inkStroke(p, [{x:-1,y:-52},{x:-12,y:-66}], 2.2, {alpha:0.75, taper:1, seed:65});
      inkStroke(p, [{x:20,y:-70},{x:26,y:-76}], 1.6, {alpha:0.7, taper:1.2, seed:66});
      inkStroke(p, [{x:-40,y:-52},{x:-46,y:-56}], 1.5, {alpha:0.7, taper:1.2, seed:67});
    });

    /* 石 — a rock cluster */
    reg('rockS', 130, 85, p => {
      blobPath(p, 0, 8, 25, 71, 0.2, 10); p.globalAlpha = 0.8; p.fillStyle = INK; p.fill(); p.globalAlpha = 1;
      inkStroke(p, [{x:-14,y:2},{x:2,y:-4},{x:14,y:2}], 1.8, {alpha:0.35, color: PAPER, seed: 72, jit: 0.1});
      blobPath(p, -34, 18, 13, 73, 0.24, 9); p.globalAlpha = 0.68; p.fillStyle = INK; p.fill(); p.globalAlpha = 1;
      blobPath(p, 28, 20, 11, 74, 0.24, 9); p.globalAlpha = 0.62; p.fillStyle = INK; p.fill(); p.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const gx = -44 + i * 28;
        inkStroke(p, [{x:gx,y:34},{x:gx+2,y:24},{x:gx,y:18}], 2, {alpha:0.55, taper:1.2, seed:75 + i});
      }
    });

    /* 燈籠 — a stone lantern */
    reg('lantern', 84, 122, p => {
      p.globalAlpha = 0.9; p.fillStyle = INK;
      p.fillRect(-15, 42, 30, 9);
      p.fillRect(-4.5, 16, 9, 26);
      p.fillRect(-13, 9, 26, 7);
      p.fillRect(-11, -12, 22, 21);
      p.globalAlpha = 1;
      p.globalAlpha = 0.85; p.fillStyle = PAPER;
      p.fillRect(-4.5, -6, 9, 10);
      p.globalAlpha = 1; p.fillStyle = INK;
      inkStroke(p, [{x:-18,y:-12},{x:0,y:-21},{x:18,y:-12}], 5.5, {alpha:0.9, taper:0.3, seed:81, jit:0.08});
      inkStroke(p, [{x:-11,y:-21},{x:0,y:-28},{x:11,y:-21}], 4, {alpha:0.85, taper:0.3, seed:82, jit:0.08});
      p.globalAlpha = 0.9;
      p.beginPath(); p.arc(0, -32, 3.4, 0, TAU); p.fill();
      p.globalAlpha = 1;
    });

    /* 鳥居 — the gate */
    reg('torii', 195, 165, p => {
      inkStroke(p, [{x:-52,y:72},{x:-49,y:-40}], 8.5, {alpha:0.88, taper:0.2, jit:0.06, seed:91});
      inkStroke(p, [{x:52,y:72},{x:49,y:-40}], 8.5, {alpha:0.88, taper:0.2, jit:0.06, seed:92});
      p.globalAlpha = 0.86; p.fillStyle = INK;
      p.fillRect(-62, -18, 124, 7);
      p.fillRect(-3, -40, 6, 22);
      p.globalAlpha = 1;
      inkStroke(p, [{x:-78,y:-42},{x:0,y:-50},{x:78,y:-42}], 10, {alpha:0.9, taper:0.15, jit:0.05, seed:93});
      inkStroke(p, [{x:-78,y:-42},{x:-85,y:-49}], 4.5, {alpha:0.85, taper:0.6, seed:94});
      inkStroke(p, [{x:78,y:-42},{x:85,y:-49}], 4.5, {alpha:0.85, taper:0.6, seed:95});
    });

    /* 古塔 — a three-tier pagoda */
    reg('pagoda', 170, 225, p => {
      const roof = (y, w, seed) => {
        inkStroke(p, [{x:-w,y},{x:0,y:y-15},{x:w,y}], 7, {alpha:0.9, taper:0.2, jit:0.06, seed});
        inkStroke(p, [{x:-w,y},{x:-w-9,y:y-7}], 4, {alpha:0.85, taper:0.5, seed:seed+1});
        inkStroke(p, [{x:w,y},{x:w+9,y:y-7}], 4, {alpha:0.85, taper:0.5, seed:seed+2});
        p.globalAlpha = 0.5; p.fillStyle = INK;
        p.fillRect(-w * 0.42, y + 3, w * 0.84, 26);
        p.globalAlpha = 1;
      };
      roof(62, 54, 101); roof(2, 44, 104); roof(-58, 34, 107);
      inkStroke(p, [{x:0,y:-73},{x:0,y:-102}], 4, {alpha:0.9, taper:0.4, seed:110});
      p.globalAlpha = 0.85; p.strokeStyle = INK; p.lineWidth = 2;
      for (const ry of [-82, -90, -97]) {
        p.beginPath(); p.moveTo(-5, ry); p.lineTo(5, ry); p.stroke();
      }
      p.globalAlpha = 1;
      p.beginPath(); p.arc(0, -106, 3.2, 0, TAU); p.globalAlpha = 0.9; p.fillStyle = INK; p.fill(); p.globalAlpha = 1;
    });

    /* 樓閣 — the pavilion */
    reg('pavilion', 205, 155, p => {
      p.globalAlpha = 0.75; p.fillStyle = INK;
      for (const px of [-58, -20, 20, 58]) p.fillRect(px - 2.5, -10, 5, 66);
      p.fillRect(-72, 54, 144, 8);
      p.globalAlpha = 0.55; p.fillRect(-56, -8, 112, 34);
      p.globalAlpha = 1;
      inkStroke(p, [{x:-90,y:-12},{x:0,y:-42},{x:90,y:-12}], 10, {alpha:0.92, taper:0.2, jit:0.05, seed:111});
      inkStroke(p, [{x:-90,y:-12},{x:-100,y:-23}], 5, {alpha:0.85, taper:0.5, seed:112});
      inkStroke(p, [{x:90,y:-12},{x:100,y:-23}], 5, {alpha:0.85, taper:0.5, seed:113});
      inkStroke(p, [{x:-42,y:-38},{x:0,y:-48},{x:42,y:-38}], 6, {alpha:0.9, taper:0.25, jit:0.05, seed:114});
      p.globalAlpha = 0.5; p.fillStyle = INK;
      for (const rx of [-40, 0, 40]) p.fillRect(rx - 1.2, 4, 2.4, 16);
      p.globalAlpha = 1;
    });

    /* 仙鶴 — the flying crane */
    reg('crane', 125, 85, p => {
      inkStroke(p, [{x:-16,y:6},{x:0,y:2},{x:14,y:4}], 8, {alpha:0.85, taper:0.7, seed:121});
      inkStroke(p, [{x:-2,y:0},{x:-14,y:-22},{x:-30,y:-30}], 5, {alpha:0.8, taper:0.85, seed:122});
      inkStroke(p, [{x:4,y:0},{x:20,y:-18},{x:38,y:-24}], 5, {alpha:0.8, taper:0.85, seed:123});
      inkStroke(p, [{x:14,y:4},{x:26,y:-2},{x:31,y:-4}], 3, {alpha:0.8, taper:0.9, seed:124});
      p.globalAlpha = 0.85; p.fillStyle = INK;
      p.beginPath(); p.arc(32, -4, 2.6, 0, TAU); p.fill();
      p.globalAlpha = 1;
      inkStroke(p, [{x:33,y:-4},{x:40,y:-2}], 1.5, {alpha:0.75, taper:1.2, seed:125});
      inkStroke(p, [{x:-16,y:6},{x:-25,y:12}], 2.5, {alpha:0.7, taper:1, seed:126});
      cloud(p, -20, 8, 4, 0.6, 127);
    });

    /* 蘆 — reeds */
    reg('reeds', 115, 95, p => {
      for (let i = 0; i < 6; i++) {
        const bx = -38 + i * 15;
        const h = 28 + ((i * 37) % 17);
        inkStroke(p, [{x:bx,y:40},{x:bx+2,y:40-h*0.5},{x:bx-1,y:40-h}], 2.6, {alpha:0.62, taper:1.2, seed:131+i});
        if (i % 2 === 0) cloud(p, bx - 1, 40 - h - 3, 3.2, 0.7, 137 + i);
      }
    });

    /* 孤舟 — the boat */
    reg('boat', 145, 75, p => {
      inkStroke(p, [{x:-52,y:4},{x:-20,y:13},{x:20,y:13},{x:52,y:2}], 7, {alpha:0.88, taper:0.35, seed:141, jit:0.08});
      inkStroke(p, [{x:52,y:2},{x:58,y:-2}], 4, {alpha:0.8, taper:0.6, seed:142});
      inkStroke(p, [{x:-24,y:0},{x:0,y:-15},{x:24,y:0}], 5, {alpha:0.82, taper:0.4, seed:143, jit:0.08});
      inkStroke(p, [{x:0,y:-8},{x:0,y:10}], 3, {alpha:0.7, taper:0.5, seed:144});
      inkStroke(p, [{x:30,y:8},{x:32,y:-8}], 4, {alpha:0.8, taper:0.5, seed:145});
      p.globalAlpha = 0.85; p.fillStyle = INK;
      p.beginPath(); p.arc(32, -12, 3, 0, TAU); p.fill();
      p.globalAlpha = 1;
      inkStroke(p, [{x:29,y:-6},{x:48,y:12}], 2.5, {alpha:0.7, taper:0.9, seed:146});
    });

    /* 霞 — mist */
    reg('mist', 380, 120, p => {
      const g = p.createRadialGradient(0, 0, 10, 0, 0, 180);
      g.addColorStop(0, INK);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      p.save();
      p.scale(1, 0.3);
      p.globalAlpha = 0.55;
      p.fillStyle = g;
      p.beginPath(); p.arc(0, 0, 180, 0, TAU); p.fill();
      p.restore();
    });

    /* 月 — the moon (pale ink on the night sheet) */
    reg('moon', 160, 160, p => {
      const g = p.createRadialGradient(0, 0, 26, 0, 0, 78);
      g.addColorStop(0, INK);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      p.globalAlpha = 0.13; p.fillStyle = g;
      p.beginPath(); p.arc(0, 0, 78, 0, TAU); p.fill();
      p.globalAlpha = 0.72; p.fillStyle = INK;
      p.beginPath(); p.arc(0, 0, 33, 0, TAU); p.fill();
      p.globalAlpha = 0.26; p.fillStyle = PAPER;
      blobPath(p, -9, -8, 7, 151, 0.5, 8); p.fill();
      blobPath(p, 10, 6, 5, 152, 0.5, 8); p.fill();
      p.globalAlpha = 1;
    });

    return B;
  }
  function sprites() {
    if (!SPR || SPR_KEY !== themeKey) { SPR = buildSprites(); SPR_KEY = themeKey; }
    return SPR;
  }

  /* --- layer recipes: what each wave of a sheet paints onto the page ---
     el(name, chance, s0, s1, alpha, label, opt)  — near scenery, 575px cells
     wash(img, w0, w1, a0, a1, label)             — master wash, 1150px regions
     Labels are the poem-titles of the painting: Chinese only, ever. */
  const el = (name, chance, s0, s1, a, label, opt) => ({ t: 'el', name, chance, s0, s1, a, label, opt });
  const wash = (img, w0, w1, a0, a1, label) => ({ t: 'wash', img, w0, w1, a0, a1, label });
  const mist = a => ({ t: 'mist', a });
  const moonL = () => ({ t: 'moon' });
  const seal = () => ({ t: 'seal' });

  const LAND = {
    pale: [   /* FIRST WASH — a morning plain fills with its first scenery */
      [el('pineYoung', 0.30, 0.8, 1.2, 0.78), el('reeds', 0.22, 0.8, 1.2, 0.62)],
      [wash('shu', 840, 1080, 0.20, 0.28, '遠山')],
      [el('bamboo', 0.30, 0.85, 1.25, 0.74, '竹林'), el('rockS', 0.24, 0.8, 1.1, 0.66)],
      [el('pineOld', 0.26, 0.9, 1.3, 0.86, '古松'), el('lantern', 0.18, 0.85, 1.05, 0.74, '燈籠')],
      [mist(0.18)],
      [wash('guo2', 990, 1270, 0.21, 0.30, '山居')],
      [el('crane', 0.30, 0.9, 1.2, 0.72), el('pineYoung', 0.22, 0.9, 1.2, 0.70)],
      [wash('kuan', 1050, 1380, 0.18, 0.26, '層巒')],
      [el('rockS', 0.30, 1, 1.4, 0.72), el('reeds', 0.26, 0.9, 1.3, 0.60), el('deadTree', 0.15, 0.9, 1.1, 0.68, '古木')],
      [seal(), mist(0.12), el('crane', 0.32, 1, 1.3, 0.60)],
    ],
    dark: [   /* NIGHT SCROLL — the moon rises over broken-ink mountains */
      [el('reeds', 0.30, 0.9, 1.3, 0.56)],
      [moonL()],
      [wash('hab2', 900, 1120, 0.24, 0.33, '遠山')],
      [el('pagoda', 0.22, 0.9, 1.15, 0.90, '古塔')],
      [mist(0.16)],
      [wash('hab1', 990, 1320, 0.25, 0.36, '破墨')],
      [el('pineOld', 0.26, 0.9, 1.25, 0.86, '古松'), wash('trees', 1100, 1430, 0.17, 0.25)],
      [wash('shu2', 935, 1210, 0.22, 0.31, '遠浦'), el('crane', 0.28, 0.9, 1.2, 0.56)],
      [el('rockS', 0.30, 1, 1.4, 0.64), wash('shore', 990, 1270, 0.24, 0.33, '汀')],
      [seal(), mist(0.12)],
    ],
    red: [    /* CINNABAR FIELD — vermillion country, gates and cliffs */
      [el('maple', 0.30, 0.85, 1.2, 0.78), el('reeds', 0.22, 0.8, 1.2, 0.58)],
      [wash('hab2', 900, 1140, 0.22, 0.31, '遠崖')],
      [el('rockS', 0.28, 0.9, 1.3, 0.72), el('maple', 0.24, 0.9, 1.25, 0.74)],
      [el('torii', 0.22, 0.85, 1.15, 0.90, '鳥居')],
      [mist(0.17)],
      [wash('cliff', 1050, 1380, 0.21, 0.30, '絕壁')],
      [el('deadTree', 0.26, 0.9, 1.2, 0.78, '古木'), el('lantern', 0.18, 0.85, 1.05, 0.72)],
      [wash('guo', 990, 1320, 0.18, 0.27, '疊嶂'), el('crane', 0.26, 0.9, 1.2, 0.61)],
      [el('rockS', 0.30, 1, 1.4, 0.70), el('bamboo', 0.24, 0.85, 1.2, 0.66)],
      [seal(), mist(0.12)],
    ],
    storm: [  /* STORM SHEET — wind, rain and the arriving sea */
      [el('reeds', 0.32, 0.9, 1.35, 0.66, null, { bend: 1 })],
      [wash('shu2', 900, 1190, 0.21, 0.29, '遠山')],
      [el('pineOld', 0.28, 0.9, 1.3, 0.84, '風松', { bend: 1 }), el('pineYoung', 0.22, 0.85, 1.2, 0.70, null, { bend: 1 })],
      [wash('waves2', 1050, 1380, 0.20, 0.28, '波')],
      [mist(0.19)],
      [wash('guo', 1050, 1380, 0.20, 0.28, '雨山')],
      [el('boat', 0.24, 0.9, 1.2, 0.80, '孤舟')],
      [wash('waves', 970, 1270, 0.21, 0.30, '怒濤'), el('crane', 0.22, 0.85, 1.1, 0.56, null, { bend: 1 })],
      [el('rockS', 0.30, 1, 1.4, 0.68), el('reeds', 0.26, 0.9, 1.3, 0.58, null, { bend: 1 })],
      [seal(), mist(0.12)],
    ],
    gilt: [   /* GILT SCROLL — the final page, gold and ceremony */
      [el('pineYoung', 0.30, 0.8, 1.2, 0.78), el('reeds', 0.22, 0.8, 1.2, 0.62)],
      [wash('kuan', 990, 1320, 0.20, 0.27, '遠嶽')],
      [el('bamboo', 0.28, 0.85, 1.25, 0.74), el('rockS', 0.24, 0.85, 1.2, 0.66)],
      [el('pavilion', 0.20, 0.85, 1.15, 0.90, '樓閣')],
      [mist(0.16)],
      [wash('guo', 1050, 1380, 0.21, 0.30, '金山')],
      [el('pineOld', 0.26, 0.95, 1.3, 0.84, '古松'), el('lantern', 0.18, 0.85, 1.05, 0.72)],
      [wash('shu2', 935, 1210, 0.21, 0.29), el('crane', 0.28, 0.9, 1.2, 0.64)],
      [el('rockS', 0.30, 1, 1.4, 0.70), wash('shore', 990, 1270, 0.22, 0.32, '汀')],
      [seal(), mist(0.12), el('crane', 0.30, 1, 1.3, 0.58)],
    ],
  };

  /* a poem-title: vertical kanji with a small red seal beneath —
     the inscription a painter presses beside the mountain */
  function drawInscription(c, x, y, text, alpha) {
    if (!text || alpha <= 0.02) return;
    c.save();
    c.translate(x, y);
    c.globalAlpha = alpha;
    c.fillStyle = INK;
    c.font = '13px "Zen Antique", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    let yy = 0;
    for (const ch of text) { c.fillText(ch, 0, yy); yy += 15; }
    c.globalAlpha = alpha * 0.85;
    c.fillStyle = RED;
    c.fillRect(-3, yy - 7, 6.4, 6.4);
    c.restore();
  }

  /* the completing seal: the page is finished, the painter signs it */
  function drawSeal(c, x, y, kanji, k) {
    const s = 1 + (1 - k) * 0.55;
    const a = 0.08 + 0.5 * k;
    c.save();
    c.translate(x, y);
    c.rotate(-0.055);
    c.scale(s, s);
    c.globalAlpha = a;
    c.fillStyle = RED;
    const w = 76, r = 8;
    c.beginPath();
    c.moveTo(-w / 2 + r, -w / 2);
    c.lineTo(w / 2 - r, -w / 2); c.quadraticCurveTo(w / 2, -w / 2, w / 2, -w / 2 + r);
    c.lineTo(w / 2, w / 2 - r); c.quadraticCurveTo(w / 2, w / 2, w / 2 - r, w / 2);
    c.lineTo(-w / 2 + r, w / 2); c.quadraticCurveTo(-w / 2, w / 2, -w / 2, w / 2 - r);
    c.lineTo(-w / 2, -w / 2 + r); c.quadraticCurveTo(-w / 2, -w / 2, -w / 2 + r, -w / 2);
    c.closePath(); c.fill();
    /* eroded rim: paper flecks where the seal pressed unevenly */
    const rnd = mulberry((x * 31 + y * 17) | 0);
    c.globalAlpha = a * 1.9;
    c.fillStyle = PAPER;
    for (let i = 0; i < 9; i++) {
      const px = (rnd() - 0.5) * (w - 8), py = (rnd() - 0.5) * (w - 8);
      if (Math.abs(px) > w / 2 - 7 || Math.abs(py) > w / 2 - 7) {
        c.beginPath(); c.arc(px, py, 1 + rnd() * 1.6, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = a * 2.1;
    c.font = '44px "Zen Antique", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(kanji, 0, 3);
    c.restore();
  }

  const RG = 1150;   /* region grid — master washes, moon, seal */
  const CE = 575;    /* cell grid — near scenery */

  function drawLandscape(c, vx0, vy0, vx1, vy1, t) {
    const S = G.S;
    if (S.mode === 'title' || !S.stats) return;
    const wv = S.landscapeWave | 0;
    if (wv <= 0) return;
    const spec = LAND[themeKey];
    if (!spec) return;
    const reveal = Math.max(0, Math.min(1, (t - (S.waveRevealT || 0)) / 2.1));
    const B = sprites();
    const area = AREAS[S.areaIdx] || AREAS[0];

    for (let k = 0; k < wv; k++) {
      const layer = spec[k];
      if (!layer) continue;
      const fade = k === wv - 1 ? reveal : 1;
      if (fade <= 0.02) continue;

      for (const L of layer) {
        if (L.t === 'wash') {
          const img = washReady(L.img);
          if (!img) continue;
          const m = 640;
          const gx0 = Math.floor((vx0 - m) / RG), gx1 = Math.floor((vx1 + m) / RG);
          const gy0 = Math.floor((vy0 - m) / RG), gy1 = Math.floor((vy1 + m) / RG);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              const h1 = hash2(gx * 13 + k * 71, gy * 29 + k * 17);
              const x = gx * RG + h1 * RG * 0.7 + RG * 0.15;
              const y = gy * RG + hash2(gx * 7 - k * 3, gy * 11 + k * 41) * RG * 0.6 + RG * 0.2;
              const wid = L.w0 + h1 * (L.w1 - L.w0);
              const hgt = wid * img.naturalHeight / img.naturalWidth;
              const flip = hash2(gx + k * 5, gy * 3 - k) > 0.5 ? -1 : 1;
              const a = (L.a0 + hash2(gx * 3, gy * 5 + k) * (L.a1 - L.a0)) * fade;
              c.save();
              c.translate(x, y);
              c.scale(flip, 1);
              c.globalAlpha = a;
              c.drawImage(img, -wid / 2, -hgt / 2, wid, hgt);
              c.restore();
              if (L.label && hash2(gx * 17 + k, gy * 5) > 0.7) {
                drawInscription(c, x + flip * wid * 0.44, y - hgt * 0.36, L.label, Math.min(0.5, a * 3));
              }
            }
          }
        } else if (L.t === 'el') {
          const sp = B[L.name];
          if (!sp) continue;
          const m = 220;
          const gx0 = Math.floor((vx0 - m) / CE), gx1 = Math.floor((vx1 + m) / CE);
          const gy0 = Math.floor((vy0 - m) / CE), gy1 = Math.floor((vy1 + m) / CE);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              const h1 = hash2(gx * 31 + k * 97 + 7, gy * 17 - k * 13);
              if (h1 > L.chance) continue;
              const x = gx * CE + hash2(gx * 5 + k, gy * 23 + k * 3) * CE;
              const y = gy * CE + hash2(gx * 11 - k, gy * 7 + k * 19) * CE;
              const sc = L.s0 + hash2(gx + k * 2, gy - k) * (L.s1 - L.s0);
              const flip = hash2(gx * 9 + k, gy * 13) > 0.5 ? -1 : 1;
              const a = L.a * fade;
              c.save();
              c.translate(x, y);
              if (L.opt && L.opt.bend) c.rotate((hash2(gx * 3 + k, gy * 5) - 0.5) * 0.4);
              c.scale(flip * sc, sc);
              c.globalAlpha = a;
              c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
              c.restore();
              if (L.label && hash2(gx * 7 + k * 3, gy * 31) > 0.52) {
                drawInscription(c, x + flip * sc * sp.w * 0.42, y - sc * sp.h * 0.42, L.label, Math.min(0.5, a * 0.8));
              }
            }
          }
        } else if (L.t === 'mist') {
          const sp = B.mist;
          const m = 420;
          const gx0 = Math.floor((vx0 - m) / RG), gx1 = Math.floor((vx1 + m) / RG);
          const gy0 = Math.floor((vy0 - m) / RG), gy1 = Math.floor((vy1 + m) / RG);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              const h1 = hash2(gx * 41 + k * 23, gy * 13 + k * 7);
              if (h1 > 0.8) continue;
              const x = gx * RG + hash2(gx + k, gy * 3) * RG;
              const y = gy * RG + hash2(gx * 5, gy + k * 11) * RG;
              const wid = 480 + h1 * 420;
              c.save();
              c.translate(x, y);
              c.globalAlpha = L.a * fade * (0.55 + h1 * 0.5);
              c.drawImage(sp.cv, -wid / 2, -wid * 0.16, wid, wid * 0.32);
              c.restore();
            }
          }
        } else if (L.t === 'moon') {
          const sp = B.moon;
          const m = 300;
          const gx0 = Math.floor((vx0 - m) / RG), gx1 = Math.floor((vx1 + m) / RG);
          const gy0 = Math.floor((vy0 - m) / RG), gy1 = Math.floor((vy1 + m) / RG);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              if (hash2(gx * 19 + 3, gy * 43 + 11) > 0.55) continue;
              const x = gx * RG + hash2(gx * 7, gy * 17) * RG;
              const y = gy * RG + hash2(gx * 23, gy * 5) * RG;
              const sc = 0.9 + hash2(gx, gy * 29) * 0.5;
              c.save();
              c.translate(x, y);
              c.globalAlpha = fade;
              c.drawImage(sp.cv, -80 * sc, -80 * sc, 160 * sc, 160 * sc);
              c.restore();
            }
          }
        } else if (L.t === 'seal') {
          const m = 200;
          const gx0 = Math.floor((vx0 - m) / RG), gx1 = Math.floor((vx1 + m) / RG);
          const gy0 = Math.floor((vy0 - m) / RG), gy1 = Math.floor((vy1 + m) / RG);
          for (let gy = gy0; gy <= gy1; gy++) {
            for (let gx = gx0; gx <= gx1; gx++) {
              if (hash2(gx * 53 + 9, gy * 7 + 31) > 0.5) continue;
              const x = gx * RG + hash2(gx * 11, gy * 37) * RG;
              const y = gy * RG + hash2(gx * 43, gy * 3) * RG;
              drawSeal(c, x, y, area.kanji, fade);
            }
          }
        }
      }
    }

    /* the painter's scene inscriptions — one pressed into the paper
       at every level's first wave, where the brush then stood */
    for (const mk of S.levelMarks || []) {
      const k = Math.max(0, Math.min(1, (t - mk.t) / 1.4));
      if (k <= 0.02) continue;
      drawInscription(c, mk.x, mk.y, mk.kanji, 0.6 * k);
    }

    /* small brush accents — every wave leaves a mark near the brush */
    const BLK = sprites();
    for (const ik of S.inklings || []) {
      const sp = BLK[ik.kind];
      if (!sp) continue;
      const k = Math.max(0, Math.min(1, (t - ik.t) / 1.2));
      if (k <= 0.02) continue;
      const flip = (ik.seed & 1) ? -1 : 1;
      const sc = 0.26 + (ik.seed % 10) * 0.018;
      c.save();
      c.translate(ik.x, ik.y);
      c.scale(flip * sc, sc);
      c.globalAlpha = 0.5 * k;
      c.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  /* the guardian's red seal, worn above the beast */
  function eliteMark(c, r) {
    c.save();
    c.translate(0, -r - 15);
    c.rotate(-0.12 + Math.sin(G.S.clockT * 2.2) * 0.04);
    c.fillStyle = RED;
    c.fillRect(-7, -7, 14, 14);
    c.fillStyle = PAPER;
    c.font = '10px "Zen Antique", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('危', 0, 0.5);
    c.restore();
  }

  function drawEnemy(c, e, t) {
    const S = G.S;
    const tick = Math.floor(t / CFG.ink.boilRate);
    const sd = seedFor(e, tick);
    const r = e.r;
    const isBoss = !!ENEMIES[e.type].boss;
    c.save();
    c.translate(e.x, e.y);
    /* a boss is born of vermilion — the paper's one sacred red,
       brightened on the night sheet so it burns there too */
    const BOSS_INK = themeKey === 'dark' ? '#c9462e' : RED;
    c.fillStyle = isBoss ? BOSS_INK : INK;
    c.strokeStyle = isBoss ? BOSS_INK : INK;
    c.lineJoin = 'round';
    c.lineCap = 'round';

    let silhouette = null; /* path fn for hit-flash overlay */

    switch (e.type) {
      case 'pulse': case 'washling': { /* BLOT — a living drop of ink */
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        const sq = 1 + Math.sin(e.t * (e.type === 'washling' ? 3.4 : 6) + e.seed) * 0.035;
        c.save();
        c.rotate(ang); c.scale(sq, 2 - sq); c.rotate(-ang);
        if (e.type === 'washling') {
          /* the washling is ink thinned with water — paler, softer,
             with a darker heart still finding its shape */
          c.globalAlpha = 0.78;
          blobPath(c, 0, 0, r, sd, 0.24, 10);
          c.fill();
          c.globalAlpha = 0.5;
          blobPath(c, 0, 0, r * 0.45, sd ^ 17, 0.3, 8);
          c.fill();
        } else {
          blobPath(c, 0, 0, r, sd, 0.17, 10);
          c.fill();
        }
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.17, 10);
        if (e.type !== 'washling') eyeSlits(c, ang, r);
        else eyeSlits(c, ang, r, 0.45);
        break;
      }
      case 'dart': case 'gale': case 'ember': { /* SPEAR — a brush tip that lunges */
        const st = e.state === 'skid' ? 'rest' : e.state;
        /* the gale trails speed lines; the ember carries a hot heart */
        if (e.type === 'gale' && (st === 'dash' || st === 'tele')) {
          c.save();
          c.globalAlpha = st === 'dash' ? 0.4 : 0.18;
          c.lineWidth = 1.2;
          for (let g = 1; g <= 3; g++) {
            c.beginPath();
            c.moveTo(-r * (1.2 + g * 0.7), -r * 0.5 + g * r * 0.5);
            c.lineTo(-r * (2.2 + g * 1.1), -r * 0.5 + g * r * 0.5);
            c.stroke();
          }
          c.restore();
        }
        c.rotate(e.ang);
        if (st === 'dash') {
          c.scale(1.55, 0.72);
          teardrop(c, r);
          c.fill();
        } else if (st === 'tele') {
          const jit = (Math.random() - 0.5) * 1.6;
          c.translate(jit, jit);
          c.scale(1.14, 1.14);
          teardrop(c, r);
          c.save(); c.fillStyle = patHatch; c.fill(); c.restore();
          c.lineWidth = 1.8; c.stroke();
        } else if (st === 'rest') {
          c.scale(0.85, 0.85);
          blobPath(c, 0, 0, r * 0.8, sd, 0.25, 9);
          c.lineWidth = 1.8; c.stroke();
        } else { /* cruise */
          teardrop(c, r);
          c.lineWidth = 2;
          c.stroke();
          c.translate(0.8, 0.6);
          c.globalAlpha = 0.3;
          c.stroke();
        }
        if (e.type === 'ember') {
          /* the coal: a red fleck breathing at the tip */
          c.fillStyle = RED;
          c.globalAlpha = 0.55 + 0.45 * Math.sin(e.t * 11 + e.seed);
          c.beginPath(); c.arc(r * 0.15, 0, 1.9, 0, TAU); c.fill();
          c.globalAlpha = 1;
          c.fillStyle = INK;
        }
        silhouette = () => { c.save(); c.rotate(e.ang); teardrop(c, r * 1.1); c.restore(); };
        break;
      }
      case 'split': { /* DRIP — a hanging drop of ink */
        c.rotate(-Math.PI / 2 + Math.sin(e.t * 2.2 + e.seed) * 0.35);
        teardrop(c, r);
        c.lineWidth = 2;
        c.stroke();
        c.save(); c.globalAlpha = 0.25; c.fill(); c.restore();
        c.beginPath(); c.arc(r * 0.15, 0, r * 0.2, 0, TAU); c.fill();
        silhouette = () => { c.save(); c.rotate(-Math.PI / 2); teardrop(c, r * 1.08); c.restore(); };
        break;
      }
      case 'slab': { /* BRUTE — a heavy, dripping mass */
        const breathe = 1 + Math.sin(e.t * 2 + e.seed) * 0.03;
        c.save();
        c.rotate(Math.sin(e.t * 1.4 + e.seed) * 0.06);
        c.scale(breathe, breathe);
        blobPath(c, 0, 0, r, sd, 0.12, 14);
        c.fill();
        c.save(); c.globalAlpha = 0.5; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.4;
        blobPath(c, 0, 0, r, sd, 0.12, 14);
        c.stroke();
        /* drips hanging off the bottom */
        const drips = mulberry(sd >> 3);
        for (let i = 0; i < 3; i++) {
          const dx = (drips() - 0.5) * r * 1.4;
          const len = r * (0.4 + drips() * 0.5) * (1 + Math.sin(t * 3 + i * 2 + e.seed) * 0.25);
          inkStroke(c, [
            { x: dx, y: r * 0.7 },
            { x: dx + (drips() - 0.5) * 3, y: r * 0.7 + len * 0.6 },
            { x: dx + (drips() - 0.5) * 2, y: r * 0.7 + len },
          ], 2.4, { alpha: 0.85 });
        }
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 0.8);
        silhouette = () => blobPath(c, 0, 0, r * 1.06, sd, 0.12, 14);
        break;
      }
      case 'spit': case 'raindrake': { /* SPIT — a puffed bladder with an open maw */
        const st = e.state;
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        if (st === 'tele') {
          const pr = Math.min(1, e.stateT / 0.5);
          const jit = (Math.random() - 0.5) * 1.4;
          c.translate(jit, jit);
          c.scale(1 + pr * 0.3, 1 + pr * 0.3);
          blobPath(c, 0, 0, r, sd, 0.18, 10);
          c.save(); c.fillStyle = patHatch; c.fill(); c.restore();
          c.lineWidth = 2.2; c.stroke();
        } else if (st === 'spit') {
          c.scale(1.22, 0.82);
          blobPath(c, 0, 0, r, sd, 0.16, 10);
          c.fill();
        } else {
          const breathe = 1 + Math.sin(e.t * 4 + e.seed) * 0.04;
          c.scale(breathe, 2 - breathe);
          blobPath(c, 0, 0, r, sd, 0.18, 10);
          c.lineWidth = 2;
          c.stroke();
          c.save(); c.globalAlpha = 0.14; c.fill(); c.restore();
        }
        /* the maw — a paper wedge aimed at you */
        const open = st === 'tele' ? 1 : 0.5;
        c.save();
        c.rotate(ang);
        c.fillStyle = PAPER;
        c.beginPath();
        c.moveTo(r * 0.35, 0);
        c.lineTo(r * (1.02 + 0.16 * open), -r * 0.34 * open);
        c.lineTo(r * (1.02 + 0.16 * open), r * 0.34 * open);
        c.closePath();
        c.fill();
        c.restore();
        if (e.type === 'raindrake') {
          /* the caller wears a straw hat, and rain hangs above it */
          c.strokeStyle = INK; c.lineWidth = 1.7;
          c.beginPath(); c.arc(0, -r * 1.02, r * 0.62, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
          c.beginPath(); c.moveTo(-r * 0.78, -r * 0.86); c.lineTo(r * 0.78, -r * 0.86); c.stroke();
          c.lineWidth = 1.3;
          for (let i = 0; i < 3; i++) {
            const ry = -r * (1.7 + ((e.t * 90 + i * 26 + e.seed * 40) % 55) / 55 * 0.9);
            const rx = -r * 0.5 + i * r * 0.5;
            c.globalAlpha = 0.5;
            c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx, ry + r * 0.34); c.stroke();
            c.globalAlpha = 1;
          }
        }
        eyeSlits(c, ang, r, 0.6);
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.18, 10);
        break;
      }
      case 'moth': { /* MOTH — a flicker of ink that never holds course */
        c.rotate(e.ang);
        const flap = Math.sin(e.t * 13 + e.seed);
        c.scale(1 + flap * 0.08, 1 - flap * 0.14);
        /* ghost echoes of the last flick */
        for (let g = 1; g <= 2; g++) {
          c.save();
          c.globalAlpha = 0.16 / g;
          c.translate(-g * 9, Math.sin(e.t * 13 + e.seed + g) * 3);
          teardrop(c, r * 0.85);
          c.fill();
          c.restore();
        }
        teardrop(c, r);
        c.fill();
        /* whisker antennae */
        c.strokeStyle = INK; c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(r * 1.1, -r * 0.2); c.lineTo(r * 1.7, -r * 0.6); c.stroke();
        c.beginPath(); c.moveTo(r * 1.1, r * 0.2); c.lineTo(r * 1.7, r * 0.6); c.stroke();
        silhouette = () => { c.save(); c.rotate(e.ang); teardrop(c, r * 1.1); c.restore(); };
        break;
      }
      case 'shade': case 'nightshade': { /* SHADE — dissolving into nothing, then behind you */
        const st = e.state;
        const ns = e.type === 'nightshade';
        let alpha = ns ? 0.86 : 0.72;
        let stretch = 1;
        if (st === 'dissolve') {
          const pr = Math.min(1, e.stateT / 0.55);
          alpha = 0.72 * (1 - pr * 0.92);
          stretch = 1 + pr * 0.3;
        } else if (st === 'pounce') {
          alpha = 1; stretch = 1.35;
        } else if (st === 'rest') {
          alpha = 0.9;
        }
        c.globalAlpha = alpha;
        if (st === 'dissolve') {
          /* the body frays into drifting flecks */
          const pr = Math.min(1, e.stateT / 0.55);
          const rnd = mulberry(sd >> 2);
          for (let i = 0; i < 5; i++) {
            const fa = rnd() * TAU, fd = r * (0.3 + rnd() * 1.2) * (0.4 + pr);
            c.save();
            c.translate(Math.cos(fa) * fd, Math.sin(fa) * fd);
            c.rotate(fa);
            teardrop(c, r * 0.3 * (1 - pr * 0.5));
            c.fill();
            c.restore();
          }
        }
        c.rotate(e.ang);
        c.scale(stretch, 2 - stretch);
        blobPath(c, 0, 0, r, sd, 0.3, 9);
        c.fill();
        c.globalAlpha = alpha;
        c.lineWidth = 1.6;
        blobPath(c, 0, 0, r * 0.95, sd ^ 31, 0.32, 9);
        c.stroke();
        /* hollow eyes — two paper slits, always */
        eyeSlits(c, 0, r, ns ? 1 : 0.9);
        if (ns) {
          /* the nightshade keeps a red heart under its ink */
          c.fillStyle = RED;
          c.globalAlpha = alpha * 0.8;
          c.beginPath(); c.arc(0, r * 0.08, r * 0.16, 0, TAU); c.fill();
          c.fillStyle = INK; c.globalAlpha = 1;
        }
        silhouette = () => blobPath(c, 0, 0, r * 1.1, sd, 0.3, 9);
        break;
      }
      case 'titan': { /* TITAN — the mother of blots */
        const breathe = 1 + Math.sin(e.t * 1.6 + e.seed) * 0.035;
        c.save();
        c.rotate(Math.sin(e.t * 0.9 + e.seed) * 0.05);
        c.scale(breathe, breathe);
        blobPath(c, 0, 0, r, sd, 0.11, 16);
        c.fill();
        c.save(); c.globalAlpha = 0.42; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.6;
        blobPath(c, 0, 0, r, sd, 0.11, 16);
        c.stroke();
        /* heavy hanging drips */
        const drips = mulberry(sd >> 4);
        for (let i = 0; i < 5; i++) {
          const dx = (drips() - 0.5) * r * 1.5;
          const len = r * (0.25 + drips() * 0.45) * (1 + Math.sin(t * 2.4 + i * 1.7 + e.seed) * 0.3);
          inkStroke(c, [
            { x: dx, y: r * 0.72 },
            { x: dx + (drips() - 0.5) * 4, y: r * 0.72 + len * 0.6 },
            { x: dx + (drips() - 0.5) * 3, y: r * 0.72 + len },
          ], 3.2, { alpha: 0.85 });
        }
        /* brood dots circling the mass */
        for (let i = 0; i < 3; i++) {
          const oa = e.t * 1.4 + (i / 3) * TAU + e.seed;
          c.beginPath();
          c.arc(Math.cos(oa) * (r + 9), Math.sin(oa) * (r + 9), 2.6, 0, TAU);
          c.fill();
        }
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 0.85);
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.11, 16);
        break;
      }
      case 'wraith': case 'gloom': { /* WISP — smoke given intent */
        if (e.type === 'gloom') {
          /* the gloom: a slow fog bank, breathing in and out */
          const puff = 1 + Math.sin(e.t * 1.3 + e.seed) * 0.16;
          c.save();
          c.globalAlpha = 0.2;
          c.translate(Math.sin(e.t * 0.7 + e.seed) * 6, 0);
          blobPath(c, 0, 0, r * 1.35 * puff, sd - 11, 0.45, 11);
          c.fill();
          c.restore();
          c.save();
          c.globalAlpha = 0.34;
          blobPath(c, 0, 0, r * 1.05 * puff, sd ^ 53, 0.4, 10);
          c.fill();
          c.restore();
          c.globalAlpha = 0.85;
          c.lineWidth = 2;
          blobPath(c, 0, 0, r * 0.8, sd, 0.36, 9);
          c.stroke();
          const ga = Math.atan2(S.player.y - e.y, S.player.x - e.x);
          eyeSlits(c, ga, r * 0.8, 0.5);
          silhouette = () => blobPath(c, 0, 0, r * 1.2, sd, 0.4, 10);
          break;
        }
        c.save();
        c.globalAlpha = 0.22;
        c.translate(-Math.cos(e.ang) * 10, -Math.sin(e.ang) * 10);
        blobPath(c, 0, 0, r * 0.9, sd - 7, 0.4, 9);
        c.fill();
        c.restore();
        c.save();
        c.globalAlpha = 0.3;
        blobPath(c, 0, 0, r, sd ^ 99, 0.34, 9);
        c.fill();
        c.restore();
        c.globalAlpha = 0.9;
        c.lineWidth = 2.2;
        blobPath(c, 0, 0, r * 0.92, sd, 0.3, 9);
        c.stroke();
        const oa = e.t * 4 + e.seed;
        c.globalAlpha = 1;
        c.beginPath();
        c.arc(Math.cos(oa) * (r + 5), Math.sin(oa) * (r + 5), 2.6, 0, TAU);
        c.fill();
        silhouette = () => blobPath(c, 0, 0, r, sd, 0.34, 9);
        break;
      }
      case 'kage': { /* KAGE — a stain that circles, then cuts through you */
        const st = e.state;
        const ang = Math.atan2(G.S.player.y - e.y, G.S.player.x - e.x);
        if (st === 'tele') {
          const jit = (Math.random() - 0.5) * 2;
          c.translate(jit, jit);
          c.save();
          c.rotate(ang); c.scale(1.25, 0.8); c.rotate(-ang);
          blobPath(c, 0, 0, r, sd, 0.3, 9);
          c.save(); c.fillStyle = patHatch; c.fill(); c.restore();
          c.lineWidth = 2; c.stroke();
          c.restore();
        } else if (st === 'dash') {
          const da = Math.atan2(e.py, e.px);
          /* afterimages behind the cut */
          for (let g = 2; g >= 1; g--) {
            c.save();
            c.globalAlpha = 0.16 / g;
            c.translate(-Math.cos(da) * g * 15, -Math.sin(da) * g * 15);
            c.rotate(da); c.scale(1.6, 0.55);
            blobPath(c, 0, 0, r * 0.9, sd ^ g, 0.3, 9);
            c.fill();
            c.restore();
          }
          c.rotate(da); c.scale(1.75, 0.55);
          blobPath(c, 0, 0, r, sd, 0.22, 9);
          c.fill();
        } else if (st === 'rest') {
          c.globalAlpha = 0.55;
          blobPath(c, 0, 0, r * 0.85, sd, 0.3, 9);
          c.fill();
        } else { /* cruise — a low smear with a trailing wisp */
          c.save();
          c.globalAlpha = 0.18;
          c.translate(-Math.cos(e.ang) * 13, -Math.sin(e.ang) * 13);
          blobPath(c, 0, 0, r * 0.8, sd ^ 41, 0.4, 9);
          c.fill();
          c.restore();
          c.save();
          c.rotate(ang); c.scale(1.06, 0.92); c.rotate(-ang);
          blobPath(c, 0, 0, r, sd, 0.26, 10);
          c.fill();
          c.restore();
        }
        eyeSlits(c, st === 'dash' ? Math.atan2(e.py, e.px) : ang, r, 0.75);
        silhouette = () => blobPath(c, 0, 0, r * 1.1, sd, 0.28, 9);
        break;
      }
      case 'stilt': { /* STILT — a tall, patient line that draws its own */
        const st = e.state;
        const ang = e.state === 'aim' || e.state === 'fire' ? e.ang : Math.atan2(G.S.player.y - e.y, G.S.player.x - e.x);
        /* the aim line: a hair drawn toward you, pulled taut */
        if (st === 'aim') {
          const pr = Math.min(1, e.stateT / 0.66);
          c.save();
          c.globalAlpha = 0.1 + 0.42 * pr;
          c.lineWidth = 0.7 + pr * 1.2;
          c.strokeStyle = INK;
          c.beginPath();
          c.moveTo(Math.cos(ang) * (r + 2), Math.sin(ang) * (r + 2));
          c.lineTo(Math.cos(ang) * 640, Math.sin(ang) * 640);
          c.stroke();
          c.restore();
        }
        c.rotate(ang);
        if (st === 'fire') c.scale(1.28, 0.78); /* the recoil */
        /* stilts — two long, thin legs trailing behind */
        const sway = Math.sin(e.t * 2.4 + e.seed) * 2.4;
        inkStroke(c, [
          { x: -r * 0.3, y: -r * 0.45 },
          { x: -r * 1.5, y: -r * 1.05 + sway },
          { x: -r * 2.4, y: -r * 1.5 + sway },
        ], 1.7, { alpha: 0.9 });
        inkStroke(c, [
          { x: -r * 0.3, y: r * 0.45 },
          { x: -r * 1.5, y: r * 1.05 - sway },
          { x: -r * 2.4, y: r * 1.5 - sway },
        ], 1.7, { alpha: 0.9 });
        /* body — a small folded diamond, held high */
        c.beginPath();
        c.moveTo(r * 1.05, 0);
        c.lineTo(r * 0.1, -r * 0.62);
        c.lineTo(-r * 0.75, 0);
        c.lineTo(r * 0.1, r * 0.62);
        c.closePath();
        c.globalAlpha = st === 'aim' ? 0.85 : 0.28;
        c.fill();
        c.globalAlpha = 1;
        c.lineWidth = 1.9;
        c.stroke();
        /* a single paper eye */
        c.strokeStyle = PAPER;
        c.lineWidth = 1.6;
        c.beginPath();
        c.moveTo(r * 0.34, -r * 0.06);
        c.lineTo(r * 0.62, -r * 0.06);
        c.stroke();
        silhouette = () => {
          c.beginPath();
          c.moveTo(r * 1.1, 0);
          c.lineTo(r * 0.1, -r * 0.7);
          c.lineTo(-r * 0.8, 0);
          c.lineTo(r * 0.1, r * 0.7);
          c.closePath();
        };
        break;
      }
      case 'oni': { /* ONI — a horned mass that bulldozes straight ahead */
        const st = e.state;
        const ang = Math.atan2(G.S.player.y - e.y, G.S.player.x - e.x);
        if (st === 'windup') {
          const jit = (Math.random() - 0.5) * 2.4;
          c.translate(jit, jit);
        }
        if (st === 'charge') {
          c.rotate(e.ang);
          c.scale(1.5, 0.78);
          blobPath(c, 0, 0, r, sd, 0.13, 13);
          c.fill();
          /* speed lines peeling off the shoulders */
          c.globalAlpha = 0.35;
          c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(-r * 1.1, -r * 0.5); c.lineTo(-r * 2.3, -r * 0.7); c.stroke();
          c.beginPath(); c.moveTo(-r * 1.1, r * 0.5); c.lineTo(-r * 2.3, r * 0.7); c.stroke();
        } else {
          c.save();
          c.rotate(ang);
          const breathe = 1 + Math.sin(e.t * 2.2 + e.seed) * 0.028;
          c.scale(breathe, breathe);
          blobPath(c, 0, 0, r, sd, 0.12, 13);
          c.fill();
          if (st === 'windup') {
            c.save(); c.globalAlpha = 0.5; c.fillStyle = patHatch; c.fill(); c.restore();
            c.save(); c.globalAlpha = 0.2; c.fillStyle = RED; blobPath(c, 0, 0, r, sd, 0.12, 13); c.fill(); c.restore();
          }
          c.lineWidth = 2.4;
          blobPath(c, 0, 0, r, sd, 0.12, 13);
          c.stroke();
          /* the horns */
          inkStroke(c, [
            { x: -r * 0.15, y: -r * 0.8 },
            { x: -r * 0.05, y: -r * 1.25 },
            { x: r * 0.28, y: -r * 1.45 },
          ], 2.6, { alpha: 0.95 });
          inkStroke(c, [
            { x: -r * 0.15, y: r * 0.8 },
            { x: -r * 0.05, y: r * 1.25 },
            { x: r * 0.28, y: r * 1.45 },
          ], 2.6, { alpha: 0.95 });
          eyeSlits(c, 0, r, 0.7);
          c.restore();
        }
        silhouette = () => blobPath(c, 0, 0, r * 1.06, sd, 0.13, 13);
        break;
      }
      case 'crane': case 'palecrane': case 'phoenix': { /* CRANE — folded paper that swoops past in arcs */
        const st = e.state;
        const pale = e.type === 'palecrane';
        const gold = e.type === 'phoenix';
        c.rotate(e.ang);
        const flap = Math.sin(e.t * 10 + e.seed);
        if (st === 'pass') {
          /* a ghost of the arc it just cut */
          c.save();
          c.globalAlpha = pale ? 0.1 : 0.14;
          c.translate(-14, flap * 3);
          cranePath(c, r * 0.92, -flap * 0.5);
          c.stroke();
          c.restore();
        }
        cranePath(c, r, flap);
        c.globalAlpha = st === 'pass' ? (pale ? 0.8 : 0.95) : 0.16;
        c.fill();
        c.globalAlpha = pale ? 0.9 : 1;
        c.lineWidth = 1.9;
        cranePath(c, r, flap);
        c.stroke();
        /* a red eye-dot, the one fleck of color */
        c.fillStyle = RED;
        c.beginPath();
        c.arc(r * 0.82, -r * 0.1, 1.6, 0, TAU);
        c.fill();
        if (gold) {
          /* the phoenix's crest: two plumes riding the flap */
          c.strokeStyle = INK;
          inkStroke(c, [
            { x: r * 0.7, y: -r * 0.35 },
            { x: r * 1.25, y: -r * 0.9 - flap * 2 },
            { x: r * 1.7, y: -r * 0.7 - flap * 3 },
          ], 1.5, { alpha: 0.9 });
          inkStroke(c, [
            { x: r * 0.7, y: -r * 0.35 },
            { x: r * 1.15, y: -r * 0.55 - flap * 2 },
            { x: r * 1.55, y: -r * 1.15 - flap * 3 },
          ], 1.2, { alpha: 0.7 });
        }
        silhouette = () => cranePath(c, r * 1.08, flap);
        break;
      }
      case 'popper': { /* POPPER — a round bomb of ink with a burning fuse */
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        const near = Math.max(0, 1 - Math.hypot(S.player.x - e.x, S.player.y - e.y) / 420);
        const swell = 1 + near * 0.22 + Math.sin(e.t * 9) * 0.04 * (0.4 + near);
        c.save();
        c.scale(swell, swell);
        blobPath(c, 0, 0, r, sd, 0.14, 10);
        c.fill();
        c.restore();
        /* the fuse: a short curled stroke with a red spark */
        c.save();
        c.rotate(Math.sin(e.t * 6 + e.seed) * 0.2);
        inkStroke(c, [
          { x: 0, y: -r * 0.8 },
          { x: r * 0.2, y: -r * 1.25 },
          { x: r * 0.55, y: -r * 1.3 },
        ], 1.8, { alpha: 0.95 });
        c.fillStyle = RED;
        c.globalAlpha = 0.65 + 0.35 * Math.sin(e.t * 14);
        c.beginPath();
        c.arc(r * 0.6, -r * 1.3, 2.2 + near * 1.4, 0, TAU);
        c.fill();
        c.restore();
        eyeSlits(c, ang, r, 0.85);
        silhouette = () => blobPath(c, 0, 0, r * swell * 1.06, sd, 0.14, 10);
        break;
      }
      case 'lotus': { /* LOTUS — a rooted rosette that sprays ink */
        const rooted = e.state === 'root';
        const open = rooted ? 1 + Math.sin(e.stateT * 5) * 0.1 : 0.7;
        c.rotate(e.ang);
        /* petal strokes around the heart */
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + (rooted ? e.stateT * 0.4 : e.t * 0.3);
          const len = r * (1.15 + 0.35 * open);
          inkStroke(c, [
            { x: Math.cos(a) * r * 0.35, y: Math.sin(a) * r * 0.35 },
            { x: Math.cos(a) * len * 0.7, y: Math.sin(a) * len * 0.7 },
            { x: Math.cos(a) * len, y: Math.sin(a) * len },
          ], 2.4, { alpha: rooted ? 0.92 : 0.55, seed: sd + i });
        }
        blobPath(c, 0, 0, r * 0.62, sd, 0.14, 9);
        c.fill();
        if (rooted) {
          /* the spray: a paper wedge opened at you */
          const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x) - e.ang;
          c.save();
          c.rotate(ang);
          c.fillStyle = PAPER;
          c.beginPath();
          c.moveTo(r * 0.4, 0);
          c.lineTo(r * 1.05, -r * 0.42);
          c.lineTo(r * 1.05, r * 0.42);
          c.closePath();
          c.fill();
          c.restore();
        }
        silhouette = () => blobPath(c, 0, 0, r * 1.15, sd, 0.2, 10);
        break;
      }
      case 'gate': case 'sealbearer': { /* GATE — a slow mass behind a paper shield */
        const sealed = e.type === 'sealbearer';
        c.rotate(e.ang);
        blobPath(c, 0, 0, r * 0.9, sd, 0.12, 12);
        c.fill();
        c.save(); c.globalAlpha = 0.4; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.2;
        blobPath(c, 0, 0, r * 0.9, sd, 0.12, 12);
        c.stroke();
        /* the shield: a thick pale arc held before it —
           the sealbearer's is pressed red, a hanko held edgewise */
        c.strokeStyle = sealed ? RED : PAPER;
        c.lineWidth = sealed ? 6.4 : 5.4;
        c.beginPath();
        c.arc(0, 0, r * 1.28, -1.05, 1.05);
        c.stroke();
        c.strokeStyle = sealed ? RED : INK;
        c.lineWidth = 1.4;
        c.beginPath();
        c.arc(0, 0, r * 1.28 + 3.4, -1.05, 1.05);
        c.stroke();
        c.beginPath();
        c.arc(0, 0, r * 1.28 - 3.4, -1.05, 1.05);
        c.stroke();
        if (sealed) {
          /* the seal's face: a red square carrying 印 */
          c.save();
          c.translate(r * 1.28, 0);
          c.rotate(Math.PI / 2);
          c.fillStyle = RED;
          c.fillRect(-5.4, -5.4, 10.8, 10.8);
          c.fillStyle = PAPER;
          c.font = '8px "Zen Antique", serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('印', 0, 0.5);
          c.restore();
        }
        silhouette = () => blobPath(c, 0, 0, r * 0.96, sd, 0.12, 12);
        break;
      }
      case 'warden': { /* WARDEN — a floating standard that quickens the pack */
        const bob = Math.sin(e.t * 2.6 + e.seed) * 2.4;
        c.translate(0, bob);
        /* the herald's reach, drawn when beasts run fast nearby */
        c.save();
        c.globalAlpha = 0.05;
        c.lineWidth = 1.2;
        c.beginPath(); c.arc(0, 0, 200, 0, TAU); c.stroke();
        c.restore();
        /* the standard: a diamond flag on a short pole */
        c.rotate(Math.sin(e.t * 1.8 + e.seed) * 0.12);
        inkStroke(c, [{ x: 0, y: -r * 0.2 }, { x: 0, y: -r * 1.5 }], 1.8, { alpha: 0.9 });
        const flap = Math.sin(e.t * 7 + e.seed) * 0.14;
        c.save();
        c.translate(0, -r * 1.45);
        c.rotate(flap);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(r * 1.05, r * 0.28);
        c.lineTo(r * 0.95, r * 0.85);
        c.lineTo(0, r * 0.62);
        c.closePath();
        c.fill();
        c.restore();
        blobPath(c, 0, r * 0.45, r * 0.6, sd, 0.18, 9);
        c.fill();
        eyeSlits(c, 0, r * 0.6, 0.6);
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.24, 9);
        break;
      }
      case 'koi': { /* KOI — a long curve of ink that dives beneath the strokes */
        const div = e.diving;
        c.globalAlpha = div ? 0.3 : 0.95;
        c.rotate(e.ang);
        const bend = Math.sin(e.t * 4.2 + e.seed) * 0.3;
        /* body: an elongated teardrop, tail swinging */
        c.save();
        c.rotate(bend * 0.3);
        c.scale(1.55, 0.62);
        teardrop(c, r);
        c.fill();
        c.restore();
        /* tail fins: two strokes sweeping behind */
        inkStroke(c, [
          { x: -r * 1.2, y: 0 },
          { x: -r * 1.9, y: -r * 0.7 + bend * 4 },
          { x: -r * 2.3, y: -r * 0.4 + bend * 6 },
        ], 1.7, { alpha: div ? 0.3 : 0.85 });
        inkStroke(c, [
          { x: -r * 1.2, y: 0 },
          { x: -r * 1.9, y: r * 0.7 + bend * 4 },
          { x: -r * 2.3, y: r * 0.4 + bend * 6 },
        ], 1.7, { alpha: div ? 0.3 : 0.85 });
        /* a red crest, the one color it keeps */
        if (!div) {
          c.fillStyle = RED;
          c.globalAlpha = 0.85;
          c.beginPath();
          c.arc(r * 0.4, 0, 1.7, 0, TAU);
          c.fill();
        }
        silhouette = () => { c.save(); c.rotate(e.ang); c.scale(1.6, 0.68); teardrop(c, r * 1.1); c.restore(); };
        break;
      }
      case 'golem': { /* GOLEM — a folded colossus of pressed paper */
        const breathe = 1 + Math.sin(e.t * 1.5 + e.seed) * 0.03;
        c.save();
        c.rotate(Math.sin(e.t * 0.8 + e.seed) * 0.04);
        c.scale(breathe, breathe);
        /* angular body: a six-sided slab */
        c.beginPath();
        const gp = mulberry(sd >> 2);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + 0.3;
          const rr = r * (0.82 + gp() * 0.36);
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
        c.fill();
        c.save(); c.globalAlpha = 0.45; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.8;
        c.stroke();
        /* folded seams across the body */
        c.globalAlpha = 0.5;
        c.lineWidth = 1.3;
        c.beginPath(); c.moveTo(-r * 0.5, -r * 0.3); c.lineTo(r * 0.4, -r * 0.55); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.3, r * 0.4); c.lineTo(r * 0.5, r * 0.2); c.stroke();
        c.globalAlpha = 1;
        /* drips hanging from the seams */
        const drips = mulberry(sd >> 5);
        for (let i = 0; i < 2; i++) {
          const dx = (drips() - 0.5) * r;
          const len = r * (0.3 + drips() * 0.4) * (1 + Math.sin(t * 2.6 + i * 2) * 0.25);
          inkStroke(c, [
            { x: dx, y: r * 0.55 },
            { x: dx + 1, y: r * 0.55 + len },
          ], 2.6, { alpha: 0.8 });
        }
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 0.75);
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.16, 12);
        break;
      }

      /* ================ THE GUARDIANS ================ */
      case 'gildling': { /* GILDLING — a gold-dusted beetle, shelled and stubborn */
        const walk = Math.sin(e.t * 7 + e.seed);
        c.rotate(e.ang);
        /* legs: three quick strokes a side, scuttling */
        c.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) {
          const ly = i * r * 0.42;
          const kick = walk * (i === 0 ? 0 : 1.6);
          c.beginPath();
          c.moveTo(-r * 0.2, ly * 0.7); c.lineTo(-r * 0.9, ly + kick);
          c.stroke();
          c.beginPath();
          c.moveTo(r * 0.3, ly * 0.7); c.lineTo(r * 1.0, ly - kick);
          c.stroke();
        }
        /* the dome shell */
        blobPath(c, 0, 0, r, sd, 0.1, 12);
        c.fill();
        c.save(); c.globalAlpha = 0.35; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.2;
        blobPath(c, 0, 0, r, sd, 0.1, 12);
        c.stroke();
        /* the shell seam */
        inkStroke(c, [{ x: -r * 0.85, y: 0 }, { x: r * 0.55, y: 0 }], 1.6, { alpha: 0.8 });
        /* a fleck of gilt — this sheet's ink carries gold dust */
        c.fillStyle = RED;
        c.globalAlpha = 0.7;
        c.beginPath(); c.arc(r * 0.35, -r * 0.2, 1.7, 0, TAU); c.fill();
        c.globalAlpha = 1;
        c.fillStyle = INK;
        eyeSlits(c, 0, r, 0.65);
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.1, 12);
        break;
      }
      case 'gnat': { /* GNAT — a fleck of ink with two flickering wings */
        const fy = Math.sin(t * 38 + e.seed) * r * 0.5;
        blobPath(c, 0, 0, r, sd, 0.3, 7);
        c.fill();
        c.globalAlpha = 0.45;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(-r * 0.3, -r * 0.4); c.lineTo(-r * 1.7, -r * 1.1 - fy); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.3, r * 0.4); c.lineTo(-r * 1.7, r * 1.1 + fy); c.stroke();
        c.globalAlpha = 1;
        silhouette = () => blobPath(c, 0, 0, r * 1.2, sd, 0.3, 7);
        break;
      }
      case 'blotter': { /* BLOTTER — a thirsty sponge, rippling where it drank */
        const bl = e.bloat ? 1.22 : 1;
        const soakk = Math.min(1, (e.soak || 0) / 3);
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        c.save();
        c.scale(bl * (1 + soakk * 0.2), bl * (1 + soakk * 0.2));
        c.globalAlpha = 0.72;
        blobPath(c, 0, 0, r, sd, 0.26, 11);
        c.fill();
        /* wet ripples where each stroke went in */
        c.globalAlpha = 0.55;
        c.strokeStyle = PAPER;
        c.lineWidth = 1.1;
        const rip = mulberry(sd >> 1);
        for (let i = 0; i < (e.soak || 0); i++) {
          c.beginPath();
          c.arc((rip() - 0.5) * r, (rip() - 0.5) * r, 2.2 + rip() * 1.8, 0, TAU);
          c.stroke();
        }
        c.restore();
        c.globalAlpha = 1;
        eyeSlits(c, ang, r * bl, 0.5);
        silhouette = () => blobPath(c, 0, 0, r * bl * 1.12, sd, 0.26, 11);
        break;
      }
      case 'owl': { /* OWL — a horned watcher, eyes like paper moons */
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        c.rotate(ang);
        c.save();
        c.scale(0.92, 1.18);
        blobPath(c, 0, 0, r, sd, 0.14, 10);
        c.fill();
        c.globalAlpha = 0.35; c.fillStyle = patHatch; c.fill();
        c.restore();
        c.fillStyle = INK;
        /* horn tufts */
        inkStroke(c, [{ x: -r * 0.3, y: -r * 0.6 }, { x: -r * 0.55, y: -r * 1.3 }], 2.2, { alpha: 0.9, seed: sd });
        inkStroke(c, [{ x: r * 0.3, y: -r * 0.6 }, { x: r * 0.55, y: -r * 1.3 }], 2.2, { alpha: 0.9, seed: sd + 1 });
        /* the eyes: two pale moons that sometimes close */
        const blinkK = Math.sin(t * 1.7 + e.seed) > 0.97 ? 0.18 : 1;
        c.fillStyle = PAPER;
        c.globalAlpha = 0.95;
        c.beginPath(); c.arc(-r * 0.32, -r * 0.12, r * 0.3 * blinkK, 0, TAU); c.fill();
        c.beginPath(); c.arc(r * 0.32, -r * 0.12, r * 0.3 * blinkK, 0, TAU); c.fill();
        c.globalAlpha = 1;
        c.fillStyle = INK;
        c.beginPath(); c.arc(0, -r * 0.12, r * 0.11, 0, TAU); c.fill();
        silhouette = () => blobPath(c, 0, 0, r * 1.1, sd, 0.14, 10);
        break;
      }
      case 'smother': { /* SMOTHER — a flat stain that crawls, trailing damp */
        c.globalAlpha = 0.85;
        c.save();
        c.scale(1.5, 0.6);
        blobPath(c, 0, 0, r, sd, 0.3, 12);
        c.fill();
        c.restore();
        /* drips dragging behind its crawl */
        const drips = mulberry(sd >> 2);
        for (let i = 0; i < 4; i++) {
          const dx = (drips() - 0.5) * r * 2.2;
          const len = r * (0.3 + drips() * 0.5) * (1 + Math.sin(t * 2 + i * 1.7) * 0.3);
          inkStroke(c, [
            { x: dx, y: r * 0.35 },
            { x: dx + (drips() - 0.5) * 3, y: r * 0.35 + len },
          ], 2.4, { alpha: 0.5 });
        }
        c.globalAlpha = 1;
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r * 0.9, 0.5);
        silhouette = () => { c.save(); c.scale(1.5, 0.6); blobPath(c, 0, 0, r * 1.1, sd, 0.3, 12); c.restore(); };
        break;
      }
      case 'ashigaru': { /* ASHIGARU — a footsoldier of ink, spear leveled */
        c.rotate(e.ang);
        /* the spear: a long thin stroke ahead of the body */
        inkStroke(c, [
          { x: r * 0.2, y: -r * 0.5 },
          { x: r * 2.5, y: -r * 0.95 },
        ], 1.5, { alpha: 0.85, taper: 1.3, seed: sd });
        c.beginPath(); c.arc(r * 2.55, -r * 0.96, 1.4, 0, TAU); c.fill();
        /* the body */
        blobPath(c, 0, 0, r * 0.78, sd, 0.16, 9);
        c.fill();
        /* the jingasa: a shallow cone hat */
        c.beginPath();
        c.moveTo(-r * 0.75, -r * 0.5);
        c.quadraticCurveTo(0, -r * 1.4, r * 0.75, -r * 0.5);
        c.closePath();
        c.fill();
        silhouette = () => blobPath(c, 0, 0, r * 0.92, sd, 0.16, 9);
        break;
      }
      case 'stamper': { /* STAMPER — an ink block raising a red seal to press */
        const raising = e.state === 'raise';
        const lift = raising ? Math.min(1, e.stateT / 0.55) : 0;
        c.save();
        c.translate(0, -lift * 7);
        c.rotate(Math.sin(e.t * 1.4 + e.seed) * 0.05 + (raising ? Math.sin(e.stateT * 22) * 0.045 : 0));
        /* the block: a chunky seven-sided slab */
        c.beginPath();
        const spq = mulberry(sd >> 3);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + 0.2;
          const rr = r * (0.86 + spq() * 0.3);
          const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
          i ? c.lineTo(px, py) : c.moveTo(px, py);
        }
        c.closePath();
        c.fill();
        c.save(); c.globalAlpha = 0.4; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.4;
        c.stroke();
        /* the seal face it carries beneath — red, square, carved 印 */
        c.globalAlpha = raising ? 0.95 : 0.7;
        c.fillStyle = RED;
        c.fillRect(-r * 0.34, r * 0.5, r * 0.68, r * 0.68);
        c.fillStyle = PAPER;
        c.font = Math.round(r * 0.46) + 'px "Zen Antique", serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('印', 0, r * 0.5 + r * 0.34 + 1);
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.06, sd, 0.2, 12);
        break;
      }
      case 'surge': { /* SURGE — a wave that curls as it builds, and breaks */
        const crest = e.state === 'break' ? 1.22 : e.state === 'rise' ? 1.08 : 0.95;
        c.rotate(e.ang);
        c.save();
        c.scale(crest * 1.35, crest * 0.75);
        teardrop(c, r);
        c.fill();
        c.restore();
        /* the curl hooking off the crest */
        const cy = e.state === 'cruise' ? -r * 0.35 : -r * 0.75;
        inkStroke(c, [
          { x: r * 0.9, y: -r * 0.1 },
          { x: r * 1.15, y: cy * 0.6 },
          { x: r * 0.8, y: cy },
        ], 2.6, { alpha: 0.75, seed: sd });
        /* spray while it breaks */
        if (e.state === 'break') {
          const spray = mulberry(sd >> 2);
          c.globalAlpha = 0.6;
          for (let i = 0; i < 4; i++) {
            c.save();
            c.translate(r * (0.9 + spray() * 0.8), -r * (0.4 + spray() * 0.9));
            c.rotate(spray() * TAU);
            teardrop(c, r * 0.14);
            c.fill();
            c.restore();
          }
          c.globalAlpha = 1;
        }
        silhouette = () => { c.save(); c.scale(crest * 1.4, crest * 0.8); teardrop(c, r * 1.08); c.restore(); };
        break;
      }
      case 'maelstrom': { /* MAELSTROM — a slow spiral that draws all things in */
        const spin = e.t * 1.7;
        c.globalAlpha = 0.9;
        c.lineWidth = 2.6;
        for (let i = 0; i < 3; i++) {
          const a0 = spin + i * 2.09;
          c.beginPath();
          c.arc(0, 0, r * (0.4 + i * 0.3), a0, a0 + 2.4);
          c.stroke();
        }
        /* the reach of the undertow: faint strokes drifting inward */
        c.globalAlpha = 0.1;
        c.lineWidth = 1.1;
        for (let i = 0; i < 8; i++) {
          const a = spin * 0.5 + (i / 8) * TAU;
          c.beginPath();
          c.moveTo(Math.cos(a) * 250, Math.sin(a) * 250);
          c.lineTo(Math.cos(a + 0.14) * 198, Math.sin(a + 0.14) * 198);
          c.stroke();
        }
        c.globalAlpha = 1;
        silhouette = () => blobPath(c, 0, 0, r * 0.62, sd, 0.3, 9);
        break;
      }
      case 'mirror': { /* MIRROR — a gilt frame holding a sheet of pale glass */
        c.rotate(e.ang);
        blobPath(c, 0, 0, r, sd, 0.14, 10);
        c.fill();
        /* the glass: a tall pale rectangle, a shine across it */
        c.save();
        c.globalAlpha = 0.42;
        c.fillStyle = PAPER;
        c.fillRect(-r * 0.5, -r * 0.95, r, r * 1.9);
        c.restore();
        c.lineWidth = 1.6;
        c.strokeRect(-r * 0.5, -r * 0.95, r, r * 1.9);
        inkStroke(c, [
          { x: -r * 0.28, y: -r * 0.6 },
          { x: r * 0.3, y: r * 0.1 },
        ], 1.4, { alpha: 0.5, color: PAPER });
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.14, 10);
        break;
      }
      case 'koban': { /* KOBAN — a coin of pressed ink that flees the hand */
        c.rotate(e.ang);
        c.save();
        c.scale(1.28, 0.8);
        blobPath(c, 0, 0, r, sd, 0.12, 10);
        c.fill();
        c.restore();
        /* the gilt rim — this sheet's ink carries gold */
        c.globalAlpha = 0.7;
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, r * 0.42, 0, TAU); c.stroke();
        c.globalAlpha = 1;
        silhouette = () => { c.save(); c.scale(1.3, 0.85); blobPath(c, 0, 0, r * 1.1, sd, 0.12, 10); c.restore(); };
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r * 0.8, 0.55);
        break;
      }
      case 'b_wheel': case 'k_blight': { /* THE STAIN / THE BLIGHT — a rolling sea of ink */
        const st2 = e.state;
        const swell = st2 === 'windup' ? 1 + Math.min(1, e.stateT / 0.7) * 0.24 : 1;
        c.rotate(e.t * 0.5);
        c.save();
        c.scale(swell, swell);
        blobPath(c, 0, 0, r, sd, 0.1, 18);
        c.fill();
        c.save(); c.globalAlpha = 0.4; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 3.4;
        blobPath(c, 0, 0, r, sd, 0.1, 18);
        c.stroke();
        /* a ring of orbiting blots — the stain's tide */
        for (let i = 0; i < 5; i++) {
          const oa = e.t * 1.6 + (i / 5) * TAU;
          c.beginPath();
          c.arc(Math.cos(oa) * (r * 1.35), Math.sin(oa) * (r * 1.35), 4.2, 0, TAU);
          c.fill();
        }
        /* heavy drips */
        const drips = mulberry(sd >> 3);
        for (let i = 0; i < 6; i++) {
          const dx = (drips() - 0.5) * r * 1.6;
          const len = r * (0.2 + drips() * 0.4) * (1 + Math.sin(t * 2.2 + i * 1.6) * 0.3);
          inkStroke(c, [
            { x: dx, y: r * 0.75 },
            { x: dx + (drips() - 0.5) * 4, y: r * 0.75 + len },
          ], 3.4, { alpha: 0.85 });
        }
        c.restore();
        c.rotate(-e.t * 0.5);
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 0.9);
        silhouette = () => blobPath(c, 0, 0, r * swell * 1.05, sd, 0.1, 18);
        break;
      }
      case 'b_mother': case 'k_husk': { /* THE NIGHT MOTHER / THE HUSK — a hole in the paper with eyes */
        const breathe = 1 + Math.sin(e.t * 1.4 + e.seed) * 0.05;
        c.save();
        c.scale(breathe, 2 - breathe);
        /* a ragged aura of flecks forever dissolving */
        const rnd = mulberry(sd >> 2);
        for (let i = 0; i < 7; i++) {
          const fa = rnd() * TAU + e.t * 0.4, fd = r * (1.2 + rnd() * 0.8);
          c.save();
          c.globalAlpha = 0.2 + 0.2 * Math.sin(e.t * 3 + i);
          c.translate(Math.cos(fa) * fd, Math.sin(fa) * fd);
          c.rotate(fa);
          teardrop(c, r * 0.16);
          c.fill();
          c.restore();
        }
        c.globalAlpha = 0.88;
        blobPath(c, 0, 0, r, sd, 0.24, 14);
        c.fill();
        c.globalAlpha = 1;
        c.lineWidth = 2.2;
        blobPath(c, 0, 0, r * 0.94, sd ^ 61, 0.26, 14);
        c.stroke();
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 1.15);
        silhouette = () => blobPath(c, 0, 0, r * 1.1, sd, 0.24, 14);
        break;
      }
      case 'b_warlord': case 'k_cinder': { /* THE CINNABAR ONI / THE CINDER — four horns and a furnace chest */
        const st2 = e.state;
        const enraged = e.hp < e.maxHp * 0.5;
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        if (st2 === 'windup') {
          const jit = (Math.random() - 0.5) * 3.4;
          c.translate(jit, jit);
        }
        if (st2 === 'charge') {
          c.rotate(e.ang);
          c.scale(1.5, 0.75);
          blobPath(c, 0, 0, r, sd, 0.11, 14);
          c.fill();
          c.globalAlpha = 0.4;
          c.lineWidth = 2.2;
          c.beginPath(); c.moveTo(-r * 1.1, -r * 0.5); c.lineTo(-r * 2.4, -r * 0.8); c.stroke();
          c.beginPath(); c.moveTo(-r * 1.1, r * 0.5); c.lineTo(-r * 2.4, r * 0.8); c.stroke();
        } else {
          c.save();
          c.rotate(ang);
          const breathe = 1 + Math.sin(e.t * 2.4 + e.seed) * 0.03;
          c.scale(breathe, breathe);
          blobPath(c, 0, 0, r, sd, 0.1, 14);
          c.fill();
          c.save(); c.globalAlpha = 0.4; c.fillStyle = patHatch; c.fill(); c.restore();
          if (enraged) {
            c.save(); c.globalAlpha = 0.22; c.fillStyle = RED; blobPath(c, 0, 0, r, sd, 0.1, 14); c.fill(); c.restore();
          }
          c.lineWidth = 3;
          blobPath(c, 0, 0, r, sd, 0.1, 14);
          c.stroke();
          /* four horns, two pairs */
          for (const s of [-1, 1]) {
            inkStroke(c, [
              { x: -r * 0.1, y: s * r * 0.7 },
              { x: r * 0.05, y: s * r * 1.2 },
              { x: r * 0.4, y: s * r * 1.5 },
            ], 3, { alpha: 0.95 });
            inkStroke(c, [
              { x: -r * 0.45, y: s * r * 0.5 },
              { x: -r * 0.45, y: s * r * 1.05 },
              { x: -r * 0.15, y: s * r * 1.35 },
            ], 2.4, { alpha: 0.9 });
          }
          eyeSlits(c, 0, r, 0.8);
          c.restore();
        }
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.11, 14);
        break;
      }
      case 'b_tempest': case 'k_veil': { /* THE STORM EYE / THE RAINVEIL — a spiral with a hollow center */
        const spin = e.t * 2.6;
        c.save();
        /* three rotating arc-strokes */
        c.globalAlpha = 0.85;
        c.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(0, 0, r * (0.55 + i * 0.26), spin + i * 2.1, spin + i * 2.1 + 3.6);
          c.stroke();
        }
        /* the eye: a paper hollow */
        c.fillStyle = PAPER;
        c.beginPath();
        c.arc(0, 0, r * 0.4, 0, TAU);
        c.fill();
        c.strokeStyle = INK;
        c.lineWidth = 2;
        blobPath(c, 0, 0, r * 0.42, sd, 0.2, 10);
        c.stroke();
        /* rain streaks feeding the spiral */
        c.globalAlpha = 0.3;
        for (let i = 0; i < 5; i++) {
          const a = spin * 1.6 + (i / 5) * TAU;
          inkStroke(c, [
            { x: Math.cos(a) * r * 1.8, y: Math.sin(a) * r * 1.8 },
            { x: Math.cos(a + 0.5) * r * 1.15, y: Math.sin(a + 0.5) * r * 1.15 },
          ], 1.8, { alpha: 1 });
        }
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.18, 12);
        break;
      }
      case 'b_origin': case 'k_nib': { /* THE FIRST BRUSH / THE NIB — the eldest stroke, bristling */
        const phase = e.hp < e.maxHp * 0.33 ? 2 : e.hp < e.maxHp * 0.66 ? 1 : 0;
        const breathe = 1 + Math.sin(e.t * 1.8 + e.seed) * 0.035;
        c.save();
        c.scale(breathe, breathe);
        /* the head: a great blot */
        blobPath(c, 0, 0, r * 0.8, sd, 0.12, 14);
        c.fill();
        c.save(); c.globalAlpha = 0.42; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 3;
        blobPath(c, 0, 0, r * 0.8, sd, 0.12, 14);
        c.stroke();
        /* the bristle tail: sweeping strokes behind, lashing with phase */
        for (let i = 0; i < 4; i++) {
          const la = Math.PI * 0.72 + i * 0.12 + Math.sin(e.t * 3 + i) * (0.1 + phase * 0.06);
          inkStroke(c, [
            { x: -r * 0.4, y: 0 },
            { x: Math.cos(la) * r * 1.5, y: Math.sin(la) * r * 1.5 * (i % 2 ? 1 : -1) },
            { x: Math.cos(la) * r * 2.1, y: Math.sin(la) * r * 2.2 * (i % 2 ? 1 : -1) },
          ], 2.6, { alpha: 0.8 });
        }
        if (phase > 0) {
          /* a paper seal burns where its heart would be — pressed red
             when the beast is calm, bleeding red when it is not */
          c.save();
          c.rotate(Math.sin(e.t * 2) * 0.1 - 0.1);
          c.globalAlpha = phase === 2 ? 0.95 : 0.6;
          c.fillStyle = PAPER;
          const s2 = r * 0.2;
          c.fillRect(-s2, -s2, s2 * 2, s2 * 2);
          c.fillStyle = phase === 2 ? BOSS_INK : RED;
          const s3 = s2 * 0.45;
          c.fillRect(-s3, -s3, s3 * 2, s3 * 2);
          c.restore();
        }
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r * 0.8, 1.05);
        silhouette = () => blobPath(c, 0, 0, r * 0.86, sd, 0.14, 14);
        break;
      }
      default: { /* BLIP — a shard of the drip */
        blobPath(c, 0, 0, r, sd, 0.24, 9);
        c.fill();
        silhouette = () => blobPath(c, 0, 0, r * 1.1, sd, 0.24, 9);
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 0.7);
      }
    }

    /* a wounded boss burns — its red halo beats like a second heart */
    if (isBoss && e.hp < e.maxHp * 0.5) {
      c.save();
      c.globalAlpha = S.reduced ? 0.16 : 0.2 + 0.13 * Math.sin(t * 9);
      c.strokeStyle = BOSS_INK;
      c.lineWidth = 2.6;
      blobPath(c, 0, 0, r * (1.3 + 0.05 * Math.sin(t * 6.3)), sd ^ 91, 0.16, 14);
      c.stroke();
      c.restore();
    }

    /* the guardian's mark */
    if (e.elite) eliteMark(c, r);

    /* wet paper: slowed creatures wear a drooping halo */
    if (e.slowT > 0 && e.type !== 'shade') {
      c.save();
      c.globalAlpha = Math.min(0.5, e.slowT) * 0.6;
      c.strokeStyle = INK;
      c.lineWidth = 1.3;
      blobPath(c, 0, 0, r * 1.32, sd ^ 77, 0.2, 9);
      c.stroke();
      c.restore();
    }

    /* hit flash: the ink recoils to paper */
    if (e.hitFlash > 0 && silhouette) {
      c.save();
      c.globalAlpha = Math.min(1, e.hitFlash / 0.08) * 0.92;
      c.fillStyle = PAPER;
      const sc = 1 + e.hitFlash * 1.6;
      c.scale(sc, sc);
      silhouette();
      c.fill();
      c.restore();
    }
    c.restore();
  }

  /* folded-paper crane silhouette (body + raised wing), flap ∈ [-1,1] */
  function cranePath(c, r, flap) {
    const w = r * (0.95 + flap * 0.4);
    c.beginPath();
    c.moveTo(r * 1.55, 0);            /* beak */
    c.lineTo(-r * 0.05, -r * 0.3);    /* neck ridge */
    c.lineTo(-r * 0.45, -w);          /* wing tip */
    c.lineTo(-r * 0.95, -r * 0.22);   /* wing root */
    c.lineTo(-r * 1.5, -r * 0.05);    /* tail point */
    c.lineTo(-r * 0.6, r * 0.3);      /* under-tail */
    c.lineTo(r * 0.25, r * 0.4);      /* belly */
    c.closePath();
  }

  /* ---------------- the wielded brush ----------------
     A held brush pointing along +x: bamboo shaft, thread
     wrap, bristles shaped by the chosen tool. Shared by
     the player spirit and the title-screen previews. */
  function drawBrushTool(c, type, o = {}) {
    const len = o.len ?? 1;
    const A = o.alpha ?? 1;
    const ink = o.ink ?? INK;
    const paper = o.paper ?? PAPER;
    c.save();
    c.lineCap = 'round';
    c.strokeStyle = ink;

    /* ---- the shaft: a bamboo spine, two segments and a node ---- */
    c.globalAlpha = A * 0.92;
    c.lineWidth = 3 * len;
    c.beginPath();
    c.moveTo(-17.5 * len, -1.3 * len);
    c.quadraticCurveTo(-11 * len, -0.9 * len, -4.8 * len, -0.2 * len);
    c.stroke();
    /* the node ring where two culms meet */
    c.globalAlpha = A * 0.5;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-11.4 * len, -2.5 * len);
    c.quadraticCurveTo(-10.9 * len, -1.2 * len, -11.2 * len, 0.3 * len);
    c.stroke();
    /* a dry highlight along the top of the shaft */
    c.globalAlpha = A * 0.28;
    c.strokeStyle = paper;
    c.lineWidth = 0.9;
    c.beginPath();
    c.moveTo(-16.6 * len, -2.2 * len);
    c.quadraticCurveTo(-11 * len, -1.7 * len, -5.6 * len, -0.9 * len);
    c.stroke();
    c.strokeStyle = ink;

    /* ---- the ferrule: thread wrap binding the hairs ---- */
    c.globalAlpha = A;
    c.lineWidth = 3.9 * len;
    c.beginPath();
    c.moveTo(-4.7 * len, -0.2 * len);
    c.lineTo(-2.3 * len, 0);
    c.stroke();
    /* thread diagonals across the wrap */
    c.globalAlpha = A * 0.55;
    c.lineWidth = 0.8;
    for (const tt of [-3.9, -3.1]) {
      c.beginPath();
      c.moveTo(tt * len, -1.7 * len);
      c.lineTo((tt + 1.1) * len, 1.6 * len);
      c.stroke();
    }

    /* ---- the bristles: a true brush belly with hairs and a wet tip ---- */
    c.fillStyle = ink;
    const hairs = (pts, w, a, seed) =>
      inkStroke(c, pts, w, { alpha: a, taper: 0.6, seed, color: ink });
    if (type === 'broom') {
      /* 掃 — the wide wash brush: a broad fan of splayed hair */
      c.globalAlpha = A * 0.9;
      c.beginPath();
      c.moveTo(-2.3 * len, -3.1 * len);
      c.quadraticCurveTo(3.2 * len, -4.9 * len, 7.2 * len, -3.4 * len);
      c.quadraticCurveTo(8.3 * len, 0, 7.2 * len, 3.4 * len);
      c.quadraticCurveTo(3.2 * len, 4.9 * len, -2.3 * len, 3.1 * len);
      c.closePath();
      c.fill();
      c.globalAlpha = A * 0.75;
      for (const hy of [-2.6, -1.1, 0.4, 1.9, 3]) {
        hairs([
          { x: -1.6 * len, y: hy * 0.8 * len },
          { x: 2.6 * len, y: hy * 1.12 * len },
          { x: 6.9 * len, y: hy * 1.18 * len },
        ], 1.1, 1, 71 + hy * 9);
      }
      /* comb gaps where the wide brush parts */
      c.globalAlpha = A * 0.3;
      c.strokeStyle = paper;
      c.lineWidth = 0.85;
      for (const yy of [-1.5, 0.4, 2.1]) {
        c.beginPath();
        c.moveTo(-0.6 * len, yy * len);
        c.lineTo(5.8 * len, yy * len * 1.3);
        c.stroke();
      }
    } else if (type === 'stone') {
      /* 岩 — the heavy brush: short thick belly, blunt pressing shoe */
      c.globalAlpha = A * 0.92;
      c.beginPath();
      c.moveTo(-2.5 * len, -2.9 * len);
      c.quadraticCurveTo(3.4 * len, -3.4 * len, 5.1 * len, -1.4 * len);
      c.quadraticCurveTo(6.2 * len, 0, 5.1 * len, 1.4 * len);
      c.quadraticCurveTo(3.4 * len, 3.4 * len, -2.5 * len, 2.9 * len);
      c.closePath();
      c.fill();
      c.globalAlpha = A * 0.88;
      c.beginPath();
      c.arc(4.6 * len, 0, 1.7 * len, 0, TAU);
      c.fill();
      c.globalAlpha = A * 0.8;
      for (const hy of [-1.7, -0.5, 0.7, 1.9]) {
        hairs([
          { x: -1.4 * len, y: hy * 0.85 * len },
          { x: 2 * len, y: hy * len },
          { x: 4.9 * len, y: hy * 0.6 * len },
        ], 1.2, 1, 81 + hy * 7);
      }
      /* the stone ferrule band */
      c.globalAlpha = A * 0.5;
      c.strokeStyle = paper;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(3.6 * len, -2.1 * len);
      c.quadraticCurveTo(4.4 * len, 0, 3.6 * len, 2.1 * len);
      c.stroke();
    } else {
      /* 細 — the needle: one long fine point that barely lifts */
      c.globalAlpha = A * 0.92;
      c.beginPath();
      c.moveTo(-2.4 * len, -1.9 * len);
      c.quadraticCurveTo(2.6 * len, -1.6 * len, 6.4 * len, -0.7 * len);
      c.quadraticCurveTo(9.2 * len, -0.2 * len, 10.4 * len, 0);
      c.quadraticCurveTo(9.2 * len, 0.2 * len, 6.4 * len, 0.7 * len);
      c.quadraticCurveTo(2.6 * len, 1.6 * len, -2.4 * len, 1.9 * len);
      c.closePath();
      c.fill();
      c.globalAlpha = A * 0.8;
      for (const hy of [-1.2, -0.4, 0.4, 1.2]) {
        hairs([
          { x: -1.6 * len, y: hy * 0.9 * len },
          { x: 3.4 * len, y: hy * 0.62 * len },
          { x: 9.6 * len, y: hy * 0.1 * len },
        ], 0.9, 1, 91 + hy * 11);
      }
      /* the last hairs gather to the single point */
      c.globalAlpha = A * 0.65;
      hairs([{ x: 7 * len, y: -0.3 * len }, { x: 11.6 * len, y: 0 }], 0.8, 1, 97);
    }

    /* wet ink gathering at the tip */
    if ((o.wet ?? 0) > 0.02) {
      c.globalAlpha = A * 0.85 * o.wet;
      const tx = type === 'broom' ? 6.4 : type === 'stone' ? 4.9 : 9.6;
      blobPath(c, tx * len, 0, (type === 'stone' ? 2.3 : type === 'broom' ? 2.4 : 1.35) * len, (o.seed ?? 5) | 0, 0.3, 8);
      c.fill();
    }
    c.restore();
  }

  /* ---------------- player: the brush spirit ----------------
     A living drop of ink that carries the chosen brush.
     It leans into the run, squashes on each stroke, and
     its single paper eye narrows in concentration. */
  function drawPlayer(c, t) {
    const S = G.S;
    const p = S.player;
    /* the hurt-flicker: the scribe shivers, he never vanishes —
       the old 18 Hz dip to 0.25 read as the figure leaving the sheet */
    const blink = S.invulnT > 0 && Math.floor(t * 11) % 2 === 0;
    /* the arrival: the scribe rises out of the ink pool the opening
       wash leaves behind — growing with a back-out settle */
    const ap = S.arrived ? 1 : Math.max(0, Math.min(1, (1.42 - S.beginT) / 0.5));
    const tick = Math.floor(t / CFG.ink.boilRate);
    const sd = ((p.x * 31 + p.y * 17) | 0) ^ (tick * 7919);
    /* motion reads from the true velocity, so the tail and the lean
       follow the glide — not the keypress */
    const vx = p.vx || 0, vy = p.vy || 0;
    const spd = Math.hypot(vx, vy);
    const mv = Math.min(1, spd / (CFG.player.speed * 1.02));
    const rc = p.recoil > 0 ? p.recoil : 0;
    const type = S.brush || 'needle';

    /* ink trail: the brush never leaves the paper clean */
    if (S.mode === 'playing' && mv > 0.15 && t - lastTrailT > CFG.ink.trailGap && !S.reduced) {
      lastTrailT = t;
      S.stainQueue.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + (Math.random() - 0.5) * 6, r: 2.2, alpha: 0.15 });
    }

    /* comet tail, streaming behind the motion */
    if (spd > 26 && ap > 0.6) {
      const a = Math.atan2(-vy, -vx);
      const len = 9 + 10 * mv;
      const sway = Math.sin(t * 9) * 2.2;
      const x0 = p.x + Math.cos(a) * p.r * 0.5, y0 = p.y + Math.sin(a) * p.r * 0.5;
      inkStroke(c, [
        { x: x0, y: y0 },
        { x: x0 + Math.cos(a) * len * 0.55 - Math.sin(a) * sway, y: y0 + Math.sin(a) * len * 0.55 + Math.cos(a) * sway },
        { x: x0 + Math.cos(a) * len, y: y0 + Math.sin(a) * len },
      ], 7, { alpha: blink ? 0.5 : 0.85, taper: 1.1, seed: sd });
    }

    c.save();
    c.globalAlpha = blink ? 0.55 : 1;
    const back = rc * 2.4;
    c.translate(p.x - Math.cos(p.aim) * back, p.y - Math.sin(p.aim) * back);
    if (ap < 1) {
      const b = ap - 1;
      const ae = 1 + 2.70158 * b * b * b + 1.70158 * b * b;   /* back-out ease */
      c.globalAlpha *= 0.15 + 0.85 * ap;
      c.translate(0, (1 - ap) * 10);
      c.scale(0.55 + 0.45 * ae, 0.55 + 0.45 * ae);
    }

    /* adrenaline speed ticks */
    if (S.adrenT > 0 && !blink) {
      const ma = spd > 20 ? Math.atan2(-vy, -vx) : p.aim + Math.PI;
      c.save();
      c.globalAlpha = 0.4;
      for (const off of [-0.5, 0.5]) {
        const a = ma + off;
        inkStroke(c, [
          { x: Math.cos(a) * 13, y: Math.sin(a) * 13 },
          { x: Math.cos(a) * 21, y: Math.sin(a) * 21 },
        ], 2.2, { alpha: 0.5 });
      }
      c.restore();
    }

    /* the body — a small robed scribe of living ink, upright,
       leaning into the stride, its kasa rocking with the run */
    const lean = mv > 0.08 ? Math.atan2(vy, vx) : 0;
    const sqx = 1 + rc * 0.08, sqy = 1 - rc * 0.06;
    const bob = Math.sin(t * 10.5) * 1.5 * mv;
    const rr = p.r;
    c.save();
    c.rotate(lean * 0.1 * mv);
    c.translate(0, bob);
    c.scale(sqx, sqy);

    /* a soft ink shadow grounds the figure on the sheet */
    c.save();
    c.scale(1, 0.4);
    c.globalAlpha = (blink ? 0.5 : 1) * 0.15;
    blobPath(c, 0, rr * 1.6, rr * 0.95, sd ^ 3, 0.2, 9);
    c.fillStyle = INK;
    c.fill();
    c.restore();

    /* the robe: a brush-cut cone, hem bitten ragged, flaring behind */
    c.save();
    c.rotate(Math.sin(t * 7.3) * 0.06 * (0.3 + mv));
    c.fillStyle = INK;
    c.globalAlpha = blink ? 0.55 : 1;
    c.beginPath();
    c.moveTo(-rr * 0.52, -rr * 0.72);
    c.quadraticCurveTo(-rr * 0.78, rr * 0.3, -rr * 0.92, rr * 1.02);
    c.lineTo(-rr * 0.55, rr * 0.92);
    c.lineTo(-rr * 0.3, rr * 1.05);
    c.lineTo(0, rr * 0.9);
    c.lineTo(rr * 0.3, rr * 1.06);
    c.lineTo(rr * 0.58, rr * 0.92);
    c.lineTo(rr * 0.95, rr * 1.03);
    c.quadraticCurveTo(rr * 0.8, rr * 0.3, rr * 0.52, -rr * 0.72);
    c.quadraticCurveTo(0, -rr * 1.02, -rr * 0.52, -rr * 0.72);
    c.closePath();
    c.fill();
    /* dry creases down the robe */
    c.globalAlpha = (blink ? 0.55 : 1) * 0.28;
    c.strokeStyle = PAPER;
    c.lineWidth = 1.1;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-rr * 0.3, -rr * 0.2);
    c.quadraticCurveTo(-rr * 0.42, rr * 0.5, -rr * 0.36, rr * 0.95);
    c.stroke();
    c.beginPath();
    c.moveTo(rr * 0.34, -rr * 0.16);
    c.quadraticCurveTo(rr * 0.5, rr * 0.42, rr * 0.42, rr * 0.95);
    c.stroke();
    /* the obi — a pale sash at the waist, knot at the back */
    c.globalAlpha = (blink ? 0.55 : 1) * 0.8;
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-rr * 0.55, rr * 0.22);
    c.quadraticCurveTo(0, rr * 0.38, rr * 0.55, rr * 0.22);
    c.stroke();
    c.globalAlpha = blink ? 0.55 : 1;
    c.fillStyle = INK;
    c.beginPath(); c.arc(-rr * 0.3, rr * 0.32, 2.1, 0, TAU); c.fill();
    c.restore();

    /* the head */
    c.globalAlpha = blink ? 0.55 : 1;
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, -rr * 1.06, rr * 0.5, 0, TAU);
    c.fill();

    /* the kasa — a wide shallow hat, rocking with the stride */
    c.save();
    c.translate(0, -rr * 1.16);
    c.rotate(Math.sin(t * 5.2) * 0.06 * (0.4 + mv) + lean * 0.05 * mv);
    c.beginPath();
    c.ellipse(0, 0, rr * 1.06, rr * 0.4, 0, 0, TAU);
    c.fill();
    c.globalAlpha = (blink ? 0.55 : 1) * 0.45;
    c.strokeStyle = PAPER;
    c.lineWidth = 0.9;
    c.beginPath();
    c.ellipse(0, -rr * 0.06, rr * 0.6, rr * 0.19, 0, Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
    c.globalAlpha = blink ? 0.55 : 1;
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, -rr * 0.36, 1.7, 0, TAU);
    c.fill();
    c.restore();

    /* the eyes — two pale slits under the brim, toward the aim */
    {
      const el2 = rc > 0.4 ? 3.1 : 2.4;
      const exOff = Math.cos(p.aim) * rr * 0.18;
      const eyY = -rr * 0.9 + Math.sin(p.aim) * rr * 0.08;
      c.globalAlpha = (blink ? 0.55 : 1) * 0.95;
      c.strokeStyle = PAPER;
      c.lineCap = 'round';
      c.lineWidth = 1.5;
      for (const s of [-1, 1]) {
        const xx = exOff + s * rr * 0.21;
        c.beginPath();
        c.moveTo(xx - el2 / 2, eyY);
        c.lineTo(xx + el2 / 2, eyY);
        c.stroke();
      }
    }
    c.restore();

    /* the held brush — two-handed on the aim line, kicked back by
       the last stroke, a sleeve reaching out to the shaft */
    c.save();
    /* on arrival the brush spins once around the wrist, easing still */
    c.rotate(p.aim - (1 - ap) * 5.2);
    const kick = -rc * 3.4;
    c.translate(rr * 1.02 + kick, -rr * 0.42);
    c.globalAlpha = (blink ? 0.6 : 1) * 0.88;
    inkStroke(c, [
      { x: -rr * 1.05, y: -rr * 0.18 },
      { x: -rr * 0.55, y: -rr * 0.05 },
      { x: -4.5, y: 0.2 },
    ], 5, { alpha: 1, taper: 0.45, seed: sd });
    drawBrushTool(c, type, { len: 1.02, wet: rc > 0.4 ? 0.9 : 0.22, seed: sd, alpha: blink ? 0.65 : 1 });
    /* the grip hand over the shaft */
    c.globalAlpha = (blink ? 0.6 : 1) * 0.95;
    c.fillStyle = INK;
    blobPath(c, -7.2, -0.4, 3.1, sd ^ 7, 0.25, 8);
    c.fill();
    /* the flick: wet ink thrown from the tip right after the stroke */
    if (rc > 0.5 && !S.reduced) {
      c.globalAlpha = Math.min(1, (rc - 0.5) * 2.6) * (blink ? 0.65 : 1);
      c.fillStyle = INK;
      c.save();
      c.translate(12.5, -0.5);
      c.rotate(0.35);
      teardrop(c, 2.7);
      c.fill();
      c.restore();
    }
    c.restore();

    if (S.invulnT > 0) {
      c.globalAlpha = (blink ? 0.55 : 1) * 0.5;
      c.strokeStyle = INK;
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(0, 0, p.r + 4.5, 0, TAU); c.stroke();
      c.globalAlpha = blink ? 0.55 : 1;
    }

    const st = S.stats;

    /* ink orbit: droplets circling the brush */
    if (st && st.orb > 0) {
      const orbR = CFG.orbit.radius(st.orb);
      const base = S.clockT || t;
      c.save();
      c.globalAlpha = (blink ? 0.5 : 1) * 0.1;
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.beginPath(); c.arc(0, 0, orbR, 0, TAU); c.stroke();
      c.restore();
      for (let i = 0; i < st.orb; i++) {
        const a = base * CFG.orbit.speed + (i / st.orb) * TAU;
        const ox = Math.cos(a) * orbR, oy = Math.sin(a) * orbR;
        c.save();
        c.translate(ox, oy);
        c.rotate(a + Math.PI / 2);
        c.globalAlpha = (blink ? 0.6 : 1) * 0.95;
        c.fillStyle = INK;
        teardrop(c, 3.6);
        c.fill();
        c.globalAlpha = (blink ? 0.5 : 1) * 0.3;
        inkStroke(c, [{ x: -6, y: 0 }, { x: -13, y: 0.4 }], 1.8, { alpha: 1 });
        c.restore();
      }
    }

    /* paper ward: a talisman that hangs at the brush's back */
    if (st && st.ward) {
      const ready = st.wardCd <= 0;
      const wa = p.aim + Math.PI;
      c.save();
      c.translate(Math.cos(wa) * (p.r + 12), Math.sin(wa) * (p.r + 12) - 2);
      c.rotate(Math.sin(t * 1.7) * 0.14 - 0.35);
      c.globalAlpha = (blink ? 0.6 : 1) * (ready ? 0.9 : 0.2);
      c.strokeStyle = INK;
      c.lineWidth = 1.4;
      c.strokeRect(-4, -6.5, 8, 13);
      if (ready) { c.fillStyle = RED; c.fillRect(-1.6, -1.6, 3.2, 3.2); }
      c.restore();
    }

    c.restore();
  }

  /* ---------------- projectiles, zones, fx ---------------- */
  function drawBullet(c, b) {
    c.save();
    c.translate(b.x, b.y);
    if (b.kind === 'blade') { /* a folded paper blade, spinning */
      c.rotate(b.ang + b.age * b.spin);
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(9, 0);
      c.lineTo(-5, 4.6);
      c.lineTo(-2.2, 0);
      c.lineTo(-5, -4.6);
      c.closePath();
      c.fill();
      c.strokeStyle = PAPER;
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(6.5, 0); c.lineTo(-3, 0);
      c.stroke();
    } else if (b.brush === 'needle') {
      /* a fine calligraphy dash — fast, light, barely there */
      c.rotate(b.ang + Math.sin(b.age * 21 + b.seed) * 0.05);
      inkStroke(c, [
        { x: 8, y: 0.5 }, { x: 0, y: -0.4 }, { x: -7.5, y: 0.2 },
      ], 2.6, { alpha: 0.95, taper: 1.5, seed: (b.seed ?? 7) ^ 3 });
      inkStroke(c, [{ x: -6.5, y: 0 }, { x: -16 - b.age * 10, y: 0.5 }], 1.3, { alpha: 0.34 });
    } else if (b.brush === 'broom') {
      /* a wide swatch of ink, dry hairs splitting at the edges */
      c.rotate(b.ang);
      inkStroke(c, [
        { x: 6.6, y: 1.7 }, { x: -0.6, y: -0.5 }, { x: -7.6, y: 0.5 },
      ], 8.4, { alpha: 0.94, taper: 1.1, seed: b.seed ?? 7, dry: true });
      c.globalAlpha = 0.8;
      c.fillStyle = INK;
      c.save(); c.translate(2.4, -4.8); c.rotate(-0.7); teardrop(c, 1.8); c.fill(); c.restore();
      c.save(); c.translate(-3.2, 4.6); c.rotate(2.4); teardrop(c, 1.5); c.fill(); c.restore();
      inkStroke(c, [{ x: -8, y: 0 }, { x: -15 - b.age * 7, y: 0.4 }], 2.6, { alpha: 0.26 });
    } else if (b.brush === 'stone') {
      /* a heavy blot with a dense heart that refuses to scatter */
      c.rotate(b.ang);
      c.fillStyle = INK;
      blobPath(c, 0, 0, 5.6, b.seed ?? 7, 0.22, 9);
      c.fill();
      c.globalAlpha = 0.8;
      blobPath(c, 1, 0.5, 3.1, (b.seed ?? 7) ^ 9, 0.34, 8);
      c.fill();
      c.globalAlpha = 0.7;
      c.save(); c.translate(-2.6, 4.8); c.rotate(1.9); teardrop(c, 1.9); c.fill(); c.restore();
      c.globalAlpha = 0.38;
      inkStroke(c, [{ x: -7, y: 0 }, { x: -12 - b.age * 6, y: 0.5 }], 3.6, { alpha: 1 });
    } else { /* a flicked droplet (echo stroke) */
      c.rotate(b.ang);
      c.fillStyle = INK;
      teardrop(c, 4.2);
      c.fill();
      inkStroke(c, [{ x: -5, y: 0 }, { x: -14 - b.age * 8, y: 0.6 }], 2.6, { alpha: 0.4 });
    }
    c.restore();
  }

  /* the spitter's lobbed glob / the sniper's needle */
  function drawEBullet(c, b) {
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.ang);
    const bi = b.red ? RED : INK;
    if (b.kind === 'needle') {
      c.strokeStyle = bi;
      c.lineWidth = 1.7;
      c.beginPath();
      c.moveTo(7, 0);
      c.lineTo(-11, 0);
      c.stroke();
      c.fillStyle = bi;
      c.beginPath();
      c.arc(6.4, 0, 2.1, 0, TAU);
      c.fill();
      inkStroke(c, [{ x: -10, y: 0 }, { x: -20 - b.age * 10, y: 0.4 }], 1.5, { alpha: 0.3, color: b.red ? RED : null });
    } else {
      c.strokeStyle = bi;
      c.fillStyle = bi;
      c.lineWidth = 1.8;
      c.beginPath(); c.arc(0, 0, 4.6, 0, TAU); c.stroke();
      c.beginPath(); c.arc(0, 0, 1.7, 0, TAU); c.fill();
      inkStroke(c, [{ x: -6, y: 0 }, { x: -15 - b.age * 6, y: 0.5 }], 2.2, { alpha: 0.32, color: b.red ? RED : null });
    }
    c.restore();
  }

  /* ink trail puddles — smears that bite */
  function drawPuddle(c, pd) {
    const age = pd.max - pd.life;
    const grow = Math.min(1, age / 0.22);
    const fade = pd.life < 0.45 ? pd.life / 0.45 : 1;
    c.save();
    c.translate(pd.x, pd.y);
    c.scale(1, 0.62);
    c.globalAlpha = 0.34 * fade;
    c.fillStyle = INK;
    blobPath(c, 0, 0, pd.r * grow, pd.seed, 0.34, 12);
    c.fill();
    c.globalAlpha = 0.3 * fade;
    blobPath(c, 0, 0, pd.r * 0.55 * grow, pd.seed ^ 9, 0.4, 10);
    c.fill();
    c.restore();
  }

  /* the crimson hanko, slamming down */
  function drawStamp(c, st) {
    const t = 1 - st.life / st.max;
    const punch = t < 0.16 ? 1.65 - 0.65 * (t / 0.16) : 1;
    const alpha = st.life < 0.2 ? st.life / 0.2 : 1;
    const s = st.r * 0.3 * punch;
    c.save();
    c.translate(st.x, st.y);
    c.rotate(-0.12);
    c.globalAlpha = alpha * 0.85;
    c.strokeStyle = RED;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, st.r * punch, 0, TAU);
    c.stroke();
    c.fillStyle = RED;
    c.fillRect(-s, -s, s * 2, s * 2);
    c.fillStyle = PAPER;
    c.font = `${Math.round(s * 1.5)}px "Zen Antique", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = alpha;
    c.fillText('一', 0, s * 0.08);
    c.restore();
  }

  /* spirit scribes — lesser brushes hunting alone */
  function drawSpirit(c, sp) {
    c.save();
    c.translate(sp.x, sp.y);
    c.rotate(sp.ang);
    c.fillStyle = INK;
    c.globalAlpha = 0.35;
    inkStroke(c, [{ x: -5, y: 0 }, { x: -15, y: Math.sin(sp.age * 12 + sp.seed) * 2.5 }], 1.8, { alpha: 1 });
    c.globalAlpha = 0.9;
    teardrop(c, 3.4);
    c.fill();
    c.restore();
  }

  /* the returning stroke — a wide spinning brushstroke */
  function drawBoomer(c, b) {
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.ang + (b.phase === 'back' ? -1 : 1) * b.age * 7);
    inkStroke(c, [{ x: 19, y: 0 }, { x: 0, y: 3.6 }, { x: -17, y: 0.4 }], 7.4, { alpha: 0.95, taper: 0.85, seed: 11 });
    c.globalAlpha = 0.28;
    inkStroke(c, [{ x: 10, y: 0 }, { x: -12, y: 0.3 }], 10, { alpha: 1, taper: 1 });
    c.restore();
  }

  /* ink motes — the drink of the sheet, small drops of XP */
  function drawMote(c, mt, t) {
    const fade = mt.age > CFG.xp.moteLife - 2.4 ? Math.max(0, (CFG.xp.moteLife - mt.age) / 2.4) : 1;
    c.save();
    c.translate(mt.x, mt.y);
    c.globalAlpha = (mt.pull ? 0.95 : 0.72) * fade;
    c.fillStyle = mt.tier === 2 ? RED : INK;
    const rr = mt.r * (1 + Math.sin(t * 5 + mt.seed) * 0.12);
    if (mt.tier === 2) {
      c.rotate(Math.atan2(mt.vy, mt.vx) || 0);
      teardrop(c, rr);
      c.fill();
    } else {
      blobPath(c, 0, 0, rr, mt.seed, 0.26, 8);
      c.fill();
    }
    c.restore();
  }

  /* talismans: the pot, the magnet, the bomb, the chest */
  function drawPickup(c, pk, t) {
    const bob = Math.sin(t * 2.4 + pk.bob) * 2.6;
    const pul = 1 + Math.sin(t * 3.4 + pk.bob) * 0.06;
    c.save();
    c.translate(pk.x, pk.y + bob);
    c.scale(pul, pul);
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (pk.kind === 'pot') {
      /* a small pot of fresh water, sealed with red */
      c.lineWidth = 1.8;
      c.beginPath();
      c.arc(0, 1.4, 6.4, 0, TAU);
      c.stroke();
      c.beginPath();
      c.moveTo(-3.4, -4.6); c.lineTo(3.4, -4.6); c.stroke();
      c.globalAlpha = 0.5;
      c.beginPath();
      c.arc(0, 1.4, 3.1, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
      c.fillStyle = RED;
      c.fillRect(-1.6, -0.2, 3.2, 3.2);
    } else if (pk.kind === 'magnet') {
      /* a paper talisman stamped 墨 */
      c.save();
      c.rotate(-0.12);
      c.lineWidth = 1.7;
      c.strokeRect(-5.2, -7, 10.4, 14);
      c.fillStyle = INK;
      c.font = '10px "Zen Antique", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('墨', 0, 0.5);
      c.restore();
    } else if (pk.kind === 'bomb') {
      /* a heavy round blot with a lit fuse */
      blobPath(c, 0, 0.8, 6.6, pk.seed, 0.16, 10);
      c.fill();
      inkStroke(c, [{ x: 0, y: -5 }, { x: 2, y: -9.4 }, { x: 5, y: -10.2 }], 1.7, { alpha: 0.95 });
      c.fillStyle = RED;
      c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 13 + pk.bob);
      c.beginPath(); c.arc(5.4, -10.4, 2, 0, TAU); c.fill();
      c.globalAlpha = 1;
    } else if (pk.kind === 'chest') {
      /* the guardian's chest — a red seal box */
      c.save();
      c.rotate(-0.08);
      c.fillStyle = RED;
      c.fillRect(-8, -6.5, 16, 13);
      c.strokeStyle = RED;
      c.lineWidth = 2;
      c.strokeRect(-8, -6.5, 16, 13);
      c.fillStyle = PAPER;
      c.font = '10px "Zen Antique", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('宝', 0, 0.5);
      c.restore();
    }
    c.restore();
  }

  /* the sumi arc — a jagged live stroke, bright then gone */
  function drawArcFx(c, ar) {
    const a = ar.life / ar.max;
    const rnd = mulberry(ar.seed);
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let seg = 1; seg < ar.pts.length; seg++) {
      const p0 = ar.pts[seg - 1], p1 = ar.pts[seg];
      c.beginPath();
      c.moveTo(p0.x, p0.y);
      const mx = (p0.x + p1.x) / 2 + (rnd() - 0.5) * 30;
      const my = (p0.y + p1.y) / 2 + (rnd() - 0.5) * 30;
      c.lineTo(mx, my);
      c.lineTo(p1.x, p1.y);
      c.strokeStyle = INK;
      c.globalAlpha = a * 0.3;
      c.lineWidth = 7;
      c.stroke();
      c.globalAlpha = a;
      c.lineWidth = 2.4;
      c.stroke();
    }
    c.restore();
  }

  /* the ink vortex — a whirlpool with three spiral arms */
  function drawVortex(c, vz) {
    const grow = Math.min(1, (vz.max - vz.dur) / 0.25);
    const fade = Math.min(1, vz.dur / 0.3);
    c.save();
    c.translate(vz.x, vz.y);
    c.scale(grow * fade, grow * fade);
    c.globalAlpha = 0.22;
    c.fillStyle = INK;
    blobPath(c, 0, 0, vz.r * 0.7, vz.seed, 0.3, 12);
    c.fill();
    c.globalAlpha = 0.7;
    c.strokeStyle = INK;
    c.lineWidth = 2.3;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      const a0 = vz.spin + i * TAU / 3;
      for (let k = 0; k <= 14; k++) {
        const rr = vz.r * (1 - k / 14) * 0.95;
        const aa = a0 + k * 0.42;
        const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr;
        k ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.restore();
  }

  /* the storm eye's bolts — a filling ring, then a jagged column */
  function drawBolt(c, bo) {
    const bc = bo.red ? RED : INK;
    c.save();
    c.translate(bo.x, bo.y);
    if (!bo.struck) {
      const pr = 1 - Math.max(0, bo.t) / 1.45;
      c.globalAlpha = 0.55;
      c.strokeStyle = bc;
      c.lineWidth = 1.6;
      blobPath(c, 0, 0, bo.r, (bo.x * 7 + bo.y * 13) | 0, 0.1, 12);
      c.stroke();
      c.globalAlpha = 0.14 + 0.24 * Math.min(1, Math.max(0, pr));
      c.fillStyle = bc;
      blobPath(c, 0, 0, bo.r * Math.min(1, Math.max(0, pr)), (bo.x * 3 + bo.y * 5) | 0, 0.12, 12);
      c.fill();
    } else {
      const a = Math.min(1, bo.life / 0.16);
      const rnd = mulberry((bo.x * 31 + bo.y * 17) | 0);
      c.strokeStyle = bc;
      c.lineCap = 'round';
      c.beginPath();
      let x = (rnd() - 0.5) * 10;
      c.moveTo(x, -430);
      for (let y = -430; y <= 8; y += 43) {
        x += (rnd() - 0.5) * 26;
        c.lineTo(x, y);
      }
      c.globalAlpha = a * 0.35;
      c.lineWidth = 9;
      c.stroke();
      c.globalAlpha = a;
      c.lineWidth = 3;
      c.stroke();
    }
    c.restore();
  }

  function drawMarker(c, m) {
    const def = ENEMIES[m.type];
    const big = m.elite ? CFG.wave.eliteR : 1;
    const pr = 1 - m.t / (m.elite ? 1.7 : 0.62);
    c.save();
    c.translate(m.x, m.y);
    /* puddle spreading */
    c.save();
    c.scale(1, 0.42);
    c.globalAlpha = 0.3 + 0.5 * pr;
    c.fillStyle = m.elite ? RED : INK;
    blobPath(c, 0, 0, def.r * big * (0.55 + 0.95 * pr), (m.x * 7 + m.y * 13) | 0, 0.35, 10);
    c.fill();
    c.restore();
    /* droplets falling in */
    for (let k = 0; k < 3; k++) {
      const dx = (k - 1) * def.r * big * 0.7;
      const dy = -(1 - pr) * 74 - 8 - k * 5;
      c.save();
      c.translate(dx, dy);
      c.rotate(Math.PI / 2);
      c.globalAlpha = 0.85;
      c.fillStyle = m.elite ? RED : INK;
      teardrop(c, (2.4 + pr * 2.2) * big);
      c.fill();
      c.restore();
    }
    c.restore();
  }

  function drawRing(c, r) {
    const prog = 1 - r.life / r.maxLife;
    const ease = 1 - Math.pow(1 - prog, 2.2);
    const rad = Math.max(2, r.max * ease);
    const al = (r.life / r.maxLife);
    c.save();
    c.strokeStyle = r.red ? RED : INK;
    c.globalAlpha = al * 0.75;
    c.lineWidth = 2;
    blobPath(c, r.x, r.y, rad, (r.x * 13 + r.y * 7) | 0, 0.1, 14);
    c.stroke();
    if (r.max > 150) { /* ink burst: double ring + stray droplets */
      c.globalAlpha = al * 0.4;
      blobPath(c, r.x, r.y, rad * 0.72, ((r.x + r.y) * 3) | 0, 0.14, 12);
      c.stroke();
      c.fillStyle = r.red ? RED : INK;
      c.globalAlpha = al * 0.6;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + r.x * 0.01;
        c.save();
        c.translate(r.x + Math.cos(a) * rad * 0.92, r.y + Math.sin(a) * rad * 0.92);
        c.rotate(a);
        teardrop(c, 3.2);
        c.fill();
        c.restore();
      }
    }
    c.restore();
  }

  /* a boss's promise, written in red before it lands: a dashed
     stroke across the charge path, or a ring around the coming slam */
  function drawTelg(c, tg, t) {
    const S = G.S;
    const e = tg.e;
    if (!e || e.dead) return;
    const k = tg.life / tg.maxLife;
    c.save();
    c.strokeStyle = RED;
    c.fillStyle = RED;
    c.lineWidth = 2.4;
    c.setLineDash([9, 7]);
    c.lineDashOffset = -t * 46;
    c.globalAlpha = (0.34 + 0.34 * (1 - k)) * (S.reduced ? 0.55 : 1);
    if (tg.kind === 'line') {
      const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
      const x0 = e.x + Math.cos(ang) * (e.r + 8), y0 = e.y + Math.sin(ang) * (e.r + 8);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(e.x + Math.cos(ang) * tg.len, e.y + Math.sin(ang) * tg.len);
      c.stroke();
      c.setLineDash([]);
      c.save();
      c.translate(e.x + Math.cos(ang) * tg.len, e.y + Math.sin(ang) * tg.len);
      c.rotate(ang);
      teardrop(c, 6.5);
      c.fill();
      c.restore();
    } else {
      c.beginPath();
      c.arc(e.x, e.y, tg.r, 0, TAU);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha *= 0.3;
      c.beginPath();
      c.arc(e.x, e.y, tg.r * (0.86 + 0.1 * k), 0, TAU);
      c.stroke();
    }
    c.restore();
  }

  function drawParticle(c, p) {
    c.save();
    c.globalAlpha = Math.max(0, p.life / p.max);
    c.translate(p.x, p.y);
    c.fillStyle = p.red ? RED : INK;
    const vang = Math.atan2(p.vy, p.vx);
    if (p.shape === 'line') {
      c.rotate(vang);
      inkStroke(c, [{ x: -p.size * 1.4, y: 0 }, { x: p.size * 1.2, y: 0 }], 1.8, { alpha: 1, color: p.red ? RED : null });
    } else if (p.shape === 'dot') {
      c.rotate(vang);
      teardrop(c, p.size * 0.75);
      c.fill();
    } else {
      c.rotate(p.rot);
      teardrop(c, p.size * 0.8);
      c.fill();
    }
    c.restore();
  }

  function drawPopup(c, p) {
    c.save();
    c.globalAlpha = Math.max(0, p.life / p.max);
    c.fillStyle = p.red ? RED : INK;
    c.font = p.red ? '700 13px "IBM Plex Mono", monospace' : '600 11px "IBM Plex Mono", monospace';
    c.textAlign = 'center';
    c.fillText(p.txt, p.x, p.y);
    c.restore();
  }

  /* ---------------- ambient ink rain (title & over screens) ----------------
     drops fall from the top of the scroll and stain the paper —
     the quiet screens are themselves slow paintings */
  let drops = [], dropT = 1.2;
  function updateAmbient(dt, S) {
    if (S.mode !== 'title' && S.mode !== 'over') { drops.length = 0; return; }
    dropT -= dt;
    if (dropT <= 0 && drops.length < 7) {
      drops.push({
        x: 26 + Math.random() * (S.W - 52),
        y: -8,
        v: 46 + Math.random() * 60,
        ty: 26 + Math.random() * (S.H - 52),
      });
      dropT = 0.4 + Math.random() * 1.3;
    }
    const cx = S.mode === 'title' ? 0 : S.cam.x;
    const cy = S.mode === 'title' ? 0 : S.cam.y;
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.v += 620 * dt;
      d.y += d.v * dt;
      if (d.y >= d.ty) {
        S.stainQueue.push({ x: d.x - S.W / 2 + cx, y: d.ty - S.H / 2 + cy, r: 2.6 + Math.random() * 4.6, alpha: 0.24 + Math.random() * 0.2 });
        drops.splice(i, 1);
      }
    }
  }
  function drawAmbient(c) {
    for (const d of drops) {
      c.save();
      c.translate(d.x, d.y);
      c.rotate(Math.PI / 2);
      c.fillStyle = INK;
      c.globalAlpha = 0.72;
      const stretch = Math.min(2.1, 0.9 + d.v / 220);
      c.scale(1, stretch);
      teardrop(c, 2.6);
      c.fill();
      c.restore();
    }
  }

  /* ---------------- the visitor's ink ----------------
     the title sheet can be painted: the hand lays wet strokes
     that dry, lift and vanish; a press bursts a small splash
     and sometimes leaves a faint ghost in the paper's world. */
  const PI = { strokes: [], fx: [] };

  function titleInkMove(x, y) {
    const S = G.S;
    if (S.mode !== 'title' || S.reduced) return;
    const now = performance.now() / 1000;
    let st = PI.strokes[PI.strokes.length - 1];
    if (st && now - st.pts[st.pts.length - 1].t > 0.28) st = null;   /* the hand lifted */
    if (!st) {
      st = { pts: [] };
      PI.strokes.push(st);
      if (PI.strokes.length > 7) PI.strokes.shift();
    }
    const lp = st.pts[st.pts.length - 1];
    if (lp) {
      if (Math.hypot(x - lp.x, y - lp.y) < 4.5) return;
      if (st.pts.length > 110) st.pts.shift();
    }
    st.pts.push({ x, y, t: now });
  }

  function titleInkSplash(x, y) {
    const S = G.S;
    if (S.mode !== 'title' || S.reduced) return;
    const drops = [];
    const n = 6 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      drops.push({ a: Math.random() * TAU, d: 13 + Math.random() * 44, r: 1.2 + Math.random() * 2.5 });
    }
    PI.fx.push({ x, y, t0: performance.now() / 1000, drops, seed: (Math.random() * 1e9) | 0 });
    if (PI.fx.length > 5) PI.fx.shift();
    /* a faint ghost of the visit stays in the paper's world */
    if (Math.random() < 0.5 && S.stainQueue.length < 60) {
      S.stainQueue.push({ x: x - S.W / 2, y: y - S.H / 2, r: 2.2 + Math.random() * 3.2, alpha: 0.09 + Math.random() * 0.08 });
    }
    try { SFX.arrive(); } catch (e) {}
  }

  function drawPaint(c, t) {
    const S = G.S;
    if (S.mode !== 'title') {
      if (PI.strokes.length || PI.fx.length) { PI.strokes.length = 0; PI.fx.length = 0; }
      return;
    }
    for (let i = PI.strokes.length - 1; i >= 0; i--) {
      const st = PI.strokes[i];
      if (st.pts.length < 2) {
        if (t - st.pts[st.pts.length - 1].t > 0.3) PI.strokes.splice(i, 1);
        continue;
      }
      const age = t - st.pts[st.pts.length - 1].t;
      const life = 5.4;
      if (age > life) { PI.strokes.splice(i, 1); continue; }
      const dry = Math.min(1, age / 2.1);
      const lift = 1 - age / life;
      const a = (0.42 - 0.2 * dry) * lift;
      if (a <= 0.012) continue;
      inkStroke(c, st.pts, 4.6 - dry * 1.6, { alpha: a, taper: 0.85, seed: 40, jit: 0.34 });
    }
    for (let i = PI.fx.length - 1; i >= 0; i--) {
      const f = PI.fx[i];
      const age = t - f.t0;
      if (age > 2.4) { PI.fx.splice(i, 1); continue; }
      const k = Math.min(1, age / 0.42);
      c.strokeStyle = INK;
      c.globalAlpha = (1 - k) * 0.38;
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(f.x, f.y, 4 + k * 30, 0, TAU); c.stroke();
      c.fillStyle = INK;
      for (const d of f.drops) {
        const dk = 1 - Math.pow(1 - Math.min(1, age / 0.32), 3);
        c.globalAlpha = Math.max(0, 0.55 * (1 - age / 2.4));
        c.beginPath();
        c.arc(f.x + Math.cos(d.a) * d.d * dk, f.y + Math.sin(d.a) * d.d * dk, Math.max(0.3, d.r * (1 - age * 0.16)), 0, TAU);
        c.fill();
      }
      c.globalAlpha = Math.max(0, 0.55 * (1 - age / 1.4));
      blobPath(c, f.x, f.y, 6.5, f.seed, 0.42, 9);
      c.fill();
      c.globalAlpha = 1;
    }
  }

  /* ---------------- the weather of each sheet ----------------
     every paper carries its own sky: motes, embers, petals,
     driving rain with lightning, and drifting gold leaf */
  let wx = [], wKey = null, boltT = 5, flashA = 0;
  function updateWeather(dt, S, key) {
    if (key !== wKey) { wx.length = 0; wKey = key; flashA = 0; }
    const inRun = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'upgrade' || S.mode === 'dying';
    if (!inRun) { wx.length = 0; flashA = 0; return; }
    const kind = THEMES[key] ? THEMES[key].weather : 'motes';
    const W = S.W, H = S.H;
    if (kind === 'rain') {
      while (wx.length < 46) wx.push({ x: Math.random() * (W + 240) - 120, y: Math.random() * -H, v: 560 + Math.random() * 280, l: 14 + Math.random() * 18 });
      for (const d of wx) {
        d.y += d.v * dt; d.x -= d.v * 0.32 * dt;
        if (d.y > H + 30) { d.y = -20 - Math.random() * 90; d.x = Math.random() * (W + 240) - 120; }
      }
      boltT -= dt;
      if (boltT <= 0) { boltT = 7 + Math.random() * 9; flashA = 0.18 + Math.random() * 0.1; SFX.thunder(); }
    } else if (kind === 'embers') {
      while (wx.length < 24) wx.push({ x: Math.random() * W, y: H + 10 + Math.random() * 60, v: 16 + Math.random() * 30, sway: Math.random() * 6.28, s: 1 + Math.random() * 1.8 });
      for (const d of wx) {
        d.y -= d.v * dt; d.sway += dt;
        if (d.y < -12) { d.y = H + 12; d.x = Math.random() * W; }
      }
    } else if (kind === 'petals') {
      while (wx.length < 20) wx.push({ x: Math.random() * W, y: Math.random() * -H - 10, v: 34 + Math.random() * 40, sway: Math.random() * 6.28, s: 2.4 + Math.random() * 2.6 });
      for (const d of wx) {
        d.y += d.v * dt; d.sway += dt * 1.4; d.x += Math.sin(d.sway) * 22 * dt;
        if (d.y > H + 16) { d.y = -14; d.x = Math.random() * W; }
      }
    } else if (kind === 'gold') {
      while (wx.length < 24) wx.push({ x: Math.random() * W, y: Math.random() * -H - 10, v: 20 + Math.random() * 26, sway: Math.random() * 6.28, s: 1.4 + Math.random() * 2.2, rot: Math.random() * 6.28 });
      for (const d of wx) {
        d.y += d.v * dt; d.sway += dt * 1.1; d.x += Math.sin(d.sway) * 16 * dt; d.rot += dt * 1.6;
        if (d.y > H + 12) { d.y = -12; d.x = Math.random() * W; }
      }
    } else { /* motes */
      while (wx.length < 16) wx.push({ x: Math.random() * W, y: Math.random() * H, v: 8 + Math.random() * 14, sway: Math.random() * 6.28, s: 0.8 + Math.random() * 1.4 });
      for (const d of wx) {
        d.y -= d.v * dt; d.sway += dt * 0.8; d.x += Math.sin(d.sway) * 9 * dt;
        if (d.y < -10) { d.y = H + 10; d.x = Math.random() * W; }
      }
    }
    if (flashA > 0) flashA *= Math.exp(-5.5 * dt);
  }
  function drawWeather(c, S) {
    const kind = THEMES[wKey] ? THEMES[wKey].weather : 'motes';
    if (kind === 'rain') {
      c.strokeStyle = INK;
      c.lineCap = 'round';
      c.globalAlpha = 0.3;
      c.lineWidth = 1.1;
      c.beginPath();
      for (const d of wx) { c.moveTo(d.x, d.y); c.lineTo(d.x + d.l * 0.32, d.y - d.l); }
      c.stroke();
      c.globalAlpha = 1;
    } else if (kind === 'embers') {
      c.fillStyle = INK;
      for (const d of wx) {
        c.globalAlpha = 0.16 + 0.14 * Math.sin(d.sway * 2);
        c.beginPath(); c.arc(d.x, d.y, d.s, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    } else if (kind === 'petals') {
      c.fillStyle = RED;
      for (const d of wx) {
        c.save(); c.translate(d.x, d.y); c.rotate(d.sway * 0.8);
        c.globalAlpha = 0.2;
        c.beginPath(); c.ellipse(0, 0, d.s, d.s * 0.55, 0, 0, TAU); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    } else if (kind === 'gold') {
      c.fillStyle = '#a67c2c';
      for (const d of wx) {
        c.save(); c.translate(d.x, d.y); c.rotate(d.rot);
        c.globalAlpha = 0.24;
        c.beginPath(); c.moveTo(0, -d.s); c.lineTo(d.s * 0.7, 0); c.lineTo(0, d.s); c.lineTo(-d.s * 0.7, 0); c.closePath(); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    } else {
      c.fillStyle = INK;
      for (const d of wx) {
        c.globalAlpha = 0.1;
        c.beginPath(); c.arc(d.x, d.y, d.s, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    /* the lightning flash */
    if (flashA > 0.005) {
      c.globalAlpha = flashA;
      c.fillStyle = '#f4f7f6';
      c.fillRect(0, 0, S.W, S.H);
      c.globalAlpha = 1;
    }
  }

  /* what lies beyond the eye: a red mark at the rim */
  function drawEdgeArrow(c, wxr, wyr, shape) {
    const S = G.S;
    const sx = S.W / 2 + (wxr - S.cam.x);
    const sy = S.H / 2 + (wyr - S.cam.y);
    const m = 40;
    if (sx > m && sx < S.W - m && sy > m && sy < S.H - m) return;
    const a = Math.atan2(sy - S.H / 2, sx - S.W / 2);
    const tx = Math.cos(a), ty = Math.sin(a);
    let t = Infinity;
    if (tx > 0.001) t = Math.min(t, (S.W / 2 - m) / tx);
    if (tx < -0.001) t = Math.min(t, (S.W / 2 - m) / -tx);
    if (ty > 0.001) t = Math.min(t, (S.H / 2 - m) / ty);
    if (ty < -0.001) t = Math.min(t, (S.H / 2 - m) / -ty);
    const px = S.W / 2 + tx * t, py = S.H / 2 + ty * t;
    c.save();
    c.translate(px, py);
    c.rotate(a);
    c.globalAlpha = 0.55 + 0.4 * Math.abs(Math.sin(S.clockT * 4));
    c.fillStyle = RED;
    if (shape === 'seal') {
      c.rotate(-a + Math.sin(S.clockT * 2) * 0.06);
      c.fillRect(-6, -6, 12, 12);
      c.fillStyle = '#ede7d9';
      c.font = '9px "Zen Antique", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('宝', 0, 0.5);
    } else {
      c.beginPath();
      c.moveTo(12, 0);
      c.lineTo(-6, -7.5);
      c.lineTo(-2, 0);
      c.lineTo(-6, 7.5);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function drawIndicators(c) {
    const S = G.S;
    if (S.mode !== 'playing' || !S.stats) return;
    let target = null;
    for (const e of S.enemies) if (ENEMIES[e.type].boss) { target = e; break; }
    if (!target) for (const m of S.markers) if (m.boss) { target = m; break; }
    if (!target) for (const e of S.enemies) if (e.elite) { target = e; break; }
    if (!target) for (const m of S.markers) if (m.elite) { target = m; break; }
    if (target) drawEdgeArrow(c, target.x, target.y, 'arrow');
    for (const pk of S.pickups) {
      if (pk.kind === 'chest') { drawEdgeArrow(c, pk.x, pk.y, 'seal'); break; }
    }
  }

  function drawJoy(c) {
    const S = G.S;
    if (!S.joy || S.mode !== 'playing') return;
    const j = S.joy;
    c.save();
    c.strokeStyle = INK;
    c.globalAlpha = 0.3;
    c.lineWidth = 1.6;
    blobPath(c, j.ax, j.ay, 30, 1234, 0.08, 14);
    c.stroke();
    c.globalAlpha = 0.75;
    c.fillStyle = INK;
    blobPath(c, j.ax + j.dx, j.ay + j.dy, 12, 4321, 0.2, 9);
    c.fill();
    c.restore();
  }

  /* ============================================================
     THE TITLE RITUAL — each visit, the brush returns and paints
     the ensō again: a landing pool, a full turn of ink that dries
     as it thins, dry-brush streaks, a flick of drops, and the red
     seal falling into the gap with a knock and a small shake.
     Two canvases: ink bakes onto one, the living tip and the seal
     breathe on the other.
     ============================================================ */
  const RT = {
    bake: null, front: null, wrap: null, main: null,
    bctx: null, fctx: null,
    size: 0, dpr: 1,
    t0: 0, painted: 0, done: false, stampT: -1,
    px: 0, py: 0, seed: 3.1,
    /* the scribe who paints the circle and then keeps it */
    scr: null,
    drips: [], nextDrip: 0,
  };
  const RT_TAU = Math.PI * 2;
  const RT_LEAD = 0.25;   /* stillness before the brush lands */
  const RT_SPAN = 1.5;    /* the turn itself */

  /* the wrap is positioned by CSS; the canvases follow the same
     formula so the ink stays pixel-true at any window size */
  function rtSize() {
    const S = G.S;
    return S.W <= 720
      ? Math.min(S.H * 0.5, S.W * 1.18, 400)
      : Math.min(S.H * 0.64, 520);
  }

  const rtRand = v => { const s = Math.sin(v * 127.1 + RT.seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const rtGeo = () => ({
    cx: RT.size / 2, cy: RT.size / 2,
    R0: RT.size * 0.355,
    thS: -0.35,                 /* the brush lands right of centre */
    sweep: RT_TAU - 0.5,        /* one turn, a breath of a gap top right */
  });
  const rtArcAt = (g, th, wob) => {
    const r = g.R0 * (1 + wob);
    return { x: g.cx + Math.cos(th) * r, y: g.cy + Math.sin(th) * r };
  };

  function rtStart(now) {
    const S = G.S;
    RT.wrap = document.getElementById('ensoWrap');
    RT.main = document.querySelector('.title-main');
    const bake = document.getElementById('ensoBake');
    const front = document.getElementById('ensoFront');
    if (!bake || !front) { RT.bake = null; return; }
    const size = rtSize();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    RT.size = size; RT.dpr = dpr;
    for (const cv of [bake, front]) {
      cv.width = Math.round(size * dpr);
      cv.height = Math.round(size * dpr);
    }
    RT.bake = bake; RT.front = front;
    RT.bctx = bake.getContext('2d');
    RT.fctx = front.getContext('2d');
    RT.bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    RT.t0 = now; RT.painted = 0; RT.done = false; RT.stampT = -1;
    RT.px = 0; RT.py = 0;
    RT.seed = 3.1 + (now % 6.28);
    RT.drips = []; RT.nextDrip = 0;
    const g = rtGeo();
    /* he begins where the brush lands, and never really leaves the ring */
    RT.scr = {
      th: g.thS, phase: 'ride', pt: 0, pace: 0,
      face: 1, nextBlink: now + 3.5 + rtRand(now) * 4,
      blinkT: -1,
    };
    if (S.reduced) {
      rtPaint(1); RT.painted = 1; RT.done = true; rtFlick();
      RT.stampT = now;   /* the seal simply is */
      RT.scr.th = g.thS + g.sweep - 0.55;  /* standing beside the gap, still */
      RT.scr.phase = 'saunt'; RT.scr.pace = 0;
    }
    if (RT.wrap) RT.wrap.style.transform = 'translate(-50%,-50%) rotate(-4deg)';
    if (RT.main) RT.main.style.transform = 'translate3d(0,0,0)';
  }

  /* one brush stamp — an ink ellipse riding the tangent */
  function rtStampAt(x, cx, cy, tang, w, a) {
    x.save();
    x.translate(cx, cy);
    x.rotate(tang);
    x.fillStyle = `rgba(26,23,20,${a})`;
    x.beginPath();
    x.ellipse(0, 0, w * 0.72, w * 0.42, 0, 0, RT_TAU);
    x.fill();
    x.restore();
  }

  /* paint the arc up to progress pe, from where we last left the paper */
  function rtPaint(pe) {
    if (!RT.bctx || pe <= RT.painted) return;
    const g = rtGeo(), x = RT.bctx, size = RT.size;
    const steps = Math.max(1, Math.ceil((pe - RT.painted) * 400));
    for (let i = 1; i <= steps; i++) {
      const p = RT.painted + (pe - RT.painted) * (i / steps);
      const wob = Math.sin(p * 8.2 + RT.seed) * 0.011 + Math.sin(p * 21.7 + RT.seed * 2.1) * 0.007;
      const th = g.thS + p * g.sweep;
      const r = g.R0 * (1 + wob);
      const cx = g.cx + Math.cos(th) * r;
      const cy = g.cy + Math.sin(th) * r;
      let w = size * 0.045 * (1.06 - 0.5 * p);
      if (p < 0.05) w *= 1.08;                                        /* the landing pool */
      if (p > 0.94) w *= Math.max(0.12, ((1 - p) / 0.06)) * 0.9 + 0.1; /* the tail thins away */
      w *= 1 + 0.07 * Math.sin(p * 31 + RT.seed * 3.3);                /* hand pressure */
      const tang = th + Math.PI / 2;
      const dry = p > 0.4 && rtRand(p * 57.3) < 0.13;                  /* the ink runs dry */
      if (dry) {
        for (const off of [-0.42, 0.38]) {
          x.save();
          x.translate(cx + Math.cos(tang + Math.PI / 2) * off * w, cy + Math.sin(tang + Math.PI / 2) * off * w);
          x.rotate(tang);
          x.fillStyle = 'rgba(26,23,20,0.05)';
          x.beginPath();
          x.ellipse(0, 0, w * 0.6, w * 0.16, 0, 0, RT_TAU);
          x.fill();
          x.restore();
        }
      } else {
        rtStampAt(x, cx, cy, tang, w, 0.15);
        if (p < 0.06) rtStampAt(x, cx, cy, tang, w * 1.12, 0.1);       /* wet ink pools at the landing */
      }
    }
  }

  /* the flick: drops thrown where the brush leaves the paper */
  function rtFlick() {
    const g = rtGeo(), x = RT.bctx;
    if (!x) return;
    const thE = g.thS + g.sweep;
    for (let i = 0; i < 4; i++) {
      const a = thE + 0.02 + i * 0.014 + rtRand(i * 3.7) * 0.012;
      const r = g.R0 * (1 + 0.004 * i);
      x.fillStyle = `rgba(26,23,20,${0.3 - i * 0.055})`;
      x.beginPath();
      x.arc(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r, Math.max(0.9, 2.7 - i * 0.5), 0, RT_TAU);
      x.fill();
    }
    const th0 = g.thS;
    for (let i = 0; i < 2; i++) {
      const a = th0 - 0.05 - i * 0.03;
      const r = g.R0 * (1.02 + i * 0.016);
      x.fillStyle = 'rgba(26,23,20,0.22)';
      x.beginPath();
      x.arc(g.cx + Math.cos(a) * r, g.cy + Math.sin(a) * r, 1.7 - i * 0.5, 0, RT_TAU);
      x.fill();
    }
  }

  /* ---------------- the scribe of the title ----------------
     The little kasa-hatted painter IS the brush now: he rides the
     arc pressing the stroke as it wets, settles when the circle
     closes, and then keeps his ring forever — a slow saunter, a
     bow to the seal each lap, eyes following the visitor's hand. */
  function rtScribe(c, x, y, h, t, o) {
    c.save();
    /* the pool he stands in */
    c.fillStyle = INK;
    c.globalAlpha = 0.13;
    c.beginPath(); c.ellipse(x, y + h * 0.02, h * 0.34, h * 0.07, 0, 0, RT_TAU); c.fill();
    c.globalAlpha = 0.10;
    c.beginPath(); c.ellipse(x, y + h * 0.02, h * 0.18, h * 0.042, 0, 0, RT_TAU); c.fill();
    c.globalAlpha = 1;

    c.translate(x, y);
    c.scale(o.face, 1);
    c.rotate(o.lean || 0);
    const bob = o.stride >= 0 ? -Math.abs(Math.sin(o.stride * RT_TAU * 2.2)) * h * 0.035 : 0;
    const br = 1 + Math.sin(t * 1.9 + 1.2) * 0.012;   /* breathing */
    c.translate(0, bob);
    c.scale(1, br);

    c.fillStyle = INK; c.strokeStyle = INK;
    c.lineJoin = 'round'; c.lineCap = 'round';

    /* the robe — ragged hem, soft shoulders */
    const j = (i, a) => (rtRand(i * 13.7 + RT.seed) - 0.5) * a;
    c.beginPath();
    c.moveTo(-h * 0.185 + j(1, h * 0.02), 0);
    c.lineTo(-h * 0.12 + j(2, h * 0.02), -h * 0.05);
    c.lineTo(-h * 0.155 + j(3, h * 0.02), -h * 0.19);
    c.quadraticCurveTo(-h * 0.16, -h * 0.42, -h * 0.10, -h * 0.55);
    c.quadraticCurveTo(-h * 0.04, -h * 0.615, h * 0.05, -h * 0.61);
    c.quadraticCurveTo(h * 0.13, -h * 0.60, h * 0.145, -h * 0.50);
    c.quadraticCurveTo(h * 0.165, -h * 0.30, h * 0.135, -h * 0.16);
    c.lineTo(h * 0.16 + j(4, h * 0.02), -h * 0.05);
    c.lineTo(h * 0.205 + j(5, h * 0.02), 0);
    c.closePath();
    c.fill();

    /* the pale obi and its knot */
    c.save();
    c.globalAlpha = 0.72; c.fillStyle = PAPER;
    c.fillRect(-h * 0.148, -h * 0.36, h * 0.30, h * 0.055);
    c.restore();
    c.fillRect(-h * 0.175, -h * 0.372, h * 0.045, h * 0.08);   /* the knot, left of the wrap */

    /* head + kasa */
    c.beginPath(); c.arc(h * 0.025, -h * 0.665, h * 0.088, 0, RT_TAU); c.fill();
    c.beginPath();
    c.moveTo(-h * 0.185, -h * 0.685);
    c.quadraticCurveTo(h * 0.02, -h * 0.90, h * 0.225, -h * 0.675);
    c.quadraticCurveTo(h * 0.02, -h * 0.80, -h * 0.185, -h * 0.685);
    c.closePath();
    c.fill();
    /* the hat's weave ring */
    c.save();
    c.globalAlpha = 0.5; c.strokeStyle = PAPER; c.lineWidth = Math.max(0.7, h * 0.012);
    c.beginPath();
    c.moveTo(-h * 0.13, -h * 0.715);
    c.quadraticCurveTo(h * 0.02, -h * 0.845, h * 0.165, -h * 0.705);
    c.stroke();
    c.restore();

    /* the eyes: two paper slits under the brim, watching */
    const bl = o.blink ? 0.22 : 1;
    c.save();
    c.fillStyle = PAPER;
    c.translate(h * 0.048, -h * 0.645);
    c.rotate((o.gaze || 0) * 0.35);
    c.fillRect(0, -h * 0.005 * bl, h * 0.052, Math.max(h * 0.008, h * 0.011 * bl));
    c.translate(h * 0.082, h * 0.004);
    c.fillRect(0, -h * 0.005 * bl, h * 0.048, Math.max(h * 0.008, h * 0.011 * bl));
    c.restore();

    /* the brush: pressed to the paper while he paints, carried high at rest */
    c.save();
    c.translate(h * 0.16, -h * 0.34);
    c.rotate(o.brushUp ? -0.95 + (o.gaze || 0) * 0.3 : 0.62 + (o.gaze || 0) * 0.22);
    c.lineWidth = Math.max(1.1, h * 0.028);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, h * 0.36); c.stroke();
    /* ferrule wrap */
    c.save();
    c.globalAlpha = 0.55; c.strokeStyle = PAPER; c.lineWidth = Math.max(0.6, h * 0.014);
    c.beginPath(); c.moveTo(-h * 0.016, h * 0.30); c.lineTo(h * 0.016, h * 0.315); c.stroke();
    c.restore();
    /* the bristles */
    c.beginPath();
    c.moveTo(-h * 0.022, h * 0.36);
    c.quadraticCurveTo(0, h * 0.46, h * 0.02, h * 0.40);
    c.closePath();
    c.fill();
    if (!o.brushUp) {   /* the wet gleam where ink meets paper */
      c.beginPath(); c.arc(h * 0.006, h * 0.44, h * 0.024, 0, RT_TAU); c.fill();
    }
    c.restore();

    c.restore();
  }

  /* the crimson seal falls into the gap of the circle */
  function rtSeal(t) {
    const f = RT.fctx, g = rtGeo(), size = RT.size, S = G.S;
    const st = Math.min(1, (t - RT.stampT) / 0.22);
    const pop = st < 1 ? 1.7 - 0.7 * st : 1;
    const al = st < 1 ? 0.3 + 0.55 * st : 0.85;
    const bq = S.reduced ? 0 : Math.floor(t * 8.7);
    const jx = (rtRand(bq * 1.7) - 0.5) * 1.2;
    const jy = (rtRand(bq * 2.3) - 0.5) * 1.2;
    const thG = g.thS + g.sweep + 0.25;  /* the middle of the gap */
    const cx = g.cx + Math.cos(thG) * g.R0 + jx;
    const cy = g.cy + Math.sin(thG) * g.R0 + jy;
    const r = size * 0.0135 * pop;
    f.save();
    f.translate(cx, cy);
    f.rotate(-0.12 + (S.reduced ? 0 : Math.sin(bq * 1.3) * 0.02));
    f.globalAlpha = al;
    f.fillStyle = '#B23A2B';
    f.beginPath();
    f.arc(0, 0, r, 0, RT_TAU);
    f.fill();
    f.fillStyle = '#ede7d9';             /* 一 carved through the seal */
    f.fillRect(-r * 0.52, -r * 0.1, r * 1.04, r * 0.2);
    f.globalAlpha = al * 0.5;            /* red spatter around the knock */
    f.fillStyle = '#B23A2B';
    for (let i = 0; i < 3; i++) {
      const a = rtRand(bq + i * 3.1) * RT_TAU;
      const d = r * (1.5 + rtRand(i * 7.7) * 0.9);
      f.beginPath();
      f.arc(Math.cos(a) * d, Math.sin(a) * d, r * (0.07 + rtRand(i * 11.3) * 0.08), 0, RT_TAU);
      f.fill();
    }
    f.restore();
    f.globalAlpha = 1;
  }

  function rtFrame(t, dt) {
    if (!RT.bake) return;
    const S = G.S;
    const want = rtSize();
    if (Math.abs(want - RT.size) > 2) { rtStart(t); return; }
    const g = rtGeo();
    const sc = RT.scr;

    /* ---- the paint: he rides the wet tip around the circle ---- */
    if (!RT.done) {
      const p = Math.min(1, Math.max(0, (t - RT.t0 - RT_LEAD) / RT_SPAN));
      rtPaint(p);
      RT.painted = p;
      sc.th = g.thS + p * g.sweep;
      sc.phase = 'ride';
      if (p >= 1) {
        RT.done = true;
        rtFlick();
        sc.phase = 'settle'; sc.pt = t;
        if (!S.reduced) { RT.stampT = t + 0.06; SFX.hanko(); if (SFX.arrive) SFX.arrive(); }
        else RT.stampT = t;
      }
    } else if (sc.phase === 'settle') {
      if (t - sc.pt > 0.55) { sc.phase = 'saunt'; sc.pace = 0.85; sc.lapd = 0; }  /* first lap: he sets off at a brisk stride */
    } else {   /* saunt: the keeper walks his circle forever */
      const sealTh = g.thS + g.sweep + 0.25;
      let d = thWrap(sc.th - sealTh);
      if (sc.lapd > 2.2) sc.first = false;                 /* the first lap is a departure, not a bow */
      if (Math.abs(d) > 0.45) sc.bowed = false;
      if (!S.reduced && sc.first === false && !sc.bowed && Math.abs(d) < 0.15) { sc.bowed = true; sc.bowT = t; }
      if (sc.bowT && t - sc.bowT < 1.5) { /* a pause, a small bow */ }
      else {
        sc.lapd = (sc.lapd || 0) + sc.pace * dt;
        sc.pace += ((sc.first ? 0.55 : 0.085) - sc.pace) * Math.min(1, dt * (sc.first ? 0.5 : 1.1));
        sc.th += sc.pace * dt;
      }
    }

    /* face the direction of travel */
    const dx = -Math.sin(sc.th);
    if (dx > 0.03) sc.face = 1; else if (dx < -0.03) sc.face = -1;

    /* blink */
    if (!S.reduced) {
      if (t > sc.nextBlink) { sc.blinkT = t + 0.13; sc.nextBlink = t + 4.5 + rtRand(t) * 4.5; }
    }

    /* ---- the ring's tail sheds a drop now and then; the paper keeps it ---- */
    if (!S.reduced && RT.done && RT.drips.length < 12) {
      if (RT.nextDrip === 0) RT.nextDrip = t + 3.5 + rtRand(t * 1.7) * 4;
      else if (t > RT.nextDrip) {
        const tail = rtArcAt(g, g.thS + g.sweep, 0);
        RT.drips.push({
          t0: t, x: tail.x + (rtRand(t * 3.1) - 0.5) * 8,
          y: tail.y + 7, vy: 30 + rtRand(t * 5.3) * 26,
          land: tail.y + 46 + rtRand(t * 7.7) * 42,
        });
        RT.nextDrip = t + 5 + rtRand(t * 2.9) * 6;
      }
    }
    for (let i = RT.drips.length - 1; i >= 0; i--) {
      const d = RT.drips[i];
      const a = t - d.t0;
      d.cy = d.y + d.vy * a + 110 * a * a;
      if (d.cy >= d.land) {   /* the paper drinks it */
        const b = RT.bctx;
        b.fillStyle = 'rgba(26,23,20,0.18)';
        b.beginPath(); b.ellipse(d.x, d.land, 1.6 + rtRand(d.t0 * 9.1) * 2.2, 1.1 + rtRand(d.t0 * 3.3) * 1.2, 0, 0, RT_TAU); b.fill();
        for (let k = 0; k < 2; k++) {
          b.fillStyle = 'rgba(26,23,20,0.13)';
          b.beginPath();
          b.arc(d.x + (rtRand(d.t0 * 11.3 + k) - 0.5) * 11, d.land - 2 - rtRand(d.t0 * 13.7 + k) * 7, 0.5 + rtRand(d.t0 * 17.1 + k) * 0.8, 0, RT_TAU);
          b.fill();
        }
        RT.drips.splice(i, 1);
      }
    }

    /* ---- the paper leans with the hand ---- */
    const par = S.titlePar || { x: 0, y: 0 };
    const k = Math.min(1, dt * 5);
    RT.px += (par.x - RT.px) * k;
    RT.py += (par.y - RT.py) * k;
    let shx = 0, shy = 0;
    if (RT.stampT > 0 && !S.reduced) {
      const stq = t - RT.stampT;
      if (stq > 0 && stq < 0.24) {
        const m = (1 - stq / 0.24) * 3.2;
        shx = (Math.random() - 0.5) * m;
        shy = (Math.random() - 0.5) * m;
      }
    }
    if (RT.wrap) {
      RT.wrap.style.transform =
        `translate(calc(-50% + ${(RT.px * 14 + shx).toFixed(1)}px), calc(-50% + ${(RT.py * 10 + shy).toFixed(1)}px)) rotate(-4deg)`;
    }
    if (RT.main) {
      RT.main.style.transform = `translate3d(${(-RT.px * 6).toFixed(1)}px, ${(-RT.py * 4).toFixed(1)}px, 0)`;
    }

    /* ---- the living layer ---- */
    const f = RT.fctx;
    f.setTransform(RT.dpr, 0, 0, RT.dpr, 0, 0);
    f.clearRect(0, 0, RT.size, RT.size);

    const h = RT.size * 0.135;
    const wob = Math.sin((RT.done ? 1 : RT.painted) * 8.2 + RT.seed) * 0.011;
    const pos = rtArcAt(g, sc.th, RT.done ? 0 : wob);
    const gaze = Math.max(-0.3, Math.min(0.3, (S.titlePar ? S.titlePar.x : 0) * 0.5));
    const blink = sc.blinkT > 0 && t < sc.blinkT;

    if (sc.phase === 'ride') {
      rtScribe(f, pos.x, pos.y, h, t, {
        face: sc.face, lean: 0.07 * sc.face, stride: t * 2.6,
        brushUp: false, gaze, blink,
      });
    } else {
      const settling = sc.phase === 'settle';
      const bq = sc.bowT && t - sc.bowT < 1.5 ? Math.sin(Math.min(1, (t - sc.bowT) / 1.5) * Math.PI) : 0;
      rtScribe(f, pos.x, pos.y, h, t, {
        face: sc.face,
        lean: (settling ? -0.04 : 0.03) * sc.face + bq * 0.13,
        stride: -1,
        brushUp: !settling, gaze, blink,
      });
    }

    /* falling drops ahead of the stroke's memory */
    f.fillStyle = INK;
    for (const d of RT.drips) {
      if (d.cy === undefined) continue;
      f.globalAlpha = 0.75;
      f.beginPath(); f.arc(d.x, d.cy, 2.1, 0, RT_TAU); f.fill();
      f.globalAlpha = 0.28;
      f.fillRect(d.x - 0.5, d.cy - 6.5, 1, 5);
    }
    f.globalAlpha = 1;

    if (RT.stampT > 0 && t >= RT.stampT) rtSeal(t);
  }

  /* shortest signed angular distance */
  function thWrap(a) {
    a = (a + Math.PI) % RT_TAU;
    if (a < 0) a += RT_TAU;
    return a - Math.PI;
  }

  /* ---------------- the first stroke of a run ----------------
     The sheet starts soaked; the spirit's brush sweeps across
     and lifts the ink away, revealing the run beneath it. A
     trembling wet edge rides ahead, and the sheet's kanji
     settles onto the clean paper as the reveal passes it. */
  /* the wet edge's x for a given wash clock (shared with draw) */
  function washTipX(T) {
    const S = G.S;
    const DUR = 1.7;
    const p = 1 - T / DUR;
    const sweep = 1 - Math.pow(1 - Math.min(1, p / 0.8), 3);
    return -70 + (S.W + 150) * sweep;
  }

  function drawBeginWash(c, T, t) {
    const S = G.S;
    const W = S.W, H = S.H;
    const p = 1 - T / 1.7;
    const tipX = washTipX(T);
    const yMid = H * 0.6;

    /* the wet edge: a trembling vertical line the brush paints forward */
    const segs = 22;
    const edge = [];
    for (let i = 0; i <= segs; i++) {
      const y = (H + 8) - ((H + 16) * i) / segs;
      edge.push({
        x: tipX + Math.sin(y * 0.018 + t * 3.1) * 8 + Math.sin(y * 0.055 - t * 4.3) * 4,
        y,
      });
    }

    /* the soaked sheet still veils the right side */
    c.save();
    c.beginPath();
    c.moveTo(W + 8, -8);
    c.lineTo(W + 8, H + 8);
    for (const e of edge) c.lineTo(e.x, e.y);
    c.closePath();
    c.fillStyle = PAPER;
    c.fill();
    c.fillStyle = 'rgba(26,23,20,0.14)';   // wet ink, waiting to be lifted
    c.fill();
    c.restore();

    /* the sheet's kanji, stamped as the reveal passes it —
       the banner already speaks the name; the stamp only seals it */
    if (p > 0.34) {
      if (!S.washStamp) { S.washStamp = true; if (!S.reduced) SFX.namestamp(); }
      const a = Math.min(1, (p - 0.34) * 4.5) * Math.min(1, (1 - p) * 2.6);
      const area = AREAS[S.areaIdx] || AREAS[0];
      c.save();
      c.globalAlpha = a * 0.9;
      c.fillStyle = INK;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `${Math.round(Math.min(W, H) * 0.2)}px "Zen Antique", serif`;
      c.fillText(area.kanji, W * 0.3, H * 0.74);
      c.restore();
    }

    /* drops flung ahead of the wet edge onto the soaked paper */
    if (!S.reduced) {
      c.save();
      c.fillStyle = INK;
      for (let i = 0; i < 3; i++) {
        c.save();
        c.translate(tipX + 18 + i * 14, yMid + Math.sin(t * 6 + i * 2.1) * (14 + i * 8));
        c.rotate(-0.45 + i * 0.4);
        c.globalAlpha = 0.75 - i * 0.16;
        teardrop(c, 3 - i * 0.55);
        c.fill();
        c.restore();
      }
      c.restore();
    }

    /* the brush's wet mark rides the edge itself */
    c.save();
    inkStroke(c, edge, 12, { alpha: 0.85, taper: 0.14, seed: 991, jit: 0.1 });
    c.restore();

    /* the spirit rides the edge, lifting the ink as it goes */
    const bob = Math.sin(t * 5.2) * 3;
    c.save();
    c.translate(tipX - 32, yMid + bob);
    c.rotate(0.1);
    c.fillStyle = INK;
    blobPath(c, 0, 0, 14, 77123, 0.14, 10);
    c.fill();
    c.globalAlpha = 0.4;
    blobPath(c, 0, 0, 7.2, 77123 ^ 9, 0.3, 9);
    c.fill();
    c.globalAlpha = 1;
    c.save();
    c.translate(9, -14);
    c.rotate(-0.85);
    drawBrushTool(c, S.brush || 'needle', { len: 1.9, wet: 0.9, seed: 77123, grip: true });
    c.restore();
    /* its eye, fixed ahead on the sheet it is painting */
    c.strokeStyle = PAPER;
    c.lineWidth = 2.3;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(-13, -2); c.lineTo(-6.5, -3.2); c.stroke();
    c.restore();
  }

  /* ============================================================
     THE LIVING TITLE — the sheet the visitor lands on is itself
     a handscroll: a sumi-e range in three washes that leans with
     the hand, mist drifting between the ridges, crane flocks
     passing, the night paper's own moon. Every layer is painted
     once into an offscreen sheet and only composited per frame.
     ============================================================ */
  const TP = {
    key: '', w: 0, h: 0,
    layers: [],            // far, mid, near
    moon: null, mist: null,
    bands: [],
    cranes: [], nextFlock: 7,
    px: 0, py: 0,          // smoothed lean
  };

  /* INK arrives as '#1a1714' or 'rgb(r,g,b)' — both must parse */
  function tpInkRGB() {
    let r = 26, g = 23, b = 20;
    if (INK[0] === '#') {
      const v = parseInt(INK.slice(1), 16);
      r = v >> 16 & 255; g = v >> 8 & 255; b = v & 255;
    } else {
      const m = INK.match(/[\d.]+/g);
      if (m) { r = +m[0] | 0; g = +m[1] | 0; b = +m[2] | 0; }
    }
    return { r, g, b };
  }

  /* one ridge: gaussian peaks under three octaves of wander, a
     wash body that fades as it falls, a crest brushed twice, dry
     streaks, and — on the nearer sheets — sparse pines */
  function tpRidge(w, h, o) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, Math.round(w));
    cv.height = Math.max(2, Math.round(h));
    const c = cv.getContext('2d');
    const { r, g, b } = o.rgb;
    const dim = o.dim || 1;                 /* pale ink on dark paper must whisper */
    const ink = a => `rgba(${r},${g},${b},${a * dim})`;
    const rnd = mulberry(o.seed);
    const peaks = [];
    for (let k = 0; k < o.nPeaks; k++) {
      peaks.push({ x: rnd() * w, s: w * (0.09 + rnd() * 0.15), a: o.peak * (0.55 + rnd() * 0.85) });
    }
    const pts = [];
    const seg = Math.max(24, Math.round(w / 42));
    for (let i = 0; i <= seg; i++) {
      const x = (w * i) / seg;
      const u = i / seg;
      let y = o.base
        + Math.sin(u * o.f1 + o.s1) * o.a1
        + Math.sin(u * o.f2 + o.s2) * o.a2
        + (rnd() - 0.5) * o.a3;
      for (const p of peaks) {
        const dx = (x - p.x) / p.s;
        y -= p.a * Math.exp(-dx * dx);
      }
      pts.push({ x, y: Math.max(6, y) });
    }
    /* the wash body */
    const body = c.createLinearGradient(0, Math.max(0, o.base - o.peak * 1.4), 0, h);
    body.addColorStop(0, ink(o.crest));
    body.addColorStop(0.55, ink(o.crest * 0.55));
    body.addColorStop(1, ink(0));
    c.beginPath();
    c.moveTo(-4, h + 4);
    for (const p of pts) c.lineTo(p.x, p.y);
    c.lineTo(w + 4, h + 4);
    c.closePath();
    c.fillStyle = body;
    c.fill();
    /* the crest edge, brushed twice — a wet line and its dry echo */
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const [lw, a, dy] of [[2.4, o.edge, 0], [1.1, o.edge * 0.55, 2.2]]) {
      c.strokeStyle = ink(a);
      c.lineWidth = lw;
      c.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i].x, y = pts[i].y + dy + (rnd() - 0.5) * 1.6;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    /* dry streaks inside the body */
    for (let k = 0; k < o.streaks; k++) {
      const sy = o.base + rnd() * Math.max(8, (h - o.base) * 0.7);
      const sx = rnd() * w, sw = w * (0.1 + rnd() * 0.22);
      c.fillStyle = ink(0.05);
      c.beginPath();
      c.ellipse(sx, sy, sw * 0.5, 3 + rnd() * 5, 0, 0, TAU);
      c.fill();
    }
    /* sparse pines on the crest */
    for (let k = 0; k < o.pines; k++) {
      const p = pts[2 + Math.floor(rnd() * Math.max(1, pts.length - 4))];
      const s = 0.7 + rnd() * 0.7;
      c.save();
      c.translate(p.x, p.y + 1);
      c.scale(s, s);
      c.strokeStyle = ink(Math.min(0.5, o.edge * 1.5));
      c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -9); c.stroke();
      c.lineWidth = 1;
      for (let n2 = 0; n2 < 3; n2++) {
        const ny = -3 - n2 * 2.6, nw = 6.5 - n2 * 1.7;
        c.beginPath();
        c.moveTo(-nw, ny); c.lineTo(0, ny - 2.2); c.lineTo(nw, ny);
        c.stroke();
      }
      c.restore();
    }
    return cv;
  }

  function tpBuild() {
    const S = G.S;
    const th = THEMES[themeKey];
    TP.key = themeKey; TP.w = S.W; TP.h = S.H;
    const rgb = tpInkRGB();
    const dim = themeKey === 'dark' ? 0.4 : 1;
    const w = S.W + 72;                     /* bleed so the lean never shows an edge */
    const H = S.H;
    TP.layers = [
      tpRidge(w, Math.round(H * 0.56), {
        rgb, dim, seed: 11, base: H * 0.30, peak: H * 0.16, nPeaks: 3,
        f1: 5.1, f2: 12.7, s1: 0.7, s2: 2.3, a1: H * 0.02, a2: H * 0.009, a3: 2,
        crest: 0.10, edge: 0.13, streaks: 3, pines: 0,
      }),
      tpRidge(w, Math.round(H * 0.68), {
        rgb, dim, seed: 47, base: H * 0.44, peak: H * 0.13, nPeaks: 4,
        f1: 6.3, f2: 15.1, s1: 1.9, s2: 4.4, a1: H * 0.016, a2: H * 0.008, a3: 2,
        crest: 0.14, edge: 0.19, streaks: 4, pines: 3,
      }),
      tpRidge(w, Math.round(H * 0.84), {
        rgb, dim, seed: 83, base: H * 0.62, peak: H * 0.085, nPeaks: 5,
        f1: 7.9, f2: 17.3, s1: 3.2, s2: 5.8, a1: H * 0.012, a2: H * 0.007, a3: 2,
        crest: 0.17, edge: 0.22, streaks: 0, pines: 2,
      }),
    ];
    /* the night paper keeps its moon — a breath of pale ink, not a lamp */
    TP.moon = themeKey === 'dark' ? { x: w * 0.79, y: H * 0.14, r: Math.min(w, H) * 0.041 } : null;
    if (TP.moon) {
      const c = TP.layers[0].getContext('2d');
      const ink = a => `rgba(${rgb.r},${rgb.g},${rgb.b},${a * 0.5})`;
      c.save();
      const halo = c.createRadialGradient(TP.moon.x, TP.moon.y, TP.moon.r * 0.4, TP.moon.x, TP.moon.y, TP.moon.r * 2.6);
      halo.addColorStop(0, ink(0.10));
      halo.addColorStop(1, ink(0));
      c.fillStyle = halo;
      c.beginPath(); c.arc(TP.moon.x, TP.moon.y, TP.moon.r * 2.6, 0, TAU); c.fill();
      c.fillStyle = ink(0.30);
      c.beginPath(); c.arc(TP.moon.x, TP.moon.y, TP.moon.r, 0, TAU); c.fill();
      c.strokeStyle = ink(0.36);
      c.lineWidth = 1;
      c.beginPath(); c.arc(TP.moon.x, TP.moon.y, TP.moon.r, 0, TAU); c.stroke();
      c.restore();
    }
    /* one soft mist sprite, tinted by the paper's own ink */
    const mc = document.createElement('canvas');
    mc.width = 180; mc.height = 70;
    const m = mc.getContext('2d');
    const mg = m.createRadialGradient(90, 35, 4, 90, 35, 88);
    mg.addColorStop(0, `rgba(${th.wash},0.34)`);
    mg.addColorStop(0.65, `rgba(${th.wash},0.13)`);
    mg.addColorStop(1, `rgba(${th.wash},0)`);
    m.fillStyle = mg;
    m.save(); m.translate(90, 35); m.scale(1, 0.42); m.translate(-90, -35);
    m.beginPath(); m.arc(90, 35, 88, 0, TAU); m.fill();
    m.restore();
    TP.mist = mc;
    TP.bands = [];
    if (!S.reduced) {
      for (let i = 0; i < 5; i++) {
        TP.bands.push({
          x: Math.random() * w,
          y: H * (0.34 + (i % 2) * 0.16) + (Math.random() - 0.5) * H * 0.05,
          v: (5 + Math.random() * 9) * (Math.random() < 0.5 ? 1 : -1),
          s: 1.3 + Math.random() * 1.7,
          a: 0.5 + Math.random() * 0.5,
        });
      }
    }
  }

  function tpMists(c, tier, dt) {
    const S = G.S;
    for (let i = 0; i < TP.bands.length; i++) {
      if ((i % 2) !== tier) continue;
      const bd = TP.bands[i];
      if (!S.reduced) {
        bd.x += bd.v * dt;
        if (bd.x > TP.w + 150) bd.x = -150; else if (bd.x < -150) bd.x = TP.w + 150;
      }
      c.globalAlpha = bd.a;
      c.drawImage(TP.mist, bd.x - TP.w / 2 - 36 - 90 * bd.s, bd.y - S.H / 2 - 35 * bd.s, 180 * bd.s, 70 * bd.s);
    }
    c.globalAlpha = 1;
  }

  /* distant cranes: every so often a small flock crosses the sky */
  function tpCrane(c, cr, t, S) {
    const flap = Math.sin(t * 5 + cr.ph);
    c.save();
    c.translate(cr.x - S.W / 2, cr.y - S.H / 2 + Math.sin(t * 1.3 + cr.ph) * 5);
    c.scale(cr.s * (cr.vx < 0 ? -1 : 1), cr.s);
    c.strokeStyle = INK;
    c.globalAlpha = 0.5;
    c.lineCap = 'round';
    c.lineWidth = 1.7;
    c.beginPath();
    c.moveTo(-11, -6 - flap * 6);
    c.quadraticCurveTo(-5, -flap * 3, 0, 0);
    c.quadraticCurveTo(5, -flap * 3, 11, -6 - flap * 6);
    c.stroke();
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(-4, 1.5); c.lineTo(7, -0.5); c.stroke();
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(7, -0.5); c.lineTo(12.5, -3); c.stroke();
    c.restore();
  }

  function tpCranes(c, t, dt) {
    const S = G.S;
    if (S.reduced) { TP.cranes.length = 0; TP.nextFlock = t + 9; return; }
    if (!TP.cranes.length && t > TP.nextFlock) {
      const n = 1 + ((Math.random() * 2.4) | 0);
      const dir = Math.random() < 0.5 ? 1 : -1;
      const y0 = S.H * (0.12 + Math.random() * 0.17);
      const sp = 34 + Math.random() * 24;
      for (let i = 0; i < n; i++) {
        TP.cranes.push({
          x: dir > 0 ? -70 - i * 52 : S.W + 70 + i * 52,
          y: y0 + (Math.random() - 0.5) * 46,
          vx: dir * (sp + Math.random() * 12),
          ph: Math.random() * TAU,
          s: 0.75 + Math.random() * 0.55,
        });
      }
    }
    let alive = false;
    for (const cr of TP.cranes) {
      cr.x += cr.vx * dt;
      if (cr.x > -80 && cr.x < S.W + 80) { alive = true; tpCrane(c, cr, t, S); }
    }
    if (!alive && TP.cranes.length) {
      TP.cranes.length = 0;
      TP.nextFlock = t + 12 + Math.random() * 16;
    }
  }

  function drawTitlePanorama(c, t, dt) {
    const S = G.S;
    if (TP.key !== themeKey || TP.w !== S.W || TP.h !== S.H) tpBuild();
    const par = S.reduced ? { x: 0, y: 0 } : (S.titlePar || { x: 0, y: 0 });
    const k = Math.min(1, dt * 3);
    TP.px += (par.x - TP.px) * k;
    TP.py += (par.y - TP.py) * k;
    const breath = Math.sin(t * 0.11) * 3;
    const ox = -S.W / 2 - 36, oy = -S.H / 2;
    const L = TP.layers;
    c.drawImage(L[0], ox - TP.px * 6 + breath, oy - TP.py * 3);
    tpMists(c, 0, dt);
    c.drawImage(L[1], ox - TP.px * 13 + breath * 0.6, oy - TP.py * 6);
    tpMists(c, 1, dt);
    c.drawImage(L[2], ox - TP.px * 22 + breath * 0.3, oy - TP.py * 10);
    tpCranes(c, t, dt);
  }

  function draw(ctx, t) {
    const S = G.S;
    const dt = Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    if (!S.W || !S.H) return;
    if (S.beginT > 0) S.beginT = Math.max(0, S.beginT - dt);
    ensureTiles(ctx, S.dpr);
    setTheme(activeThemeKey());
    stampStains(S);
    updateStains(dt);

    const playing = S.mode === 'playing' || S.mode === 'paused' || S.mode === 'upgrade' || S.mode === 'dying' || S.mode === 'cutscene';
    /* the camera rests wherever the sheet was last stood upon */
    const useCam = S.mode !== 'title';
    const camX = useCam ? S.cam.x : 0;
    const camY = useCam ? S.cam.y : 0;

    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);

    /* ===== the world ===== */
    ctx.save();
    let shx = 0, shy = 0;
    if (S.shake > 0.2 && !S.reduced) {
      shx = (Math.random() - 0.5) * S.shake;
      shy = (Math.random() - 0.5) * S.shake;
    }
    ctx.translate(S.W / 2 + shx - camX, S.H / 2 + shy - camY);

    /* the endless paper, tiled beneath everything */
    const vx0 = camX - S.W / 2 - 8, vx1 = camX + S.W / 2 + 8;
    const vy0 = camY - S.H / 2 - 8, vy1 = camY + S.H / 2 + 8;
    const tile = tiles[themeKey] || tiles.pale;
    for (let ty = Math.floor(vy0 / TILE); ty <= Math.floor(vy1 / TILE); ty++) {
      for (let tx = Math.floor(vx0 / TILE); tx <= Math.floor(vx1 / TILE); tx++) {
        /* one pixel of overlap: under a fractional camera and a
           fractional dpr the tile rims used to antialias apart and
           print a phantom grid of hairline seams across the sheet */
        ctx.drawImage(tile, tx * TILE, ty * TILE, TILE + 1, TILE + 1);
      }
    }

    /* faint marks so the sheet feels hand-made and the motion reads */
    drawDecor(ctx, vx0, vy0, vx1, vy1);

    /* the painting itself — grown wave by wave across the sheet */
    drawLandscape(ctx, vx0, vy0, vx1, vy1, t);

    /* on the title the sheet rests: a living handscroll panorama */
    if (S.mode === 'title') drawTitlePanorama(ctx, t, dt);

    /* dried ink from every fight before this moment */
    const cullM = 80;
    for (const st of stains) {
      if (st.x < vx0 - cullM || st.x > vx1 + cullM || st.y < vy0 - cullM || st.y > vy1 + cullM) continue;
      ctx.globalAlpha = Math.max(0, st.a * (1 - st.age * CFG.world.stainFade));
      ctx.drawImage(st.spr, st.x - st.half, st.y - st.half, st.half * 2, st.half * 2);
    }
    ctx.globalAlpha = 1;

    for (const pd of S.puddles) drawPuddle(ctx, pd);
    for (const vz of S.vortices) drawVortex(ctx, vz);
    if (!S.reduced) updateAmbient(dt, S);
    if (!S.reduced) updateWeather(dt, S, themeKey);

    for (const m of S.markers) drawMarker(ctx, m);
    for (const r of S.rings) drawRing(ctx, r);
    for (const tg of S.telgs) drawTelg(ctx, tg, t);
    for (const b of S.bullets) b.kind === 'boomer' ? drawBoomer(ctx, b) : drawBullet(ctx, b);
    for (const b of S.ebullets) drawEBullet(ctx, b);
    for (const e of S.enemies) drawEnemy(ctx, e, t);
    /* the wanderers keep to the valley, faint, like distant spirits */
    if (S.idle.length) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      for (const d of S.idle) drawEnemy(ctx, d, t);
      ctx.restore();
    }
    for (const mt of S.motes) drawMote(ctx, mt, t);
    for (const pk of S.pickups) drawPickup(ctx, pk, t);
    for (const sp of S.spirits) drawSpirit(ctx, sp);
    /* the player stands only where the first stroke has already passed */
    const washHides = S.beginT > 0 && washTipX(S.beginT) < S.W / 2 + S.player.x - S.cam.x;
    if (playing && !washHides) drawPlayer(ctx, t);
    for (const s of S.stamps) drawStamp(ctx, s);
    for (const ar of S.arcs) drawArcFx(ctx, ar);
    for (const bo of S.bolts) drawBolt(ctx, bo);
    for (const p of S.particles) drawParticle(ctx, p);
    for (const p of S.popups) drawPopup(ctx, p);

    /* the ambient rain and the visitor's ink live in screen space */
    ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    drawAmbient(ctx);
    drawPaint(ctx, t);

    ctx.restore();

    /* ===== screen space ===== */
    /* the first stroke: a run begins as the brush paints the sheet in */
    if (S.beginT > 0 && playing) drawBeginWash(ctx, S.beginT, t);
    drawJoy(ctx);
    drawIndicators(ctx);
    if (!S.reduced) drawWeather(ctx, S);

    /* the title ceremony lives above the paper, below the words */
    if (S.mode === 'title') rtFrame(t, dt);

    /* the rim of the eye: a quiet vignette, deeper when the ink is low.
       the gradient is rebuilt only when its shape truly changes —
       two gradient constructions a frame is two too many. */
    const th = THEMES[themeKey];
    const lowHp = S.stats && S.stats.hp === 1 && (S.mode === 'playing' || S.mode === 'paused');
    const vgKey = `${S.W | 0}|${S.H | 0}|${themeKey}|${lowHp ? 1 : 0}|${(S.dpr * 100) | 0}`;
    if (vgKey !== vg.key) {
      vg.key = vgKey;
      const g = ctx.createRadialGradient(S.W / 2, S.H / 2, Math.min(S.W, S.H) * 0.42, S.W / 2, S.H / 2, Math.max(S.W, S.H) * 0.74);
      g.addColorStop(0, `rgba(${th.vig},0)`);
      g.addColorStop(1, `rgba(${th.vig},${lowHp ? 0.3 : 0.17})`);
      vg.grad = g;
    }
    ctx.fillStyle = vg.grad;
    ctx.fillRect(0, 0, S.W, S.H);

    /* bleeding seal: low integrity stains the edges red (cached shape,
       the pulse rides on globalAlpha instead of a rebuilt gradient) */
    if (lowHp) {
      const rbKey = `${S.W | 0}|${S.H | 0}|${(S.dpr * 100) | 0}`;
      if (rbKey !== vg.rbKey) {
        vg.rbKey = rbKey;
        const g = ctx.createRadialGradient(S.W / 2, S.H / 2, Math.min(S.W, S.H) * 0.36, S.W / 2, S.H / 2, Math.max(S.W, S.H) * 0.66);
        g.addColorStop(0, 'rgba(178,58,43,0)');
        g.addColorStop(1, 'rgba(178,58,43,0.23)');
        vg.rGrad = g;
      }
      ctx.globalAlpha = Math.min(1, (0.14 + 0.09 * Math.abs(Math.sin(t * 5))) / 0.23);
      ctx.fillStyle = vg.rGrad;
      ctx.fillRect(0, 0, S.W, S.H);
      ctx.globalAlpha = 1;
    }

    /* a boss's death washes the eye in vermilion for a breath */
    if (S.redFlash > 0 && playing) {
      ctx.globalAlpha = Math.min(0.42, S.redFlash * 0.8);
      ctx.fillStyle = RED;
      ctx.fillRect(0, 0, S.W, S.H);
      ctx.globalAlpha = 1;
    }
  }

  /* the title's brush cards: each tool drawn across its kanji */
  function drawBrushPreview(cv, id) {
    if (!cv || !cv.getContext) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 120;
    const h = cv.clientHeight || 40;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const ink = '#1a1714';
    const b = (typeof CFG !== 'undefined' && CFG.brushes && CFG.brushes[id]) || {};
    /* the brush itself (the slip's own kanji sits above it in the DOM) */
    c.save();
    c.translate(w / 2 - 5, h / 2 + 3);
    c.rotate(-0.14);
    drawBrushTool(c, id, { len: Math.max(1.4, w / 44), wet: 0.35, seed: 91, ink, paper: '#ede7d9' });
    c.restore();
  }

  return { draw, resetStains, startTitleRitual: rtStart, drawBrushPreview, titleInkMove, titleInkSplash };
})();
