'use strict';
/* ============================================================
   ONE MORE — DOM / UI layer (ink scroll edition)
   ============================================================ */

const UI = (() => {
  const $ = id => document.getElementById(id);

  let lastOver = null;   /* the most recent over-sheet report — the share card reads it */

  const el = {
    hardBtn: $('hardBtn'), hudHard: $('hudHard'),
    hud: $('hud'), hudWave: $('hudWave'), waveFill: $('waveFill'), hudHp: $('hudHp'),
    hudScore: $('hudScore'), hudTime: $('hudTime'), muteBtn: $('muteBtn'),
    hudArea: $('hudArea'), hudAreaKanji: $('hudAreaKanji'), hudAreaName: $('hudAreaName'),
    hudWaveTotal: $('hudWaveTotal'), hudMode: $('hudMode'),
    banner: $('waveBanner'), bannerKicker: $('bannerKicker'), bannerTitle: $('bannerTitle'),
    bannerSub: $('bannerSub'),
    screens: {
      title: $('screenTitle'), scrolls: $('screenScrolls'), upgrade: $('screenUpgrade'),
      clear: $('screenClear'), pause: $('screenPause'), over: $('screenOver'),
      board: $('screenBoard'), settings: $('screenSettings'), charms: $('screenCharms'),
      brush: $('screenBrush'),
    },
    clearKicker: $('clearKicker'), clearTitle: $('clearTitle'), clearSub: $('clearSub'),
    clearNextValue: $('clearNextValue'), clearNextBtn: $('clearNextBtn'), clearHomeBtn: $('clearHomeBtn'),
    hudLoadout: $('hudLoadout'), hudXpFill: $('hudXpFill'), hudXpLv: $('hudXpLv'),
    hudBoss: $('hudBoss'), hudBossName: $('hudBossName'), hudBossFill: $('hudBossFill'),
    hudBossKick: $('hudBossKick'),
    runNo: $('runNo'), bestLine: $('bestLine'),
    hudCombo: $('hudCombo'),
    upKicker: $('upKicker'), upNext: $('upNext'), upgradeGrid: $('upgradeGrid'), deployBtn: $('deployBtn'),
    overKicker: $('overKicker'), overRank: $('overRank'), overTitle: $('overTitle'), overSub: $('overSub'),
    continueBtn: $('continueBtn'),
    statWaves: $('statWaves'), statKills: $('statKills'), statTime: $('statTime'), statScore: $('statScore'),
    statInk: $('statInk'),
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
    /* v19 — the brush's own arts */
    nrain: '<path d="M12 4v11M7 7v9M17 7v9M4 11v6M20 11v6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    ndeep: '<path d="M4 12h13M13 8.5L17.5 12 13 15.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="20" cy="12" r="1.5" fill="currentColor"/>',
    nsilk: '<path d="M3 12c3-4 6 4 9 0s6-4 9 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    bwide: '<path d="M4 12c3-5 8-7 16-7M4 12c3 5 8 7 16 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M4 12h13" stroke="currentColor" stroke-width="1.4"/>',
    bbrist: '<path d="M4 12h11M15 12l4-3M15 12l4 3M15 12l5 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    bwet: '<path d="M4 15c2.5-2 5-2 8 0s5.5 2 8 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M8 9c1-1.6 2.4-1.6 3.4 0S13 11 12 11s-5-.4-4-2z" fill="currentColor"/>',
    sshat: '<circle cx="11" cy="12" r="3.2" fill="currentColor"/><path d="M15.5 8.5l2.5-2M16.5 12h3M15.5 15.5l2.5 2M6.5 8.5l-2-2M6.5 15.5l-2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    squake: '<path d="M4 17h16M6 17v-3M12 17v-5M18 17v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 8l2 2M9 6l2 3M15 6l-2 3M21 8l-2 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    sbould: '<path d="M7 16c-1.5-3.5.5-8 5-8s6.5 4.5 5 8c-.8 1.6-9.2 1.6-10 0z" fill="currentColor"/>',
    wtwin: '<circle cx="8.5" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="15.5" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9"/>',
    whaunt: '<path d="M5 14c2-5 7-8 12-7-1 5-5 9-10 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><circle cx="15" cy="9.6" r="1.4" fill="currentColor"/>',
    fbloom: '<path d="M12 12L12 4M12 12l6.9-4M12 12l6.9 4M12 12l0 8M12 12l-6.9 4M12 12l-6.9-4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    fgale: '<path d="M4 9h9a2.5 2.5 0 1 0-2.4-3.2M4 13h13a2.5 2.5 0 1 1-2.4 3.2M4 17h7" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    fedge: '<path d="M12 4v16M8 7v10M16 7v10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    nrip: '<path d="M4 9c2.7-2.4 5.3-2.4 8 0s5.3 2.4 8 0M4 15c2.7-2.4 5.3-2.4 8 0s5.3 2.4 8 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>',
    nswell: '<path d="M4 16c2-6 5-9 8-9s6 3 8 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M4 19h16" stroke="currentColor" stroke-width="1.6"/>',
    nunder: '<path d="M12 5v9M12 14l-3.5-3.5M12 14l3.5-3.5M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    nspring: '<path d="M5 15a7 7 0 0 1 14 0M5 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M12 8V4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    htwin: '<rect x="4" y="8" width="7" height="8" rx="1" fill="currentColor"/><rect x="13" y="8" width="7" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="1.8"/>',
    hbroad: '<rect x="4" y="7" width="16" height="10" rx="1.4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.8"/>',
    hpress: '<rect x="7" y="8" width="10" height="8" rx="1" fill="currentColor"/><path d="M5 5h14M5 19h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    hrain: '<rect x="8" y="4" width="8" height="6" rx="1" fill="currentColor"/><path d="M6 14h3M12 14h3M9 18h3M15 18h3M4.5 18h2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    ssecond: '<path d="M6 18c8 0 12-4 12-12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M4 20c8 0 12-4 12-12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none" opacity="0.65"/>',
    sswift: '<path d="M4 16C10 16 14 12 15 5c4 2 6 6 5 10-1 3-4 5-8 5-3 0-6-1.5-8-4z" fill="currentColor"/>',
    slong: '<path d="M3 12h18M18 12l-3.5-3M18 12l-3.5 3" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
    swake: '<path d="M4 18c6 0 10-3 13-9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M5 21h4M11 21h4M17 21h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    sdeep: '<path d="M6 5c8 2 12 6 12 14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/><circle cx="18.5" cy="19.5" r="1.8" fill="currentColor"/>',

  };
  /* the upgrade is filed under 'trail'; the glyph under 'trailW' — same brush */
  GLYPHS.trail = GLYPHS.trailW;

  const HP_DROP = '<svg viewBox="0 0 20 26" aria-hidden="true"><path class="hp-shape" d="M10 2.2c2.6 6 4.6 9.6 4.6 13.2 0 4.6-2 7.8-4.6 7.8s-4.6-3.2-4.6-7.8C5.4 11.8 7.4 8.2 10 2.2z"/></svg>';

  /* the starter brush — one entry on the title, one shelf behind it.
     The entry carries the tool in the hand (kanji + name); tapping it
     opens the brush room, where every brush hangs at full length:
     kanji, name, its whole word — nothing abbreviated on the phone.
     A sealed brush wears the 封 lid: its word is the road still owed
     (clear N scenes and the lid comes off). */
  function setBrushEntry(current) {
    const k = document.getElementById('brushBtnKanji');
    const n = document.getElementById('brushBtnName');
    const b = CFG.brushes[current];
    if (k) k.textContent = (b && G.brushUnlocked(current)) ? (b.kanji || '筆') : '封';
    if (n && b) n.textContent = b.name;
  }

  function buildBrushRoom(current) {
    const wrap = document.getElementById('brushRows');
    if (!wrap) return;
    wrap.innerHTML = '';
    const sealed = G.scenesSealed();
    for (const id in CFG.brushes) {
      const b = CFG.brushes[id];
      const locked = !G.brushUnlocked(id);
      const need = b.unlock || 0;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'set-row br-row' + (id === current ? ' is-chosen' : '') + (locked ? ' is-sealed' : '');
      row.title = locked ? 'SEALED — clear ' + need + ' scene' + (need === 1 ? '' : 's') + ' in the journey to open this brush'
                         : 'Take up ' + b.name;
      row.innerHTML =
        `<span class="set-kanji" aria-hidden="true">${locked ? '封' : (b.kanji || '筆')}</span>` +
        `<span class="set-name">${b.name}</span>` +
        `<span class="set-desc">${locked ? `SEALED — CLEAR ${need} SCENE${need === 1 ? '' : 'S'} IN THE JOURNEY TO WAKE THIS BRUSH` : b.desc}</span>` +
        (locked
          ? `<span class="set-state br-prog" aria-label="${Math.min(sealed, need)} of ${need} scenes sealed">${Math.min(sealed, need)} / ${need}</span>`
          : `<span class="set-state br-state" aria-hidden="true">${id === current ? '印' : '—'}</span>`);
      row.addEventListener('click', () => {
        SFX.ensure();
        if (locked) {
          /* a sealed brush does not take the hand: the row shakes,
             the road speaks — the dull knock, the refusal's own voice */
          SFX.thud();
          row.classList.remove('denied'); void row.offsetWidth; row.classList.add('denied');
          return;
        }
        G.setBrush(id);
        UI.buildBrushes(id);      /* the stamp moves, the entry re-inks */
        SFX.pick(1);
      });
      wrap.appendChild(row);
    }
    /* the road still owed: what opens next, and how far */
    const hint = document.getElementById('brushRoomHint');
    if (hint) {
      let next = null;
      for (const id in CFG.brushes) {
        const b = CFG.brushes[id];
        if (b.unlock && sealed < b.unlock && (!next || b.unlock < next.unlock)) next = b;
      }
      hint.textContent = next
        ? `SCENES SEALED ${sealed} — ${next.name} OPENS AT ${next.unlock}`
        : 'EVERY BRUSH WAKES — THE WHOLE SHELF IS YOURS';
      hint.classList.toggle('is-live', !!next);
    }
  }

  function buildBrushes(current) {
    setBrushEntry(current);
    buildBrushRoom(current);
  }

  /* each sheet's ink, ground for the DOM: every seal chip in the
     band is a small sheet of its own paper, carrying its own ink —
     淡 pale warm, 濃 lamp-black, 朱 vermillion, 雨 rain-grey,
     金 gold-dust, 素 the blank silk — so the journey reads as six hung sheets */
  const BAND_TONES = {
    pale:  { ink: '#4a3d28', rgba: '74,61,40',    paper: '#ede7d9' },
    dark:  { ink: '#e9e2d2', rgba: '233,226,210', paper: '#3e372b' },
    red:   { ink: '#a2321f', rgba: '162,50,31',   paper: '#eadbc4' },
    storm: { ink: '#31485a', rgba: '49,72,90',    paper: '#c7cdc9' },
    gilt:  { ink: '#8a6420', rgba: '138,100,32',  paper: '#e7d6ad' },
    silk:  { ink: '#5a5068', rgba: '90,80,104',   paper: '#f3eee1' },
  };
  const SHEET_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  /* the shelf re-inks a whole subtree with a sheet's tones: every
     strip is a small sheet of its own paper, so the ink tiers it
     prints with must be the sheet's ink, not the page's */
  function sheetVars(theme, opts) {
    const t = BAND_TONES[theme] || BAND_TONES.pale;
    const o = opts || {};
    /* a sealed sheet shows its tone through the seal: the paper
       pulls toward the desk and the ink toward the desk's ghost —
       pulled HARD enough to read (v15: the old desk tone was the
       page's own paper, so the mute never showed) */
    const PAPER_LOCK = [199, 192, 179], INK_DESK = [26, 23, 20];
    const pm = o.locked ? 0.66 : 0, im = o.locked ? 0.62 : 0;
    const paper = mixRGB(hex2rgb(t.paper), PAPER_LOCK, pm);
    const ink = mixRGB(hex2rgb(t.ink), INK_DESK, im);
    const ir = ink.join(',');
    const dark = theme === 'dark';
    return {
      'pt-paper': `rgb(${paper.join(',')})`,
      'paper': `rgb(${paper.join(',')})`,
      'paper-92': `rgba(${paper.join(',')},0.94)`,
      'paper-80': `rgba(${paper.join(',')},0.82)`,
      'paper-55': `rgba(${paper.join(',')},0.6)`,
      'ink': `rgb(${ir})`,
      'ink-70': `rgba(${ir},0.7)`,
      'ink-62': `rgba(${ir},0.62)`,
      'ink-55': `rgba(${ir},0.55)`,
      'ink-45': `rgba(${ir},0.45)`,
      'ink-25': `rgba(${ir},0.25)`,
      'ink-12': `rgba(${ir},0.12)`,
      /* the one sacred red — lifted on the night sheet alone */
      'red': dark ? '#ea7560' : '#b23a2b',
      /* the wash a hover breathes: the sheet's ink in the air */
      'pt-rgba': t.rgba,
    };
  }
  function applySheetVars(elm, theme, opts) {
    const v = sheetVars(theme, opts);
    for (const k in v) elm.style.setProperty('--' + k, v[k]);
  }
  /* tones must read on the page they hang on: a band that survived
     the night scroll lies on dark paper, and its pale warm inks
     would drown — so each tone is pulled a little toward the
     page's own ink before it touches the air */
  const hex2rgb = h => { const p = parseInt(h.slice(1), 16); return [p >> 16 & 255, p >> 8 & 255, p & 255]; };
  const mixRGB = (a, b, k) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * k));

  function show(name) {
    for (const k in el.screens) el.screens[k].classList.toggle('hidden', k !== name);
  }

  function hud(v) { el.hud.classList.toggle('hidden', !v); }

  function setMode(m, sub) {
    if (el.hudMode) {
      el.hudMode.textContent =
        m === 'daily' ? 'DAILY INK · ' + (sub || 'TODAY')
        : m === 'endless' ? 'ENDLESS SCROLL' : 'THE JOURNEY';
      el.hudMode.classList.toggle('endless', m !== 'journey');
    }
  }

  /* the sheet's crest, and where the run stands within it:
     第二景 · wave X of ten — the scene number leads, in red,
     so a new level never reads as the counter resetting */
  function setArea(area, level, waveInLevel, isLevelEnd) {
    if (!el.hudArea) return;
    el.hudAreaKanji.textContent = area.kanji;
    el.hudAreaName.textContent = area.name;
    el.hudWaveTotal.innerHTML =
      `<b class="lv-num">SCENE ${level}</b><span class="lv-sep">·</span><span class="lv-wave">${waveInLevel}/${CFG.wave.wavesPerLevel}${isLevelEnd && level === CFG.wave.levelsPerArea ? ' <span class="lv-keep">守</span>' : ''}</span>`;
  }

  /* the HUD's wave seal now wears the count itself — Arabic numerals,
     English-first; the seal just carries them */
  function setWave(n) {
    el.hudWave.textContent = n;
    el.hudWave.classList.toggle('long', n >= 100);
  }

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

  let lastScore = -1;
  function setScore(n) {
    if (n === lastScore) return;   /* a flood of kills must not flood the DOM */
    lastScore = n;
    el.hudScore.textContent = fmtScore(n);
  }

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
    if (el.bannerSub) el.bannerSub.textContent = '';
    el.banner.classList.toggle('surge', !!surge || kind === 'guardian' || kind === 'seal');
    el.banner.classList.toggle('area', false);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth; /* restart animation */
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 1500);
  }

  /* a new scene grows on the same page — one level begins.
     Held a beat longer than a wave banner: the scene number is
     the news, and it must land before the first beast does. */
  function levelBanner(area, level, name) {
    el.bannerKicker.textContent = `THE PAGE GROWS — SCENE ${level} OF ${CFG.wave.levelsPerArea}`;
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">${toKanji(level)}</span><span class="ban-lat">SCENE ${level}${name ? ' — ' + name : ''}</span>`;
    if (el.bannerSub) el.bannerSub.textContent = '';
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', false);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2300);
  }

  /* the red seal, cried once at a hard run's start — after the run
     is named. From there the 難 on the HUD does the talking. */
  function hardBanner() {
    el.bannerKicker.textContent = 'REALLY HARD — THE INK BITES BACK';
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">難</span><span class="ban-lat">EVERY PAGE BITES DEEPER</span>`;
    if (el.bannerSub) el.bannerSub.textContent = '';
    el.banner.classList.toggle('area', false);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2200);
  }

  /* the toggle, worn in three places: the title's red chip, the
     HUD's vermillion 難 seal through the run, and the state word */
  function setHard(v) {
    if (el.hardBtn) {
      el.hardBtn.classList.toggle('on', !!v);
      el.hardBtn.setAttribute('aria-pressed', v ? 'true' : 'false');
    }
    const st = document.querySelector('#hardBtn .hard-state');
    if (st) st.textContent = v ? 'ON' : 'OFF';
    if (el.hudHard) el.hudHard.classList.toggle('hidden', !v);
  }

  /* a level's seal breaks — the scene is complete. Red, brief,
     unmistakable: the counter is about to climb, not restart. */
  function sealBanner(area, level) {
    el.bannerKicker.textContent = `THE SEAL BREAKS — SCENE ${level} COMPLETE`;
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">印</span><span class="ban-lat">SCENE ${level} — COMPLETE</span>`;
    if (el.bannerSub) el.bannerSub.textContent = '';
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 1700);
  }

  /* the level-clear rest: the seal is pressed, the hand chooses —
     onward naked, or home. The next scene always starts unadorned. */
  function showClear(d) {
    const nextLevel = d.level + 1;
    el.clearKicker.textContent = `SCROLL ${d.area.kanji} ${d.area.name}`;
    el.clearTitle.innerHTML =
      `<span class="ct-kanji">${toKanji(d.level)}</span><span class="ct-lat">SCENE ${d.level} — SEALED</span>`;
    el.clearSub.textContent = d.guardian
      ? 'The scroll is painted in full. The next unrolls naked — every stroke is earned again.'
      : 'The scene is pressed into the paper. The next begins unadorned — the brush keeps nothing.';
    el.clearNextValue.innerHTML = d.guardian && d.nextArea
      ? `<span class="cn-kanji">${d.nextArea.kanji}</span><span class="cn-name">${d.nextArea.name}</span>`
      : `<span class="cn-kanji">${toKanji(nextLevel)}</span><span class="cn-name">SCENE ${pad2(nextLevel)}</span>`;
    el.clearNextBtn.innerHTML = d.guardian
      ? 'NEXT SCROLL'
      : 'NEXT SCENE';
    el.screens.clear.classList.remove('rise');
    void el.screens.clear.offsetWidth;   /* the seal is pressed fresh each time */
    el.screens.clear.classList.add('rise');
    show('clear');
  }

  /* a new sheet unrolls: the scroll turns */
  function areaBanner(area, cycle, deepEndless, runNo) {
    el.bannerKicker.textContent = runNo
      ? (G.S.runMode === 'endless'
        ? `THE ENDLESS SCROLL — RUN ${pad3(runNo)}`
        : `THE JOURNEY — RUN ${pad3(runNo)}`)
      : deepEndless
      ? `THE SCROLL TURNS FOREVER — SHEET ${cycle + 1}`
      : `THE SCROLL TURNS — SHEET ${cycle + 1} OF ${AREAS.length}`;
    if (el.bannerSub) el.bannerSub.textContent = '';
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
    if (el.hudXpLv) el.hudXpLv.textContent = level + 1;
  }

  /* the red beast's seal, worn at the top of the sheet */
  let bossShown = false;
  function setBoss(name, frac, kick) {
    if (!el.hudBoss) return;
    if (!name) {
      if (bossShown) { el.hudBoss.classList.add('hidden'); bossShown = false; lastBoss.name = null; lastBoss.k = null; }
      return;
    }
    if (!bossShown) { el.hudBoss.classList.remove('hidden'); bossShown = true; }
    if (name !== lastBoss.name) { lastBoss.name = name; el.hudBossName.textContent = name; }
    if (kick != null && kick !== lastBoss.k && el.hudBossKick) { lastBoss.k = kick; el.hudBossKick.textContent = kick; }
    const v = Math.max(0, Math.min(1, frac));
    if (Math.abs(v - lastBoss.f) >= 0.002) {
      lastBoss.f = v;
      el.hudBossFill.style.width = (v * 100).toFixed(1) + '%';
    }
    /* beneath half, the beast burns — the bar itself begins to rage */
    el.hudBoss.classList.toggle('enrage', v < 0.5);
  }

  /* the kill chain, worn under the score */
  let lastCombo = { n: -1, m: -1 };
  function setCombo(n, mult) {
    if (!el.hudCombo) return;
    const m = Math.round(mult * 100);
    if (n === lastCombo.n && m === lastCombo.m) return;   /* same chain, same pixels */
    lastCombo.n = n; lastCombo.m = m;
    if (n >= CFG.combo.showAt) {
      el.hudCombo.classList.remove('hidden');
      el.hudCombo.innerHTML = `<b>×${mult.toFixed(2)}</b><i>${n} CHAIN</i>`;
      el.hudCombo.classList.toggle('hot', n >= 40);
    } else {
      el.hudCombo.classList.add('hidden');
    }
  }

  /* a red beast wakes — the sheet's Guardian, or a scene's Keeper.
     Same cry, different rank; the gong backs it in game.js. */
  function bossBanner(area, bossName, keeper, level, type) {
    el.bannerKicker.textContent = keeper
      ? `THE KEEPER OF SCENE ${level || 1} WAKES`
      : `THE GUARDIAN OF ${area.name} WAKES`;
    el.bannerTitle.innerHTML =
      `<span class="ban-kanji">守</span><span class="ban-lat">${bossName}</span>`;
    /* the beast speaks its one line: the duel's tone set before the first stroke */
    if (el.bannerSub) {
      const t = (typeof BOSS_TAUNTS !== 'undefined' && BOSS_TAUNTS[type]) || '';
      el.bannerSub.textContent = t;
    }
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), keeper ? 2600 : 3100);
  }

  function guardianBanner(area, bossName) { bossBanner(area, bossName, false, 1); }

  function bossFalls(name, keeper) {
    el.bannerKicker.textContent = keeper ? 'THE KEEPER FALLS' : 'THE GUARDIAN FALLS';
    el.bannerTitle.innerHTML = keeper
      ? `<span class="ban-kanji">倒</span><span class="ban-lat">${name} — THE SCENE REMEMBERS</span>`
      : `<span class="ban-kanji">宝</span><span class="ban-lat">${name} — TAKE ITS TREASURE</span>`;
    if (el.bannerSub) el.bannerSub.textContent = '';
    el.banner.classList.toggle('area', true);
    el.banner.classList.toggle('surge', true);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2400);
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

  /* the SCENES door: the shelf of scrolls answers here. THE JOURNEY
     took over the quick-start (v15 — the button stopped disagreeing
     with ENTER), so this line now always offers the journey by hand:
     a fresh scribe reads SIX SCROLLS, a returning one wears the
     scroll the brush last walked. */
  function setSheetContinue(n) {
    const btn = document.getElementById('sheetBtn');
    if (!btn) return;
    btn.classList.remove('hidden');
    const area = AREAS[Math.min(AREAS.length, Math.max(1, n || 1)) - 1];
    btn.innerHTML = n >= 2
      ? `<span class="sheet-kanji" aria-hidden="true">續</span>SCENES — SCROLL <span class="kanji-inline">${area ? area.kanji : toKanji(n)}</span> ONWARD`
      : `<span class="sheet-kanji" aria-hidden="true">章</span>SCENES — SIX SCROLLS`;
  }

  /* ---------------- the shelf of scrolls ----------------
     six tanzaku strips hang from a beam: one per sheet. A strip
     unrolled may be entered; a strip sealed waits until the scroll
     before it lies finished — ten levels, ten waves each. */
  let onScrollPick = null;      /* main.js answers with a journey run */
  let onOpenScroll = null;      /* main.js answers by unrolling the scroll's scenes */
  let onScrollsBack = null;     /* main.js answers with the title */
  let ladderSheet = 0;          /* 0 = the shelf; n = the ten scenes of scroll n */
  const SCROLLS_HEAD = {
    kick: 'THE JOURNEY — SIX SCROLLS · SIXTY SCENES',
    title: 'SIX SCROLLS',
    sub: "Ten levels of ten waves each. Fell a scroll's Guardian and the next unrolls.",
  };
  function setScrollsHead(kick, title, sub) {
    const q = s => document.querySelector('#screenScrolls ' + s);
    const k = q('.scrolls-kicker'), t = q('.scrolls-title'), sb = q('.scrolls-sub');
    if (k && kick) k.textContent = kick;
    if (t && title) t.textContent = title;
    if (sb && sub) sb.textContent = sub;
  }
  /* a scroll unrolling is an event: the head re-inks itself */
  function retraceHead() {
    const h = document.querySelector('#screenScrolls .scrolls-head');
    if (!h) return;
    h.classList.remove('retrace');
    void h.offsetWidth;
    h.classList.add('retrace');
  }
  /* the foot's return door says where it lands: the shelf folds to
     the title; a scene ladder folds to the shelf first */
  function setBackLabel(txt) {
    const b = document.getElementById('scrollsBackBtn');
    if (b) b.textContent = txt;
  }

  /* a hovered strip breathes its sheet's ink into the shelf air —
     the same language the title's journey band speaks */
  function shelfWash(theme) {
    const wash = document.getElementById('shelfWash');
    if (!wash) return;
    if (!theme) { wash.classList.remove('on'); return; }
    const t = BAND_TONES[theme] || BAND_TONES.pale;
    wash.style.background =
      `radial-gradient(ellipse 46% 34% at 50% 46%, rgba(${t.rgba},0.14), transparent 72%)`;
    wash.classList.add('on');
  }

  function buildScrolls() {
    const row = document.getElementById('scrollRow');
    if (!row) return;
    /* the shelf view returns: the scene ladder folds away, and the
       screen wears no single sheet — six papers hang here */
    ladderSheet = 0;
    const scr = document.getElementById('screenScrolls');
    if (scr) scr.removeAttribute('data-wear');
    const lrow = document.getElementById('levelRow');
    if (lrow) lrow.classList.add('hidden');
    row.classList.remove('hidden');
    setScrollsHead(SCROLLS_HEAD.kick, SCROLLS_HEAD.title, SCROLLS_HEAD.sub);
    setBackLabel('TITLE');
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
      /* the strip is a small sheet of its own paper: every ink tier
         it prints with is the sheet's own — a sealed scroll shows
         its tone through the seal, ghosted toward the desk */
      applySheetVars(card, a.theme, { locked: isLocked });
      card.addEventListener('mouseenter', () => shelfWash(a.theme));
      card.addEventListener('mouseleave', () => shelfWash(null));
      /* ten level dots — the sheet's own ladder, filled to the deepest walk
         (the dots ARE the count: no second numeric line under them) */
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
      card.innerHTML =
        `<span class="strip-string" aria-hidden="true"></span>` +
        `<span class="strip-no">SCROLL ${SHEET_ROMAN[i]}</span>` +
        `<span class="strip-kanji" aria-hidden="true">${a.kanji}</span>` +
        `<span class="strip-name">${a.name}</span>` +
        `<span class="strip-ink">${a.ink} ink</span>` +
        `<span class="strip-dots" aria-hidden="true">${dots}</span>` +
        state;
      card.setAttribute('aria-label',
        `Scroll ${a.name} — ${isLocked ? 'sealed' : isCleared ? 'cleared' : 'unrolled'}`);
      card.addEventListener('click', () => {
        if (isLocked) {
          card.classList.remove('refuse');
          void card.offsetWidth;
          card.classList.add('refuse');
          setScrollsHint(`THE PAPER IS SEALED — BREAK THE GUARDIAN OF SCROLL ${(AREAS[i - 1] || a).kanji} FIRST`);
          SFX.thud();
          return;
        }
        SFX.pick(1);
        if (onOpenScroll) onOpenScroll(n);   /* the scroll unrolls to its ten scenes */
      });
      row.appendChild(card);
    });
    /* the foot speaks only when it has something new to say — the
       head's sub already told the fresh scribe how the journey works */
    const hint = document.getElementById('scrollsHint');
    if (hint) {
      const cur = Math.min(unlocked, AREAS.length);
      setScrollsHint(done
        ? 'EVERY SCROLL LIES FINISHED — THE ENDLESS SCROLL 無 STILL ASKS FOR MORE'
        : cleared > 0
        ? `SCROLL ${SHEET_ROMAN[cur - 1]} IS UNROLLED — BREAK ITS GUARDIAN FOR THE NEXT`
        : '');
    }
  }

  /* the scroll unrolled: ten hanging scene-strips, the seals pressed
     red, the frontier still wet — a sealed scene may be walked again */
  function buildLevels(n) {
    const row = document.getElementById('levelRow');
    const shelf = document.getElementById('scrollRow');
    const a = AREAS[n - 1];
    if (!row || !shelf || !a) return;
    ladderSheet = n;
    shelf.classList.add('hidden');
    row.classList.remove('hidden');
    /* the unrolled scroll dresses the whole room in its own ink:
       head, beam, hint and strips all print in the sheet's tone */
    const scr = document.getElementById('screenScrolls');
    if (scr) scr.dataset.wear = a.theme;
    shelfWash(null);
    const unlocked = (typeof G !== 'undefined' && G.getUnlocked) ? G.getUnlocked() : 1;
    const cleared = (typeof G !== 'undefined' && G.getCleared) ? G.getCleared() : 0;
    const seals = (typeof G !== 'undefined' && G.getSeals) ? G.getSeals() : {};
    const frontier = (typeof G !== 'undefined' && G.frontierLevel) ? G.frontierLevel(n) : 1;
    const isCleared = n <= cleared;
    const sealedUpTo = isCleared ? CFG.wave.levelsPerArea : (seals[n] || 0);
    const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    setBackLabel('ALL SCROLLS');
    retraceHead();
    setScrollsHead(
      `SCROLL ${SHEET_ROMAN[n - 1]} — ${a.kanji} · TEN SCENES`,
      a.name,
      isCleared
        ? 'The scroll lies finished. Every scene stays open — walk any of them again.'
        : 'Ten scenes of ten waves each. Enter any scene the brush has sealed — or the frontier, still wet.'
    );
    row.innerHTML = '';
    for (let d = 1; d <= CFG.wave.levelsPerArea; d++) {
      const sealed = d <= sealedUpTo;
      const wet = !sealed && d === frontier;
      const locked = !sealed && !wet;
      const w0 = (n - 1) * CFG.wave.wavesPerLevel * CFG.wave.levelsPerArea +
        (d - 1) * CFG.wave.wavesPerLevel + 1;
      const w1 = w0 + CFG.wave.wavesPerLevel - 1;
      /* the kit the shelf hands back on this page — printed, so an
         old scene is re-walked with open eyes */
      const kit = (typeof G !== 'undefined' && G.checkpointPower)
        ? G.checkpointPower(n, d) : 0;
      const kitLine = locked ? '' :
        `<span class="strip-kit">ARRIVE WITH ${kit} PICK${kit === 1 ? '' : 'S'}</span>`;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'scroll-strip scene-strip' +
        (sealed ? ' is-cleared' : '') +
        (locked ? ' is-locked' : '') +
        (wet ? ' is-current' : '');
      card.style.setProperty('--tilt', ((d % 2 ? 1 : -1) * (0.4 + d * 0.12)).toFixed(2) + 'deg');
      card.style.setProperty('--i', d - 1);
      const state = locked
        ? '<span class="strip-state"><span class="strip-lock">未</span>UNREACHED</span>'
        : wet
        ? '<span class="strip-state is-wait"><span class="strip-wait">筆</span>FRONTIER</span>'
        : '<span class="strip-state is-done"><span class="strip-seal">了</span>SEALED</span>';
      card.innerHTML =
        `<span class="strip-string" aria-hidden="true"></span>` +
        `<span class="strip-no">SCENE ${roman[d - 1]}</span>` +
        `<span class="strip-kanji" aria-hidden="true">${toKanji(d)}</span>` +
        `<span class="strip-name">${a.names[d - 1] || ''}</span>` +
        `<span class="strip-ink">WAVES ${w0}–${w1}</span>` +
        kitLine +
        state;
      card.setAttribute('aria-label',
        `Scene ${d} of ${a.name} — ${locked ? 'unreached' : wet ? 'the frontier' : 'sealed'}`);
      card.addEventListener('click', () => {
        if (locked) {
          card.classList.remove('refuse');
          void card.offsetWidth;
          card.classList.add('refuse');
          setScrollsHint('THE INK HAS NOT REACHED THIS SCENE — SEAL THE SCENES BEFORE IT FIRST');
          SFX.thud();
          return;
        }
        SFX.pick(1);
        if (onScrollPick) onScrollPick(n, d);
      });
      row.appendChild(card);
    }
    setScrollsHint(isCleared
      ? 'EVERY SCENE OF THIS SCROLL LIES SEALED — WALK ANY OF THEM AGAIN'
      : 'ENTER A SEALED SCENE — OR WALK THE WET FRONTIER · EACH HANDS BACK THE KIT IT PRINTS');
  }

  function setScrollsHint(txt) {
    const hint = document.getElementById('scrollsHint');
    if (!hint) return;
    hint.hidden = !txt;
    hint.textContent = txt;
    hint.classList.remove('nudge');
    void hint.offsetWidth;
    hint.classList.add('nudge');
  }

  /* the guardian's fall unrolls the next scroll — cried across the sheet */
  function unlockBanner(area, nextArea, isLast) {
    el.bannerKicker.textContent = isLast
      ? `THE FINAL GUARDIAN FALLS — SCROLL ${area.kanji} IS PAINTED`
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
      el.bestLine.innerHTML = `BEST — WAVE ${b.wave} · ${b.score.toLocaleString('en-US')} PTS`;
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
      const isWpn = (u.weapon || u.ability) ? '<span class="up-wpn">POWER</span>' : '';
      const isArt = u.art ? '<span class="up-wpn up-art">ART</span>' : '';
      /* the final pick earns its name on the card: the special it wakes */
      const maxLine = (!u.patch && u.maxSpec && lv === u.max - 1)
        ? `<span class="up-maxspec">${u.maxSpec}</span>` : '';
      card.innerHTML =
        `<div class="up-top"><span class="up-no">${['I', 'II', 'III'][i] || i + 1}</span><span class="up-top-right">${isArt}${isWpn}${isNew}<span class="up-pips">${pips}</span></span></div>` +
        `<svg class="up-glyph" viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[u.id] || GLYPHS.patch}</svg>` +
        `<h3 class="up-name">${u.name}</h3>` +
        `<p class="up-desc">${u.desc}</p>` +
        (maxLine ? maxLine : '') +
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
        : `DEPLOY — SCENE ${level}`)
      : (nextArea
        ? `NEXT — SCROLL <span class="kanji-inline">${nextArea.kanji}</span> ${nextArea.name}`
        : `DEPLOY — SCENE ${level}`);
  }

  function setUpgradeHeader(waveInLevel, level, area, kind, xpLevel) {
    if (kind === 'level') {
      el.upKicker.innerHTML =
        `THE INK RISES — INK LEVEL ${xpLevel}`;
      el.upNext.innerHTML = `LV&nbsp;${xpLevel + 1}`;
      return;
    }
    if (kind === 'chest') {
      el.upKicker.innerHTML =
        'THE CHEST OPENS — <span class="kanji-inline">宝</span> A GIFT FROM THE GUARDIAN';
      el.upNext.innerHTML = 'GIFT';
      return;
    }
    /* a level's seal was just broken */
    const lastLevel = level >= CFG.wave.levelsPerArea;
    el.upKicker.innerHTML =
      `SHEET <span class="kanji-inline">${area.kanji}</span> ${area.name} — SCENE ${level} SEALED`;
    el.upNext.innerHTML = lastLevel
      ? '<span class="kanji-inline">?</span>'
      : String(level + 1);
  }

  /* the ghost's verdict: who outlived whom, printed once.
     An armed rival walks under its scribe's own name. */
  function setGhostVerdict(d) {
    const line = document.getElementById('ghostLine');
    if (!line) return;
    if (d.ghost && d.ghost.wave > 0) {
      const mine = d.waves | 0;
      const n = d.ghost.wave;
      const rival = d.ghost.name
        ? String(d.ghost.name).toUpperCase().slice(0, 24) + "'S ECHO" : null;
      line.classList.remove('hidden');
      if (mine > n)
        line.textContent = rival
          ? `${rival} FELL AT WAVE ${n} — YOU OUTLIVED IT BY ${mine - n}`
          : `THE GHOST FELL AT WAVE ${n} — YOU OUTLIVED IT BY ${mine - n}`;
      else if (mine === n)
        line.textContent = rival
          ? `${rival} FELL AT WAVE ${n} — WALKED STROKE FOR STROKE`
          : `THE GHOST FELL AT WAVE ${n} — YOU WALKED IT STROKE FOR STROKE`;
      else
        line.textContent = rival
          ? `${rival} WALKED FURTHER — WAVE ${n} TO YOUR ${mine}`
          : `THE GHOST WALKED FURTHER — WAVE ${n} TO YOUR ${mine}`;
    } else {
      line.classList.add('hidden');
      line.textContent = '';
    }
  }

  function showOver(d) {
    lastOver = d;   /* the share card presses this same report (v8.3) */
    setGhostVerdict(d);
    const vict = !!d.victory;
    el.overTitle.textContent = vict ? 'THE SCROLL ENDS.' : 'THE INK DRIES.';
    el.overSub.textContent = vict
      ? 'Six sheets painted, every guardian felled. The paper asks for more.'
      : d.mode === 'daily' && d.practice
        ? 'Practice sheet — today\u2019s ink is already on the ledger.'
        : 'The paper keeps every stroke. Even this one.';
    el.overKicker.textContent =
      `RUN ${pad3(d.run)} — ${d.mode === 'daily' ? 'DAILY INK' + (d.day ? ' · ' + d.day : '') : d.mode === 'endless' ? 'THE ENDLESS SCROLL' : vict ? 'THE JOURNEY, COMPLETE' : 'THE INK CLAIMS ANOTHER'}${d.hard ? ' · REALLY HARD' : ''}`;
    el.overRank.textContent = d.rank;
    el.statWaves.textContent = d.waves;
    el.statKills.textContent = d.kills.toLocaleString('en-US');
    el.statTime.textContent = fmtTime(d.time);
    el.statScore.textContent = d.score.toLocaleString('en-US');
    /* the inkstone: what this run pressed back into the stone */
    const inkRow = document.getElementById('inkStatRow');
    if (inkRow) inkRow.classList.toggle('hidden', !(d.ink > 0));
    if (d.ink > 0) el.statInk.textContent = '+' + d.ink.toLocaleString('en-US');
    el.newBestBadge.classList.toggle('hidden', !d.newBest);
    if (el.continueBtn) {
      el.continueBtn.classList.toggle('hidden', !vict);
      if (vict) {
        el.continueBtn.innerHTML =
          'INTO THE ENDLESS — <span class="kanji-inline">無</span>';
      }
    }
  }

  /* the daily sheet's seal on the title: fresh paper prints TODAY,
     a walked sheet prints what the scribe carried — never a re-run */
  function setDailyChip(st) {
    const lab = document.getElementById('dailyLabel');
    const btn = document.getElementById('dailyBtn');
    if (!lab || !btn) return;
    const done = st && st.played;
    /* the separator rides inside the label — the folded rail hides the
       whole span, so no orphan dot is left behind on the phone */
    lab.textContent = done
      ? ` \u00B7 WAVE ${st.wave | 0} \u00B7 ${(st.score | 0).toLocaleString('en-US')}`
      : ' \u00B7 TODAY';
    btn.classList.toggle('is-done', !!done);
    btn.classList.toggle('is-hard', !!st.hard);
  }

  function muteVisual(m) { el.muteBtn.classList.toggle('muted', m); }

  /* the purse lives on the 砚 chip now — the rail reads the wallet.
     It stays quiet until the first press lands. */
  function setInkLine(total) {
    const badge = document.getElementById('stoneCount');
    if (!badge) return;
    const t = Math.max(0, total | 0);
    badge.textContent = t.toLocaleString('en-US');
    badge.classList.toggle('hidden', t <= 0);
  }

  /* the brush's current loadout, worn on the wrist — a completed
     weapon wears MAX instead of a number */
  function setLoadout(levels) {
    if (!el.hudLoadout) return;
    /* the brush itself leads the shelf: ONE BRUSH, ONE BLADE */
    const br = CFG.brushes[G.S.brush] || null;
    const brChip = br ? `<span class="load-item load-brush" title="${br.name}"><b>${br.kanji}</b></span>` : '';
    el.hudLoadout.innerHTML = brChip + UPGRADES
      .filter(u => (levels[u.id] || 0) > 0)
      .map(u => `<span class="load-item${levels[u.id] >= u.max ? ' load-max' : ''}" title="${u.name}"><svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[u.id] || GLYPHS.patch}</svg><b>${levels[u.id] >= u.max ? 'MAX' : levels[u.id]}</b></span>`)
      .join('');
  }

  return {
    show, hud, setWave, setProgress, setHp, setScore, setTime, banner, areaBanner, levelBanner, flash,
    setRunNo, setBest, setSheetContinue, buildBrushes, fillUpgrades, markSelected,
    setDeploy, setUpgradeHeader, showOver, muteVisual, setLoadout, setArea, setMode, setXp,
    setBoss, setCombo, bossBanner, bossFalls, guardianBanner, guardianFalls, sealBanner, showClear, el, toKanji,
    setInkLine,
    buildScrolls, buildLevels, setScrollsHint, unlockBanner, hardBanner, setHard, setDailyChip,
    get onScrollPick() { return onScrollPick; },
    set onScrollPick(fn) { onScrollPick = fn; },
    get onOpenScroll() { return onOpenScroll; },
    set onOpenScroll(fn) { onOpenScroll = fn; },
    get scrollsLadder() { return ladderSheet; },
    get lastOver() { return lastOver; },
    get onScrollsBack() { return onScrollsBack; },
    set onScrollsBack(fn) { onScrollsBack = fn; },
  };
})();
