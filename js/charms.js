/* ONE MORE — the charm room (符, v8.8).
   A quiet shop behind the title, in the settings room's paper:
   what the runs press out buys ranks of permanent power here.
   Every rank rides every page the hand opens after.
   The room reads the economy through the game's own door — G's
   purse API — and owns only the DOM: rows, pips, the purse,
   and the 符 chip's pulse when something is buyable. */
'use strict';

const CH = (() => {
  const $ = id => document.getElementById(id);

  function isOpen() {
    const s = $('screenCharms');
    return !!s && !s.classList.contains('hidden');
  }

  function open() {
    SFX.ensure();
    SFX.page();
    refresh();
    UI.show('charms');
    UI.hud(false);
  }

  function close() {
    UI.setInkLine(G.getInk());
    UI.show('title');
    UI.hud(false);
  }

  /* the cheapest next rank on the board — the chip's pulse,
     and the small promise that a run or two can afford it.
     v20: ranks the scrolls keep sealed do not count — the pulse
     only promises what the hand may actually take. */
  function cheapestNext() {
    const cap = G.charmCap ? G.charmCap() : Infinity;
    let best = Infinity;
    for (const c of CHARMS) {
      const r = G.charmLv(c.id);
      if (r < c.cost.length && r + 1 <= cap && c.cost[r] < best) best = c.cost[r];
    }
    return best;
  }

  /* the title's 符 chip breathes when the purse can buy something */
  function refreshChip() {
    const btn = $('charmBtn');
    if (!btn) return;
    btn.classList.toggle('is-ready', G.getInk() >= cheapestNext());
  }

  function pipsHtml(max, owned, sealedFrom) {
    let out = '';
    for (let i = 0; i < max; i++) {
      const on = i < owned;
      const sealed = sealedFrom != null && i >= sealedFrom;
      out += `<i class="pip${on ? ' on' : ''}${sealed ? ' sealed' : ''}" aria-hidden="true"></i>`;
    }
    return `<span class="charm-pips" aria-label="${owned} of ${max} ranks">${out}</span>`;
  }

  function refresh() {
    const rows = $('charmRows');
    const purse = $('charmPurse');
    const worn = $('charmWorn');
    if (!rows) return;
    const ink = G.getInk();
    const cap = G.charmCap ? G.charmCap() : Infinity;
    if (purse) purse.textContent = ink.toLocaleString('en-US');
    if (worn) worn.textContent = G.charmRankCount() + ' WORN';
    rows.innerHTML = '';
    for (const c of CHARMS) {
      const rank = G.charmLv(c.id);
      const maxed = rank >= c.cost.length;
      const price = maxed ? 0 : c.cost[rank];
      /* v20 THE SEALED LADDER: a next rank beyond the scroll's cap
         wears the 封 lid — its price is a scroll, not ink */
      const scrollLocked = !maxed && rank + 1 > cap;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'set-row charm-row' +
        (maxed ? ' is-max' : scrollLocked ? ' is-scrolllocked' : ink >= price ? ' is-buyable' : ' is-poor');
      const state = maxed ? 'MAX · SEALED'
        : scrollLocked ? `封 SCROLL ${rank - 1} UNROLLS IT`
        : 'INK ' + price.toLocaleString('en-US');
      row.innerHTML =
        `<span class="set-kanji" aria-hidden="true">${c.kanji}</span>` +
        `<span class="set-name">${c.name}${pipsHtml(c.cost.length, rank, scrollLocked ? rank + 1 : null)}</span>` +
        `<span class="set-desc">${c.desc}</span>` +
        `<span class="set-state">${state}</span>`;
      if (!maxed && !scrollLocked) {
        row.addEventListener('click', () => {
          SFX.ensure();
          if (G.buyCharm(c.id)) {
            SFX.pick(2);
            refresh();
            refreshChip();
          } else {
            /* the purse is short — the row shakes its head */
            SFX.thud ? SFX.thud() : SFX.pick(0);
            row.classList.remove('deny');
            void row.offsetWidth;   /* restart the shake */
            row.classList.add('deny');
          }
        });
      } else {
        row.addEventListener('click', () => {
          SFX.ensure();
          /* a sealed rank shakes its head too — the scroll, not the purse */
          SFX.thud ? SFX.thud() : SFX.pick(0);
          row.classList.remove('deny');
          void row.offsetWidth;
          row.classList.add('deny');
        });
      }
      rows.appendChild(row);
    }
    refreshChip();
  }

  return { open, close, isOpen, refresh, refreshChip };
})();
