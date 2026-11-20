'use strict';
/* ============================================================
   ONE MORE — THE OPENING (v23.1, rebuilt)
   A six-chapter ink film painted on the game's own language:
     墨 INK      a drop gathers in the void and bursts
     紙 PAPER    the washi floods in, and the wash paintings arrive
     巻 SCROLLS  the six sheets hang, each with its own ink
     筆 BRUSH    three calligraphic cuts, pools, the horde rises
     霊 SPIRIT   the ink stands as the scribe; the ensō is drawn
     印 SEAL     the hanko falls, vermilion bleeds, the wordmark is pressed
   Skippable at every frame. Rendered on canvas; scored by SFX.
   ============================================================ */

const INTRO = (() => {
  const INK = '#1a1714';
  const PAPER = '#ede7d9';
  const PAPER_RGB = '237,231,217';
  const RED = '#b23a2b';
  const VOID = '#131009';
  const TAU = Math.PI * 2;

  /* ---------------- timeline (snappy, six chapters) ---------------- */
  const P_DROP_FORM = 0.20;
  const P_FALL = 0.94;
  const P_IMPACT = 1.42;
  const P_FLOOD = 1.58;
  const P_FLOOD_END = 2.92;
  const P_PAINT = 2.15;
  const P_SCROLLS0 = 3.32;
  const P_SCROLL_GAP = 0.26;
  const P_SCROLLS_END = 5.62;
  const P_STROKES = [5.72];
  const P_POOLS = 7.72;
  const P_RISE = 7.98;
  const P_EYES = 8.72;
  const P_GATHER = 9.55;
  const P_STAND = 9.92;
  const P_AWAKE = 10.28;
  const P_STAMP = 10.86;
  const P_SLAM = 11.18;
  const P_RED = 11.48;
  const P_TITLE = 12.10;
  const P_WASH = 14.18;
  const DUR = 14.94;

  const CHAPTERS = [
    { at: P_FLOOD, k: '墨', en: 'INK' },
    { at: P_SCROLLS0, k: '紙', en: 'PAPER' },
    { at: P_STROKES[0], k: '巻', en: 'SCROLLS' },
    { at: P_POOLS, k: '筆', en: 'BRUSH' },
    { at: P_STAND, k: '霊', en: 'SPIRIT' },
    { at: P_SLAM, k: '印', en: 'SEAL' },
  ];

  const CAPTIONS = [
    { kanji: '墨', en: 'IN THE BEGINNING, THERE WAS INK.', t0: 1.98, t1: 3.18 },
    { kanji: '紙', en: 'THEN A SHEET THAT REMEMBERS EVERY STROKE.', t0: 3.30, t1: 4.55 },
    { kanji: '巻', en: 'SIX SCROLLS. SIXTY SCENES. SIX GUARDIANS.', t0: 4.62, t1: 5.95 },
    { kanji: '筆', en: 'ONE BRUSH WAS CUT FROM THE REED.', t0: 6.05, t1: 7.55 },
    { kanji: '生', en: 'AND THE INK BEGAN TO MOVE.', t0: 7.70, t1: 9.30 },
    { kanji: '守', en: 'EVERY SEAL IT BREAKS IS REMEMBERED.', t0: 9.45, t1: 11.15 },
  ];

  const SIX = [
    { kanji: '一', roman: 'I', name: 'FIRST WASH', paper: '#ede7d9', ink: '#3a3428', note: 'pale wash' },
    { kanji: '夜', roman: 'II', name: 'NIGHT SCROLL', paper: '#3e372b', ink: '#e9e2d2', note: 'lamp-black' },
    { kanji: '紅', roman: 'III', name: 'CINNABAR FIELD', paper: '#eadbc4', ink: '#7a2a1a', note: 'vermillion' },
    { kanji: '嵐', roman: 'IV', name: 'STORM SHEET', paper: '#c7cdc9', ink: '#1e3240', note: 'rain-grey' },
    { kanji: '金', roman: 'V', name: 'GILT SCROLL', paper: '#e7d6ad', ink: '#6a4d10', note: 'gold-dust' },
    { kanji: '素', roman: 'VI', name: 'THE BLANK SILK', paper: '#f3eee1', ink: '#3c3648', note: 'cool silk' },
  ];

  /* the real wash paintings, composited into the film */
  const PAINT = {
    cliff: { src: 'img/wash_cliff.webp', img: null, ok: false, bad: false },
    guo: { src: 'img/wash_guo.webp', img: null, ok: false, bad: false },
    waves: { src: 'img/wash_waves.webp', img: null, ok: false, bad: false },
    trees: { src: 'img/wash_trees.webp', img: null, ok: false, bad: false },
  };

  /* ---------------- state ---------------- */
  let T = 0;
  let live = false;
  let ended = false;
  let skipping = false;
  let skipT = 0;
  let onEnd = null;

  let strokes = [];
  let satellite = [];
  let sealSplats = [];
  let redEdge = [];
  let motes = [];
  let shakeAmp = 0;
  let sealSlammed = false;
  let planW = 0, planH = 0;

  let paperC = null, paperW = 0, paperH = 0, paperDpr = 0;

  /* ---------------- math ---------------- */
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smooth = (a, b, v) => clamp01((v - a) / Math.max(0.0001, b - a));
  const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
  const easeInCubic = p => p * p * p;
  const easeOutQuad = p => 1 - (1 - p) * (1 - p);
  const easeOutBack = p => { const c = 1.55; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
  const easeInOut = p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  function mulberry(s) {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- ink primitives ---------------- */
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

  function teardrop(c, r) {
    c.beginPath();
    c.moveTo(r * 1.75, 0);
    c.quadraticCurveTo(r * 0.35, r * 0.95, -r * 0.15, r * 0.62);
    c.arc(-r * 0.15, 0, r * 0.62, Math.PI * 0.5, Math.PI * 1.5);
    c.quadraticCurveTo(r * 0.35, -r * 0.95, r * 1.75, 0);
    c.closePath();
  }

  function inkStroke(c, pts, maxW, o = {}) {
    if (!pts || pts.length < 2) return;
    const n = pts.length;
    const seed = o.seed ?? 7;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(n - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
      let dx = q.x - r0.x, dy = q.y - r0.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const t = i / (n - 1);
      const press = 0.82 + 0.18 * Math.sin(Math.min(1, t * 4.5) * Math.PI / 2);
      const liftT = 0.7;
      const lift = t < liftT ? 1 : Math.pow(1 - (t - liftT) / (1 - liftT), 1.35);
      const breathe = 0.96 + 0.04 * Math.sin(t * 11 + seed) * Math.sin(t * 4.7 + seed * 1.7);
      const w = Math.max(0.4, maxW * press * lift * breathe);
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
    c.beginPath();
    c.arc(pts[0].x, pts[0].y, Math.max(0.5, Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y) / 2), 0, TAU);
    c.fill();
    if (o.dry) {
      c.globalAlpha = (o.alpha ?? 1) * 0.5;
      c.strokeStyle = o.paper ?? PAPER;
      c.lineCap = 'round';
      const i0 = Math.floor(n * 0.62);
      for (let k = -1; k <= 1; k++) {
        if (!k) continue;
        c.lineWidth = Math.max(0.7, maxW * 0.055 * (2 - Math.abs(k)));
        c.beginPath();
        for (let i = i0; i < n; i++) {
          const q = pts[Math.min(n - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
          let dx = q.x - r0.x, dy = q.y - r0.y;
          const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
          const off = k * maxW * 0.13 * (0.4 + 0.6 * (i - i0) / Math.max(1, n - i0));
          const x = pts[i].x - dy * off, y = pts[i].y + dx * off;
          i === i0 ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    c.restore();
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

  function sealPath(c, half, seed, wob = 0.055) {
    const rnd = mulberry(seed);
    const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const per = 4;
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const [x0, y0] = corner[e], [x1, y1] = corner[(e + 1) % 4];
      for (let i = 0; i < per; i++) {
        const t = i / per;
        pts.push([
          (x0 + (x1 - x0) * t) * half + (rnd() - 0.5) * half * wob * 2,
          (y0 + (y1 - y0) * t) * half + (rnd() - 0.5) * half * wob * 2,
        ]);
      }
    }
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[n - 1], pts[0]);
    c.beginPath();
    c.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) {
      const q = pts[(i + 1) % n];
      m = mid(pts[i], q);
      c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    c.closePath();
  }

  function roughRect(c, w, h, seed, wob = 0.02) {
    const rnd = mulberry(seed);
    const halfW = w / 2, halfH = h / 2;
    const corners = [
      [-halfW, -halfH], [halfW, -halfH], [halfW, halfH], [-halfW, halfH],
    ];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const a = corners[e], b = corners[(e + 1) % 4];
      const steps = 5;
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        pts.push([
          a[0] + (b[0] - a[0]) * t + (rnd() - 0.5) * w * wob,
          a[1] + (b[1] - a[1]) * t + (rnd() - 0.5) * h * wob,
        ]);
      }
    }
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[n - 1], pts[0]);
    c.beginPath();
    c.moveTo(m[0], m[1]);
    for (let i = 0; i < n; i++) {
      const q = pts[(i + 1) % n];
      m = mid(pts[i], q);
      c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    c.closePath();
  }

  function eyeSlits(c, r, a = 1) {
    c.save();
    c.strokeStyle = PAPER;
    c.lineCap = 'round';
    c.lineWidth = Math.max(1.8, r * 0.15);
    c.globalAlpha = a;
    for (const s of [-1, 1]) {
      const cx = s * r * 0.30, cy = -r * 0.04;
      const l = r * 0.42;
      const dx = Math.cos(0.46) * l / 2, dy = Math.sin(0.46) * l / 2 * -s;
      c.beginPath();
      c.moveTo(cx - dx, cy - dy);
      c.lineTo(cx + dx, cy + dy);
      c.stroke();
    }
    c.restore();
  }

  function curvePts(x0, y0, cx, cy, x1, y1, n, jit, seed) {
    const rnd = mulberry(seed);
    const a1 = rnd() * TAU, a2 = rnd() * TAU, a3 = rnd() * TAU;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, mt = 1 - t;
      const wx = jit * (0.55 * Math.sin(t * 5.1 + a1) + 0.3 * Math.sin(t * 9.3 + a2) + 0.15 * Math.sin(t * 16.7 + a3));
      const wy = jit * (0.55 * Math.sin(t * 4.7 + a2) + 0.3 * Math.sin(t * 8.9 + a3) + 0.15 * Math.sin(t * 15.3 + a1));
      pts.push({
        x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1 + wx,
        y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1 + wy,
      });
    }
    return pts;
  }

  function slicePts(pts, p) {
    if (p >= 1) return pts;
    const n = pts.length;
    const f = p * (n - 1);
    const i0 = Math.floor(f);
    const out = pts.slice(0, i0 + 1);
    if (i0 < n - 1) {
      const fr = f - i0;
      const a = pts[i0], b = pts[i0 + 1];
      out.push({ x: a.x + (b.x - a.x) * fr, y: a.y + (b.y - a.y) * fr });
    }
    return out.length >= 2 ? out : [pts[0], pts[0]];
  }

  /* ---------------- washi ---------------- */
  function ensurePaper(W, H, dpr) {
    if (paperC && paperW === W && paperH === H && paperDpr === dpr) return;
    paperW = W; paperH = H; paperDpr = dpr;
    paperC = document.createElement('canvas');
    paperC.width = Math.round(W * dpr);
    paperC.height = Math.round(H * dpr);
    const p = paperC.getContext('2d');
    p.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rnd = mulberry(5150521);

    p.fillStyle = PAPER;
    p.fillRect(0, 0, W, H);
    p.lineWidth = 1;
    p.strokeStyle = 'rgba(50,45,36,0.035)';
    for (let y = 4; y < H; y += 8) {
      p.beginPath(); p.moveTo(0, y + (rnd() - 0.5)); p.lineTo(W, y + (rnd() - 0.5)); p.stroke();
    }
    const fibers = Math.round((W * H) / 850);
    for (let i = 0; i < fibers; i++) {
      const x = rnd() * W, y = rnd() * H;
      const a = (rnd() - 0.5) * 0.9 + (rnd() < 0.5 ? 0 : Math.PI / 2);
      const l = 1.5 + rnd() * 3.5;
      p.strokeStyle = `rgba(70,62,48,${0.03 + rnd() * 0.045})`;
      p.lineWidth = 0.7;
      p.beginPath();
      p.moveTo(x, y);
      p.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      p.stroke();
    }
    const dots = Math.round((W * H) / 2400);
    for (let i = 0; i < dots; i++) {
      p.fillStyle = `rgba(50,45,36,${0.02 + rnd() * 0.05})`;
      p.beginPath();
      p.arc(rnd() * W, rnd() * H, 0.3 + rnd() * 0.8, 0, TAU);
      p.fill();
    }
    for (let i = 0; i < 7; i++) {
      const r = Math.min(W, H) * (0.14 + rnd() * 0.24);
      const x = rnd() * W, y = rnd() * H;
      const g = p.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(112,102,80,${0.02 + rnd() * 0.014})`);
      g.addColorStop(1, 'rgba(112,102,80,0)');
      p.fillStyle = g;
      p.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }


  /* ---------------- procedural wash ----------------
     The film paints its own mountains. A scanned handscroll may load on
     top of them when the sheet has the asset, but nothing in the opening
     depends on a file: bare repo, offline PWA or a stripped image cache,
     the ink still arrives. */
  let ridgeCache = {};
  function ridgeKey(W, H, tag) { return tag + '|' + (W | 0) + 'x' + (H | 0); }

  function buildRidges(W, H, tag, seed, bands, mist) {
    const rnd = mulberry(seed);
    const cv = document.createElement('canvas');
    cv.width = Math.max(2, W | 0);
    cv.height = Math.max(2, H | 0);
    const c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);

    for (let b = 0; b < bands; b++) {
      const depth = b / (bands - 1);
      const baseY = H * (0.30 + 0.42 * depth);
      const amp = H * (0.13 - 0.055 * depth);
      const ink = 0.055 + 0.11 * depth;
      const pts = [];
      const steps = 34;
      const ph1 = rnd() * TAU, ph2 = rnd() * TAU, ph3 = rnd() * TAU;
      const f1 = 1.1 + rnd() * 0.8, f2 = 2.6 + rnd() * 1.6, f3 = 5.4 + rnd() * 2.4;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const y = baseY
          - amp * (0.62 * Math.sin(t * f1 * TAU + ph1) + 0.28 * Math.sin(t * f2 * TAU + ph2) + 0.12 * Math.sin(t * f3 * TAU + ph3))
          - amp * 0.55 * Math.pow(Math.max(0, Math.sin(t * TAU * (0.7 + depth * 0.5) + ph1)), 2.2);
        pts.push({ x: t * (W + 40) - 20, y });
      }
      /* the mountain body */
      c.beginPath();
      c.moveTo(-20, H + 20);
      c.lineTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], q = pts[i];
        c.quadraticCurveTo(a.x, a.y, (a.x + q.x) / 2, (a.y + q.y) / 2);
      }
      c.lineTo(W + 20, H + 20);
      c.closePath();
      const g = c.createLinearGradient(0, baseY - amp, 0, H);
      g.addColorStop(0, `rgba(38,33,26,${(ink * 1.5).toFixed(3)})`);
      g.addColorStop(0.55, `rgba(44,38,30,${(ink * 0.72).toFixed(3)})`);
      g.addColorStop(1, `rgba(52,45,35,${(ink * 0.18).toFixed(3)})`);
      c.fillStyle = g;
      c.fill();

      /* the crest: a wet darker line, then dry-brush teeth below it */
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], q = pts[i];
        c.quadraticCurveTo(a.x, a.y, (a.x + q.x) / 2, (a.y + q.y) / 2);
      }
      c.strokeStyle = `rgba(28,24,19,${(0.1 + 0.3 * depth).toFixed(3)})`;
      c.lineWidth = 1 + 1.6 * depth;
      c.stroke();

      /* pines on the near crests, as the handscrolls draw them */
      if (depth > 0.42) {
        for (let i = 3; i < pts.length - 3; i += 2) {
          if (rnd() > 0.42) continue;
          const px = pts[i].x, py = pts[i].y - 1;
          const h = (4 + rnd() * 7) * (0.6 + depth);
          c.strokeStyle = `rgba(24,20,16,${(0.16 + 0.3 * depth).toFixed(3)})`;
          c.lineWidth = 0.9;
          c.beginPath(); c.moveTo(px, py); c.lineTo(px, py - h); c.stroke();
          c.beginPath();
          c.moveTo(px - h * 0.42, py - h * 0.42); c.lineTo(px, py - h * 1.12); c.lineTo(px + h * 0.42, py - h * 0.42);
          c.stroke();
        }
      }
    }

    /* mist bands that eat the feet of the ranges */
    for (let m = 0; m < 4; m++) {
      const y = H * (0.42 + m * 0.14) + (rnd() - 0.5) * H * 0.05;
      const h = H * (0.05 + rnd() * 0.08);
      const g = c.createLinearGradient(0, y - h, 0, y + h);
      g.addColorStop(0, `rgba(${PAPER_RGB},0)`);
      g.addColorStop(0.5, `rgba(${PAPER_RGB},${(0.62 * mist).toFixed(3)})`);
      g.addColorStop(1, `rgba(${PAPER_RGB},0)`);
      c.fillStyle = g;
      c.fillRect(0, y - h, W, h * 2);
    }
    /* a wash of age across the whole sheet */
    const vg = c.createRadialGradient(W / 2, H * 0.44, Math.min(W, H) * 0.18, W / 2, H * 0.5, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(112,102,80,0)');
    vg.addColorStop(1, 'rgba(112,102,80,0.07)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
    return cv;
  }

  function ridges(W, H, tag, seed, bands, mist) {
    const k = ridgeKey(W, H, tag);
    if (!ridgeCache[k]) ridgeCache[k] = buildRidges(W, H, tag, seed, bands, mist);
    return ridgeCache[k];
  }

  /* the door's own painted panel — a hand-set ink-wash: a vermillion sun,
     four ranges of mountains in deepening ink, pines, mist and birds.
     Self-contained so the sheet is rich even with no scanned asset. */
  function gateRidge(c, w, h, baseY, amp, peaks, seed, ink, layers) {
    const rnd = mulberry(seed);
    const steps = 110;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let y = 0;
      for (const pk of peaks) {
        const d = t - pk.x;
        y += pk.h * Math.exp(-(d * d) / (2 * pk.w * pk.w));
      }
      y += 0.045 * Math.sin(t * 34 + seed * 0.01) * (0.4 + rnd() * 0.5);
      pts.push({ x: t * w, y: baseY - amp * y });
    }
    const bodyPath = () => {
      c.beginPath();
      c.moveTo(-4, h);
      c.lineTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], q = pts[i];
        c.quadraticCurveTo(a.x, a.y, (a.x + q.x) / 2, (a.y + q.y) / 2);
      }
      c.lineTo(w + 4, h);
      c.closePath();
    };
    const crestPath = () => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], q = pts[i];
        c.quadraticCurveTo(a.x, a.y, (a.x + q.x) / 2, (a.y + q.y) / 2);
      }
    };
    /* body */
    bodyPath();
    const g = c.createLinearGradient(0, baseY - amp, 0, baseY + amp * 1.3);
    g.addColorStop(0, `rgba(30,26,20,${ink})`);
    g.addColorStop(0.5, `rgba(38,33,26,${ink * 0.62})`);
    g.addColorStop(1, `rgba(52,45,35,${ink * 0.12})`);
    c.fillStyle = g;
    c.fill();
    /* layered inner ridges — the slopes of the mountain, lighter ink */
    if (layers) {
      c.save();
      bodyPath();
      c.clip();
      for (let L = 1; L <= layers; L++) {
        const off = (amp * 0.34) * L;
        c.beginPath();
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          let y = 0;
          for (const pk of peaks) {
            const d = t - pk.x;
            y += pk.h * Math.exp(-(d * d) / (2 * (pk.w * 1.15) * (pk.w * 1.15)));
          }
          y += 0.05 * Math.sin(t * 26 + seed + L * 2);
          const x = t * w, yy = baseY - amp * y + off;
          i ? c.lineTo(x, yy) : c.moveTo(x, yy);
        }
        c.strokeStyle = `rgba(24,20,15,${ink * (0.4 - L * 0.07)})`;
        c.lineWidth = 0.9 + (layers - L) * 0.3;
        c.stroke();
      }
      c.restore();
    }
    /* crest — a wet darker line, then dry-brush teeth */
    crestPath();
    c.strokeStyle = `rgba(24,20,15,${Math.min(0.9, ink * 1.3)})`;
    c.lineWidth = 1 + ink * 3.4;
    c.stroke();
    for (let i = 2; i < pts.length - 2; i += 2) {
      if (rnd() > 0.42) continue;
      const p = pts[i];
      c.strokeStyle = `rgba(24,20,15,${ink * 0.75})`;
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(p.x, p.y + 1);
      c.lineTo(p.x + (rnd() - 0.5) * 6, p.y + 3 + rnd() * 7);
      c.stroke();
    }
    return pts;
  }

  function gatePine(c, x, y, s, alpha) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.fillStyle = `rgba(22,18,14,${alpha})`;
    c.strokeStyle = `rgba(22,18,14,${alpha})`;
    c.lineCap = 'round';
    /* trunk */
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -13); c.stroke();
    /* three layered branch fans, darkening downward */
    const fans = [
      { y: -12, w: 9, h: 3.1 },
      { y: -9, w: 12, h: 3.5 },
      { y: -5.5, w: 15, h: 3.9 },
    ];
    for (const f of fans) {
      c.beginPath();
      c.moveTo(0, f.y);
      c.lineTo(-f.w, f.y + f.h);
      c.lineTo(0, f.y + f.h * 0.4);
      c.lineTo(f.w, f.y + f.h);
      c.closePath();
      c.fill();
    }
    c.restore();
  }

  function gateBird(c, x, y, s, alpha) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.strokeStyle = `rgba(30,25,19,${alpha})`;
    c.lineWidth = 1.3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-6, 0);
    c.quadraticCurveTo(-3, -4, 0, -1);
    c.quadraticCurveTo(3, -4, 6, 0);
    c.stroke();
    c.restore();
  }

  function paintGate(cv) {
    if (!cv || !cv.getContext) return;
    const w = cv.clientWidth || 900, h = cv.clientHeight || 600;
    if (w < 4 || h < 4) { requestAnimationFrame(() => paintGate(cv)); return; }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.fillStyle = PAPER;
    c.fillRect(0, 0, w, h);

    /* paper fibers — a few hundred faint strands */
    const fr = mulberry(991);
    c.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = fr() * w, y = fr() * h;
      const a = fr() * TAU, l = 3 + fr() * 7;
      c.strokeStyle = `rgba(120,104,80,${0.02 + fr() * 0.035})`;
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l * 0.4);
      c.stroke();
    }

    /* the vermillion sun, upper-right, halo + rough disc */
    const sx = w * 0.73, sy = h * 0.285, sr = Math.min(w, h) * 0.155;
    let halo = c.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 2.7);
    halo.addColorStop(0, 'rgba(190,84,58,0.34)');
    halo.addColorStop(0.5, 'rgba(184,72,48,0.13)');
    halo.addColorStop(1, 'rgba(184,72,48,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, w, h);
    c.save();
    c.globalAlpha = 0.94;
    c.fillStyle = RED;
    blobPath(c, sx, sy, sr, 777, 0.035, 26);
    c.fill();
    let sg = c.createRadialGradient(sx - sr * 0.28, sy - sr * 0.32, sr * 0.1, sx, sy, sr * 1.02);
    sg.addColorStop(0, 'rgba(255,128,96,0.55)');
    sg.addColorStop(0.6, 'rgba(214,92,66,0.12)');
    sg.addColorStop(1, 'rgba(150,44,30,0)');
    c.globalAlpha = 1;
    c.fillStyle = sg;
    blobPath(c, sx, sy, sr, 778, 0.035, 26);
    c.fill();
    c.restore();

    /* four ranges, back (pale) to front (deep). The upper-center is kept
       clean for the wordmark, so ranges carry weight to the sides + base. */
    const R = mulberry(20260116);
    const mk = (n) => {
      const arr = [];
      for (let i = 0; i < n; i++) {
        arr.push({ x: 0.06 + (i / (n - 1)) * 0.88 + (R() - 0.5) * 0.06, h: 0.5 + R() * 0.5, w: 0.05 + R() * 0.075 });
      }
      return arr;
    };
    /* far */
    gateRidge(c, w, h, h * 0.565, h * 0.075, mk(5), 11, 0.14, 1);
    /* mist over the far range's feet */
    let m1 = c.createLinearGradient(0, h * 0.55, 0, h * 0.66);
    m1.addColorStop(0, `rgba(${PAPER_RGB},0)`);
    m1.addColorStop(0.5, `rgba(${PAPER_RGB},0.5)`);
    m1.addColorStop(1, `rgba(${PAPER_RGB},0)`);
    c.fillStyle = m1; c.fillRect(0, h * 0.55, w, h * 0.11);
    /* mid */
    gateRidge(c, w, h, h * 0.665, h * 0.105, mk(6), 27, 0.26, 2);
    let m2 = c.createLinearGradient(0, h * 0.66, 0, h * 0.78);
    m2.addColorStop(0, `rgba(${PAPER_RGB},0)`);
    m2.addColorStop(0.5, `rgba(${PAPER_RGB},0.52)`);
    m2.addColorStop(1, `rgba(${PAPER_RGB},0)`);
    c.fillStyle = m2; c.fillRect(0, h * 0.66, w, h * 0.12);
    /* near */
    const nearPts = gateRidge(c, w, h, h * 0.8, h * 0.15, mk(7), 41, 0.44, 3);
    /* pines ride the near ridge */
    for (let i = 0; i < 9; i++) {
      const idx = 6 + Math.floor(R() * (nearPts.length - 12));
      const p = nearPts[idx];
      if (!p) continue;
      gatePine(c, p.x, p.y + 1, (0.7 + R() * 0.7) * (Math.min(w, h) / 700), 0.62);
    }
    /* foreground — the darkest, at the very base */
    gateRidge(c, w, h, h * 0.96, h * 0.11, mk(6), 53, 0.6, 3);
    let m3 = c.createLinearGradient(0, h * 0.86, 0, h * 1.0);
    m3.addColorStop(0, `rgba(${PAPER_RGB},0)`);
    m3.addColorStop(1, `rgba(${PAPER_RGB},0.4)`);
    c.fillStyle = m3; c.fillRect(0, h * 0.86, w, h * 0.14);

    /* a few birds in the open sky, toward the sun */
    const brd = mulberry(321);
    for (let i = 0; i < 4; i++) {
      gateBird(c, w * (0.56 + brd() * 0.2), h * (0.2 + brd() * 0.14), (0.5 + brd() * 0.6) * (Math.min(w, h) / 700), 0.5);
    }

    /* age + soft focus toward the wordmark centre */
    let vg = c.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.05, w * 0.5, h * 0.52, Math.max(w, h) * 0.72);
    vg.addColorStop(0, `rgba(${PAPER_RGB},0.34)`);
    vg.addColorStop(0.5, `rgba(${PAPER_RGB},0)`);
    vg.addColorStop(1, 'rgba(96,84,62,0.1)');
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
  }

  /* ---------------- wash paintings ---------------- */
  function ensurePaintings() {
    for (const k in PAINT) {
      const p = PAINT[k];
      if (p.img || p.bad) continue;
      try {
        const im = new Image();
        im.onload = () => { p.ok = true; };
        im.onerror = () => { p.bad = true; };
        im.src = p.src;
        p.img = im;
      } catch (e) { p.bad = true; }
    }
  }

  /* the hand's tool, painted — the film's one emblem in the void */
  function drawTool(c, x, y, len, ang, alpha, u) {
    if (alpha <= 0.01) return;
    c.save();
    c.translate(x, y);
    c.rotate(ang);
    c.globalAlpha = alpha;
    c.strokeStyle = PAPER;
    c.fillStyle = PAPER;
    c.lineCap = 'round';
    /* bamboo shaft */
    c.lineWidth = Math.max(1.6, 2.8 * u);
    c.beginPath();
    c.moveTo(-len / 2, 0);
    c.lineTo(len * 0.18, 0);
    c.stroke();
    /* thread ferrule */
    c.lineWidth = Math.max(2.2, 4.2 * u);
    c.beginPath();
    c.moveTo(len * 0.16, 0);
    c.lineTo(len * 0.22, 0);
    c.stroke();
    /* the bristle head, a wet teardrop */
    c.beginPath();
    c.moveTo(len * 0.22, -len * 0.045);
    c.quadraticCurveTo(len * 0.40, -len * 0.025, len * 0.49, 0);
    c.quadraticCurveTo(len * 0.40, len * 0.025, len * 0.22, len * 0.045);
    c.closePath();
    c.fill();
    /* the hanging cord */
    c.globalAlpha = alpha * 0.4;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-len * 0.5, 0);
    c.quadraticCurveTo(-len * 0.62, len * 0.14, -len * 0.58, len * 0.3);
    c.stroke();
    c.restore();
  }

  function drawWash(c, key, alpha, W, H, zoom = 1, dx = 0, dy = 0) {
    /* the ranges are always there; a scanned painting only enriches them */
    if (alpha > 0.004) {
      const art = ridges(W, H, key, key.charCodeAt(0) * 977 + key.length * 31, 4 + (key === 'waves' ? 1 : 0), key === 'waves' ? 0.5 : 0.8);
      c.save();
      c.globalAlpha = alpha * (key === 'waves' ? 0.55 : 0.85);
      c.translate(W / 2, H / 2);
      c.scale(zoom, zoom);
      c.translate(-W / 2 + dx * W, -H / 2 + dy * H);
      c.drawImage(art, 0, 0, W, H);
      c.restore();
    }
    const p = PAINT[key];
    if (!p || !p.ok || alpha <= 0.004) return;
    const im = p.img;
    const iw = im.naturalWidth || 1200;
    const ih = im.naturalHeight || 800;
    const sc = Math.max(W / iw, H / ih) * zoom;
    const dw = iw * sc, dh = ih * sc;
    const x = (W - dw) / 2 + dx * W;
    const y = (H - dh) / 2 + dy * H;
    c.save();
    c.globalAlpha = alpha;
    c.globalCompositeOperation = 'multiply';
    c.drawImage(im, x, y, dw, dh);
    c.restore();
    /* melt the painting's edges back into the washi */
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.24, W / 2, H / 2, Math.max(W, H) * 0.74);
    g.addColorStop(0, `rgba(${PAPER_RGB},0)`);
    g.addColorStop(0.7, `rgba(${PAPER_RGB},${(0.2 * alpha).toFixed(3)})`);
    g.addColorStop(1, `rgba(${PAPER_RGB},${Math.min(1, 0.9 * alpha + 0.08).toFixed(3)})`);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  /* ---------------- plan ---------------- */
  function plan(W, H) {
    const u = Math.min(W, H) / 800;
    const rnd = mulberry((Math.random() * 1e9) | 0);

    /* ONE BRUSH: the film's single composition is an ensō, drawn in
       one breath, with a low horizontal cut beneath it. No crossings. */
    strokes = [
      {
        pts: curvePts(W * 0.34, H * 0.678, W * 0.50, H * 0.664, W * 0.66, H * 0.682, 26, 3.0 * u, 11),
        w: 9.5 * u, t0: P_STROKES[0] + 0.38, dur: 0.92, seed: 101,
      },
    ];
    for (const s of strokes) {
      s.flicks = [];
      const end = s.pts[s.pts.length - 1];
      const prev = s.pts[s.pts.length - 4] || s.pts[0];
      const a = Math.atan2(end.y - prev.y, end.x - prev.x);
      for (let i = 0; i < 3; i++) {
        const fa = a + (rnd() - 0.5) * 1.1;
        const sp = (90 + rnd() * 130) * u;
        s.flicks.push({
          x: end.x, y: end.y,
          vx: Math.cos(fa) * sp, vy: Math.sin(fa) * sp - 40 * u,
          r: (1.3 + rnd() * 1.7) * u, life: 0.55,
        });
      }
    }

    satellite = [];
    for (let i = 0; i < 7; i++) {
      satellite.push({ a: rnd() * TAU, d: 0.28 + rnd() * 0.6, r: (5 + rnd() * 10) * u, seed: 1000 + i });
    }

    sealSplats = [];
    for (let i = 0; i < 6; i++) {
      sealSplats.push({ a: rnd() * TAU, d: (0.55 + rnd() * 0.5), r: (9 + rnd() * 16) * u, seed: 2000 + i });
    }

    redEdge = [];
    for (let i = 0; i < 7; i++) {
      redEdge.push({ a: rnd() * TAU, d: (0.34 + rnd() * 0.5), r: (7 + rnd() * 13) * u, seed: 2600 + i });
    }

    motes = [];
    for (let i = 0; i < 38; i++) {
      motes.push({
        x: rnd(), y: rnd(),
        r: (0.6 + rnd() * 1.5) * u,
        s: 0.25 + rnd() * 0.55, p: rnd() * TAU,
        a: 0.05 + rnd() * 0.1,
      });
    }
  }

  /* ---------------- lifecycle ---------------- */
  function start() {
    T = 0; live = true; ended = false; skipping = false; skipT = 0; shakeAmp = 0;
    sealSlammed = false; planW = 0; planH = 0;
    ensurePaintings();
    try {
      if (document.fonts) {
        document.fonts.load('80px "Zen Antique"');
        document.fonts.load('700 80px "Shippori Mincho"');
        document.fonts.load('80px "Shippori Mincho"');
        document.fonts.load('12px "IBM Plex Mono"');
      }
    } catch (e) {}
  }

  function skip() {
    if (!live || ended || skipping) return;
    skipping = true; skipT = 0;
  }

  function finish() {
    if (ended) return;
    ended = true; live = false;
    if (onEnd) onEnd();
  }

  let dt_last = 0;
  function crossed(t) { return T >= t && T - dt_last < t; }

  function update(dt) {
    if (!live || ended) return;
    dt_last = dt;
    T += dt;
    if (shakeAmp > 0) shakeAmp = Math.max(0, shakeAmp - dt * 34);

    if (crossed(0.12)) SFX.page(1.2);
    if (crossed(P_IMPACT)) SFX.thud();
    if (crossed(P_FLOOD)) SFX.gong();
    for (let i = 0; i < SIX.length; i++) {
      if (crossed(P_SCROLLS0 + i * P_SCROLL_GAP + 0.16)) SFX.pick(i % 4);
    }
    if (crossed(P_STROKES[0])) SFX.pick(0);
    if (crossed(P_STROKES[0] + 0.4)) SFX.pick(1);
    if (crossed(P_STROKES[0] + 1.25)) SFX.pick(2);
    if (crossed(P_POOLS)) SFX.nova();
    if (crossed(P_RISE)) SFX.spirit();
    if (crossed(P_GATHER)) SFX.page(0.8);
    if (crossed(P_STAND)) SFX.spirit();
    if (crossed(P_SLAM)) SFX.hanko();
    if (crossed(P_RED)) SFX.elite();
    if (crossed(P_TITLE)) SFX.gong();

    if (skipping) {
      skipT += dt;
      if (skipT >= 0.34) { finish(); return; }
    }
    if (T >= DUR) finish();
  }

  function drawFlicks(c, s, u) {
    const done = clamp01((T - s.t0 - s.dur) / 0.55);
    if (done <= 0 || done >= 1) return;
    for (const f of s.flicks) {
      const tt = done * 0.55;
      const x = f.x + f.vx * tt, y = f.y + f.vy * tt + 130 * u * tt * tt;
      c.save();
      c.translate(x, y);
      c.rotate(Math.atan2(f.vy + 260 * u * tt, f.vx));
      c.globalAlpha = (1 - done) * 0.85;
      c.fillStyle = INK;
      teardrop(c, f.r);
      c.fill();
      c.restore();
    }
  }

  /* ---------------- the scribe ---------------- */
  function drawScribe(c, u, o) {
    const R = o.R;
    if (R < 2) return;
    /* the film's hero is the run's own scribe, holding the brush you chose */
    if (typeof window !== 'undefined' && window.R && window.R.drawScribeFigure) {
      const rec0 = o.stamped ? 1 - easeOutCubic(clamp01((o.st || 0) / 0.13)) : 0;
      const aim0 = o.stamped ? 1.15 - rec0 * 2.8 : -0.55 - easeOutCubic(o.raise || 0) * 1.1;
      let brush0 = 'needle';
      try { if (typeof G !== 'undefined' && G.getBrush) brush0 = G.getBrush(); } catch (e) {}
      window.R.drawScribeFigure(c, {
        brush: brush0, r: R, t: o.t || 0, aim: aim0,
        recoil: rec0 * 0.7, eyes: (o.awake || 0) > 0.45,
        ink: INK, paper: PAPER, red: RED,
        seed: 991 ^ ((o.tick || 0) * 3), wet: o.stamped ? 0.9 : 0.15,
      });
      return;
    }
    const s = R / 10;
    const t = o.t || 0;
    const raise = o.raise || 0;
    const awake = o.awake || 0;
    const stamped = !!o.stamped;
    const st = o.st || 0;
    const sd = 991 ^ ((o.tick || 0) * 3);

    c.save();
    c.scale(1, 0.4);
    c.globalAlpha = 0.16;
    c.fillStyle = INK;
    blobPath(c, 0, R * 1.62, R * 0.98, sd ^ 3, 0.2, 9);
    c.fill();
    c.restore();

    c.save();
    c.rotate(Math.sin(t * 2.1) * 0.035);
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(-R * 0.52, -R * 0.72);
    c.quadraticCurveTo(-R * 0.78, R * 0.3, -R * 0.92, R * 1.02);
    c.lineTo(-R * 0.55, R * 0.92);
    c.lineTo(-R * 0.3, R * 1.05);
    c.lineTo(0, R * 0.9);
    c.lineTo(R * 0.3, R * 1.06);
    c.lineTo(R * 0.58, R * 0.92);
    c.lineTo(R * 0.95, R * 1.03);
    c.quadraticCurveTo(R * 0.8, R * 0.3, R * 0.52, -R * 0.72);
    c.quadraticCurveTo(0, -R * 1.02, -R * 0.52, -R * 0.72);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.28;
    c.strokeStyle = PAPER;
    c.lineWidth = 1.1 * s;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-R * 0.3, -R * 0.2);
    c.quadraticCurveTo(-R * 0.42, R * 0.5, -R * 0.36, R * 0.95);
    c.stroke();
    c.beginPath();
    c.moveTo(R * 0.34, -R * 0.16);
    c.quadraticCurveTo(R * 0.5, R * 0.42, R * 0.42, R * 0.95);
    c.stroke();
    c.globalAlpha = 0.8;
    c.lineWidth = 2.6 * s;
    c.beginPath();
    c.moveTo(-R * 0.55, R * 0.22);
    c.quadraticCurveTo(0, R * 0.38, R * 0.55, R * 0.22);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = INK;
    c.beginPath(); c.arc(-R * 0.3, R * 0.32, 2.1 * s, 0, TAU); c.fill();
    c.restore();

    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, -R * 1.06, R * 0.5, 0, TAU);
    c.fill();

    c.save();
    c.translate(0, -R * 1.16);
    c.rotate(Math.sin(t * 1.6) * 0.04 - raise * 0.06
      + (stamped ? (1 - Math.min(1, st / 0.32)) * -0.07 : 0));
    c.beginPath();
    c.ellipse(0, 0, R * 1.06, R * 0.4, 0, 0, TAU);
    c.fill();
    c.globalAlpha = 0.45;
    c.strokeStyle = PAPER;
    c.lineWidth = 0.9 * s;
    c.beginPath();
    c.ellipse(0, -R * 0.06, R * 0.6, R * 0.19, 0, Math.PI * 1.08, Math.PI * 1.92);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, -R * 0.36, 1.7 * s, 0, TAU);
    c.fill();
    c.restore();

    if (awake > 0) {
      c.globalAlpha = 0.95 * awake;
      c.strokeStyle = PAPER;
      c.lineCap = 'round';
      c.lineWidth = 1.5 * s;
      const el = 2.4 * s;
      for (const sgn of [-1, 1]) {
        const xx = sgn * R * 0.21;
        c.beginPath();
        c.moveTo(xx - el / 2, -R * 0.9);
        c.lineTo(xx + el / 2, -R * 0.9);
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    const bl = R / (11 * u);
    const rec = stamped ? 1 - easeOutCubic(clamp01(st / 0.13)) : 0;
    const brushA = stamped ? 1.15 - rec * 2.8 : -0.55 - easeOutCubic(raise) * 1.1;
    const gripY = R * 0.05 - (stamped ? rec * 22 * u : easeOutCubic(raise) * 22 * u);
    c.save();
    c.translate(R * 0.42, gripY);
    c.rotate(brushA);
    c.strokeStyle = INK;
    c.lineCap = 'round';
    inkStroke(c, [
      { x: -R * 1.1, y: R * 0.12 },
      { x: -R * 0.72, y: R * 0.05 },
      { x: -R * 0.4, y: 0 },
    ], 4.2 * s, { alpha: 0.95, seed: sd ^ 11 });
    c.lineWidth = 3.2 * u * bl;
    c.beginPath();
    c.moveTo(-6 * u * bl, 0.3 * u * bl);
    c.quadraticCurveTo(6 * u * bl, -1.4 * u * bl, 20 * u * bl, -0.4 * u * bl);
    c.stroke();
    c.lineWidth = 4.6 * u * bl;
    c.beginPath();
    c.moveTo(19 * u * bl, -0.6 * u * bl);
    c.lineTo(23 * u * bl, -0.2 * u * bl);
    c.stroke();
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(23 * u * bl, -3.4 * u * bl);
    c.quadraticCurveTo(30 * u * bl, -2.6 * u * bl, 34 * u * bl, 0.2 * u * bl);
    c.quadraticCurveTo(29 * u * bl, 3.2 * u * bl, 23 * u * bl, 2.8 * u * bl);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.95;
    c.fillStyle = INK;
    blobPath(c, -1.5 * u * bl, -0.1 * u * bl, R * 0.23, sd ^ 7, 0.25, 8);
    c.fill();
    blobPath(c, 3.5 * u * bl, 0.15 * u * bl, R * 0.2, sd ^ 9, 0.25, 8);
    c.fill();
    c.globalAlpha = 1;
    c.restore();
  }

  function drawBeast(c, kind, x, y, r, tick, u, eyes) {
    const sd = (kind * 7919) ^ (tick * 13);
    c.save();
    c.translate(x, y);
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (kind === 0) {
      blobPath(c, 0, 0, r, sd, 0.15, 11);
      c.fill();
      eyeSlits(c, r, eyes);
    } else if (kind === 1) {
      c.rotate(-0.55);
      teardrop(c, r * 1.06);
      c.fill();
      c.rotate(0.55);
      eyeSlits(c, r * 0.9, eyes);
    } else {
      const breathe = 1 + Math.sin(tick * 0.7) * 0.025;
      c.scale(breathe, 1 / breathe);
      blobPath(c, 0, 0, r, sd, 0.13, 13);
      c.fill();
      eyeSlits(c, r, eyes);
    }
    c.restore();
  }

  /* ---------------- new art helpers ---------------- */
  function drawEnso(c, x, y, r, p, seed, alpha, u) {
    if (p <= 0) return;
    /* the ring's opening faces down-right, clear of the caption band */
    const a0 = -Math.PI * 0.30;
    const span = Math.PI * 1.86 * Math.min(1, p);
    const n = Math.max(8, Math.floor(96 * Math.min(1, p)));
    const rnd = mulberry(seed);
    const left = [], right = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = a0 + span * t;
      const press = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.04)), 0.42);
      const tail = t > 0.82 ? Math.max(0.1, 1 - (t - 0.82) / 0.18) : 1;
      const w = Math.max(0.9, r * 0.085 * press * tail * (0.94 + rnd() * 0.12));
      const cx = x + Math.cos(a) * r;
      const cy = y + Math.sin(a) * r;
      left.push({ x: cx + Math.cos(a) * w / 2, y: cy + Math.sin(a) * w / 2 });
      right.push({ x: cx - Math.cos(a) * w / 2, y: cy - Math.sin(a) * w / 2 });
    }
    c.save();
    c.globalAlpha = alpha;
    c.fillStyle = INK;
    c.beginPath();
    c.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) c.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
    c.closePath();
    c.fill();
    /* dry-brush registers through the thick body */
    c.globalAlpha = alpha * 0.42;
    c.strokeStyle = PAPER;
    c.lineCap = 'round';
    for (let k = -1; k <= 1; k += 2) {
      c.lineWidth = Math.max(0.7, r * 0.006);
      c.beginPath();
      for (let i = 0; i <= n; i += 2) {
        const t = i / n;
        const a = a0 + span * t;
        const rr = r + k * r * 0.022;
        const x2 = x + Math.cos(a) * rr, y2 = y + Math.sin(a) * rr;
        i === 0 ? c.moveTo(x2, y2) : c.lineTo(x2, y2);
      }
      c.stroke();
    }
    c.restore();

    /* the vermilion seal the brush lifts at the ring's head */
    if (p > 0.94) {
      const a = a0 + span;
      const hx = x + Math.cos(a) * r, hy = y + Math.sin(a) * r;
      const k = smooth(0.94, 1, p);
      c.save();
      c.translate(hx, hy);
      c.rotate(0.12);
      c.globalAlpha = alpha * k;
      c.fillStyle = RED;
      c.fillRect(-4 * u, -4 * u, 8 * u, 8 * u);
      c.restore();
    }
  }

  function drawScrollMontage(c, W, H, u, T) {
    if (T < P_SCROLLS0 - 0.05) return;
    const outFade = 1 - smooth(P_SCROLLS_END, P_SCROLLS_END + 0.45, T);
    if (outFade <= 0) return;
    const narrow = W < 620;
    const availW = Math.min(W * 0.86, 780 * u);
    const gap = narrow ? 6 * u : 11 * u;
    const cw = Math.min(narrow ? 74 * u : 104 * u, (availW - gap * (SIX.length - 1)) / SIX.length);
    const ch = Math.min(cw * 2.35, H * (narrow ? 0.30 : 0.36));
    const total = cw * SIX.length + gap * (SIX.length - 1);
    const x0 = W / 2 - total / 2;
    const baseY = H * (narrow ? 0.42 : 0.44) - ch / 2;

    /* the beam the scrolls hang from */
    const beamIn = smooth(P_SCROLLS0 - 0.4, P_SCROLLS0 + 0.5, T) * outFade;
    c.save();
    c.globalAlpha = 0.32 * beamIn;
    c.strokeStyle = INK;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(W / 2 - total / 2 - 26 * u, baseY - 16 * u);
    c.lineTo(W / 2 + total / 2 + 26 * u, baseY - 16 * u);
    c.stroke();
    c.restore();

    /* kicker above the shelf */
    const ka = smooth(P_SCROLLS0 - 0.25, P_SCROLLS0 + 0.45, T) * outFade;
    if (ka > 0) {
      c.save();
      c.globalAlpha = ka * 0.72;
      c.fillStyle = INK;
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      c.font = `500 ${Math.max(8, Math.round(9.5 * u))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(3.4 * u).toFixed(1)}px`; } catch (e) {}
      c.fillText('T H E   S I X   S C R O L L S', W / 2, baseY - 30 * u);
      try { c.letterSpacing = '0px'; } catch (e) {}
      c.restore();
    }

    for (let i = 0; i < SIX.length; i++) {
      const s = SIX[i];
      const st = P_SCROLLS0 + i * P_SCROLL_GAP;
      const p = smooth(st, st + 0.52, T);
      if (p <= 0) continue;
      const e = easeOutBack(p);
      const x = x0 + i * (cw + gap) + cw / 2;
      const y = baseY + ch / 2 + (1 - e) * 34 * u;
      const rot = (i % 2 ? 1 : -1) * 0.022 + (1 - p) * (i % 2 ? -0.12 : 0.12);
      const a = p * outFade;
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalAlpha = a;

      /* cord + nail */
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.globalAlpha = a * 0.5;
      c.beginPath();
      c.moveTo(0, -ch / 2);
      c.lineTo(0, baseY - y - 15 * u);
      c.stroke();
      c.globalAlpha = a;

      /* sheet */
      c.shadowColor = 'rgba(26,23,20,0.22)';
      c.shadowBlur = 12 * u;
      c.shadowOffsetY = 5 * u;
      c.fillStyle = s.paper;
      roughRect(c, cw, ch, 400 + i * 31, 0.014);
      c.fill();
      c.shadowColor = 'transparent';
      c.strokeStyle = s.ink;
      c.globalAlpha = a * 0.62;
      c.lineWidth = 1;
      c.stroke();
      c.globalAlpha = a;

      /* roman numeral */
      c.fillStyle = s.ink;
      c.globalAlpha = a * 0.52;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.font = `500 ${Math.max(6, Math.round(cw * 0.085))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(2.2 * u).toFixed(1)}px`; } catch (e) {}
      c.fillText('SCROLL ' + s.roman, 0, -ch / 2 + 12 * u);
      try { c.letterSpacing = '0px'; } catch (e) {}

      /* kanji */
      c.globalAlpha = a * 0.95;
      c.fillStyle = s.ink;
      c.textBaseline = 'middle';
      c.font = `400 ${Math.round(cw * 0.56)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
      c.fillText(s.kanji, 0, -ch * 0.08);

      /* its ink */
      c.globalAlpha = a * 0.6;
      c.font = `400 ${Math.max(6.5, Math.round(cw * 0.075))}px "IBM Plex Mono", monospace`;
      c.fillText(s.note.toUpperCase(), 0, ch * 0.17);

      /* name */
      c.globalAlpha = a * 0.92;
      c.font = `500 ${Math.max(6.5, Math.round(cw * 0.077))}px "IBM Plex Mono", monospace`;
      const words = s.name.split(' ');
      if (words.length > 1 && cw < 96 * u) {
        c.fillText(words.slice(0, Math.ceil(words.length / 2)).join(' '), 0, ch * 0.27);
        c.fillText(words.slice(Math.ceil(words.length / 2)).join(' '), 0, ch * 0.27 + cw * 0.09);
      } else {
        c.fillText(s.name, 0, ch * 0.27);
      }

      /* stamped seal */
      const sp = smooth(st + 0.30, st + 0.58, T);
      if (sp > 0) {
        const sc = 1.6 - 0.6 * sp;
        c.save();
        c.translate(0, ch / 2 - 18 * u);
        c.rotate(-0.06);
        c.scale(sc, sc);
        c.globalAlpha = a * 0.9;
        c.fillStyle = RED;
        sealPath(c, cw * 0.085, 700 + i, 0.07);
        c.fill();
        c.strokeStyle = 'rgba(237,231,217,0.9)';
        c.lineWidth = 1;
        sealPath(c, cw * 0.085 - 2.4 * u, 701 + i, 0.08);
        c.stroke();
        c.fillStyle = PAPER;
        c.font = `400 ${Math.round(cw * 0.10)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('印', 0, 0.5);
        c.restore();
      }
      c.restore();
    }

    /* the shelf's foot line */
    if (ka > 0) {
      c.save();
      c.globalAlpha = ka * 0.6;
      c.fillStyle = INK;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.font = `500 ${Math.max(7, Math.round(8.5 * u))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(2.6 * u).toFixed(1)}px`; } catch (e) {}
      c.fillText('TEN SCENES EACH · ONE GUARDIAN WAITS ON THE TENTH', W / 2, baseY + ch + 40 * u);
      try { c.letterSpacing = '0px'; } catch (e) {}
      c.restore();
    }
  }

  function drawCaption(c, W, H, u) {
    for (let ci = 0; ci < CAPTIONS.length; ci++) {
      const cp = CAPTIONS[ci];
      if (T < cp.t0 || T > cp.t1 + 0.38) continue;
      const fin = clamp01((T - cp.t0) / 0.42);
      const fout = clamp01((T - cp.t1) / 0.38);
      const a = fin * (1 - fout);
      if (a <= 0.01) continue;
      const rise = (1 - easeOutCubic(fin)) * 8 * u;
      /* clear the scroll shelf when it is on screen */
      const shelfOn = T > P_SCROLLS0 - 0.4 && T < P_SCROLLS_END + 0.7 && H < 620;
      const y = (shelfOn ? Math.max(H * 0.075, 46 * u) : Math.max(H * 0.105, 52 * u)) + rise;
      const seal = Math.max(18, 24 * u);
      const eSize = Math.max(8, Math.min(12.5, 9.6 * u));

      c.save();
      c.textBaseline = 'middle';
      c.font = `500 ${eSize}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(2.9 * u).toFixed(1)}px`; } catch (e) {}
      const tw = c.measureText(cp.en).width;
      const total = seal + 12 * u + tw;
      const x0 = W / 2 - total / 2;

      /* red seal with the chapter's kanji */
      c.globalAlpha = a * 0.92;
      c.fillStyle = RED;
      c.save();
      c.translate(x0 + seal / 2, y);
      c.rotate(-0.05);
      c.fillRect(-seal / 2, -seal / 2, seal, seal);
      c.fillStyle = PAPER;
      c.font = `400 ${Math.round(seal * 0.68)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
      c.textAlign = 'center';
      c.fillText(cp.kanji, 0, 0.5);
      c.restore();

      /* english line */
      c.globalAlpha = a * 0.86;
      c.fillStyle = INK;
      c.textAlign = 'left';
      c.fillText(cp.en, x0 + seal + 12 * u, y + 0.5);

      /* hairline */
      c.globalAlpha = a * 0.22;
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x0 + seal + 12 * u, y + seal * 0.55);
      c.lineTo(x0 + total, y + seal * 0.55);
      c.stroke();
      try { c.letterSpacing = '0px'; } catch (e) {}
      c.restore();
    }
  }

  function drawChapters(c, W, H, u) {
    if (T > P_RED + 0.3) return;
    const a = smooth(0.5, 1.1, T) * (1 - smooth(P_RED, P_RED + 0.3, T));
    if (a <= 0.01) return;
    /* land the chrome above the cinema bar, not under it */
    const bar = G.S.reduced ? 0 : Math.round(H * 0.074);
    const y = H - bar - Math.max(20 * u, 17 * u);
    if (y < H * 0.34) return;   /* on squat viewports the shelf owns the foot */
    const gap = 15 * u;
    const x0 = W / 2 - gap * (CHAPTERS.length - 1) / 2;
    for (let i = 0; i < CHAPTERS.length; i++) {
      const ch = CHAPTERS[i];
      const next = CHAPTERS[i + 1];
      const passed = T >= ch.at;
      const current = passed && (!next || T < next.at);
      const x = x0 + i * gap;
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI / 4);
      const sz = current ? 5.2 * u : 3.6 * u;
      c.globalAlpha = a * (current ? 0.95 : passed ? 0.58 : 0.2);
      c.fillStyle = current ? RED : INK;
      c.fillRect(-sz / 2, -sz / 2, sz, sz);
      c.restore();
    }
    /* the current chapter's name */
    let ci = 0;
    for (let i = 0; i < CHAPTERS.length; i++) if (T >= CHAPTERS[i].at) ci = i;
    const label = CHAPTERS[ci];
    c.save();
    c.globalAlpha = a * 0.5;
    c.fillStyle = INK;
    c.textAlign = 'center';
    c.textBaseline = 'bottom';
    c.font = `500 ${Math.max(6.5, Math.round(7.4 * u))}px "IBM Plex Mono", monospace`;
    try { c.letterSpacing = `${(2.4 * u).toFixed(1)}px`; } catch (e) {}
    c.fillText(`${label.k}  ·  ${label.en}`, W / 2, y - 14 * u);
    try { c.letterSpacing = '0px'; } catch (e) {}
    c.restore();
  }

  function drawWordmark(c, W, H, u) {
    const local = T - P_TITLE;
    if (local < 0) return;
    const size = Math.min(W * 0.152, H * 0.20, 190 * u);
    const word = 'ONE MORE';
    const font = `400 ${Math.round(size)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", Georgia, serif`;
    c.save();
    c.font = font;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const spaced = size * 0.045;
    let total = 0;
    const widths = [];
    for (const ch of word) {
      const w = c.measureText(ch).width;
      widths.push(w);
      total += w + spaced;
    }
    total -= spaced;
    const x0 = W / 2 - total / 2;
    const y = H * 0.455;
    try { c.letterSpacing = '0px'; } catch (e) {}
    c.fillStyle = PAPER;
    let x = x0;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const p = clamp01((local - i * 0.038) / 0.42);
      if (p > 0) {
        const e = easeOutCubic(p);
        c.globalAlpha = e * 0.96;
        c.fillText(ch, x, y + (1 - e) * 18 * u + (ch === ' ' ? 0 : 0));
      }
      x += widths[i] + spaced;
    }

    /* subtitle */
    const sp = clamp01((local - 0.42) / 0.5);
    if (sp > 0) {
      c.globalAlpha = sp * 0.72;
      c.fillStyle = PAPER;
      c.textAlign = 'center';
      c.font = `500 ${Math.max(8, Math.round(10 * u))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(4.4 * u).toFixed(1)}px`; } catch (e) {}
      c.fillText('A  M O N O C H R O M E  S U R V I V A L', W / 2, y + size * 0.72);
      try { c.letterSpacing = '0px'; } catch (e) {}

      /* hairlines flanking the subtitle */
      c.globalAlpha = sp * 0.34;
      c.strokeStyle = PAPER;
      c.lineWidth = 1;
      const lineY = y + size * 0.72 - Math.max(4, 5 * u);
      c.beginPath();
      c.moveTo(W / 2 - W * 0.20, lineY);
      c.lineTo(W / 2 - W * 0.055, lineY);
      c.moveTo(W / 2 + W * 0.055, lineY);
      c.lineTo(W / 2 + W * 0.20, lineY);
      c.stroke();
    }

    /* the seal beneath the word */
    const lp = clamp01((local - 0.72) / 0.35);
    if (lp > 0) {
      c.save();
      c.translate(W / 2, y + size * 0.98);
      c.rotate(-0.05);
      c.scale(1.5 - 0.5 * lp, 1.5 - 0.5 * lp);
      c.globalAlpha = lp;
      c.fillStyle = 'rgba(19,16,9,0.22)';
      c.fillRect(-19 * u, -19 * u, 38 * u, 38 * u);
      c.strokeStyle = PAPER;
      c.lineWidth = 1.4 * u;
      c.strokeRect(-15.5 * u, -15.5 * u, 31 * u, 31 * u);
      c.fillStyle = PAPER;
      c.font = `400 ${Math.round(22 * u)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('墨', 0, 0.5);
      c.restore();
    }

    /* the run's promise, pressed under the seal */
    const fp = clamp01((local - 1.0) / 0.5);
    if (fp > 0) {
      const fy = y + size * 1.22;
      c.globalAlpha = fp * 0.66;
      c.fillStyle = PAPER;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `500 ${Math.max(6.8, Math.round(7.8 * u))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(2.5 * u).toFixed(1)}px`; } catch (e) {}
      c.fillText('ONE BRUSH  ·  SIX SCROLLS  ·  SIXTY SCENES  ·  SIX GUARDIANS', W / 2, fy);
      try { c.letterSpacing = '0px'; } catch (e) {}
      c.globalAlpha = fp * 0.34;
      c.strokeStyle = PAPER;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(W / 2 - W * 0.19, fy + 14 * u);
      c.lineTo(W / 2 + W * 0.19, fy + 14 * u);
      c.stroke();
    }
    c.restore();
  }

  /* ---------------- master draw ---------------- */
  function draw(ctx, t) {
    if (!live) return;
    const S = G.S;
    const W = S.W, H = S.H, dpr = S.dpr;
    if (!W || !H) return;
    const u = Math.min(W, H) / 800;
    const tick = Math.floor(T / 0.115);
    const ix = W / 2, iy = H * 0.46;

    ensurePaper(W, H, dpr);
    ensurePaintings();
    if (planW !== W || planH !== H) { plan(W, H); planW = W; planH = H; }

    ctx.save();
    if (shakeAmp > 0.3 && !S.reduced) {
      ctx.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);
    }
    const cam = S.reduced ? 1 : 1 + 0.045 * easeInOut(clamp01(T / P_SLAM));
    ctx.save();
    ctx.translate(W / 2, H * 0.55);
    ctx.scale(cam, cam);
    ctx.translate(-W / 2, -H * 0.55);

    /* ===== void ===== */
    ctx.fillStyle = VOID;
    ctx.fillRect(-40, -40, W + 80, H + 80);

    /* dust */
    const moteFade = smooth(0, 0.9, T) * (1 - smooth(P_FLOOD, P_FLOOD + 0.7, T));
    if (moteFade > 0) {
      ctx.fillStyle = PAPER;
      for (const m of motes) {
        ctx.globalAlpha = m.a * moteFade;
        ctx.beginPath();
        ctx.arc(m.x * W + Math.sin(T * m.s + m.p) * 16 * u, m.y * H + Math.cos(T * m.s * 0.8 + m.p) * 10 * u, m.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* ===== the unrolling hairline & the hanging brush ===== */
    if (T < P_FLOOD + 0.5) {
      const unroll = easeInOut(clamp01(T / 0.95));
      ctx.save();
      ctx.globalAlpha = 0.24 * (1 - smooth(0.8, 1.8, T));
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 1.2 * u;
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.14);
      ctx.lineTo(W / 2, H * (0.14 + 0.62 * unroll));
      ctx.stroke();
      ctx.restore();

      /* the tool hangs where the drop gathers — the hand before the mark */
      const toolIn = smooth(0.12, 0.75, T) * (1 - smooth(P_FLOOD - 0.15, P_FLOOD + 0.4, T));
      if (toolIn > 0) {
        const sway = Math.sin(T * 1.25) * 0.028;
        drawTool(ctx, W / 2 + 7 * u, H * 0.585 - 5 * u * unroll, Math.min(W * 0.20, 170 * u), -1.16 + sway, toolIn * 0.5, u);
      }
    }

    /* ===== the drop ===== */
    if (T < P_IMPACT) {
      let dx = ix, dy = H * 0.30, r = 8 * u, stretch = 1, alpha = 1;
      if (T < P_FALL) {
        const p = clamp01((T - P_DROP_FORM) / (P_FALL - P_DROP_FORM));
        const gath = easeOutCubic(p);
        r = (3 + 7 * gath) * u;
        alpha = 0.25 + 0.75 * gath;
        dx += Math.sin(T * 19) * 1.6 * u * (1 - p * 0.55);
        if (gath > 0.05) {
          const hg = ctx.createRadialGradient(dx, dy, 0, dx, dy, r * 4.4);
          hg.addColorStop(0, `rgba(${PAPER_RGB},${0.15 * gath})`);
          hg.addColorStop(1, `rgba(${PAPER_RGB},0)`);
          ctx.fillStyle = hg;
          ctx.fillRect(dx - r * 4.4, dy - r * 4.4, r * 8.8, r * 8.8);
        }
      } else {
        const p = clamp01((T - P_FALL) / (P_IMPACT - P_FALL));
        dy = H * 0.30 + (iy - H * 0.30) * easeInCubic(p);
        stretch = 1 + 1.9 * p;
        for (let k = 1; k <= 3; k++) {
          const ep = clamp01(p - k * 0.075);
          if (ep <= 0) break;
          ctx.save();
          ctx.translate(dx, H * 0.30 + (iy - H * 0.30) * easeInCubic(ep));
          ctx.rotate(-Math.PI / 2);
          ctx.scale(1 + 1.9 * ep, 1 / (1 + 1.9 * ep));
          ctx.globalAlpha = 0.15 * (1 - k * 0.24);
          ctx.fillStyle = PAPER;
          teardrop(ctx, 7.5 * u);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(-Math.PI / 2);
      ctx.scale(stretch, 1 / stretch);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PAPER;
      teardrop(ctx, r);
      ctx.fill();
      ctx.restore();
    }

    /* ===== impact ===== */
    if (T >= P_IMPACT) {
      const it = T - P_IMPACT;
      if (it < 0.4 && shakeAmp < 1) shakeAmp = 11 * (1 - it / 0.4);
      const fade = clamp01(1 - it / 1.3);
      if (fade > 0) {
        splatPaint(ctx, ix, iy, 30 * u, 4242, 0.9 * fade, PAPER);
        for (let k = 0; k < 2; k++) {
          const rp = clamp01((it - k * 0.12) / 1.05);
          if (rp <= 0 || rp >= 1) continue;
          ctx.save();
          ctx.strokeStyle = PAPER;
          ctx.globalAlpha = 0.45 * (1 - rp) * fade;
          ctx.lineWidth = 2.2 * u;
          blobPath(ctx, ix, iy, rp * (140 + k * 60) * u, 500 + k, 0.05, 22);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    /* ===== paper flood, paintings, captions, action ===== */
    if (T >= P_FLOOD) {
      const fp = clamp01((T - P_FLOOD) / (P_FLOOD_END - P_FLOOD));
      const floodR = easeOutCubic(fp) * Math.hypot(W, H) * 0.64;
      const segs = 76;

      ctx.save();
      if (fp < 1) {
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * TAU;
          const wob = Math.sin(a * 5 + T * 2.1) * 5 * u + Math.sin(a * 11 - T * 1.4) * 3 * u;
          const x = ix + Math.cos(a) * (floodR + wob);
          const y = iy + Math.sin(a) * (floodR + wob);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.clip();
      }
      ctx.drawImage(paperC, 0, 0, W, H);

      /* the wash paintings arrive with the paper */
      const pa = smooth(P_PAINT, P_PAINT + 1.5, T);
      if (pa > 0) {
        /* a slow revealing push: the mountains come forward as the film breathes */
        const push = 0.965 + 0.075 * easeInOut(clamp01(T / P_SLAM));
        drawWash(ctx, 'cliff', 0.82 * pa, W, H, push, 0, 0.012);
        const ga = smooth(P_SCROLLS0 - 0.6, P_SCROLLS0 + 0.8, T) * (1 - smooth(P_SCROLLS_END, P_SCROLLS_END + 1.1, T));
        if (ga > 0) drawWash(ctx, 'guo', 0.26 * ga, W, H, 1.05, 0, 0.09);
        const wa = smooth(P_POOLS - 1.6, P_POOLS + 0.6, T) * (1 - smooth(P_SLAM, P_SLAM + 0.5, T));
        if (wa > 0) drawWash(ctx, 'waves', 0.2 * wa, W, H, 1.06, 0.03, 0.03);
        /* a faint horizon wash gives the composition depth */
        const hg = ctx.createLinearGradient(0, H * 0.5, 0, H);
        hg.addColorStop(0, 'rgba(112,102,80,0)');
        hg.addColorStop(0.62, `rgba(112,102,80,${(0.035 * pa).toFixed(3)})`);
        hg.addColorStop(1, 'rgba(112,102,80,0)');
        ctx.fillStyle = hg;
        ctx.fillRect(0, H * 0.5, W, H * 0.5);
      }
      ctx.restore();

      /* flood rim */
      if (fp < 1) {
        ctx.save();
        ctx.strokeStyle = PAPER;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2.6 * u;
        ctx.beginPath();
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * TAU;
          const wob = Math.sin(a * 5 + T * 2.1) * 5 * u + Math.sin(a * 11 - T * 1.4) * 3 * u;
          const x = ix + Math.cos(a) * (floodR + wob), y = iy + Math.sin(a) * (floodR + wob);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 9 * u;
        ctx.stroke();
        ctx.restore();

        for (const s of satellite) {
          const dTarget = s.d * Math.hypot(W, H) * 0.64;
          if (floodR < dTarget) continue;
          const ap = clamp01((floodR - dTarget) / (40 * u));
          splatPaint(ctx, ix + Math.cos(s.a) * dTarget, iy + Math.sin(s.a) * dTarget, s.r, s.seed, 0.85 * ap, PAPER);
        }
      }

      drawCaption(ctx, W, H, u);
      drawScrollMontage(ctx, W, H, u, T);

      /* ===== the three strokes ===== */
      for (const s of strokes) {
        const p = clamp01((T - s.t0) / s.dur);
        if (p <= 0) continue;
        const pe = easeOutQuad(p);
        const seg = slicePts(s.pts, pe);
        inkStroke(ctx, seg, s.w, { alpha: 0.94, seed: s.seed, dry: true });
        if (p < 1) {
          const tip = seg[seg.length - 1];
          const back = seg[Math.max(0, seg.length - 3)];
          ctx.save();
          ctx.translate(tip.x, tip.y);
          ctx.rotate(Math.atan2(tip.y - back.y, tip.x - back.x));
          ctx.globalAlpha = 0.95;
          ctx.fillStyle = INK;
          teardrop(ctx, s.w * 0.5);
          ctx.fill();
          ctx.restore();
        }
        drawFlicks(ctx, s, u);
      }

      /* ===== the ensō: one brush, one breath (the film's centrepiece) ===== */
      const ensoP = clamp01((T - P_STROKES[0]) / 1.95);
      if (ensoP > 0) {
        const ex = W * 0.5, ey = H * 0.415;
        const er = Math.min(W * 0.255, H * 0.198);
        const press = 1 + 0.03 * clamp01(1 - Math.abs(T - P_SLAM) / 0.35);
        drawEnso(ctx, ex, ey, er * press, ensoP, 8211, 0.74, u);
        /* the brush tip, still in the stroke's head */
        if (ensoP < 1) {
          const a0 = -Math.PI * 0.30;
          const head = a0 + Math.PI * 1.86 * ensoP;
          ctx.save();
          ctx.translate(ex + Math.cos(head) * er, ey + Math.sin(head) * er);
          ctx.rotate(head + Math.PI / 2);
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = INK;
          blobPath(ctx, 0, 0, Math.max(2.6, er * 0.035), 7311 + tick, 0.2, 8);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(2, er * 0.028);
          ctx.beginPath();
          ctx.moveTo(0, -er * 0.03);
          ctx.lineTo(er * 0.34, -er * 0.16);
          ctx.stroke();
          ctx.restore();
        }
      }

      /* ===== pools & beasts — the horde beneath the ring ===== */
      if (T >= P_POOLS) {
        const beastFade = 1 - smooth(P_GATHER - 0.35, P_STAND + 0.30, T);
        const pools = [
          { x: W * 0.235, y: H * 0.795, r: 24 * u },
          { x: W * 0.50, y: H * 0.835, r: 29 * u },
          { x: W * 0.765, y: H * 0.785, r: 26 * u },
        ];
        const eyes = clamp01((T - P_EYES) / 0.6);
        for (let k = 0; k < pools.length; k++) {
          const pl = pools[k];
          if (beastFade <= 0.01) break;
          const grow = easeOutCubic(clamp01((T - P_POOLS - k * 0.14) / 0.6));
          if (grow > 0) splatPaint(ctx, pl.x, pl.y, pl.r * grow, 3000 + k * 77, 0.6 * grow * beastFade, INK);
          const rp = clamp01((T - P_RISE - k * 0.2) / 1.15);
          if (rp <= 0) continue;
          const rs = easeOutBack(rp);
          const lift = easeOutCubic(rp) * 38 * u;
          ctx.save();
          ctx.globalAlpha = clamp01(rp * 1.6) * beastFade;
          drawBeast(ctx, k, pl.x, pl.y - lift, pl.r * 1.02 * rs, tick + k * 3, u, eyes);
          ctx.restore();
        }
      }

      /* ===== spirit, ensō, seal ===== */
      if (T >= P_GATHER) {
        const gp = clamp01((T - P_GATHER) / (P_STAND - P_GATHER));
        const raise = clamp01((T - P_STAND) / 0.85);
        const awake = clamp01((T - P_AWAKE) / 0.4);
        const rp = clamp01((T - P_STAMP) / (P_SLAM - P_STAMP));
        const stamped = T >= P_SLAM;
        const st = stamped ? T - P_SLAM : 0;
        const slamT = clamp01(st / 0.32);
        const press = stamped ? easeOutCubic(clamp01(st / 0.15)) : 0;
        if (stamped && !sealSlammed) { sealSlammed = true; shakeAmp = 13; }

        const gy = H * 0.545;
        const lift = easeOutCubic(gp) * 34 * u;
        const ring = Math.min(W * 0.255, H * 0.198);
        const bodyR = Math.min(46 * u, ring * 0.365) * (0.3 + 0.7 * easeOutBack(gp));
        const K = 1.95;
        const duck = stamped ? (1 - easeOutCubic(slamT)) * 13 * u : -5 * u * rp;
        const sqx = 1 + (stamped ? (1 - slamT) * 0.16 : -rp * 0.05);
        const sqy = 1 - (stamped ? (1 - slamT) * 0.14 : -rp * 0.08);
        const scribeY = gy - lift + duck;

        if (gp < 1) splatPaint(ctx, ix, gy + 30 * u, 50 * u * (0.35 + 0.65 * gp), 4321, 0.72 * (1 - gp * 0.45), INK);

        /* the ring presses a breath darker as the spirit takes its place */
        const ringIn = smooth(P_STAND - 0.2, P_STAND + 0.55, T) * 0.12;
        if (ringIn > 0) {
          drawEnso(ctx, W * 0.5, H * 0.415, Math.min(W * 0.255, H * 0.198), 1, 8211, ringIn, u);
        }

        ctx.save();
        ctx.translate(ix, scribeY);
        ctx.scale(sqx, sqy);
        drawScribe(ctx, u, { R: bodyR * K, raise: rp, awake, stamped, st, t: T, tick });
        ctx.restore();

        if (!stamped && awake > 0) {
          inkStroke(ctx, [
            { x: ix - bodyR * K * 0.55, y: gy - lift - bodyR * K * 1.35 },
            { x: ix - bodyR * K * 1.1, y: gy - lift - bodyR * K * 1.9 + Math.sin(T * 3) * 2 * u },
          ], 2 * u, { alpha: 0.3 * awake });
        }

        /* the hanko */
        if (stamped) {
          const sz = Math.min(W, H) * 0.105;
          const hx = ix + bodyR * K * 1.55;
          const hy = scribeY + bodyR * K * 1.02 + sz * 0.42;
          const s = 1.3 - 0.3 * press;
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(-0.09);
          ctx.scale(s, s);
          ctx.globalAlpha = 0.96 * press;
          ctx.fillStyle = RED;
          sealPath(ctx, sz / 2, 777, 0.055);
          ctx.fill();
          ctx.strokeStyle = 'rgba(237,231,217,0.9)';
          ctx.lineWidth = 1.6 * u;
          sealPath(ctx, sz / 2 - 6.5 * u, 778, 0.07);
          ctx.stroke();
          ctx.fillStyle = PAPER;
          ctx.font = `${Math.round(sz * 0.68)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('一', 0, sz * 0.04);
          ctx.restore();

          const fa = clamp01(1 - st / 1.0);
          if (fa > 0) {
            for (const ss of sealSplats) {
              splatPaint(ctx, hx + Math.cos(ss.a) * sz * ss.d, hy + Math.sin(ss.a) * sz * ss.d, ss.r, ss.seed, 0.82 * fa, RED);
            }
          }
        }
      }

      /* vignette */
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.74);
      vg.addColorStop(0, 'rgba(58,52,40,0)');
      vg.addColorStop(1, 'rgba(58,52,40,0.17)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore(); /* camera */
    ctx.restore(); /* shake */

    /* ===== vermilion bleed & wordmark ===== */
    if (!skipping && T > P_RED) {
      const sz = Math.min(W, H) * 0.105;
      const bx = Math.min(46 * u, Math.min(W * 0.255, H * 0.198) * 0.365) * 1.95;
      const sx = ix + bx * 1.55;
      const sy = H * 0.545 - 34 * u + bx * 1.02 + sz * 0.42;
      const maxR = 1.03 * Math.max(
        Math.hypot(sx, sy), Math.hypot(W - sx, sy),
        Math.hypot(sx, H - sy), Math.hypot(W - sx, H - sy)
      );

      const rp = clamp01((T - P_RED) / 0.64);
      if (rp > 0) {
        const rr = easeOutCubic(rp) * maxR;
        ctx.save();
        ctx.beginPath();
        const segs = 76;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * TAU;
          const wob = Math.sin(a * 4 + T * 2.4) * 7 * u + Math.sin(a * 9 - T * 1.7) * 4 * u;
          const x = sx + Math.cos(a) * (rr + wob), y = sy + Math.sin(a) * (rr + wob);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = RED;
        ctx.fill();
        if (rp < 1) {
          ctx.strokeStyle = `rgba(${PAPER_RGB},0.65)`;
          ctx.lineWidth = 2.4 * u;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${PAPER_RGB},0.18)`;
          ctx.lineWidth = 8 * u;
          ctx.stroke();
          for (const s of redEdge) {
            const dT = s.d * maxR;
            if (rr < dT) continue;
            const ap = clamp01((rr - dT) / (46 * u));
            splatPaint(ctx, sx + Math.cos(s.a) * dT, sy + Math.sin(s.a) * dT, s.r, s.seed, 0.85 * ap, RED);
          }
        }
        ctx.restore();
      }

      /* subtle darker brush current inside the red */
      if (rp >= 1) {
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = '#7d2419';
        ctx.lineWidth = 44 * u;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i++) {
          const yy = H * (0.2 + i * 0.2);
          ctx.beginPath();
          ctx.moveTo(-40, yy + Math.sin(T * 0.5 + i) * 20 * u);
          ctx.bezierCurveTo(W * 0.3, yy - 40 * u, W * 0.7, yy + 50 * u, W + 40, yy - 10 * u);
          ctx.stroke();
        }
        ctx.restore();
      }

      drawWordmark(ctx, W, H, u);

      /* pale washi floods back */
      const wp = clamp01((T - P_WASH) / 0.78);
      if (wp > 0) {
        const wr = easeOutCubic(wp) * Math.hypot(W, H) * 0.64;
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= 76; i++) {
          const a = (i / 76) * TAU;
          const wob = Math.sin(a * 5 + T * 2.0) * 6 * u + Math.sin(a * 11 - T * 1.3) * 3 * u;
          const x = W / 2 + Math.cos(a) * (wr + wob), y = H * 0.52 + Math.sin(a) * (wr + wob);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(paperC, 0, 0, W, H);
        /* the title's own wash returns with the paper */
        drawWash(ctx, 'cliff', 0.32 * wp, W, H, 1.02, 0, 0.02);
        if (wp < 1) {
          ctx.strokeStyle = 'rgba(178,58,43,0.5)';
          ctx.lineWidth = 2.2 * u;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* chapter diamonds & label */
    drawChapters(ctx, W, H, u);

    /* ===== cinema bars & supers ===== */
    if (!S.reduced) {
      const aIn = easeInOut(clamp01((T - 0.1) / 1.1));
      const aOut = 1 - clamp01((T - (P_RED + 0.1)) / 0.5);
      const a = Math.min(aIn, aOut);
      if (a > 0) {
        const bh = Math.round(H * 0.074);
        ctx.fillStyle = `rgba(8,6,4,${(0.96 * a).toFixed(3)})`;
        ctx.fillRect(0, 0, W, bh);
        ctx.fillRect(0, H - bh, W, bh);

        const fs = Math.max(6.5, Math.round(7.8 * u));
        ctx.save();
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = PAPER;
        ctx.font = `500 ${fs}px "IBM Plex Mono", monospace`;
        ctx.textBaseline = 'middle';
        try { ctx.letterSpacing = `${(2.6 * u).toFixed(1)}px`; } catch (e) {}
        ctx.textAlign = 'left';
        ctx.fillText('O N E  M O R E', 22 * u, bh / 2 + 0.5);
        ctx.textAlign = 'right';
        const now = CHAPTERS.reduce((acc, ch) => (T >= ch.at ? ch : acc), CHAPTERS[0]);
        ctx.fillText('序  ·  T H E  O P E N I N G  ·  ' + now.en, W - 22 * u, bh / 2 + 0.5);
        ctx.textAlign = 'left';
        ctx.globalAlpha = a * 0.42;
        ctx.fillText('A  M O N O C H R O M E  S U R V I V A L', 22 * u, H - bh / 2 + 0.5);
        ctx.textAlign = 'right';
        ctx.fillText('S I X  S C R O L L S  ·  S I X T Y  S C E N E S', W - 22 * u, H - bh / 2 + 0.5);
        try { ctx.letterSpacing = '0px'; } catch (e) {}
        ctx.restore();
      }
    }

    /* ===== skip wash ===== */
    if (skipping) {
      const overA = clamp01(skipT / 0.34);
      if (overA > 0) {
        ctx.fillStyle = `rgba(237,231,217,${overA})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  return {
    start, skip, update, draw, paintGate,
    seek(t) {
      if (!live) return;
      T = Math.max(0, t);
      skipping = false; skipT = 0;
      sealSlammed = T >= P_SLAM;
    },
    get onEnd() { return onEnd; },
    set onEnd(fn) { onEnd = fn; },
    isLive: () => live,
  };
})();
