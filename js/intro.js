'use strict';
/* ============================================================
   ONE MORE — THE OPENING SCENE
   A skippable ink cinematic before the title: a single drop
   falls through the void, bursts, and floods into a sheet of
   washi. A brush cuts strokes, the ink begins to move — and
   then the ink stands up as the scribe: the same kasa-hatted
   figure who paints the title ring and walks the sheets wakes
   here, raises the brush in both hands, and stamps the first
   mark onto the paper. Rendered entirely on canvas with the
   game's ink language.
   ============================================================ */

const INTRO = (() => {
  const INK = '#1a1714';
  const PAPER = '#ede7d9';
  const RED = '#b23a2b';
  const VOID = '#131009';
  const TAU = Math.PI * 2;

  /* ---------------- timeline ---------------- */
  const T_DROP_FORM = 0.45;   // the drop begins to gather
  const T_FALL = 1.7;         // the drop lets go
  const T_IMPACT = 2.45;      // the drop bursts
  const T_FLOOD = 2.75;       // the paper floods outward
  const T_FLOOD_END = 5.2;
  const T_STROKES = [5.3, 6.95, 8.85];  // three strokes, staggered
  const T_POOLS = 10.1;       // ink pools bloom
  const T_RISE = 10.55;       // the beasts rise
  const T_EYES = 11.95;       // the eyes open
  const T_GATHER = 13.9;      // the ink gathers one last time
  const T_STAND = 14.45;      // the spirit stands
  const T_AWAKE = 14.9;       // its eye opens
  const T_STAMP = 15.75;      // it raises the brush
  const T_SLAM = 16.1;        // the mark lands
  const T_FADE = 17.0;        // fade to paper
  const DUR = 17.55;          // handoff

  const CAPTIONS = [
    { kanji: '墨', en: 'IN THE BEGINNING, THERE WAS INK.', t0: 3.9, t1: 6.1 },
    { kanji: '紙', en: 'THEN A SHEET THAT REMEMBERS EVERY STROKE.', t0: 6.5, t1: 8.7 },
    { kanji: '筆', en: 'ONE BRUSH WAS CUT FROM THE REED.', t0: 9.0, t1: 11.1 },
    { kanji: '生', en: 'AND THE INK BEGAN TO MOVE.', t0: 11.4, t1: 13.4 },
  ];

  /* ---------------- state ---------------- */
  let T = 0;
  let live = false;
  let ended = false;
  let skipping = false;
  let skipT = 0;
  let onEnd = null;

  /* per-run precomputed art */
  let strokes = [];      // { pts, w, t0, dur, flicks[] }
  let satellite = [];    // paper splats ahead of the flood edge
  let sealSplats = [];   // red splatter around the slam
  let motes = [];        // dust breathing in the void
  let shakeAmp = 0;
  let sealSlammed = false;
  let planW = 0, planH = 0;

  /* paper canvas cache */
  let paperC = null, paperW = 0, paperH = 0, paperDpr = 0;

  /* ---------------- tiny math ---------------- */
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
  const easeInCubic = p => p * p * p;
  const easeOutQuad = p => 1 - (1 - p) * (1 - p);
  const easeOutBack = p => { const c = 1.55; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

  function mulberry(s) {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------- ink primitives (local copies, self-contained) --------------- */
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
    if (pts.length < 2) return;
    const n = pts.length;
    const seed = o.seed ?? 7;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const q = pts[Math.min(n - 1, i + 1)], r0 = pts[Math.max(0, i - 1)];
      let dx = q.x - r0.x, dy = q.y - r0.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const t = i / (n - 1);
      /* calligraphic pressure: confident press-in, full body, lifted dry tail */
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
    /* rounded press-in entry, so the stroke never starts on a ruler cut */
    c.beginPath();
    c.arc(pts[0].x, pts[0].y, Math.max(0.5, (left[0].x - right[0].x) * (left[0].x - right[0].x) + (left[0].y - right[0].y) * (left[0].y - right[0].y)) ** 0.5 / 2, 0, TAU);
    c.fill();
    /* dry-brush: paper streaks through the lifted tail */
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

  /* a hand-cut square seal: four wobbled edges instead of a ruler */
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

  /* angry paper eyes: two mirrored slits knitted down toward the centre */
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

  /* quadratic curve sampled into a smoothly-wandering line */
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

  /* slice a stroke by progress p (0..1) for progressive drawing */
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

  /* ---------------- washi paper (screen-sized, cached) ---------------- */
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

    /* laid lines */
    p.lineWidth = 1;
    p.strokeStyle = 'rgba(50,45,36,0.035)';
    for (let y = 4; y < H; y += 8) {
      p.beginPath(); p.moveTo(0, y + (rnd() - 0.5)); p.lineTo(W, y + (rnd() - 0.5)); p.stroke();
    }
    /* fibers */
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
    /* speckles */
    const dots = Math.round((W * H) / 2400);
    for (let i = 0; i < dots; i++) {
      p.fillStyle = `rgba(50,45,36,${0.02 + rnd() * 0.05})`;
      p.beginPath();
      p.arc(rnd() * W, rnd() * H, 0.3 + rnd() * 0.8, 0, TAU);
      p.fill();
    }
    /* broad faint washes */
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

  /* ---------------- run setup ---------------- */
  function plan(W, H) {
    const u = Math.min(W, H) / 800;
    const rnd = mulberry((Math.random() * 1e9) | 0);

    /* three calligraphic sweeps across the upper sheet */
    strokes = [
      {
        pts: curvePts(W * 0.10, H * 0.315, W * 0.52, H * 0.385, W * 0.90, H * 0.245, 30, 9 * u, 11),
        w: 26 * u, t0: T_STROKES[0], dur: 1.55, seed: 101,
      },
      {
        pts: curvePts(W * 0.88, H * 0.50, W * 0.50, H * 0.435, W * 0.12, H * 0.47, 30, 7 * u, 22),
        w: 19 * u, t0: T_STROKES[1], dur: 1.55, seed: 202,
      },
      {
        pts: curvePts(W * 0.30, H * 0.175, W * 0.52, H * 0.145, W * 0.72, H * 0.19, 20, 5 * u, 33),
        w: 12 * u, t0: T_STROKES[2], dur: 0.85, seed: 303,
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

    /* paper splats that tear through as the flood passes */
    satellite = [];
    for (let i = 0; i < 7; i++) {
      satellite.push({
        a: rnd() * TAU,
        d: 0.28 + rnd() * 0.6,          // fraction of flood radius
        r: (5 + rnd() * 10) * u,
        seed: 1000 + i,
      });
    }

    /* red splatter around the seal slam */
    sealSplats = [];
    for (let i = 0; i < 5; i++) {
      sealSplats.push({
        a: rnd() * TAU, d: (0.55 + rnd() * 0.5),
        r: (9 + rnd() * 16) * u, seed: 2000 + i,
      });
    }

    /* dust motes breathing in the void */
    motes = [];
    for (let i = 0; i < 30; i++) {
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
    /* warm the display faces so the captions land crisp */
    try {
      if (document.fonts) {
        document.fonts.load('80px "Zen Antique"');
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

  function update(dt) {
    if (!live || ended) return;
    T += dt;
    if (shakeAmp > 0) shakeAmp = Math.max(0, shakeAmp - dt * 34);
    if (skipping) {
      skipT += dt;
      if (skipT >= 0.32) { finish(); return; }
    }
    if (T >= DUR) finish();
  }

  /* flick droplets after a stroke completes */
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

  /* the scribe — the same kasa-hatted figure who paints the title
     ring and walks the sheets, reborn here in the film's ink */
  function drawScribe(c, u, o) {
    const R = o.R;
    if (R < 2) return;
    const s = R / 10;                    /* in-game absolute-px scaler (r 10) */
    const t = o.t || 0;
    const raise = o.raise || 0;
    const awake = o.awake || 0;
    const stamped = !!o.stamped;
    const st = o.st || 0;
    const sd = 991 ^ ((o.tick || 0) * 3);

    /* a soft ink shadow grounds the figure */
    c.save();
    c.scale(1, 0.4);
    c.globalAlpha = 0.16;
    c.fillStyle = INK;
    blobPath(c, 0, R * 1.62, R * 0.98, sd ^ 3, 0.2, 9);
    c.fill();
    c.restore();

    /* the robe — a brush-cut cone, hem bitten ragged, breathing */
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
    /* dry creases down the robe */
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
    /* the obi — a pale sash at the waist, knot at the back */
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

    /* the head */
    c.fillStyle = INK;
    c.beginPath();
    c.arc(0, -R * 1.06, R * 0.5, 0, TAU);
    c.fill();

    /* the kasa — a wide shallow hat, rocking; it dips to the slam */
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

    /* the eyes — two pale slits under the brim, opening as it wakes */
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

    /* the held brush: slung at rest, raised high, slammed tip-down;
       the sleeve reaches along the shaft and both hands grip it */
    const bl = R / (11 * u);
    const rec = stamped ? 1 - easeOutCubic(clamp01(st / 0.13)) : 0;
    const brushA = stamped ? 1.15 - rec * 2.8 : -0.55 - easeOutCubic(raise) * 1.1;
    const gripY = R * 0.05
      - (stamped ? rec * 22 * u : easeOutCubic(raise) * 22 * u);
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
    c.lineWidth = 3.2 * u * bl;          /* bamboo shaft — gripped near its end */
    c.beginPath();
    c.moveTo(-6 * u * bl, 0.3 * u * bl);
    c.quadraticCurveTo(6 * u * bl, -1.4 * u * bl, 20 * u * bl, -0.4 * u * bl);
    c.stroke();
    c.lineWidth = 4.6 * u * bl;          /* thread-wrap ferrule */
    c.beginPath();
    c.moveTo(19 * u * bl, -0.6 * u * bl);
    c.lineTo(23 * u * bl, -0.2 * u * bl);
    c.stroke();
    c.fillStyle = INK;                   /* bristles, wet with ink */
    c.beginPath();
    c.moveTo(23 * u * bl, -3.4 * u * bl);
    c.quadraticCurveTo(30 * u * bl, -2.6 * u * bl, 34 * u * bl, 0.2 * u * bl);
    c.quadraticCurveTo(29 * u * bl, 3.2 * u * bl, 23 * u * bl, 2.8 * u * bl);
    c.closePath();
    c.fill();
    c.globalAlpha = 0.95;                /* both hands near the shaft's end */
    c.fillStyle = INK;
    blobPath(c, -1.5 * u * bl, -0.1 * u * bl, R * 0.23, sd ^ 7, 0.25, 8);
    c.fill();
    blobPath(c, 3.5 * u * bl, 0.15 * u * bl, R * 0.2, sd ^ 9, 0.25, 8);
    c.fill();
    c.globalAlpha = 1;
    c.restore();
  }

  /* the beasts that rise from the pools — solid ink, one language */
  function drawBeast(c, kind, x, y, r, tick, u, eyes) {
    const sd = (kind * 7919) ^ (tick * 13);
    c.save();
    c.translate(x, y);
    c.fillStyle = INK;
    c.strokeStyle = INK;
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (kind === 0) {                    /* the blot */
      blobPath(c, 0, 0, r, sd, 0.15, 11);
      c.fill();
      eyeSlits(c, r, eyes);
    } else if (kind === 1) {             /* the spear — solid, leaning */
      c.rotate(-0.55);
      teardrop(c, r * 1.06);
      c.fill();
      c.rotate(0.55);
      eyeSlits(c, r * 0.9, eyes);
    } else {                             /* the brute — breathing mass */
      const breathe = 1 + Math.sin(tick * 0.7) * 0.025;
      c.scale(breathe, 1 / breathe);
      blobPath(c, 0, 0, r, sd, 0.13, 13);
      c.fill();
      eyeSlits(c, r, eyes);
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
    const tick = Math.floor(T / 0.115);   /* hand-drawn boil at ~8.7fps */
    const ix = W / 2, iy = H * 0.52;      /* the impact point */

    ensurePaper(W, H, dpr);
    if (planW !== W || planH !== H) { plan(W, H); planW = W; planH = H; }

    ctx.save();
    /* camera shake on impact & slam */
    if (shakeAmp > 0.3 && !S.reduced) {
      ctx.translate((Math.random() - 0.5) * shakeAmp, (Math.random() - 0.5) * shakeAmp);
    }

    /* ===== the void ===== */
    ctx.fillStyle = VOID;
    ctx.fillRect(-30, -30, W + 60, H + 60);

    /* dust motes breathing in the dark, gone once the paper arrives */
    const moteFade = clamp01(T / 0.9) * (T < T_FLOOD ? 1 : clamp01(1 - (T - T_FLOOD) / 0.6));
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

    /* ===== the drop ===== */
    if (T < T_IMPACT) {
      let dx = ix, dy = H * 0.30, r = 8 * u, stretch = 1, alpha = 1;
      if (T < T_FALL) {
        const p = clamp01((T - T_DROP_FORM) / (T_FALL - T_DROP_FORM));
        const gath = easeOutCubic(p);
        r = (3 + 7 * gath) * u;
        alpha = 0.25 + 0.75 * gath;
        dx += Math.sin(T * 19) * 1.6 * u * (1 - p * 0.55);   /* the tremble before the fall */
        /* a faint halo so the drop reads against the void */
        if (gath > 0.05) {
          const hg = ctx.createRadialGradient(dx, dy, 0, dx, dy, r * 4.4);
          hg.addColorStop(0, `rgba(237,231,217,${0.15 * gath})`);
          hg.addColorStop(1, 'rgba(237,231,217,0)');
          ctx.fillStyle = hg;
          ctx.fillRect(dx - r * 4.4, dy - r * 4.4, r * 8.8, r * 8.8);
        }
      } else {
        const p = clamp01((T - T_FALL) / (T_IMPACT - T_FALL));
        dy = H * 0.30 + (iy - H * 0.30) * easeInCubic(p);
        stretch = 1 + 1.9 * p;
        /* falling echoes */
        for (let k = 1; k <= 2; k++) {
          const ep = clamp01(p - k * 0.09);
          if (ep <= 0) break;
          ctx.save();
          ctx.translate(dx, H * 0.30 + (iy - H * 0.30) * easeInCubic(ep));
          ctx.rotate(-Math.PI / 2);
          ctx.scale(1 + 1.9 * ep, 1 / (1 + 1.9 * ep));
          ctx.globalAlpha = 0.15 * (1 - k * 0.3);
          ctx.fillStyle = PAPER;
          teardrop(ctx, 7.5 * u);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(-Math.PI / 2);          /* belly down, tail up — a falling drop */
      ctx.scale(stretch, 1 / stretch);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = PAPER;
      teardrop(ctx, r);
      ctx.fill();
      ctx.restore();
    }

    /* ===== impact splash & ripples ===== */
    if (T >= T_IMPACT) {
      const it = T - T_IMPACT;
      if (it < 0.45 && shakeAmp < 1) shakeAmp = 11 * (1 - it / 0.45);
      const fade = clamp01(1 - it / 1.5);
      if (fade > 0) {
        splatPaint(ctx, ix, iy, 30 * u, 4242, 0.9 * fade, PAPER);
        for (let k = 0; k < 2; k++) {
          const rp = clamp01((it - k * 0.14) / 1.1);
          if (rp <= 0 || rp >= 1) continue;
          ctx.save();
          ctx.strokeStyle = PAPER;
          ctx.globalAlpha = 0.5 * (1 - rp) * fade;
          ctx.lineWidth = 2.2 * u;
          blobPath(ctx, ix, iy, rp * (140 + k * 60) * u, 500 + k, 0.05, 22);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    /* ===== the paper floods ===== */
    const flooded = T >= T_FLOOD;
    if (flooded) {
      const fp = clamp01((T - T_FLOOD) / (T_FLOOD_END - T_FLOOD));
      const floodR = easeOutCubic(fp) * Math.hypot(W, H) * 0.62;
      ctx.save();
      ctx.beginPath();
      /* a wet, trembling edge */
      const segs = 72;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * TAU;
        const wob = Math.sin(a * 5 + T * 2.1) * 5 * u + Math.sin(a * 11 - T * 1.4) * 3 * u;
        const rr = floodR + wob;
        const x = ix + Math.cos(a) * rr, y = iy + Math.sin(a) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(paperC, 0, 0, W, H);
      ctx.restore();

      /* the bleeding rim of the flood */
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

        /* satellite splats tear through ahead of the edge */
        for (const s of satellite) {
          const dTarget = s.d * Math.hypot(W, H) * 0.62;
          if (floodR < dTarget) continue;
          const ap = clamp01((floodR - dTarget) / (40 * u));
          const x = ix + Math.cos(s.a) * dTarget, y = iy + Math.sin(s.a) * dTarget;
          splatPaint(ctx, x, y, s.r, s.seed, 0.9 * ap, PAPER);
        }
      }

      /* ===== captions, once there is paper to write on ===== */
      for (let ci = 0; ci < CAPTIONS.length; ci++) {
        const cp = CAPTIONS[ci];
        if (T < cp.t0 || T > cp.t1 + 0.45) continue;
        const fin = clamp01((T - cp.t0) / 0.45);
        const fout = clamp01((T - cp.t1) / 0.45);
        const a = fin * (1 - fout);
        const rise = (1 - easeOutCubic(fin)) * 12 * u;
        const kSize = Math.round(Math.max(54, Math.min(118, 92 * u)));
        const eSize = Math.max(10, Math.min(15, 12 * u));
        const cy = H * 0.615 + rise;

        /* a wash of paper behind the words, so strokes never fight them */
        const wash = ctx.createRadialGradient(ix, cy, 0, ix, cy, Math.max(W * 0.36, 260));
        wash.addColorStop(0, `rgba(237,231,217,${0.6 * a})`);
        wash.addColorStop(1, 'rgba(237,231,217,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(ix, cy);
        ctx.rotate(-0.018);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        /* the kanji, settling like wet ink */
        ctx.save();
        const settle = 1 + (1 - easeOutCubic(fin)) * 0.07;
        ctx.scale(settle, settle);
        ctx.globalAlpha = a;
        ctx.fillStyle = INK;
        ctx.shadowColor = 'rgba(26,23,20,0.5)';
        ctx.shadowBlur = 9 * u;
        ctx.font = `${kSize}px "Zen Antique", "Hiragino Mincho ProN", serif`;
        ctx.fillText(cp.kanji, 0, 0);
        ctx.restore();

        /* the english line, flanked by hairlines */
        const ey = kSize * 0.68;
        ctx.globalAlpha = a * 0.92;
        ctx.fillStyle = INK;
        ctx.font = `500 ${eSize}px "IBM Plex Mono", monospace`;
        try { ctx.letterSpacing = `${(3.2 * u).toFixed(1)}px`; } catch (e) {}
        ctx.fillText(cp.en, 0, ey);
        const tw = ctx.measureText(cp.en).width;
        try { ctx.letterSpacing = '0px'; } catch (e) {}
        ctx.strokeStyle = 'rgba(26,23,20,0.3)';
        ctx.lineWidth = 1;
        const gap = tw / 2 + 18 * u;
        const rl = 34 * u;
        ctx.beginPath();
        ctx.moveTo(-gap - rl, ey); ctx.lineTo(-gap, ey);
        ctx.moveTo(gap, ey); ctx.lineTo(gap + rl, ey);
        ctx.stroke();

        /* a red seal dot beside the kanji */
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = RED;
        ctx.save();
        ctx.translate(kSize * 0.62, -kSize * 0.5);
        ctx.rotate(0.12);
        const sd = Math.max(5, 7 * u);
        ctx.fillRect(-sd / 2, -sd / 2, sd, sd);
        ctx.restore();

        ctx.restore();
      }

      /* ===== the three strokes ===== */
      for (const s of strokes) {
        const p = clamp01((T - s.t0) / s.dur);
        if (p <= 0) continue;
        const pe = easeOutQuad(p);
        const seg = slicePts(s.pts, pe);
        inkStroke(ctx, seg, s.w, { alpha: 0.94, seed: s.seed, dry: true });
        if (p < 1) {
          /* the brush tip, still moving */
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

      /* ===== ink pools & the rising beasts ===== */
      if (T >= T_POOLS) {
        const pools = [
          { x: W * 0.20, y: H * 0.80, r: 34 * u },
          { x: W * 0.50, y: H * 0.86, r: 40 * u },
          { x: W * 0.80, y: H * 0.78, r: 37 * u },
        ];
        const eyes = clamp01((T - T_EYES) / 0.6);
        for (let k = 0; k < pools.length; k++) {
          const pl = pools[k];
          const grow = easeOutCubic(clamp01((T - T_POOLS - k * 0.14) / 0.6));
          if (grow > 0) splatPaint(ctx, pl.x, pl.y, pl.r * grow, 3000 + k * 77, 0.72 * grow, INK);
          const rp = clamp01((T - T_RISE - k * 0.22) / 1.3);
          if (rp <= 0) continue;
          const rs = easeOutBack(rp);
          const lift = easeOutCubic(rp) * 58 * u;
          ctx.save();
          ctx.globalAlpha = clamp01(rp * 1.6);
          drawBeast(ctx, k, pl.x, pl.y - lift, pl.r * 1.02 * rs, tick + k * 3, u, eyes);
          ctx.restore();
        }
      }

      /* ===== the spirit wakes — the ink stands up ===== */
      if (T >= T_GATHER) {
        const gp = clamp01((T - T_GATHER) / (T_STAND - T_GATHER));
        const raise = clamp01((T - T_STAND) / 0.9);
        const awake = clamp01((T - T_AWAKE) / 0.4);
        const rp = clamp01((T - T_STAMP) / (T_SLAM - T_STAMP));   /* brush raise */
        const stamped = T >= T_SLAM;
        const st = stamped ? T - T_SLAM : 0;
        const slamT = clamp01(st / 0.32);                          /* duck & squash recovery */
        const press = stamped ? easeOutCubic(clamp01(st / 0.15)) : 0;  /* seal press-in */
        if (stamped && !sealSlammed) { sealSlammed = true; shakeAmp = 13; }

        const gy = H * 0.58;
        const lift = easeOutCubic(gp) * 40 * u;
        const bodyR = 40 * u * (0.3 + 0.7 * easeOutBack(gp));
        const K = 1.9;                 /* the scribe stands taller than the blob ever was */

        /* it lifts while raising the brush, ducks and squashes on the slam */
        const duck = stamped ? (1 - easeOutCubic(slamT)) * 13 * u : -5 * u * rp;
        const sqx = 1 + (stamped ? (1 - slamT) * 0.16 : -rp * 0.05);
        const sqy = 1 - (stamped ? (1 - slamT) * 0.14 : -rp * 0.08);

        /* the pool it gathers from */
        if (gp < 1) splatPaint(ctx, ix, gy + 30 * u, 50 * u * (0.35 + 0.65 * gp), 4321, 0.72 * (1 - gp * 0.45), INK);

        ctx.save();
        ctx.translate(ix, gy - lift + duck);
        ctx.scale(sqx, sqy);
        drawScribe(ctx, u, {
          R: bodyR * K, raise: rp, awake, stamped, st, t: T, tick,
        });
        ctx.restore();

        /* a wisp curling off the freshly stood ink */
        if (!stamped && awake > 0) {
          inkStroke(ctx, [
            { x: ix - bodyR * K * 0.55, y: gy - lift - bodyR * K * 1.35 },
            { x: ix - bodyR * K * 1.1, y: gy - lift - bodyR * K * 1.9 + Math.sin(T * 3) * 2 * u },
          ], 2 * u, { alpha: 0.3 * awake });
        }

        /* the hanko it slams beneath its own brush */
        if (stamped) {
          const sz = Math.min(W, H) * 0.115;
          const hx = ix + bodyR * K * 1.35;
          const hy = gy - lift + duck + bodyR * K * 1.05 + sz * 0.42;
          const s = 1.3 - 0.3 * press;
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(-0.09);
          ctx.scale(s, s);
          ctx.globalAlpha = 0.96 * press;
          ctx.fillStyle = RED;
          sealPath(ctx, sz / 2, 777, 0.055);       /* hand-cut square */
          ctx.fill();
          ctx.strokeStyle = 'rgba(237,231,217,0.9)';
          ctx.lineWidth = 1.6 * u;
          sealPath(ctx, sz / 2 - 6.5 * u, 778, 0.07);
          ctx.stroke();
          /* the first mark, carved bold */
          ctx.fillStyle = PAPER;
          ctx.font = `${Math.round(sz * 0.68)}px "Zen Antique", serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('一', 0, sz * 0.04);
          ctx.restore();

          /* red splatter the moment it lands */
          const fa = clamp01(1 - st / 1.1);
          if (fa > 0) {
            for (const ss of sealSplats) {
              const x = hx + Math.cos(ss.a) * sz * ss.d;
              const y = hy + Math.sin(ss.a) * sz * ss.d;
              splatPaint(ctx, x, y, ss.r, ss.seed, 0.85 * fa, RED);
            }
          }
        }
      }

      /* ===== rim vignette over the paper ===== */
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.74);
      vg.addColorStop(0, 'rgba(58,52,40,0)');
      vg.addColorStop(1, 'rgba(58,52,40,0.18)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore(); /* shake */

    /* ===== progress hairline ===== */
    const prog = clamp01(T / DUR);
    ctx.fillStyle = flooded ? 'rgba(26,23,20,0.3)' : 'rgba(237,231,217,0.35)';
    ctx.fillRect(0, H - 2, W * prog, 2);

    /* ===== skip fade / final fade to paper ===== */
    let overA = 0;
    if (skipping) overA = clamp01(skipT / 0.32);
    else if (T > T_FADE) overA = clamp01((T - T_FADE) / (DUR - T_FADE));
    if (overA > 0) {
      ctx.fillStyle = `rgba(237,231,217,${overA})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  return {
    start, skip, update, draw,
    /* QA hook: jump the timeline (also handy for replay testing) */
    seek(t) {
      if (!live) return;
      T = Math.max(0, t);
      skipping = false; skipT = 0;
      sealSlammed = T >= T_SLAM;
    },
    get onEnd() { return onEnd; },
    set onEnd(fn) { onEnd = fn; },
    isLive: () => live,
  };
})();
