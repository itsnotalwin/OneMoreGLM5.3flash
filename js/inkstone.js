/* ONE MORE — the inkstone (砚, v8.9), the stone's own room.
   ------------------------------------------------------------------
   A standalone side page. The stone is the wallet the runs already
   press (om_charms_v1 — one ink, no split): held ink spends on
   charms inside the paper; LIFETIME ink is what the stone is made
   of. It grows through seven stages as the lifetime deepens, and
   between visits it condenses ink from the air — one drop a quarter
   hour, kept overnight (capped at an eight-hour night; the wall
   clock is the only faucet, so it cannot be farmed by refreshing).

   The stone keeps its own small paper in om_stone_v1 — name, the
   condensation clock, and the journal. It starts with om_, so the
   settings room's WIPE sweeps it with the rest of the life.

   No game code is imported: the page mirrors the game's tiny store
   and the wallet's exact save shape, and owns its canvas, its synth
   and its paper. */
'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const CHARMS_KEY = 'om_charms_v1';
  const STONE_KEY = 'om_stone_v1';

  /* ---------- the store (mirrors the game's own) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  /* the wallet — same guard, same shape as game.js's charmsSave */
  function wallet() {
    const c = store.get(CHARMS_KEY, null);
    return c && typeof c === 'object'
      ? { ink: c.ink | 0, earned: c.earned | 0, lv: c.lv || {}, feats: c.feats || {} }
      : { ink: 0, earned: 0, lv: {}, feats: {} };
  }
  function saveWallet(w) { store.set(CHARMS_KEY, w); }

  /* the stone's own paper */
  function stoneSave() {
    const s = store.get(STONE_KEY, null);
    return s && typeof s === 'object'
      ? { name: typeof s.name === 'string' ? s.name : '', lastTick: +s.lastTick || 0, hi: s.hi | 0, log: Array.isArray(s.log) ? s.log : [] }
      : { name: '', lastTick: 0, hi: 0, log: [] };
  }
  function saveStone(s) { store.set(STONE_KEY, s); }

  /* ---------- QA seeds: ?charms=N seeds the wallet, ?stone=N ages the air ---------- */
  const qa = new URLSearchParams(location.search);
  {
    let s = stoneSave();
    if (!s.lastTick) { s.lastTick = Date.now(); saveStone(s); }
    const qc = parseInt(qa.get('charms'), 10);
    if (Number.isFinite(qc) && qc >= 0) {
      const w = wallet(); w.ink = Math.max(0, qc); w.earned = Math.max(0, qc); saveWallet(w);
    }
    const qs = parseInt(qa.get('stone'), 10);
    if (Number.isFinite(qs) && qs >= 0) {
      s = stoneSave(); s.lastTick = Date.now() - qs * 60000; saveStone(s);
    }
  }

  /* ---------- the seven stages ---------- */
  const STAGES = [
    { at: 0,    kanji: '顽石', name: 'ROUGH STONE',  flavor: 'a dull pebble. it remembers nothing.' },
    { at: 50,   kanji: '显纹', name: 'VEINED',       flavor: 'the first veins of ink show through.' },
    { at: 150,  kanji: '润',   name: 'SLEEK',        flavor: 'ground smooth by everything you survived.' },
    { at: 400,  kanji: '墨心', name: 'INK HEART',    flavor: 'a pool of still black at its center.' },
    { at: 900,  kanji: '玉骨', name: 'JADE BONE',    flavor: 'the stone has weight that paper lacks.' },
    { at: 1800, kanji: '生瞳', name: 'AWAKE',        flavor: 'it watches the brush now.' },
    { at: 3600, kanji: '砚灵', name: 'STONE SPIRIT', flavor: 'it grinds itself. it dreams of waves.' },
  ];
  const stageIndex = earned => {
    let i = 0;
    for (let k = 0; k < STAGES.length; k++) if (earned >= STAGES[k].at) i = k;
    return i;
  };
  const poolFrac = earned => {
    const i = stageIndex(earned);
    if (i >= STAGES.length - 1) return 1;
    const a = STAGES[i].at, b = STAGES[i + 1].at;
    return Math.min(1, Math.max(0, (earned - a) / (b - a)));
  };

  /* ---------- condensation: one drop a quarter hour, an eight-hour night ---------- */
  const DROP_MS = 15 * 60 * 1000;
  const DROP_CAP = 32;
  function pending() {
    const s = stoneSave();
    if (!s.lastTick) return 0;
    const raw = (Date.now() - s.lastTick) / DROP_MS;
    return Math.max(0, Math.floor(Math.min(raw, DROP_CAP)));
  }
  function consumeDrop() {
    const s = stoneSave();
    if (!s.lastTick) return false;
    const raw = (Date.now() - s.lastTick) / DROP_MS;
    if (Math.floor(Math.min(raw, DROP_CAP)) < 1) return false;
    s.lastTick = Date.now() - Math.max(0, raw - 1) * DROP_MS;
    saveStone(s);
    return true;
  }

  /* ---------- a tiny synth for a tiny room ---------- */
  const SFX = (() => {
    let ac = null;
    /* the game's mute carries across pages: a quiet scribe gets a
       quiet stone (mechanics never mute — only the voice does) */
    function mutedNow() {
      try { return localStorage.getItem('om_muted_v1') === '1'; } catch (e) { return false; }
    }
    function ensure() {
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
      if (ac && ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    }
    function blip(f0, f1, dur, type, gain) {
      if (!ac || qa.get('quiet') === '1' || mutedNow()) return;
      try {
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
        o.type = type || 'sine';
        o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const vol = gain || 0.06;
        const atk = Math.min(0.004, dur * 0.3);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ac.destination);
        o.start(t); o.stop(t + dur);
      } catch (e) {}
    }
    return {
      ensure,
      tick() { blip(190, 150, 0.05, 'triangle', 0.035); },
      pop()  { blip(520, 880, 0.12, 'sine', 0.06); },
      dry()  { blip(120, 82, 0.09, 'triangle', 0.04); },
      chime() {
        blip(660, 660, 0.28, 'sine', 0.055);
        setTimeout(() => blip(990, 990, 0.42, 'sine', 0.045), 150);
      },
    };
  })();

  /* ---------- palette (reads the paper's vars; follows dark) ---------- */
  const theme = { paper: '#ede7d9', ink: '#1a1714', red: '#b23a2b' };
  function readTheme() {
    try {
      const cs = getComputedStyle(document.documentElement);
      theme.paper = cs.getPropertyValue('--paper').trim() || theme.paper;
      theme.ink = cs.getPropertyValue('--ink').trim() || theme.ink;
      theme.red = cs.getPropertyValue('--red').trim() || theme.red;
    } catch (e) {}
  }
  readTheme();
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', readTheme);
    else if (mq.addListener) mq.addListener(readTheme);
  } catch (e) {}

  /* ---------- journal — the stone remembers ---------- */
  const MAX_LOG = 12;
  function journaled() { return stoneSave(); }
  function journal(line, kind) {
    const s = stoneSave();
    s.log.unshift({ t: Date.now(), line, k: kind || '' });
    if (s.log.length > MAX_LOG) s.log.length = MAX_LOG;
    saveStone(s);
    renderJournal();
  }
  function fmtDate(t) {
    try {
      return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
    } catch (e) { return ''; }
  }
  function renderJournal() {
    const ul = $('journalList');
    if (!ul) return;
    const s = journaled();
    ul.textContent = '';
    if (!s.log.length) {
      const li = document.createElement('li');
      li.className = 'j-empty';
      li.textContent = 'nothing yet. the paper presses.';
      ul.appendChild(li);
      return;
    }
    for (const e of s.log) {
      const li = document.createElement('li');
      if (e.k === 'stage') li.className = 'is-stage';
      const d = document.createElement('span');
      d.className = 'j-date';
      d.textContent = fmtDate(e.t);
      li.appendChild(d);
      li.appendChild(document.createTextNode(e.line));
      ul.appendChild(li);
    }
  }

  /* stage-ups (on load and after every press) — each crossed stage gets its line.
     The watermark is written FIRST: journal() re-reads the save each call,
     so a stale snapshot here would clobber the lines it just wrote. */
  function checkStages() {
    const w = wallet();
    const cur = stageIndex(w.earned);
    const s = stoneSave();
    if (cur <= s.hi) return false;
    const crossed = [];
    for (let i = s.hi + 1; i <= cur; i++) crossed.push(i);
    s.hi = cur;
    saveStone(s);
    for (const i of crossed) {
      journal(`${STAGES[i].kanji} — ${STAGES[i].name} · 硯 ${w.earned.toLocaleString('en-US')} pressed.`, 'stage');
    }
    stageFlash = 1.6;           /* the canvas celebration */
    SFX.chime();
    return true;
  }
  let stageFlash = 0;

  /* ---------- DOM readouts ---------- */
  const shown = { purse: -1, pressed: -1, drip: -1, stage: -1 };
  function fmtN(n) { return n.toLocaleString('en-US'); }
  function renderStats() {
    const w = wallet(), p = pending();
    const st = stageIndex(w.earned);
    if (shown.purse !== w.ink) {
      shown.purse = w.ink;
      const el = $('purseN');
      el.textContent = fmtN(w.ink);
      el.classList.toggle('is-gain', w.ink > 0 && gainPulse > 0);
    }
    if (shown.pressed !== w.earned) { shown.pressed = w.earned; $('pressedN').textContent = fmtN(w.earned); }
    if (shown.drip !== p) { shown.drip = p; $('dripN').textContent = fmtN(p); }
    if (shown.stage !== st) {
      shown.stage = st;
      $('stageKanji').textContent = STAGES[st].kanji;
      $('stageName').textContent = STAGES[st].name;
      $('stageFlavor').textContent = STAGES[st].flavor;
    }
    const pf = $('poolFill');
    const f = poolFrac(w.earned);
    pf.style.transform = `scaleX(${f})`;
    pf.classList.toggle('is-full', st >= STAGES.length - 1);
    $('poolNext').textContent = st >= STAGES.length - 1
      ? '满 · THE POOL RESTS'
      : `${STAGES[st + 1].kanji} AT 硯 ${fmtN(STAGES[st + 1].at)}`;
  }
  let gainPulse = 0;

  function renderName() {
    const s = stoneSave();
    $('stoneNameLine').textContent = s.name ? `砚 — ${s.name}` : 'the unnamed stone';
    const inp = $('stoneName');
    if (document.activeElement !== inp) inp.value = s.name;
    $('nameSeal').classList.toggle('is-set', !!s.name);
  }

  /* ---------- the press: one ground drop becomes one ink ---------- */
  function press() {
    if (!consumeDrop()) return false;
    const w = wallet();
    w.ink += 1; w.earned += 1;
    saveWallet(w);
    gainPulse = 1;
    renderStats();
    checkStages();
    return true;
  }

  /* ---------- the canvas: a stone, breathing ---------- */
  const canvas = $('stoneCanvas');
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;

  /* a fixed seeded shape — the stone never re-rolls its body */
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const RIM_N = 15;
  const rim = (() => {
    const rnd = mulberry32(20261103);
    const pts = [];
    for (let i = 0; i < RIM_N; i++) {
      const a = (i / RIM_N) * Math.PI * 2;
      pts.push({ a, r: 0.82 + rnd() * 0.36, ph: rnd() * Math.PI * 2 });
    }
    return pts;
  })();
  const veins = (() => {
    const rnd = mulberry32(8888);
    const vs = [];
    for (let i = 0; i < 4; i++) {
      vs.push({
        x0: -0.5 + rnd(), y0: -0.5 + rnd(),
        c1x: -0.5 + rnd(), c1y: -0.5 + rnd(),
        x1: -0.5 + rnd(), y1: -0.5 + rnd(),
        w: 0.5 + rnd() * 0.9,
      });
    }
    return vs;
  })();
  const flecks = (() => {
    const rnd = mulberry32(4242);
    const fs = [];
    for (let i = 0; i < 9; i++) fs.push({ x: -0.6 + rnd() * 1.2, y: -0.6 + rnd() * 1.2, r: 0.6 + rnd() * 1.1, ph: rnd() * 6 });
    return fs;
  })();

  function resize() {
    try {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = Math.max(10, Math.round(rect.width));
      ch = Math.max(10, Math.round(rect.height));
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } catch (e) {}
  }

  /* ripples + floaters + wisps — the juice */
  const ripples = [];   /* {x,y,r,a} */
  const floaters = [];  /* {x,y,t,str} */
  const wisps = [];     /* {x,y,vx,vy,age,r} */
  let shake = 0;        /* dry-tap head-shake */
  let pointer = { x: 0, y: 0, has: false };

  /* the stone's outline: start on the rim midpoint, curve through each
     vertex to the next midpoint — a closed, seam-free wash blob */
  function blobPath(cx, cy, R, t, breath) {
    const pt = (i, mul = 1) => {
      const p = rim[i];
      const wobble = Math.sin(t * 0.7 + p.ph) * 0.012;
      const r = R * (p.r + wobble) * breath * mul;
      return { x: cx + Math.cos(p.a) * r, y: cy + Math.sin(p.a) * r * 0.86 };
    };
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const p0 = pt(RIM_N - 1), q0 = pt(0);
    const m0 = mid(p0, q0);
    ctx.beginPath();
    ctx.moveTo(m0.x, m0.y);
    for (let i = 0; i < RIM_N; i++) {
      const v = pt(i);
      const nx = pt((i + 1) % RIM_N);
      const m = mid(v, nx);
      ctx.quadraticCurveTo(v.x, v.y, m.x, m.y);
    }
    ctx.closePath();
  }

  function draw(now) {
    const t = now / 1000;
    const w = wallet(), st = stageIndex(w.earned);
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const breath = reduced ? 1 : 1 + 0.012 * Math.sin(t * 0.9);
    const cx = cw / 2 + (shake > 0 ? Math.sin(t * 60) * 3 * shake : 0);
    const cy = ch / 2;
    const R = Math.min(cw, ch) * (0.30 + 0.018 * st);
    ctx.clearRect(0, 0, cw, ch);

    /* the wash — a soft second pass under the body */
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.filter = 'blur(6px)';
    blobPath(cx, cy + R * 0.06, R * 1.02, t, breath);
    ctx.fillStyle = theme.ink;
    ctx.fill();
    ctx.restore();

    /* the body */
    blobPath(cx, cy, R, t, breath);
    ctx.fillStyle = theme.ink;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;

    /* the face — a lighter heart so the body reads as stone, not hole */
    ctx.save();
    blobPath(cx, cy, R, t, breath);
    ctx.clip();
    const face = ctx.createRadialGradient(cx - R * 0.18, cy - R * 0.22, R * 0.1, cx, cy, R * 1.05);
    face.addColorStop(0, 'rgba(237,231,217,0.30)');
    face.addColorStop(0.55, 'rgba(237,231,217,0.10)');
    face.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = face;
    ctx.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6);

    /* veins — stage 2+ */
    if (st >= 1) {
      ctx.strokeStyle = 'rgba(237,231,217,0.20)';
      ctx.lineWidth = 1;
      for (const v of veins) {
        ctx.beginPath();
        ctx.moveTo(cx + v.x0 * R, cy + v.y0 * R);
        ctx.quadraticCurveTo(cx + v.c1x * R, cy + v.c1y * R, cx + v.x1 * R, cy + v.y1 * R);
        ctx.globalAlpha = 0.35 + 0.16 * st;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    /* the pool — the stone's heart, filled to its stage */
    {
      const pw = R * 0.98, phh = R * 0.62;
      const px = cx - pw / 2, py = cy - R * 0.30;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, py + phh / 2, pw / 2, phh / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = 'rgba(237,231,217,0.10)';
      ctx.fillRect(px, py, pw, phh);
      const f = poolFrac(w.earned);
      ctx.fillStyle = 'rgba(16,13,11,0.92)';
      const hh = phh * f;
      ctx.fillRect(px, py + phh - hh, pw, hh);
      if (st >= 3 && f > 0.1) {   /* the still-water line */
        ctx.strokeStyle = 'rgba(237,231,217,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + pw * 0.18, py + phh - hh);
        ctx.lineTo(px + pw * 0.62, py + phh - hh);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* jade flecks — stage 4+ */
    if (st >= 3) {
      for (const fl of flecks) {
        ctx.globalAlpha = 0.25 + 0.05 * Math.sin(t * 1.3 + fl.ph);
        ctx.fillStyle = 'rgba(237,231,217,0.8)';
        ctx.beginPath();
        ctx.arc(cx + fl.x * R * 0.8, cy + fl.y * R * 0.55, fl.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    /* the eye — stage 6: it watches */
    if (st >= 5) {
      const ex = cx + R * 0.34, ey = cy - R * 0.34;
      const er = Math.max(3.4, R * 0.055);
      ctx.fillStyle = theme.red;
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      let dx = 0, dy = 0;
      if (pointer.has) {
        const a = Math.atan2(pointer.y - ey, pointer.x - ex);
        dx = Math.cos(a) * er * 0.42; dy = Math.sin(a) * er * 0.42;
      }
      ctx.fillStyle = theme.ink;
      ctx.beginPath();
      ctx.arc(ex + dx, ey + dy, er * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }

    /* the seal — stage 7: it is finished, and it knows */
    if (st >= 6) {
      const ss = R * 0.30;
      ctx.save();
      ctx.translate(cx - R * 0.52, cy + R * 0.42);
      ctx.rotate(-0.10);
      ctx.fillStyle = theme.red;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(-ss / 2, -ss / 2, ss, ss);
      ctx.globalAlpha = 1;
      ctx.fillStyle = theme.paper;
      ctx.font = `${Math.round(ss * 0.78)}px "Zen Antique", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('砚', 0, ss * 0.04);
      ctx.restore();
    }
    ctx.restore(); /* face clip */

    /* the rim — a brushed outline */
    blobPath(cx, cy, R, t, breath);
    ctx.strokeStyle = theme.ink;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* condensation on the rim */
    const p = pending();
    if (p > 0) {
      const show = Math.min(p, 12);
      for (let i = 0; i < show; i++) {
        const a = -Math.PI * 0.86 + (i / 12) * Math.PI * 1.6;
        const rr = R * (rim[(i * 2) % RIM_N].r + 0.10);
        const dx = cx + Math.cos(a) * rr;
        const dy = cy + Math.sin(a) * rr * 0.86 - 2;
        const quiver = Math.sin(t * 2.1 + i * 1.7) * 1.2;
        ctx.fillStyle = theme.ink;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(dx + quiver * 0.4, dy + quiver * 0.3, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(dx + quiver * 0.4, dy - 3.4 + quiver * 0.3, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (p > 12) {   /* the count, for the rim that cannot fit it */
        ctx.fillStyle = theme.ink;
        ctx.globalAlpha = 0.6;
        ctx.font = '10px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`×${p}`, cx, cy - R * 0.86 * 0.86 - 10);
        ctx.globalAlpha = 1;
      }
    }

    /* the grind stick — it circles while the scribe holds */
    if (grindT > 0) {
      const ga = t * 7.5;
      const gr = R * 0.62;
      const gx = cx + Math.cos(ga) * gr;
      const gy = cy + Math.sin(ga) * gr * 0.86 - R * 0.1;
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(ga + Math.PI / 2.4);
      ctx.fillStyle = theme.ink;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-2.2, -R * 0.34, 4.4, R * 0.5);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    /* wisps — the ink rising while it grinds */
    for (let i = wisps.length - 1; i >= 0; i--) {
      const wp = wisps[i];
      wp.age += 1 / 60;
      wp.x += wp.vx / 60; wp.y += wp.vy / 60;
      wp.vy -= 14 / 60;
      const a = Math.max(0, 0.5 - wp.age * 0.9);
      if (a <= 0) { wisps.splice(i, 1); continue; }
      ctx.globalAlpha = a;
      ctx.fillStyle = theme.ink;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, wp.r * (1 + wp.age), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* ripples */
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r += 1.8; rp.a -= 0.03;
      if (rp.a <= 0) { ripples.splice(i, 1); continue; }
      ctx.globalAlpha = rp.a;
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* floaters — +1 into the purse */
    ctx.textAlign = 'center';
    for (let i = floaters.length - 1; i >= 0; i--) {
      const fl = floaters[i];
      fl.t += 1 / 60;
      if (fl.t > 1) { floaters.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - fl.t;
      ctx.fillStyle = theme.red;
      ctx.font = '600 12px "IBM Plex Mono", monospace';
      ctx.fillText(fl.str, fl.x, fl.y - fl.t * 26);
      ctx.globalAlpha = 1;
    }

    /* the stage-up ring — a red breath across the stone */
    if (stageFlash > 0) {
      stageFlash -= 1 / 60;
      const a = Math.min(1, stageFlash / 1.6);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = theme.red;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, R * (1.06 + (1 - a) * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (gainPulse > 0) gainPulse -= 1 / 60;
    if (shake > 0) shake -= 1 / 30;
    if (grindT > 0) grindT -= 1 / 60;
  }

  let grindT = 0;
  let rafId = 0;
  function loop(now) {
    if (!document.hidden) draw(now);
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- the hand: tap pops a drop, hold keeps grinding ---------- */
  let holdTimer = null;
  function tryPop() {
    if (press()) {
      SFX.pop();
      grindT = 0.55;
      ripples.push({ x: cw / 2, y: ch / 2, r: 6, a: 0.5 });
      const w = wallet();
      floaters.push({ x: cw / 2, y: ch / 2, t: 0, str: '+1' });
      if (wisps.length < 26) {
        wisps.push({ x: cw / 2 + (Math.random() - 0.5) * 30, y: ch / 2, vx: (Math.random() - 0.5) * 16, vy: -24 - Math.random() * 20, age: 0, r: 1.4 + Math.random() });
      }
      void w;
      return true;
    }
    /* the stone is dry — it says so, once per press */
    SFX.dry();
    shake = 1;
    const hint = $('stoneHint');
    hint.classList.add('is-dry');
    setTimeout(() => hint.classList.remove('is-dry'), 900);
    return false;
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    SFX.ensure();
    pointer.has = true;
    const r = canvas.getBoundingClientRect();
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    if (tryPop()) {
      clearInterval(holdTimer);
      holdTimer = setInterval(tryPop, 460);
    }
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
    canvas.addEventListener(ev, () => { clearInterval(holdTimer); holdTimer = null; }));
  window.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.has = true;
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
  }, { passive: true });

  /* ---------- naming ---------- */
  $('nameSeal').addEventListener('click', () => {
    SFX.ensure();
    const s = stoneSave();
    const v = $('stoneName').value.trim().slice(0, 10);
    const before = s.name;
    s.name = v;
    saveStone(s);
    renderName();
    if (v && v !== before) journal(`the scribe named it 「${v}」.`);
    else if (!v && before) journal('the scribe let the name go.');
    if (v) SFX.pop(); else SFX.dry();
  });
  $('stoneName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('nameSeal').click(); }
  });

  /* ---------- waking ---------- */
  function wake() {
    renderName();
    checkStages();
    renderJournal();
    renderStats();
    resize();
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { shown.purse = shown.pressed = shown.drip = shown.stage = -1; wake(); }
  });

  wake();
  rafId = requestAnimationFrame(loop);
  void rafId;

  /* the paper travels with the scribe — same worker, same scope */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      try { navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch (e) {}
    });
  }
})();
