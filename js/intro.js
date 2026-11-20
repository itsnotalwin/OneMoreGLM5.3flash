'use strict';
/* ============================================================
   ONE MORE — THE OPENING SCENE
   A skippable ink cinematic before the title: a single drop
   falls through the void, bursts, and floods into a sheet of
   washi. A brush cuts strokes, the ink begins to move — and
   then the ink stands up as the scribe: the same kasa-hatted
   figure who paints the title ring and walks the sheets wakes
   here, raises the brush in both hands, and stamps the first
   mark onto the paper. The seal bleeds — one continuous shot:
   vermilion floods the frame from the mark, and the pale washi
   floods back, the very sheet the title rises from. Cinema
   bars frame the whole film; the camera breathes in slowly;
   every beat carries a sound. Rendered entirely on canvas
   with the game's ink language.
   ============================================================ */

const INTRO = (() => {
  const INK = '#1a1714';
  const PAPER = '#ede7d9';
  const RED = '#b23a2b';
  const VOID = '#131009';
  const TAU = Math.PI * 2;

  /* ---------------- timeline ----------------
     v22.1 THE GRAND OPENING — six acts, ~33s. The old cut's beloved
     beats all keep their places; the ceremony the film was missing
     (the horde in depth, the captain's standard, the six lords
     answering) is built between them, and the camera now moves per
     act instead of one slow push. */
  /* ACT I — THE VOID */
  const T_DROP_FORM = 0.6;    // the drop begins to gather
  const T_FALL = 3.4;         // the drop lets go (a slow-mo stretch)
  /* ACT II — THE DROP AND THE FLOOD */
  const T_IMPACT = 4.5;       // the drop bursts — cracks radiate
  const T_FLOOD = 4.85;       // the paper floods outward
  const T_FLOOD_END = 7.6;
  /* ACT III — THE THREE STROKES (the camera sweeps with each) */
  const T_STROKES = [8.0, 10.2, 12.4];
  /* ACT IV — THE HORDE WAKES */
  const T_POOLS = 14.2;       // ink pools bloom
  const T_RISE = 14.8;        // the beasts rise — three depths
  const T_EYES = 16.4;        // the eyes open in a wave
  const T_FLAG = 18.2;        // the captain's standard rises; a keeper's seal glows
  /* ACT V — THE KEEPERS ANSWER */
  const T_LORDS = 20.6;       // the first sheet's ten keepers rise along the horizon
  const T_LORD_STEP = 0.38;   // one keeper per breath, seals flaring behind
  /* ACT VI — THE SCRIBE AND THE SEAL */
  const T_GATHER = 27.0;      // the ink gathers one last time
  const T_STAND = 27.55;      // the spirit stands
  const T_AWAKE = 28.0;       // its eye opens
  const T_STAMP = 28.9;       // it raises the brush
  const T_SLAM = 29.3;        // the mark lands
  const T_RED = 29.75;        // the seal's vermilion floods the sheet
  const T_WASH = 31.6;        // the pale washi floods back — the title's sheet
  const DUR = 33.0;           // handoff (a breath of clean washi at the end)

  const CAPTIONS = [
    { kanji: '墨', en: 'IN THE BEGINNING, THERE WAS INK.', t0: 5.3, t1: 7.5 },
    { kanji: '紙', en: 'THEN A SHEET THAT REMEMBERS EVERY STROKE.', t0: 8.9, t1: 11.0 },
    { kanji: '筆', en: 'ONE BRUSH WAS CUT FROM THE REED.', t0: 11.6, t1: 13.7 },
    { kanji: '生', en: 'AND THE INK BEGAN TO MOVE.', t0: 16.9, t1: 19.1 },
    { kanji: '守', en: 'AND THE PAPER RAISED ITS OWN.', t0: 21.6, t1: 24.4 },
  ];
  const CAP_VOID = { kanji: '始', en: 'BEFORE THE FIRST STROKE, A DARKNESS.', t0: 1.3, t1: 3.2 };
  const CAP_END = { kanji: '終', en: 'ONE MORE.', t0: 30.35, t1: 31.9 };

  /* the camera rides keyframes now: zoom around a point, eased
     between acts — the push-in, the sweeps, the pull-back, the
     tilt to the horizon, the slam's punch */
  const CAM_KEYS = [
    { t: 0.0, s: 1.00, x: 0.50, y: 0.50 },
    { t: 3.2, s: 1.07, x: 0.50, y: 0.40 },   // ACT I — push toward the hanging drop
    { t: 4.5, s: 1.13, x: 0.50, y: 0.50 },   // ACT II — the impact
    { t: 5.6, s: 1.00, x: 0.50, y: 0.52 },   // settle as the flood lands
    { t: 9.3, s: 1.05, x: 0.36, y: 0.42 },   // ACT III — stroke I sweeps left
    { t: 11.5, s: 1.04, x: 0.62, y: 0.52 },  // stroke II sweeps right
    { t: 13.7, s: 1.06, x: 0.55, y: 0.62 },  // stroke III sweeps low
    { t: 15.0, s: 1.00, x: 0.50, y: 0.55 },  // ACT IV — settle for the horde
    { t: 18.8, s: 0.95, x: 0.50, y: 0.58 },  // pull back — the horde revealed
    { t: 20.4, s: 1.00, x: 0.50, y: 0.50 },
    { t: 23.5, s: 0.97, x: 0.50, y: 0.40 },  // ACT V — tilt up to the keepers' horizon
    { t: 26.6, s: 1.02, x: 0.50, y: 0.50 },
    { t: 28.6, s: 1.10, x: 0.50, y: 0.58 },  // ACT VI — push in on the scribe
    { t: 29.4, s: 1.16, x: 0.50, y: 0.56 },  // the slam
    { t: 30.6, s: 1.00, x: 0.50, y: 0.52 },  // settle for the red
  ];
  function camAt(t) {
    if (t <= CAM_KEYS[0].t) return CAM_KEYS[0];
    for (let i = 1; i < CAM_KEYS.length; i++) {
      const a = CAM_KEYS[i - 1], b = CAM_KEYS[i];
      if (t <= b.t) {
        const p = easeInOut(clamp01((t - a.t) / (b.t - a.t)));
        return { s: a.s + (b.s - a.s) * p, x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
      }
    }
    return CAM_KEYS[CAM_KEYS.length - 1];
  }

  /* the ending keeps one continuous move: the hanko bleeds, the
     frame goes vermilion, and the pale washi floods back for the
     title. The scrolls announce themselves in their own films — the
     opening spends its last breath on a single continuous shot. */

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
  let redEdge = [];      // red satellites tearing ahead of the vermilion flood
  let cracks = [];       // jagged ink lines radiating from the impact (v22.1)
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

    /* red satellites that tear ahead of the vermilion flood */
    redEdge = [];
    for (let i = 0; i < 6; i++) {
      redEdge.push({
        a: rnd() * TAU, d: (0.34 + rnd() * 0.5),
        r: (7 + rnd() * 13) * u, seed: 2600 + i,
      });
    }

    /* v22.1 the impact cracks: jagged ink lines radiating from the
       blow, jagged twice over — once in the curve, once in the ink */
    cracks = [];
    const ix = W / 2, iy = H * 0.52;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + rnd() * 0.28;
      const len = W * (0.10 + rnd() * 0.09);
      const bend = (rnd() - 0.5) * 0.35;
      cracks.push({
        pts: curvePts(
          ix, iy,
          ix + Math.cos(a + bend * 0.4) * len * 0.55, iy + Math.sin(a + bend * 0.4) * len * 0.55,
          ix + Math.cos(a) * len, iy + Math.sin(a) * len,
          7, 5 * u, 700 + i),
        w: 1.6 + rnd() * 2.4,
        a: 0.5 + rnd() * 0.4,
        seed: 700 + i,
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

  /* has the timeline just crossed time t? (tolerant of hitches) */
  let dt_last = 0;
  function crossed(t) {
    return T >= t && T - dt_last < t;
  }

  function update(dt) {
    if (!live || ended) return;
    dt_last = dt;
    T += dt;
    if (shakeAmp > 0) shakeAmp = Math.max(0, shakeAmp - dt * 34);
    /* the film's voice — every beat carries a sound (silent while
       the context still waits for its first gesture, loud on every
       replay from the opening button) */
    if (crossed(T_IMPACT)) SFX.thud();        // the drop bursts
    if (crossed(T_FLOOD)) SFX.gong();         // the paper floods in
    if (crossed(T_STROKES[0])) SFX.pick(0);   // the brush cuts
    if (crossed(T_STROKES[1])) SFX.pick(1);
    if (crossed(T_STROKES[2])) SFX.pick(2);
    if (crossed(T_RISE)) SFX.nova();          // the beasts stir
    if (crossed(T_FLAG)) SFX.wave(true);      // the standard rises — the rank musters
    if (crossed(T_LORDS)) SFX.gong();         // the keepers answer
    if (crossed(T_STAND)) SFX.spirit();       // the ink stands
    if (crossed(T_SLAM)) SFX.hanko();         // the mark lands
    if (crossed(T_RED)) SFX.elite();          // the vermilion rises
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
  /* v22.1 one caption renderer for every surface — void, paper, red.
     The kanji settles like wet ink, bigger now; the english line
     rides beneath, flanked by hairlines; a red seal dot signs it. */
  function drawCaption(c, cap, a, x, y, inkColor, u) {
    const kSize = Math.round(Math.max(64, Math.min(150, 118 * u)));
    const eSize = Math.max(11, Math.min(16, 13 * u));
    c.save();
    c.translate(x, y);
    c.rotate(-0.018);
    c.textAlign = 'center';
    c.textBaseline = 'middle';

    const settle = 1 + (1 - easeOutCubic(a)) * 0.07;
    c.save();
    c.scale(settle, settle);
    c.globalAlpha = a;
    c.fillStyle = inkColor;
    c.shadowColor = inkColor === INK ? 'rgba(26,23,20,0.5)' : 'rgba(0,0,0,0)';
    c.shadowBlur = 9 * u;
    c.font = `${kSize}px "Zen Antique", "Hiragino Mincho ProN", serif`;
    c.fillText(cap.kanji, 0, 0);
    c.restore();

    const ey = kSize * 0.68;
    c.globalAlpha = a * 0.92;
    c.fillStyle = inkColor;
    c.font = `500 ${eSize}px "IBM Plex Mono", monospace`;
    try { c.letterSpacing = `${(3.2 * u).toFixed(1)}px`; } catch (e) {}
    c.fillText(cap.en, 0, ey);
    const tw = c.measureText(cap.en).width;
    try { c.letterSpacing = '0px'; } catch (e) {}
    c.strokeStyle = inkColor === INK ? 'rgba(26,23,20,0.3)' : 'rgba(237,231,217,0.35)';
    c.lineWidth = 1;
    const gap = tw / 2 + 18 * u;
    const rl = 34 * u;
    c.beginPath();
    c.moveTo(-gap - rl, ey); c.lineTo(-gap, ey);
    c.moveTo(gap, ey); c.lineTo(gap + rl, ey);
    c.stroke();

    c.globalAlpha = a * 0.9;
    c.fillStyle = RED;
    c.save();
    c.translate(kSize * 0.62, -kSize * 0.5);
    c.rotate(0.12);
    const sd = Math.max(6, 8 * u);
    c.fillRect(-sd / 2, -sd / 2, sd, sd);
    c.restore();

    c.restore();
  }

  /* v22.2 the level bosses, seen vast on the horizon — the ten
     keepers of the first sheet, the beasts every new hand actually
     fights: THE POOL, THE SAPLING, THE FAR PEAK, THE DRIFT, THE
     RISING MIST, THE DEW, THE DANCING CRANE, THE OLD PINE, THE
     FIRST DUSK, and THE BLIGHT closing scene ten. Drawn centred at
     the caller's origin. */
  function drawLordSil(c, k, u) {
    c.fillStyle = INK; c.strokeStyle = INK;
    c.lineJoin = 'round'; c.lineCap = 'round';
    switch (k) {
      case 0: { /* THE POOL — a spill that learned to hunger */
        blobPath(c, 0, 14 * u, 62 * u, 91, 0.12, 16); c.fill();
        c.save(); c.globalAlpha *= 0.4; c.fillStyle = INK;
        blobPath(c, 0, 6 * u, 30 * u, 92, 0.16, 12); c.fill();
        c.restore();
        c.save(); c.globalAlpha *= 0.5; c.strokeStyle = PAPER; c.lineWidth = 1.8 * u;
        for (let i = 1; i <= 2; i++) {
          c.beginPath();
          c.arc(0, 14 * u, (26 + i * 18) * u, 0, TAU);
          c.stroke();
        }
        c.restore();
        break;
      }
      case 1: { /* THE SAPLING — a young tree, canopy of blots */
        inkStroke(c, [{ x: 0, y: 66 * u }, { x: -3 * u, y: 10 * u }, { x: 3 * u, y: -34 * u }], 13 * u, { alpha: 0.95, seed: 31 });
        blobPath(c, 0, -44 * u, 46 * u, 92, 0.18, 12); c.fill();
        c.save(); c.globalAlpha *= 0.85;
        teardrop(c, 9 * u);
        c.save(); c.translate(38 * u, -26 * u); c.rotate(1.1); c.fill(); c.restore();
        c.save(); c.translate(-40 * u, -14 * u); c.rotate(-1.2); c.fill(); c.restore();
        c.restore();
        break;
      }
      case 2: { /* THE FAR PEAK — a jagged mass, snow on the high ridge */
        c.save();
        c.beginPath();
        c.moveTo(-74 * u, 58 * u);
        c.lineTo(-46 * u, -6 * u);
        c.lineTo(-26 * u, 14 * u);
        c.lineTo(-2 * u, -52 * u);
        c.lineTo(24 * u, -2 * u);
        c.lineTo(44 * u, -22 * u);
        c.lineTo(76 * u, 58 * u);
        c.closePath();
        c.fill();
        c.restore();
        c.save(); c.globalAlpha *= 0.6; c.strokeStyle = PAPER; c.lineWidth = 2.4 * u;
        c.beginPath();
        c.moveTo(-14 * u, -32 * u); c.lineTo(-2 * u, -52 * u); c.lineTo(12 * u, -28 * u);
        c.stroke();
        c.restore();
        break;
      }
      case 3: { /* THE DRIFT — a swimmer, always mid-turn */
        c.save();
        c.scale(-1, 1);   /* faces right: the tail clears the peak's mass */
        c.rotate(-0.12);
        blobPath(c, 0, 0, 44 * u, 94, 0.11, 14); c.fill();
        c.beginPath();
        c.moveTo(-40 * u, 0);
        c.lineTo(-74 * u, -22 * u + Math.sin(1) * 4 * u);
        c.lineTo(-70 * u, 22 * u - Math.sin(1) * 4 * u);
        c.closePath(); c.fill();
        c.save(); c.globalAlpha *= 0.7; c.strokeStyle = PAPER; c.lineWidth = 1.8 * u;
        for (const s of [-1, 1]) {
          c.beginPath();
          c.moveTo(36 * u, s * 7 * u);
          c.quadraticCurveTo(58 * u, s * 18 * u, 70 * u, s * 7 * u);
          c.stroke();
        }
        c.restore();
        c.restore();
        break;
      }
      case 4: { /* THE RISING MIST — a hooded drift, trailing wisps */
        c.save();
        c.scale(0.9, 1.12);
        c.globalAlpha *= 0.9;
        blobPath(c, 0, -6 * u, 46 * u, 95, 0.18, 12); c.fill();
        c.restore();
        c.save(); c.globalAlpha *= 0.5; c.fillStyle = PAPER;
        blobPath(c, 0, -26 * u, 16 * u, 96, 0.28, 9); c.fill();
        c.restore();
        /* the wisps trail outward and thin — never downward, or the
           drift grows legs (v22.2 fix) */
        c.save(); c.globalAlpha *= 0.5;
        inkStroke(c, [
          { x: -20 * u, y: 18 * u },
          { x: -52 * u, y: 30 * u },
          { x: -78 * u, y: 24 * u },
        ], 5 * u, { alpha: 0.45, seed: 41, taper: 0.9 });
        inkStroke(c, [
          { x: 20 * u, y: 20 * u },
          { x: 54 * u, y: 34 * u },
          { x: 80 * u, y: 30 * u },
        ], 5 * u, { alpha: 0.45, seed: 42, taper: 0.9 });
        c.restore();
        break;
      }
      case 5: { /* THE DEW — a moth, wings as pressed leaves */
        c.save();
        blobPath(c, 0, 0, 26 * u, 97, 0.22, 10); c.fill();
        c.restore();
        c.save(); c.globalAlpha *= 0.9;
        const fw = Math.sin(1) * 5 * u;
        c.save(); c.translate(-40 * u, -14 * u + fw); c.rotate(-0.7); teardrop(c, 30 * u); c.fill(); c.restore();
        c.save(); c.translate(40 * u, -14 * u + fw); c.rotate(0.7); teardrop(c, 30 * u); c.fill(); c.restore();
        c.save(); c.translate(-28 * u, 26 * u - fw); c.rotate(-1.35); teardrop(c, 17 * u); c.fill(); c.restore();
        c.save(); c.translate(28 * u, 26 * u + fw); c.rotate(1.35); teardrop(c, 17 * u); c.fill(); c.restore();
        c.restore();
        break;
      }
      case 6: { /* THE DANCING CRANE — folded paper, one leg */
        c.save();
        c.rotate(-0.06);
        c.beginPath();
        c.moveTo(70 * u, -6 * u);            /* beak */
        c.lineTo(-6 * u, -12 * u);           /* neck ridge */
        c.lineTo(-14 * u, -46 * u);          /* wing tip, raised */
        c.lineTo(-30 * u, -8 * u);
        c.lineTo(-44 * u, 24 * u);
        c.lineTo(10 * u, 30 * u);
        c.closePath(); c.fill();
        /* the standing leg */
        c.lineWidth = 3.4 * u;
        c.beginPath(); c.moveTo(0, 30 * u); c.lineTo(4 * u, 68 * u); c.stroke();
        c.restore();
        break;
      }
      case 7: { /* THE OLD PINE — roots first, needles after */
        inkStroke(c, [{ x: 0, y: 70 * u }, { x: -4 * u, y: 6 * u }, { x: 2 * u, y: -30 * u }], 15 * u, { alpha: 0.95, seed: 33 });
        /* the needle fan, pressed in ink — paper needles drown on
           pale washi (v22.2 fix) */
        c.save();
        c.globalAlpha *= 0.75; c.lineWidth = 3.4 * u;
        for (let i = 0; i < 9; i++) {
          const na = -Math.PI / 2 + (i / 8 - 0.5) * 2.4;
          c.beginPath();
          c.moveTo(2 * u + Math.cos(na) * 16 * u, -40 * u + Math.sin(na) * 16 * u);
          c.lineTo(2 * u + Math.cos(na) * 56 * u, -40 * u + Math.sin(na) * 56 * u);
          c.stroke();
        }
        c.restore();
        break;
      }
      case 8: { /* THE FIRST DUSK — the noh mask */
        c.save();
        c.scale(0.86, 1.1);
        blobPath(c, 0, 0, 46 * u, 98, 0.1, 12); c.fill();
        c.restore();
        /* its two slits, torn pale */
        c.save(); c.strokeStyle = PAPER; c.lineWidth = 3.2 * u; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-22 * u, -8 * u); c.lineTo(-6 * u, -4 * u); c.stroke();
        c.beginPath(); c.moveTo(6 * u, -4 * u); c.lineTo(22 * u, -8 * u); c.stroke();
        c.restore();
        /* the crest horn */
        inkStroke(c, [
          { x: 0, y: -40 * u },
          { x: 6 * u, y: -62 * u },
          { x: 16 * u, y: -72 * u },
        ], 5 * u, { alpha: 0.9, seed: 44 });
        break;
      }
      case 9: { /* THE BLIGHT — a rolling sea of ink, scene ten */
        blobPath(c, 0, 10 * u, 64 * u, 99, 0.08, 18); c.fill();
        c.save(); c.globalAlpha *= 0.45; c.strokeStyle = PAPER; c.lineWidth = 2.6 * u;
        c.beginPath(); c.arc(0, 10 * u, 36 * u, 0, TAU); c.stroke();
        c.restore();
        /* heavy drips dragging behind */
        for (let i = 0; i < 3; i++) {
          const dx = (-30 + i * 30) * u;
          inkStroke(c, [
            { x: dx, y: 52 * u },
            { x: dx + (i - 1) * 5 * u, y: 78 * u },
          ], 7 * u, { alpha: 0.8, seed: 71 + i });
        }
        break;
      }
    }
  }

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
    /* the camera rides its keyframes: zooms around a point, eased
       between acts (v22.1). Reduced motion holds the centre still. */
    const cam = S.reduced ? { s: 1, x: 0.5, y: 0.52 } : camAt(T);
    ctx.save();
    ctx.translate(W * cam.x, H * cam.y);
    ctx.scale(cam.s, cam.s);
    ctx.translate(-W * cam.x, -H * cam.y);

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

    /* ACT I's caption breathes pale out of the dark — the only words
       the void is given (v22.1) */
    if (T >= CAP_VOID.t0 && T <= CAP_VOID.t1 + 0.45) {
      const fin = clamp01((T - CAP_VOID.t0) / 0.45);
      const fout = clamp01((T - CAP_VOID.t1) / 0.45);
      const rise = (1 - easeOutCubic(fin)) * 12 * u;
      drawCaption(ctx, CAP_VOID, fin * (1 - fout), ix, H * 0.615 + rise, PAPER, u);
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

    /* ===== impact splash, cracks & ripples ===== */
    if (T >= T_IMPACT) {
      const it = T - T_IMPACT;
      if (it < 0.45 && shakeAmp < 1) shakeAmp = 11 * (1 - it / 0.45);
      const fade = clamp01(1 - it / 1.5);
      if (fade > 0) {
        splatPaint(ctx, ix, iy, 30 * u, 4242, 0.9 * fade, PAPER);
        /* v22.1 the sheet cracks: jagged ink lines radiate from the
           blow, drawn once, fading as the flood swallows them */
        const crackA = clamp01(it / 0.16) * clamp01(1 - it / 1.35);
        if (crackA > 0 && cracks.length) {
          ctx.save();
          ctx.strokeStyle = PAPER;
          ctx.lineCap = 'round';
          for (const cr of cracks) {
            const seg = slicePts(cr.pts, clamp01(it / 0.34));
            if (seg.length < 2) continue;
            ctx.globalAlpha = crackA * cr.a;
            ctx.lineWidth = cr.w * u;
            inkStroke(ctx, seg, cr.w * u, { alpha: crackA * cr.a, seed: cr.seed, color: PAPER });
          }
          ctx.restore();
        }
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

      /* ===== captions, once there is paper to write on =====
         v22.1: bigger cards through the shared renderer; 守 rides
         with the lords now, in the same loop */
      for (let ci = 0; ci < CAPTIONS.length; ci++) {
        const cp = CAPTIONS[ci];
        if (T < cp.t0 || T > cp.t1 + 0.45) continue;
        const fin = clamp01((T - cp.t0) / 0.45);
        const fout = clamp01((T - cp.t1) / 0.45);
        const a = fin * (1 - fout);
        const rise = (1 - easeOutCubic(fin)) * 14 * u;
        const cy = H * 0.615 + rise;

        /* a wash of paper behind the words, so strokes never fight them */
        const wash = ctx.createRadialGradient(ix, cy, 0, ix, cy, Math.max(W * 0.36, 260));
        wash.addColorStop(0, `rgba(237,231,217,${0.6 * a})`);
        wash.addColorStop(1, 'rgba(237,231,217,0)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, W, H);

        drawCaption(ctx, cp, a, ix, cy, INK, u);
      }

      /* ===== the three strokes =====
         v22.1: they wash away as the lords answer — the horizon
         belongs to the guardians, not the old ink */
      const strokeFade = T >= T_LORDS ? clamp01(1 - (T - T_LORDS + 0.4) / 1.1) : 1;
      for (const s of strokes) {
        const p = clamp01((T - s.t0) / s.dur);
        if (p <= 0 || strokeFade <= 0) continue;
        const pe = easeOutQuad(p);
        const seg = slicePts(s.pts, pe);
        inkStroke(ctx, seg, s.w, { alpha: 0.94 * strokeFade, seed: s.seed, dry: true });
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

      /* ===== ACT V — THE KEEPERS ANSWER (v22.2) =====
         the first sheet's ten level bosses rise along the horizon,
         one per breath, each answered by a red seal flare. Drawn
         before the horde: they stand behind it — the standard and
         the beasts keep the foreground. The paper was never empty —
         it raised its own. */
      if (T >= T_LORDS) {
        const horizon = H * 0.28;
        const seats = [
          { x: 0.07, k: 0, dy: 0.010 },
          { x: 0.165, k: 1, dy: -0.006 },
          { x: 0.26, k: 2, dy: 0.012 },
          { x: 0.355, k: 3, dy: -0.004 },
          { x: 0.45, k: 4, dy: 0.008 },
          { x: 0.545, k: 5, dy: -0.008 },
          { x: 0.64, k: 6, dy: 0.011 },
          { x: 0.762, k: 7, dy: -0.005 },
          { x: 0.852, k: 8, dy: 0.009 },
          { x: 0.925, k: 9, dy: -0.007 },
        ];
        for (let i = 0; i < seats.length; i++) {
          const st = seats[i];
          const rp = clamp01((T - T_LORDS - i * T_LORD_STEP) / 1.15);
          if (rp <= 0) continue;
          const rise = (1 - easeOutCubic(rp)) * H * 0.22;
          const sway = Math.sin(T * 0.5 + i * 1.9) * 3 * u;
          const lx = st.x * W + sway;
          const ly = horizon + rise + st.dy * H;
          ctx.save();
          ctx.globalAlpha = clamp01(rp * 1.4) * 0.92;
          ctx.translate(lx, ly);
          drawLordSil(ctx, st.k, u);
          ctx.restore();
          /* the seal flare answers each keeper */
          const sp = clamp01((T - T_LORDS - i * T_LORD_STEP - 0.8) / 0.55);
          if (sp > 0 && sp < 1) {
            ctx.save();
            ctx.strokeStyle = RED;
            ctx.globalAlpha = (1 - sp) * 0.7;
            ctx.lineWidth = 2 * u;
            ctx.beginPath();
            ctx.arc(lx, ly - 84 * u, 16 * u + sp * 60 * u, 0, TAU);
            ctx.stroke();
            ctx.restore();
          }
        }
        /* the horizon mist veils their feet */
        const mist = ctx.createLinearGradient(0, horizon - H * 0.02, 0, horizon + H * 0.09);
        mist.addColorStop(0, 'rgba(237,231,217,0)');
        mist.addColorStop(0.55, 'rgba(237,231,217,0.85)');
        mist.addColorStop(1, 'rgba(237,231,217,0)');
        ctx.fillStyle = mist;
        ctx.fillRect(0, horizon - H * 0.02, W, H * 0.11);
      }

      /* ===== ink pools & the rising horde =====
         v22.1 THE HORDE WAKES: eight beasts in three depths — pale
         kin far back, the sheet's own ink at mid, black shoulders
         half-cropped by the frame — eyes opening in a wave, bodies
         swaying as they wait. */
      if (T >= T_POOLS) {
        const horde = [
          { x: 0.15, y: 0.70, r: 0.62, k: 1, a: 0.5, eye: 0.00, ph: 2.1 },
          { x: 0.44, y: 0.66, r: 0.56, k: 2, a: 0.46, eye: 0.12, ph: 0.7 },
          { x: 0.73, y: 0.69, r: 0.60, k: 0, a: 0.5, eye: 0.24, ph: 4.4 },
          { x: 0.06, y: 0.80, r: 0.92, k: 1, a: 0.82, eye: 0.34, ph: 1.3 },
          { x: 0.50, y: 0.83, r: 1.12, k: 0, a: 0.92, eye: 0.48, ph: 3.0, big: true },
          { x: 0.93, y: 0.79, r: 0.88, k: 2, a: 0.8, eye: 0.40, ph: 5.2 },
          { x: 0.26, y: 1.00, r: 1.3, k: 2, a: 1, eye: 0.58, ph: 2.9 },
          { x: 0.75, y: 1.02, r: 1.24, k: 1, a: 1, eye: 0.68, ph: 0.2 },
        ];
        for (let k = 0; k < horde.length; k++) {
          const b = horde[k];
          const bx = b.x * W + Math.sin(T * 0.8 + b.ph) * 5 * u;
          const by = b.y * H + Math.sin(T * 0.6 + b.ph * 1.7) * 3 * u;
          const br = b.r * 38 * u;
          const grow = easeOutCubic(clamp01((T - T_POOLS - k * 0.1) / 0.6));
          if (grow > 0) splatPaint(ctx, bx, by + br * 0.4, br * 0.9 * grow, 3000 + k * 77, 0.72 * grow * b.a, INK);
          const rp = clamp01((T - T_RISE - k * 0.16) / 1.3);
          if (rp <= 0) continue;
          const rs = easeOutBack(rp);
          const lift = easeOutCubic(rp) * 58 * u;
          const eyes = clamp01((T - T_EYES - b.eye * 0.5) / 0.5);
          ctx.save();
          ctx.globalAlpha = clamp01(rp * 1.6) * b.a;
          drawBeast(ctx, b.k, bx, by - lift, br * 1.02 * rs, tick + k * 3, u, eyes);
          ctx.restore();
          /* the keeper's seal, stamped on the biggest brow */
          if (b.big && T >= T_FLAG + 0.25) {
            const kp = clamp01((T - T_FLAG - 0.25) / 0.3);
            const ss = 15 * u;
            ctx.save();
            ctx.translate(bx, by - lift - br * 1.18);
            ctx.rotate(-0.08);
            ctx.globalAlpha = (0.72 + 0.28 * Math.sin(T * 5)) * kp;
            ctx.fillStyle = RED;
            sealPath(ctx, ss / 2, 808, 0.06); ctx.fill();
            ctx.strokeStyle = 'rgba(237,231,217,0.85)';
            ctx.lineWidth = 1.2 * u;
            sealPath(ctx, ss / 2 - 3 * u, 809, 0.08); ctx.stroke();
            ctx.restore();
            /* one ring burst the moment it lands */
            const burst = clamp01((T - T_FLAG - 0.25) / 0.5);
            if (burst > 0 && burst < 1) {
              ctx.save();
              ctx.strokeStyle = RED;
              ctx.globalAlpha = (1 - burst) * 0.6;
              ctx.lineWidth = 1.6 * u;
              ctx.beginPath();
              ctx.arc(bx, by - lift - br * 1.18, ss + burst * 34 * u, 0, TAU);
              ctx.stroke();
              ctx.restore();
            }
          }
        }

        /* ---- the captain's standard rises among them ----
           a tall pole, a torn cloth, the run's seal pressed on it —
           the horde is not a mob, it is MARCHING (v22.1) */
        const fp = clamp01((T - T_FLAG) / 0.7);
        if (fp > 0) {
          const px = W * 0.575, py = H * 0.86;
          const h = H * 0.50 * easeOutBack(fp);
          const wave = Math.sin(T * 3.1) * 6 * u;
          ctx.save();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3 * u;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 9 * u, py - h); ctx.stroke();
          /* the plant */
          ctx.beginPath(); ctx.moveTo(px - 12 * u, py); ctx.lineTo(px + 14 * u, py); ctx.stroke();
          /* the cloth: torn hem, live wind */
          const fw = W * 0.155, fh = H * 0.095, fx = px + 9 * u, fy = py - h;
          ctx.fillStyle = PAPER;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.quadraticCurveTo(fx + fw * 0.5, fy - 5 * u + wave, fx + fw, fy + wave);
          ctx.lineTo(fx + fw - fw * 0.16, fy + fh * 0.6 + wave);
          ctx.lineTo(fx + fw * 0.7, fy + fh + wave * 0.5);
          ctx.lineTo(fx + fw * 0.42, fy + fh * 0.55 + wave);
          ctx.lineTo(fx + fw * 0.2, fy + fh * 0.9 + wave);
          ctx.lineTo(fx, fy + fh * 0.48);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = INK; ctx.lineWidth = 1.3 * u; ctx.globalAlpha = 0.9; ctx.stroke();
          /* the seal box pressed into the cloth */
          const sx2 = fx + fw * 0.5, sy2 = fy + fh * 0.4 + wave * 0.6, ssz = fh * 0.42;
          ctx.globalAlpha = 1;
          ctx.fillStyle = RED;
          ctx.fillRect(sx2 - ssz / 2, sy2 - ssz / 2, ssz, ssz);
          ctx.fillStyle = PAPER;
          ctx.font = `${Math.round(ssz * 0.78)}px "Zen Antique", serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('一', sx2, sy2 + 1);
          /* a pennant tail streams under the cloth */
          ctx.strokeStyle = INK; ctx.lineWidth = 1.8 * u; ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.moveTo(fx + fw * 0.2, fy + fh * 0.8);
          ctx.quadraticCurveTo(fx + fw * 0.1, fy + fh * 1.3 + wave, fx + fw * 0.3, fy + fh * 1.7 + wave * 1.3);
          ctx.stroke();
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

    ctx.restore(); /* camera */
    ctx.restore(); /* shake */

    /* ===== progress hairline (rests once the vermilion rises) ===== */
    if (T <= T_RED) {
      const prog = clamp01(T / T_RED);
      ctx.fillStyle = flooded ? 'rgba(26,23,20,0.3)' : 'rgba(237,231,217,0.35)';
      ctx.fillRect(0, H - 2, W * prog, 2);
    }

    /* ===== the ending: one continuous shot =====
       the hanko bleeds — vermilion floods the frame from the mark,
       and the pale washi floods back from the centre: the very
       sheet the title rises from. No paper parade; one breath, one
       move, out. */
    if (!skipping && T > T_RED) {
      const sz = Math.min(W, H) * 0.115;
      const sx = ix + 40 * u * 1.9 * 1.35;               /* the hanko's home */
      const sy = H * 0.58 - 40 * u + 40 * u * 1.9 * 1.05 + sz * 0.42;
      /* the bleed must reach every corner FROM THE SEAL — the mark
         sits low-centre, so a centre-assumed radius strands the far
         corners of a tall phone (measured, not guessed) */
      const maxR = 1.02 * Math.max(
        Math.hypot(sx, sy), Math.hypot(W - sx, sy),
        Math.hypot(sx, H - sy), Math.hypot(W - sx, H - sy));

      /* beat 1 — the vermilion bleeds out from the seal */
      const rp = clamp01((T - T_RED) / 0.95);
      if (rp > 0) {
        const rr = easeOutCubic(rp) * maxR;
        ctx.save();
        ctx.beginPath();
        const segs = 72;
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
          /* the wet rim, lit pale against the paper it eats */
          ctx.strokeStyle = 'rgba(237,231,217,0.65)';
          ctx.lineWidth = 2.4 * u;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(237,231,217,0.18)';
          ctx.lineWidth = 8 * u;
          ctx.stroke();
          /* satellites tear ahead of the bleed */
          for (const s of redEdge) {
            const dT = s.d * maxR;
            if (rr < dT) continue;
            const ap = clamp01((rr - dT) / (46 * u));
            splatPaint(ctx, sx + Math.cos(s.a) * dT, sy + Math.sin(s.a) * dT, s.r, s.seed, 0.9 * ap, RED);
          }
        }
        ctx.restore();

        /* v22.2 the keepers dissolve into the red: their pale ghosts
           stand on the vermilion a last breath, fading as the wash
           takes the sheet back — the paper's own leaving with the
           film that summoned them */
        const gp2 = clamp01((T - T_RED) / 1.1);
        if (gp2 > 0) {
          const horizon = H * 0.28;
          const seats = [
            { x: 0.07, k: 0 }, { x: 0.165, k: 1 }, { x: 0.26, k: 2 },
            { x: 0.355, k: 3 }, { x: 0.45, k: 4 }, { x: 0.545, k: 5 },
            { x: 0.64, k: 6 }, { x: 0.735, k: 7 }, { x: 0.83, k: 8 },
            { x: 0.925, k: 9 },
          ];
          for (let i = 0; i < seats.length; i++) {
            const st = seats[i];
            const fade = clamp01(1 - (T - T_RED - i * 0.08) / 1.7);
            if (fade <= 0) continue;
            const sway = Math.sin(T * 0.5 + i * 1.9) * 3 * u;
            ctx.save();
            ctx.globalAlpha = 0.4 * fade;
            ctx.translate(st.x * W + sway, horizon);
            drawLordSil(ctx, st.k, u);
            ctx.restore();
          }
        }
      }

      /* v22.1 the last word is the title's own: 終 — ONE MORE. */
      if (T >= CAP_END.t0 && T <= CAP_END.t1 + 0.45) {
        const fin = clamp01((T - CAP_END.t0) / 0.45);
        const fout = clamp01((T - CAP_END.t1) / 0.45);
        drawCaption(ctx, CAP_END, fin * (1 - fout), W / 2, H * 0.44, PAPER, u);
      }

      /* beat 2 — the pale washi floods back from the centre */
      const wp = clamp01((T - T_WASH) / 0.75);
      if (wp > 0) {
        const wr = easeOutCubic(wp) * Math.hypot(W, H) * 0.62;
        ctx.save();
        ctx.beginPath();
        const segs = 72;
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * TAU;
          const wob = Math.sin(a * 5 + T * 2.0) * 6 * u + Math.sin(a * 11 - T * 1.3) * 3 * u;
          const x = W / 2 + Math.cos(a) * (wr + wob), y = H * 0.52 + Math.sin(a) * (wr + wob);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(paperC, 0, 0, W, H);
        if (wp < 1) {
          ctx.strokeStyle = 'rgba(178,58,43,0.5)';
          ctx.lineWidth = 2.2 * u;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* ===== cinema bars frame the film =====
       (they lift early in the vermilion flood — invisible against
       the red, and never ghosting over the clean wash) */
    if (!S.reduced) {
      const aIn = easeInOut(clamp01((T - 0.15) / 1.25));
      const aOut = 1 - clamp01((T - (T_RED + 0.1)) / 0.5);
      const a = Math.min(aIn, aOut);
      if (a > 0) {
        const bh = Math.round(H * 0.072);
        ctx.fillStyle = `rgba(8,6,4,${(0.96 * a).toFixed(3)})`;
        ctx.fillRect(0, 0, W, bh);
        ctx.fillRect(0, H - bh, W, bh);
      }
    }

    /* ===== skip fade — the wash lifts the whole film away ===== */
    if (skipping) {
      const overA = clamp01(skipT / 0.32);
      if (overA > 0) {
        ctx.fillStyle = `rgba(237,231,217,${overA})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  /* ============================================================
     v24.10 THE PAINTED DOOR (ported from the One_more_fable build)
     The gate's backdrop is a hand-set ink-wash painted live: a
     vermillion sun, four ranges of mountains in deepening ink,
     pines riding the near crests, mist bands eating their feet,
     birds in the open sky, paper fibers under everything.
     Self-contained — no asset can fail, the ink always arrives.
     ============================================================ */
  const PAPER_RGB = '237,231,217';

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
    const halo = c.createRadialGradient(sx, sy, sr * 0.4, sx, sy, sr * 2.7);
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
    const sg = c.createRadialGradient(sx - sr * 0.28, sy - sr * 0.32, sr * 0.1, sx, sy, sr * 1.02);
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
    const vg = c.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.05, w * 0.5, h * 0.52, Math.max(w, h) * 0.72);
    vg.addColorStop(0, `rgba(${PAPER_RGB},0.34)`);
    vg.addColorStop(0.5, `rgba(${PAPER_RGB},0)`);
    vg.addColorStop(1, 'rgba(96,84,62,0.1)');
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
  }

  return {
    start, skip, update, draw,
    /* v24.10 the painted door — the gate's wash, drawn by the film's own hand */
    paintGate,
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
