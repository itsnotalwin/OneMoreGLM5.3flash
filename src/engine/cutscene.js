'use strict';
/* ============================================================
   ONE MORE — cutscenes: the scroll turns & the journey's end
   Two in-world films drawn in the same ink as everything else.
   CUT.start(kind, data) → CUT.update(dt) / CUT.draw(ctx, t)
   Any key or tap skips (a short fade, never a hard cut).
   ============================================================ */

const CUT = (() => {
  const TAU = Math.PI * 2;
  const RED = '#b23a2b';
  const PALE = '#ede7d9';           /* the eternal sheet the credits land on */

  /* the six sheets, as paint */
  const SHEET = {
    pale:  { paper: '#ede7d9', ink: '#1a1714' },
    dark:  { paper: '#3e372b', ink: '#e9e2d2' },
    red:   { paper: '#eadbc4', ink: '#1a1714' },
    storm: { paper: '#c7cdc9', ink: '#161c1f' },
    gilt:  { paper: '#e7d6ad', ink: '#241c12' },
    silk:  { paper: '#f3eee1', ink: '#201d24' },
  };

  /* the sheets' kanji, in order, for the finale's row of keepers */
  const SHEET_KANJI = AREAS.map(a => a.kanji);

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const easeIO  = p => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const easeBack = p => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };

  /* deterministic rng so each telling is the same within one cutscene */
  function mulberry(s) {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    return () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = Math.imul(t ^ (t >>> 13), 1274126177);
      t ^= t >>> 16;
      return (t >>> 0) / 4294967296;
    };
  }

  /* ---------------- timeline ---------------- */
  const SCROLL_DUR = 5.0;
  const UNROLL_DUR = 3.9;
  const BOSS_DUR = 4.6;      /* a Guardian's entrance */
  const KEEPER_DUR = 3.5;    /* a scene Keeper's */
  const DEATH_DUR = 2.1;     /* the scribe's last breath */
  const FINALE_DUR = 17.6;

  let T = 0, live = false, ended = false, skipping = false, skipT = 0;
  let kind = null, data = null, lastKind = null;
  let W = 0, H = 0, u = 1;
  let onEnd = null;

  /* prepared art (built once per play) */
  let entrance = null;      /* boss film's splats, brush ring & eye sparks */
  let rollEdge = null;      /* wobble samples for the unrolling sheet edge */
  let flicks = [];          /* satellite droplets racing the roll */
  let splats = [];          /* splatter at the kanji's landing */
  let sealSplats = [];      /* red splatter at the hanko */
  let motes = [];           /* rising ink motes (finale) */
  let sheetMarks = [];      /* the six strokes + kanji of the finale */
  let rnd = mulberry(1);

  function plan() {
    rnd = mulberry((Math.random() * 1e9) | 0);
    rollEdge = [];
    for (let i = 0; i <= 48; i++) rollEdge.push((rnd() - 0.5) * 7 * u);
    flicks = [];
    for (let i = 0; i < 9; i++) {
      flicks.push({
        y: (0.08 + rnd() * 0.84) * H,
        r: (1.6 + rnd() * 3.4) * u,
        d: (30 + rnd() * 190) * u,        /* how far ahead of the edge it flies */
        s: 0.7 + rnd() * 0.6,
      });
    }
    splats = [];
    for (let i = 0; i < 6; i++) {
      splats.push({
        a: rnd() * TAU,
        d: (0.16 + rnd() * 0.22),         /* fraction of kanji size */
        r: (2.2 + rnd() * 6.5) * u,
        seed: 100 + i,
      });
    }
    sealSplats = [];
    for (let i = 0; i < 5; i++) {
      sealSplats.push({
        a: rnd() * TAU, d: (0.7 + rnd() * 0.75),
        r: (2.6 + rnd() * 5.5) * u, seed: 300 + i,
      });
    }
    motes = [];
    for (let i = 0; i < 66; i++) {
      motes.push({
        x: rnd(), y: 1 + rnd() * 0.4,
        r: (0.9 + rnd() * 2.4) * u,
        v: (0.055 + rnd() * 0.13),        /* screen heights per second */
        sway: rnd() * TAU, swayAmp: (6 + rnd() * 26) * u,
        a: 0.16 + rnd() * 0.5,
      });
    }
    entrance = { crown: [], eyes: [], dust: [] };
    for (let i = 0; i < 9; i++) {
      entrance.crown.push({ a: rnd() * TAU, d: 0.55 + rnd() * 0.75, r: (2 + rnd() * 6) * u, seed: 500 + i });
    }
    for (let i = 0; i < 26; i++) {
      entrance.dust.push({ x: rnd(), y: 0.15 + rnd() * 0.8, r: (0.6 + rnd() * 1.9) * u, s: 0.2 + rnd() * 0.6, p: rnd() * TAU, a: 0.08 + rnd() * 0.22 });
    }
    sheetMarks = [];
    const six = ['一', '夜', '紅', '嵐', '金', '素'];
    for (let i = 0; i < 6; i++) {
      sheetMarks.push({
        x: W * (0.5 + (i - 2.5) * 0.105),
        y: H * 0.40,
        kanji: SHEET_KANJI[i] || six[i],
        t0: 4.65 + i * 0.48,
        seed: 40 + i,
      });
    }
  }

  /* ---------------- lifecycle ---------------- */
  function start(k, d) {
    kind = k; lastKind = k; data = d || {};
    T = 0; live = true; ended = false; skipping = false; skipT = 0;
    const S = G.S;
    W = S.W; H = S.H; u = Math.min(W, H) / 800;
    plan();
    /* warm the display faces so the stamps land crisp */
    try {
      if (document.fonts) {
        document.fonts.load('200px "Zen Antique"');
        document.fonts.load('700 200px "Shippori Mincho"');
        document.fonts.load('14px "IBM Plex Mono"');
      }
    } catch (e) {}
    if (kind === 'scroll') SFX.gong();
    else if (kind === 'finale') SFX.gong();
    else if (kind === 'boss') { SFX.elite(); setTimeout(() => { try { SFX.gong(); } catch (e) {} }, 700); }
    else if (kind === 'death') SFX.over();
    else if (kind === 'unroll') SFX.thud();   /* the roll's first knock */
  }

  function skip() {
    if (!live || ended || skipping) return;
    skipping = true; skipT = 0;
  }

  function cancel() {
    live = false; ended = true; skipping = false;
  }

  function finish() {
    if (ended) return;
    ended = true; live = false;
    if (onEnd) onEnd();
  }

  function update(dt) {
    if (!live || ended) return;
    dt_last = dt;
    T += dt;
    if (skipping) {
      skipT += dt;
      if (skipT >= 0.32) { finish(); return; }
    }
    /* beat sounds */
    if (kind === 'scroll') {
      if (crossed(1.12)) SFX.pick(0);
      if (crossed(3.1)) SFX.hanko();
    } else if (kind === 'unroll') {
      if (crossed(1.12)) SFX.pick(4);           /* the crest lands */
      if (crossed(2.5)) SFX.hanko();            /* the red seal presses */
    } else if (kind === 'boss') {
      if (crossed(0.9)) SFX.wave(true);
      if (crossed(1.75)) SFX.hanko();
      if (crossed(2.6)) SFX.elite();
    } else if (kind === 'death') {
      if (crossed(0.55)) SFX.thud();
      if (crossed(1.25)) SFX.hanko();
    } else if (kind === 'finale') {
      for (const m of sheetMarks) if (crossed(m.t0)) SFX.pick((m.t0 * 3) | 0);
      if (crossed(12.9)) SFX.hanko();
    }
    const isKeeper = kind === 'boss' && data && data.keeper;
    const dur = kind === 'scroll' ? SCROLL_DUR : kind === 'unroll' ? UNROLL_DUR
      : kind === 'boss' ? (isKeeper ? KEEPER_DUR : BOSS_DUR)
      : kind === 'death' ? DEATH_DUR : FINALE_DUR;
    if (T >= dur) finish();
  }

  /* has the timeline just crossed time t? (tolerant of hitches) */
  let dt_last = 0;
  function crossed(t) {
    return T >= t && T - dt_last < t;
  }


  /* ---- local ink primitives for the entrance (no source coupling) ---- */
  let _brL = new Float64Array(0), _brR = new Float64Array(0);
  function strokeScratchLocal(n) {
    if (n * 2 > _brL.length) { _brL = new Float64Array(n * 2); _brR = new Float64Array(n * 2); }
  }
  function blobPathLocal(c, x, y, r, seed, wob, n) {
    const rnd = mulberry(seed || 7);
    const pts = [];
    for (let i = 0; i < (n || 11); i++) {
      const a = (i / (n || 11)) * TAU;
      const rr = r * (1 + (rnd() * 2 - 1) * (wob || 0.16));
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
    }
    c.beginPath();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[pts.length - 1], pts[0]);
    c.moveTo(m[0], m[1]);
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(i + 1) % pts.length];
      m = mid(pts[i], q);
      c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    c.closePath();
  }
  function teardropLocal(c, r) {
    c.beginPath();
    c.moveTo(r * 1.75, 0);
    c.quadraticCurveTo(r * 0.35, r * 0.95, -r * 0.15, r * 0.62);
    c.arc(-r * 0.15, 0, r * 0.62, Math.PI * 0.5, Math.PI * 1.5);
    c.quadraticCurveTo(r * 0.35, -r * 0.95, r * 1.75, 0);
    c.closePath();
  }
  function sealBoxLocal(c, half, seed, wob) {
    const rnd = mulberry(seed || 77);
    const corner = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const pts = [];
    for (let e = 0; e < 4; e++) {
      const a = corner[e], b = corner[(e + 1) % 4];
      for (let i = 0; i < 4; i++) {
        const t = i / 4;
        pts.push([
          (a[0] + (b[0] - a[0]) * t) * half + (rnd() - 0.5) * half * (wob || 0.055) * 2,
          (a[1] + (b[1] - a[1]) * t) * half + (rnd() - 0.5) * half * (wob || 0.055) * 2,
        ]);
      }
    }
    c.beginPath();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[pts.length - 1], pts[0]);
    c.moveTo(m[0], m[1]);
    for (let i = 0; i < pts.length; i++) {
      const q = pts[(i + 1) % pts.length];
      m = mid(pts[i], q);
      c.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    c.closePath();
  }

  /* ---------------- shared ink helpers ---------------- */

  /* a hand-cut splat: fat core, satellites, a droplet flung out */
  function splatPaint(c, x, y, r, seed, alpha, color) {
    const rr = mulberry(seed);
    c.save();
    c.fillStyle = color || '#1a1714';
    c.globalAlpha = alpha;
    c.beginPath();
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const wob = 1 + (rr() - 0.5) * 0.42;
      const px = x + Math.cos(a) * r * wob;
      const py = y + Math.sin(a) * r * wob * 0.92;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    for (let i = 0; i < 3; i++) {
      const a = rr() * TAU, d = r * (1.15 + rr() * 0.8);
      c.beginPath();
      c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.1 + rr() * 0.16), 0, TAU);
      c.fill();
    }
    c.restore();
  }

  /* a calligraphic multi-pass stamp of one glyph — wobbly, deep, alive */
  function stampGlyph(c, ch, x, y, size, color, alpha, rot, seed) {
    const rr = mulberry(seed);
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.font = `${Math.round(size)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) {
      c.globalAlpha = alpha * (1 - i * 0.3);
      c.fillStyle = color;
      c.fillText(ch, (rr() - 0.5) * size * 0.022, (rr() - 0.5) * size * 0.022);
    }
    /* dry-brush lifts: erase thin streaks through the glyph */
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2; i++) {
      c.globalAlpha = alpha * 0.5;
      const sy = (rr() - 0.5) * size * 0.7;
      c.fillRect(-size * 0.5, sy, size, size * 0.018);
    }
    c.restore();
  }

  /* the red hanko — hand-cut square, wobbled border, carved mark */
  function drawSeal(c, x, y, sz, ch, pop, seed) {
    if (pop <= 0) return;
    const rr = mulberry(seed);
    const half = sz / 2;
    c.save();
    c.translate(x, y);
    c.rotate((rr() - 0.5) * 0.12);
    c.scale(pop, pop);
    c.globalAlpha = Math.min(1, pop * 1.4);
    c.fillStyle = RED;
    c.beginPath();
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const rx = half * (1 + (rr() - 0.5) * 0.09);
      const ry = half * (1 + (rr() - 0.5) * 0.09);
      const px = Math.cos(a) * rx * 1.18, py = Math.sin(a) * ry;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(237,231,217,0.92)';
    c.font = `${Math.round(sz * 0.62)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch, 0, sz * 0.03);
    c.restore();
  }

  /* a caption: small red seal-dot, mono caps, tracking, paper halo */
  function caption(c, txt, x, y, a, ink, paper) {
    if (a <= 0) return;
    c.save();
    c.font = `500 ${Math.round(13 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = a * 0.55;
    c.fillStyle = paper;
    c.fillText(txt, x, y + 1);
    c.globalAlpha = a;
    c.fillStyle = ink;
    c.fillText(txt, x, y);
    const w = c.measureText(txt).width;
    c.globalAlpha = a * 0.9;
    c.fillStyle = RED;
    c.beginPath();
    c.arc(x - w / 2 - 16 * u, y, 2.2 * u, 0, TAU);
    c.fill();
    c.restore();
  }

  /* cinema bars — the frame every film speaks in; eased by the caller */
  function drawBars(c, a) {
    if (a <= 0) return;
    const bh = Math.round(H * 0.072);
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, a)) * 0.96;
    c.fillStyle = '#0b0906';
    c.fillRect(0, 0, W, bh);
    c.fillRect(0, H - bh, W, bh);
    c.restore();
  }

  /* ================= THE SCROLL TURNS ================= */
  /* the new sheet rolls in from the right, announces itself, soaks in */
  function drawScroll(c) {
    const d = data;
    const area = d.area;
    const th = SHEET[area.theme] || SHEET.pale;
    const ink = th.ink, paper = th.paper;
    const deep = !!d.deep;

    /* ---- beat 1: the sheet rolls in (0 → 1.15) ---- */
    const rollP = easeIO(clamp01(T / 1.15));
    const rollR = 30 * u;
    const edgeX = W + rollR * 2 - rollP * (W + rollR * 2 + 2 * u);
    if (rollP < 1) {
      /* satellite droplets race ahead of the edge — haloed so they read
         on any sheet beneath */
      for (const f of flicks) {
        const fp = clamp01(rollP * 1.35 - f.s * 0.12);
        if (fp <= 0 || fp >= 1) continue;
        const fx = edgeX + f.d * easeOut(fp);
        const fy = f.y + Math.sin(fp * 9 + f.s * 7) * 8 * u * (1 - fp);
        c.globalAlpha = (1 - fp) * 0.5;
        c.fillStyle = paper;
        c.beginPath();
        c.arc(fx, fy, f.r * 2.1 * (1 - fp * 0.3), 0, TAU);
        c.fill();
        c.globalAlpha = (1 - fp) * 0.85;
        c.fillStyle = '#1a1714';
        c.beginPath();
        c.arc(fx, fy, f.r * (1 - fp * 0.4), 0, TAU);
        c.fill();
      }
      c.globalAlpha = 1;
      /* the sheet itself, its left edge a rolled cylinder */
      c.save();
      c.beginPath();
      c.moveTo(edgeX + rollEdge[0], -20);
      for (let i = 1; i <= 48; i++) {
        const yy = -20 + (H + 40) * (i / 48);
        c.lineTo(edgeX + rollEdge[i], yy);
      }
      c.lineTo(W + 40, H + 20);
      c.lineTo(W + 40, -20);
      c.closePath();
      c.fillStyle = paper;
      c.fill();
      /* roll cylinder: a darker band, an ink lip, a dry shadow cast ahead */
      const bandW = rollR * 2.4;
      const g = c.createLinearGradient(edgeX - bandW, 0, edgeX + bandW * 0.4, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.16)');
      c.fillStyle = g;
      c.fillRect(edgeX - bandW, -20, bandW, H + 40);
      c.strokeStyle = ink;
      c.lineWidth = 5 * u;
      c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i <= 48; i++) {
        const yy = -20 + (H + 40) * (i / 48);
        const px = edgeX + rollEdge[i];
        if (i === 0) c.moveTo(px, yy); else c.lineTo(px, yy);
      }
      c.stroke();
      /* the spiral of the roll, hinted — one tight turn hugging the lip */
      c.globalAlpha = 0.34;
      c.lineWidth = 2.2 * u;
      c.beginPath();
      c.arc(edgeX + 3 * u, H * 0.5, rollR * 0.62, 0.5, 5.2);
      c.stroke();
      c.restore();
    }

    /* ---- the settled sheet: opaque paper under every announcement ---- */
    const tSettled = T - 1.12;
    if (tSettled > 0) {
      /* everything lifts away at the end */
      const lift = clamp01((T - (SCROLL_DUR - 0.85)) / 0.8);
      if (lift < 1) {
        c.globalAlpha = 1 - easeIO(lift);
        c.fillStyle = paper;
        c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
      const liftY = -easeIO(lift) * 26 * u;
      const fade = 1 - lift;

      /* kicker */
      const kickTxt = deep
        ? 'THE SCROLL TURNS FOREVER'
        : `SHEET ${UI.toKanji(d.cycle + 1)} OF ${UI.toKanji(AREAS.length)}`;
      const kickA = clamp01(tSettled / 0.4) * fade;
      if (kickA > 0) {
        c.save();
        c.font = `600 ${Math.round(12 * Math.max(0.85, u))}px "IBM Plex Mono", monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.globalAlpha = kickA * 0.75;
        c.fillStyle = ink;
        c.fillText(kickTxt.split('').join('\u200a'), W / 2, H * 0.235 + liftY);
        c.restore();
      }

      /* the great kanji of the sheet, stamped like a seal block */
      const kA = clamp01((tSettled - 0.12) / 0.5);
      if (kA > 0) {
        const pop = easeBack(kA);
        const ksz = 190 * Math.max(0.72, u) * (0.9 + 0.1 * pop);
        const kx = W / 2, ky = H * 0.46 + liftY;
        c.save();
        c.globalAlpha = 0.09 * fade;
        c.fillStyle = ink;
        c.beginPath();
        c.arc(kx, ky, ksz * 0.62, 0, TAU);
        c.fill();
        c.restore();
        stampGlyph(c, area.kanji, kx, ky, ksz, ink, 0.94 * fade, -0.015, 77);
        /* the landing splats, first press only */
        const land = clamp01((tSettled - 0.3) / 0.25);
        if (land > 0 && land < 1) {
          for (const s of splats) {
            const px = kx + Math.cos(s.a) * ksz * s.d;
            const py = ky + Math.sin(s.a) * ksz * s.d;
            splatPaint(c, px, py, s.r * (0.7 + land * 0.3), s.seed, 0.5 * fade, ink);
          }
        }
      }

      /* the sheet's name, pressed in by an underline stroke */
      const nA = clamp01((tSettled - 0.62) / 0.45) * fade;
      if (nA > 0) {
        c.save();
        c.font = `600 ${Math.round(30 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.globalAlpha = nA;
        c.fillStyle = ink;
        const ny = H * 0.615 + liftY;
        c.fillText(area.name, W / 2, ny);
        c.restore();
        /* underline — one wet stroke with pressure and a flick tail */
        const up = clamp01((tSettled - 0.72) / 0.4);
        if (up > 0) {
          const uw = Math.min(W * 0.42, 460 * u);
          const uy = H * 0.615 + 26 * u + liftY;
          const rr = mulberry(911);
          const steps = Math.floor(64 * up);
          c.save();
          c.fillStyle = ink;
          for (let i = 0; i <= steps; i++) {
            const q = i / 64;
            const press = q < 0.12 ? 0.5 + q * 4 : q > 0.8 ? Math.max(0.12, (1 - q) * 2.4) : 1;
            const px = W / 2 - uw / 2 + uw * q;
            const py = uy + (rr() - 0.5) * 2.2 * u + Math.sin(q * 5.2) * 1.6 * u;
            c.globalAlpha = 0.85 * fade;
            c.beginPath();
            c.arc(px, py, 5.4 * u * press + 0.4, 0, TAU);
            c.fill();
          }
          /* the tail flick */
          if (up > 0.92) {
            const fp = (up - 0.92) / 0.08;
            c.globalAlpha = (1 - fp) * 0.7 * fade;
            c.beginPath();
            c.arc(W / 2 + uw / 2 + 16 * u * fp, uy + 6 * u * fp, 2.4 * u * (1 - fp) + 0.4, 0, TAU);
            c.fill();
          }
          c.restore();
        }
      }

      /* the sheet's temperament */
      const dA = clamp01((tSettled - 0.98) / 0.5) * fade;
      if (dA > 0) {
        c.save();
        c.font = `400 ${Math.round(13 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.globalAlpha = dA * 0.66;
        c.fillStyle = ink;
        c.fillText(area.desc, W / 2, H * 0.695 + liftY);
        c.restore();
      }

      /* the red hanko of the sheet, pressed beside the kanji */
      const sA = clamp01((tSettled - 1.9) / 0.18);
      if (sA > 0) {
        const pop = 0.6 + 0.4 * easeOut(sA);
        const sx = W / 2 + 108 * Math.max(0.72, u), sy = H * 0.46 + 92 * Math.max(0.72, u) + liftY;
        drawSeal(c, sx, sy, 44 * Math.max(0.8, u), area.kanji, pop, 55);
        if (sA < 1) {
          for (const s of sealSplats) {
            splatPaint(c, sx + Math.cos(s.a) * 30 * u * s.d, sy + Math.sin(s.a) * 30 * u * s.d,
              s.r, s.seed, 0.7 * (1 - sA) * fade, RED);
          }
        }
      }
    }

    /* ---- the bars ease in as the sheet covers the world, lift before it goes ---- */
    drawBars(c, Math.min(clamp01((T - 0.95) / 0.45), clamp01((SCROLL_DUR - 0.7 - T) / 0.5)));

    /* ---- the skip veil ---- */
    if (skipping) {
      c.globalAlpha = clamp01(skipT / 0.32);
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  /* ================= THE SCROLL UNROLLS =================
     A Guardian has fallen. Across the living field — beneath
     the beasts still dying, the motes still hanging — the next
     sheet unrolls itself, left to right, a wet edge racing on
     ahead. It announces its crest, wears its red seal, and is
     gone. Short, bright, skippable; the run resumes where it
     stood. An overlay film: the world stays visible around it. */
  function drawUnroll(c) {
    const area = data.area;             /* the sheet just cleared */
    const nxt = data.next;              /* the sheet being unrolled */
    const th = SHEET[nxt.theme] || SHEET.pale;
    const ink = th.ink, paper = th.paper;
    /* the skip veil is a vanish, not a wash — the world waits beneath */
    const fade = skipping ? 1 - clamp01(skipT / 0.32) : 1;
    if (fade <= 0) return;

    /* the band: centered, sized to the frame, in the NEW sheet's paper */
    const bw = Math.min(W * 0.8, 940 * u);
    const bh = Math.min(H * 0.44, 330 * u);
    const x0 = (W - bw) / 2;
    const cy = H * 0.46;
    const y0 = cy - bh / 2;
    const fu = Math.max(0.8, u);

    /* everything rides a slow lift away at the end */
    const lift = clamp01((T - (UNROLL_DUR - 0.75)) / 0.7);
    const liftY = -easeIO(lift) * 26 * u;
    const life = 1 - lift;
    const ga = a => { c.globalAlpha = Math.max(0, Math.min(1, a * fade)); };

    /* the world dims a touch so the unrolling paper owns the eye */
    const dim = 0.34 * clamp01(T / 0.4) * life;
    if (dim > 0) {
      c.globalAlpha = dim;
      c.fillStyle = '#14110e';
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }

    /* ---- beat 1: the unroll (0 → 0.85) ---- */
    const rollP = easeIO(clamp01(T / 0.85));
    const rollR = 24 * u;
    const edgeX = x0 - rollR * 2 + rollP * (bw + rollR * 2 + 2 * u);
    const revealR = Math.min(x0 + bw, edgeX);

    /* droplets race ahead of the wet edge, haloed for any sheet beneath */
    if (rollP < 1) {
      for (const f of flicks) {
        const fp = clamp01(rollP * 1.3 - f.s * 0.1);
        if (fp <= 0 || fp >= 1) continue;
        const fx = edgeX + f.d * easeOut(fp) * 0.5;
        const fy = cy + (f.y - 0.5) * bh * 0.9 + liftY;
        ga((1 - fp) * 0.5);
        c.fillStyle = paper;
        c.beginPath();
        c.arc(fx, fy, f.r * 2.1 * (1 - fp * 0.3), 0, TAU);
        c.fill();
        ga((1 - fp) * 0.85);
        c.fillStyle = '#1a1714';
        c.beginPath();
        c.arc(fx, fy, f.r * (1 - fp * 0.4), 0, TAU);
        c.fill();
      }
      /* a dry shadow cast ahead of the roll, onto the world */
      const shW = 60 * u;
      const g = c.createLinearGradient(revealR, 0, revealR + shW, 0);
      g.addColorStop(0, 'rgba(10,8,6,0.34)');
      g.addColorStop(1, 'rgba(10,8,6,0)');
      c.globalAlpha = fade;
      c.fillStyle = g;
      c.fillRect(revealR, y0 - 20, shW, bh + 40);
      c.globalAlpha = 1;
    }

    /* the revealed paper, its right edge the traveling roll */
    if (rollP > 0.001 && life > 0) {
      c.save();
      c.translate(0, liftY);
      c.beginPath();
      c.moveTo(x0, y0 - 10);
      c.lineTo(revealR + rollEdge[0], y0 - 10);
      for (let i = 1; i <= 48; i++) {
        const yy = y0 - 10 + (bh + 20) * (i / 48);
        c.lineTo(revealR + rollEdge[i], yy);
      }
      c.lineTo(x0, y0 + bh + 10);
      c.closePath();
      c.globalAlpha = life;
      c.fillStyle = paper;
      c.fill();
      /* the roll cylinder hugging the traveling edge */
      if (rollP < 1) {
        const bandW = rollR * 2.4;
        const g = c.createLinearGradient(revealR - bandW, 0, revealR + bandW * 0.4, 0);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.16)');
        c.fillStyle = g;
        c.fillRect(revealR - bandW, y0 - 10, bandW, bh + 20);
        c.strokeStyle = ink;
        c.lineWidth = 4 * u;
        c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i <= 48; i++) {
          const yy = y0 - 10 + (bh + 20) * (i / 48);
          const px = revealR + rollEdge[i];
          if (i === 0) c.moveTo(px, yy); else c.lineTo(px, yy);
        }
        c.stroke();
        /* the spiral of the roll, hinted — one tight turn at the lip */
        c.globalAlpha = life * 0.34;
        c.lineWidth = 2 * u;
        c.beginPath();
        c.arc(revealR + 3 * u, cy, rollR * 0.62, 0.5, 5.2);
        c.stroke();
      }
      /* the left rod, from which the sheet unrolls */
      c.globalAlpha = life;
      c.fillStyle = ink;
      c.fillRect(x0 - 7 * u, y0 - 16 * u, 5.5 * u, bh + 32 * u);
      c.fillStyle = 'rgba(237,231,217,0.28)';
      c.fillRect(x0 - 6 * u, y0 - 14 * u, 1.4 * u, bh + 28 * u);
      /* the right rod arrives as the roll reaches home */
      const rodA = clamp01((rollP - 0.9) / 0.1);
      if (rodA > 0) {
        c.globalAlpha = life * rodA;
        c.fillStyle = ink;
        c.fillRect(x0 + bw + 1.5 * u, y0 - 16 * u, 5.5 * u, bh + 32 * u);
        c.fillStyle = 'rgba(237,231,217,0.28)';
        c.fillRect(x0 + bw + 2.5 * u, y0 - 14 * u, 1.4 * u, bh + 28 * u);
      }
      c.restore();
    }

    /* ---- beat 2: the announcements (0.95 → 2.9) ---- */
    const tS = T - 0.95;
    if (tS > 0 && life > 0) {
      c.save();
      c.translate(0, liftY);
      /* the cleared scroll's epitaph */
      const kickA = clamp01(tS / 0.4);
      if (kickA > 0) {
        c.font = `600 ${Math.round(12 * fu)}px "IBM Plex Mono", monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        ga(kickA * 0.72 * life);
        c.fillStyle = ink;
        c.fillText(
          `SCROLL ${area.kanji} ${area.name} — CLEARED IN FULL`.split('').join('\u200a'),
          W / 2, y0 + bh * 0.16);
        c.globalAlpha = 1;
      }
      /* the great kanji of the new sheet, stamped like a seal block */
      const kA = clamp01((tS - 0.17) / 0.5);
      if (kA > 0) {
        const pop = easeBack(kA);
        const ksz = bh * 0.46 * (0.9 + 0.1 * pop);
        const kx = W / 2, ky = cy + bh * 0.06;
        ga(0.09 * life);
        c.fillStyle = ink;
        c.beginPath();
        c.arc(kx, ky, ksz * 0.6, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
        stampGlyph(c, nxt.kanji, kx, ky, ksz, ink, 0.94 * life * fade, -0.015, 77);
        const land = clamp01((tS - 0.35) / 0.25);
        if (land > 0 && land < 1) {
          for (const s of splats) {
            const px = kx + Math.cos(s.a) * ksz * s.d;
            const py = ky + Math.sin(s.a) * ksz * s.d;
            splatPaint(c, px, py, s.r * (0.7 + land * 0.3), s.seed, 0.5 * life * fade, ink);
          }
        }
      }
      /* the name, pressed in by an underline stroke */
      const nA = clamp01((tS - 0.62) / 0.45);
      if (nA > 0) {
        c.font = `600 ${Math.round(26 * fu)}px "IBM Plex Mono", monospace`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        ga(nA * 0.95 * life);
        c.fillStyle = ink;
        c.fillText(`${nxt.name} · ${nxt.ink}`, W / 2, y0 + bh * 0.80);
        c.globalAlpha = 1;
        const up = clamp01((tS - 0.72) / 0.4);
        if (up > 0) {
          const uw = Math.min(bw * 0.56, 430 * u);
          const uy = y0 + bh * 0.80 + 21 * fu;
          const rr = mulberry(911);
          const steps = Math.floor(56 * up);
          c.fillStyle = ink;
          for (let i = 0; i <= steps; i++) {
            const q = i / 56;
            const press = q < 0.12 ? 0.5 + q * 4 : q > 0.8 ? Math.max(0.12, (1 - q) * 2.4) : 1;
            const px = W / 2 - uw / 2 + uw * q;
            const py = uy + (rr() - 0.5) * 2 * u + Math.sin(q * 5.2) * 1.4 * u;
            ga(0.82 * life);
            c.beginPath();
            c.arc(px, py, 4.2 * u * press + 0.4, 0, TAU);
            c.fill();
          }
          c.globalAlpha = 1;
        }
      }
      /* the red hanko of the new sheet, pressed beside the crest */
      const sA = clamp01((tS - 1.55) / 0.18);
      if (sA > 0) {
        const pop = 0.6 + 0.4 * easeOut(sA);
        const sx = W / 2 + bh * 0.40, sy = cy - bh * 0.12;
        drawSeal(c, sx, sy, bh * 0.17, nxt.kanji, pop * life * fade, 55);
        if (sA < 1) {
          for (const s of sealSplats) {
            splatPaint(c, sx + Math.cos(s.a) * bh * 0.09 * s.d, sy + Math.sin(s.a) * bh * 0.09 * s.d,
              s.r, s.seed, 0.7 * (1 - sA) * life * fade, RED);
          }
        }
      }
      c.restore();
    }

    /* the skip veil is the film's own alpha — already applied */
  }

  /* ================= THE JOURNEY'S END ================= */
  /* the ink stills, the six keepers bow, the brush closes the circle */
  function drawFinale(c) {
    const th = SHEET.silk;
    const paper = PALE;                 /* everything lands on the eternal sheet */
    const ink = '#1a1714';

    /* ---- beat 1: the world stills beneath (0 → ~3) ---- */
    /* rising motes begin over the living world */
    const moteA = clamp01(T / 1.4);
    if (T < 5.4) {
      c.save();
      for (const m of motes) {
        const mp = (m.y - T * m.v) % 1.4;
        const my = mp < 0 ? mp + 1.4 : mp;
        const mx = m.x * W + Math.sin(T * 0.8 + m.sway) * m.swayAmp;
        c.globalAlpha = m.a * moteA * clamp01(my * 4) * (1 - clamp01((T - 4.2) / 1.2));
        c.fillStyle = th.ink;
        c.beginPath();
        c.arc(mx, my * H, m.r, 0, TAU);
        c.fill();
      }
      c.restore();
    }

    /* caption A/B over the stilling world */
    caption(c, 'THE SIXTH GUARDIAN FALLS.', W / 2, H * 0.3, clamp01((T - 0.55) / 0.5) * (1 - clamp01((T - 2.5) / 0.5)), th.ink, th.paper);
    caption(c, 'THE INK STILLS.', W / 2, H * 0.37, clamp01((T - 2.55) / 0.45) * (1 - clamp01((T - 3.35) / 0.6)), th.ink, th.paper);

    /* ---- beat 2: the world washes to the eternal sheet (2.9 → 4.4) ---- */
    const wash = easeIO(clamp01((T - 2.9) / 1.5));
    if (wash > 0) {
      c.globalAlpha = wash;
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }

    /* ---- beat 3: the six sheets, remembered (4.6 → 7.2) ---- */
    for (const m of sheetMarks) {
      const kA = clamp01((T - m.t0) / 0.42);
      if (kA <= 0) continue;
      const pop = easeBack(kA);
      const fade = 1 - clamp01((T - 9.4) / 1.1);
      /* a vertical stroke beneath, drawn top to bottom */
      const rr = mulberry(m.seed);
      const steps = Math.floor(26 * clamp01((T - m.t0) / 0.5));
      c.save();
      c.fillStyle = ink;
      for (let i = 0; i <= steps; i++) {
        const q = i / 26;
        const press = q < 0.15 ? 0.55 + q * 3 : q > 0.75 ? Math.max(0.15, (1 - q) * 3) : 1;
        c.globalAlpha = 0.82 * fade * (0.5 + 0.5 * press);
        c.beginPath();
        c.arc(m.x + (rr() - 0.5) * 3.4 * u + Math.sin(q * 6 + m.seed) * 2.6 * u,
              m.y + 58 * u + q * 78 * u, (4.6 * u * press) + 0.3, 0, TAU);
        c.fill();
      }
      c.restore();
      stampGlyph(c, m.kanji, m.x, m.y, 40 * Math.max(0.8, u) * (0.9 + 0.1 * pop), ink, 0.92 * fade, (rr() - 0.5) * 0.06, m.seed * 13);
    }

    caption(c, 'SIX SHEETS. SIX KEEPERS.', W / 2, H * 0.62,
      clamp01((T - 7.15) / 0.5) * (1 - clamp01((T - 9.2) / 0.7)), ink, paper);

    /* ---- beat 4: the brush spirit closes the circle (8.6 → 12.6) ---- */
    const enso = {
      cx: W / 2, cy: H * 0.47, R: Math.min(W, H) * 0.30,
      a0: -Math.PI * 0.62, a1: Math.PI * 1.24,   /* the gap faces right-down */
      t0: 9.2, t1: 12.6,
    };
    const spiritT = clamp01((T - 8.6) / 0.9);
    if (spiritT > 0) {
      const p = clamp01((T - enso.t0) / (enso.t1 - enso.t0));
      const ang = enso.a0 + (enso.a1 - enso.a0) * easeIO(p);
      /* spirit position rides the arc once painting starts */
      const sx = enso.cx + Math.cos(ang) * enso.R;
      const sy = enso.cy + Math.sin(ang) * enso.R;
      const enter = easeOut(spiritT);
      const bx = enso.cx + (sx - enso.cx) * enter;
      const by = H + 60 * u - (H + 60 * u - sy) * enter;

      /* the circle itself: pressure dabs with a dry tail */
      if (p > 0) {
        const steps = 720;
        const done = Math.floor(steps * p);
        c.save();
        c.fillStyle = ink;
        for (let i = 0; i <= done; i++) {
          const q = i / steps;
          const a = enso.a0 + (enso.a1 - enso.a0) * q;
          /* pressure: press-in, full body, lift through the last 12% */
          const press = q < 0.1 ? 0.6 + q * 4 : q > 0.86 ? Math.max(0.16, (1 - q) * 5.5) : 1;
          const wob = 1 + Math.sin(q * 21 + 3) * 0.09;
          c.globalAlpha = 0.16 * (1 - clamp01((q - 0.94) * 8)) * (0.55 + 0.45 * press);
          c.beginPath();
          c.arc(enso.cx + Math.cos(a) * enso.R + (q * 617) % 3 - 1.5,
                enso.cy + Math.sin(a) * enso.R * 0.995, enso.R * 0.052 * press * wob + 0.5, 0, TAU);
          c.fill();
        }
        /* a landing pool where the stroke began */
        c.globalAlpha = 0.12;
        c.beginPath();
        c.arc(enso.cx + Math.cos(enso.a0) * enso.R, enso.cy + Math.sin(enso.a0) * enso.R, enso.R * 0.07, 0, TAU);
        c.fill();
        c.restore();
      }

      /* the spirit: a drop of ink that stands */
      const bodyR = 20 * Math.max(0.85, u);
      c.save();
      c.translate(bx, by);
      /* paper halo so it reads on any sheet */
      c.globalAlpha = 0.5;
      c.fillStyle = paper;
      c.beginPath();
      c.arc(0, 0, bodyR * 2.1, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
      /* body */
      c.fillStyle = ink;
      c.beginPath();
      c.ellipse(0, 0, bodyR * 0.94, bodyR * 1.07, 0, 0, TAU);
      c.fill();
      /* the brush: carried slung, then angled to the tip it paints with */
      const carry = p <= 0 ? -0.5 : (-0.2 + Math.sin(ang) * 0.35);
      c.save();
      c.rotate(carry);
      c.strokeStyle = ink;
      c.lineCap = 'round';
      c.lineWidth = 3.4 * u;
      c.beginPath();
      c.moveTo(bodyR * 0.2, -bodyR * 0.5);
      c.lineTo(bodyR * 1.5, -bodyR * 1.7);
      c.stroke();
      c.lineWidth = 6.5 * u;
      c.beginPath();
      c.moveTo(bodyR * 1.5, -bodyR * 1.7);
      c.lineTo(bodyR * 1.62, -bodyR * 1.82);
      c.stroke();
      c.restore();
      /* the eye */
      c.strokeStyle = paper;
      c.lineWidth = 1.6 * u;
      c.beginPath();
      c.arc(-bodyR * 0.1, -bodyR * 0.12, bodyR * 0.34, 0.35, 2.4);
      c.stroke();
      c.restore();

      /* the wet tip dot where the brush meets the sheet */
      if (p > 0 && p < 1) {
        c.globalAlpha = 0.85;
        c.fillStyle = ink;
        c.beginPath();
        c.arc(sx, sy, 3.2 * u, 0, TAU);
        c.fill();
        c.globalAlpha = 1;
      }
    }

    caption(c, 'THE PAPER ASKS FOR ONE MORE.', W / 2, H * 0.47 + Math.min(W, H) * 0.30 + 42 * u,
      clamp01((T - 11.6) / 0.5) * (1 - clamp01((T - 13.2) / 0.6)), ink, paper);

    /* ---- beat 5: the seal (12.9) ---- */
    const sealT = clamp01((T - 12.9) / 0.2);
    if (sealT > 0) {
      const gapA = Math.PI * 1.24;                    /* the enso's gap */
      const sx = enso.cx + Math.cos(gapA) * enso.R + 6 * u;
      const sy = enso.cy + Math.sin(gapA) * enso.R;
      drawSeal(c, sx, sy, 40 * Math.max(0.85, u), '一', 0.6 + 0.4 * easeOut(sealT), 909);
      if (sealT < 1) {
        for (const s of sealSplats) {
          splatPaint(c, sx + Math.cos(s.a) * 26 * u * s.d, sy + Math.sin(s.a) * 26 * u * s.d,
            s.r, s.seed, 0.65 * (1 - sealT), RED);
        }
      }
    }

    /* ---- the circle rests: wash the sheet clean before the credits (13.35 → 14.15) ---- */
    const crWash = easeIO(clamp01((T - 13.35) / 0.8));
    if (crWash > 0) {
      c.globalAlpha = crWash;
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }

    /* ---- beat 6: the credits roll (13.7 → end) ---- */
    const crT = T - 13.7;
    if (crT > 0) {
      const rollDur = 3.1;
      const rp = easeIO(clamp01(crT / rollDur));
      const fadeAll = 1 - clamp01((T - (FINALE_DUR - 0.7)) / 0.7);
      /* the whole roll slides up from below the fold and rests centered */
      const slide = (1 - rp) * H * 0.86;
      const a = clamp01(crT / 0.4) * fadeAll;

      c.save();
      c.translate(W / 2, 0);
      const lines = [
        { t: '一', f: `700 ${Math.round(44 * Math.max(0.8, u))}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`, col: RED, gap: 30 },
        { t: 'ONE MORE', f: `700 ${Math.round(42 * Math.max(0.8, u))}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`, col: ink, gap: 14 },
        { t: 'A MONOCHROME SURVIVAL', f: `500 ${Math.round(12 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 34 },
        { t: 'INK · PAPER · BEASTS — ONE BRUSH', f: `400 ${Math.round(13 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 12 },
        { t: 'SIX SHEETS · SIX KEEPERS · NO ENDINGS', f: `400 ${Math.round(13 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 34 },
        { t: 'EVERY STROKE STAYS ON THE SHEET', f: `400 ${Math.round(12 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 10 },
        { t: 'THE PAPER KEEPS WHAT YOU PAINTED', f: `400 ${Math.round(12 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 40 },
        { t: 'for every player who asked for one more', f: `italic ${Math.round(14 * Math.max(0.8, u))}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`, col: ink, gap: 40 },
        { t: 'THE PAPER NEVER ENDS — 無', f: `600 ${Math.round(15 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 0 },
      ];
      const lh = 26 * Math.max(0.8, u);
      let y = H / 2 - (lines.length * lh) / 2 + slide;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (const L of lines) {
        c.font = L.f;
        c.globalAlpha = a * (L.col === RED ? 0.92 : 0.9);
        c.fillStyle = L.col;
        c.fillText(L.t, 0, y);
        y += lh + L.gap * 0.35;
      }
      c.restore();
    }

    /* ---- cinema bars: in with the stilling world, out with the credits' last breath ---- */
    drawBars(c, Math.min(clamp01((T - 0.25) / 1.2), clamp01((FINALE_DUR - 0.75 - T) / 0.55)));

    /* ---- the skip veil ---- */
    if (skipping) {
      c.globalAlpha = clamp01(skipT / 0.32);
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  /* ============================================================
     THE BEAST'S ENTRANCE — a boss film (v26)
     For every Keeper and Guardian: the void opens into the sheet's
     own paper, a great ring is brushed, the beast rises inside it
     as living ink, the hanko slams, and its name is pressed in
     type. Fully skippable; never plays while the paper is calm.
     ============================================================ */
  function drawBoss(c) {
    const d = data || {};
    const th = SHEET[d.theme] || SHEET.pale;
    const paper = th.paper, ink = th.ink;
    const keeper = !!d.keeper;
    const dur = keeper ? KEEPER_DUR : BOSS_DUR;
    const p = clamp01(T / dur);
    const cx = W / 2, cy = H * 0.40;
    const ringR = Math.min(W, H) * 0.215;
    /* the film's own slow push: the eye leans into the beast */
    const push = 1 + 0.035 * easeIO(clamp01(T / dur));

    /* the void, then the sheet floods open from the centre */
    c.fillStyle = '#12100c';
    c.fillRect(0, 0, W, H);
    const flood = easeOut(clamp01(T / 0.62));
    const fr = flood * Math.hypot(W, H) * 0.64;
    c.save();
    c.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const wob = Math.sin(a * 5 + T * 2.2) * 5 * u + Math.sin(a * 11 - T * 1.4) * 3 * u;
      const x = cx + Math.cos(a) * (fr + wob), y = cy + Math.sin(a) * (fr + wob);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.closePath();
    c.clip();
    c.fillStyle = paper;
    c.fillRect(0, 0, W, H);
    /* age wash & grain */
    let s = 20260726;
    const rr = () => { s = (Math.imul(s, 1664525) + 1013904223) | 0; return (s >>> 0) / 4294967296; };
    for (let i = 0; i < 260; i++) {
      c.globalAlpha = 0.02 + rr() * 0.05;
      c.fillStyle = ink;
      c.fillRect(rr() * W, rr() * H, 1 + rr() * 22, 1);
    }
    for (const m of (entrance ? entrance.dust : [])) {
      c.globalAlpha = m.a * (0.35 + 0.4 * Math.sin(T * m.s + m.p));
      c.fillStyle = ink;
      c.beginPath();
      c.arc(m.x * W + Math.sin(T * m.s + m.p) * 14 * u, m.y * H + Math.cos(T * m.s) * 9 * u, m.r, 0, TAU);
      c.fill();
    }
    c.restore();

    /* the camera leans in from the sheet's centre */
    c.save();
    c.translate(cx, cy);
    c.scale(push, push);
    c.translate(-cx, -cy);

    /* wide quiet vignette so the beast is the only figure */
    const vig = c.createRadialGradient(cx, cy, Math.min(W, H) * 0.2, cx, cy, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, keeper ? 'rgba(26,23,20,0.22)' : 'rgba(26,23,20,0.3)');
    c.fillStyle = vig;
    c.fillRect(0, 0, W, H);

    /* the great brushed ring, painted live */
    const ringP = clamp01((T - 0.28) / 1.35);
    if (ringP > 0) {
      const a0 = -Math.PI * 0.62, span = Math.PI * 1.86 * ringP;
      const steps = Math.max(6, Math.floor(72 * ringP));
      strokeScratchLocal(steps + 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const a = a0 + span * t;
        const press = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.45);
        const w = Math.max(0.8, ringR * 0.075 * press * (0.92 + 0.1 * Math.sin(t * 21 + T * 4)));
        const X = cx + Math.cos(a) * ringR, Y = cy + Math.sin(a) * ringR;
        _brL[i * 2] = X + Math.cos(a) * w * 0.5;
        _brL[i * 2 + 1] = Y + Math.sin(a) * w * 0.5;
        _brR[i * 2] = X - Math.cos(a) * w * 0.5;
        _brR[i * 2 + 1] = Y - Math.sin(a) * w * 0.5;
      }
      c.beginPath();
      c.moveTo(_brL[0], _brL[1]);
      for (let i = 1; i <= steps; i++) c.lineTo(_brL[i * 2], _brL[i * 2 + 1]);
      for (let i = steps; i >= 0; i--) c.lineTo(_brR[i * 2], _brR[i * 2 + 1]);
      c.closePath();
      c.globalAlpha = 0.92;
      c.fillStyle = ink;
      c.fill();
      /* the brush's head & a dry streak */
      if (ringP < 1) {
        const hd = a0 + span;
        c.save();
        c.translate(cx + Math.cos(hd) * ringR, cy + Math.sin(hd) * ringR);
        c.rotate(hd + Math.PI / 2);
        c.globalAlpha = 0.9;
        blobPathLocal(c, 0, 0, Math.max(2.2, ringR * 0.035), 7411, 0.22, 8);
        c.fill();
        c.restore();
      }
      /* vermillion seal at the ring's head once it closes */
      if (ringP > 0.96) {
        const a = a0 + span;
        c.save();
        c.translate(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR);
        c.rotate(-0.1);
        c.globalAlpha = 0.95;
        c.fillStyle = RED;
        c.fillRect(-4.4 * u, -4.4 * u, 8.8 * u, 8.8 * u);
        c.restore();
      }
    }

    /* the beast rises out of the ink inside the ring */
    const rise = easeOut(clamp01((T - 0.62) / 1.0));
    if (rise > 0.01) {
      const typeId = d.type || d.bossId || null;
      const baseR = ringR * (keeper ? 0.52 : 0.60) * (0.42 + 0.58 * rise);
      const by = cy + ringR * 0.14 - (1 - rise) * ringR * 0.16;
      /* the pool it rises from */
      c.save();
      c.globalAlpha = 0.34 * rise;
      c.fillStyle = ink;
      c.save();
      c.translate(cx, cy + ringR * 0.66);
      c.scale(1, 0.26);
      blobPathLocal(c, 0, 0, ringR * 0.72, 991, 0.18, 14);
      c.fill();
      c.restore();
      c.globalAlpha = 0.18 * rise;
      c.save();
      c.translate(cx, cy + ringR * 0.66);
      c.scale(1, 0.2);
      blobPathLocal(c, 0, 0, ringR * 0.42, 993, 0.22, 12);
      c.fill();
      c.restore();
      c.restore();

      c.save();
      c.globalAlpha = clamp01(rise * 1.45);
      if (typeId && typeof R !== 'undefined' && R.drawEnemy && ENEMIES[typeId]) {
        const def = ENEMIES[typeId];
        const sc = baseR / Math.max(8, def.r);
        c.translate(cx, by);
        c.scale(sc, sc);
        const mock = {
          type: typeId, x: 0, y: 0, r: def.r, hp: def.hp, maxHp: def.hp,
          ang: -Math.PI / 2, t: 1.7, seed: 3.1, state: 'cruise', hitFlash: 0,
          vx: 0, vy: 0, elite: false, dead: false,
        };
        try { R.drawEnemy(c, mock, 1.7); } catch (e) {}
      } else {
        c.translate(cx, by);
        c.fillStyle = ink;
        blobPathLocal(c, 0, 0, baseR, 421, 0.2, 12);
        c.fill();
      }
      c.restore();

      /* the beast's crown: ink flung from the fall, then drifting down */
      for (const k of (entrance ? entrance.crown : [])) {
        const kp = clamp01((T - 0.95) / 0.9);
        if (kp <= 0) continue;
        const dist = ringR * (0.55 + k.d * 0.9) * (0.42 + 0.58 * easeOut(kp));
        const fall = (1 - kp) * (1 - kp) * ringR * 0.22;
        c.save();
        c.globalAlpha = (1 - kp) * 0.72;
        c.fillStyle = ink;
        c.translate(cx + Math.cos(k.a) * dist, by + Math.sin(k.a) * dist * 0.72 - fall);
        c.rotate(k.a);
        teardropLocal(c, k.r * (0.7 + 0.6 * kp));
        c.fill();
        c.restore();
      }
    }

    /* the name, pressed in wet type */
    const name = (d.name || 'THE BEAST').toUpperCase();
    const nameP = clamp01((T - 1.35) / 0.7);
    if (nameP > 0) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const size = Math.min(W * (name.length > 17 ? 0.046 : 0.056), H * 0.082);
      c.font = `400 ${Math.round(size)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", Georgia, serif`;
      const spacing = size * 0.055;
      try { c.letterSpacing = spacing + 'px'; } catch (e) {}
      const widths = [...name].map(ch => c.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0) + spacing * (name.length - 1);
      let x = cx - total / 2;
      const y = H * 0.755;
      for (let i = 0; i < name.length; i++) {
        const lt = clamp01((nameP - i * 0.022) / 0.5);
        if (lt <= 0) { x += widths[i] + spacing; continue; }
        const e = easeOut(lt);
        c.globalAlpha = e;
        c.fillStyle = ink;
        c.fillText(name[i], x + widths[i] / 2, y + (1 - e) * 14 * u);
        x += widths[i] + spacing;
      }
      try { c.letterSpacing = '0px'; } catch (e) {}
      c.restore();
    }

    /* the kicker above the ring and the taunt below the name */
    const kickP = clamp01((T - 0.5) / 0.6);
    if (kickP > 0) {
      c.save();
      c.globalAlpha = kickP * 0.72;
      c.fillStyle = ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `600 ${Math.max(7, Math.round(9.2 * u))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(3.1 * u).toFixed(1)}px`; } catch (e) {}
      const kick = keeper
        ? `T H E   K E E P E R   O F   S C E N E   ${d.level || ''}`
        : `G U A R D I A N   O F   ${String(d.sheet || '').toUpperCase()}`;
      c.fillText(kick, cx, H * 0.135);
      try { c.letterSpacing = '0px'; } catch (e) {}
      c.restore();
    }
    const taunt = d.taunt || '';
    const tauntP = clamp01((T - 2.1) / 0.8);
    if (taunt && tauntP > 0) {
      c.save();
      c.globalAlpha = tauntP * 0.66;
      c.fillStyle = ink;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = `500 ${Math.max(8, Math.round(9 * u))}px "IBM Plex Mono", monospace`;
      try { c.letterSpacing = `${(1.7 * u).toFixed(1)}px`; } catch (e) {}
      c.fillText('“' + taunt + '”', cx, H * 0.828);
      try { c.letterSpacing = '0px'; } catch (e) {}
      /* hairlines flanking the line */
      c.globalAlpha = tauntP * 0.24;
      c.strokeStyle = ink;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - W * 0.32, H * 0.862);
      c.lineTo(cx - W * 0.07, H * 0.862);
      c.moveTo(cx + W * 0.07, H * 0.862);
      c.lineTo(cx + W * 0.32, H * 0.862);
      c.stroke();
      c.restore();
    }

    /* the hanko slams beside the beast */
    const sealP = clamp01((T - 1.62) / 0.5);
    if (sealP > 0) {
      const sz = Math.min(W, H) * (keeper ? 0.092 : 0.11);
      const sx = cx + ringR * 1.02, sy = cy - ringR * 0.62;
      const scl = 1.55 - 0.55 * easeOut(sealP);
      c.save();
      c.translate(sx, sy);
      c.rotate(-0.09);
      c.scale(scl, scl);
      c.globalAlpha = Math.min(1, sealP * 1.4);
      c.fillStyle = RED;
      sealBoxLocal(c, sz / 2, 777, 0.055);
      c.fill();
      c.strokeStyle = paper;
      c.lineWidth = Math.max(1.2, sz * 0.02);
      sealBoxLocal(c, sz / 2 - sz * 0.13, 778, 0.07);
      c.stroke();
      c.fillStyle = paper;
      c.font = `700 ${Math.round(sz * 0.55)}px "Zen Antique", "Shippori Mincho", "Hiragino Mincho ProN", serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('守', 0, sz * 0.03);
      c.restore();
    }

    c.restore();   /* camera push */

    /* cinema bars */
    drawBars(c, Math.min(clamp01((T - 0.1) / 0.5), clamp01((dur - 0.35 - T) / 0.4)));
    if (skipping) {
      c.globalAlpha = clamp01(skipT / 0.32);
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  /* ---------------- frame ---------------- */
  function draw(ctx, t) {
    if (!live && !ended) return;
    const S = G.S;
    W = S.W; H = S.H; u = Math.min(W, H) / 800;
    if (kind === 'scroll') drawScroll(ctx);
    else if (kind === 'unroll') drawUnroll(ctx);
    else if (kind === 'boss') drawBoss(ctx);
    else if (kind === 'finale') drawFinale(ctx);
  }

  return {
    start, skip, cancel, update, draw,
    isLive: () => live,
    kindName: () => kind,
    /* true once a scroll film's sheet fully covers the world
       (render keeps the OLD sheet's theme beneath the roll) —
       the unroll film is an overlay and never claims the sheet */
    covered: () => kind === 'finale' || (kind === 'scroll' && T >= 1.12),
    isBoss: () => kind === 'boss',
    get lastKind() { return lastKind; },
    set onEnd(fn) { onEnd = fn; },
  };
})();
