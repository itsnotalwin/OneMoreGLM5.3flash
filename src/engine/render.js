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
  /* v20 THE RED/BLACK LAW — the paper carries only two classes of
     beast: the BOSSES (Guardians, the ten seals' keepers, the
     captains) burn the one sacred vermillion, brightened on the
     night sheet so it still burns there; the HORDE walks in the
     sheet's own ink — black on the daylight papers, the lamp-pale
     inverse on the night scroll, where black could never read. */
  function bossInk() { return themeKey === 'dark' ? '#c9462e' : RED; }
  const TAU = Math.PI * 2;

  /* ---------------- paper themes ----------------
     Each sheet is washed in its own ink: 淡 pale warm wash,
     濃 lamp-black, 朱 vermillion-stained, 雨 rain-grey,
     金 gold-dust. `tint` bends the whole world's ink toward
     that paper's colour — beasts, strokes and inscriptions
     are all ground in the same ink as the sheet they haunt. */
  const THEMES = {
    pale:  { paper: '#ede7d9', ink: '#1a1714', tint: '#322616', vig: '58,52,40',  wash: '112,102,80',  washA: 0.021, fiber: [70,62,48],  speck: '50,45,36',    weather: 'motes'  },
    dark:  { paper: '#3e372b', ink: '#e9e2d2', tint: '#f6efdc', vig: '0,0,0',     wash: '237,231,217', washA: 0.017, fiber: [200,194,178], speck: '220,214,198', weather: 'embers' },
    red:   { paper: '#eadbc4', ink: '#1a1714', tint: '#4a211a', vig: '122,42,26', wash: '178,58,43',   washA: 0.031, fiber: [70,62,48],  speck: '50,45,36',    weather: 'petals' },
    storm: { paper: '#c7cdc9', ink: '#161c1f', tint: '#1e3240', vig: '26,38,44',  wash: '58,74,84',    washA: 0.03,  fiber: [56,66,70],  speck: '40,52,58',    weather: 'rain'   },
    gilt:  { paper: '#e7d6ad', ink: '#241c12', tint: '#4a360e', vig: '96,70,20',  wash: '166,124,44',  washA: 0.035, fiber: [96,78,44],  speck: '120,92,40',   weather: 'gold'   },
    silk:  { paper: '#f3eee1', ink: '#201d24', tint: '#3c3648', vig: '64,58,74',  wash: '118,108,132', washA: 0.024, fiber: [96,88,108], speck: '84,76,96',    weather: 'silk'   },
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
  const vg = { key: '', grad: null, rbKey: '', rGrad: null, bake: null };

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
    /* the title wears ink by choice (v19): the setting's theme — or,
       in AUTO, the highest unlocked scroll's ink, so the paper the
       hand owns is the paper the title wears */
    const pref = (typeof G.getThemeSetting === 'function') ? G.getThemeSetting() : 'auto';
    if (pref && pref !== 'auto' && THEMES[pref]) return pref;
    const unlocked = (typeof G.getUnlocked === 'function') ? G.getUnlocked() : 1;
    return AREAS[Math.min(AREAS.length, Math.max(1, unlocked)) - 1].theme;
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
    /* the blank silk: a faint woven weave and a few stray threads */
    if (key === 'silk') {
      /* the warp — every fourteenth thread a hair darker, like laid silk */
      p.strokeStyle = 'rgba(84,76,96,0.05)';
      p.lineWidth = 1;
      for (let x = 7; x < TILE; x += 14) {
        p.beginPath();
        p.moveTo(x + (rnd() - 0.5), 0);
        p.lineTo(x + (rnd() - 0.5), TILE);
        p.stroke();
      }
      /* stray threads that escaped the loom */
      for (let i = 0; i < 4; i++) {
        const y = rnd() * TILE, x0 = rnd() * TILE, l = 60 + rnd() * 120;
        p.strokeStyle = `rgba(${th.speck},${0.05 + rnd() * 0.05})`;
        p.lineWidth = 0.8;
        p.beginPath();
        p.moveTo(x0, y);
        p.bezierCurveTo(x0 + l * 0.3, y + (rnd() - 0.5) * 10, x0 + l * 0.7, y + (rnd() - 0.5) * 10, x0 + l, y + (rnd() - 0.5) * 6);
        p.stroke();
      }
    }
    return c;
  }

  function ensureTiles(ctx, dpr) {
    ensurePatterns(ctx);
    if (tileDpr === dpr && tiles.pale && tiles.storm && tiles.gilt && tiles.silk) return;
    tileDpr = dpr;
    tiles = {
      pale: buildTile('pale', dpr),
      dark: buildTile('dark', dpr),
      red: buildTile('red', dpr),
      storm: buildTile('storm', dpr),
      gilt: buildTile('gilt', dpr),
      silk: buildTile('silk', dpr),
    };
  }

  /* ---------------- brush primitives ----------------
     The two hot path builders write into module-level typed scratch —
     at the horde cap the old per-call arrays and closures added up to
     a few thousand short-lived objects every frame. */
  const BLOB = new Float64Array(2 * 24);
  function blobPath(c, x, y, r, seed, wob = 0.16, n = 11) {
    const rnd = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 + (rnd() * 2 - 1) * wob);
      BLOB[i * 2] = x + Math.cos(a) * rr;
      BLOB[i * 2 + 1] = y + Math.sin(a) * rr;
    }
    c.beginPath();
    let mx = (BLOB[(n - 1) * 2] + BLOB[0]) / 2;
    let my = (BLOB[(n - 1) * 2 + 1] + BLOB[1]) / 2;
    c.moveTo(mx, my);
    for (let i = 0; i < n; i++) {
      const j = ((i + 1) % n) * 2;
      mx = (BLOB[i * 2] + BLOB[j]) / 2;
      my = (BLOB[i * 2 + 1] + BLOB[j + 1]) / 2;
      c.quadraticCurveTo(BLOB[i * 2], BLOB[i * 2 + 1], mx, my);
    }
    c.closePath();
  }

  /* tapered calligraphic stroke through pts (max width at belly) —
     same typed-scratch discipline: the edge offsets land in reusable
     buffers that grow once and never again */
  let _stN = 0, _stL = new Float64Array(0), _stR = new Float64Array(0);
  function strokeScratch(n) {
    if (n > _stN) {
      _stN = n;
      _stL = new Float64Array(n * 2);
      _stR = new Float64Array(n * 2);
    }
  }
  function inkStroke(c, pts, maxW, o = {}) {
    if (pts.length < 2) return;
    const n = pts.length;
    strokeScratch(n);
    const rnd = mulberry(o.seed ?? 7);
    const taper = o.taper ?? 0.75;
    const jit = o.jit ?? 0.18;
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(n - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
      let dx = q.x - r0.x, dy = q.y - r0.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const t = i / (n - 1);
      const prof = Math.pow(Math.sin(Math.PI * Math.min(0.999, Math.max(0.001, t))), taper);
      const w = Math.max(0.35, maxW * prof * (1 - jit + rnd() * jit * 2));
      _stL[i * 2] = pts[i].x - dy * w / 2;
      _stL[i * 2 + 1] = pts[i].y + dx * w / 2;
      _stR[i * 2] = pts[i].x + dy * w / 2;
      _stR[i * 2 + 1] = pts[i].y - dx * w / 2;
    }
    c.save();
    c.beginPath();
    c.moveTo(_stL[0], _stL[1]);
    for (let i = 1; i < n; i++) c.lineTo(_stL[i * 2], _stL[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(_stR[i * 2], _stR[i * 2 + 1]);
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

  /* ---- v25: zero-GC calligraphic ribbon & hand-cut seal primitives ----
     Reads a circular Float32Array trail + live head directly into reusable
     typed buffers: silky tapered brush ribbons at zero allocation per frame. */
  const _rbX = new Float64Array(32), _rbY = new Float64Array(32);
  function drawRibbon(c, tr, hx, hy, headW, o) {
    if (!tr || tr.len < 1) return;
    let n = 0;
    const step = tr.len;
    for (let i = step - 1; i >= 0; i--) {
      const idx = (tr.head - i + tr.cap * 2) % tr.cap;
      const px = tr.tx[idx], py = tr.ty[idx];
      if (n > 0 && Math.hypot(px - _rbX[n - 1], py - _rbY[n - 1]) < 1.2) continue;
      _rbX[n] = px; _rbY[n] = py; n++;
      if (n >= 30) break;
    }
    if (n === 0 || Math.hypot(hx - _rbX[n - 1], hy - _rbY[n - 1]) >= 0.8) {
      _rbX[n] = hx; _rbY[n] = hy; n++;
    }
    if (n < 2) return;
    strokeScratch(n);
    const pow = (o && o.pow) || 0.85;
    const wave = (o && o.wave) || 0;
    const phase = (o && o.phase) || 0;
    for (let i = 0; i < n; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      let dx = _rbX[i1] - _rbX[i0], dy = _rbY[i1] - _rbY[i0];
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const u = i / (n - 1);   /* 0 = drying tail, 1 = wet brush head */
      const bell = u > 0.88 ? Math.sin(((1 - u) / 0.12) * Math.PI * 0.5) * 0.65 + 0.35 : 1;
      const w = Math.max(0.25, headW * Math.pow(u, pow) * bell);
      const sw = wave ? Math.sin(phase + u * 6.5) * wave * (1 - u * 0.5) : 0;
      const cx = _rbX[i] - dy * sw, cy = _rbY[i] + dx * sw;
      _stL[i * 2] = cx - dy * w * 0.5;
      _stL[i * 2 + 1] = cy + dx * w * 0.5;
      _stR[i * 2] = cx + dy * w * 0.5;
      _stR[i * 2 + 1] = cy - dx * w * 0.5;
    }
    c.save();
    c.beginPath();
    c.moveTo(_stL[0], _stL[1]);
    for (let i = 1; i < n; i++) c.lineTo(_stL[i * 2], _stL[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(_stR[i * 2], _stR[i * 2 + 1]);
    c.closePath();
    c.globalAlpha = (o && o.alpha) ?? 0.85;
    c.fillStyle = (o && o.color) || INK;
    c.fill();
    /* kasure: dry-brush paper seams splitting through fast heavy strokes */
    if (o && o.dry && headW >= 4.5 && n >= 4) {
      c.strokeStyle = o.dryColor || PAPER;
      c.lineCap = 'round';
      for (const sgn of [-0.22, 0.2]) {
        c.globalAlpha = ((o && o.alpha) ?? 0.85) * 0.42;
        c.lineWidth = Math.max(0.65, headW * 0.09);
        c.beginPath();
        const end = Math.max(2, Math.floor(n * 0.82));
        for (let i = 1; i < end; i++) {
          const k = 0.5 + sgn;
          const x = _stL[i * 2] * k + _stR[i * 2] * (1 - k);
          const y = _stL[i * 2 + 1] * k + _stR[i * 2 + 1] * (1 - k);
          i === 1 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    if (o && o.seam && n >= 3) {
      c.strokeStyle = o.seam;
      c.globalAlpha = ((o && o.alpha) ?? 0.85) * 0.78;
      c.lineWidth = Math.max(0.75, headW * 0.14);
      c.lineCap = 'round';
      c.beginPath();
      const s0 = Math.floor(n * 0.25);
      for (let i = s0; i < n; i++) {
        const x = (_stL[i * 2] + _stR[i * 2]) * 0.5;
        const y = (_stL[i * 2 + 1] + _stR[i * 2 + 1]) * 0.5;
        i === s0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.stroke();
    }
    c.restore();
  }

  /* hand-carved square hanko edge — organic stone border, never a ruler rect */
  function stampBoxPath(c, half, seed, wob) {
    const w = wob ?? 0.055;
    let s = (seed | 0) || 77;
    const nxt = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return ((s >>> 0) / 4294967296) - 0.5; };
    const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const per = 4, tot = 16;
    for (let e = 0; e < 4; e++) {
      const a = cs[e], b = cs[(e + 1) % 4];
      for (let i = 0; i < per; i++) {
        const u = i / per;
        const k = (e * per + i) * 2;
        BLOB[k] = (a[0] + (b[0] - a[0]) * u + nxt() * w * 2) * half;
        BLOB[k + 1] = (a[1] + (b[1] - a[1]) * u + nxt() * w * 2) * half;
      }
    }
    c.beginPath();
    c.moveTo((BLOB[(tot - 1) * 2] + BLOB[0]) * 0.5, (BLOB[(tot - 1) * 2 + 1] + BLOB[1]) * 0.5);
    for (let i = 0; i < tot; i++) {
      const j = ((i + 1) % tot) * 2;
      c.quadraticCurveTo(BLOB[i * 2], BLOB[i * 2 + 1], (BLOB[i * 2] + BLOB[j]) * 0.5, (BLOB[i * 2 + 1] + BLOB[j + 1]) * 0.5);
    }
    c.closePath();
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

  /* ---------------- stains: dried ink, cached as sprites ----------------
     Sprites come from a reuse pool — a boss death used to mint a
     1136px canvas and a synchronous texture upload mid-frame; the
     pool hands back an old sheet instead, cleared and re-stamped. */
  const stainPool = [];
  function acquireStain(half) {
    const need = half * 2 * 2;
    for (let i = 0; i < stainPool.length; i++) {
      if (stainPool[i].width >= need) return stainPool.splice(i, 1)[0];
    }
    const cv = document.createElement('canvas');
    cv.width = cv.height = need;
    return cv;
  }
  function releaseStain(cv) {
    if (stainPool.length < 24) stainPool.push(cv);
  }
  function stampStains(S) {
    if (!S.stainQueue.length) return;
    for (const q of S.stainQueue) {
      /* a stain without a real place or size is never inked: one NaN here
         once made a zero-pixel sprite that threw in the draw every frame */
      if (!(q && isFinite(q.r) && isFinite(q.x) && isFinite(q.y))) continue;
      const r = Math.max(2.4, q.r);
      const scale = 2; /* render sprites at 2x for crisp hidpi */
      const half = Math.ceil(r * 3.3);   /* headroom: no splat ever clips square */
      const spr = acquireStain(half);
      const g = spr.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, spr.width, spr.height);
      g.setTransform(scale, 0, 0, scale, half * scale, half * scale);
      splatPaint(g, 0, 0, r, (Math.random() * 1e9) | 0, q.alpha ?? 0.5, q.red ? RED : INK);
      stains.push({ x: q.x, y: q.y, a: q.alpha ?? 0.5, age: 0, spr, half });
    }
    S.stainQueue.length = 0;
    while (stains.length > CFG.world.stainCap) {
      releaseStain(stains[0].spr);
      stains.shift();
    }
  }

  function updateStains(dt) {
    const fade = CFG.world.stainFade;
    for (let i = stains.length - 1; i >= 0; i--) {
      const st = stains[i];
      st.age += dt;
      if (st.a * (1 - st.age * fade) <= 0.02) {
        releaseStain(st.spr);
        stains[i] = stains[stains.length - 1];
        stains.pop();
      }
    }
  }

  function resetStains() {
    for (const st of stains) releaseStain(st.spr);
    stains.length = 0;
  }

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
          c.font = `${64 + Math.floor(ry * 56)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
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
      /* prime the decoders now: the first drawImage of a wash must not
         stall the frame it lands in */
      if (d.decode) d.decode().catch(() => {});
      if (p.decode) p.decode().catch(() => {});
      WASH[k] = { d, p };
    }
  })();
  function washReady(key) {
    const w = WASH[key];
    const i = themeKey === 'dark' ? w.p : w.d;
    return (i.complete && i.naturalWidth > 0) ? i : null;
  }

  /* pre-scaled wash rasters: widths quantized to 48px buckets and the
     mirror baked — the frame blits a ready sheet instead of resampling
     a 1050px master a dozen times a frame (the cache breathes: rare
     sizes re-bake once when an old one is retaken) */
  const washCache = new Map();
  function washRaster(img, wid, flip) {
    const key = img.src + '|' + wid + '|' + flip;
    let cv = washCache.get(key);
    if (cv) return cv;
    const hgt = Math.max(1, Math.round(wid * img.naturalHeight / img.naturalWidth));
    cv = document.createElement('canvas');
    cv.width = wid;
    cv.height = hgt;
    const g = cv.getContext('2d');
    if (flip === -1) { g.translate(wid, 0); g.scale(-1, 1); }
    g.drawImage(img, 0, 0, wid, hgt);
    washCache.set(key, cv);
    if (washCache.size > 48) {
      washCache.delete(washCache.keys().next().value);
    }
    return cv;
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
      [el('bamboo', 0.30, 0.85, 1.25, 0.74, '竹林')],
      [el('pineOld', 0.26, 0.9, 1.3, 0.86, '古松'), el('lantern', 0.18, 0.85, 1.05, 0.74, '燈籠')],
      [mist(0.18)],
      [wash('guo2', 990, 1270, 0.21, 0.30, '山居')],
      [el('crane', 0.30, 0.9, 1.2, 0.72), el('pineYoung', 0.22, 0.9, 1.2, 0.70)],
      [wash('kuan', 1050, 1380, 0.18, 0.26, '層巒')],
      [el('reeds', 0.26, 0.9, 1.3, 0.60), el('deadTree', 0.15, 0.9, 1.1, 0.68, '古木')],
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
      [wash('shore', 990, 1270, 0.24, 0.33, '汀')],
      [seal(), mist(0.12)],
    ],
    red: [    /* CINNABAR FIELD — vermillion country, gates and cliffs */
      [el('maple', 0.30, 0.85, 1.2, 0.78), el('reeds', 0.22, 0.8, 1.2, 0.58)],
      [wash('hab2', 900, 1140, 0.22, 0.31, '遠崖')],
      [el('maple', 0.24, 0.9, 1.25, 0.74)],
      [el('torii', 0.22, 0.85, 1.15, 0.90, '鳥居')],
      [mist(0.17)],
      [wash('cliff', 1050, 1380, 0.21, 0.30, '絕壁')],
      [el('deadTree', 0.26, 0.9, 1.2, 0.78, '古木'), el('lantern', 0.18, 0.85, 1.05, 0.72)],
      [wash('guo', 990, 1320, 0.18, 0.27, '疊嶂'), el('crane', 0.26, 0.9, 1.2, 0.61)],
      [el('bamboo', 0.24, 0.85, 1.2, 0.66)],
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
      [el('reeds', 0.26, 0.9, 1.3, 0.58, null, { bend: 1 })],
      [seal(), mist(0.12)],
    ],
    gilt: [   /* GILT SCROLL — the final page, gold and ceremony */
      [el('pineYoung', 0.30, 0.8, 1.2, 0.78), el('reeds', 0.22, 0.8, 1.2, 0.62)],
      [wash('kuan', 990, 1320, 0.20, 0.27, '遠嶽')],
      [el('bamboo', 0.28, 0.85, 1.25, 0.74)],
      [el('pavilion', 0.20, 0.85, 1.15, 0.90, '樓閣')],
      [mist(0.16)],
      [wash('guo', 1050, 1380, 0.21, 0.30, '金山')],
      [el('pineOld', 0.26, 0.95, 1.3, 0.84, '古松'), el('lantern', 0.18, 0.85, 1.05, 0.72)],
      [wash('shu2', 935, 1210, 0.21, 0.29), el('crane', 0.28, 0.9, 1.2, 0.64)],
      [wash('shore', 990, 1270, 0.22, 0.32, '汀')],
      [seal(), mist(0.12), el('crane', 0.30, 1, 1.3, 0.58)],
    ],
    silk: [   /* THE BLANK SILK — the underdrawing wakes on unstained silk */
      [el('reeds', 0.22, 0.85, 1.2, 0.5)],
      [wash('hab2', 900, 1140, 0.16, 0.22, '遠山')],
      [],   /* the blank silk keeps its emptiness */
      [wash('trees', 1050, 1320, 0.13, 0.2, '下絵')],
      [mist(0.2)],
      [wash('guo2', 990, 1270, 0.15, 0.22, '無字')],
      [el('deadTree', 0.2, 0.9, 1.2, 0.62, '古木'), el('crane', 0.22, 0.9, 1.2, 0.5)],
      [wash('kuan', 1050, 1380, 0.14, 0.21, '絹目')],
      [wash('shore', 990, 1270, 0.16, 0.24, '汀')],
      [seal(), mist(0.14)],
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
    c.font = '13px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
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
    c.font = '44px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(kanji, 0, 3);
    c.restore();
  }

  const RG = 1150;   /* region grid — master washes, moon, seal */
  const CE = 575;    /* cell grid — near scenery */

  /* ============================================================
     THE LANDSCAPE, BAKED (v25)
     The scenery is a deterministic function of world position: the same
     cell always paints the same mountain, whatever the frame. It was
     being re-painted every frame — six overlapping near-full-screen
     washes, ~25MP of blended blits against a ~4MP viewport, on top of
     hundreds of element draws. Now it is baked once into world-space
     tiles and blitted, which cuts the painted area to roughly the
     viewport and turns those hundreds of draws into a handful of blits.

     The newest layer still fades in live while it is revealing, so the
     wave-by-wave growth of the sheet reads exactly as before.
     ============================================================ */
  const LTILE = 640;
  const LMARGIN = 780;            // any wash that could still touch a tile
  let ltiles = new Map();
  let lkey = '';
  let lbudget = 0;

  /* every layer group, drawn into a world rectangle. Used both to bake
     tiles and to paint a layer live while it reveals. */
  function washReadyMask(spec, upto) {
    let mask = 0, bit = 1;
    for (let k = 0; k < upto && k < spec.length; k++) {
      const layer = spec[k];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) {
        if (layer[i].t === 'wash') {
          if (washReady(layer[i].img)) mask |= bit;
          bit <<= 1;
        }
      }
    }
    return mask;
  }

  function paintLandscapeRegion(c, x0, y0, x1, y1, kFrom, kTo, reveal, spec, area, B, activeWv) {
    const gw0 = Math.floor((x0 - LMARGIN) / RG), gw1 = Math.floor((x1 + LMARGIN) / RG);
    const gh0 = Math.floor((y0 - LMARGIN) / RG), gh1 = Math.floor((y1 + LMARGIN) / RG);
    const ge0 = Math.floor((x0 - 260) / CE), ge1 = Math.floor((x1 + 260) / CE);
    const gf0 = Math.floor((y0 - 260) / CE), gf1 = Math.floor((y1 + 260) / CE);
    const newest = (activeWv != null ? activeWv : kTo) - 1;
    for (let k = kFrom; k < kTo; k++) {
      const layer = spec[k];
      if (!layer) continue;
      const fade = k === newest ? reveal : 1;
      if (fade <= 0.02) continue;
      for (const L of layer) {
        if (L.t === 'wash') {
          const img = washReady(L.img);
          if (!img) continue;
          for (let gy = gh0; gy <= gh1; gy++) {
            for (let gx = gw0; gx <= gw1; gx++) {
              const h1 = hash2(gx * 13 + k * 71, gy * 29 + k * 17);
              const x = gx * RG + h1 * RG * 0.7 + RG * 0.15;
              const y = gy * RG + hash2(gx * 7 - k * 3, gy * 11 + k * 41) * RG * 0.6 + RG * 0.2;
              const wid = L.w0 + h1 * (L.w1 - L.w0);
              const widQ = Math.max(48, Math.round(wid / 48) * 48);
              const hgt = widQ * img.naturalHeight / img.naturalWidth;
              if (x + widQ / 2 < x0 || x - widQ / 2 > x1 || y + hgt / 2 < y0 || y - hgt / 2 > y1) continue;
              const flip = hash2(gx + k * 5, gy * 3 - k) > 0.5 ? -1 : 1;
              const a = (L.a0 + hash2(gx * 3, gy * 5 + k) * (L.a1 - L.a0)) * fade;
              const ras = washRaster(img, widQ, flip);
              c.globalAlpha = a;
              c.drawImage(ras, x - widQ / 2, y - hgt / 2);
              if (L.label && hash2(gx * 17 + k, gy * 5) > 0.7) {
                drawInscription(c, x + flip * widQ * 0.44, y - hgt * 0.36, L.label, Math.min(0.5, a * 3));
              }
            }
          }
        } else if (L.t === 'el') {
          const sp = B[L.name];
          if (!sp) continue;
          for (let gy = gf0; gy <= gf1; gy++) {
            for (let gx = ge0; gx <= ge1; gx++) {
              const h1 = hash2(gx * 31 + k * 97 + 7, gy * 17 - k * 13);
              if (h1 > L.chance) continue;
              const x = gx * CE + hash2(gx * 5 + k, gy * 23 + k * 3) * CE;
              const y = gy * CE + hash2(gx * 11 - k, gy * 7 + k * 19) * CE;
              const sc = L.s0 + hash2(gx + k * 2, gy - k) * (L.s1 - L.s0);
              if (x + sp.w * sc / 2 < x0 || x - sp.w * sc / 2 > x1 || y + sp.h * sc / 2 < y0 || y - sp.h * sc / 2 > y1) continue;
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
          for (let gy = gh0; gy <= gh1; gy++) {
            for (let gx = gw0; gx <= gw1; gx++) {
              const h1 = hash2(gx * 41 + k * 23, gy * 13 + k * 7);
              if (h1 > 0.8) continue;
              const x = gx * RG + hash2(gx + k, gy * 3) * RG;
              const y = gy * RG + hash2(gx * 5, gy + k * 11) * RG;
              const wid = 480 + h1 * 420;
              if (x + wid / 2 < x0 || x - wid / 2 > x1 || y + wid * 0.16 < y0 || y - wid * 0.16 > y1) continue;
              c.save();
              c.translate(x, y);
              c.globalAlpha = L.a * fade * (0.55 + h1 * 0.5);
              c.drawImage(sp.cv, -wid / 2, -wid * 0.16, wid, wid * 0.32);
              c.restore();
            }
          }
        } else if (L.t === 'moon') {
          const sp = B.moon;
          for (let gy = gh0; gy <= gh1; gy++) {
            for (let gx = gw0; gx <= gw1; gx++) {
              if (hash2(gx * 19 + 3, gy * 43 + 11) > 0.55) continue;
              const x = gx * RG + hash2(gx * 7, gy * 17) * RG;
              const y = gy * RG + hash2(gx * 23, gy * 5) * RG;
              const sc = 0.9 + hash2(gx, gy * 29) * 0.5;
              if (x + 80 * sc < x0 || x - 80 * sc > x1 || y + 80 * sc < y0 || y - 80 * sc > y1) continue;
              c.save();
              c.translate(x, y);
              c.globalAlpha = fade;
              c.drawImage(sp.cv, -80 * sc, -80 * sc, 160 * sc, 160 * sc);
              c.restore();
            }
          }
        } else if (L.t === 'seal') {
          for (let gy = gh0; gy <= gh1; gy++) {
            for (let gx = gw0; gx <= gw1; gx++) {
              if (hash2(gx * 53 + 9, gy * 7 + 31) > 0.5) continue;
              const x = gx * RG + hash2(gx * 11, gy * 37) * RG;
              const y = gy * RG + hash2(gx * 43, gy * 3) * RG;
              if (x < x0 || x > x1 || y < y0 || y > y1) continue;
              drawSeal(c, x, y, area.kanji, fade);
            }
          }
        }
      }
    }
    c.globalAlpha = 1;
  }
  /* how many layer groups the deepest sheet carries — the newest is the
     one that reveals, and it is the only one drawn live while it does */
  function ltileRender(tx, ty, spec, kTo, area, B, sc) {
    const px = Math.max(2, Math.round(LTILE * sc));
    const cv = document.createElement('canvas');
    cv.width = cv.height = px;
    const c = cv.getContext('2d');
    const eff = px / LTILE;
    c.setTransform(eff, 0, 0, eff, 0, 0);
    c.translate(-tx * LTILE, -ty * LTILE);
    paintLandscapeRegion(c, tx * LTILE, ty * LTILE, (tx + 1) * LTILE, (ty + 1) * LTILE, 0, kTo, 1, spec, area, B, -1);
    return cv;
  }

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

    const revealing = reveal < 1;
    const kTo = revealing ? wv - 1 : wv;
    const lsc = Math.min(Math.max(S.dpr || 1, 1), 1.5);
    const lscTag = Math.round(lsc * 20);
    const wMask = washReadyMask(spec, kTo);
    /* cache key tracks theme, settled layer count, area, scale & decoded washes
       so an early frame never freezes an undecoded painting out of a tile */
    const key = themeKey + '|' + kTo + '|' + (S.areaIdx | 0) + '|' + lscTag + '|' + wMask;
    if (key !== lkey) lkey = key;

    const tx0 = Math.floor(vx0 / LTILE), tx1 = Math.floor(vx1 / LTILE);
    const ty0 = Math.floor(vy0 / LTILE), ty1 = Math.floor(vy1 / LTILE);
    lbudget = 2;

    let allBaked = true;
    if (kTo > 0) {
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const id = key + '|' + tx + ',' + ty;
          if (!ltiles.has(id)) {
            if (lbudget > 0) {
              lbudget--;
              ltiles.set(id, ltileRender(tx, ty, spec, kTo, area, B, lsc));
              while (ltiles.size > 24) {
                const old = ltiles.keys().next().value;
                if (old === id) break;
                ltiles.delete(old);
              }
            } else {
              allBaked = false;
            }
          }
        }
      }
    }
    if (allBaked) {
      if (kTo > 0) {
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            const tcv = ltiles.get(key + '|' + tx + ',' + ty);
            if (!tcv || !tcv.width) continue;
            const bx = tx * LTILE, by = ty * LTILE;
            const ix0 = Math.max(bx, vx0), ix1 = Math.min(bx + LTILE, vx1);
            const iy0 = Math.max(by, vy0), iy1 = Math.min(by + LTILE, vy1);
            if (ix1 <= ix0 || iy1 <= iy0) continue;
            const kpx = tcv.width / LTILE;
            const sx = Math.max(0, (ix0 - bx) * kpx);
            const sy = Math.max(0, (iy0 - by) * kpx);
            const sw = Math.min(tcv.width - sx, (ix1 - ix0) * kpx);
            const sh = Math.min(tcv.height - sy, (iy1 - iy0) * kpx);
            if (sw > 0.5 && sh > 0.5) {
              c.drawImage(tcv, sx, sy, sw, sh, ix0, iy0, ix1 - ix0, iy1 - iy0);
            }
          }
        }
      }
      if (revealing && wv > 0) {
        paintLandscapeRegion(c, vx0, vy0, vx1, vy1, wv - 1, wv, reveal, spec, area, B, wv);
      }
    } else {
      paintLandscapeRegion(c, vx0, vy0, vx1, vy1, 0, wv, reveal, spec, area, B, wv);
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

  function eliteMark(c, r) {
    c.save();
    c.translate(0, -r - 15);
    c.rotate(-0.12 + Math.sin(G.S.clockT * 2.2) * 0.04);
    c.fillStyle = RED;
    c.fillRect(-7, -7, 14, 14);
    c.fillStyle = PAPER;
    c.font = '10px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('危', 0, 0.5);
    c.restore();
  }

  /* ---------------- THE TEN SEALS' FIFTEEN FORMS (v19.1) ----------------
     Every scene-keeper is drawn from its own brush form — pool,
     tree, mountain, koi, wraith, moth, crane, mask, lantern,
     spider, ribbon, wheel, banner, stamp, toad — seeded per beast,
     tinted with the bosses' own vermillion (the caller set
     fillStyle to bodyInkOf — v20's red/black law), and reacting to
     its state: a windup swells, a charge stretches, a dissolve
     thins, a spiral turns. Returns the silhouette path fn for the
     hit-flash overlay. */
  function paintKeeperForm(c, e, r, sd, t) {
    const st = e.state;
    const S = G.S;
    const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
    const swell = st === 'windup' ? 1 + Math.min(1, e.stateT / 0.6) * 0.22 : 1;
    const breathe = 1 + Math.sin(e.t * 1.8 + e.seed) * 0.04;
    const thin = st === 'dissolve' ? Math.max(0.15, 1 - e.stateT / 0.5) : 1;
    const paint = ENEMIES[e.type].form;
    let sil = () => blobPath(c, 0, 0, r * 1.08, sd, 0.16, 14);
    c.save();
    c.scale(thin, thin);
    switch (paint) {

      case 'pool': { /* a spill with a tide — ripple rings and a wide lamina */
        c.save(); c.scale(swell, swell);
        blobPath(c, 0, 0, r, sd, 0.13, 16); c.fill();
        c.globalAlpha = 0.35; blobPath(c, 0, 0, r * 0.62, sd ^ 21, 0.2, 12); c.fill();
        c.globalAlpha = 0.5; c.strokeStyle = PAPER; c.lineWidth = 1.3;
        for (let i = 1; i <= 2; i++) {
          c.beginPath(); c.arc(0, 0, r * (0.4 + 0.24 * i) + Math.sin(t * 2.1 + i) * 2.4, 0, TAU); c.stroke();
        }
        c.restore();
        c.globalAlpha = 1;
        for (let i = 0; i < 4; i++) {
          const oa = e.t * 1.3 + (i / 4) * TAU;
          c.beginPath(); c.arc(Math.cos(oa) * r * 1.3, Math.sin(oa) * r * 1.3, 3.6, 0, TAU); c.fill();
        }
        sil = () => blobPath(c, 0, 0, r * swell * 1.05, sd, 0.13, 16);
        break;
      }

      case 'tree': { /* a young tree — trunk, canopy of blots, pine needles when old */
        const pine = e.type === 'k1_8';
        c.save(); c.scale(swell, swell);
        inkStroke(c, [{ x: 0, y: r * 0.9 }, { x: -2, y: 0 }, { x: 1.5, y: -r * 0.5 }], r * 0.22, {});
        c.globalAlpha = 0.92;
        blobPath(c, 0, -r * 0.55, r * 0.78, sd, 0.22, 12); c.fill();
        if (pine) {
          c.strokeStyle = PAPER; c.lineWidth = 1.1; c.globalAlpha = 0.55;
          for (let i = 0; i < 7; i++) {
            const na = (i / 7) * TAU + e.t * 0.3;
            c.beginPath(); c.moveTo(Math.cos(na) * r * 0.45, -r * 0.55 + Math.sin(na) * r * 0.45);
            c.lineTo(Math.cos(na) * r * 0.95, -r * 0.55 + Math.sin(na) * r * 0.95); c.stroke();
          }
        } else {
          const rnd = mulberry(sd >> 5);
          for (let i = 0; i < 4; i++) {
            const la = -0.9 + i * 0.6 + (rnd() - 0.5) * 0.3;
            c.globalAlpha = 0.9;
            teardrop(c, r * 0.16);
            c.save(); c.translate(Math.cos(la) * r * 0.85, -r * 0.4 + Math.sin(la) * r * 0.5); c.rotate(la + 1.2); teardrop(c, r * 0.15); c.fill(); c.restore();
          }
        }
        c.restore();
        sil = () => blobPath(c, 0, -r * 0.2, r * swell, sd, 0.2, 12);
        break;
      }

      case 'mountain': { /* a heavy mass — peak, snow-cap stroke, horns for the ox */
        const ox = e.type === 'k3_5', gate = e.type === 'k3_1';
        c.save(); c.scale(swell * breathe, 2 - swell * breathe);
        c.save(); c.rotate(ang); c.scale(1.12, 0.92); c.rotate(-ang);
        blobPath(c, 0, 0, r, sd, 0.09, 13); c.fill();
        c.globalAlpha = 0.35; c.fillStyle = patHatch; blobPath(c, 0, 0, r * 0.96, sd, 0.09, 13); c.fill();
        c.restore();
        if (ox) { /* the ember ox's horns */
          c.strokeStyle = PAPER; c.lineWidth = 2.4; c.globalAlpha = 0.85;
          for (const s of [-1, 1]) {
            c.beginPath(); c.moveTo(s * r * 0.35, -r * 0.55);
            c.quadraticCurveTo(s * r * 0.75, -r * 0.95, s * r * 0.95, -r * 0.6); c.stroke();
          }
        }
        if (gate) { /* the torii's crossbeam, worn like a crown */
          c.strokeStyle = PAPER; c.lineWidth = 2.2; c.globalAlpha = 0.8;
          c.beginPath(); c.moveTo(-r * 0.85, -r * 0.62); c.lineTo(r * 0.85, -r * 0.62); c.stroke();
          c.beginPath(); c.moveTo(-r * 0.55, -r * 0.4); c.lineTo(r * 0.55, -r * 0.4); c.stroke();
        }
        c.strokeStyle = PAPER; c.lineWidth = 1.6; c.globalAlpha = 0.6;
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.5); c.lineTo(0, -r * 0.85); c.lineTo(r * 0.22, -r * 0.5); c.stroke();
        c.restore();
        sil = () => blobPath(c, 0, 0, r * swell * 1.05, sd, 0.09, 13);
        break;
      }

      case 'koi': { /* a swimmer — whiskered, always mid-turn */
        c.save(); c.rotate(ang); c.scale(swell, 1);
        blobPath(c, 0, 0, r, sd, 0.12, 14); c.fill();
        c.globalAlpha = 0.32; c.fillStyle = patHatch; blobPath(c, 0, 0, r * 0.95, sd, 0.12, 14); c.fill();
        c.globalAlpha = 0.9;
        /* tail fin */
        c.beginPath();
        c.moveTo(-r * 0.85, 0); c.lineTo(-r * 1.6, -r * 0.5 + Math.sin(t * 7) * 3); c.lineTo(-r * 1.5, r * 0.5 + Math.sin(t * 7 + 1) * 3);
        c.closePath(); c.fill();
        /* whiskers */
        c.strokeStyle = PAPER; c.lineWidth = 1.2; c.globalAlpha = 0.7;
        for (const s of [-1, 1]) {
          c.beginPath(); c.moveTo(r * 0.8, s * r * 0.15);
          c.quadraticCurveTo(r * 1.3, s * r * 0.4, r * 1.55, s * r * 0.15); c.stroke();
        }
        c.restore();
        sil = () => { c.save(); c.rotate(ang); blobPath(c, 0, 0, r * swell * 1.1, sd, 0.12, 14); c.restore(); };
        break;
      }

      case 'wraith': { /* a hooded drift — two tails, no feet */
        c.save(); c.scale(breathe, 2 - breathe);
        c.globalAlpha = 0.88;
        blobPath(c, 0, -r * 0.12, r * 0.82, sd, 0.2, 12); c.fill();
        /* hood opening */
        c.fillStyle = PAPER; c.globalAlpha = 0.5;
        blobPath(c, 0, -r * 0.3, r * 0.3, sd ^ 13, 0.3, 9); c.fill();
        c.fillStyle = bodyInkOf(c, e);
        c.globalAlpha = 0.75;
        for (const s of [-1, 1]) {
          c.beginPath();
          c.moveTo(s * r * 0.3, r * 0.2);
          c.quadraticCurveTo(s * r * 0.7, r * (0.9 + Math.sin(t * 2.4 + s) * 0.2), s * r * 0.25, r * 1.5);
          c.quadraticCurveTo(s * r * 0.12, r * 0.9, s * r * 0.05, r * 0.4);
          c.closePath(); c.fill();
        }
        c.restore();
        sil = () => blobPath(c, 0, 0, r * 1.05, sd, 0.2, 12);
        break;
      }

      case 'moth': { /* two powder wings, a small body between */
        const flap = Math.sin(t * 6 + e.seed) * 0.3;
        c.save();
        for (const s of [-1, 1]) {
          c.save(); c.rotate(s * (0.5 + flap)); c.scale(1, 0.72);
          c.globalAlpha = 0.85;
          c.beginPath(); c.ellipse(s * r * 0.85, -r * 0.1, r * 0.8, r * 0.5, s * 0.4, 0, TAU); c.fill();
          c.globalAlpha = 0.3; c.fillStyle = patHatch;
          c.beginPath(); c.ellipse(s * r * 0.85, -r * 0.1, r * 0.8, r * 0.5, s * 0.4, 0, TAU); c.fill();
          c.restore();
        }
        c.fillStyle = bodyInkOf(c, e);
        c.globalAlpha = 1;
        blobPath(c, 0, 0, r * 0.5, sd, 0.18, 9); c.fill();
        c.restore();
        sil = () => blobPath(c, 0, 0, r * 1.2, sd, 0.18, 10);
        break;
      }

      case 'crane': { /* one leg, wings like strokes, a neck that aims */
        c.save(); c.rotate(ang); c.scale(swell, swell);
        const flap = Math.sin(t * 5 + e.seed) * 0.25;
        c.globalAlpha = 0.9;
        blobPath(c, 0, 0, r * 0.72, sd, 0.14, 11); c.fill();
        for (const s of [-1, 1]) {
          c.save(); c.rotate(s * (0.7 + flap));
          c.beginPath(); c.ellipse(r * 0.1, s * r * 0.9, r * 0.95, r * 0.3, 0, 0, TAU); c.fill();
          c.restore();
        }
        /* neck + head — the aim */
        inkStroke(c, [{ x: r * 0.5, y: 0 }, { x: r * 1.15, y: -r * 0.28 }, { x: r * 1.55, y: -r * 0.18 }], 3, {});
        c.beginPath(); c.arc(r * 1.6, -r * 0.18, r * 0.16, 0, TAU); c.fill();
        c.strokeStyle = PAPER; c.lineWidth = 1.4; c.globalAlpha = 0.75;
        c.beginPath(); c.moveTo(-r * 0.2, r * 0.6); c.lineTo(-r * 0.24, r * 1.35); c.stroke();
        c.restore();
        sil = () => blobPath(c, 0, 0, r * swell * 1.1, sd, 0.14, 11);
        break;
      }

      case 'mask': { /* a face that floats — horns, a chin, hollow cheeks */
        c.save(); c.rotate(Math.sin(e.t * 1.2 + e.seed) * 0.1); c.scale(swell, swell);
        c.globalAlpha = 0.94;
        c.beginPath();
        c.moveTo(0, -r);
        c.quadraticCurveTo(r * 0.95, -r * 0.62, r * 0.72, r * 0.25);
        c.quadraticCurveTo(r * 0.4, r * 0.95, 0, r * 1.05);
        c.quadraticCurveTo(-r * 0.4, r * 0.95, -r * 0.72, r * 0.25);
        c.quadraticCurveTo(-r * 0.95, -r * 0.62, 0, -r);
        c.fill();
        c.save(); c.globalAlpha = 0.3; c.fillStyle = patHatch; c.fill(); c.restore();
        /* horns */
        c.strokeStyle = PAPER; c.lineWidth = 2.2; c.globalAlpha = 0.85;
        for (const s of [-1, 1]) {
          c.beginPath(); c.moveTo(s * r * 0.42, -r * 0.72);
          c.quadraticCurveTo(s * r * 0.8, -r * 1.15, s * r * 0.4, -r * 1.42); c.stroke();
        }
        /* hollow cheeks */
        c.fillStyle = PAPER; c.globalAlpha = 0.42;
        c.beginPath(); c.arc(-r * 0.34, r * 0.1, r * 0.16, 0, TAU); c.fill();
        c.beginPath(); c.arc(r * 0.34, r * 0.1, r * 0.16, 0, TAU); c.fill();
        c.restore();
        sil = () => blobPath(c, 0, 0, r * swell * 1.05, sd, 0.12, 10);
        break;
      }

      case 'lantern': { /* a paper lantern — ribs, a glow, a swinging tassel */
        c.save();
        const swing = Math.sin(t * 1.6 + e.seed) * 0.09;
        c.rotate(swing); c.scale(swell, swell);
        c.globalAlpha = 0.9;
        c.beginPath(); c.ellipse(0, 0, r * 0.78, r, 0, 0, TAU); c.fill();
        c.save(); c.globalAlpha = 0.3; c.fillStyle = patHatch;
        c.beginPath(); c.ellipse(0, 0, r * 0.78, r, 0, 0, TAU); c.fill(); c.restore();
        /* ribs */
        c.strokeStyle = PAPER; c.lineWidth = 1.2; c.globalAlpha = 0.65;
        for (let i = -2; i <= 2; i++) {
          c.beginPath(); c.ellipse(0, 0, Math.max(2, r * 0.78 * (1 - Math.abs(i) * 0.28)), r, 0, -Math.PI / 2, Math.PI / 2); c.stroke();
        }
        /* the fire inside */
        c.fillStyle = PAPER; c.globalAlpha = 0.5 + 0.18 * Math.sin(t * 5.4);
        c.beginPath(); c.arc(0, r * 0.12, r * 0.24, 0, TAU); c.fill();
        /* cap + tassel */
        c.fillStyle = bodyInkOf(c, e);
        c.fillRect(-r * 0.3, -r * 1.08, r * 0.6, r * 0.16);
        c.globalAlpha = 0.8;
        inkStroke(c, [{ x: 0, y: r * 1.0 }, { x: Math.sin(t * 2.2) * 3, y: r * 1.45 }], 2, {});
        c.restore();
        sil = () => blobPath(c, 0, 0, r * swell * 1.05, sd, 0.14, 12);
        break;
      }

      case 'spider': { /* a round body on stroked legs that reach as it walks */
        c.save(); c.scale(swell, swell);
        const step = Math.sin(t * 4 + e.seed) * 0.12;
        c.strokeStyle = bodyInkOf(c, e); c.lineWidth = 2.2; c.globalAlpha = 0.9;
        for (let i = 0; i < 6; i++) {
          const la = (i / 6) * TAU + 0.26 + (i % 2 ? step : -step);
          c.beginPath(); c.moveTo(0, 0);
          c.quadraticCurveTo(Math.cos(la) * r * 1.1, Math.sin(la) * r * 1.1 - r * 0.3, Math.cos(la) * r * 1.5, Math.sin(la) * r * 1.35);
          c.stroke();
        }
        c.fillStyle = bodyInkOf(c, e);
        blobPath(c, 0, 0, r * 0.72, sd, 0.16, 12); c.fill();
        c.fillStyle = PAPER; c.globalAlpha = 0.4;
        blobPath(c, 0, 0, r * 0.3, sd ^ 9, 0.2, 8); c.fill();
        c.restore();
        sil = () => blobPath(c, 0, 0, r * swell, sd, 0.16, 12);
        break;
      }

      case 'ribbon': { /* a living stroke — a sinuous line that whips */
        c.save(); c.rotate(ang);
        const whip = st === 'chg' ? 1.5 : 1;
        c.save(); c.scale(swell * whip, 0.8);
        c.beginPath();
        c.moveTo(-r * 1.7, 0);
        for (let i = 0; i <= 12; i++) {
          const px = -r * 1.7 + (i / 12) * r * 3.4;
          c.lineTo(px, Math.sin(i * 0.9 + t * 6) * r * 0.34);
        }
        c.lineWidth = r * 0.62; c.strokeStyle = bodyInkOf(c, e); c.lineCap = 'round'; c.stroke();
        c.lineWidth = r * 0.28; c.strokeStyle = PAPER; c.globalAlpha = 0.3; c.stroke();
        c.restore();
        c.fillStyle = bodyInkOf(c, e);
        c.beginPath(); c.arc(r * 1.75, 0, r * 0.4, 0, TAU); c.fill();
        c.restore();
        sil = () => { c.save(); c.rotate(ang); blobPath(c, 0, 0, r * 1.5, sd, 0.3, 10); c.restore(); };
        break;
      }

      case 'wheel': { /* a spoked ring that always turns */
        c.save(); c.rotate(e.t * 1.4); c.scale(swell, swell);
        c.lineWidth = r * 0.2;
        c.beginPath(); c.arc(0, 0, r * 0.85, 0, TAU); c.stroke();
        c.lineWidth = r * 0.12;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU;
          c.beginPath(); c.moveTo(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2);
          c.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85); c.stroke();
        }
        c.beginPath(); c.arc(0, 0, r * 0.2, 0, TAU); c.fill();
        c.restore();
        c.fillStyle = bodyInkOf(c, e);
        sil = () => blobPath(c, 0, 0, r * swell * 1.05, sd, 0.08, 12);
        break;
      }

      case 'banner': { /* a pole, a cloth, and what hangs beneath */
        const long = e.type === 'k2_8';
        c.save(); c.scale(swell, swell);
        inkStroke(c, [{ x: -r * 0.5, y: r * (long ? 1.5 : 1.0) }, { x: -r * 0.5, y: -r * (long ? 1.7 : 1.2) }], 2.6, {});
        c.globalAlpha = 0.9;
        c.beginPath();
        const cy = -r * 0.9, ch = r * (long ? 0.8 : 1.05), cw = r * 1.15;
        const wav = Math.sin(t * 3 + e.seed) * r * 0.1;
        c.moveTo(-r * 0.5, cy);
        c.quadraticCurveTo(r * 0.2, cy + wav - ch * 0.2, r * 0.62, cy + ch * 0.32);
        c.quadraticCurveTo(r * 0.1, cy + ch * 0.62 + wav, -r * 0.5, cy + ch * 0.95);
        c.closePath(); c.fill();
        c.restore();
        c.fillStyle = bodyInkOf(c, e);
        sil = () => blobPath(c, 0, -r * 0.2, r * swell * 1.15, sd, 0.22, 10);
        break;
      }

      case 'stamp': { /* a seal block on one leg, face carved on its foot */
        c.save(); c.scale(swell, swell);
        const lift = st === 'chg' ? 0 : Math.abs(Math.sin(t * 2.6)) * r * 0.18;
        inkStroke(c, [{ x: 0, y: r * 1.1 }, { x: 0, y: -r * 0.1 }], r * 0.2, {});
        c.save(); c.translate(0, -r * 0.55 - lift);
        c.fillRect(-r * 0.62, -r * 0.5, r * 1.24, r * 1.0);
        c.strokeStyle = PAPER; c.lineWidth = 1.8; c.globalAlpha = 0.8;
        c.strokeRect(-r * 0.44, -r * 0.34, r * 0.88, r * 0.68);
        c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(-r * 0.2, -r * 0.1); c.lineTo(r * 0.2, -r * 0.1); c.stroke();
        c.beginPath(); c.moveTo(0, -r * 0.28); c.lineTo(0, r * 0.12); c.stroke();
        c.restore();
        c.restore();
        c.fillStyle = bodyInkOf(c, e);
        sil = () => blobPath(c, 0, -r * 0.3, r * swell, sd, 0.12, 8);
        break;
      }

      case 'toad': { /* a squat weight — wide mouth, tucked legs */
        c.save(); c.scale(swell * breathe, 2 - swell * breathe);
        c.globalAlpha = 0.94;
        blobPath(c, 0, r * 0.1, r, sd, 0.12, 12); c.fill();
        c.save(); c.globalAlpha = 0.3; c.fillStyle = patHatch; blobPath(c, 0, r * 0.1, r, sd, 0.12, 12); c.fill(); c.restore();
        /* the mouth: a wide paper slit */
        c.strokeStyle = PAPER; c.lineWidth = 2; c.globalAlpha = 0.7;
        c.beginPath(); c.arc(0, r * 0.25, r * 0.55, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
        /* tucked legs */
        c.fillStyle = bodyInkOf(c, e); c.globalAlpha = 0.9;
        for (const s of [-1, 1]) {
          c.beginPath(); c.ellipse(s * r * 0.75, r * 0.55, r * 0.34, r * 0.2, s * 0.5, 0, TAU); c.fill();
        }
        c.restore();
        sil = () => blobPath(c, 0, r * 0.1, r * swell * 1.06, sd, 0.12, 12);
        break;
      }
    }
    c.restore();
    return sil;
  }

  /* the boss class wears the law's red across every painter form */
  function bodyInkOf(c, e) {
    return bossInk();
  }

  /* the ink strength a caller wants from this enemy: the whole body
   composes with it (faint wanderers, tracer echoes) instead of any
   branch snapping itself back to full opacity mid-draw */
let EN_ALPHA = 1;
function drawEnemy(c, e, t) {
    const S = G.S;
    const tick = Math.floor(t / CFG.ink.boilRate);
    const sd = seedFor(e, tick);
    const r = e.r;
    const isBoss = !!ENEMIES[e.type].boss;
    c.save();
    c.translate(e.x, e.y);
    /* a boss is born of vermilion — the paper's one sacred red.
       v20 THE RED/BLACK LAW: EVERY boss wears it — Guardian, the
       ten seals' keepers, all of them one family again — while the
       horde stays in the sheet's own ink. No private hues. */
    const bodyInk = isBoss ? bossInk() : INK;
    c.fillStyle = bodyInk;
    c.strokeStyle = bodyInk;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    /* the tracer's copies are only half-inked — faint as a remembered shadow */
    EN_ALPHA = c.globalAlpha * (e.trace ? 0.55 : 1);
    if (e.trace) c.globalAlpha = EN_ALPHA;

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
          c.globalAlpha = EN_ALPHA;
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
            c.globalAlpha = EN_ALPHA;
          }
        }
        eyeSlits(c, ang, r, 0.6);
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.18, 10);
        break;
      }
      case 'moth': case 'rill': { /* MOTH / RILL — a flicker of ink that never holds course; the rill a stream that weaves */
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
      case 'shade': case 'nightshade': case 'specter': { /* SHADE / SPECTER — dissolving into nothing, then behind you */
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
          c.fillStyle = INK; c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
      case 'crane': case 'palecrane': case 'phoenix': case 'squall': case 'giltwing': { /* CRANE / SQUALL / GILTWING — folded paper that swoops past in arcs */
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
          c.font = '8px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('印', 0, 0.5);
          c.restore();
        }
        silhouette = () => blobPath(c, 0, 0, r * 0.96, sd, 0.12, 12);
        break;
      }
      case 'warden': case 'horn': { /* WARDEN / WARHORN — a floating standard that quickens the pack */
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
      case 'koi': case 'eel': { /* KOI / EEL — a long curve of ink that dives beneath the strokes; the eel rushes in rivers */
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.font = Math.round(r * 0.46) + 'px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
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
          c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
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
        c.globalAlpha = EN_ALPHA;
        silhouette = () => { c.save(); c.scale(1.3, 0.85); blobPath(c, 0, 0, r * 1.1, sd, 0.12, 10); c.restore(); };
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r * 0.8, 0.55);
        break;
      }
      case 'shiki': case 'midas': { /* SHIKI / MIDAS — a paper doll that calls lesser ink to serve; the midas turns it to coin */
        const raise = e.state === 'tele' ? Math.min(1, e.stateT / 0.75) : 0;
        /* the body: one tall brush stroke, leaning as it strafes */
        c.save();
        c.rotate(Math.sin(e.t * 1.8 + e.seed) * 0.08);
        inkStroke(c, [
          { x: 0, y: r * 0.95 },
          { x: r * 0.06, y: 0 },
          { x: 0, y: -r * 0.55 },
        ], r * 0.62, { alpha: 0.95, taper: 0.7 });
        /* the head: a small inked circle above the shoulders */
        c.beginPath(); c.arc(0, -r * 0.78, r * 0.34, 0, TAU); c.fill();
        /* the sleeves: two strokes that lift as the rite begins */
        const sy = -r * 0.32, lift = raise * r * 0.55;
        inkStroke(c, [
          { x: -r * 0.18, y: sy }, { x: -r * 0.72, y: sy + r * 0.34 - lift },
        ], r * 0.3, { alpha: 0.85 });
        inkStroke(c, [
          { x: r * 0.18, y: sy }, { x: r * 0.72, y: sy + r * 0.34 - lift },
        ], r * 0.3, { alpha: 0.85 });
        /* the ofuda: a red paper tag swinging from the right sleeve */
        c.save();
        c.translate(r * 0.72, sy + r * 0.4 - lift);
        c.rotate(Math.sin(e.t * 3 + e.seed) * 0.25 + raise * 0.5);
        c.fillStyle = RED;
        c.fillRect(-r * 0.11, 0, r * 0.22, r * 0.42);
        c.globalAlpha = 0.85;
        c.fillStyle = PAPER;
        c.fillRect(-r * 0.03, r * 0.05, r * 0.06, r * 0.26);
        c.restore();
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r * 0.55, 0.7);
        silhouette = () => blobPath(c, 0, 0, r * 1.1, sd, 0.2, 9);
        break;
      }
      case 'crest': { /* WAVE CREST — a curl of grey ink rearing to break */
        c.rotate(e.ang);
        /* the breaking lip: a heavy arc curling forward */
        c.lineWidth = r * 0.5;
        c.beginPath();
        c.arc(-r * 0.15, 0, r * 0.72, -1.15, 1.15);
        c.stroke();
        c.save(); c.globalAlpha = 0.3; c.fill(); c.restore();
        /* the face of the wave: hatch below the lip */
        c.save();
        c.beginPath();
        c.arc(-r * 0.15, 0, r * 0.72, -1.0, 1.0);
        c.arc(-r * 0.15, 0, r * 0.34, 0.85, -0.85, true);
        c.closePath();
        c.globalAlpha = 0.45;
        c.fillStyle = patHatch; c.fill();
        c.restore();
        /* foam: a scatter of pale drops along the curl */
        const foam = mulberry(sd >> 2);
        c.fillStyle = PAPER;
        for (let i = 0; i < 5; i++) {
          const fa = -0.9 + foam() * 1.8;
          c.globalAlpha = 0.5 + foam() * 0.4;
          c.beginPath();
          c.arc(-r * 0.15 + Math.cos(fa) * r * 0.78, Math.sin(fa) * r * 0.78, 1.1 + foam() * 1.6, 0, TAU);
          c.fill();
        }
        c.fillStyle = INK;
        c.globalAlpha = EN_ALPHA;
        silhouette = () => { c.save(); c.rotate(e.ang); c.beginPath(); c.arc(0, 0, r * 1.08, 0, TAU); c.restore(); };
        break;
      }
      case 'cask': { /* RELIC CASK — a sealed urn of the old gold, heavy with hoard */
        const wobble = 1 + Math.sin(e.t * 2.4 + e.seed) * 0.035;
        c.save();
        c.scale(wobble, 2 - wobble);
        /* the belly */
        blobPath(c, 0, r * 0.12, r * 0.92, sd, 0.1, 12);
        c.fill();
        c.save(); c.globalAlpha = 0.32; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.4;
        blobPath(c, 0, r * 0.12, r * 0.92, sd, 0.1, 12);
        c.stroke();
        /* the neck and lip */
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-r * 0.3, -r * 0.62);
        c.quadraticCurveTo(-r * 0.36, -r * 0.98, -r * 0.42, -r * 1.02);
        c.moveTo(r * 0.3, -r * 0.62);
        c.quadraticCurveTo(r * 0.36, -r * 0.98, r * 0.42, -r * 1.02);
        c.stroke();
        /* the gilt band and its red seal */
        c.globalAlpha = 0.65;
        c.lineWidth = 2.6;
        c.beginPath();
        c.ellipse(0, r * 0.05, r * 0.86, r * 0.2, 0, 0, TAU);
        c.stroke();
        c.globalAlpha = EN_ALPHA;
        c.fillStyle = RED;
        c.beginPath(); c.arc(r * 0.3, r * 0.42, r * 0.14, 0, TAU); c.fill();
        c.fillStyle = INK;
        c.restore();
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r * 0.6, 0.6);
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.12, 12);
        break;
      }

      /* ============ THE BLANK SILK — the half-drawn things ============ */
      case 'sketch': { /* SKETCH — an outline of a beast, not always there */
        const faint = !!e.faint;
        c.save();
        /* faint: a ghost of a drawing — dashes and stray construction marks */
        if (faint) {
          c.globalAlpha = 0.28;
          c.setLineDash([7, 6]);
          c.lineWidth = 1.6;
          c.rotate(Math.sin(e.t * 0.9 + e.seed) * 0.15);
          blobPath(c, 0, 0, r, sd, 0.2, 10);
          c.stroke();
          /* construction cross beneath — the drawing's scaffolding */
          c.beginPath();
          c.moveTo(-r * 0.5, -r * 0.1); c.lineTo(r * 0.5, r * 0.1);
          c.moveTo(-r * 0.1, r * 0.5); c.lineTo(r * 0.1, -r * 0.5);
          c.stroke();
          c.setLineDash([]);
        } else {
          /* solid: the ink catches up with its own outline — hatched body,
             the dashes still visible at the rim where the ink has not reached */
          blobPath(c, 0, 0, r, sd, 0.2, 10);
          c.fill();
          c.save(); c.globalAlpha = 0.35; c.fillStyle = patHatch; c.fill(); c.restore();
          c.save();
          c.globalAlpha = 0.55;
          c.setLineDash([6, 5]);
          c.lineWidth = 1.5;
          blobPath(c, 0, 0, r * 1.12, sd ^ 31, 0.24, 10);
          c.stroke();
          c.setLineDash([]);
          c.restore();
        }
        c.restore();
        const ang2 = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        if (!faint) eyeSlits(c, ang2, r * 0.8, 0.7);
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.2, 10);
        break;
      }
      case 'stitch': { /* STITCH — a running seam, a line of held breath */
        const st3 = e.state;
        c.save();
        c.rotate(e.ang);
        if (st3 === 'dash') c.scale(1.7, 0.55);
        /* the thread: a long thin stroke with a knot at the eye */
        c.lineWidth = st3 === 'dash' ? 2.6 : 2;
        c.beginPath();
        c.moveTo(-r * 1.5, 0);
        c.lineTo(r * 1.1, 0);
        c.stroke();
        c.globalAlpha = 0.4;
        c.beginPath();
        c.moveTo(-r * 1.5, 0);
        c.lineTo(-r * 2.1, Math.sin(e.t * 9 + e.seed) * 2);
        c.stroke();
        c.globalAlpha = EN_ALPHA;
        /* the needle head: a small solid drop */
        c.beginPath();
        c.ellipse(r * 0.55, 0, r * 0.42, r * 0.3, 0, 0, TAU);
        c.fill();
        if (st3 === 'tele') {
          c.globalAlpha = 0.5;
          c.lineWidth = 1.4;
          c.beginPath();
          c.arc(0, 0, r * 1.3, 0, TAU);
          c.stroke();
          c.globalAlpha = EN_ALPHA;
        }
        c.restore();
        silhouette = () => { c.save(); c.rotate(e.ang); c.beginPath(); c.ellipse(0, 0, r * 1.5, r * 0.6, 0, 0, TAU); c.restore(); };
        break;
      }
      case 'reseal': case 'stencil': { /* RESEAL / STENCIL — a stamp that refuses its first ending; the stencil presses yours */
        const rose = !!e.rose;
        c.save();
        c.rotate(Math.sin(e.t * 1.8 + e.seed) * 0.06 - 0.05);
        /* the body: a rounded seal-stone */
        const rw = r * 0.94, rr2 = r * 0.28;
        blobPath(c, 0, 0, r * 0.9, sd, 0.09, 12);
        c.fill();
        c.save(); c.globalAlpha = 0.4; c.fillStyle = patHatch; c.fill(); c.restore();
        c.lineWidth = 2.2;
        blobPath(c, 0, 0, r * 0.9, sd, 0.09, 12);
        c.stroke();
        /* the red stamp face — one seal calm, two seals risen */
        c.fillStyle = RED;
        const s4 = r * 0.34;
        c.fillRect(-s4 - r * 0.14, -s4, s4 * 2, s4 * 2);
        if (rose) {
          c.globalAlpha = 0.85;
          c.fillRect(s4 * 0.5, s4 * 0.6, s4 * 1.1, s4 * 1.1);
          c.globalAlpha = EN_ALPHA;
        }
        c.fillStyle = INK;
        /* the paper shows through the stamp: its mark, unread */
        c.strokeStyle = PAPER;
        c.lineWidth = 1.2;
        c.strokeRect(-s4 - r * 0.14 + s4 * 0.3, -s4 + s4 * 0.3, s4 * 1.4, s4 * 1.4);
        c.restore();
        const ang2 = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang2, r * 0.7, 0.7);
        silhouette = () => blobPath(c, 0, 0, r * 1.02, sd, 0.09, 12);
        break;
      }
      case 'sizing': { /* SIZING — a slow dollop of glue, glossy and patient */
        const breathe = 1 + Math.sin(e.t * 1.7 + e.seed) * 0.06;
        c.save();
        c.scale(breathe, 2 - breathe);
        blobPath(c, 0, 0, r, sd, 0.22, 11);
        c.fill();
        /* the glaze: a wet highlight that slides as it breathes */
        c.save();
        c.globalAlpha = 0.22;
        c.fillStyle = PAPER;
        c.beginPath();
        c.ellipse(-r * 0.25 + Math.sin(e.t * 0.8) * 3, -r * 0.3, r * 0.3, r * 0.16, -0.5, 0, TAU);
        c.fill();
        c.restore();
        c.lineWidth = 2;
        c.globalAlpha = 0.8;
        blobPath(c, 0, 0, r * 0.94, sd, 0.24, 11);
        c.stroke();
        c.globalAlpha = EN_ALPHA;
        c.restore();
        const ang2 = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang2, r * 0.75, 0.55);
        silhouette = () => blobPath(c, 0, 0, r * 1.06, sd, 0.22, 11);
        break;
      }
      case 'binder': { /* BINDER — the mount that herds the page's strays */
        const ang2 = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        c.save();
        c.rotate(ang2);
        /* a broad bracket of a body — the edge that gathers the loose ink */
        c.lineWidth = 3.4;
        c.beginPath();
        c.moveTo(-r * 0.55, -r);
        c.lineTo(r * 0.4, -r);
        c.quadraticCurveTo(r * 0.95, -r, r * 0.95, -r * 0.4);
        c.lineTo(r * 0.95, r * 0.4);
        c.quadraticCurveTo(r * 0.95, r, r * 0.4, r);
        c.lineTo(-r * 0.55, r);
        c.stroke();
        c.globalAlpha = 0.35;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-r * 0.2, -r * 0.62);
        c.lineTo(-r * 0.2, r * 0.62);
        c.stroke();
        c.globalAlpha = EN_ALPHA;
        c.restore();
        /* the herd-marks: three faint arrows on its face, pointing ahead */
        c.save();
        c.rotate(ang2);
        c.strokeStyle = PAPER;
        c.lineWidth = 1.3;
        c.globalAlpha = 0.75;
        for (let i = -1; i <= 1; i++) {
          c.beginPath();
          c.moveTo(r * 0.1, i * r * 0.42);
          c.lineTo(r * 0.5, i * r * 0.42);
          c.lineTo(r * 0.34, i * r * 0.42 - 2.6);
          c.moveTo(r * 0.5, i * r * 0.42);
          c.lineTo(r * 0.34, i * r * 0.42 + 2.6);
          c.stroke();
        }
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.14, 10);
        break;
      }
      case 'weft': case 'fray': { /* WEFT / FRAY — a loom-shuttle that throws the cross-weave; the fray unravels */
        const st3 = e.state;
        c.save();
        c.rotate(e.ang);
        /* the shuttle: a lens with a thread wound round it */
        c.beginPath();
        c.ellipse(0, 0, r * 1.05, r * 0.55, 0, 0, TAU);
        c.fill();
        c.save(); c.globalAlpha = 0.38; c.fillStyle = patHatch; c.fill(); c.restore();
        c.strokeStyle = PAPER;
        c.lineWidth = 1.1;
        c.globalAlpha = 0.7;
        for (let i = -2; i <= 2; i++) {
          c.beginPath();
          c.moveTo(-r * 0.7, i * r * 0.2);
          c.lineTo(r * 0.7, i * r * 0.2);
          c.stroke();
        }
        c.restore();
        c.save();
        /* the woven threads it trails */
        c.strokeStyle = INK;
        c.globalAlpha = st3 === 'tele' ? 0.6 : 0.25;
        c.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          const ta = e.t * 2 + i * 2.1 + e.seed;
          c.beginPath();
          c.moveTo(Math.cos(ta) * r * 1.2, Math.sin(ta) * r * 1.2);
          c.lineTo(Math.cos(ta + 2.6) * r * 1.9, Math.sin(ta + 2.6) * r * 1.9);
          c.stroke();
        }
        c.globalAlpha = EN_ALPHA;
        c.restore();
        const ang2 = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang2, r * 0.7, 0.6);
        silhouette = () => { c.save(); c.rotate(e.ang); c.beginPath(); c.ellipse(0, 0, r * 1.15, r * 0.65, 0, 0, TAU); c.restore(); };
        break;
      }
      case 's_trace': { /* THE TRACE — a hound of half-ink that copies what it sees */
        c.save();
        c.rotate(Math.sin(e.t * 1.1 + e.seed) * 0.12);
        /* a sketched hound: outline body, dashed legs, a trailing copy-line */
        c.setLineDash([8, 5]);
        c.lineWidth = 2.2;
        blobPath(c, 0, 0, r * 0.8, sd, 0.18, 12);
        c.stroke();
        c.globalAlpha = 0.5;
        blobPath(c, 0, 0, r * 0.8, sd, 0.18, 12);
        c.fill();
        c.globalAlpha = EN_ALPHA;
        c.setLineDash([]);
        /* the copy-line: wherever it has traced, a thread still runs */
        c.globalAlpha = 0.3;
        c.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          const ta = e.t * 1.4 + i * 3.1;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(Math.cos(ta) * r * 1.6, Math.sin(ta) * r * 1.6 - 6, Math.cos(ta) * r * 2.3, Math.sin(ta) * r * 2.3);
          c.stroke();
        }
        c.globalAlpha = EN_ALPHA;
        c.restore();
        const ang2 = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang2, r * 0.7, 0.7);
        silhouette = () => blobPath(c, 0, 0, r * 0.9, sd, 0.18, 12);
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
        c.globalAlpha = EN_ALPHA;
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
          c.fillStyle = phase === 2 ? bossInk() : RED;
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
      case 'b_blank': case 'k_edge': { /* THE UNWRITTEN / THE MARGIN — a blank page that walks */
        const phase = e.hp < e.maxHp * 0.33 ? 2 : e.hp < e.maxHp * 0.66 ? 1 : 0;
        const eraseWind = e.state === 'erase';
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        /* the body: a tall page of silk, its edges lifted by the wind of itself */
        c.save();
        const sway = Math.sin(e.t * 1.6 + e.seed) * 0.06 + (eraseWind ? Math.sin(e.stateT * 24) * 0.05 : 0);
        c.rotate(sway);
        c.fillStyle = PAPER;
        c.strokeStyle = bossInk();
        /* the page: a tall rounded sheet, drawn as one pressed rectangle */
        const pw = r * 0.78, ph2 = r * 1.18, corner = r * 0.14;
        c.lineWidth = 2.6;
        c.beginPath();
        c.moveTo(-pw + corner, -ph2);
        c.lineTo(pw - corner, -ph2); c.quadraticCurveTo(pw, -ph2, pw, -ph2 + corner);
        c.lineTo(pw, ph2 - corner); c.quadraticCurveTo(pw, ph2, pw - corner, ph2);
        c.lineTo(-pw + corner, ph2); c.quadraticCurveTo(-pw, ph2, -pw, ph2 - corner);
        c.lineTo(-pw, -ph2 + corner); c.quadraticCurveTo(-pw, -ph2, -pw + corner, -ph2);
        c.closePath();
        c.fill();
        c.globalAlpha = 0.85;
        c.stroke();
        c.globalAlpha = EN_ALPHA;
        /* the underdrawing that haunts its own surface — faint marks that
           surface with every phase, the page remembering what it erased */
        c.strokeStyle = bossInk();
        c.globalAlpha = 0.16 + phase * 0.12;
        c.lineWidth = 1.2;
        const ur = mulberry(sd >> 2);
        for (let i = 0; i < 4 + phase * 2; i++) {
          const ux2 = (ur() - 0.5) * pw * 1.3, uy2 = (ur() - 0.5) * ph2 * 1.4;
          c.beginPath();
          c.moveTo(ux2, uy2);
          c.quadraticCurveTo(ux2 + (ur() - 0.5) * 14, uy2 + (ur() - 0.5) * 14, ux2 + (ur() - 0.5) * 22, uy2 + (ur() - 0.5) * 22);
          c.stroke();
        }
        c.globalAlpha = EN_ALPHA;
        /* the red margin: a corner seal pressed on the page's lower right —
           it deepens through the phases until the whole edge burns */
        c.fillStyle = phase === 2 ? bossInk() : RED;
        c.globalAlpha = 0.55 + phase * 0.2;
        const ms = r * 0.16 + phase * r * 0.05;
        c.fillRect(pw - ms - 3, ph2 - ms - 3, ms, ms);
        c.globalAlpha = EN_ALPHA;
        /* the eyes: two slits torn where a face was almost drawn */
        c.strokeStyle = bossInk();
        c.fillStyle = bossInk();
        c.lineWidth = 2;
        c.beginPath();
        c.arc(-pw * 0.32, -ph2 * 0.28, r * 0.13, Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
        c.beginPath();
        c.arc(pw * 0.32, -ph2 * 0.28, r * 0.13, Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
        c.restore();
        /* the erase wind: stray flecks streaming off the page's edge */
        if (eraseWind) {
          c.save();
          c.fillStyle = PAPER;
          for (let i = 0; i < 5; i++) {
            const fa = e.stateT * 9 + i * 1.26;
            c.globalAlpha = 0.5;
            c.beginPath();
            c.arc(Math.cos(fa) * r * 1.5, Math.sin(fa) * r * 1.8, 2.2, 0, TAU);
            c.fill();
          }
          c.restore();
        }
        silhouette = () => { c.beginPath(); c.rect(-r * 0.8, -r * 1.2, r * 1.6, r * 2.4); };
        break;
      }
      /* ============ THE SPECIALS — the paper's odd mechanics ============ */
      case 's_nest': { /* THE NEST — a woven cocoon that breathes and hums with brood */
        const br = 1 + Math.sin(e.t * 2.2 + e.seed) * 0.05;
        c.save(); c.scale(br, 2 - br);
        blobPath(c, 0, 0, r, sd, 0.12, 12); c.fill();
        c.restore();
        /* the weave: two crossing bands, pale against the ink */
        c.save();
        c.globalAlpha = 0.85;
        c.strokeStyle = PAPER; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-r * 0.8, -r * 0.45); c.quadraticCurveTo(0, -r * 0.1, r * 0.8, -r * 0.5); c.stroke();
        c.beginPath(); c.moveTo(-r * 0.8, r * 0.35); c.quadraticCurveTo(0, r * 0.7, r * 0.8, r * 0.3); c.stroke();
        /* the brood, circling the seam */
        c.fillStyle = PAPER;
        for (let i = 0; i < 3; i++) {
          const a = e.t * 1.6 + (i / 3) * TAU;
          c.beginPath(); c.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.3, 1.6, 0, TAU); c.fill();
        }
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.06, sd, 0.12, 12);
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, ang, r, 0.8);
        break;
      }
      case 's_mender': { /* THE MENDER — a small round beast carrying red thread */
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        const sq = 1 + Math.sin(e.t * 5 + e.seed) * 0.04;
        c.save(); c.rotate(ang); c.scale(sq, 2 - sq); c.rotate(-ang);
        blobPath(c, 0, 0, r, sd, 0.2, 10); c.fill();
        c.restore();
        /* the stitch: a small red cross of thread held out front */
        c.save();
        c.strokeStyle = RED; c.lineWidth = 2; c.lineCap = 'round';
        const sx = Math.cos(ang) * (r * 0.6), sy = Math.sin(ang) * (r * 0.6);
        c.beginPath(); c.moveTo(sx - 4, sy - 4); c.lineTo(sx + 4, sy + 4); c.stroke();
        c.beginPath(); c.moveTo(sx + 4, sy - 4); c.lineTo(sx - 4, sy + 4); c.stroke();
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.08, sd, 0.2, 10);
        eyeSlits(c, ang, r);
        break;
      }
      case 's_toller': { /* THE TOLLER — a bell of ink on a slow swing, a fast one when it tolls */
        const swing = e.state === 'toll' ? Math.sin(e.t * 26) * 0.16 : Math.sin(e.t * 1.8 + e.seed) * 0.08;
        c.save();
        c.rotate(swing);
        c.beginPath();
        c.moveTo(-r * 0.85, r * 0.55);
        c.quadraticCurveTo(-r * 0.95, -r * 0.4, 0, -r * 0.95);
        c.quadraticCurveTo(r * 0.95, -r * 0.4, r * 0.85, r * 0.55);
        c.closePath(); c.fill();
        c.fillRect(-r * 0.95, r * 0.5, r * 1.9, r * 0.22);
        c.beginPath(); c.arc(0, r * 0.85, r * 0.16, 0, TAU); c.fill();
        c.restore();
        silhouette = () => {
          c.beginPath();
          c.moveTo(-r * 0.85, r * 0.55);
          c.quadraticCurveTo(-r * 0.95, -r * 0.4, 0, -r * 0.95);
          c.quadraticCurveTo(r * 0.95, -r * 0.4, r * 0.85, r * 0.55);
          c.closePath();
        };
        break;
      }
      case 's_ledger': { /* THE LEDGER — a bound book that walks, its pages full of other people's ink */
        c.save();
        c.rotate(Math.sin(e.t * 2.4 + e.seed) * 0.08);
        c.beginPath(); c.rect(-r * 0.75, -r * 0.9, r * 1.5, r * 1.8); c.fill();
        c.save();
        c.strokeStyle = PAPER; c.fillStyle = PAPER; c.lineWidth = 1.4; c.globalAlpha = 0.72;
        c.beginPath(); c.moveTo(-r * 0.75, -r * 0.9); c.lineTo(-r * 0.75, r * 0.9); c.stroke();
        for (let gy = 0; gy < 3; gy++) for (let gx = 0; gx < 2; gx++) {
          c.beginPath(); c.arc(-r * 0.22 + gx * r * 0.52, -r * 0.5 + gy * r * 0.5, 1.8, 0, TAU); c.fill();
        }
        c.restore();
        c.restore();
        silhouette = () => c.rect(-r * 0.75, -r * 0.9, r * 1.5, r * 1.8);
        const lang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        eyeSlits(c, lang, r * 0.9);
        break;
      }

      /* ============ THE CAPTAINS — the horde's officers ============ */
      case 'c_drum': case 'c_choir': case 'c_banner': case 'c_gale': case 'c_gild': case 'c_hush': {
        /* a plump blot under a tall flag — the sheet's own kanji flies above it */
        const K = ({ c_drum: '一', c_choir: '夜', c_banner: '紅', c_gale: '嵐', c_gild: '金', c_hush: '素' })[e.type] || '旗';
        const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
        const bob = Math.sin(e.t * 3.1 + e.seed) * r * 0.06;
        /* the pole rises behind the body, the flag hangs to its right */
        c.save();
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(r * 0.15, r * 0.2); c.lineTo(r * 0.42, -r * 2.55); c.stroke();
        const fw = r * 1.5, fh = r * 1.05;
        c.fillStyle = PAPER;
        c.strokeStyle = RED;
        c.lineWidth = 1.6;
        c.beginPath(); c.rect(r * 0.42, -r * 2.55 - fh, fw, fh); c.fill(); c.stroke();
        c.fillStyle = RED;
        c.font = Math.round(fh * 0.72) + 'px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(K, r * 0.42 + fw / 2, -r * 2.55 - fh / 2 + 1);
        c.restore();
        /* the body: a marching blot, fattened with rank — v20 the
           officer wears the bosses' own red, the flag and the rank
           one colour, unmistakable in any horde */
        c.fillStyle = bossInk(); c.strokeStyle = bossInk();
        c.save();
        c.translate(0, bob);
        blobPath(c, 0, 0, r, sd, 0.16, 11);
        c.fill();
        c.restore();
        silhouette = () => blobPath(c, 0, 0, r * 1.05, sd, 0.16, 11);
        /* the officer's marks */
        if (e.type === 'c_drum') {
          c.save();
          c.strokeStyle = PAPER; c.lineWidth = 1.8; c.globalAlpha = 0.8;
          c.beginPath(); c.moveTo(-r * 0.7, -r * 0.5); c.lineTo(r * 0.7, r * 0.5); c.stroke();
          c.beginPath(); c.moveTo(-r * 0.7, r * 0.5); c.lineTo(r * 0.7, -r * 0.5); c.stroke();
          c.restore();
        } else if (e.type === 'c_choir') {
          c.save();
          c.strokeStyle = PAPER; c.lineWidth = 1.3; c.globalAlpha = 0.8;
          for (let i = -1; i <= 1; i++) {
            c.beginPath();
            c.arc(i * r * 0.45, r * 0.55, r * 0.16, Math.PI, TAU);
            c.stroke();
          }
          c.restore();
        } else if (e.type === 'c_gale') {
          c.save();
          c.strokeStyle = PAPER; c.lineWidth = 1.6; c.globalAlpha = 0.8;
          c.beginPath();
          c.moveTo(-r * 0.6, 0); c.lineTo(-r * 0.2, -r * 0.3); c.lineTo(r * 0.2, r * 0.05); c.lineTo(r * 0.6, -r * 0.25);
          c.stroke();
          c.restore();
        } else if (e.type === 'c_gild') {
          c.save();
          c.strokeStyle = '#8a6a1f'; c.fillStyle = '#8a6a1f'; c.lineWidth = 1.4;
          c.beginPath(); c.arc(0, 0, r * 0.34, 0, TAU); c.stroke();
          c.beginPath(); c.arc(0, 0, r * 0.12, 0, TAU); c.fill();
          c.restore();
        } else if (e.type === 'c_hush') {
          /* the hush: two closed eyes — the officer that speaks nothing */
          c.save();
          c.strokeStyle = PAPER; c.lineWidth = 1.6; c.globalAlpha = 0.85;
          c.beginPath();
          c.arc(-r * 0.3, -r * 0.05, r * 0.16, Math.PI * 0.12, Math.PI * 0.88);
          c.stroke();
          c.beginPath();
          c.arc(r * 0.3, -r * 0.05, r * 0.16, Math.PI * 0.12, Math.PI * 0.88);
          c.stroke();
          c.restore();
        }
        eyeSlits(c, ang, r);
        break;
      }

      default: {
        if (ENEMIES[e.type].form) {
          /* THE TEN SEALS — fifteen brush forms, one per kind of beast */
          silhouette = paintKeeperForm(c, e, r, sd, t) || null;
          const ang = Math.atan2(S.player.y - e.y, S.player.x - e.x);
          eyeSlits(c, ang, r, 0.85);
          break;
        }
        /* BLIP — a shard of the drip */
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
      c.strokeStyle = bossInk();
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

    /* a captain's march: beasts under the flag wear a pale dashed halo */
    if (e.auraT > 0) {
      c.save();
      c.globalAlpha = Math.min(0.5, e.auraT) * 0.9;
      c.strokeStyle = INK;
      c.lineWidth = 1.1;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.arc(0, 0, r * 1.42, 0, TAU);
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
  /* ============================================================
     THE EIGHT BRUSHES — full weapon models (v24)
     Each brush is its own object, not one bamboo stick with a
     different tuft: a liner, a flat hake, a rope-lashed stone mop,
     a talisman-tied spirit brush, a folding war fan, a cresting
     wave, a carved hanko, and the master's tasselled brush.
     Authored in tool units along +x (hand near x = -7, tip ahead);
     `len` scales the whole model, lines and all.
     ============================================================ */
  const BRUSH_TIP = { needle: 12.6, broom: 7.8, stone: 6.8, wisp: 9.8, fan: 10.2, tide: 8.8, seal: 7.6, scribe: 11.8 };
  const BRUSH_GRIP = { fan: [-8.2, -12.2], seal: [-8.8, -14.4] };
  function brushTipX(type) { return BRUSH_TIP[type] ?? 9.6; }

  function drawBrushTool(c, type, o = {}) {
    const len = o.len ?? 1;
    const A = o.alpha ?? 1;
    const ink = o.ink ?? INK;
    const paper = o.paper ?? PAPER;
    const red = o.red ?? bossInk();
    const kind = BRUSH_TIP[type] ? type : 'needle';
    const sd = (o.seed ?? 5) | 0;
    c.save();
    c.scale(len, len);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    /* the spine every haft rides: butt a hair high, ferrule on the aim line */
    const sy = x => -0.2 + (x + 4.8) * 0.085;
    const rod = (x0, x1, w, alpha) => {
      c.globalAlpha = A * (alpha ?? 0.95);
      c.strokeStyle = ink; c.lineWidth = w;
      c.beginPath(); c.moveTo(x0, sy(x0)); c.lineTo(x1, sy(x1)); c.stroke();
      /* a dry highlight along the top edge */
      c.globalAlpha = A * 0.3;
      c.strokeStyle = paper; c.lineWidth = Math.max(0.45, w * 0.22);
      c.beginPath(); c.moveTo(x0 + 0.7, sy(x0) - w * 0.27); c.lineTo(x1 - 0.5, sy(x1) - w * 0.27); c.stroke();
    };
    const node = (x, w) => {
      c.globalAlpha = A * 0.55; c.strokeStyle = paper; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(x - 0.1, sy(x) - w * 0.5); c.lineTo(x + 0.2, sy(x) + w * 0.5); c.stroke();
    };
    const collar = (x0, x1, h0, h1) => {
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(x0, sy(x0) - h0); c.lineTo(x1, -h1); c.lineTo(x1, h1); c.lineTo(x0, sy(x0) + h0);
      c.closePath(); c.fill();
      c.globalAlpha = A * 0.5; c.strokeStyle = paper; c.lineWidth = 0.5;
      const mx = (x0 + x1) / 2, mh = (h0 + h1) / 2;
      c.beginPath(); c.moveTo(mx, -mh + 0.25); c.lineTo(mx + 0.2, mh - 0.25); c.stroke();
    };
    const hairs = (pts, w, a, seed) => inkStroke(c, pts, w, { alpha: A * a, taper: 0.6, seed, color: ink });
    const pale = (a, w) => { c.globalAlpha = A * a; c.strokeStyle = paper; c.lineWidth = w; };

    if (kind === 'needle') {
      /* 細 — the liner: a slim culm, a hanging loop, one point that barely lifts */
      rod(-18.4, -3.4, 2.0);
      node(-13.2, 2.0); node(-8.2, 2.0);
      c.globalAlpha = A * 0.78; c.strokeStyle = ink; c.lineWidth = 0.55;
      c.beginPath(); c.arc(-19.5, sy(-19.5) - 0.2, 0.95, 0, TAU); c.stroke();
      collar(-3.6, -1.9, 1.25, 1.45);
      c.globalAlpha = A * 0.96; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-1.9, -1.45);
      c.quadraticCurveTo(3.4, -1.5, 8.2, -0.55);
      c.quadraticCurveTo(11.4, -0.12, 13.4, 0.05);
      c.quadraticCurveTo(11.2, 0.36, 8, 0.7);
      c.quadraticCurveTo(3.2, 1.55, -1.9, 1.45);
      c.closePath(); c.fill();
      for (const hy of [-0.85, 0, 0.85]) hairs([{ x: -1.4, y: hy }, { x: 4.4, y: hy * 0.62 }, { x: 12.2, y: hy * 0.08 }], 0.55, 0.7, 91 + hy * 11);
      pale(0.36, 0.4);
      c.beginPath(); c.moveTo(-1, -0.78); c.quadraticCurveTo(4.2, -0.8, 8.8, -0.28); c.stroke();
    } else if (kind === 'broom') {
      /* 掃 — the hake: a flat paddle, a stitched band, a wide bar of hair */
      c.globalAlpha = A * 0.96; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-18, sy(-18) - 1.05);
      c.quadraticCurveTo(-19, sy(-18), -18, sy(-18) + 1.05);
      c.lineTo(-3.6, 2.75);
      c.lineTo(-3.6, -2.95);
      c.closePath(); c.fill();
      pale(0.32, 0.45);
      c.beginPath(); c.moveTo(-16.4, sy(-16.4) - 0.42); c.lineTo(-4.4, -1.6); c.stroke();
      pale(0.2, 0.36);
      c.beginPath(); c.moveTo(-15, sy(-15) + 0.5); c.lineTo(-4.4, 1.3); c.stroke();
      c.globalAlpha = A * 0.85; c.fillStyle = paper;
      c.beginPath(); c.arc(-16.5, sy(-16.5), 0.5, 0, TAU); c.fill();
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.moveTo(-3.8, -3.5); c.lineTo(-1.3, -3.78); c.lineTo(-1.3, 3.58); c.lineTo(-3.8, 3.3); c.closePath(); c.fill();
      pale(0.64, 0.5);
      for (const yy of [-2.5, -1.25, 0, 1.25, 2.5]) { c.beginPath(); c.moveTo(-3.2, yy - 0.35); c.lineTo(-1.9, yy + 0.3); c.stroke(); }
      c.globalAlpha = A * 0.93; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-1.3, -3.8);
      c.lineTo(7.4, -4.9);
      for (const tp of [[8.3, -4.1], [7.5, -3.2], [8.6, -2.3], [7.7, -1.3], [8.8, -0.3], [7.8, 0.7], [8.7, 1.7], [7.6, 2.7], [8.4, 3.7], [7.4, 4.6]]) c.lineTo(tp[0], tp[1]);
      c.lineTo(-1.3, 3.6);
      c.closePath(); c.fill();
      for (const hy of [-3, -1.5, 0, 1.5, 3]) hairs([{ x: -0.8, y: hy * 0.9 }, { x: 3.4, y: hy * 1.08 }, { x: 7.6, y: hy * 1.22 }], 0.7, 0.6, 71 + hy * 9);
      pale(0.3, 0.42);
      for (const yy of [-2.2, -0.7, 0.8, 2.3]) { c.beginPath(); c.moveTo(0.2, yy); c.lineTo(6.6, yy * 1.2); c.stroke(); }
    } else if (kind === 'stone') {
      /* 岩 — the heavy hand: a river-stone pommel, a rope-lashed haft, a loaded mop */
      rod(-15.6, -3.6, 3.5);
      pale(0.58, 0.55);
      for (const lx of [-13.4, -11.6, -9.8, -8, -6.2]) { c.beginPath(); c.moveTo(lx, sy(lx) - 1.7); c.lineTo(lx + 1.2, sy(lx) + 1.7); c.stroke(); }
      c.globalAlpha = A; c.fillStyle = ink;
      blobPath(c, -17.6, sy(-17.6), 2.9, 4407, 0.14, 9); c.fill();
      pale(0.38, 0.5);
      c.beginPath(); c.arc(-17.9, sy(-17.6) - 0.4, 1.5, Math.PI * 1.05, Math.PI * 1.75); c.stroke();
      collar(-3.9, -1.9, 2.3, 2.9);
      c.globalAlpha = A * 0.96; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-1.9, -3);
      c.quadraticCurveTo(2.6, -4.7, 5.8, -2.9);
      c.quadraticCurveTo(8.4, -0.9, 7.2, 1.3);
      c.quadraticCurveTo(5.4, 4.5, -1.9, 3);
      c.closePath(); c.fill();
      for (const hy of [-1.9, -0.6, 0.7, 2]) hairs([{ x: -1.3, y: hy * 0.9 }, { x: 2.6, y: hy * 1.1 }, { x: 6.4, y: hy * 0.55 }], 0.85, 0.65, 81 + hy * 7);
      pale(0.36, 0.55);
      c.beginPath(); c.moveTo(-0.6, -2.5); c.quadraticCurveTo(2.6, -3.7, 5.2, -2.5); c.stroke();
      c.globalAlpha = A * 0.92; c.fillStyle = ink;
      c.save(); c.translate(4.4, 4.7); c.rotate(Math.PI / 2); teardrop(c, 0.95); c.fill(); c.restore();
    } else if (kind === 'wisp') {
      /* 幽 — the spirit brush: a pale reed, a paper charm, a flame that leans off the page */
      rod(-18, -3.4, 1.9, 0.82);
      node(-12.6, 1.9);
      c.save();
      c.translate(-9.6, sy(-9.6) + 0.7);
      c.rotate(0.16);
      c.globalAlpha = A * 0.62; c.strokeStyle = ink; c.lineWidth = 0.4;
      c.beginPath(); c.moveTo(0, -1.1); c.lineTo(0, 0.3); c.stroke();
      c.globalAlpha = A * 0.96; c.fillStyle = paper;
      c.fillRect(-1.25, 0.2, 2.5, 5.6);
      c.globalAlpha = A * 0.86; c.strokeStyle = ink; c.lineWidth = 0.42;
      c.strokeRect(-1.25, 0.2, 2.5, 5.6);
      c.beginPath();
      c.moveTo(-0.5, 1.3); c.lineTo(0.5, 1.3);
      c.moveTo(0, 1.3); c.lineTo(0, 4.6);
      c.moveTo(-0.6, 3); c.lineTo(0.6, 3.4);
      c.moveTo(-0.5, 4.6); c.lineTo(0.5, 4.6);
      c.stroke();
      c.restore();
      collar(-3.6, -2, 1.2, 1.5);
      c.globalAlpha = A * 0.85; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-2, -1.5);
      c.bezierCurveTo(1.2, -3.2, 4.6, -2.8, 6.6, -1.6);
      c.bezierCurveTo(8.4, -0.6, 9.2, -2.2, 10.6, -4.2);
      c.bezierCurveTo(10.4, -1.2, 9.6, 1.4, 6.4, 2.2);
      c.bezierCurveTo(3.6, 2.9, 0.6, 2.4, -2, 1.5);
      c.closePath(); c.fill();
      c.globalAlpha = A * 0.36; c.fillStyle = paper;
      c.beginPath();
      c.moveTo(0.2, -0.3);
      c.bezierCurveTo(2.6, -1.5, 5, -1.1, 6.6, -0.2);
      c.bezierCurveTo(5.2, 1.1, 2.6, 1.2, 0.2, 0.5);
      c.closePath(); c.fill();
      c.globalAlpha = A * 0.62; c.strokeStyle = ink; c.lineWidth = 0.6;
      c.beginPath(); c.moveTo(10.6, -4.2); c.bezierCurveTo(11.8, -5.4, 10.4, -6.4, 11.6, -7.6); c.stroke();
      c.globalAlpha = A * 0.72; c.fillStyle = ink;
      c.beginPath(); c.arc(13.4, -4.6, 1.05, 0, TAU); c.fill();
      c.globalAlpha = A * 0.46;
      c.beginPath(); c.arc(12.4, -8.6, 0.6, 0, TAU); c.fill();
      c.globalAlpha = A * 0.85; c.fillStyle = paper;
      c.beginPath(); c.arc(13.7, -4.85, 0.3, 0, TAU); c.fill();
    } else if (kind === 'fan') {
      /* 扇 — a true folding war fan, half open: rivet, sticks, pleated leaf, the red sun */
      const px = -8.6, py = sy(-8.6) + 0.1;
      const spread = 0.36, r0 = 8.2, r1 = 19.6, N = 8;
      c.globalAlpha = A * 0.96; c.strokeStyle = ink; c.lineWidth = 1.7;
      c.beginPath(); c.moveTo(px, py); c.lineTo(px - 4.6, py - 0.5); c.stroke();
      c.globalAlpha = A * 0.82; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(px - 0.2, py + 0.3); c.bezierCurveTo(px - 2.6, py + 2.6, px - 5.2, py + 1.6, px - 6.4, py + 4); c.stroke();
      c.globalAlpha = A * 0.92; c.fillStyle = ink;
      c.beginPath(); c.arc(px - 6.4, py + 4.2, 0.7, 0, TAU); c.fill();
      c.lineWidth = 0.45;
      for (const dx of [-0.7, 0, 0.7]) { c.beginPath(); c.moveTo(px - 6.4 + dx * 0.4, py + 4.6); c.lineTo(px - 6.4 + dx, py + 7.2); c.stroke(); }
      for (let i = 0; i <= N; i++) {
        const a = -spread + (2 * spread * i) / N;
        const guard = i === 0 || i === N;
        const rl = guard ? r1 : r0 + 1.2;
        c.globalAlpha = A * (guard ? 0.98 : 0.8);
        c.strokeStyle = ink; c.lineWidth = guard ? 1.25 : 0.6;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * rl, py + Math.sin(a) * rl); c.stroke();
      }
      c.globalAlpha = A * 0.92; c.fillStyle = ink;
      c.beginPath();
      c.arc(px, py, r1, -spread, spread);
      c.arc(px, py, r0, spread, -spread, true);
      c.closePath(); c.fill();
      c.strokeStyle = paper; c.lineWidth = 0.42;
      for (let i = 1; i < N * 2; i++) {
        const a = -spread + (spread * i) / N;
        c.globalAlpha = A * (i % 2 ? 0.2 : 0.46);
        c.beginPath();
        c.moveTo(px + Math.cos(a) * (r0 + 0.3), py + Math.sin(a) * (r0 + 0.3));
        c.lineTo(px + Math.cos(a) * (r1 - 0.3), py + Math.sin(a) * (r1 - 0.3));
        c.stroke();
      }
      c.globalAlpha = A * 0.5; c.lineWidth = 0.5;
      c.beginPath(); c.arc(px, py, r1 - 1.5, -spread + 0.03, spread - 0.03); c.stroke();
      c.globalAlpha = A * 0.94; c.fillStyle = red;
      c.beginPath(); c.arc(px + Math.cos(-0.06) * (r0 + r1) / 2, py + Math.sin(-0.06) * (r0 + r1) / 2, 1.8, 0, TAU); c.fill();
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(px, py, 1.15, 0, TAU); c.fill();
      c.globalAlpha = A * 0.88; c.fillStyle = paper;
      c.beginPath(); c.arc(px, py, 0.42, 0, TAU); c.fill();
    } else if (kind === 'tide') {
      /* 潮 — the tide: a wave-carved haft, a soft belly cresting into a claw of foam */
      rod(-18, -3.6, 2.6);
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(-18.2, sy(-18.2), 1.7, 0, TAU); c.fill();
      pale(0.52, 0.45);
      for (const wx of [-13.6, -11.4, -9.2]) { c.beginPath(); c.arc(wx, sy(wx) + 0.9, 1.1, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      collar(-3.8, -1.9, 1.7, 2.5);
      c.globalAlpha = A * 0.94; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-1.9, -2.5);
      c.bezierCurveTo(0.8, -5.6, 5.8, -6.2, 8.8, -4);
      c.bezierCurveTo(10.6, -2.6, 10.2, -0.4, 8.4, -0.2);
      c.bezierCurveTo(7.2, -0.1, 6.6, -1.2, 7.4, -2);
      c.bezierCurveTo(5.8, -1.6, 5.6, 0.6, 7.6, 1.4);
      c.bezierCurveTo(6.4, 4.2, 1.6, 4.6, -1.9, 2.5);
      c.closePath(); c.fill();
      for (const hy of [-1.4, 0.2, 1.7]) hairs([{ x: -1.3, y: hy }, { x: 2.4, y: hy * 1.2 }, { x: 5.4, y: hy * 0.9 }], 0.7, 0.5, 121 + hy * 11);
      pale(0.52, 0.5);
      c.beginPath(); c.moveTo(1.2, -4.3); c.bezierCurveTo(4, -5.4, 7.2, -4.9, 8.9, -3.1); c.stroke();
      pale(0.36, 0.45);
      c.beginPath(); c.moveTo(-0.9, 0.5); c.bezierCurveTo(1, -0.9, 2.6, 1.7, 4.8, 0.5); c.stroke();
      c.beginPath(); c.moveTo(-0.6, 2); c.bezierCurveTo(1.4, 0.9, 3, 3, 5, 2.2); c.stroke();
      c.globalAlpha = A * 0.88; c.fillStyle = ink;
      for (const d of [[11.6, -4.6, 0.75, -0.5], [12.8, -2.2, 0.6, -0.15], [11.4, 1.5, 0.5, 0.5]]) {
        c.save(); c.translate(d[0], d[1]); c.rotate(d[3]); teardrop(c, d[2]); c.fill(); c.restore();
      }
    } else if (kind === 'seal') {
      /* 印 — the great hanko: a turned knob, a red cord, a stone block, a wet vermillion face */
      c.globalAlpha = A * 0.97; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-6.2, -2.2);
      c.bezierCurveTo(-8.6, -2.3, -9.6, -1.3, -11.2, -1.5);
      c.bezierCurveTo(-13.4, -3.4, -17.6, -3.2, -18, -0.6);
      c.bezierCurveTo(-18.2, 2, -13.6, 2.6, -11.2, 0.7);
      c.bezierCurveTo(-9.6, 0.7, -8.6, 2, -6.2, 2.1);
      c.closePath(); c.fill();
      pale(0.36, 0.5);
      c.beginPath(); c.moveTo(-16.6, -1.9); c.quadraticCurveTo(-14.6, -2.6, -12.6, -1.9); c.stroke();
      c.globalAlpha = A * 0.96; c.strokeStyle = red; c.lineWidth = 0.75;
      c.beginPath(); c.moveTo(-10.4, -1.4); c.lineTo(-9.9, 0.8); c.stroke();
      c.beginPath(); c.moveTo(-9.5, -1.4); c.lineTo(-9, 0.9); c.stroke();
      c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-9.6, 0.9); c.quadraticCurveTo(-10.4, 2.6, -11.4, 4.4); c.stroke();
      c.beginPath(); c.moveTo(-9.3, 0.9); c.quadraticCurveTo(-9.2, 2.8, -9.8, 4.8); c.stroke();
      c.fillStyle = red;
      c.beginPath(); c.arc(-9.6, 1.1, 0.62, 0, TAU); c.fill();
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.moveTo(-6.4, -3.5); c.lineTo(5.4, -3.8); c.lineTo(5.4, 3.8); c.lineTo(-6.4, 3.5); c.closePath(); c.fill();
      pale(0.44, 0.45);
      c.strokeRect(-5.2, -2.5, 9.4, 5);
      pale(0.52, 0.45);
      c.beginPath();
      c.moveTo(-3.4, -1.2); c.lineTo(2.4, -1.2);
      c.moveTo(-0.5, -1.2); c.lineTo(-0.5, 1.4);
      c.moveTo(-3, 1.4); c.lineTo(2, 1.4);
      c.moveTo(-2.4, 0.1); c.lineTo(1.4, 0.1);
      c.stroke();
      c.globalAlpha = A * 0.97; c.fillStyle = red;
      c.beginPath(); c.moveTo(5.4, -4.2); c.lineTo(7.6, -4.2); c.lineTo(7.6, 4.2); c.lineTo(5.4, 4.2); c.closePath(); c.fill();
      pale(0.62, 0.4);
      c.beginPath(); c.moveTo(6.5, -3.5); c.lineTo(6.5, 3.5); c.stroke();
      c.globalAlpha = A * 0.92; c.fillStyle = red;
      c.save(); c.translate(7.2, 4.9); c.rotate(Math.PI / 2); teardrop(c, 0.7); c.fill(); c.restore();
    } else {
      /* 書 — the master's brush: lacquer haft, horn ferrule, a red tassel, and the stroke already leaving the tip */
      rod(-18.6, -4, 2.7);
      pale(0.64, 0.6);
      for (const bx of [-16.2, -15.2, -6.2]) { c.beginPath(); c.moveTo(bx, sy(bx) - 1.25); c.lineTo(bx + 0.15, sy(bx) + 1.25); c.stroke(); }
      const ty0 = sy(-18.8);
      c.globalAlpha = A * 0.96; c.strokeStyle = red; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-18.8, ty0); c.bezierCurveTo(-20.4, ty0 + 0.6, -19.6, ty0 + 2.4, -20.6, ty0 + 3.6); c.stroke();
      c.fillStyle = red;
      c.beginPath(); c.arc(-20.6, ty0 + 3.9, 0.75, 0, TAU); c.fill();
      c.lineWidth = 0.45;
      for (const dx of [-0.8, -0.25, 0.3, 0.85]) { c.beginPath(); c.moveTo(-20.6 + dx * 0.4, ty0 + 4.4); c.lineTo(-20.6 + dx, ty0 + 7.4); c.stroke(); }
      collar(-4.2, -1.8, 1.5, 2.7);
      c.globalAlpha = A * 0.97; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(-1.8, -2.7);
      c.bezierCurveTo(2.2, -3.9, 6.4, -2.6, 9.4, -1.2);
      c.bezierCurveTo(10.8, -0.6, 11.6, -0.9, 12.6, -1.6);
      c.bezierCurveTo(11.8, 0.2, 10.4, 1.2, 8.6, 1.8);
      c.bezierCurveTo(5.4, 3, 1.6, 3.5, -1.8, 2.7);
      c.closePath(); c.fill();
      for (const hy of [-1.7, -0.6, 0.5, 1.6]) hairs([{ x: -1.3, y: hy }, { x: 3.6, y: hy * 0.95 }, { x: 10.4, y: -0.3 + hy * 0.22 }], 0.7, 0.6, 141 + hy * 9);
      pale(0.38, 0.5);
      c.beginPath(); c.moveTo(-0.8, -2); c.bezierCurveTo(2.6, -2.9, 6, -2, 8.8, -0.9); c.stroke();
      inkStroke(c, [{ x: 12.2, y: -1.3 }, { x: 14.6, y: -3.4 }, { x: 17, y: -2.2 }, { x: 19, y: -4.4 }], 1.5, { alpha: A * 0.7, taper: 0.8, seed: 157, color: ink });
    }

    /* wet ink gathering at the tip (the seal's is vermillion) */
    const wet = o.wet ?? 0;
    if (wet > 0.02 && kind !== 'fan') {
      c.globalAlpha = A * 0.85 * wet;
      c.fillStyle = kind === 'seal' ? red : ink;
      const ty = kind === 'scribe' ? -1.3 : kind === 'wisp' ? -3.2 : kind === 'tide' ? -1.6 : 0;
      const tr = kind === 'stone' ? 2.2 : kind === 'broom' ? 2.3 : kind === 'tide' ? 1.9 : kind === 'seal' ? 1.6 : 1.3;
      blobPath(c, BRUSH_TIP[kind], ty, tr, sd, 0.3, 8);
      c.fill();
    }
    c.restore();
  }

  /* ============================================================
     THE SCRIBE — the character sprite (v24)
     One parametric figure for the run, the menus and the echoes:
     feet that step, a robe whose hem lags the stride, a streaming
     vermillion scarf, sleeves and pale hands on the haft, eyes that
     turn away when the scribe aims up the page, and a different
     hat and garment for every brush. Authored at r = 10.
     ============================================================ */
  /* the figure is painted a quarter larger than its hit circle: a scribe
     that reads in a horde, on a circle that stays as honest as before */
  const SCRIBE_SCALE = 1.26;
  function drawScribeFigure(c, o = {}) {
    const rr = o.r ?? 10;
    const u = rr / 10;
    const t = o.t ?? 0;
    const aim = o.aim ?? 0;
    const vx = o.vx || 0, vy = o.vy || 0;
    const spd = Math.hypot(vx, vy);
    const mv = Math.min(1, spd / (o.speedRef ?? 255));
    const rc = Math.max(0, Math.min(1.2, o.recoil || 0));
    const A = o.alpha ?? 1;
    const ink = o.ink ?? INK;
    const paper = o.paper ?? PAPER;
    const red = o.red === null ? null : (o.red ?? bossInk());
    const type = BRUSH_TIP[o.brush] ? o.brush : 'needle';
    const sd = (o.seed ?? 7) | 0;
    const face = Math.cos(aim), depth = Math.sin(aim);
    const dirx = spd > 1 ? vx / spd : 0, diry = spd > 1 ? vy / spd : 0;
    const ph = o.phase ?? t * 11.5;
    const sw = Math.sin(ph);
    const stride = 3.1 * mv;
    const bob = -Math.abs(Math.cos(ph)) * 1.25 * mv + Math.sin(t * 2.3) * 0.28 * (1 - mv);
    const away = depth < -0.28;
    const fsm = Math.max(-1, Math.min(1, face * 3));
    const flipS = (fsm < 0 ? -1 : 1) * Math.max(0.55, Math.abs(fsm));
    const kick = -rc * 3.2;
    const spin = o.spin || 0;
    const hx = -dirx * 2.4 * mv + Math.sin(t * 7.3) * 0.45 * (0.3 + mv);
    const hy = -Math.abs(diry) * 0.6 * mv;

    c.save();
    c.scale(u, u);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    /* a soft ink shadow grounds the figure on the sheet */
    if (o.shadow !== false) {
      c.globalAlpha = A * 0.15; c.fillStyle = ink;
      c.beginPath(); c.ellipse(0, 12.3, 9.6 - Math.abs(bob) * 0.6, 3.1, 0, 0, TAU); c.fill();
    }

    /* the feet: two sandals that step along the stride */
    if (type !== 'wisp') {
      c.globalAlpha = A; c.fillStyle = ink;
      for (const s of [-1, 1]) {
        const k = sw * s;
        const fx = s * 2.9 + dirx * k * stride;
        const fy = 11.3 + diry * k * stride * 0.5 - Math.max(0, k) * 1.5 * mv;
        c.beginPath(); c.ellipse(fx, fy, 2.2, 1.2, 0, 0, TAU); c.fill();
      }
    }

    c.save();
    c.translate(0, bob);
    c.rotate(o.lean ?? dirx * 0.13 * mv);
    c.scale(1 + rc * 0.07, 1 - rc * 0.05);

    /* tool space -> body space, so the hands land on the haft */
    const toBody = (tx, ty) => {
      const lx = tx * 1.02 + 10.2 + kick, ly = (ty * 1.02 - 4.2) * flipS;
      const ca = Math.cos(aim + spin), sa = Math.sin(aim + spin);
      return { x: lx * ca - ly * sa, y: lx * sa + ly * ca };
    };
    const gp = BRUSH_GRIP[type] || [-6.6, -12.6];
    const gripA = toBody(gp[0], -0.3), gripB = toBody(gp[1], -0.8);

    const arm = (sx0, sy0, g) => {
      const mx = (sx0 + g.x) / 2, my = (sy0 + g.y) / 2 + 1.6;
      const dx = g.x - sx0, dy = g.y - sy0, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath();
      c.moveTo(sx0 + nx * 1.5, sy0 + ny * 1.5);
      c.quadraticCurveTo(mx + nx * 2.4, my + ny * 2.4, g.x + nx * 1.9, g.y + ny * 1.9);
      c.lineTo(g.x - nx * 1.9, g.y - ny * 1.9);
      c.quadraticCurveTo(mx - nx * 2.6, my - ny * 2.6 + 1.4, sx0 - nx * 1.5, sy0 - ny * 1.5);
      c.closePath(); c.fill();
      /* the hand: a pale fist on the haft */
      c.globalAlpha = A * 0.96; c.fillStyle = paper;
      c.beginPath(); c.arc(g.x, g.y, 1.55, 0, TAU); c.fill();
      c.globalAlpha = A * 0.9; c.strokeStyle = ink; c.lineWidth = 0.5;
      c.beginPath(); c.arc(g.x, g.y, 1.55, 0, TAU); c.stroke();
    };
    const weapon = () => {
      c.save();
      c.rotate(aim + spin);
      c.scale(1, flipS);
      c.translate(10.2 + kick, -4.2);
      drawBrushTool(c, type, { len: 1.02, wet: o.wet ?? (rc > 0.4 ? 0.9 : 0), seed: sd, alpha: A, ink, paper, red: red || ink });
      /* the flick: wet ink thrown from the tip right after the stroke */
      if (rc > 0.5 && o.flick !== false) {
        c.globalAlpha = Math.min(1, (rc - 0.5) * 2.6) * A;
        c.fillStyle = type === 'seal' && red ? red : ink;
        c.save();
        c.translate(BRUSH_TIP[type] + 3.2, -0.5);
        c.rotate(0.35);
        teardrop(c, 2.5);
        c.fill();
        c.restore();
      }
      c.restore();
    };
    const hands = () => {
      const sA = gripA.x >= 0 ? 4.6 : -4.6;
      arm(-sA, -5.6, gripB);
      weapon();
      arm(sA, -5.6, gripA);
    };

    /* aiming up the page: the brush and both sleeves pass behind the body */
    if (away) hands();

    /* the scarf: the sheet's one red, streaming behind the stride */
    let tdx = -dirx * mv + (-fsm * 0.45) * (1 - mv), tdy = -diry * mv * 0.8 + (1 - mv);
    { const tl = Math.hypot(tdx, tdy) || 1; tdx /= tl; tdy /= tl; }
    const stream = (ax, ay, L, w, color, seedK) => {
      const nx = -tdy, ny = tdx;
      const pts = [{ x: ax - tdx * 2.4, y: ay - tdy * 2.4 }];
      for (let i = 0; i <= 4; i++) {
        const q = i / 4;
        const wv = Math.sin(t * 9 - q * 4.2 + seedK) * (0.5 + 1.5 * mv) * q;
        pts.push({ x: ax + tdx * L * q + nx * wv, y: ay + tdy * L * q + ny * wv });
      }
      inkStroke(c, pts, w, { alpha: A * 0.95, taper: 0.5, seed: sd ^ (21 + seedK), color, jit: 0.05 });
    };
    if (red) stream(-fsm * 2.6, -7.4, 8.5 + 2.5 * mv, 2.4, red, 0);

    /* the robe: kosode and hakama, hem bitten ragged, lagging the stride */
    c.save();
    if (type === 'stone') c.scale(1.1, 1);
    c.globalAlpha = A; c.fillStyle = ink;
    c.beginPath();
    c.moveTo(-5.4, -6.6);
    c.quadraticCurveTo(-6.9, -1.6, -5, 2.2);
    c.quadraticCurveTo(-7.4, 5.6, -9.2 + hx, 10.1 + hy);
    if (type === 'wisp') {
      /* the spirit-bearer has no feet: the hem thins into three trailing wisps */
      const wv = Math.sin(t * 3.1) * 0.8;
      c.lineTo(-6.6 + hx, 12.4 + hy);
      c.lineTo(-4.2 + hx, 9.4 + hy);
      c.lineTo(-1.2 + hx * 1.3 + wv, 14 + hy);
      c.lineTo(1.6 + hx, 9.6 + hy);
      c.lineTo(4.8 + hx * 1.4 - wv, 12.8 + hy);
      c.lineTo(6.6 + hx, 9.4 + hy);
    } else {
      c.lineTo(-6 + hx, 9.2 + hy);
      c.lineTo(-3.4 + hx * 0.9, 10.7 + hy);
      c.lineTo(-0.4 + hx * 0.8, 9.2 + hy);
      c.lineTo(2.8 + hx * 0.9, 10.8 + hy);
      c.lineTo(5.8 + hx, 9.2 + hy);
    }
    c.lineTo(9.3 + hx, 10.2 + hy);
    c.quadraticCurveTo(7.4, 5.6, 5, 2.2);
    c.quadraticCurveTo(6.9, -1.6, 5.4, -6.6);
    c.quadraticCurveTo(0, -9.4, -5.4, -6.6);
    c.closePath(); c.fill();
    /* the pale V of the collar */
    c.globalAlpha = A * 0.5; c.strokeStyle = paper; c.lineWidth = 0.7;
    c.beginPath(); c.moveTo(-2.7, -7.4); c.lineTo(fsm * 0.9, -1.9); c.lineTo(2.7, -7.4); c.stroke();
    /* dry creases down the hakama */
    c.globalAlpha = A * 0.24; c.lineWidth = 0.9;
    c.beginPath(); c.moveTo(-2.6, 3.6); c.quadraticCurveTo(-4 + hx * 0.4, 7, -3.6 + hx * 0.8, 9.6); c.stroke();
    c.beginPath(); c.moveTo(2.8, 3.6); c.quadraticCurveTo(4.6 + hx * 0.4, 6.6, 4.2 + hx * 0.8, 9.6); c.stroke();
    /* the obi: a pale sash, knotted at the back */
    c.globalAlpha = A * 0.86; c.lineWidth = 2.3;
    c.beginPath(); c.moveTo(-5, 1.9); c.quadraticCurveTo(0, 3.3, 5, 1.9); c.stroke();
    c.globalAlpha = A; c.fillStyle = ink;
    c.beginPath(); c.arc(-fsm * 3.1, 2.7, 1.5, 0, TAU); c.fill();
    /* the tide-bearer wears a straw rain cape */
    if (type === 'tide') {
      c.globalAlpha = A * 0.92; c.strokeStyle = ink; c.lineWidth = 0.8;
      for (let i = 0; i < 9; i++) {
        const xx = -7.6 + (i / 8) * 15.2;
        c.beginPath();
        c.moveTo(xx * 0.72, -6.2 + Math.abs(xx) * 0.1);
        c.lineTo(xx + hx * 0.3, -1.2 + Math.abs(xx) * 0.34 + (i % 2) * 0.9);
        c.stroke();
      }
    }
    c.restore();
    /* the scarf's wrap at the throat */
    if (red) {
      c.globalAlpha = A * 0.96; c.strokeStyle = red; c.lineWidth = 1.9;
      c.beginPath(); c.moveTo(-3.3, -7.3); c.quadraticCurveTo(fsm * 0.6, -6.2, 3.3, -7.3); c.stroke();
    }

    if (!away) hands();

    /* the head, and two pale slits that turn away when the scribe looks up the page */
    const hxh = fsm * 0.7;
    c.globalAlpha = A; c.fillStyle = ink;
    c.beginPath(); c.arc(hxh, -10.4, 4.5, 0, TAU); c.fill();
    const eyeA = Math.max(0, Math.min(1, (depth + 0.8) / 0.45));
    if (eyeA > 0.02 && o.eyes !== false) {
      const el = rc > 0.4 ? 3 : 2.3;
      const ex = hxh + fsm * 1.5, ey = -8.5 + depth * 0.6;
      c.globalAlpha = A * 0.96 * eyeA; c.strokeStyle = paper; c.lineWidth = 1.2;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(ex + s * 2 - el / 2, ey); c.lineTo(ex + s * 2 + el / 2, ey); c.stroke();
      }
    }

    /* the hat: every brush dresses its scribe differently */
    c.save();
    c.translate(hxh, -12.6);
    c.rotate(Math.sin(t * 5.2) * 0.05 * (0.4 + mv) + dirx * 0.07 * mv - rc * 0.05 * (fsm < 0 ? -1 : 1));
    c.globalAlpha = A; c.fillStyle = ink;
    const rim = (hw, dip, a) => {
      c.globalAlpha = A * (a ?? 0.42); c.strokeStyle = paper; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(-hw, 1.1); c.quadraticCurveTo(0, dip, hw, 1.1); c.stroke();
    };
    const ribs = (px0, py0, xs, yb) => {
      c.globalAlpha = A * 0.24; c.strokeStyle = paper; c.lineWidth = 0.45;
      for (const x of xs) { c.beginPath(); c.moveTo(px0, py0); c.lineTo(x, yb - Math.abs(x) * 0.12); c.stroke(); }
    };
    if (type === 'broom') {
      /* a wide flat sandogasa */
      c.beginPath();
      c.moveTo(-12.8, 0.6);
      c.quadraticCurveTo(-5.5, -1.6, 0, -3.6);
      c.quadraticCurveTo(5.5, -1.6, 12.8, 0.6);
      c.quadraticCurveTo(0, 4.6, -12.8, 0.6);
      c.closePath(); c.fill();
      ribs(0, -3.2, [-9.6, -5, 0, 5, 9.6], 2.6);
      rim(11.9, 4.2);
    } else if (type === 'stone') {
      /* a domed iron jingasa */
      c.beginPath();
      c.moveTo(-9.6, 1);
      c.bezierCurveTo(-9.4, -5.8, -4.4, -8.4, 0, -8.4);
      c.bezierCurveTo(4.4, -8.4, 9.4, -5.8, 9.6, 1);
      c.quadraticCurveTo(0, 4.2, -9.6, 1);
      c.closePath(); c.fill();
      c.globalAlpha = A * 0.5; c.strokeStyle = paper; c.lineWidth = 0.9;
      c.beginPath(); c.moveTo(-8.8, 1.2); c.quadraticCurveTo(0, 3.8, 8.8, 1.2); c.stroke();
      c.globalAlpha = A * 0.26; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(0, -8); c.lineTo(0, 2); c.stroke();
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(0, -8.7, 0.95, 0, TAU); c.fill();
    } else if (type === 'wisp') {
      /* a tall kasa with a hanging veil of gauze */
      const sway = Math.sin(t * 2.6) * 0.7 + hx * 0.5;
      for (const s of [-1, 1]) {
        c.globalAlpha = A * 0.2;
        c.beginPath();
        c.moveTo(s * 10.2, 1.3);
        c.quadraticCurveTo(s * 11.6 + sway * 0.5, 8, s * 10.4 + sway, 14.6);
        c.quadraticCurveTo(s * 8.6 + sway, 16.4, s * 7 + sway, 14.9);
        c.quadraticCurveTo(s * 6.2 + sway * 0.6, 9, s * 6, 2.5);
        c.closePath(); c.fill();
        c.globalAlpha = A * 0.34; c.strokeStyle = ink; c.lineWidth = 0.4;
        c.beginPath(); c.moveTo(s * 10.2, 1.3); c.quadraticCurveTo(s * 11.6 + sway * 0.5, 8, s * 10.4 + sway, 14.6); c.stroke();
      }
      c.globalAlpha = A;
      c.beginPath();
      c.moveTo(-10.8, 0.9);
      c.quadraticCurveTo(-4.2, -3, 0, -7.4);
      c.quadraticCurveTo(4.2, -3, 10.8, 0.9);
      c.quadraticCurveTo(0, 4.2, -10.8, 0.9);
      c.closePath(); c.fill();
      ribs(0, -6.8, [-7.6, -3.8, 0, 3.8, 7.6], 2.4);
      rim(10, 3.8);
    } else if (type === 'fan') {
      /* a tall court eboshi, tied under the chin */
      const lean = -fsm * 1.6;
      c.beginPath();
      c.moveTo(-4.9, 1.6);
      c.lineTo(-4.5, -2.2);
      c.bezierCurveTo(-4.4, -8.6, -1.2 + lean, -12.4, 1.6 + lean, -12.2);
      c.bezierCurveTo(4.6 + lean, -11.8, 4.9, -5, 4.9, 1.6);
      c.quadraticCurveTo(0, 3.4, -4.9, 1.6);
      c.closePath(); c.fill();
      c.globalAlpha = A * 0.62; c.strokeStyle = paper; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(-4.5, 0.5); c.quadraticCurveTo(0, 2, 4.5, 0.5); c.stroke();
      c.globalAlpha = A * 0.26; c.lineWidth = 0.5;
      c.beginPath(); c.moveTo(0.4, -0.4); c.quadraticCurveTo(0.2 + lean * 0.5, -6, 1.2 + lean, -11.4); c.stroke();
      c.globalAlpha = A * 0.5; c.lineWidth = 0.45;
      c.beginPath(); c.moveTo(-4.2, 1.8); c.lineTo(-3, 6); c.moveTo(4.2, 1.8); c.lineTo(3, 6); c.stroke();
    } else if (type === 'tide') {
      /* a drooping rain hat, its brim cut like a swell */
      c.beginPath();
      c.moveTo(-12.6, 2.6);
      c.quadraticCurveTo(-7, -2.2, 0, -4.8);
      c.quadraticCurveTo(7, -2.2, 12.6, 2.6);
      c.quadraticCurveTo(9.6, 1.8, 8.4, 3.1);
      c.quadraticCurveTo(5.6, 2.2, 4.2, 3.4);
      c.quadraticCurveTo(1.4, 2.5, 0, 3.6);
      c.quadraticCurveTo(-1.4, 2.5, -4.2, 3.4);
      c.quadraticCurveTo(-5.6, 2.2, -8.4, 3.1);
      c.quadraticCurveTo(-9.6, 1.8, -12.6, 2.6);
      c.closePath(); c.fill();
      c.globalAlpha = A * 0.4; c.strokeStyle = paper; c.lineWidth = 0.45;
      for (const wx of [-6, 0, 6]) { c.beginPath(); c.arc(wx, 0.6 - (wx === 0 ? 1.2 : 0), 2.3, Math.PI * 1.12, Math.PI * 1.88); c.stroke(); }
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(0, -5.1, 1, 0, TAU); c.fill();
    } else if (type === 'seal') {
      /* a flat lacquered magistrate's hat, the red crest on its brow */
      c.beginPath();
      c.moveTo(-11.6, 0.8);
      c.quadraticCurveTo(-5, -1.2, 0, -2.6);
      c.quadraticCurveTo(5, -1.2, 11.6, 0.8);
      c.quadraticCurveTo(0, 4.2, -11.6, 0.8);
      c.closePath(); c.fill();
      rim(10.8, 3.8, 0.5);
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(0, -2.9, 1.05, 0, TAU); c.fill();
      if (red) {
        c.globalAlpha = A * 0.96; c.fillStyle = red;
        c.save(); c.translate(fsm * 1.8, 0.3); c.rotate(-0.07); c.fillRect(-1.45, -1.3, 2.9, 2.6); c.restore();
      }
    } else if (type === 'scribe') {
      /* the master goes bare-headed: a bound topknot, a pin, a headband whose tails fly */
      c.globalAlpha = A * 0.92; c.strokeStyle = paper; c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-4.2, 0.9); c.quadraticCurveTo(fsm * 0.8, 2.2, 4.2, 0.9); c.stroke();
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(-fsm * 1.1, -3.4, 2.1, 0, TAU); c.fill();
      c.strokeStyle = ink; c.lineWidth = 0.65;
      c.beginPath(); c.moveTo(-fsm * 1.1 - 3.2, -4.6); c.lineTo(-fsm * 1.1 + 3.2, -2.3); c.stroke();
      c.restore();
      c.save();
      stream(hxh - fsm * 3.6, -11.4, 7 + 2 * mv, 1.5, ink, 2);
      stream(hxh - fsm * 3.6, -10.6, 5.6 + 2 * mv, 1.2, ink, 5);
    } else {
      /* the travelling scribe's conical kasa */
      c.beginPath();
      c.moveTo(-11.2, 0.9);
      c.quadraticCurveTo(-4.6, -2.6, 0, -6.2);
      c.quadraticCurveTo(4.6, -2.6, 11.2, 0.9);
      c.quadraticCurveTo(0, 4.4, -11.2, 0.9);
      c.closePath(); c.fill();
      ribs(0, -5.6, [-8, -4, 0, 4, 8], 2.4);
      rim(10.4, 4);
      c.globalAlpha = A; c.fillStyle = ink;
      c.beginPath(); c.arc(0, -6.5, 1.15, 0, TAU); c.fill();
    }
    c.restore();

    c.restore();   /* body */
    c.restore();   /* scale */
  }

  /* ---------------- the ghost scribe ----------------
     a past run's echo walking beside the living brush: the same
     silhouette, drawn as a breath of pale ink — no eye, no shadow,
     no trail. Where it fell, a small 終 keeps the place. */
  function drawGhost(c, t) {
    const S = G.S;
    const gh = S.ghost;
    if (!gh) return;
    const gx = gh.x, gy = gh.y;
    c.save();
    c.translate(gx, gy);
    const breathe = 1 + Math.sin(t * 2.1) * 0.03;
    c.scale(breathe, breathe);
    c.globalAlpha = gh.dead ? 0.1 : 0.16;
    c.fillStyle = INK;
    /* the robe, simplified: one ragged cone */
    c.beginPath();
    c.moveTo(0, -13);
    c.quadraticCurveTo(9, -6, 7, 11);
    c.quadraticCurveTo(0, 14, -7, 11);
    c.quadraticCurveTo(-9, -6, 0, -13);
    c.fill();
    /* the kasa: one pale arc */
    c.globalAlpha = gh.dead ? 0.12 : 0.19;
    c.strokeStyle = INK;
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, -13, 8.5, Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
    /* the brush, riding low and still */
    c.globalAlpha = 0.13;
    c.lineWidth = 2.2;
    c.beginPath();
    c.moveTo(6, -2);
    c.quadraticCurveTo(14, 2, 19, 9);
    c.stroke();
    /* a rival signs the air above their echo — their name, faint */
    if (gh.name) {
      c.globalAlpha = gh.dead ? 0.12 : 0.3;
      c.fillStyle = INK;
      c.font = '9px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.fillText(String(gh.name).slice(0, 14), 0, -26);
    }
    c.restore();
    /* where the echo fell: the place-keeping seal */
    if (gh.dead) {
      const dx = gh.deathX, dy = gh.deathY;
      c.save();
      c.translate(dx, dy);
      c.globalAlpha = 0.2 + Math.sin(t * 1.6) * 0.05;
      c.strokeStyle = INK;
      c.lineWidth = 1.4;
      c.beginPath();
      c.arc(0, 0, 13, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = INK;
      c.font = '10px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('終', 0, 0.5);
      c.restore();
    }
  }

  /* ---------------- player: the brush spirit ----------------
     A living drop of ink that carries the chosen brush.
     It leans into the run, squashes on each stroke, and
     its single paper eye narrows in concentration. */
  /* the ink gauge — the ENSŌ RING. The old screen bar at bottom-center
     crossed the world's pressed borders whenever the brush walked the
     page's lower margin; the gauge is now drawn AROUND THE HAND in
     world space: a hairline circle that fills as motes gather and
     closes like an ensō the moment the ink rises. The wrist's 墨 chip
     (hud-foot) carries the rise count. */
  function drawInkRing(c, t) {
    const S = G.S, p = S.player;
    const st = S.stats;
    const need = (G.xpReqFor ? G.xpReqFor(st.xpLevel) : CFG.xp.req(st.xpLevel)) || 1;
    const frac = Math.max(0, Math.min(1, st.xp / need));
    /* the ring breathes — a hand-pressed circle is never perfect */
    const R = 30 + Math.sin(t * 1.7) * 0.8;
    c.save();
    c.translate(p.x, p.y);
    /* v23 CALLIGRAPHY SURGE: a spinning vermillion hairline while the inkstone burns */
    if (S.surgeT > 0) {
      const sa = Math.min(1, S.surgeT / 1.4);
      c.save();
      c.rotate(t * 1.9);
      c.strokeStyle = bossInk();
      c.globalAlpha = 0.34 * sa;
      c.lineWidth = 1.4;
      c.setLineDash([8, 6]);
      c.beginPath(); c.arc(0, 0, R + 6.5, 0, TAU); c.stroke();
      c.restore();
    }
    /* v23 ENSŌ BLOOM: the closed ring expands when the ink rises */
    if (S.levelBloomT > 0) {
      const bp = 1 - S.levelBloomT / 0.85;
      c.strokeStyle = bossInk();
      c.globalAlpha = (1 - bp) * 0.55;
      c.lineWidth = 2.6 * (1 - bp * 0.6);
      c.beginPath(); c.arc(0, 0, R + bp * 38, 0, TAU); c.stroke();
    }
    /* the eager end: past 92% the ink leans toward the rise */
    const eager = frac > 0.92;
    /* the faint base track: the whole ensō, waiting */
    c.globalAlpha = 0.13;
    c.strokeStyle = INK;
    c.lineWidth = 1.3;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
    /* the pressed register: a second hairline rides just outside */
    c.globalAlpha = 0.08;
    c.beginPath(); c.arc(0, 0, R + 2.2, 0, TAU); c.stroke();
    /* the gathering ink: swept clockwise from the top */
    if (frac > 0.004) {
      const a0 = -Math.PI / 2, a1 = a0 + frac * TAU;
      c.strokeStyle = eager ? bossInk() : INK;
      c.globalAlpha = eager ? 0.9 : 0.56;
      c.lineWidth = 2.4;
      c.lineCap = 'round';
      c.beginPath(); c.arc(0, 0, R, a0, a1); c.stroke();
      /* the nib at the arc's head */
      c.fillStyle = eager ? bossInk() : INK;
      c.globalAlpha = eager ? 0.95 : 0.62;
      c.beginPath();
      c.arc(Math.cos(a1) * R, Math.sin(a1) * R, 2.2, 0, TAU);
      c.fill();
    }
    /* v23 INK STEP (瞬) cadence arc: quiet lower crescent + red bead when gathered */
    if (S.dashCd > 0) {
      const maxCd = Math.max(0.5, S.dashCdMax || CFG.dash.cd);
      const df = Math.max(0, Math.min(1, 1 - S.dashCd / maxCd));
      const span = 1.15;
      const mid = Math.PI / 2;
      c.strokeStyle = INK;
      c.lineWidth = 1.5;
      c.lineCap = 'round';
      c.globalAlpha = 0.14;
      c.beginPath(); c.arc(0, 0, R - 4.2, mid - span / 2, mid + span / 2); c.stroke();
      c.strokeStyle = bossInk();
      c.globalAlpha = 0.52;
      c.beginPath(); c.arc(0, 0, R - 4.2, mid - span / 2, mid - span / 2 + span * df); c.stroke();
    } else if (S.mode === 'playing') {
      c.fillStyle = bossInk();
      c.globalAlpha = 0.58 + Math.sin(t * 3.2) * 0.14;
      c.beginPath(); c.arc(0, R - 4.2, 1.75, 0, TAU); c.fill();
    }
    c.restore();
  }

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

    /* speed streaks: two dry hairs thrown behind the stride */
    if (spd > 70 && ap > 0.6 && !S.reduced) {
      const a = Math.atan2(-vy, -vx);
      const nx = -Math.sin(a), ny = Math.cos(a);
      for (const off of [-5, 5]) {
        const x0 = p.x + Math.cos(a) * 9 + nx * off, y0 = p.y + Math.sin(a) * 9 + ny * off + 3;
        inkStroke(c, [
          { x: x0, y: y0 },
          { x: x0 + Math.cos(a) * (10 + 9 * mv), y: y0 + Math.sin(a) * (10 + 9 * mv) },
        ], 1.7, { alpha: (blink ? 0.2 : 0.34) * mv, taper: 0.9, seed: sd ^ (off > 0 ? 5 : 9) });
      }
    }

    c.save();
    c.globalAlpha = blink ? 0.55 : 1;
    const back = rc * 2.4;
    c.translate(p.x - Math.cos(p.aim) * back, p.y - Math.sin(p.aim) * back);
    let figA = blink ? 0.55 : 1;
    if (ap < 1) {
      const b = ap - 1;
      const ae = 1 + 2.70158 * b * b * b + 1.70158 * b * b;   /* back-out ease */
      figA *= 0.15 + 0.85 * ap;
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

    /* the scribe itself — the same figure the menus and the echoes draw.
       During an Ink Step the stride is forced full, so the robe and the
       scarf throw themselves flat behind the body. */
    {
      const dashing = S.dashT > 0;
      drawScribeFigure(c, {
        brush: type, r: p.r * SCRIBE_SCALE, aim: p.aim,
        vx: dashing ? (S.dashVx || vx) : vx, vy: dashing ? (S.dashVy || vy) : vy,
        speedRef: dashing ? 200 : CFG.player.speed * 1.02,
        recoil: rc, t, alpha: figA, seed: sd,
        spin: -(1 - ap) * 5.2,
        wet: rc > 0.4 ? 0.9 : 0.16,
      });
    }
    c.globalAlpha = blink ? 0.55 : 1;

    if (S.invulnT > 0) {
      c.globalAlpha = (blink ? 0.55 : 1) * 0.5;
      c.strokeStyle = INK;
      c.lineWidth = 1.2;
      c.beginPath(); c.arc(0, 0, p.r + 4.5, 0, TAU); c.stroke();
      c.globalAlpha = blink ? 0.55 : 1;
    }

    const st = S.stats;

    /* ink orbit: sculpted magatama guardians painting a living calligraphy ring */
    if (st && st.orb > 0) {
      const orbR = CFG.orbit.radius(st.orb);
      const base = S.clockT || t;
      const maxed = st.orb >= 3;
      const red = bossInk();
      const bMul = blink ? 0.52 : 1;
      c.save();
      c.lineCap = 'round';
      /* faint brushed register track */
      c.globalAlpha = bMul * (0.15 + 0.04 * Math.sin(t * 2.1));
      c.strokeStyle = maxed ? red : INK;
      c.lineWidth = 1.1;
      c.setLineDash([8, 9]);
      c.beginPath(); c.arc(0, 0, orbR, 0, TAU); c.stroke();
      c.setLineDash([]);
      /* three-stage tapered ink wake + curved magatama bead per guardian */
      for (let i = 0; i < st.orb; i++) {
        const a = base * CFG.orbit.speed + (i / st.orb) * TAU;
        c.strokeStyle = INK;
        c.globalAlpha = bMul * 0.16; c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, orbR, a - 1.18, a - 0.58); c.stroke();
        c.globalAlpha = bMul * 0.34; c.lineWidth = 3.1;
        c.beginPath(); c.arc(0, 0, orbR, a - 0.62, a - 0.22); c.stroke();
        c.globalAlpha = bMul * 0.62; c.lineWidth = 5.2;
        c.beginPath(); c.arc(0, 0, orbR, a - 0.25, a - 0.03); c.stroke();
        if (maxed) {
          c.strokeStyle = red; c.globalAlpha = bMul * 0.42; c.lineWidth = 1.4;
          c.beginPath(); c.arc(0, 0, orbR + 3.2, a - 0.55, a - 0.05); c.stroke();
        }
        const ox = Math.cos(a) * orbR, oy = Math.sin(a) * orbR;
        c.save();
        c.translate(ox, oy);
        c.rotate(a + Math.PI / 2);
        /* comma/magatama brush-bead body */
        c.globalAlpha = bMul * 0.96;
        c.fillStyle = INK;
        c.beginPath();
        c.arc(2.2, 0, 5.1, -Math.PI * 0.65, Math.PI * 0.72);
        c.quadraticCurveTo(-4.5, 4.6, -9.8, 1.4);
        c.quadraticCurveTo(-4.2, 0.8, -2.2, -3.6);
        c.closePath();
        c.fill();
        /* carved paper eye inside the magatama (crimson when Grave Ring wakes) */
        c.fillStyle = maxed ? red : PAPER;
        c.globalAlpha = bMul * 0.94;
        c.beginPath(); c.arc(2.5, 0, maxed ? 2.1 : 1.55, 0, TAU); c.fill();
        if (maxed) {
          c.fillStyle = PAPER;
          c.beginPath(); c.arc(2.9, -0.3, 0.7, 0, TAU); c.fill();
        }
        c.restore();
      }
      /* v25 MOONLIT WHEEL: counter-turning vermillion crescent blades */
      if (st.c_moon) {
        const inR = orbR * 0.56;
        c.strokeStyle = red;
        c.globalAlpha = bMul * 0.16; c.lineWidth = 1;
        c.beginPath(); c.arc(0, 0, inR, 0, TAU); c.stroke();
        for (let mi = 0; mi < 2; mi++) {
          const ma = -base * CFG.orbit.speed * 1.45 + mi * Math.PI;
          c.strokeStyle = red;
          c.globalAlpha = bMul * 0.34; c.lineWidth = 2.8;
          c.beginPath(); c.arc(0, 0, inR, ma + 0.06, ma + 0.72); c.stroke();
          c.save();
          c.translate(Math.cos(ma) * inR, Math.sin(ma) * inR);
          c.rotate(ma - Math.PI / 2);
          c.globalAlpha = bMul * 0.94;
          c.fillStyle = red;
          c.beginPath();
          c.moveTo(7.5, 0);
          c.quadraticCurveTo(0, -5.2, -7.5, -1.2);
          c.quadraticCurveTo(-1, -1.4, 7.5, 0);
          c.closePath(); c.fill();
          c.beginPath(); c.arc(1.2, -0.8, 2.7, 0, TAU); c.fill();
          c.fillStyle = PAPER;
          c.beginPath(); c.arc(1.5, -0.8, 0.95, 0, TAU); c.fill();
          c.restore();
        }
      }
      c.restore();
    }

    /* paper ward: a fluttering ofuda talisman guarding the scribe's shoulder */
    if (st && st.ward) {
      const ready = st.wardCd <= 0;
      const wa = p.aim + Math.PI + Math.sin(t * 1.4) * 0.22;
      const dist = p.r * SCRIBE_SCALE + 12;
      c.save();
      c.translate(Math.cos(wa) * dist, Math.sin(wa) * dist - 3 + Math.sin(t * 2.8) * 1.4);
      c.rotate(Math.sin(t * 2.1) * 0.16 - 0.22);
      if (ready) {
        c.globalAlpha = (blink ? 0.55 : 1) * 0.96;
        c.fillStyle = PAPER;
        c.fillRect(-4.6, -7.8, 9.2, 15.6);
        c.strokeStyle = INK; c.lineWidth = 1.35;
        c.strokeRect(-4.6, -7.8, 9.2, 15.6);
        c.fillStyle = bossInk();
        c.fillRect(-2.1, -5.4, 4.2, 3.6);
        c.strokeStyle = INK; c.lineWidth = 0.9; c.globalAlpha *= 0.72;
        c.beginPath();
        c.moveTo(0, -0.4); c.lineTo(0, 5.4);
        c.moveTo(-2.1, 1.4); c.lineTo(2.1, 1.4);
        c.moveTo(-1.8, 3.8); c.lineTo(1.8, 3.8);
        c.stroke();
      } else {
        const rech = Math.max(0, Math.min(1, 1 - st.wardCd / CFG.ward.cd));
        c.globalAlpha = (blink ? 0.4 : 1) * 0.26;
        c.strokeStyle = INK; c.lineWidth = 1.1;
        c.setLineDash([2.5, 2.5]);
        c.strokeRect(-4.2, -7.2, 8.4, 14.4);
        c.setLineDash([]);
        c.fillStyle = bossInk(); c.globalAlpha = 0.22;
        const fh = 14.4 * rech;
        c.fillRect(-4.2, 7.2 - fh, 8.4, fh);
      }
      c.restore();
    }

    c.restore();
  }

  /* ============================================================
     v25 — PROJECTILES, LIVING STROKES, SEALS & ZONES
     Every arm speaks in genuine sumi-e calligraphy: silk ribbon
     wakes, folded tessen blades, crescent brush-sweeps, parabolic
     inkstone boulders, homing hitodama wisps, flying spirit-nibs,
     and hand-carved vermillion hanko impressions.
     ============================================================ */
  function drawBullet(c, b) {
    const red = bossInk();
    const fade = b.life - b.age < 0.12 ? Math.max(0.2, (b.life - b.age) / 0.12) : 1;
    const echoMul = b.echo ? 0.62 : 1;
    const A = fade * echoMul;

    /* world-space calligraphic flight ribbons first */
    if (b.tr && b.tr.len > 1) {
      if (b.kind === 'wisp' || b.brush === 'wisp') {
        drawRibbon(c, b.tr, b.x, b.y, 6.2, { alpha: 0.22 * A, color: INK, pow: 0.65, wave: 1.6, phase: b.age * 11 });
        drawRibbon(c, b.tr, b.x, b.y, 3.6, { alpha: 0.58 * A, color: INK, pow: 0.9, wave: 0.9, phase: b.age * 11 });
      } else if (b.kind === 'blade') {
        drawRibbon(c, b.tr, b.x, b.y, b.bloom ? 4.4 : 3.2, {
          alpha: (b.crimson || b.bloom ? 0.34 : 0.22) * A,
          color: (b.crimson || b.bloom) ? red : INK, pow: 1.1,
        });
      } else if (b.kind === 'stone') {
        drawRibbon(c, b.tr, b.x, b.y, 5.4, { alpha: 0.26 * A, color: INK, pow: 1.15 });
      } else if (b.kind === 'drop') {
        drawRibbon(c, b.tr, b.x, b.y, 6.8, { alpha: 0.24 * A, color: INK, pow: 1.1 });
      } else {
        drawRibbon(c, b.tr, b.x, b.y, b.crimson ? 3.2 : 2.6, {
          alpha: (b.crimson ? 0.48 : 0.38) * A,
          color: b.crimson ? red : INK, pow: 0.95,
        });
      }
    }

    c.save();
    c.translate(b.x, b.y);
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (b.kind === 'blade') {
      /* 扇 — sculpted folded tessen / origami paper blade with spinning gust ring */
      const rot = b.ang + b.age * b.spin;
      const sc = b.bloom ? 1.16 : 1;
      c.scale(sc, sc);
      /* curved spinning wind-shear arc */
      c.save();
      c.rotate(rot);
      c.strokeStyle = (b.crimson || b.bloom) ? red : INK;
      c.globalAlpha = (b.gale ? 0.38 : 0.22) * A;
      c.lineWidth = b.gale ? 1.8 : 1.15;
      c.beginPath(); c.arc(0, 0, 9.8, -1.25, 0.35); c.stroke();
      if (b.gale) {
        c.strokeStyle = INK; c.globalAlpha = 0.2 * A; c.lineWidth = 1;
        c.beginPath(); c.arc(0, 0, 11.4, 1.5, 2.75); c.stroke();
      }
      /* upper dark ink wing */
      c.globalAlpha = 0.96 * A;
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(11.4, 0);
      c.lineTo(-5.8, -5.8);
      c.lineTo(-2.6, 0);
      c.closePath();
      c.fill();
      /* lower folded wing — warm shaded facet */
      c.globalAlpha = 0.78 * A;
      c.fillStyle = b.crimson ? red : INK;
      c.beginPath();
      c.moveTo(11.4, 0);
      c.lineTo(-2.6, 0);
      c.lineTo(-5.8, 5.8);
      c.closePath();
      c.fill();
      /* crisp paper fold crease & fan-rib notch */
      c.globalAlpha = 0.92 * A;
      c.strokeStyle = (b.crimson && !b.bloom) ? PAPER : (b.bloom ? red : PAPER);
      c.lineWidth = 1.15;
      c.beginPath(); c.moveTo(9.4, 0); c.lineTo(-3.2, 0); c.stroke();
      /* sacred red sun dot on bloom / monsoon blades */
      if (b.crimson || b.bloom) {
        c.fillStyle = b.crimson ? PAPER : red;
        c.globalAlpha = 0.95 * A;
        c.beginPath(); c.arc(1.8, -1.6, 1.45, 0, TAU); c.fill();
      }
      c.restore();
    } else if (b.kind === 'drop' || b.brush === 'broom') {
      /* 掃 — sweeping crescent brush-swatch with combed kasure hairs & wet droplets */
      c.rotate(b.ang);
      const big = 1 + 0.08 * (b.heavy || 0);
      c.scale(big, big);
      if (b.slow) {
        /* Wet Sweep: glistening diluted wash rim ahead of the bristles */
        c.globalAlpha = 0.22 * A;
        c.strokeStyle = INK; c.lineWidth = 3.2;
        c.beginPath(); c.arc(-2, 0, 11.5, -0.95, 0.95); c.stroke();
      }
      /* crescent brush-head body */
      c.globalAlpha = 0.94 * A;
      c.fillStyle = INK;
      c.beginPath();
      c.moveTo(8.8, 0);
      c.quadraticCurveTo(6.8, -7.8, -3.4, -8.8);
      c.quadraticCurveTo(-0.4, -3.6, -5.8, -2.6);
      c.quadraticCurveTo(-2.2, 0, -5.8, 2.6);
      c.quadraticCurveTo(-0.4, 3.6, -3.4, 8.8);
      c.quadraticCurveTo(6.8, 7.8, 8.8, 0);
      c.closePath();
      c.fill();
      /* dry-brush kasure bristle splits inside the crescent */
      c.globalAlpha = 0.48 * A;
      c.strokeStyle = PAPER;
      c.lineWidth = 0.95;
      for (const yy of [-3.6, 0, 3.6]) {
        c.beginPath();
        c.moveTo(6.2, yy * 0.55);
        c.quadraticCurveTo(1.2, yy * 0.9, -3.2, yy * 1.15);
        c.stroke();
      }
      /* flying droplets flung off the sweep's tips */
      c.globalAlpha = 0.82 * A;
      c.fillStyle = INK;
      const wob = Math.sin(b.age * 18 + (b.seed || 0)) * 1.2;
      c.save(); c.translate(-5.8, -6.6 + wob); c.rotate(Math.PI + 0.35); teardrop(c, 1.85); c.fill(); c.restore();
      c.save(); c.translate(-6.6, 6.2 - wob); c.rotate(Math.PI - 0.35); teardrop(c, 1.65); c.fill(); c.restore();
    } else if (b.kind === 'stone' || b.brush === 'stone') {
      /* 岩 — parabolic lobbed inkstone boulder with grounding shadow & dripping ink */
      const frac = Math.max(0, Math.min(1, b.age / Math.max(0.1, b.life)));
      const lift = Math.sin(frac * Math.PI) * 14;
      const sc = (1 + 0.1 * (b.boulder || 0)) * (1 + Math.sin(frac * Math.PI) * 0.14);
      /* ground shadow directly on the washi sheet */
      c.save();
      c.globalAlpha = (0.24 - Math.sin(frac * Math.PI) * 0.08) * A;
      c.fillStyle = INK;
      const shR = 6.8 * (1 - Math.sin(frac * Math.PI) * 0.22);
      c.beginPath(); c.ellipse(0, 5.5, shR * 1.2, shR * 0.52, 0, 0, TAU); c.fill();
      c.restore();
      /* lifted tumbling inkstone body */
      c.translate(0, -lift);
      c.save();
      c.rotate(b.ang + b.age * (b.spin || 6.5));
      c.scale(sc, sc);
      c.globalAlpha = 0.97 * A;
      c.fillStyle = INK;
      blobPath(c, 0, 0, 7.2, b.seed ?? 7, 0.18, 8);
      c.fill();
      /* chiseled stone facet & ink-well gleam */
      c.globalAlpha = 0.45 * A;
      c.strokeStyle = PAPER; c.lineWidth = 1.05;
      c.beginPath();
      c.arc(-0.8, -0.8, 4.4, -2.4, -0.5);
      c.stroke();
      if (b.quake) {
        /* Quake art: a glowing vermillion fissure vein inside the stone */
        c.globalAlpha = 0.88 * A;
        c.strokeStyle = red; c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(-3.4, -1.2); c.lineTo(0.2, 0.8); c.lineTo(3.6, -0.9);
        c.moveTo(0.2, 0.8); c.lineTo(-0.6, 3.6);
        c.stroke();
      }
      c.restore();
      /* heavy satellite ink drop trailing behind the boulder */
      c.rotate(b.ang);
      c.globalAlpha = 0.78 * A;
      c.fillStyle = INK;
      c.save(); c.translate(-9.5, 2.2); c.rotate(Math.PI); teardrop(c, 2.1); c.fill(); c.restore();
    } else if (b.kind === 'wisp' || b.brush === 'wisp') {
      /* 幽 — homing hitodama ghost-flame with glowing crescent eye & soul motes */
      c.rotate(b.ang);
      const fl = Math.sin(b.age * 16 + (b.seed || 0));
      /* smoky outer spirit aura */
      c.globalAlpha = 0.24 * A;
      c.fillStyle = INK;
      c.beginPath(); c.ellipse(-1.5, 0, 8.8, 5.8 + fl * 0.6, 0, 0, TAU); c.fill();
      /* tapered hitodama body with twin flame tongues */
      c.globalAlpha = 0.94 * A;
      c.beginPath();
      c.moveTo(6.8, 0);
      c.quadraticCurveTo(4.2, -5.2, -2.2, -4.4);
      c.quadraticCurveTo(-6.8, -3.8, -10.5, -2.4 + fl * 1.4);
      c.quadraticCurveTo(-5.2, -0.4, -8.8, 2.2 - fl * 1.2);
      c.quadraticCurveTo(-3.6, 4.6, 2.6, 4.2);
      c.quadraticCurveTo(5.6, 3.2, 6.8, 0);
      c.closePath();
      c.fill();
      /* luminous washi spirit core & watching eye */
      c.globalAlpha = 0.92 * A;
      c.fillStyle = PAPER;
      c.beginPath(); c.ellipse(1.6, 0, 2.6, 1.75, 0, 0, TAU); c.fill();
      c.fillStyle = INK;
      c.beginPath(); c.arc(2.4, 0, 0.85, 0, TAU); c.fill();
      /* tiny orbiting soul-sparks */
      c.globalAlpha = 0.62 * A;
      c.beginPath();
      c.arc(-6.5, -4.4 - fl * 1.1, 1.15, 0, TAU);
      c.arc(-8.2, 3.8 + fl * 0.9, 0.9, 0, TAU);
      c.fill();
    } else {
      /* 細 — THE NEEDLE (and returned / crimson monsoon silk threads):
         a long razor-sharp calligraphy needle-stroke with a pale spine gleam */
      c.rotate(b.ang + Math.sin(b.age * 20 + (b.seed || 0)) * 0.03);
      const col = b.crimson ? red : INK;
      const pierce = (b.maxHits || b.hits || 1) > 1;
      const len = (pierce ? 14.5 : 12.2) + (b.heavy || 0) * 1.2;
      const hw = (b.heavy ? 2.35 : 1.95) * (b.echo ? 0.88 : 1);
      if (b.refl && !b.crimson) {
        /* mirror-returned dart wears a crisp paper halo */
        c.globalAlpha = 0.8 * A; c.strokeStyle = PAPER; c.lineWidth = hw * 2.2;
        c.beginPath(); c.moveTo(len, 0); c.lineTo(-len * 0.8, 0); c.stroke();
      }
      /* sculpted tapered calligraphy needle */
      c.globalAlpha = 0.97 * A;
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(len, 0);
      c.quadraticCurveTo(len * 0.22, -hw, -len * 0.45, -hw * 0.55);
      c.lineTo(-len * 1.05, 0);
      c.lineTo(-len * 0.45, hw * 0.55);
      c.quadraticCurveTo(len * 0.22, hw, len, 0);
      c.closePath();
      c.fill();
      /* fine paper spine gleam (hollow mirror-seam on echo casts) */
      c.globalAlpha = (b.echo ? 0.82 : 0.62) * A;
      c.strokeStyle = PAPER;
      c.lineWidth = b.echo ? 1.0 : 0.72;
      c.beginPath();
      c.moveTo(len * 0.62, 0);
      c.lineTo(-len * 0.35, 0);
      c.stroke();
      /* Through Mist: a tiny vermillion needle-tip gleam when piercing */
      if (pierce && !b.crimson && !b.echo) {
        c.globalAlpha = 0.9 * A;
        c.fillStyle = red;
        c.beginPath();
        c.moveTo(len + 1.8, 0); c.lineTo(len - 2.6, -1.35);
        c.lineTo(len - 1.2, 0); c.lineTo(len - 2.6, 1.35);
        c.closePath(); c.fill();
      }
    }
    c.restore();
  }

  /* the bounded page's margins: a mounted handscroll sheet with outer desk
     wash, double brushed frame, classical corner brackets & four red seals */
  function drawArenaEdge(c) {
    const S = G.S;
    if (S.runMode !== 'journey' && S.runMode !== 'daily') return;
    const A = CFG.world.arena, ins = A.inset;
    const x0 = -A.w / 2 + ins, y0 = -A.h / 2 + ins;
    const w = A.w - ins * 2, h = A.h - ins * 2;
    const pad = 900;
    const red = bossInk();
    c.save();
    /* quiet mounting silk wash outside the playable page margin */
    c.fillStyle = INK;
    c.globalAlpha = themeKey === 'dark' ? 0.14 : 0.055;
    c.fillRect(x0 - pad, y0 - pad, w + pad * 2, pad);
    c.fillRect(x0 - pad, y0 + h, w + pad * 2, pad);
    c.fillRect(x0 - pad, y0, pad, h);
    c.fillRect(x0 + w, y0, pad, h);
    /* main pressed ink border — four organic hand-ruled strokes */
    c.globalAlpha = 0.58;
    c.strokeStyle = INK;
    c.lineWidth = 3.2;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x0 + 8, y0); c.lineTo(x0 + w - 8, y0 + 1.2);
    c.moveTo(x0 + w, y0 + 8); c.lineTo(x0 + w - 1.2, y0 + h - 8);
    c.moveTo(x0 + w - 8, y0 + h); c.lineTo(x0 + 8, y0 + h - 1.2);
    c.moveTo(x0, y0 + h - 8); c.lineTo(x0 + 1.2, y0 + 8);
    c.stroke();
    /* inner silk-mounting hairline + classical kaku corner brackets */
    c.globalAlpha = 0.2;
    c.lineWidth = 1.05;
    c.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
    const br = 24;
    c.globalAlpha = 0.36;
    c.lineWidth = 1.5;
    const corners = [[x0 + 14, y0 + 14, 1, 1], [x0 + w - 14, y0 + 14, -1, 1],
                     [x0 + w - 14, y0 + h - 14, -1, -1], [x0 + 14, y0 + h - 14, 1, -1]];
    c.beginPath();
    for (const [kx, ky, sx, sy] of corners) {
      c.moveTo(kx, ky + sy * br); c.lineTo(kx, ky); c.lineTo(kx + sx * br, ky);
    }
    c.stroke();
    /* four stamped vermillion corner seals */
    c.globalAlpha = 0.72;
    c.fillStyle = red;
    for (const [kx, ky] of [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]]) {
      c.save(); c.translate(kx, ky); c.rotate(Math.PI / 4);
      c.fillRect(-3.6, -3.6, 7.2, 7.2);
      c.restore();
    }
    c.restore();
  }

  /* hostile projectiles — crisp washi halo + sacred vermillion threat core
     so incoming fire reads in a heartbeat against 150 black blots */
  function drawEBullet(c, b) {
    const red = bossInk();
    const bi = b.red ? red : INK;
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.ang);
    c.lineCap = 'round';
    if (b.kind === 'needle') {
      /* barbed sniper senbon with paper separation halo & vermillion tail */
      inkStroke(c, [{ x: -9, y: 0 }, { x: -24 - Math.min(12, b.age * 12), y: 0.3 }], 2.0, { alpha: 0.34, color: red });
      c.strokeStyle = PAPER; c.lineWidth = 4.2; c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(9.5, 0); c.lineTo(-10.5, 0); c.stroke();
      c.strokeStyle = bi; c.lineWidth = 2.0; c.globalAlpha = 0.98;
      c.beginPath(); c.moveTo(9.5, 0); c.lineTo(-10.5, 0); c.stroke();
      /* diamond barbed tip + vermillion threat bead */
      c.fillStyle = red;
      c.beginPath();
      c.moveTo(11, 0); c.lineTo(5.2, -2.7); c.lineTo(3.2, 0); c.lineTo(5.2, 2.7);
      c.closePath(); c.fill();
      c.fillStyle = PAPER;
      c.beginPath(); c.arc(6.2, 0, 0.85, 0, TAU); c.fill();
    } else {
      /* spitter glob: wobbling ink orb, paper contrast ring & pulsing red eye */
      const pulse = 1 + Math.sin(b.age * 15) * 0.1;
      inkStroke(c, [{ x: -5, y: 0 }, { x: -17 - Math.min(10, b.age * 8), y: Math.sin(b.age * 12) * 1.2 }], 3.2, { alpha: 0.34, color: bi });
      c.globalAlpha = 0.88; c.fillStyle = PAPER;
      c.beginPath(); c.arc(0, 0, 6.8 * pulse, 0, TAU); c.fill();
      c.globalAlpha = 0.96; c.strokeStyle = bi; c.lineWidth = 2.1;
      c.beginPath(); c.arc(0, 0, 5.4 * pulse, 0, TAU); c.stroke();
      c.fillStyle = red;
      c.beginPath(); c.arc(0.4, 0, 2.5 * pulse, 0, TAU); c.fill();
      c.fillStyle = PAPER;
      c.beginPath(); c.arc(1.1, -0.7, 0.75, 0, TAU); c.fill();
    }
    c.restore();
  }

  /* ink trail & tide wake puddles — glossy wet sumi pools that ripple on bite */
  function drawPuddle(c, pd) {
    const age = pd.max - pd.life;
    const grow = Math.min(1, age / 0.22);
    const fade = pd.life < 0.45 ? pd.life / 0.45 : 1;
    const R0 = pd.r * grow;
    c.save();
    c.translate(pd.x, pd.y);
    c.scale(1, 0.64);
    if (pd.hostile) {
      /* the sizing's glue — a pale glossy sheen with red warning rim */
      c.globalAlpha = 0.22 * fade;
      c.fillStyle = '#a89ab8';
      blobPath(c, 0, 0, R0, pd.seed, 0.28, 12);
      c.fill();
      c.globalAlpha = 0.38 * fade;
      c.strokeStyle = bossInk();
      c.lineWidth = 1.3;
      c.setLineDash([5, 5]);
      blobPath(c, 0, 0, R0 * 0.94, pd.seed, 0.28, 12);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 0.3 * fade;
      c.fillStyle = PAPER;
      c.beginPath();
      c.ellipse(-R0 * 0.2, -R0 * 0.12, R0 * 0.26, R0 * 0.1, -0.4, 0, TAU);
      c.fill();
      c.restore();
      return;
    }
    /* feathered wet bleed edge */
    c.globalAlpha = 0.16 * fade;
    c.fillStyle = INK;
    blobPath(c, 0, 0, R0 * 1.12, pd.seed ^ 3, 0.3, 12);
    c.fill();
    /* rich sumi body */
    c.globalAlpha = 0.38 * fade;
    blobPath(c, 0, 0, R0 * 0.94, pd.seed, 0.3, 12);
    c.fill();
    /* deep wet ink heart */
    c.globalAlpha = 0.32 * fade;
    blobPath(c, R0 * 0.06, R0 * 0.04, R0 * 0.52, pd.seed ^ 9, 0.34, 10);
    c.fill();
    /* subtle wet surface ripple highlight */
    c.globalAlpha = 0.26 * fade;
    c.strokeStyle = PAPER;
    c.lineWidth = 1.05;
    c.beginPath();
    c.arc(0, 0, R0 * 0.58, -2.5, -1.1);
    if (pd.wake) { c.moveTo(R0 * 0.36, R0 * 0.12); c.arc(0, 0, R0 * 0.38, 0.3, 1.8); }
    c.stroke();
    /* active bite pulse — the pool ripples when it tastes a blot */
    if (pd.pulse > 0) {
      const pk = 1 - pd.pulse / 0.28;
      c.globalAlpha = (1 - pk) * 0.55 * fade;
      c.strokeStyle = bossInk();
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(0, 0, R0 * (0.35 + 0.68 * pk), 0, TAU); c.stroke();
    }
    c.restore();
  }

  /* THE CRIMSON HANKO — hand-carved vermillion stone seal pressed into washi */
  function drawStamp(c, st) {
    const red = bossInk();
    const prog = 1 - st.life / st.max;
    const punch = prog < 0.13 ? 1.55 - 0.55 * (prog / 0.13) : 1;
    const fade = st.life < 0.24 ? st.life / 0.24 : 1;
    const half = st.r * (st.echo ? 0.34 : 0.38) * punch;
    const sd = st.seed || 777;
    c.save();
    c.translate(st.x, st.y);
    /* brushed outer strike-zone boundary + four cardinal register ticks */
    c.globalAlpha = fade * (0.55 * (1 - prog * 0.45));
    c.strokeStyle = red;
    c.lineWidth = st.edict ? 2.8 : 2.2;
    blobPath(c, 0, 0, st.r * Math.min(1.04, punch), sd ^ 11, 0.045, 20);
    c.stroke();
    c.globalAlpha = fade * 0.08 * (1 - prog * 0.5);
    c.fillStyle = red;
    c.fill();
    if (st.edict) {
      c.globalAlpha = fade * 0.32;
      c.lineWidth = 1.1;
      c.setLineDash([8, 6]);
      c.beginPath(); c.arc(0, 0, st.r * 0.86, 0, TAU); c.stroke();
      c.setLineDash([]);
    }
    /* the carved vermillion hanko square itself */
    c.rotate(-0.085 + ((sd & 7) - 3.5) * 0.015);
    c.globalAlpha = fade * (st.echo ? 0.82 : 0.94);
    c.fillStyle = red;
    stampBoxPath(c, half, sd, 0.052);
    c.fill();
    /* carved pale inner frame — as on a real stone hanko */
    c.strokeStyle = PAPER;
    c.globalAlpha = fade * 0.9;
    c.lineWidth = Math.max(1.5, half * 0.075);
    stampBoxPath(c, half * 0.8, sd ^ 5, 0.045);
    c.stroke();
    /* authentic carved tensho (篆書) seal-script glyph — vector-cut so the
       impression stays museum-crisp on every device, font-free & offline */
    c.strokeStyle = PAPER;
    c.globalAlpha = fade * 0.94;
    c.lineWidth = Math.max(1.6, half * 0.115);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const g = half * 0.5;
    c.beginPath();
    if (st.edict && !st.echo) {
      /* 勅 — Imperial Edict seal script (left bundle + right command hook) */
      c.moveTo(-g * 0.92, -g * 0.52); c.lineTo(-g * 0.08, -g * 0.52);
      c.rect(-g * 0.86, -g * 0.18, g * 0.72, g * 0.44);
      c.moveTo(-g * 0.5, -g * 0.88); c.lineTo(-g * 0.5, g * 0.88);
      c.moveTo(-g * 0.5, g * 0.28); c.lineTo(-g * 0.92, g * 0.78);
      c.moveTo(g * 0.18, -g * 0.48); c.lineTo(g * 0.88, -g * 0.48);
      c.quadraticCurveTo(g * 0.86, g * 0.45, g * 0.56, g * 0.82);
      c.lineTo(g * 0.34, g * 0.58);
      c.moveTo(g * 0.46, -g * 0.86); c.quadraticCurveTo(g * 0.42, g * 0.2, g * 0.06, g * 0.86);
    } else if (st.echo) {
      /* 双 — Twin Seal script (paired crossed strokes) */
      for (const ox of [-g * 0.48, g * 0.46]) {
        c.moveTo(ox - g * 0.34, -g * 0.56); c.lineTo(ox + g * 0.32, -g * 0.56);
        c.quadraticCurveTo(ox + g * 0.12, g * 0.22, ox - g * 0.38, g * 0.74);
        c.moveTo(ox - g * 0.3, -g * 0.18); c.quadraticCurveTo(ox + g * 0.08, g * 0.32, ox + g * 0.38, g * 0.74);
      }
    } else {
      /* 印 — classic carved hanko seal script (left claw-comb + right kneeling seal) */
      c.moveTo(-g * 0.16, -g * 0.78); c.lineTo(-g * 0.82, -g * 0.58);
      c.lineTo(-g * 0.82, g * 0.72); c.lineTo(-g * 0.14, g * 0.62);
      c.moveTo(-g * 0.82, -g * 0.02); c.lineTo(-g * 0.2, -g * 0.02);
      c.moveTo(g * 0.14, -g * 0.66); c.lineTo(g * 0.82, -g * 0.66);
      c.lineTo(g * 0.82, g * 0.24); c.quadraticCurveTo(g * 0.82, g * 0.44, g * 0.52, g * 0.34);
      c.moveTo(g * 0.14, -g * 0.66); c.lineTo(g * 0.14, g * 0.84);
    }
    c.stroke();
    /* tiny woodblock/stone dry-paper grain notches for authentic pressed texture */
    c.globalAlpha = fade * 0.32;
    for (let i = 0; i < 5; i++) {
      const ga = (sd + i * 2.17) % TAU;
      const gd = half * (0.42 + (i % 3) * 0.16);
      c.beginPath();
      c.arc(Math.cos(ga) * gd, Math.sin(ga) * gd, Math.max(0.8, half * 0.04), 0, TAU);
      c.fill();
    }
    c.restore();
  }

  /* THE SCRIBE's living stroke — a true world-space serpentine brush line
     with kasure dry-brush splits, a glossy wet head, and flying whiskers */
  function drawScribe(c, sc) {
    const S = G.S, st = S.stats || {};
    const scale = 1 + 0.22 * (st.slong || 0);
    const deep = (st.sdeep || 0) >= 2;
    const red = bossInk();
    if (sc.tr && sc.tr.len > 1) {
      /* soft diluted ink aura under the living stroke */
      drawRibbon(c, sc.tr, sc.x, sc.y, 13.5 * scale, {
        alpha: 0.16, color: INK, pow: 0.75,
      });
      /* master calligraphy stroke with dry-brush kasure splits & optional crimson thread */
      drawRibbon(c, sc.tr, sc.x, sc.y, 9.2 * scale, {
        alpha: 0.94, color: INK, pow: 0.72, dry: true,
        seam: deep ? red : null,
      });
    } else {
      /* first-breath fallback before the ribbon fills */
      c.save();
      c.translate(sc.x, sc.y); c.rotate(sc.ang);
      inkStroke(c, [{ x: 10, y: 0 }, { x: -14, y: 3 }, { x: -36, y: -2 }], 8 * scale, { alpha: 0.92, taper: 0.85, dry: true, seed: sc.seed });
      c.restore();
    }
    /* the living brush-tip head: wet ink nib + splayed calligraphic whiskers */
    const wob = Math.sin(sc.phase * 2.1 + sc.seed) * 2.2;
    c.save();
    c.translate(sc.x, sc.y);
    c.rotate(sc.ang);
    c.scale(scale, scale);
    c.globalAlpha = 0.98;
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(10.5, 0);
    c.quadraticCurveTo(4.2, -5.2, -4.6, -3.6);
    c.quadraticCurveTo(-7.2, 0, -4.6, 3.6);
    c.quadraticCurveTo(4.2, 5.2, 10.5, 0);
    c.closePath();
    c.fill();
    /* glossy highlight & crimson master eye */
    c.fillStyle = deep ? red : PAPER;
    c.globalAlpha = 0.88;
    c.beginPath(); c.ellipse(2.6, 0, 2.4, 1.15, 0, 0, TAU); c.fill();
    /* twin breathing brush-whisker tendrils sweeping the air ahead */
    c.strokeStyle = deep ? red : INK;
    c.globalAlpha = 0.52;
    c.lineWidth = 1.05;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(0, -3.2); c.quadraticCurveTo(-7, -7.2 + wob * 0.4, -14, -5.2 + wob);
    c.moveTo(0, 3.2); c.quadraticCurveTo(-7, 7.2 - wob * 0.4, -14, 5.2 - wob);
    c.stroke();
    c.restore();
  }

  /* SPIRIT SCRIBES — autonomous miniature flying brushes / hitodama nibs
     trailing curved ink ribbons across the sheet */
  function drawSpirit(c, sp) {
    const red = bossInk();
    const exalted = !!(sp.crimson || sp.grave || sp.litany || sp.pierce > 0);
    const fade = sp.life - sp.age < 0.25 ? Math.max(0.15, (sp.life - sp.age) / 0.25) : 1;
    if (sp.tr && sp.tr.len > 1) {
      drawRibbon(c, sp.tr, sp.x, sp.y, exalted ? 4.8 : 3.8, {
        alpha: (exalted ? 0.44 : 0.34) * fade,
        color: (sp.crimson || sp.grave) ? red : INK,
        pow: 0.9, wave: 0.8, phase: sp.age * 10,
      });
    }
    c.save();
    c.translate(sp.x, sp.y);
    c.rotate(sp.ang);
    c.lineCap = 'round';
    const wag = Math.sin(sp.age * 13 + sp.seed) * 1.8;
    /* miniature bamboo brush shaft & fluttering paper charm tail */
    c.globalAlpha = 0.88 * fade;
    c.strokeStyle = INK;
    c.lineWidth = 2.1;
    c.beginPath(); c.moveTo(-9.5, wag * 0.2); c.lineTo(-1.2, 0); c.stroke();
    /* pale ferrule collar */
    c.strokeStyle = PAPER; c.lineWidth = 1.2; c.globalAlpha = 0.85 * fade;
    c.beginPath(); c.moveTo(-1.8, -1.8); c.lineTo(-1.8, 1.8); c.stroke();
    if (exalted) {
      /* tiny trailing red tassel / ofuda ribbon behind the spirit-brush */
      c.strokeStyle = red; c.lineWidth = 1.25; c.globalAlpha = 0.85 * fade;
      c.beginPath();
      c.moveTo(-9.5, wag * 0.2);
      c.quadraticCurveTo(-13.5, wag * 0.9, -16.8, -wag * 0.6);
      c.stroke();
    }
    /* wet spirit-bristle head pointing into the hunt */
    c.globalAlpha = 0.97 * fade;
    c.fillStyle = (sp.crimson || sp.grave) ? red : INK;
    c.beginPath();
    c.moveTo(8.6, 0);
    c.quadraticCurveTo(3.6, -3.6, -1.4, -2.5);
    c.lineTo(-1.4, 2.5);
    c.quadraticCurveTo(3.6, 3.6, 8.6, 0);
    c.closePath();
    c.fill();
    /* bright spirit eye / litany red tip */
    c.fillStyle = (sp.litany && !sp.crimson && !sp.grave) ? red : PAPER;
    c.globalAlpha = 0.94 * fade;
    c.beginPath(); c.arc(3.2, 0, 1.35, 0, TAU); c.fill();
    c.restore();
  }

  /* THE RETURNING STROKE — a sweeping calligraphic crescent moon-blade */
  function drawBoomer(c, b) {
    const red = bossInk();
    const spinDir = b.phase === 'back' ? -1 : 1;
    if (b.tr && b.tr.len > 1) {
      drawRibbon(c, b.tr, b.x, b.y, 9.5, {
        alpha: b.crimson ? 0.28 : 0.2,
        color: b.crimson ? red : INK, pow: 1.0,
      });
    }
    c.save();
    c.translate(b.x, b.y);
    c.rotate(b.ang + spinDir * b.age * 8.2);
    c.lineCap = 'round';
    /* outer circular air-wake showing the full spinning bite radius */
    c.strokeStyle = b.crimson ? red : INK;
    c.globalAlpha = 0.24;
    c.lineWidth = 2.2;
    c.beginPath(); c.arc(0, 0, 18.5, -1.8, 0.5); c.stroke();
    c.globalAlpha = 0.14;
    c.beginPath(); c.arc(0, 0, 15.5, 0.9, 2.6); c.stroke();
    /* wide curved crescent moon-brushstroke */
    c.globalAlpha = 0.96;
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, 0, 19.5, -1.18, 1.18);
    c.quadraticCurveTo(10.5, 2.5, 10.5, 0);
    c.quadraticCurveTo(10.5, -2.5, Math.cos(-1.18) * 19.5, Math.sin(-1.18) * 19.5);
    c.closePath();
    c.fill();
    /* dry-brush kasure split + crimson inner edge on Moonlit Wheel / Mirror Return */
    c.strokeStyle = PAPER;
    c.globalAlpha = 0.52;
    c.lineWidth = 1.15;
    c.beginPath(); c.arc(0, 0, 16.4, -0.82, 0.82); c.stroke();
    if (b.crimson || b.maxed) {
      c.strokeStyle = red;
      c.globalAlpha = 0.9;
      c.lineWidth = 1.8;
      c.beginPath(); c.arc(0, 0, 13.8, -0.95, 0.95); c.stroke();
    }
    /* twin ink beads flung off the crescent's horns */
    c.fillStyle = b.crimson ? red : INK;
    c.globalAlpha = 0.8;
    c.beginPath();
    c.arc(Math.cos(-1.32) * 18.5, Math.sin(-1.32) * 18.5, 1.6, 0, TAU);
    c.arc(Math.cos(1.32) * 18.5, Math.sin(1.32) * 18.5, 1.4, 0, TAU);
    c.fill();
    c.restore();
  }

  /* ink motes — the drink of the sheet, small drops of XP */
  function drawMote(c, mt, t) {
    const fade = mt.age > CFG.xp.moteLife - 2.4 ? Math.max(0, (CFG.xp.moteLife - mt.age) / 2.4) : 1;
    c.save();
    c.translate(mt.x, mt.y);
    const col = mt.tier === 2 ? bossInk() : INK;
    if (mt.pull && (mt.vx * mt.vx + mt.vy * mt.vy > 2400)) {
      c.strokeStyle = col;
      c.globalAlpha = 0.28 * fade;
      c.lineWidth = Math.max(1, mt.r * 0.42);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(-mt.vx * 0.032, -mt.vy * 0.032);
      c.stroke();
    }
    c.globalAlpha = (mt.pull ? 0.95 : 0.72) * fade;
    c.fillStyle = col;
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
      c.font = '10px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
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
      c.font = '10px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('宝', 0, 0.5);
      c.restore();
    }
    c.restore();
  }

  /* THE SUMI ARC — multi-jointed calligraphic ink-lightning with branching
     brush forks and crackling impact nodes at every chained beast */
  function drawArcFx(c, ar) {
    const a = Math.max(0, ar.life / ar.max);
    const red = bossInk();
    const rnd = mulberry(ar.seed);
    c.save();
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (let seg = 1; seg < ar.pts.length; seg++) {
      const p0 = ar.pts[seg - 1], p1 = ar.pts[seg];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const jit = Math.min(26, len * 0.22);
      const j1 = (rnd() - 0.5) * 2 * jit;
      const j2 = (rnd() - 0.5) * 2 * jit;
      const j3 = (rnd() - 0.5) * 1.6 * jit;
      const x1 = p0.x + dx * 0.26 + nx * j1, y1 = p0.y + dy * 0.26 + ny * j1;
      const x2 = p0.x + dx * 0.54 + nx * j2, y2 = p0.y + dy * 0.54 + ny * j2;
      const x3 = p0.x + dx * 0.78 + nx * j3, y3 = p0.y + dy * 0.78 + ny * j3;
      /* soft brushed halo wash */
      c.beginPath();
      c.moveTo(p0.x, p0.y); c.lineTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.lineTo(p1.x, p1.y);
      c.strokeStyle = ar.crimson ? red : INK;
      c.globalAlpha = a * (ar.crimson ? 0.34 : 0.22);
      c.lineWidth = ar.crimson ? 9.5 : 7.8;
      c.stroke();
      /* main sumi lightning trunk */
      c.strokeStyle = INK;
      c.globalAlpha = a * 0.96;
      c.lineWidth = ar.living ? 3.1 : 2.5;
      c.stroke();
      /* luminous inner crackle seam */
      c.strokeStyle = ar.crimson ? red : PAPER;
      c.globalAlpha = a * (ar.crimson ? 0.92 : 0.65);
      c.lineWidth = ar.crimson ? 1.45 : 0.95;
      c.stroke();
      /* hairline forked ink tendril branching off the middle knuckle */
      const fSide = rnd() < 0.5 ? -1 : 1;
      const fLen = Math.min(28, len * 0.26);
      const fx = x2 + (dx / len) * fLen * 0.7 + nx * fSide * fLen * 0.75;
      const fy = y2 + (dy / len) * fLen * 0.7 + ny * fSide * fLen * 0.75;
      c.strokeStyle = ar.crimson ? red : INK;
      c.globalAlpha = a * 0.58;
      c.lineWidth = 1.25;
      c.beginPath();
      c.moveTo(x2, y2);
      c.lineTo((x2 + fx) * 0.5 + nx * fSide * 4, (y2 + fy) * 0.5 + ny * fSide * 4);
      c.lineTo(fx, fy);
      c.stroke();
      /* crackling ink-star impact seal on each struck beast */
      c.globalAlpha = a * 0.85;
      c.fillStyle = ar.crimson ? red : INK;
      c.beginPath(); c.arc(p1.x, p1.y, 3.6 + (1 - a) * 2.5, 0, TAU); c.fill();
      c.globalAlpha = a * 0.45;
      c.strokeStyle = ar.crimson ? red : INK;
      c.lineWidth = 1.3;
      c.beginPath(); c.arc(p1.x, p1.y, 7 + (1 - a) * 9, 0, TAU); c.stroke();
    }
    c.restore();
  }

  /* ---- v23: field inkstone shrine (硯), ink-step echoes & crimson slashes ---- */
  function drawShrine(c, sh, t) {
    const fadeIn = Math.min(1, sh.age / 0.45);
    const fadeOut = Math.min(1, sh.life / 2.2);
    const a = fadeIn * fadeOut;
    const red = bossInk();
    c.save();
    c.translate(sh.x, sh.y);
    /* faint ink wash under the circle */
    c.fillStyle = sh.active ? red : INK;
    c.globalAlpha = a * (sh.active ? 0.075 : 0.04);
    blobPath(c, 0, 0, sh.r * 0.96, sh.seed, 0.06, 16);
    c.fill();
    /* outer hand-drawn boundary */
    c.strokeStyle = INK;
    c.globalAlpha = a * (sh.active ? 0.52 : 0.3);
    c.lineWidth = 1.5;
    blobPath(c, 0, 0, sh.r, sh.seed, 0.045, 18);
    c.stroke();
    /* slowly turning dashed inner register */
    c.save();
    c.rotate(t * (sh.active ? 0.75 : 0.25));
    c.setLineDash([7, 7]);
    c.strokeStyle = sh.active ? red : INK;
    c.globalAlpha = a * (sh.active ? 0.45 : 0.2);
    c.lineWidth = 1.1;
    c.beginPath(); c.arc(0, 0, sh.r - 6, 0, TAU); c.stroke();
    c.restore();
    /* vermillion seal sweep while standing inside */
    if (sh.prog > 0.005) {
      c.strokeStyle = red;
      c.globalAlpha = a * 0.88;
      c.lineWidth = 2.8;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, sh.r, -Math.PI / 2, -Math.PI / 2 + sh.prog * TAU);
      c.stroke();
    }
    /* central inkstone slab + stamped kanji */
    const pulse = 1 + Math.sin(t * 2.8) * 0.035;
    c.save();
    c.scale(pulse, pulse);
    c.rotate(-0.06);
    c.fillStyle = sh.active ? red : INK;
    c.globalAlpha = a * 0.88;
    c.fillRect(-11, -11, 22, 22);
    c.strokeStyle = PAPER;
    c.lineWidth = 1;
    c.globalAlpha = a * 0.7;
    c.strokeRect(-8.5, -8.5, 17, 17);
    c.fillStyle = PAPER;
    c.globalAlpha = a * 0.96;
    c.font = "400 13px 'Zen Antique', 'Shippori Mincho', Georgia, serif";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('硯', 0, 0.5);
    c.restore();
    /* the stone's own breath: a soft halo that swells as it fills */
    const heat = 0.16 + 0.5 * sh.prog;
    const hg = c.createRadialGradient(0, 0, sh.r * 0.2, 0, 0, sh.r * (1.25 + 0.22 * Math.sin(t * 2.2)));
    hg.addColorStop(0, sh.active ? `rgba(178,58,43,${(0.2 * heat).toFixed(3)})` : `rgba(26,23,20,${(0.075 * heat).toFixed(3)})`);
    hg.addColorStop(1, 'rgba(178,58,43,0)');
    c.fillStyle = hg;
    c.globalAlpha = a;
    c.beginPath(); c.arc(0, 0, sh.r * 1.5, 0, TAU); c.fill();

    /* the label below the stone, and a live prompt while the hand is inside */
    const tag = sh.kind === 'surge' ? 'SURGE' : sh.kind === 'grind' ? 'GRIND' : 'BLOOM';
    c.fillStyle = sh.active ? red : INK;
    c.globalAlpha = a * (sh.active ? 0.86 : 0.5);
    c.font = "600 8.5px 'IBM Plex Mono', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'top';
    try { c.letterSpacing = '2.4px'; } catch (e) {}
    c.fillText('硯 ' + tag, 0, 17);
    if (sh.active && sh.prog < 1) {
      c.globalAlpha = a * 0.72;
      c.font = "500 7.5px 'IBM Plex Mono', monospace";
      c.fillText('HOLD', 0, 29);
    }
    try { c.letterSpacing = '0px'; } catch (e) {}
    c.restore();
  }

  /* v25 — the ink step's air: properly centered on the scribe, zero per-frame gradient alloc */
  function drawDashVeil(c, S) {
    const d = S.dashT, dur = CFG.dash.dur;
    if (d <= 0 || d > dur * 1.55) return;
    const k = Math.max(0, Math.min(1, d / dur));
    const p = S.player;
    const ang = Math.atan2(p.vy || Math.sin(p.aim), p.vx || Math.cos(p.aim));
    c.save();
    if (vg.bake) {
      c.globalAlpha = 0.42 * k;
      c.drawImage(vg.bake, 0, 0, S.W, S.H);
    }
    /* calligraphic wind-lines streaming straight behind the scribe in screen space */
    const sx = S.W * 0.5 + (p.x - S.cam.x), sy = S.H * 0.5 + (p.y - S.cam.y);
    c.translate(sx, sy);
    c.rotate(ang + Math.PI);
    c.lineCap = 'round';
    const red = bossInk();
    for (let i = 0; i < 9; i++) {
      const offY = (i - 4) * 7.5;
      const x0 = 14 + (i % 3) * 10;
      const len = (36 + (i % 4) * 18) * k;
      const isRed = i === 4 || i === 1 || i === 7;
      c.strokeStyle = isRed ? red : INK;
      c.globalAlpha = (isRed ? 0.44 : 0.26) * k;
      c.lineWidth = i === 4 ? 2.1 : 1.25;
      c.beginPath();
      c.moveTo(x0, offY);
      c.lineTo(x0 + len, offY * 1.08);
      c.stroke();
    }
    c.restore();
  }

  /* v25 — directional wet ink impacts, muzzle flicks, pierce seams, deflects & quake cracks */
  function drawImpact(c, im) {
    const k = Math.max(0, im.life / im.max);
    const p = 1 - k;
    const sc = im.size || 1;
    const red = bossInk();
    const col = im.red ? red : INK;
    c.save();
    c.translate(im.x, im.y);
    c.lineCap = 'round';
    if (im.kind === 'muzzle') {
      c.rotate(im.ang);
      c.strokeStyle = col;
      c.globalAlpha = k * 0.52;
      c.lineWidth = 1.5 * sc;
      for (const sp of [-0.42, 0, 0.42]) {
        const d0 = 2 + p * 6 * sc, d1 = d0 + (7 + (sp === 0 ? 4 : 0)) * sc * k;
        c.beginPath();
        c.moveTo(Math.cos(sp) * d0, Math.sin(sp) * d0);
        c.lineTo(Math.cos(sp) * d1, Math.sin(sp) * d1);
        c.stroke();
      }
    } else if (im.kind === 'pierce') {
      /* clean calligraphic through-cut line + twin parted droplets */
      c.rotate(im.ang);
      c.strokeStyle = col;
      c.globalAlpha = k * 0.8;
      c.lineWidth = 2.2 * sc * k + 0.6;
      const L = (16 + p * 14) * sc;
      c.beginPath(); c.moveTo(-L * 0.45, 0); c.lineTo(L * 0.65, 0); c.stroke();
      c.fillStyle = col; c.globalAlpha = k * 0.68;
      const spread = (3.5 + p * 9) * sc;
      c.beginPath();
      c.arc(p * 8 * sc, -spread, 1.5 * sc * k, 0, TAU);
      c.arc(p * 8 * sc, spread, 1.5 * sc * k, 0, TAU);
      c.fill();
    } else if (im.kind === 'deflect') {
      /* curved shield-parry arc + bouncing ink sparks */
      c.rotate(im.ang);
      c.strokeStyle = col;
      c.globalAlpha = k * 0.85;
      c.lineWidth = 2.4 * k + 0.7;
      c.beginPath(); c.arc(0, 0, (9 + p * 12) * sc, -1.05, 1.05); c.stroke();
      for (const sa of [-0.75, 0.75]) {
        const d0 = (8 + p * 14) * sc;
        c.beginPath();
        c.moveTo(Math.cos(sa) * d0, Math.sin(sa) * d0);
        c.lineTo(Math.cos(sa) * (d0 + 7 * k), Math.sin(sa) * (d0 + 7 * k));
        c.stroke();
      }
    } else if (im.kind === 'quake') {
      /* jagged brush fissures radiating from a Quake stone impact */
      const arms = 6;
      for (let i = 0; i < arms; i++) {
        const a = (i / arms) * TAU + (im.seed % 17) * 0.13;
        const len = (24 + (i % 2) * 12) * sc * Math.min(1, p * 3.2);
        const mx = Math.cos(a + 0.16) * len * 0.54, my = Math.sin(a + 0.16) * len * 0.54;
        const ex = Math.cos(a - 0.08) * len, ey = Math.sin(a - 0.08) * len;
        c.strokeStyle = i % 2 === 0 ? INK : red;
        c.globalAlpha = k * 0.72;
        c.lineWidth = 2.0 * k + 0.5;
        c.beginPath(); c.moveTo(0, 0); c.lineTo(mx, my); c.lineTo(ex, ey); c.stroke();
      }
    } else if (im.kind === 'stamp') {
      /* radial vermillion droplets flung out from under the slamming hanko */
      c.fillStyle = red;
      c.globalAlpha = k * 0.78;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + (im.seed % 11) * 0.21;
        const dist = (30 + p * 48 * (0.75 + (i % 3) * 0.2)) * sc;
        c.save();
        c.translate(Math.cos(a) * dist, Math.sin(a) * dist);
        c.rotate(a);
        teardrop(c, (2.6 - p * 1.3) * Math.min(1.4, sc));
        c.fill();
        c.restore();
      }
    } else {
      /* crisp directional hit spatter — three droplets fanning forward */
      c.rotate(im.ang);
      c.fillStyle = col;
      c.globalAlpha = k * 0.78;
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.52 + ((im.seed >> (i + 2)) & 3) * 0.06;
        const dist = (5 + p * (16 + (i === 0 ? 5 : 0))) * sc;
        c.save();
        c.translate(Math.cos(a) * dist, Math.sin(a) * dist);
        c.rotate(a);
        teardrop(c, (2.2 - p * 1.1) * sc);
        c.fill();
        c.restore();
      }
    }
    c.restore();
  }

  function drawAfterimage(c, af) {
    const k = Math.max(0, af.life / af.max);
    if (k <= 0) return;
    c.save();
    c.translate(af.x, af.y);
    const ax = -Math.cos(af.ang), ay = -Math.sin(af.ang);
    /* the drag of wet ink behind the body */
    inkStroke(c, [
      { x: 0, y: 0 },
      { x: ax * 16, y: ay * 16 },
      { x: ax * 34, y: ay * 34 },
    ], 11 * k, { alpha: k * 0.42, taper: 1.2, seed: ((af.x * 13) | 0) });
    /* a true echo of the scribe: the same figure, thinned to a breath */
    drawScribeFigure(c, {
      brush: af.brush, r: 10, aim: af.ang,
      vx: Math.cos(af.ang) * 300, vy: Math.sin(af.ang) * 300, speedRef: 200,
      t: af.life * 14, alpha: k * 0.42, shadow: false, wet: 0, flick: false, eyes: false,
    });
    /* the vermilion seam the cut leaves in the air */
    c.globalAlpha = k * 0.6;
    c.strokeStyle = bossInk();
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-9.6, -9.6);
    c.lineTo(9.6, -3.2);
    c.stroke();
    c.restore();
  }

  function drawSlash(c, sl) {
    const k = Math.max(0, sl.life / sl.max);
    const hx = Math.cos(sl.ang) * sl.len * 0.55;
    const hy = Math.sin(sl.ang) * sl.len * 0.55;
    inkStroke(c, [
      { x: sl.x - hx, y: sl.y - hy },
      { x: sl.x, y: sl.y },
      { x: sl.x + hx, y: sl.y + hy },
    ], 3.8 * k + 0.8, { alpha: k * 0.9, color: sl.red ? bossInk() : INK, taper: 1.25 });
  }

  /* THE INK VORTEX — a smooth calligraphic sumi whirlpool: deep ink basin,
     five pressure-tapered spiral brush arms, kasure foam & abyssal red rim */
  function drawVortex(c, vz) {
    const grow = Math.min(1, (vz.max - vz.dur) / 0.26);
    const fade = Math.min(1, vz.dur / 0.3);
    const sc = grow * fade;
    if (sc <= 0.02) return;
    const red = bossInk();
    const R = vz.r;
    c.save();
    c.translate(vz.x, vz.y);
    c.scale(sc, sc);
    c.lineCap = 'round';
    /* outer undertow boundary whisper */
    c.globalAlpha = vz.abyss ? 0.26 : 0.14;
    c.strokeStyle = vz.abyss ? red : INK;
    c.lineWidth = vz.abyss ? 1.6 : 1.1;
    c.setLineDash([9, 8]);
    c.beginPath(); c.arc(0, 0, R * 1.02, vz.spin * 0.3, vz.spin * 0.3 + TAU); c.stroke();
    c.setLineDash([]);
    /* layered wet sumi inkstone well */
    c.fillStyle = INK;
    c.globalAlpha = 0.11;
    c.beginPath(); c.arc(0, 0, R * 0.94, 0, TAU); c.fill();
    c.globalAlpha = 0.22;
    blobPath(c, 0, 0, R * 0.64, vz.seed, 0.14, 16); c.fill();
    c.globalAlpha = 0.38;
    c.beginPath(); c.arc(0, 0, R * 0.32, 0, TAU); c.fill();
    /* five smooth pressure-tapered calligraphic spiral ribbons (zero polygon kinks) */
    const arms = 5, steps = 26;
    strokeScratch(steps + 1);
    for (let arm = 0; arm < arms; arm++) {
      const a0 = vz.spin + (arm / arms) * TAU;
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;   /* 0 = outer tip, 1 = inner mouth */
        const rr = R * (0.98 - u * 0.82);
        const aa = a0 + Math.pow(u, 0.88) * 3.6;
        const cx = Math.cos(aa) * rr, cy = Math.sin(aa) * rr;
        const w = Math.sin(u * Math.PI) * Math.max(3.6, R * 0.072);
        const nx = Math.cos(aa), ny = Math.sin(aa);
        _stL[k * 2] = cx + nx * w * 0.5;
        _stL[k * 2 + 1] = cy + ny * w * 0.5;
        _stR[k * 2] = cx - nx * w * 0.5;
        _stR[k * 2 + 1] = cy - ny * w * 0.5;
      }
      c.beginPath();
      c.moveTo(_stL[0], _stL[1]);
      for (let k = 1; k <= steps; k++) c.lineTo(_stL[k * 2], _stL[k * 2 + 1]);
      for (let k = steps; k >= 0; k--) c.lineTo(_stR[k * 2], _stR[k * 2 + 1]);
      c.closePath();
      c.fillStyle = (vz.abyss && arm === 0) ? red : INK;
      c.globalAlpha = (vz.abyss && arm === 0) ? 0.72 : 0.68;
      c.fill();
    }
    /* pale kasure foam highlights swirling inside the currents */
    c.strokeStyle = PAPER;
    c.globalAlpha = 0.34;
    c.lineWidth = 1.1;
    for (let f = 0; f < 3; f++) {
      const fa = vz.spin * 1.15 + (f / 3) * TAU;
      c.beginPath(); c.arc(0, 0, R * (0.36 + f * 0.16), fa, fa + 1.15); c.stroke();
    }
    /* orbiting ink droplets drawn inward toward the mouth */
    c.fillStyle = (vz.abyss || vz.teeth) ? red : INK;
    c.globalAlpha = 0.72;
    for (let d = 0; d < 6; d++) {
      const da = vz.spin * 1.4 + d * (TAU / 6);
      const dr = R * (0.48 + ((d * 37) % 10) * 0.042);
      c.save();
      c.translate(Math.cos(da) * dr, Math.sin(da) * dr);
      c.rotate(da + Math.PI * 0.62);
      teardrop(c, 2.2);
      c.fill();
      c.restore();
    }
    /* calm eye of the inkstone at dead center */
    c.fillStyle = (vz.abyss || vz.teeth) ? red : INK;
    c.globalAlpha = 0.9;
    c.beginPath(); c.arc(0, 0, R * 0.14, 0, TAU); c.fill();
    c.strokeStyle = PAPER;
    c.globalAlpha = 0.78;
    c.lineWidth = 1.6;
    c.beginPath(); c.arc(0, 0, R * 0.15, 0, TAU); c.stroke();
    c.restore();
  }

  /* the storm eye's bolts — a filling ring, then a jagged column */
  function drawBolt(c, bo) {
    const bc = bo.red ? RED : INK;
    c.save();
    c.translate(bo.x, bo.y);
    if (bo.seal && !bo.struck) {
      /* the unwritten's stamp: a red seal hanging over the spot, filling */
      const pr = 1 - Math.max(0, bo.t) / 0.9;
      const s = bo.r * 0.62;
      c.rotate(-0.08 + pr * 0.1);
      c.globalAlpha = 0.4;
      c.strokeStyle = RED;
      c.lineWidth = 2.6;
      c.strokeRect(-s, -s, s * 2, s * 2);
      c.globalAlpha = 0.14 + 0.3 * Math.min(1, Math.max(0, pr));
      c.fillStyle = RED;
      c.fillRect(-s * pr, -s * pr, s * 2 * pr, s * 2 * pr);
      c.restore();
      return;
    }
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
    const ease = 1 - Math.pow(1 - prog, 2.3);
    const rad = Math.max(2, r.max * ease);
    const al = Math.max(0, r.life / r.maxLife);
    const red = bossInk();
    const sd = (r.x * 13 + r.y * 7) | 0;
    c.save();
    c.lineCap = 'round';

    if (r.kind === 'tide') {
      /* 潮 BLACK TIDE — rolling Kōrin/Hokusai sumi wave swell, foam & spray claws */
      c.translate(r.x, r.y);
      /* dark surging wave crest */
      c.strokeStyle = INK;
      c.globalAlpha = al * 0.22;
      c.lineWidth = 14 * al + 3;
      blobPath(c, 0, 0, rad * 0.95, sd, 0.055, 22);
      c.stroke();
      c.globalAlpha = al * 0.85;
      c.lineWidth = 4.6 * al + 1.2;
      blobPath(c, 0, 0, rad, sd, 0.06, 22);
      c.stroke();
      /* pale kasure sea-foam crest riding the inner lip */
      c.strokeStyle = PAPER;
      c.globalAlpha = al * 0.55;
      c.lineWidth = 1.4;
      blobPath(c, 0, 0, Math.max(2, rad - 2.6), sd, 0.06, 22);
      c.stroke();
      /* second concentric undertow swell */
      c.strokeStyle = INK;
      c.globalAlpha = al * 0.42;
      c.lineWidth = 2.0;
      blobPath(c, 0, 0, rad * 0.74, sd ^ 19, 0.07, 18);
      c.stroke();
      /* twelve rolling wave-claw spray droplets */
      c.fillStyle = INK;
      c.globalAlpha = al * 0.78;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU + prog * 0.45 + (sd & 15) * 0.1;
        const dr = rad * (1.01 + (i % 2) * 0.05);
        c.save();
        c.translate(Math.cos(a) * dr, Math.sin(a) * dr);
        c.rotate(a + 0.25);
        teardrop(c, 2.2 + (i % 2) * 1.1);
        c.fill();
        c.restore();
      }
      c.restore();
      return;
    }

    if (r.kind === 'edict') {
      /* 勅 IMPERIAL EDICT — concentric black surge crowned with a red decree rim */
      c.translate(r.x, r.y);
      c.strokeStyle = INK;
      c.globalAlpha = al * 0.75;
      c.lineWidth = 4.2 * al + 1;
      blobPath(c, 0, 0, rad, sd, 0.05, 22);
      c.stroke();
      c.strokeStyle = red;
      c.globalAlpha = al * 0.78;
      c.lineWidth = 2.0;
      blobPath(c, 0, 0, rad * 0.86, sd ^ 7, 0.05, 20);
      c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        c.globalAlpha = al * 0.65;
        c.beginPath();
        c.moveTo(Math.cos(a) * rad * 0.82, Math.sin(a) * rad * 0.82);
        c.lineTo(Math.cos(a) * rad * 1.03, Math.sin(a) * rad * 1.03);
        c.stroke();
      }
      c.restore();
      return;
    }

    if (r.kind === 'gust' || r.kind === 'sweep') {
      /* 扇 / 掃 — directional calligraphic fan-wind / wet brush-sweep arc */
      c.translate(r.x, r.y);
      const col = r.red ? red : INK;
      if (r.full) {
        c.strokeStyle = col;
        for (let k = 0; k < 4; k++) {
          const a0 = prog * 2.2 + (k / 4) * TAU;
          c.globalAlpha = al * 0.68;
          c.lineWidth = 3.4 * al + 0.8;
          c.beginPath(); c.arc(0, 0, rad, a0, a0 + 1.08); c.stroke();
          c.strokeStyle = INK;
          c.globalAlpha = al * 0.34;
          c.lineWidth = 1.6;
          c.beginPath(); c.arc(0, 0, rad * 0.76, a0 + 0.35, a0 + 1.25); c.stroke();
          c.strokeStyle = col;
        }
      } else {
        const sp = (r.spread || 0.9) * 0.58;
        const a0 = (r.ang || 0) - sp, a1 = (r.ang || 0) + sp;
        c.strokeStyle = col;
        c.globalAlpha = al * (r.kind === 'sweep' ? 0.62 : 0.55);
        c.lineWidth = (r.kind === 'sweep' ? 5.6 : 3.2) * al + 0.8;
        c.beginPath(); c.arc(0, 0, rad, a0, a1); c.stroke();
        c.globalAlpha = al * 0.28;
        c.lineWidth = 1.4;
        c.beginPath(); c.arc(0, 0, rad * 0.74, a0 + 0.1, a1 - 0.1); c.stroke();
      }
      c.restore();
      return;
    }

    if (r.kind === 'crater') {
      /* 岩 — heavy stone splash crater + flying ink beads */
      c.translate(r.x, r.y);
      c.fillStyle = INK;
      c.globalAlpha = al * 0.14;
      blobPath(c, 0, 0, rad * 0.92, sd, 0.12, 14); c.fill();
      c.strokeStyle = INK;
      c.globalAlpha = al * 0.84;
      c.lineWidth = 3.4 * al + 1;
      blobPath(c, 0, 0, rad, sd, 0.11, 16); c.stroke();
      if (r.quake) {
        c.strokeStyle = red;
        c.globalAlpha = al * 0.72;
        c.lineWidth = 1.8;
        blobPath(c, 0, 0, rad * 0.68, sd ^ 13, 0.12, 14); c.stroke();
      }
      c.fillStyle = INK;
      c.globalAlpha = al * 0.75;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + (sd & 7) * 0.2;
        c.save();
        c.translate(Math.cos(a) * rad * 1.04, Math.sin(a) * rad * 1.04);
        c.rotate(a);
        teardrop(c, 2.5 * al + 0.7);
        c.fill();
        c.restore();
      }
      c.restore();
      return;
    }

    const col = r.red ? red : INK;
    c.strokeStyle = col;
    c.globalAlpha = al * 0.76;
    c.lineWidth = r.kind === 'seal' ? 3.2 * al + 0.9 : 2.1;
    blobPath(c, r.x, r.y, rad, sd, r.kind === 'seal' ? 0.055 : 0.09, 16);
    c.stroke();
    if (r.max > 150) { /* great burst: double ring + flung droplets */
      c.globalAlpha = al * 0.4;
      c.lineWidth = 1.5;
      blobPath(c, r.x, r.y, rad * 0.74, ((r.x + r.y) * 3) | 0, 0.12, 14);
      c.stroke();
      c.fillStyle = col;
      c.globalAlpha = al * 0.62;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + r.x * 0.01;
        c.save();
        c.translate(r.x + Math.cos(a) * rad * 0.94, r.y + Math.sin(a) * rad * 0.94);
        c.rotate(a);
        teardrop(c, 3.0);
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
    } else if (tg.kind === 'seal') {
      /* a red seal is about to press here — the stamp's outline fills as it nears */
      c.setLineDash([]);
      const s = tg.r * 0.62;
      const sx2 = e.x, sy2 = e.y - 26 - 14 * k;   /* it hangs above the paper, dropping */
      c.globalAlpha = (0.5 + 0.4 * (1 - k)) * (S.reduced ? 0.55 : 1);
      c.lineWidth = 3;
      c.save();
      c.translate(sx2, sy2);
      c.rotate(-0.06);
      c.strokeRect(-s, -s, s * 2, s * 2);
      c.globalAlpha *= 0.34;
      c.fillRect(-s, -s, s * 2, s * 2);
      c.globalAlpha = 0.75;
      c.font = Math.round(s * 1.1) + 'px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('印', 0, 2);
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
      /* the drops land LOW — the lower band of the sheet, where no
         word lives — and are born already inside it, so they never
         fall across the title's ink (v15) */
      const ty = S.H * 0.66 + Math.random() * (S.H * 0.28);
      drops.push({
        x: 26 + Math.random() * (S.W - 52),
        y: ty - 90 - Math.random() * 160,
        v: 46 + Math.random() * 60,
        ty,
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
    } else if (kind === 'silk') {
      /* the blank silk's sky: stray threads drift across, rising and swaying */
      while (wx.length < 18) wx.push({ x: Math.random() * W, y: Math.random() * H, v: 7 + Math.random() * 12, sway: Math.random() * 6.28, l: 18 + Math.random() * 30, drift: (Math.random() - 0.5) * 10 });
      for (const d of wx) {
        d.y -= d.v * dt; d.sway += dt * 0.9; d.x += Math.sin(d.sway) * 12 * dt + d.drift * dt;
        if (d.y < -14) { d.y = H + 12; d.x = Math.random() * W; }
        if (d.x < -40) d.x = W + 30; else if (d.x > W + 40) d.x = -30;
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
    } else if (kind === 'silk') {
      /* loose threads — long, thin, breathing */
      c.strokeStyle = INK;
      c.lineCap = 'round';
      for (const d of wx) {
        c.globalAlpha = 0.07 + 0.05 * Math.sin(d.sway * 1.7);
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(d.x, d.y);
        c.quadraticCurveTo(d.x + d.l * 0.5, d.y - 4 + Math.sin(d.sway) * 3, d.x + d.l, d.y + Math.sin(d.sway) * 2);
        c.stroke();
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
      c.font = '9px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif';
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
      if (pk.kind === 'pot' && S.stats.hp < S.stats.maxHp) { drawEdgeArrow(c, pk.x, pk.y, 'seal'); break; }
    }
    if (S.shrines && S.shrines.length) {
      drawEdgeArrow(c, S.shrines[0].x, S.shrines[0].y, 'seal');
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
  /* the title's keeper is the very scribe the run draws, the chosen brush
     in his hands. He stands inside the ring and reaches out to it: while he
     paints, the tip lands on the wet head of the stroke; at rest the brush
     eases up to his shoulder and he strolls his circle. */
  function rtScribe(c, x, y, h, t, o) {
    const u = h / 33;
    const th = o.th || 0;
    const brush = (typeof G !== 'undefined' && G.getBrush) ? G.getBrush() : 'needle';
    const down = !o.brushUp;
    const face = o.face >= 0 ? 1 : -1;
    /* ease the brush between the page and the shoulder */
    if (RT.brushK == null) RT.brushK = down ? 1 : 0;
    RT.brushK += ((down ? 1 : 0) - RT.brushK) * 0.1;
    const k = RT.brushK;
    /* the tip's reach from the figure's centre, for a brush aimed along th */
    const fsm = Math.max(-1, Math.min(1, Math.cos(th) * 3));
    const flipS = (fsm < 0 ? -1 : 1) * Math.max(0.55, Math.abs(fsm));
    const lx = brushTipX(brush) * 1.02 + 10.2, ly = -4.2 * flipS;
    const cx = x - (lx * Math.cos(th) - ly * Math.sin(th)) * u;
    const cy = y - (lx * Math.sin(th) + ly * Math.cos(th)) * u;
    const up = face > 0 ? -0.95 + (o.gaze || 0) * 0.25 : Math.PI + 0.95 - (o.gaze || 0) * 0.25;
    let d = up - th; d = Math.atan2(Math.sin(d), Math.cos(d));
    const aim = th + d * (1 - k);
    const walk = o.walk || 0;

    c.save();
    /* the pool he stands in */
    c.fillStyle = INK;
    c.globalAlpha = 0.12;
    c.beginPath(); c.ellipse(cx, cy + 12.4 * u, h * 0.3, h * 0.062, 0, 0, RT_TAU); c.fill();
    c.globalAlpha = 1;
    c.translate(cx, cy);
    if (o.bow) c.rotate(o.bow * 0.2 * face);
    drawScribeFigure(c, {
      brush, r: 10 * u, t, aim,
      vx: -Math.sin(th) * 255 * walk, vy: Math.cos(th) * 255 * walk,
      phase: o.phase, lean: 0, shadow: false,
      eyes: !o.blink, wet: 0.12 + 0.5 * k, seed: 91,
    });
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
        face: sc.face, th: sc.th, walk: 0.55, phase: sc.th * 26,
        brushUp: false, gaze, blink,
      });
    } else {
      const settling = sc.phase === 'settle';
      const bq = sc.bowT && t - sc.bowT < 1.5 ? Math.sin(Math.min(1, (t - sc.bowT) / 1.5) * Math.PI) : 0;
      rtScribe(f, pos.x, pos.y, h, t, {
        face: sc.face, th: sc.th,
        walk: (settling || bq > 0) ? 0 : Math.min(1, (sc.pace || 0) / 0.6),
        phase: (sc.lapd || 0) * 26,
        brushUp: !settling, bow: bq, gaze, blink,
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
      c.font = `${Math.round(Math.min(W, H) * 0.2)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
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

    /* v26: the camera's breath — a fingertip of push while a master duel
       opens, and a slow lean in as the scribe's ink runs dry */
    const dyingP = S.mode === 'dying' ? Math.max(0, Math.min(1, 1 - S.dyingT / 1.45)) : 0;
    const cineP = S.cineT > 0 ? Math.max(0, Math.min(1, S.cineT / 2.6)) : 0;
    const camZoom = 1 + 0.042 * cineP + 0.075 * (dyingP * dyingP);
    if (camZoom > 1.0005) {
      ctx.translate(S.W / 2, S.H / 2);
      ctx.scale(camZoom, camZoom);
      ctx.translate(-S.W / 2, -S.H / 2);
    }

    /* ===== the world ===== */
    ctx.save();
    let shx = 0, shy = 0;
    if (S.shake > 0.2 && !S.reduced) {
      shx = (Math.random() - 0.5) * S.shake;
      shy = (Math.random() - 0.5) * S.shake;
    }
    ctx.translate(S.W / 2 + shx - camX, S.H / 2 + shy - camY);

    /* the endless paper, tiled beneath everything — the tile pass
       rides an integer-aligned transform: exact-size draws at exact
       pixels, no per-frame resample, no hairline seams (the paper
       may rest a hair from the entities — invisible at these sizes) */
    const vx0 = camX - S.W / 2 - 8, vx1 = camX + S.W / 2 + 8;
    const vy0 = camY - S.H / 2 - 8, vy1 = camY + S.H / 2 + 8;
    const tile = tiles[themeKey] || tiles.pale;
    {
      /* snap the paper grid onto exact device pixels — razor-crisp laid grain,
         zero fractional blur, zero hairline tile seams at any DPR */
      const dpr = S.dpr || 1;
      const wtx = S.W / 2 + shx - camX, wty = S.H / 2 + shy - camY;
      ctx.translate(Math.round(wtx * dpr) / dpr - wtx, Math.round(wty * dpr) / dpr - wty);
      const tw = tile.width, th = tile.height;
      const kpx = tw / TILE;
      for (let ty = Math.floor(vy0 / TILE); ty <= Math.floor(vy1 / TILE); ty++) {
        for (let tx = Math.floor(vx0 / TILE); tx <= Math.floor(vx1 / TILE); tx++) {
          const bx = tx * TILE, by = ty * TILE;
          const ix0 = Math.max(bx, Math.floor(vx0)), ix1 = Math.min(bx + TILE, Math.ceil(vx1));
          const iy0 = Math.max(by, Math.floor(vy0)), iy1 = Math.min(by + TILE, Math.ceil(vy1));
          if (ix1 <= ix0 || iy1 <= iy0) continue;
          const sx = Math.max(0, (ix0 - bx) * kpx), sy = Math.max(0, (iy0 - by) * kpx);
          const sw = Math.min(tw - sx, (ix1 - ix0) * kpx), sh = Math.min(th - sy, (iy1 - iy0) * kpx);
          if (sw > 0.5 && sh > 0.5) {
            ctx.drawImage(tile, sx, sy, sw, sh, ix0, iy0, ix1 - ix0, iy1 - iy0);
          }
        }
      }
    }

    /* faint marks so the sheet feels hand-made and the motion reads */
    drawDecor(ctx, vx0, vy0, vx1, vy1);

    /* the painting itself — grown wave by wave across the sheet */
    drawLandscape(ctx, vx0, vy0, vx1, vy1, t);

    /* the bounded page's margins (journey and daily) */
    drawArenaEdge(ctx);

    /* on the title the sheet rests: a living handscroll panorama */
    if (S.mode === 'title') drawTitlePanorama(ctx, t, dt);

    /* dried ink from every fight before this moment */
    const cullM = 80;
    for (const st of stains) {
      if (st.x < vx0 - cullM || st.x > vx1 + cullM || st.y < vy0 - cullM || st.y > vy1 + cullM) continue;
      if (!st.spr || !st.spr.width || !(st.half > 0)) continue;   /* never let one bad sprite stop the frame */
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
    /* off the visible paper, no path is built: the same view rect the
       stains use culls the crowds — at the horde cap most beasts are
       typically beyond the eye, and every skipped body is a whole
       blob-path family the frame never spends */
    for (const b of S.bullets) {
      if (b.x < vx0 - 40 || b.x > vx1 + 40 || b.y < vy0 - 40 || b.y > vy1 + 40) continue;
      if (b.kind === 'boomer') drawBoomer(ctx, b); else drawBullet(ctx, b);
    }
    for (const b of S.ebullets) {
      if (b.x < vx0 - 40 || b.x > vx1 + 40 || b.y < vy0 - 40 || b.y > vy1 + 40) continue;
      drawEBullet(ctx, b);
    }
    for (const e of S.enemies) {
      if (e.x < vx0 - 120 || e.x > vx1 + 120 || e.y < vy0 - 120 || e.y > vy1 + 120) continue;
      drawEnemy(ctx, e, t);
    }
    /* the wanderers keep to the valley, faint, like distant spirits */
    if (S.idle.length) {
      ctx.save();
      ctx.globalAlpha = 0.24;
      for (const d of S.idle) {
        if (d.x < vx0 - 120 || d.x > vx1 + 120 || d.y < vy0 - 120 || d.y > vy1 + 120) continue;
        drawEnemy(ctx, d, t);
      }
      ctx.restore();
    }
    for (const mt of S.motes) {
      if (mt.x < vx0 - 60 || mt.x > vx1 + 60 || mt.y < vy0 - 60 || mt.y > vy1 + 60) continue;
      drawMote(ctx, mt, t);
    }
    for (const pk of S.pickups) {
      if (pk.x < vx0 - 60 || pk.x > vx1 + 60 || pk.y < vy0 - 60 || pk.y > vy1 + 60) continue;
      drawPickup(ctx, pk, t);
    }
    for (const sc of S.scribes) drawScribe(ctx, sc);
    for (const sp of S.spirits) drawSpirit(ctx, sp);
    /* v23: field inkstones & Ink Step afterimages rest beneath the brush */
    if (playing && S.shrines) for (const sh of S.shrines) drawShrine(ctx, sh, t);
    if (playing && S.afterimages) for (const af of S.afterimages) drawAfterimage(ctx, af);
    /* the echo walks under the living brush — a pale elder stroke */
    if (playing) drawGhost(ctx, t);
    /* the player stands only where the first stroke has already passed */
    const washHides = S.beginT > 0 && washTipX(S.beginT) < S.W / 2 + S.player.x - S.cam.x;
    if (playing && !washHides) drawInkRing(ctx, t);
    if (playing && !washHides) drawPlayer(ctx, t);
    for (const s of S.stamps) drawStamp(ctx, s);
    for (const ar of S.arcs) drawArcFx(ctx, ar);
    if (S.impacts) for (const im of S.impacts) drawImpact(ctx, im);
    if (S.slashes) for (const sl of S.slashes) drawSlash(ctx, sl);
    for (const bo of S.bolts) drawBolt(ctx, bo);
    for (const p of S.particles) {
      if (p.x < vx0 - 60 || p.x > vx1 + 60 || p.y < vy0 - 60 || p.y > vy1 + 60) continue;
      drawParticle(ctx, p);
    }
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
    if (playing) drawDashVeil(ctx, S, t);

    /* the title ceremony lives above the paper, below the words */
    if (S.mode === 'title') rtFrame(t, dt);

    /* the rim of the eye: a quiet vignette, deeper when the ink is low.
       baked once into a quarter-res offscreen sheet (a smooth gradient
       survives the stretch) — the frame then blits it instead of paying
       a full-screen gradient fill every pass. */
    const th = THEMES[themeKey];
    const lowHp = S.stats && S.stats.hp === 1 && (S.mode === 'playing' || S.mode === 'paused');
    const vgKey = `${S.W | 0}|${S.H | 0}|${themeKey}|${lowHp ? 1 : 0}|${(S.dpr * 100) | 0}`;
    if (vgKey !== vg.key || !vg.bake) {
      vg.key = vgKey;
      const bw = Math.max(2, (S.W | 0) >> 2), bh = Math.max(2, (S.H | 0) >> 2);
      if (!vg.bake) vg.bake = document.createElement('canvas');
      vg.bake.width = bw; vg.bake.height = bh;
      const bc = vg.bake.getContext('2d');
      const g = bc.createRadialGradient(bw / 2, bh / 2, Math.min(bw, bh) * 0.42, bw / 2, bh / 2, Math.max(bw, bh) * 0.74);
      g.addColorStop(0, `rgba(${th.vig},0)`);
      g.addColorStop(1, `rgba(${th.vig},${lowHp ? 0.3 : 0.17})`);
      bc.clearRect(0, 0, bw, bh);
      bc.fillStyle = g;
      bc.fillRect(0, 0, bw, bh);
    }
    ctx.drawImage(vg.bake, 0, 0, S.W, S.H);

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

    /* v26 — the sheet's last look: letterbox and the closing seal */
    if (S.mode === 'dying' || cineP > 0) {
      const barA = Math.max(dyingP > 0 ? Math.min(1, dyingP * 3) : 0, cineP);
      const bh = Math.round(S.H * 0.068 * Math.min(1, barA));
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0c0a07';
      ctx.fillRect(0, 0, S.W, bh);
      ctx.fillRect(0, S.H - bh, S.W, bh);
      ctx.save();
      ctx.globalAlpha = Math.min(1, barA) * 0.62;
      ctx.fillStyle = 'rgba(237,231,217,0.9)';
      const cu = Math.min(S.W, S.H) / 800;
      ctx.font = `500 ${Math.max(7, Math.round(8 * cu))}px "IBM Plex Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      try { ctx.letterSpacing = '5px'; } catch (e) {}
      ctx.fillText('一 筆 入 魂', S.W / 2, bh / 2 + 1);
      ctx.fillText(S.mode === 'dying' ? 'T H E   I N K   D R I E S' : '守  ·  T H E   D U E L', S.W / 2, S.H - bh / 2 + 1);
      try { ctx.letterSpacing = '0px'; } catch (e) {}
      ctx.restore();
    }
    if (S.mode === 'dying' && !S.reduced) {
      /* the paper drinks the light; the scribe's last mark remains */
      const d = Math.max(0, Math.min(1, 1 - S.dyingT / 1.45));
      const g = ctx.createRadialGradient(S.W / 2, S.H / 2, Math.min(S.W, S.H) * 0.18, S.W / 2, S.H / 2, Math.max(S.W, S.H) * 0.66);
      g.addColorStop(0, 'rgba(26,23,20,0)');
      g.addColorStop(1, `rgba(26,23,20,${(0.5 * d).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S.W, S.H);
      ctx.globalAlpha = Math.max(0, (d - 0.42) / 0.58) * 0.9;
      ctx.fillStyle = 'rgba(20,17,14,0.9)';
      ctx.font = `400 ${Math.round(Math.min(S.W, S.H) * 0.2)}px "Zen Antique", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('終', S.W / 2, S.H * 0.47);
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

  /* the armoury's painted tools — the weapon model fitted to its canvas,
     drawn in the active sheet's own ink (never a stale default) */
  function sizeCanvas(cv) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || cv.width || 120;
    const h = cv.clientHeight || cv.height || 40;
    if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
    if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    return { c, w, h };
  }
  function themeInks() {
    const th = THEMES[themeKey] || THEMES.pale;
    return { ink: mixHex(th.ink, th.tint, 0.42), paper: th.paper, red: bossInk() };
  }
  /* v25: live weapon + signature stroke gallery inside the Armoury stage */
  function drawArmoryStrokeDemo(c, id, x0, x1, cy, h, t, k, alpha) {
    const span = x1 - x0;
    if (span < 44) return;
    const prevInk = INK, prevPaper = PAPER;
    INK = k.ink; PAPER = k.paper;
    c.save();
    c.globalAlpha = alpha;
    /* subtle vertical hairpin divider between the tool and its live stroke */
    c.strokeStyle = k.ink;
    c.globalAlpha = alpha * 0.18;
    c.lineWidth = 1;
    c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(x0 - 8, cy - h * 0.34); c.lineTo(x0 - 8, cy + h * 0.34); c.stroke();
    c.setLineDash([]);
    c.globalAlpha = alpha;
    const p = (t * 0.9) % 1;
    const mx = x0 + span * 0.5;

    if (id === 'needle') {
      for (let i = -1; i <= 1; i++) {
        const fp = (p + (i + 1) * 0.24) % 1;
        const bx = x0 + 8 + fp * (span - 18), by = cy + i * 10;
        c.strokeStyle = i === 0 ? k.red : k.ink;
        c.globalAlpha = alpha * 0.35 * (1 - fp * 0.5);
        c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(Math.max(x0, bx - 28), by); c.lineTo(bx, by); c.stroke();
        drawBullet(c, { x: bx, y: by, ang: 0, age: fp * 0.4, life: 1, kind: 'needle', brush: 'needle', maxHits: 2, crimson: i === 0, seed: 31 + i });
      }
    } else if (id === 'broom') {
      for (const sgn of [-1, 1]) {
        const fp = p;
        const bx = x0 + 10 + fp * (span - 24), by = cy + sgn * (4 + fp * 9);
        drawBullet(c, { x: bx, y: by, ang: sgn * 0.14, age: fp * 0.5, life: 0.8, kind: 'drop', brush: 'broom', slow: 1, seed: 41 + sgn });
      }
    } else if (id === 'stone') {
      if (p < 0.72) {
        const fp = p / 0.72;
        const bx = x0 + 12 + fp * (span * 0.68);
        drawBullet(c, { x: bx, y: cy + 5, ang: 0, age: fp * 0.8, life: 0.8, kind: 'stone', brush: 'stone', quake: 1, spin: 7, seed: 55 });
      } else {
        const rp = (p - 0.72) / 0.28;
        const rx = x0 + 12 + span * 0.68;
        drawRing(c, { x: rx, y: cy + 2, max: Math.min(28, h * 0.38), life: 1 - rp, maxLife: 1, kind: 'crater', quake: true });
      }
    } else if (id === 'wisp') {
      const bx = x0 + 14 + p * (span - 26);
      const by = cy + Math.sin(p * TAU) * (h * 0.22);
      const ang = Math.atan2(Math.cos(p * TAU) * (h * 0.22) * TAU, span - 26);
      c.strokeStyle = k.ink; c.globalAlpha = alpha * 0.32; c.lineWidth = 2.4; c.lineCap = 'round';
      c.beginPath();
      for (let s = 0; s <= 10; s++) {
        const sp2 = Math.max(0, p - s * 0.035);
        const sx = x0 + 14 + sp2 * (span - 26), sy = cy + Math.sin(sp2 * TAU) * (h * 0.22);
        s ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
      }
      c.stroke();
      c.globalAlpha = alpha;
      drawBullet(c, { x: bx, y: by, ang, age: t, life: 9, kind: 'wisp', brush: 'wisp', seed: 67 });
    } else if (id === 'fan') {
      drawRing(c, { x: x0 + 4, y: cy, max: 32, life: 1 - p, maxLife: 1, kind: 'gust', ang: 0, spread: 0.9, red: true });
      for (let i = -1; i <= 1; i++) {
        const a = i * 0.28;
        const dist = 12 + p * (span - 26);
        drawBullet(c, { x: x0 + 4 + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, ang: a, age: t, life: 9, kind: 'blade', spin: 11 * (i || 1), bloom: i === 0, crimson: i === 0, gale: true });
      }
    } else if (id === 'tide') {
      const rMax = Math.min(h * 0.4, span * 0.34);
      drawPuddle(c, { x: mx - 18, y: cy + 4, r: 13, life: 1, max: 1.4, seed: 73, wake: 1, pulse: 0 });
      drawRing(c, { x: mx + 6, y: cy, max: rMax, life: 1 - p, maxLife: 1, kind: 'tide' });
    } else if (id === 'seal') {
      const rMax = Math.min(h * 0.42, span * 0.34);
      drawStamp(c, { x: mx, y: cy, r: rMax, life: (1 - p) * 0.78, max: 0.78, seed: 88, kanji: '印' });
    } else if (id === 'scribe') {
      const pts = [];
      for (let s = 0; s <= 14; s++) {
        const u = s / 14;
        const sx = x0 + 8 + u * (span - 22);
        const sy = cy + Math.sin(u * 5.2 - t * 3.8) * (h * 0.24);
        pts.push({ x: sx, y: sy });
      }
      inkStroke(c, pts, 7.6, { alpha: 0.92 * alpha, taper: 0.75, dry: true, color: k.ink, dryColor: k.paper, seed: 99 });
      const hd = pts[pts.length - 1], pr = pts[pts.length - 2];
      const ha = Math.atan2(hd.y - pr.y, hd.x - pr.x);
      c.save(); c.translate(hd.x, hd.y); c.rotate(ha);
      c.fillStyle = k.ink; teardrop(c, 4.2); c.fill();
      c.fillStyle = k.red; c.beginPath(); c.arc(1.8, 0, 1.3, 0, TAU); c.fill();
      c.restore();
    }
    c.restore();
    INK = prevInk; PAPER = prevPaper;
  }

  function drawBrushPreview(cv, id, o = {}) {
    if (!cv || !cv.getContext) return;
    const { c, w, h } = sizeCanvas(cv);
    const k = themeInks();
    const alpha = o.alpha ?? 1;
    if (o.showcase && w >= 230) {
      const toolW = w * 0.54;
      const sc = Math.min(toolW / 44, h / 17.8) * (o.zoom ?? 1);
      c.save();
      c.translate(toolW * 0.5 + 3.2 * sc, h * 0.5 + 0.6 * sc);
      c.rotate(o.rot ?? -0.1);
      drawBrushTool(c, id, { len: sc, wet: 0.22, seed: 91, ink: o.ink ?? k.ink, paper: o.paper ?? k.paper, red: k.red, alpha });
      c.restore();
      drawArmoryStrokeDemo(c, id, toolW + 14, w - 10, h * 0.5, h, o.t ?? 0.35, k, alpha);
      return;
    }
    /* compact rack/chip preview: the full weapon model cleanly fitted */
    const sc = Math.min(w / 43, h / 17.5) * (o.zoom ?? 1);
    c.save();
    c.translate(w / 2 + 3.2 * sc, h / 2 + 0.6 * sc);
    c.rotate(o.rot ?? -0.1);
    drawBrushTool(c, id, { len: sc, wet: 0, seed: 91, ink: o.ink ?? k.ink, paper: o.paper ?? k.paper, red: k.red, alpha });
    c.restore();
  }
  /* a portrait of the scribe holding a brush — for the armoury stage,
     the title, the rest sheet. `pose` picks idle / run / cast. */
  function drawScribePortrait(cv, id, o = {}) {
    if (!cv || !cv.getContext) return;
    const { c, w, h } = sizeCanvas(cv);
    const k = themeInks();
    const t = o.t ?? 0;
    const sc = Math.min(w / 64, h / 50) * (o.zoom ?? 1);
    const pose = o.pose || 'idle';
    const run = pose === 'run';
    const cast = pose === 'cast' ? Math.max(0, 1 - ((t * 1.25) % 1) * 2.6) : 0;
    c.save();
    c.translate(w / 2 - 6 * sc, h * 0.63);
    c.scale(sc, sc);
    drawScribeFigure(c, {
      brush: id, r: 10, t,
      aim: o.aim ?? (-0.22 + Math.sin(t * 0.9) * 0.1),
      vx: run ? 250 : 0, vy: 0, recoil: cast, wet: cast > 0.2 ? 0.9 : 0.12,
      ink: k.ink, paper: k.paper, red: k.red, alpha: o.alpha ?? 1, seed: 91,
    });
    c.restore();
  }

  /* v23: THE CODEX's illustrated plates — every beast painted by the engine's own brush */
  function drawBeastPortrait(cv, type, seen) {
    if (!cv || !cv.getContext || !ENEMIES[type]) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cv.clientWidth || 52;
    const h = cv.clientHeight || 52;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    ensurePatterns(c);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const def = ENEMIES[type];
    const isRed = !!(def.boss || def.captain);
    const maxR = Math.min(w, h) * 0.34;
    const sc = Math.min(1.25, maxR / Math.max(8, def.r));
    const mock = {
      type, x: 0, y: 0, r: def.r, hp: def.hp, maxHp: def.hp,
      ang: -0.25, t: 1.4, seed: 1.7, state: 'cruise', hitFlash: 0,
      vx: 12, vy: 0, form: def.form,
    };
    const S = G.S;
    const px = S.player.x, py = S.player.y;
    S.player.x = 40; S.player.y = -10;
    c.save();
    c.translate(w / 2, h / 2);
    c.scale(sc, sc);
    try { drawEnemy(c, mock, 1.4); } catch (err) {
      c.fillStyle = isRed ? bossInk() : INK;
      blobPath(c, 0, 0, def.r * 0.8, 77, 0.2, 10);
      c.fill();
    }
    c.restore();
    S.player.x = px; S.player.y = py;
    /* an unmet beast is shown as its own silhouette in thin ink —
       a shape to recognise on the paper, not sixty identical blots */
    if (!seen) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = isRed ? bossInk() : INK;
      c.fillRect(0, 0, cv.width, cv.height);
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = isRed ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.24)';
      c.fillRect(0, 0, cv.width, cv.height);
      c.restore();
    }
  }

  return { draw, resetStains, startTitleRitual: rtStart, drawBrushPreview, drawScribePortrait, drawBrushTool, drawScribeFigure, brushTipX, drawBeastPortrait, drawEnemy, titleInkMove, titleInkSplash };
})();
