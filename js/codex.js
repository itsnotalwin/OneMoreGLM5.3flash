'use strict';
/* ============================================================
   ONE MORE — THE COMPENDIUM (図, v24.10).
   Ported from the One_more_fable sibling build, re-seated on the
   v24.9b engine: every ink-born beast painted from the engine's
   own hand, the red-sealed Guardians and Keepers, and the
   scribe's lifetime chronicle + local hall of runs.
   Three rooms (the Confluences tab belongs to the sibling's
   union mechanic, which this build does not carry):
     獣 INK-BORN — every beast, grouped by the six papers
     守 SEALS    — the Guardians and the scene Keepers
     録 CHRONICLE — the lifetime ledger and the local hall
   ============================================================ */

const CODEX = (() => {
  const $ = id => document.getElementById(id);
  let tab = 'beasts';   /* beasts | bosses | chronicle */
  let returnTo = 'title';

  /* the six papers, in the order the endless walks them —
     journey sheets I–II, then the four past scrolls' epochs */
  const SCROLL_GROUPS = [
    { sheet: 1, kanji: '一', name: 'FIRST WASH', min: 1, max: 99 },
    { sheet: 2, kanji: '夜', name: 'NIGHT SCROLL', min: 100, max: 199 },
    { sheet: 3, kanji: '紅', name: 'CINNABAR FIELD', min: 200, max: 299 },
    { sheet: 4, kanji: '嵐', name: 'STORM SHEET', min: 300, max: 399 },
    { sheet: 5, kanji: '金', name: 'GILT SCROLL', min: 400, max: 499 },
    { sheet: 6, kanji: '素', name: 'THE BLANK SILK', min: 500, max: 699 },
  ];

  function isOpen() {
    const s = $('screenCodex');
    return !!s && !s.classList.contains('hidden');
  }

  function open(initialTab, from) {
    SFX.ensure();
    SFX.page();
    if (initialTab) tab = initialTab;
    if (from && from !== 'codex') returnTo = from;
    render();
    UI.show('codex');
    UI.hud(false);
  }

  function close() {
    const back = returnTo || 'title';
    returnTo = 'title';
    UI.show(back);
    if (back === 'pause' && UI.fillPause) UI.fillPause();
    UI.hud(false);
  }

  function setTab(next) {
    if (!next || next === tab) return;
    SFX.ensure();
    SFX.pick(1);
    tab = next;
    render();
  }

  function fmtTimeLong(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return `${h}H ${String(m).padStart(2, '0')}M`;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function beastKeys() {
    return Object.keys(ENEMIES).filter(k => {
      const e = ENEMIES[k];
      return !e.boss;
    });
  }

  function guardianKeys() {
    return Object.keys(ENEMIES).filter(k => ENEMIES[k].boss === 1);
  }

  function keeperKeys() {
    return Object.keys(ENEMIES).filter(k => ENEMIES[k].boss === 2);
  }

  function renderSummary(cx) {
    const sum = $('codexSummary');
    if (!sum) return;
    const bk = beastKeys();
    const seenB = bk.filter(k => (cx.kills[k] || 0) > 0).length;
    const gk = guardianKeys();
    const seenG = gk.filter(k => (cx.kills[k] || 0) > 0).length;
    const kk = keeperKeys();
    const seenK = kk.filter(k => (cx.kills[k] || 0) > 0).length;
    sum.innerHTML =
      `<span>獣 <b>${seenB}/${bk.length}</b> INK-BORN</span>` +
      `<span class="cx-dot">·</span>` +
      `<span>守 <b>${seenG + seenK}/${gk.length + kk.length}</b> SEALS</span>` +
      `<span class="cx-dot">·</span>` +
      `<span>墨 <b>${(cx.totals.kills || 0).toLocaleString('en-US')}</b> CLEANED</span>`;
  }

  function renderBeasts(body, cx) {
    const keys = beastKeys();
    let html = '<div class="room-kicker"><span class="kanji-inline" aria-hidden="true">獣</span>EVERY BLOT THE SHEET CAN BIRTH — GROUPED BY THE PAPER IT HAUNTS</div>';
    for (const grp of SCROLL_GROUPS) {
      const members = keys.filter(k => {
        const intro = ENEMIES[k].intro || 1;
        return intro >= grp.min && intro <= grp.max;
      }).sort((a, b) => (ENEMIES[a].intro || 1) - (ENEMIES[b].intro || 1));
      if (!members.length) continue;
      const met = members.filter(k => (cx.kills[k] || 0) > 0).length;
      html += `<div class="room-kicker room-kicker-2"><span class="kanji-inline" aria-hidden="true">${grp.kanji}</span>SCROLL ${grp.kanji} · ${grp.name} <em class="cx-group-ct">${met}/${members.length}</em></div>`;
      html += '<div class="cx-plate-grid">';
      for (const k of members) {
        const d = ENEMIES[k];
        const n = cx.kills[k] || 0;
        const seen = n > 0;
        const red = !!(d.captain || d.special);
        html +=
          `<div class="cx-plate${seen ? ' is-seen' : ' is-unseen'}${red ? ' is-officer' : ''}">` +
            `<canvas class="cx-canvas" data-type="${k}" data-seen="${seen ? '1' : '0'}" aria-hidden="true"></canvas>` +
            `<span class="cx-pname">${seen ? d.name : 'UNSEEN BLOT'}</span>` +
            `<span class="cx-ptrait">${seen ? d.trait : 'WAVE ' + d.intro}</span>` +
            `<span class="cx-pcount">${seen ? n.toLocaleString('en-US') + ' CLEANED' : '未'}</span>` +
          `</div>`;
      }
      html += '</div>';
    }
    body.innerHTML = html;
    paintPlates(body);
  }

  function renderBosses(body, cx) {
    const guards = guardianKeys();
    const papers = (typeof AREAS !== 'undefined' ? AREAS : [])
      .concat(typeof PAST_SCROLLS !== 'undefined' ? PAST_SCROLLS : []);
    let html = '<div class="room-kicker"><span class="kanji-inline" aria-hidden="true">守</span>THE GUARDIANS — ONE WAITS ON EACH SCROLL\u2019S TENTH SCENE</div>';
    html += '<div class="codex-conf-list">';
    guards.forEach((k, idx) => {
      const d = ENEMIES[k];
      const n = cx.kills[k] || 0;
      const seen = n > 0 || G.getCleared() > idx * 10;
      const taunt = (typeof BOSS_TAUNTS !== 'undefined' && BOSS_TAUNTS[k]) || '';
      const area = papers[idx];
      html +=
        `<div class="set-row cx-boss-row${seen ? ' is-woken' : ' is-sealed'}">` +
          `<canvas class="cx-canvas cx-boss-cv" data-type="${k}" data-seen="${seen ? '1' : '0'}" aria-hidden="true"></canvas>` +
          `<span class="set-name cx-conf-title">` +
            `<span>${seen ? d.name : 'SEALED GUARDIAN'}</span>` +
            `<span class="cx-conf-pair">SCROLL ${area ? area.kanji + ' · ' + area.name : idx + 1}</span>` +
          `</span>` +
          `<span class="set-desc">${seen ? '\u201C' + taunt + '\u201D' : 'WALK TO SCENE TEN OF THIS SCROLL TO MEET ITS THRONE.'}</span>` +
          `<span class="set-state${seen ? ' is-red' : ''}">${n > 0 ? `落 ×${n}` : seen ? '落 SEALED' : '封'}</span>` +
        `</div>`;
    });
    html += '</div>';

    /* the scene keepers — sixty ten-seal duels, grouped by their paper */
    const keepers = keeperKeys();
    const felledK = keepers.filter(k => (cx.kills[k] || 0) > 0).length;
    html += `<div class="room-kicker room-kicker-2"><span class="kanji-inline" aria-hidden="true">印</span>THE SCENE KEEPERS — ${felledK} OF ${keepers.length} FELLED</div>`;
    html += '<div class="cx-plate-grid cx-keeper-grid">';
    for (const k of keepers) {
      const d = ENEMIES[k];
      const n = cx.kills[k] || 0;
      const seen = n > 0;
      html +=
        `<div class="cx-plate is-officer${seen ? ' is-seen' : ' is-unseen'}">` +
          `<canvas class="cx-canvas" data-type="${k}" data-seen="${seen ? '1' : '0'}" aria-hidden="true"></canvas>` +
          `<span class="cx-pname">${seen ? d.name : 'SEALED KEEPER'}</span>` +
          `<span class="cx-ptrait">${d.trait}</span>` +
          `<span class="cx-pcount">${seen ? `落 ×${n}` : '封'}</span>` +
        `</div>`;
    }
    html += '</div>';
    body.innerHTML = html;
    paintPlates(body);
  }

  function renderChronicle(body, cx) {
    const t = cx.totals || {};
    const best = (G.getBest && G.getBest()) || { score: 0, wave: 0 };
    const eBest = (G.getEndlessBest && G.getEndlessBest()) || 0;
    const scenesTotal = (typeof AREAS !== 'undefined' ? AREAS.length : 2) * 10;
    const stats = [
      ['RUNS WALKED', ((G.getRuns && G.getRuns()) | 0).toLocaleString('en-US')],
      ['SCENES SEALED', `${(G.getCleared && G.getCleared()) | 0} / ${scenesTotal}`],
      ['BLOTS CLEANED', (t.kills | 0).toLocaleString('en-US')],
      ['HIGHEST SCORE', (best.score | 0).toLocaleString('en-US')],
      ['DEEPEST ENDLESS', eBest > 0 ? `WAVE ${eBest}` : '—'],
      ['TIME ON THE SHEET', fmtTimeLong(t.time || 0)],
    ];
    let html = '<div class="room-kicker"><span class="kanji-inline" aria-hidden="true">録</span>THE SCRIBE\u2019S LIFETIME LEDGER ON THIS PAPER</div>';
    html += '<div class="cx-stat-grid">';
    for (const [k, v] of stats) {
      html += `<div class="cx-stat"><span class="cx-sk">${k}</span><b class="cx-sv">${v}</b></div>`;
    }
    html += '</div>';

    const runs = (G.getLocalRuns && G.getLocalRuns()) || [];
    html += '<div class="room-kicker room-kicker-2"><span class="kanji-inline" aria-hidden="true">巻</span>LOCAL HALL OF RUNS — PRESSED INTO THIS DEVICE</div>';
    if (!runs.length) {
      html += '<p class="cx-empty">NO RUN HAS DRIED YET — WALK A SHEET AND ITS INK STAYS HERE.</p>';
    } else {
      html += '<div class="cx-runs">';
      runs.slice(0, 10).forEach((r, i) => {
        const br = (CFG.brushes && CFG.brushes[r.brush]) || { kanji: '筆', name: 'BRUSH' };
        const modeTag = r.mode === 'endless' ? 'ENDLESS' : r.mode === 'daily' ? 'DAILY' : 'JOURNEY';
        const hardTag = r.hard ? '<span class="cx-rhard">難</span>' : '';
        html +=
          `<div class="cx-run-row${i < 3 ? ' is-top' : ''}">` +
            `<span class="cx-rno">${i + 1}</span>` +
            `<span class="cx-rbrush" title="${br.name}">${br.kanji}</span>` +
            `<span class="cx-rmode">${modeTag} ${hardTag}</span>` +
            `<span class="cx-rwave">W${r.wave}</span>` +
            `<span class="cx-rscore">${(r.score | 0).toLocaleString('en-US')}</span>` +
          `</div>`;
      });
      html += '</div>';
    }
    body.innerHTML = html;
  }

  function paintPlates(root) {
    if (typeof R === 'undefined' || !R.drawBeastPortrait) return;
    requestAnimationFrame(() => {
      root.querySelectorAll('canvas.cx-canvas').forEach(cv => {
        R.drawBeastPortrait(cv, cv.dataset.type, cv.dataset.seen === '1');
      });
    });
  }

  function render() {
    const body = $('codexBody');
    if (!body || typeof G === 'undefined' || !G.getCodex) return;
    ['beasts', 'bosses', 'chronicle'].forEach(k => {
      const btn = $('codexTab_' + k);
      if (btn) {
        btn.classList.toggle('is-on', tab === k);
        btn.setAttribute('aria-selected', tab === k ? 'true' : 'false');
      }
    });
    const cx = G.getCodex();
    renderSummary(cx);
    if (tab === 'beasts') renderBeasts(body, cx);
    else if (tab === 'bosses') renderBosses(body, cx);
    else renderChronicle(body, cx);
  }

  return { open, close, isOpen, setTab, render };
})();
