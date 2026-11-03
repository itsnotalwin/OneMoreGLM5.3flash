/* ONE MORE — the share card (v8.3).
   The over sheet can press its own report into paper: a 1080×1350
   tanzaku slip rendered on canvas in the game's own hand — washi,
   sumi, one vermillion hanko carrying the run's seal rank. Nothing
   leaves the device: the card goes out through the browser's own
   share sheet (Web Share API with files), falls back to the
   clipboard, and worst case is saved straight to disk. */
'use strict';

(function () {
  const PAPER = '#ede7d9', INK = '#1e1a16', RED = '#b23a2b';
  const W = 1080, H = 1350;

  const MONO = "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace";
  const DISP = "'Zen Antique', 'Hiragino Mincho ProN', 'Yu Mincho', Georgia, serif";

  const fmt = n => (n | 0).toLocaleString('en-US');
  const fmtTime = t => { t = Math.max(0, Math.round(t || 0)); return String((t / 60) | 0).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  function modeLine(d, day) {
    if (d.mode === 'daily') return 'DAILY INK — ' + day;
    if (d.mode === 'journey') return 'THE JOURNEY — SCROLL ' + (d.scroll || '一');
    return 'THE ENDLESS SCROLL';
  }

  function dayLabel(d) {
    try {
      const day = d.day ? new Date(d.day + 'T12:00:00') : new Date();
      return MONTHS[day.getMonth()] + ' ' + day.getDate() + ', ' + day.getFullYear();
    } catch (e) { return ''; }
  }

  /* a hand-pressed rectangle: two strokes, a hair out of register,
     so the frame reads as brushed, not ruled */
  function roughFrame(c, x, y, w, h, inset, alpha) {
    c.strokeStyle = INK;
    c.globalAlpha = alpha;
    c.lineWidth = 3;
    c.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    c.lineWidth = 1;
    c.strokeRect(x + inset + 5, y + inset + 6, w - inset * 2 - 9, h - inset * 2 - 10);
    c.globalAlpha = 1;
  }

  function build(d) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const day = dayLabel(d);

    /* the washi */
    c.fillStyle = PAPER;
    c.fillRect(0, 0, W, H);
    /* grain: a breath of fibers */
    let s = 20261102;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    c.fillStyle = INK;
    for (let i = 0; i < 900; i++) {
      c.globalAlpha = 0.015 + rnd() * 0.028;
      c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.2, 1);
    }
    c.globalAlpha = 1;

    /* ghost 終 — the watermarked seal of every ending */
    c.fillStyle = INK;
    c.globalAlpha = 0.055;
    c.font = '400 430px ' + DISP;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('終', W - 225, H - 260);
    c.globalAlpha = 1;

    roughFrame(c, 0, 0, W, H, 44, 0.75);

    /* kicker */
    c.fillStyle = INK;
    c.globalAlpha = 0.62;
    c.font = '500 25px ' + MONO;
    c.fillText('O N E   M O R E   ·   A   M O N O C H R O M E   S U R V I V A L', W / 2, 122);
    c.globalAlpha = 1;

    /* the hanko: the run's seal rank, pressed red */
    c.save();
    c.translate(W / 2, 268);
    c.rotate(-0.055);
    c.shadowColor = 'rgba(30,26,22,0.28)';
    c.shadowBlur = 14;
    c.shadowOffsetY = 6;
    c.fillStyle = RED;
    c.fillRect(-74, -74, 148, 148);
    c.shadowColor = 'transparent';
    c.strokeStyle = 'rgba(237,231,217,0.85)';
    c.lineWidth = 3;
    c.strokeRect(-58, -58, 116, 116);
    c.fillStyle = PAPER;
    /* the ledger's rank rides the seal when the post landed (#12,
       sized to its digits) — otherwise the run's own seal rank keeps
       the stamp */
    if (d.lbRank) {
      const rk = '#' + (d.lbRank | 0);
      c.font = '400 ' + (rk.length > 3 ? 46 : 60) + 'px ' + DISP;
      c.fillText(rk, 0, 8);
    } else {
      c.font = '400 96px ' + DISP;
      c.fillText(d.rank || '一', 0, 8);
    }
    c.restore();

    /* the great number: waves survived */
    c.fillStyle = INK;
    c.globalAlpha = 0.6;
    c.font = '500 30px ' + MONO;
    c.fillText('W A V E S   S U R V I V E D', W / 2, 420);
    c.globalAlpha = 1;
    c.font = '400 258px ' + DISP;
    c.fillText(String(Math.max(1, d.waves | 0)), W / 2, 596);

    /* the ledger line */
    c.globalAlpha = 0.78;
    c.font = '500 31px ' + MONO;
    c.fillText(fmt(d.score) + '  SCORE  ·  ' + fmt(d.kills) + '  BLOTS  ·  ' + fmtTime(d.time), W / 2, 738);
    c.globalAlpha = 1;

    /* rule */
    c.strokeStyle = INK;
    c.globalAlpha = 0.4;
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(150, 806); c.lineTo(W - 150, 806); c.stroke();
    c.globalAlpha = 1;

    /* the mode + honours */
    c.fillStyle = INK;
    c.font = '500 34px ' + MONO;
    c.fillText(modeLine(d, day), W / 2, 876);
    let line2 = '';
    if (d.hard) line2 = 'REALLY HARD · 難';
    else if (d.victory) line2 = 'THE FIVE SCROLLS ARE SIGNED';
    else if (d.practice) line2 = 'A PRACTICE SHEET';
    if (d.ghost && d.ghost.wave) {
      const gv = d.ghost.name
        ? String(d.ghost.name).toUpperCase().slice(0, 16) + "'S ECHO FELL AT WAVE " + d.ghost.wave
        : 'THE GHOST FELL AT WAVE ' + d.ghost.wave;
      line2 = (line2 ? line2 + '   ·   ' : '') + gv;
    }
    /* the charms the scribe wore ride the honours too (v8.8) */
    if (d.charms) {
      line2 = (line2 ? line2 + '   ·   ' : '') + '符 ' + d.charms + ' CHARMS';
    }
    if (line2) {
      c.globalAlpha = 0.62;
      c.font = '500 27px ' + MONO;
      if (d.hard) c.fillStyle = RED;
      c.fillText(line2, W / 2, 934);
      c.globalAlpha = 1;
      c.fillStyle = INK;
    }

    /* the date stamp, lower right — when the ink dried */
    c.globalAlpha = 0.55;
    c.font = '500 24px ' + MONO;
    c.textAlign = 'right';
    c.fillText(day.toUpperCase(), W - 108, H - 108);
    c.textAlign = 'center';
    c.globalAlpha = 1;

    return cv;
  }

  function nameFor(d) {
    const day = (d.day || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    return 'one-more-' + (d.mode || 'endless') + '-wave' + (d.waves | 0) + '-' + day + '.png';
  }

  function say(btn, msg) {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = old; btn.disabled = false; }, 2400);
  }

  async function send() {
    const d = (typeof UI !== 'undefined' && UI && UI.lastOver) || null;
    const btn = document.getElementById('shareBtn');
    if (!d) return;
    let blob;
    try { blob = await new Promise(r => build(d).toBlob(r, 'image/png')); }
    catch (e) { say(btn, 'THE INK REFUSED'); return; }
    const file = new File([blob], nameFor(d), { type: 'image/png' });
    const text = 'WAVE ' + (d.waves | 0) + ' — ' + fmt(d.score) + ' · ONE MORE, a monochrome survival';

    /* first voice: the browser's own share sheet */
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'ONE MORE', text });
        return; /* the sheet speaks for itself */
      }
    } catch (e) { if (e && e.name === 'AbortError') return; /* cancelled — done */ }

    /* second voice: the clipboard */
    try {
      if (navigator.clipboard && window.ClipboardItem && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        say(btn, 'ON YOUR CLIPBOARD');
        return;
      }
    } catch (e) { /* fall through */ }

    /* last voice: the card is simply theirs */
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nameFor(d);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say(btn, 'CARD SAVED');
    } catch (e) { say(btn, 'THE INK REFUSED'); }
  }

  function wire() {
    const btn = document.getElementById('shareBtn');
    if (btn) btn.addEventListener('click', send);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  window.SHARE = { build, send };
})();
