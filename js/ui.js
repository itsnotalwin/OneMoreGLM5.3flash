'use strict';
/* ============================================================
   ONE MORE — DOM / UI layer (ink scroll edition)
   ============================================================ */

const UI = (() => {
  const $ = id => document.getElementById(id);

  const el = {
    hud: $('hud'), hudWave: $('hudWave'), waveFill: $('waveFill'), hudHp: $('hudHp'),
    hudScore: $('hudScore'), hudTime: $('hudTime'), muteBtn: $('muteBtn'),
    hudArea: $('hudArea'), hudAreaKanji: $('hudAreaKanji'), hudAreaName: $('hudAreaName'),
    hudWaveTotal: $('hudWaveTotal'), hudMode: $('hudMode'),
    banner: $('waveBanner'), bannerKicker: $('bannerKicker'), bannerTitle: $('bannerTitle'),
    screens: {
      title: $('screenTitle'), scrolls: $('screenScrolls'), upgrade: $('screenUpgrade'),
      pause: $('screenPause'), over: $('screenOver'),
    },
    runNo: $('runNo'), bestLine: $('bestLine'),
    hudLoadout: $('hudLoadout'), hudXpFill: $('hudXpFill'), hudXpLv: $('hudXpLv'),
    hudBoss: $('hudBoss'), hudBossName: $('hudBossName'), hudBossFill: $('hudBossFill'),
    hudCombo: $('hudCombo'), brushRow: $('brushRow'),
    upKicker: $('upKicker'), upNext: $('upNext'), upgradeGrid: $('upgradeGrid'), deployBtn: $('deployBtn'),
    overKicker: $('overKicker'), overRank: $('overRank'), overTitle: $('overTitle'), overSub: $('overSub'),
    continueBtn: $('continueBtn'),
    statWaves: $('statWaves'), statKills: $('statKills'), statTime: $('statTime'), statScore: $('statScore'),
    newBestBadge: $('newBestBadge'), flash: $('flash'),
  };

  let bannerTimer = null;
  let flashTimer = null;
  let lastTimeStr = '';
  /* the HUD only touches the DOM when a value truly changed —
     a style recalc every frame is the thief of frames */
  let lastProgress = -1;
  let lastXp = { f: -1, lv: -1 };
  let lastBoss = { name: null, f: -1 };

  const pad2 = n => String(n).padStart(2, '0');
  const pad3 = n => String(n).padStart(3, '0');
  const fmtScore = n => n.toLocaleString('en-US').padStart(7, '0');
  const fmtTime = s => pad2(Math.floor(s / 60)) + ':' + pad2(Math.floor(s % 60));

  /* kanji numerals — the calligraphic count of waves and levels */
  function toKanji(n) {
    if (n <= 0) return '〇';
    if (n > 999) return String(n);
    const D = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return D[n];
    if (n < 100) {
      const t = Math.floor(n / 10), o = n % 10;
      return (t > 1 ? D[t] : '') + '十' + (o ? D[o] : '');
    }
    const h = Math.floor(n / 100), r = n % 100;
    return D[h] + '百' + (r ? toKanji(r) : '');
  }

  /* hand-brushed upgrade glyphs */
  const GLYPHS = {
    rapid: '<path d="M6 17L15 7M11 18.5L20 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    heavy: '<path d="M12 4.5c1.4 3.4 2.2 5.4 2.2 7.6 0 2.8-1 4.9-2.2 4.9s-2.2-2.1-2.2-4.9c0-2.2.8-4.2 2.2-7.6z" fill="currentColor"/><circle cx="18" cy="16.8" r="1.6" fill="currentColor"/>',
    split: '<path d="M12 19V9M12 9c-2.6-1.4-3.4-3.4-3-5.6M12 9c2.6-1.4 3.4-3.4 3-5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    pierce: '<circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M17.5 9.5L21 12l-3.5 2.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    over: '<path d="M4 8.5h9M7 12h11M4 15.5h7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    plate: '<path d="M12 4.5c1.4 3.4 2.2 5.4 2.2 7.6 0 2.8-1 4.9-2.2 4.9s-2.2-2.1-2.2-4.9c0-2.2.8-4.2 2.2-7.6z" fill="currentColor" stroke="currentColor" stroke-width="1.6"/>',
    velo: '<path d="M5 16.5C9 15 13 12 18.5 5.5M18.5 5.5l-1 5M18.5 5.5l-4.6 1.4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    adren: '<rect x="6.5" y="6.5" width="11" height="11" fill="currentColor" transform="rotate(-4 12 12)"/><path d="M9.6 12.6l1.8 1.8 3.4-3.8" stroke="#ede7d9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    shock: '<path d="M12 5.2c3.6-.4 6.4 2.4 6.2 5.8-.2 3.9-2.4 7.4-6.4 7.6-3.7.2-6-2.9-6-6.3 0-3.4 2.6-6.7 6.2-7.1z" fill="currentColor"/><path d="M12 8.5v4.2m0 2.2v.4" stroke="#ede7d9" stroke-width="1.6" stroke-linecap="round"/>',
    patch: '<path d="M12 5c1.2 3 2 4.8 2 6.8a2 2 0 1 1-4 0c0-2 .8-3.8 2-6.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    echo: '<path d="M12 20V9M12 4.2v1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M9 6.8L12 3.8l3 3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M9.4 17.4L12 20l2.6-2.6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity=".45"/>',
    orbit: '<circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M18.6 7.6c1.5.6 2.3 1.6 2.3 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M19.2 12c2.8-.4 4.9 1.9 4.8 4.5" fill="none"/><circle cx="19.2" cy="6.8" r="2.3" fill="currentColor"/>',
    nova: '<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M12 4.4v2.8M12 16.8v2.8M4.4 12h2.8M16.8 12h2.8M6.6 6.6l2 2M15.4 15.4l2 2M17.4 6.6l-2 2M8.6 15.4l-2 2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    slow: '<path d="M12 4.6c1.3 3.2 2.1 5 2.1 7.1 0 2.6-.9 4.5-2.1 4.5s-2.1-1.9-2.1-4.5c0-2.1.8-3.9 2.1-7.1z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.4 19c1.8 1 3.6 1.5 5.6 1.5s3.8-.5 5.6-1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none" opacity=".6"/>',
    crit: '<path d="M12 4.2c1.5 3.6 2.3 5.7 2.3 8 0 3-1 5.2-2.3 5.2s-2.3-2.2-2.3-5.2c0-2.3.8-4.4 2.3-8z" fill="currentColor"/><circle cx="17.6" cy="6.4" r="2" fill="#b23a2b"/>',
    ward: '<rect x="8" y="4.6" width="8" height="14.8" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10.4" r="1.7" fill="#b23a2b"/><path d="M10 15.6h4M10.6 17.6h2.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>',
    fan: '<path d="M12 19.5L4.8 8.2c4.4-2.9 10-2.9 14.4 0L12 19.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 19.5L7.4 7.6M12 19.5l4.6-11.9M12 19.5V6.2" stroke="currentColor" stroke-width="1.2" opacity=".7"/>',
    trailW: '<path d="M4.5 16.5c2.4-.6 3.4-2.6 3-5 2.6.6 4.4-.6 5-3 2.4.8 4.4 0 5.4-2 1.6 2.6 2 5.6 1 8.6-1.2 3.6-4.4 5.9-8.2 5.7-2.6-.1-4.8-1.6-6.2-4.3z" fill="currentColor" opacity=".85"/><path d="M8 13.4l1.6 1.6M11.6 11l1.5 1.5" stroke="#ede7d9" stroke-width="1.1" stroke-linecap="round"/>',
    spirit: '<path d="M15.5 6.5c2.6 1.2 4 3.6 3.6 6.4-.4 3-2.6 5.3-5.8 5.4-2.8.1-5-1.8-5.2-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.4 14.2c-.5-2.4.8-4.6 3-5.6 2.4-1 5-.2 6.3 1.8" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/><circle cx="7" cy="17.4" r="2.2" fill="currentColor"/>',
    hanko: '<rect x="5.5" y="5.5" width="13" height="13" fill="#b23a2b" transform="rotate(-5 12 12)"/><path d="M8.5 12.4l2.4 2.4 4.8-5.2" stroke="#ede7d9" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    magnet: '<circle cx="12" cy="13" r="5.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.8 5.4c-.6 2-.6 3.4 0 5M15.2 5.4c.6 2 .6 3.4 0 5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" fill="none"/><circle cx="6.4" cy="4.6" r="1.3" fill="currentColor"/><circle cx="17.6" cy="4.6" r="1.3" fill="currentColor"/>',
    mends: '<path d="M12 19.6c-3.4-2.4-6.4-5-6.4-8.6 0-2.6 1.8-4.4 4-4.4 1 0 1.8.4 2.4 1 .6-.6 1.4-1 2.4-1 2.2 0 4 1.8 4 4.4 0 3.6-3 6.2-6.4 8.6z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.4v5M9.8 11.6h4.4" stroke="#b23a2b" stroke-width="1.5" stroke-linecap="round"/>',
    well: '<path d="M12 4.2c1.5 3.6 2.3 5.7 2.3 8 0 3-1 5.2-2.3 5.2s-2.3-2.2-2.3-5.2c0-2.3.8-4.4 2.3-8z" fill="currentColor"/><path d="M6.4 8.2c1.2 1 2 2.4 2.4 4M17.6 8.2c-1.2 1-2 2.4-2.4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" opacity=".6"/>',
    arc: '<path d="M4 14L9 9.5l2.4 3L15 8l2 3.4L20 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 17.5l3-2.6M17 16.5l3-2.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".5"/><circle cx="9" cy="9.5" r="1.2" fill="#b23a2b"/>',
    boomer: '<path d="M6 17.5C8.6 13.5 12 9.5 17.5 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M17.5 6l-.8 4.4M17.5 6l-4.4.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.4 19.4c2.2-.6 3.6-2 4.4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>',
    vortex: '<path d="M12 12m-1.6 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0" fill="currentColor"/><path d="M12 4.6c4.1 0 7.4 3.3 7.4 7.4M12 19.4c-4.1 0-7.4-3.3-7.4-7.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M15.8 12A3.8 3.8 0 0 1 12 15.8M8.2 12A3.8 3.8 0 0 1 12 8.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>',
  };
  /* the upgrade is filed under 'trail'; the glyph under 'trailW' — same brush */
  GLYPHS.trail = GLYPHS.trailW;

  const HP_DROP = '<svg viewBox="0 0 20 26" aria-hidden="true"><path class="hp-shape" d="M10 2.2c2.6 6 4.6 9.6 4.6 13.2 0 4.6-2 7.8-4.6 7.8s-4.6-3.2-4.6-7.8C5.4 11.8 7.4 8.2 10 2.2z"/></svg>';

  /* the three brushes, hung on the title sheet as tanzaku poem
     slips — each carries its kanji, the tool itself, and its word */
  function buildBrushes(current) {
    if (!el.brushRow) return;
    el.brushRow.innerHTML = '';
    const arts = [];
    for (const id in CFG.brushes) {
      const b = CFG.brushes[id];
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'brush-card' + (id === current ? ' selected' : '');
      card.innerHTML =
        `<span class="brush-kanji" aria-hidden="true">${b.kanji || ''}</span>` +
        `<canvas class="brush-art" width="128" height="44" aria-hidden="true"></canvas>` +
        `<span class="brush-name">${b.name}</span>` +
        `<span class="brush-desc">${b.desc}</span>` +
        `<span class="brush-pin" aria-hidden="true"></span>`;
      card.addEventListener('click', () => {
        G.setBrush(id);
        UI.buildBrushes(id);
        SFX.pick(1);
      });
      el.brushRow.appendChild(card);
      arts.push({ cv: card.querySelector('.brush-art'), id });
    }
    /* the tools are painted once the display face is ready */
    const paint = () => {
      if (typeof R === 'undefined' || !R.drawBrushPreview) return;
      for (const a of arts) R.drawBrushPreview(a.cv, a.id);
    };
    paint();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(paint).catch(() => {});
    }
  }

  function show(name) {
    for (const k in el.screens) el.screens[k].classList.toggle('hidden', k !== name);
  }

  function hud(v) { el.hud.classList.toggle('hidden', !v); }

  function setMode(m) {
    if (el.hudMode) {
      el.hudMode.textContent = m === 'endless' ? 'ENDLESS SCROLL' : 'THE JOURNEY';
      el.hudMode.classList.toggle('endless', m === 'endless');
    }
  }

  /* the sheet's crest, and where the run stands within it:
     第X景 · wave X of ten — 守 marks the Guardian's level */
  function setArea(area, level, waveInLevel, isLevelEnd) {
    if (!el.hudArea) return;
    el.hudAreaKanji.textContent = area.kanji;
    el.hudAreaName.textContent = area.name;
    el.hudWaveTotal.textContent =
      `${toKanji(level)}景 · ${toKanji(waveInLevel)}/${toKanji(CFG.wave.wavesPerLevel)}${isLevelEnd && level === CFG.wave.levelsPerArea ? ' · 守' : ''}`;
  }

  function setWave(n) { el.hudWave.textContent = toKanji(n); }

  function setProgress(f) {
    const v = Math.max(0, Math.min(1, f));
    if (Math.abs(v - lastProgress) < 0.001) return;
    lastProgress = v;
    el.waveFill.style.width = (v * 100).toFixed(1) + '%';
  }

  function setHp(cur, max) {
    el.hudHp.innerHTML = Array.from({ length: max }, (_, i) =>
      `<span class="hp-cell${i < cur ? ' on' : ''}">${HP_DROP}</span>`).join('');
  }

  function setScore(n) { el.hudScore.textContent = fmtScore(n); }

  function setTime(s) {
    const t = fmtTime(s);
    if (t !== lastTimeStr) { lastTimeStr = t; el.hudTime.textContent = t; }
  }

  function banner(n, surge, kind) {
    el.bannerKicker.textContent =
      kind === 'guardian' ? 'THE GUARDIAN WAKES'
      : kind === 'seal' ? 'THE SEAL WAVE'
      : surge ? 'THE SURGE' : 'INCOMING';
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">${toKanji(n)}</span><span class="ban-lat">WAVE ${pad2(n)}${kind === 'guardian' ? ' — GUARDIAN' : kind === 'seal' ? ' — SEAL' : ''}</span>`;
    el.banner.classList.toggle('surge', !!surge || kind === 'guardian' || kind === 'seal');
    el.banner.classList.toggle('area', false);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth; /* restart animation */
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 1500);
  }

  /* a new scene grows on the same page — one level begins */
  function levelBanner(area, level, name) {
    el.bannerKicker.textContent = `THE PAGE GROWS — LEVEL ${toKanji(level)} OF ${toKanji(CFG.wave.levelsPerArea)}`;
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">${area.kanji}</span><span class="ban-lat">第${toKanji(level)}景${name ? ' — ' + name : ''}</span>`;
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', false);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 1900);
  }

  /* a new sheet unrolls: the scroll turns */
  function areaBanner(area, cycle, deepEndless) {
    el.bannerKicker.textContent = deepEndless
      ? `THE SCROLL TURNS FOREVER — SHEET ${toKanji(cycle + 1)}`
      : `THE SCROLL TURNS — SHEET ${toKanji(cycle + 1)} OF ${toKanji(AREAS.length)}`;
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">${area.kanji}</span><span class="ban-lat">${area.name}</span>`;
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', false);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2400);
  }

  function flash() {
    el.flash.classList.add('on');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.flash.classList.remove('on'), 130);
  }

  /* the ink gauge — how close the next stroke rises */
  function setXp(frac, level) {
    if (!el.hudXpFill) return;
    if (level == null) level = lastXp.lv > 0 ? lastXp.lv : 0;
    const v = Math.max(0, Math.min(1, frac));
    if (Math.abs(v - lastXp.f) < 0.002 && level === lastXp.lv) return;
    lastXp.f = v; lastXp.lv = level;
    el.hudXpFill.style.width = (v * 100).toFixed(1) + '%';
    if (el.hudXpLv) el.hudXpLv.textContent = toKanji(level + 1);
  }

  /* the guardian's seal, worn at the top of the sheet */
  let bossShown = false;
  function setBoss(name, frac) {
    if (!el.hudBoss) return;
    if (!name) {
      if (bossShown) { el.hudBoss.classList.add('hidden'); bossShown = false; lastBoss.name = null; }
      return;
    }
    if (!bossShown) { el.hudBoss.classList.remove('hidden'); bossShown = true; }
    if (name !== lastBoss.name) { lastBoss.name = name; el.hudBossName.textContent = name; }
    const v = Math.max(0, Math.min(1, frac));
    if (Math.abs(v - lastBoss.f) >= 0.002) {
      lastBoss.f = v;
      el.hudBossFill.style.width = (v * 100).toFixed(1) + '%';
    }
  }

  /* the kill chain, worn under the score */
  function setCombo(n, mult) {
    if (!el.hudCombo) return;
    if (n >= CFG.combo.showAt) {
      el.hudCombo.classList.remove('hidden');
      el.hudCombo.innerHTML = `<b>×${mult.toFixed(2)}</b><i>${n} 折</i>`;
      el.hudCombo.classList.toggle('hot', n >= 40);
    } else {
      el.hudCombo.classList.add('hidden');
    }
  }

  /* the guardian arrives — the sheet names its keeper */
  function guardianBanner(area, bossName) {
    el.bannerKicker.textContent = `THE GUARDIAN OF SHEET ${area.kanji} WAKES`;
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">守</span><span class="ban-lat">${bossName}</span>`;
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2600);
  }

  function guardianFalls(name) {
    el.bannerKicker.textContent = 'THE GUARDIAN FALLS';
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">宝</span><span class="ban-lat">${name} — TAKE ITS TREASURE</span>`;
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2400);
  }

  function setRunNo(n) { el.runNo.textContent = 'RUN ' + pad3(n); }

  /* the paper remembers the furthest sheet — offer the journey from there */
  function setSheetContinue(n) {
    const btn = document.getElementById('sheetBtn');
    if (!btn) return;
    if (n && n >= 2) {
      btn.classList.remove('hidden');
      const area = AREAS[Math.min(AREAS.length, n) - 1];
      btn.innerHTML =
        `<span class="sheet-kanji" aria-hidden="true">續</span>FROM SCROLL <span class="kanji-inline">${area ? area.kanji : toKanji(n)}</span>`;
    } else {
      btn.classList.add('hidden');
    }
  }

  /* ---------------- the shelf of scrolls ----------------
     five tanzaku strips hang from a beam: one per sheet. A strip
     unrolled may be entered; a strip sealed waits until the scroll
     before it lies finished — ten levels, ten waves each. */
  let onScrollPick = null;      /* main.js answers with a journey run */
  let onScrollsBack = null;     /* main.js answers with the title */

  function buildScrolls() {
    const row = document.getElementById('scrollRow');
    if (!row) return;
    const unlocked = (typeof G !== 'undefined' && G.getUnlocked) ? G.getUnlocked() : 1;
    const cleared = (typeof G !== 'undefined' && G.getCleared) ? G.getCleared() : 0;
    const prog = (typeof G !== 'undefined' && G.getProg) ? G.getProg() : {};
    const done = cleared >= AREAS.length;
    row.innerHTML = '';
    AREAS.forEach((a, i) => {
      const n = i + 1;
      const isCleared = n <= cleared;
      const isLocked = n > unlocked;
      const isCurrent = !isCleared && !isLocked;
      const reached = Math.min(CFG.wave.levelsPerArea, prog[n] || 0);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'scroll-strip' +
        (isCleared ? ' is-cleared' : '') +
        (isLocked ? ' is-locked' : '') +
        (isCurrent ? ' is-current' : '');
      card.style.setProperty('--tilt', ((i % 2 ? 1 : -1) * (0.5 + i * 0.22)).toFixed(2) + 'deg');
      /* ten level dots — the sheet's own ladder, filled to the deepest walk */
      let dots = '';
      for (let d = 1; d <= CFG.wave.levelsPerArea; d++) {
        const filled = isCleared || d <= reached;
        dots += `<i class="ldot${filled ? ' on' : ''}${d === CFG.wave.levelsPerArea ? ' guardian' : ''}"></i>`;
      }
      const state = isLocked
        ? '<span class="strip-state"><span class="strip-lock">鍵</span>SEALED</span>'
        : isCleared
        ? '<span class="strip-state is-done"><span class="strip-seal">落</span>CLEARED</span>'
        : '<span class="strip-state is-wait"><span class="strip-wait">筆</span>IN PROGRESS</span>';
      const progLine = (!isLocked && !isCleared)
        ? `<span class="strip-prog">${toKanji(reached)} / ${toKanji(CFG.wave.levelsPerArea)}景</span>`
        : '';
      card.innerHTML =
        `<span class="strip-string" aria-hidden="true"></span>` +
        `<span class="strip-no">SCROLL ${['I', 'II', 'III', 'IV', 'V'][i]}</span>` +
        `<span class="strip-kanji" aria-hidden="true">${a.kanji}</span>` +
        `<span class="strip-name">${a.name}</span>` +
        `<span class="strip-ink">${a.ink} · 十景</span>` +
        `<span class="strip-dots" aria-hidden="true">${dots}</span>` +
        progLine + state;
      card.setAttribute('aria-label',
        `Scroll ${a.name} — ${isLocked ? 'sealed' : isCleared ? 'cleared' : 'unrolled'}`);
      card.addEventListener('click', () => {
        if (isLocked) {
          card.classList.remove('refuse');
          void card.offsetWidth;
          card.classList.add('refuse');
          setScrollsHint(`THE PAPER IS SEALED — BREAK SCROLL ${(AREAS[i - 1] || a).kanji}'S GUARDIAN FIRST`);
          SFX.thud();
          return;
        }
        SFX.pick(1);
        if (onScrollPick) onScrollPick(n);
      });
      row.appendChild(card);
    });
    const hint = document.getElementById('scrollsHint');
    if (hint) {
      hint.textContent = done
        ? 'EVERY SCROLL LIES FINISHED — THE ENDLESS SCROLL 無 STILL ASKS FOR MORE'
        : 'TEN LEVELS OF TEN WAVES EACH — BREAK A GUARDIAN TO UNROLL THE NEXT';
    }
  }

  function setScrollsHint(txt) {
    const hint = document.getElementById('scrollsHint');
    if (!hint) return;
    hint.textContent = txt;
    hint.classList.remove('nudge');
    void hint.offsetWidth;
    hint.classList.add('nudge');
  }

  /* the guardian's fall unrolls the next scroll — cried across the sheet */
  function unlockBanner(area, nextArea, isLast) {
    el.bannerKicker.textContent = isLast
      ? `THE FIFTH GUARDIAN FALLS — SCROLL ${area.kanji} IS PAINTED`
      : `SCROLL ${area.kanji} ${area.name} — CLEARED IN FULL`;
    el.bannerTitle.innerHTML = isLast
      ? `<span class="ban-kanji">終</span><span class="ban-lat">THE JOURNEY IS COMPLETE</span>`
      : `<span class="ban-kanji">${nextArea.kanji}</span><span class="ban-lat">${nextArea.name} — UNROLLED</span>`;
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.toggle('front', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      el.banner.classList.remove('show', 'front');
    }, 3400);
  }

  function setBest(b) {
    if (b && b.score > 0) {
      el.bestLine.classList.remove('hidden');
      el.bestLine.innerHTML = `BEST — WAVE <span class="kanji-inline">${toKanji(b.wave)}</span> · ${b.score.toLocaleString('en-US')} PTS`;
    } else {
      el.bestLine.classList.add('hidden');
    }
  }

  function fillUpgrades(choices, levels) {
    el.upgradeGrid.innerHTML = '';
    choices.forEach((u, i) => {
      const lv = levels[u.id] || 0;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'up-card' + (u.weapon ? ' is-weapon' : '');
      const pips = u.patch ? '' : Array.from({ length: u.max }, (_, k) =>
        `<i class="pip${k < lv ? ' on' : ''}"></i>`).join('');
      const isNew = !u.patch && lv === 0 ? '<span class="up-new">NEW</span>' : '';
      const isWpn = u.weapon ? '<span class="up-wpn">武</span>' : '';
      card.innerHTML =
        `<div class="up-top"><span class="up-no">之${toKanji(i + 1)}</span><span class="up-top-right">${isWpn}${isNew}<span class="up-pips">${pips}</span></span></div>` +
        `<svg class="up-glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[u.id] || GLYPHS.patch}</svg>` +
        `<h3 class="up-name">${u.name}</h3>` +
        `<p class="up-desc">${u.desc}</p>` +
        `<span class="up-check" aria-hidden="true"></span>`;
      card.addEventListener('click', () => G.pickAt(i));
      el.upgradeGrid.appendChild(card);
    });
  }

  function markSelected(i) {
    [...el.upgradeGrid.children].forEach((c, idx) => {
      c.classList.toggle('selected', idx === i);
      c.classList.toggle('faded', i !== null && idx !== i);
    });
  }

  function setDeploy(on, nextArea, level, cycle, kind) {
    el.deployBtn.classList.toggle('is-disabled', !on);
    el.deployBtn.disabled = !on;
    if (kind === 'level') {
      el.deployBtn.innerHTML = 'DRINK THE INK — CONTINUE';
      return;
    }
    if (kind === 'chest') {
      el.deployBtn.innerHTML = 'POCKET THE GIFT — CONTINUE';
      return;
    }
    el.deployBtn.innerHTML = on
      ? (nextArea
        ? `UNROLL — <span class="kanji-inline">${nextArea.kanji}</span> ${nextArea.name}`
        : `DEPLOY — LEVEL <span class="kanji-inline">${toKanji(level)}</span>`)
      : (nextArea
        ? `NEXT — SCROLL <span class="kanji-inline">${nextArea.kanji}</span> ${nextArea.name}`
        : `DEPLOY — LEVEL <span class="kanji-inline">${toKanji(level)}</span>`);
  }

  function setUpgradeHeader(waveInLevel, level, area, kind, xpLevel) {
    if (kind === 'level') {
      el.upKicker.innerHTML =
        `THE INK RISES — LEVEL <span class="kanji-inline">${toKanji(xpLevel)}</span>`;
      el.upNext.innerHTML = '<span class="kanji-inline">墨</span>';
      return;
    }
    if (kind === 'chest') {
      el.upKicker.innerHTML =
        'THE CHEST OPENS — <span class="kanji-inline">宝</span> A GIFT FROM THE GUARDIAN';
      el.upNext.innerHTML = '<span class="kanji-inline">宝</span>';
      return;
    }
    /* a level's seal was just broken */
    const lastLevel = level >= CFG.wave.levelsPerArea;
    el.upKicker.innerHTML =
      `SHEET <span class="kanji-inline">${area.kanji}</span> ${area.name} — LEVEL <span class="kanji-inline">${toKanji(level)}</span> SEALED`;
    el.upNext.innerHTML = lastLevel
      ? '<span class="kanji-inline">?</span>'
      : '<span class="kanji-inline">' + toKanji(level + 1) + '</span>';
  }

  function showOver(d) {
    const vict = !!d.victory;
    el.overTitle.textContent = vict ? 'THE SCROLL ENDS.' : 'THE INK DRIES.';
    el.overSub.textContent = vict
      ? 'Five sheets painted, every guardian felled. The paper asks for more.'
      : 'The paper keeps every stroke. Even this one.';
    el.overKicker.textContent =
      `RUN ${pad3(d.run)} — ${d.mode === 'endless' ? 'THE ENDLESS SCROLL' : vict ? 'THE JOURNEY, COMPLETE' : 'THE INK CLAIMS ANOTHER'}`;
    el.overRank.textContent = d.rank;
    el.statWaves.innerHTML = `${d.waves} <span class="kanji-inline">${toKanji(d.waves)}</span>`;
    el.statKills.textContent = d.kills.toLocaleString('en-US');
    el.statTime.textContent = fmtTime(d.time);
    el.statScore.textContent = d.score.toLocaleString('en-US');
    el.newBestBadge.classList.toggle('hidden', !d.newBest);
    if (el.continueBtn) {
      el.continueBtn.classList.toggle('hidden', !vict);
      if (vict) {
        el.continueBtn.innerHTML =
          'INTO THE ENDLESS — <span class="kanji-inline">無</span>';
      }
    }
  }

  function muteVisual(m) { el.muteBtn.classList.toggle('muted', m); }

  /* the brush's current loadout, worn on the wrist */
  function setLoadout(levels) {
    if (!el.hudLoadout) return;
    el.hudLoadout.innerHTML = UPGRADES
      .filter(u => (levels[u.id] || 0) > 0)
      .map(u => `<span class="load-item" title="${u.name}"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[u.id] || GLYPHS.patch}</svg><b>${levels[u.id]}</b></span>`)
      .join('');
  }

  return {
    show, hud, setWave, setProgress, setHp, setScore, setTime, banner, areaBanner, levelBanner, flash,
    setRunNo, setBest, setSheetContinue, buildBrushes, fillUpgrades, markSelected,
    setDeploy, setUpgradeHeader, showOver, muteVisual, setLoadout, setArea, setMode, setXp,
    setBoss, setCombo, guardianBanner, guardianFalls, el, toKanji,
    buildScrolls, setScrollsHint, unlockBanner,
    get onScrollPick() { return onScrollPick; },
    set onScrollPick(fn) { onScrollPick = fn; },
    get onScrollsBack() { return onScrollsBack; },
    set onScrollsBack(fn) { onScrollsBack = fn; },
  };
})();
