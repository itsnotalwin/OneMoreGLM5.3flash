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

  /* the five sheets, as paint */
  const SHEET = {
    pale:  { paper: '#ede7d9', ink: '#1a1714' },
    dark:  { paper: '#17130f', ink: '#e9e2d2' },
    red:   { paper: '#eadbc4', ink: '#1a1714' },
    storm: { paper: '#c7cdc9', ink: '#161c1f' },
    gilt:  { paper: '#e7d6ad', ink: '#241c12' },
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
  const FINALE_DUR = 17.6;

  let T = 0, live = false, ended = false, skipping = false, skipT = 0;
  let kind = null, data = null, lastKind = null;
  let W = 0, H = 0, u = 1;
  let onEnd = null;

  /* prepared art (built once per play) */
  let rollEdge = null;      /* wobble samples for the unrolling sheet edge */
  let flicks = [];          /* satellite droplets racing the roll */
  let splats = [];          /* splatter at the kanji's landing */
  let sealSplats = [];      /* red splatter at the hanko */
  let motes = [];           /* rising ink motes (finale) */
  let sheetMarks = [];      /* the five strokes + kanji of the finale */
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
    sheetMarks = [];
    const five = ['一', '夜', '紅', '嵐', '金'];
    for (let i = 0; i < 5; i++) {
      sheetMarks.push({
        x: W * (0.5 + (i - 2) * 0.115),
        y: H * 0.40,
        kanji: SHEET_KANJI[i] || five[i],
        t0: 4.65 + i * 0.52,
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
        document.fonts.load('14px "IBM Plex Mono"');
      }
    } catch (e) {}
    if (kind === 'scroll') SFX.gong();
    else if (kind === 'finale') SFX.gong();
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
    } else if (kind === 'finale') {
      for (const m of sheetMarks) if (crossed(m.t0)) SFX.pick((m.t0 * 3) | 0);
      if (crossed(12.9)) SFX.hanko();
    }
    const dur = kind === 'scroll' ? SCROLL_DUR : FINALE_DUR;
    if (T >= dur) finish();
  }

  /* has the timeline just crossed time t? (tolerant of hitches) */
  let dt_last = 0;
  function crossed(t) {
    return T >= t && T - dt_last < t;
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
    c.font = `${Math.round(size)}px "Zen Antique", serif`;
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
    c.font = `${Math.round(sz * 0.62)}px "Zen Antique", serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(ch, 0, sz * 0.03);
    c.restore();
  }

  /* a pressed brushstroke drawn as overlapping dabs (pressure by profile) */
  function dabStroke(c, pts, widths, color, alpha, t0, t1, T) {
    const p = clamp01((T - t0) / (t1 - t0));
    if (p <= 0) return;
    const steps = Math.max(2, Math.floor(pts.length * p));
    c.save();
    c.fillStyle = color;
    for (let i = 0; i < steps; i++) {
      const q = pts[i];
      const w = widths[i];
      c.globalAlpha = alpha * (0.16 + 0.1 * w);
      c.beginPath();
      c.arc(q.x, q.y, w, 0, TAU);
      c.fill();
    }
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

    /* ---- the skip veil ---- */
    if (skipping) {
      c.globalAlpha = clamp01(skipT / 0.32);
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }
  }

  /* ================= THE JOURNEY'S END ================= */
  /* the ink stills, the five keepers bow, the brush closes the circle */
  function drawFinale(c) {
    const th = SHEET.gilt;
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
    caption(c, 'THE FIFTH GUARDIAN FALLS.', W / 2, H * 0.3, clamp01((T - 0.55) / 0.5) * (1 - clamp01((T - 2.5) / 0.5)), th.ink, th.paper);
    caption(c, 'THE INK STILLS.', W / 2, H * 0.37, clamp01((T - 2.55) / 0.45) * (1 - clamp01((T - 3.35) / 0.6)), th.ink, th.paper);

    /* ---- beat 2: the world washes to the eternal sheet (2.9 → 4.4) ---- */
    const wash = easeIO(clamp01((T - 2.9) / 1.5));
    if (wash > 0) {
      c.globalAlpha = wash;
      c.fillStyle = paper;
      c.fillRect(0, 0, W, H);
      c.globalAlpha = 1;
    }

    /* ---- beat 3: the five sheets, remembered (4.6 → 7.2) ---- */
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

    caption(c, 'FIVE SHEETS. FIVE KEEPERS.', W / 2, H * 0.62,
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
        { t: '一', f: `700 ${Math.round(44 * Math.max(0.8, u))}px "Zen Antique", serif`, col: RED, gap: 30 },
        { t: 'ONE MORE', f: `700 ${Math.round(42 * Math.max(0.8, u))}px "Zen Antique", serif`, col: ink, gap: 14 },
        { t: 'A MONOCHROME SURVIVAL', f: `500 ${Math.round(12 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 34 },
        { t: 'INK · PAPER · BEASTS — ONE BRUSH', f: `400 ${Math.round(13 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 12 },
        { t: 'FIVE SHEETS · FIVE KEEPERS · NO ENDINGS', f: `400 ${Math.round(13 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 34 },
        { t: 'EVERY STROKE STAYS ON THE SHEET', f: `400 ${Math.round(12 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 10 },
        { t: 'THE PAPER KEEPS WHAT YOU PAINTED', f: `400 ${Math.round(12 * Math.max(0.8, u))}px "IBM Plex Mono", monospace`, col: ink, gap: 40 },
        { t: 'for every player who asked for one more', f: `italic ${Math.round(14 * Math.max(0.8, u))}px "Zen Antique", serif`, col: ink, gap: 40 },
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

    /* ---- the skip veil ---- */
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
    else if (kind === 'finale') drawFinale(ctx);
  }

  return {
    start, skip, cancel, update, draw,
    isLive: () => live,
    kindName: () => kind,
    /* true once a scroll film's sheet fully covers the world
       (render keeps the OLD sheet's theme beneath the roll) */
    covered: () => kind === 'finale' || T >= 1.12,
    get lastKind() { return lastKind; },
    set onEnd(fn) { onEnd = fn; },
  };
})();
