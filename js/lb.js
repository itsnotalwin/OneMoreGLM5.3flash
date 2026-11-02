'use strict';
/* ============================================================
   ONE MORE — the endless ledger (榜)
   A Supabase Postgres ledger behind sign-the-page identity.

   Design of the ledger:
   · one page per scribe — om_scores, keyed by uid — so the
     board reads a roster of ink-carriers, never one hand
     repeated; a page a day — om_daily, keyed (day, uid);
   · identity is a sign, not an account: anonymous sign-ins
     (one toggle in the dashboard) + a mark the scribe picks.
     Google stays as an optional second door.
   · a run is posted only when it carries further than the hand
     has ever carried before (local best, om_lb_best_v1);
   · rank counts the pages that reached further, +1;
   · row-level security is the lock: the world may read, only
     the signed scribe may raise their own page.

   The cloud is raised lazily: until the board is opened or an
   endless run ends, no network breath is spent. Without config
   (js/supabase-config.js) the ledger stays quietly offline.
   ============================================================ */

const LB = (() => {

  /* ---------------- state ---------------- */
  const ST = {
    sb: null,          // { client, M } once the SDK lands
    initing: null,     // the in-flight load promise
    loadErr: '',       // why the cloud could not be raised
    user: null,        // the signed-in scribe (a supabase user)
    returnTo: 'title', // where RETURN leads
    pending: null,     // an endless run awaiting a sign-in before its post
    posting: false,
    debug: false,      // QA: a paper cloud — no network, fake rows
    rows: null,        // cached board rows
    tab: 'all',        // the board's eye: 'all' time, or today's 'day' sheet
    oauthError: '',     // show a failed Google return on the restored board
  };

  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
  const oauthReturnKey = 'om_lb_google_return_v1';

  /* OAuth leaves the app for Google and loads a fresh document on return.
     Save UI intent in this tab only; never store access tokens here.
     The callback's ?code is also recognized if tab storage is unavailable. */
  function consumeOAuthReturn() {
    let intent = null;
    try {
      const stored = sessionStorage.getItem(oauthReturnKey);
      if (stored) {
        sessionStorage.removeItem(oauthReturnKey);
        const parsed = JSON.parse(stored);
        if (parsed && Number.isFinite(parsed.at) &&
            parsed.at <= Date.now() + 60000 &&
            Date.now() - parsed.at < 15 * 60 * 1000) intent = parsed;
      }
    } catch (e) {}
    let callback = false;
    let oauthError = '';
    try {
      const q = new URLSearchParams(location.search);
      callback = q.has('code') || q.has('error') || q.has('error_code');
      oauthError = q.get('error_description') || q.get('error') || '';
    } catch (e) {}
    if (!intent && !callback) return null;
    ST.oauthError = oauthError ? authFail({ message: oauthError }) : '';
    return { tab: intent && intent.tab === 'day' ? 'day' : 'all' };
  }

  const cfg = () => {
    const c = window.OM_SUPABASE || {};
    return (c.url && c.anonKey) ? c : null;
  };
  const configured = () => ST.debug || !!cfg();
  const signedIn = () => ST.debug ? !!ST.debugUser : !!ST.user;

  /* the scribe's face, whatever the cloud said about them */
  function me() {
    if (ST.debug) return ST.debugUser;
    const u = ST.user;
    if (!u) return null;
    const m = u.user_metadata || {};
    return {
      uid: u.id,
      name: String(m.name || m.full_name || m.user_name || '').slice(0, 24),
      photo: m.avatar_url || m.picture || '',
    };
  }
  const myName = () => { const m = me(); return (m && m.name) || getName(); };

  /* the scribe's mark, chosen on the page and kept on this device */
  const nameKey = 'om_lb_name_v1';
  const cleanName = n => String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 24);
  const getName = () => {
    try { return String(JSON.parse(localStorage.getItem(nameKey) || '""') || ''); }
    catch (e) { return ''; }
  };
  const setName = n => {
    try { localStorage.setItem(nameKey, JSON.stringify(cleanName(n))); } catch (e) {}
  };

  /* the hand's furthest endless carry, kept on this device */
  const bestKey = 'om_lb_best_v1';
  const getLocalBest = () => {
    try { return JSON.parse(localStorage.getItem(bestKey) || 'null'); } catch (e) { return null; }
  };
  const setLocalBest = r => {
    try { localStorage.setItem(bestKey, JSON.stringify({
      wave: r.wave | 0, score: r.score | 0, kills: r.kills | 0, time: r.time | 0,
    })); } catch (e) {}
  };

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  /* ---------------- the cloud ---------------- */
  function init() {
    if (ST.sb || ST.debug) return Promise.resolve(ST.sb);
    if (!cfg()) return Promise.reject(new Error('unconfigured'));
    if (ST.initing) return ST.initing;
    ST.initing = (async () => {
      try {
        const M = await import(SDK);
        const client = M.createClient(cfg().url, cfg().anonKey, {
          auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
        });
        ST.sb = { client, M };
        /* a returning scribe keeps their seat */
        try {
          const { data } = await client.auth.getSession();
          ST.user = (data && data.session && data.session.user) || null;
        } catch (e) { ST.user = null; }
        client.auth.onAuthStateChange((evt, session) => {
          if (session && session.user) ST.user = session.user;
          else if (evt === 'SIGNED_OUT') ST.user = null;
          renderAuth();
          if (ST.user && ST.pending) {     /* the sign answered the pending post */
            const run = ST.pending; ST.pending = null;
            if (run.mode === 'daily') postDailyRun(run);
            else postRun(run);
          } else {
            refreshOverStrip();
          }
        });
        return ST.sb;
      } catch (e) {
        ST.loadErr = (e && e.message) || 'the cloud could not be raised';
        ST.initing = null;
        throw e;
      }
    })();
    return ST.initing;
  }

  function authFail(e) {
    const s = String((e && (e.message || e.msg)) || e || '');
    const c = String((e && e.code) || '').toLowerCase();
    if (/anonymous/i.test(s) || c === 'anonymous_provider_disabled')
      return 'ANONYMOUS SIGN-INS ARE OFF — ENABLE THEM UNDER AUTHENTICATION → SIGN IN / UP';
    if (/provider/i.test(s) || /oauth|google/i.test(s + ' ' + c))
      return 'THE GOOGLE DOOR IS NOT CONFIGURED YET — SEE README · OPTIONAL: GOOGLE SIGN-IN';
    if (/failed to fetch|network|fetch failed/i.test(s + ' ' + c))
      return 'THE NETWORK REFUSED THE STROKE — TRY AGAIN';
    if (/redirect|site url/i.test(s))
      return 'THE RETURN ADDRESS IS OFF — SET SITE URL UNDER AUTHENTICATION → URL CONFIGURATION';
    return 'THE SIGN-IN FAILED — TRY AGAIN';
  }

  function postFail(e) {
    const s = String((e && (e.message || e.msg)) || e || '');
    if (/row-level security|permission denied|policy/i.test(s))
      return 'THE LEDGER ONLY TAKES YOUR OWN PAGE — TRY SIGNING AGAIN';
    if (/check constraint/i.test(s))
      return 'THE LEDGER REFUSED THOSE NUMBERS — TRY AGAIN';
    if (/failed to fetch|network|fetch failed/i.test(s))
      return 'THE NETWORK REFUSED THE STROKE — TRY AGAIN';
    return 'THE LEDGER REFUSED THE STROKE — TRY AGAIN';
  }

  /* sign the page: a mark, no account — anonymous sign-in */
  async function signIn(name) {
    SFX.ensure();
    if (ST.debug) { ST.debugUser = { uid: 'qa-scribe', name: 'QA SCRIBE', photo: '' }; renderAuth(); refreshOverStrip(); return me(); }
    ST.oauthError = '';
    const s = await init();
    if (!s) throw new Error('unconfigured');
    const { data, error } = await s.client.auth.signInAnonymously();
    if (error) {
      const msg = authFail(error);
      renderAuth(msg);
      throw new Error(msg);
    }
    ST.user = data.user || null;
    const n = cleanName(name);
    if (n) {
      setName(n);
      /* the mark travels with the identity, wherever it sits */
      try { await s.client.auth.updateUser({ data: { name: n } }); } catch (e) {}
    }
    renderAuth();
    refreshOverStrip();
    return ST.user;
  }

  /* the optional second door: Google, once it is configured */
  async function signInGoogle() {
    SFX.ensure();
    if (ST.debug) return signIn();
    ST.oauthError = '';
    const s = await init();
    if (!s) throw new Error('unconfigured');
    try {
      sessionStorage.setItem(oauthReturnKey, JSON.stringify({
        tab: ST.tab, at: Date.now(),
      }));
    } catch (e) {}  // ?code on the callback remains a fallback
    try {
      const { error } = await s.client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname },
      });
      if (error) throw error;
    } catch (e) {
      try { sessionStorage.removeItem(oauthReturnKey); } catch (_) {}
      const msg = authFail(e);
      renderAuth(msg);
      throw new Error(msg);
    }
    /* The browser redirects. On its return, main.js reopens the
       board and init() consumes the PKCE callback via Supabase. */
  }

  async function signOut() {
    if (ST.debug) { ST.debugUser = null; renderAuth(); refreshOverStrip(); return; }
    if (!ST.sb) return;
    try { await ST.sb.client.auth.signOut(); } catch (e) {}
    ST.user = null;
    renderAuth();
    refreshOverStrip();
  }

  /* ---------------- the ledger's strokes ---------------- */

  /* one page per scribe; a post only when the run carried further */
  async function submitRun(run) {
    if (ST.debug) return { ok: true, rank: ST.debugRank || 7 };
    const s = ST.sb;
    if (!s || !ST.user) return { ok: false, reason: 'signed-out' };
    const uid = ST.user.id;
    const { data: old, error: readErr } = await s.client.from('om_scores')
      .select('wave,score').eq('uid', uid).maybeSingle();
    if (readErr) throw new Error(readErr.message || 'post failed');
    if (old && ((old.wave | 0) > run.wave ||
        ((old.wave | 0) === run.wave && (old.score | 0) >= run.score)))
      return { ok: true, kept: true };
    const { error } = await s.client.from('om_scores').upsert({
      uid,
      name: cleanName(myName()) || 'INK DRIFTER',
      wave: run.wave | 0,
      score: run.score | 0,
      kills: run.kills | 0,
      time: Math.max(0, Math.round(run.time || 0)) | 0,
      hard: !!run.hard,
      v: 1,
    });
    if (error) throw new Error(error.message || 'post failed');
    return { ok: true };
  }

  async function fetchTop() {
    if (ST.debug) return debugRows();
    const s = ST.sb;
    if (!s) throw new Error('unconfigured');
    const { data, error } = await s.client.from('om_scores')
      .select('uid,name,wave,score,kills,hard')
      .order('wave', { ascending: false }).order('score', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message || 'the board would not unroll');
    const rows = (data || []).map(r => ({
      name: r.name, wave: r.wave | 0, score: r.score | 0,
      kills: r.kills | 0, hard: !!r.hard, __uid: r.uid,
    }));
    rows.sort((a, b) => (b.wave - a.wave) || (b.score - a.score));
    return rows;
  }

  async function fetchRank(wave) {
    if (ST.debug) return ST.debugRank || 7;
    const s = ST.sb;
    if (!s) return null;
    const { count, error } = await s.client.from('om_scores')
      .select('uid', { count: 'exact', head: true }).gt('wave', wave | 0);
    if (error) return null;
    return (count || 0) + 1;
  }

  /* ---------------- the daily ledger ----------------
     one table, one key a day — om_daily(day, uid) — a page a
     day per scribe; the (day, score) index keeps the sheet's
     order single-stroke. */

  async function submitDailyRun(run) {
    if (ST.debug) return { ok: true, rank: ST.debugRank || 4 };
    const s = ST.sb;
    if (!s || !ST.user) return { ok: false, reason: 'signed-out' };
    const { error } = await s.client.from('om_daily').upsert({
      day: String(run.day || '').replace(/[^0-9-]/g, ''),
      uid: ST.user.id,
      name: cleanName(myName()) || 'INK DRIFTER',
      wave: run.wave | 0,
      score: run.score | 0,
      kills: run.kills | 0,
      hard: !!run.hard,
      v: 1,
    });
    if (error) throw new Error(error.message || 'post failed');
    return { ok: true };
  }

  async function fetchDailyTop(day) {
    if (ST.debug) return debugRows().slice(0, 8).map(r => ({ ...r, wave: Math.min(r.wave, 40) }));
    const s = ST.sb;
    if (!s) throw new Error('unconfigured');
    const { data, error } = await s.client.from('om_daily')
      .select('uid,name,wave,score,kills,hard')
      .eq('day', String(day || '').replace(/[^0-9-]/g, ''))
      .order('score', { ascending: false }).order('wave', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message || 'the day would not unroll');
    const rows = (data || []).map(r => ({
      name: r.name, wave: r.wave | 0, score: r.score | 0,
      kills: r.kills | 0, hard: !!r.hard, __uid: r.uid,
    }));
    rows.sort((a, b) => (b.score - a.score) || (b.wave - a.wave));
    return rows;
  }

  async function fetchDailyRank(day, score) {
    if (ST.debug) return ST.debugRank || 4;
    const s = ST.sb;
    if (!s) return null;
    const { count, error } = await s.client.from('om_daily')
      .select('uid', { count: 'exact', head: true })
      .eq('day', String(day || '').replace(/[^0-9-]/g, ''))
      .gt('score', score | 0);
    if (error) return null;
    return (count || 0) + 1;
  }

  /* ---------------- the over sheet's post strip ---------------- */

  function overBox() { return document.getElementById('overBoard'); }

  /* an endless run has truly ended — the ledger takes its entry */
  function onRunEnd(run) {
    const box = overBox();
    if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
    ST.pending = null; ST.posting = false;
    if (!run) return;
    if (run.mode === 'daily') {
      /* practice sheets carry no ink to the ledger */
      if (!run.counting || run.victory) { renderDailyStrip(null); return; }
      if (!configured()) return;
      init().then(() => renderDailyStrip(run, null)).catch(() => renderDailyStrip(run, null));
      return;
    }
    if (run.mode !== 'endless' || run.victory) return;
    if (!configured()) return;

    /* the device remembers the hand's furthest carry either way */
    const best = getLocalBest();
    const better = !best ||
      run.wave > best.wave ||
      (run.wave === best.wave && (run.score | 0) > (best.score | 0));
    if (better) setLocalBest(run);
    run.better = better;

    if (ST.debug) { renderOverStrip(run, null); return; }
    init().then(() => renderOverStrip(run, null)).catch(() => renderOverStrip(run, null));
  }

  async function postRun(run) {
    if (ST.posting) return;
    ST.posting = true;
    renderOverStrip(run, 'posting');
    try {
      const res = await submitRun(run);
      ST.posting = false;
      if (res.ok) {
        let rank = null;
        try { rank = await fetchRank(run.wave); } catch (e) {}
        renderOverStrip(run, rank);
      } else {
        renderOverStrip(run, null);
      }
    } catch (e) {
      ST.posting = false;
      renderOverStrip(run, postFail(e));
    }
  }

  function gBtn(label, small) {
    return `<button class="g-btn${small ? ' small' : ''}" type="button">
      <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 40.4 44 35 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
      <span>${esc(label)}</span></button>`;
  }

  /* the scribe's mark + the sign — the paper's own door */
  function signWidget(btnLabel, small) {
    return `<span class="lb-sign">` +
      `<input class="lb-name" maxlength="24" autocomplete="off" spellcheck="false" ` +
        `placeholder="YOUR MARK — OPTIONAL" value="${esc(getName())}">` +
      `<button class="ink-btn${small ? ' small' : ''}" type="button">${esc(btnLabel)}</button>` +
    `</span>`;
  }
  function readMark(scope) {
    const input = scope.querySelector('.lb-name');
    const n = cleanName(input ? input.value : '');
    setName(n);
    return n;
  }

  function renderOverStrip(run, state) {
    const box = overBox();
    if (!box) return;
    /* state: null → awaiting, 'posting', number → posted with rank, string → error,
       undefined → the strip only breathes when there is something to say */
    if (!run) { refreshOverStrip(); return; }
    box.classList.remove('hidden');
    const waveTxt = `WAVE ${run.wave | 0}`;

    if (state === 'posting') {
      box.innerHTML = `<span class="ob-line">POSTING ${waveTxt} TO THE LEDGER…</span>`;
      return;
    }
    if (typeof state === 'string') {
      box.innerHTML = `<span class="ob-line ob-err">${esc(state)}</span>`;
      return;
    }
    if (typeof state === 'number') {
      box.innerHTML = `<span class="ob-line">POSTED — ${waveTxt}${state ? ` · RANK #${state}` : ''}</span>` +
        `<button id="obViewBtn" class="ghost-btn small" type="button">VIEW BOARD</button>`;
      const b = document.getElementById('obViewBtn');
      if (b) b.addEventListener('click', () => { SFX.ensure(); open('over'); });
      return;
    }
    /* awaiting: signed in → post at once; signed out → offer the seal */
    if (signedIn()) { postRun(run); return; }
    box.innerHTML = `<span class="ob-line">YOUR FURTHEST CARRY — ${waveTxt}</span>` +
      signWidget(`SIGN THE PAGE — POST ${waveTxt}`, true);
    const g = box.querySelector('.ink-btn');
    if (g) g.addEventListener('click', () => {
      const nm = readMark(box);
      ST.pending = run;
      renderOverStrip(run, 'posting');
      signIn(nm).then(() => {
        /* the auth listener usually consumes the pending post first;
           the debug paper cloud has no listener — this is its door */
        if (ST.pending) { ST.pending = null; postRun(run); }
      }).catch(() => { ST.pending = null; renderOverStrip(run, null); });
    });
  }

  /* the daily sheet's own strip: quieter words, the same honesty */
  function renderDailyStrip(run, state) {
    const box = overBox();
    if (!box) return;
    if (!run) {
      box.classList.remove('hidden');
      box.innerHTML = `<span class="ob-line">PRACTICE SHEET — TODAY'S INK IS ALREADY ON THE LEDGER</span>`;
      return;
    }
    box.classList.remove('hidden');
    if (state === 'posting') {
      box.innerHTML = `<span class="ob-line">POSTING TODAY'S INK…</span>`;
      return;
    }
    if (typeof state === 'string') {
      box.innerHTML = `<span class="ob-line ob-err">${esc(state)}</span>`;
      return;
    }
    if (typeof state === 'number') {
      box.innerHTML = `<span class="ob-line">TODAY'S INK — POSTED${state ? ` · RANK #${state}` : ''}</span>` +
        `<button id="obViewBtn" class="ghost-btn small" type="button">VIEW BOARD</button>`;
      const b = document.getElementById('obViewBtn');
      if (b) b.addEventListener('click', () => { SFX.ensure(); open('over', 'day'); });
      return;
    }
    if (signedIn()) { postDailyRun(run); return; }
    box.innerHTML = `<span class="ob-line">TODAY'S SHEET — WAVE ${run.wave | 0}</span>` +
      signWidget(`SIGN THE PAGE — POST TODAY'S INK`, true);
    const g = box.querySelector('.ink-btn');
    if (g) g.addEventListener('click', () => {
      const nm = readMark(box);
      ST.pending = run;
      renderDailyStrip(run, 'posting');
      signIn(nm).then(() => postDailyRun(run)).catch(() => { ST.pending = null; renderDailyStrip(run, null); });
    });
  }

  async function postDailyRun(run) {
    if (ST.posting) return;
    ST.posting = true;
    renderDailyStrip(run, 'posting');
    try {
      const res = await submitDailyRun(run);
      ST.posting = false;
      if (res.ok) {
        let rank = null;
        try { rank = await fetchDailyRank(run.day, run.score); } catch (e) {}
        renderDailyStrip(run, rank);
      } else {
        renderDailyStrip(run, null);
      }
    } catch (e) {
      ST.posting = false;
      renderDailyStrip(run, postFail(e));
    }
  }

  /* the strip re-renders when the sign-in state changes underneath it */
  function refreshOverStrip() {
    const box = overBox();
    if (!box || box.classList.contains('hidden')) return;
    const line = box.querySelector('.ob-line');
    if (!line || ST.posting) return;
    const posted = /^POSTED/.test(line.textContent);
    if (!posted) { box.classList.add('hidden'); box.innerHTML = ''; }
  }

  /* ---------------- the board screen ---------------- */

  function open(returnTo, tab) {
    const over = document.getElementById('screenOver');
    ST.returnTo = returnTo || (over && !over.classList.contains('hidden') ? 'over' : 'title');
    if (tab === 'day' || tab === 'all') ST.tab = tab;
    UI.show('board');
    renderTabs();
    renderAuth();
    const rows = document.getElementById('boardRows');
    const mine = document.getElementById('boardMine');
    if (mine) mine.textContent = '';
    const day = todayKey();
    if (!configured()) {
      if (ST.tab === 'day') {
        const rec = dailyLocal();
        rows.innerHTML = rec
          ? `<li class="board-note">THE INK CLOUD IS NOT CONNECTED —<br>YOUR SHEET TODAY: WAVE ${rec.wave | 0} · ${(rec.score | 0).toLocaleString('en-US')}</li>`
          : `<li class="board-note">THE INK CLOUD IS NOT CONNECTED —<br>SEE README · LEADERBOARD SETUP (SUPABASE)</li>`;
      } else {
        rows.innerHTML = `<li class="board-note">THE INK CLOUD IS NOT CONNECTED —<br>SEE README · LEADERBOARD SETUP (SUPABASE)</li>`;
      }
      return;
    }
    if (rows) rows.innerHTML = `<li class="board-note board-loading"><span class="brush-spin"></span>UNROLLING THE LEDGER…</li>`;
    init()
      .then(() => (ST.tab === 'day' ? fetchDailyTop(day) : fetchTop()))
      .then(list => { if (ST.tab === 'day') renderDailyRows(list); else renderRows(list); })
      .catch(e => {
        if (rows) rows.innerHTML = `<li class="board-note">THE CLOUD IS UNREACHABLE —<br>${esc(ST.loadErr || (e && e.message) || 'TRY AGAIN')}</li>`;
      });
  }

  /* today's key, matching the game's own calendar (local midnight turns the sheet) */
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dailyLocal() {
    try {
      const rec = JSON.parse(localStorage.getItem('om_daily_v1') || 'null');
      return rec && rec.day === todayKey() ? rec : null;
    } catch (e) { return null; }
  }

  function renderTabs() {
    const all = document.getElementById('boardTabAll');
    const day = document.getElementById('boardTabDay');
    const lab = document.getElementById('boardDayLabel');
    if (!all || !day) return;
    all.classList.toggle('is-on', ST.tab === 'all');
    day.classList.toggle('is-on', ST.tab === 'day');
    all.setAttribute('aria-selected', ST.tab === 'all' ? 'true' : 'false');
    day.setAttribute('aria-selected', ST.tab === 'day' ? 'true' : 'false');
    if (lab) lab.textContent = 'TODAY';
  }

  function setTab(tab) {
    if (ST.tab === tab) return;
    ST.tab = tab;
    open(ST.returnTo, tab);
  }

  function renderDailyRows(list) {
    const rows = document.getElementById('boardRows');
    if (!rows) return;
    if (!list.length) {
      rows.innerHTML = `<li class="board-note">TODAY'S PAPER IS BLANK —<br>BE THE FIRST INK OF THE DAY</li>`;
      return;
    }
    const m_ = me();
    const uid = m_ ? m_.uid : null;
    rows.innerHTML = list.map((r, i) => {
      const rank = i + 1;
      const top = rank <= 3;
      const isMe = uid && r.__uid === uid;
      const ava = r.photo
        ? `<img class="r-ava" src="${esc(r.photo)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="r-ava r-ava-ink" aria-hidden="true"></span>`;
      return `<li class="board-row${top ? ` top${rank}` : ''}${isMe ? ' me' : ''}">
        <span class="r-rank${top ? ' seal' : ''}">${top ? `<i>${RANK_KANJI[rank]}</i>` : rank}</span>
        ${ava}
        <span class="r-name">${esc(r.name || 'INK DRIFTER')}${r.hard ? '<i class="r-hard" title="This sheet was REALLY HARD">難</i>' : ''}</span>
        <span class="r-wave">${r.wave | 0}</span>
        <span class="r-score">${(r.score | 0).toLocaleString('en-US')}</span>
      </li>`;
    }).join('');
  }

  function close() {
    UI.show(ST.returnTo === 'over' ? 'over' : 'title');
  }

  const RANK_KANJI = ['', '一', '二', '三'];

  function renderRows(list) {
    const rows = document.getElementById('boardRows');
    if (!rows) return;
    ST.rows = list;
    if (!list.length) {
      rows.innerHTML = `<li class="board-note">THE PAPER IS BLANK —<br>BE THE FIRST TO CARRY THE INK</li>`;
      return;
    }
    const m_ = me();
    const uid = m_ ? m_.uid : null;
    rows.innerHTML = list.map((r, i) => {
      const rank = i + 1;
      const top = rank <= 3;
      const isMe = uid && r.__uid === uid;
      const ava = r.photo
        ? `<img class="r-ava" src="${esc(r.photo)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="r-ava r-ava-ink" aria-hidden="true"></span>`;
      return `<li class="board-row${top ? ` top${rank}` : ''}${isMe ? ' me' : ''}">
        <span class="r-rank${top ? ' seal' : ''}">${top ? `<i>${RANK_KANJI[rank]}</i>` : rank}</span>
        ${ava}
        <span class="r-name">${esc(r.name || 'INK DRIFTER')}${r.hard ? '<i class="r-hard" title="This run was REALLY HARD">難</i>' : ''}</span>
        <span class="r-wave">${r.wave | 0}</span>
        <span class="r-score">${(r.score | 0).toLocaleString('en-US')}</span>
      </li>`;
    }).join('');
    renderMine();
  }

  async function renderMine() {
    const mine = document.getElementById('boardMine');
    if (!mine) return;
    const best = getLocalBest();
    if (!best || !best.wave) { mine.textContent = ''; return; }
    let rankTxt = '';
    try {
      if (configured()) {
        await init();
        const rank = await fetchRank(best.wave);
        if (rank) rankTxt = ` · #${rank}`;
      }
    } catch (e) {}
    mine.innerHTML = `YOUR BEST — WAVE ${best.wave | 0} · ${(best.score | 0).toLocaleString('en-US')}${rankTxt}`;
  }

  function renderAuth(err) {
    const box = document.getElementById('boardAuth');
    if (!box) return;
    if (!configured()) { box.innerHTML = ''; return; }
    if (err) ST.oauthError = err;
    if (ST.user) ST.oauthError = '';
    if (ST.debug && ST.debugUser) {
      box.innerHTML = `<span class="board-user"><span class="r-ava r-ava-ink" aria-hidden="true"></span><b>QA SCRIBE</b></span>
        <button id="boardOutBtn" class="ghost-btn small" type="button">SIGN OUT</button>`;
      const o = document.getElementById('boardOutBtn');
      if (o) o.addEventListener('click', signOut);
      return;
    }
    if (ST.user) {
      const m_ = me() || {};
      const n = String(m_.name || 'INK DRIFTER').slice(0, 24);
      const ava = m_.photo
        ? `<img class="r-ava" src="${esc(m_.photo)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="r-ava r-ava-ink" aria-hidden="true"></span>`;
      box.innerHTML = `<span class="board-user">${ava}<b>${esc(n)}</b></span>
        <button id="boardOutBtn" class="ghost-btn small" type="button">SIGN OUT</button>`;
      const o = document.getElementById('boardOutBtn');
      if (o) o.addEventListener('click', () => signOut().catch(() => {}));
      return;
    }
    box.innerHTML = signWidget('SIGN THE PAGE') +
      gBtn('OR USE GOOGLE', true) +
      (ST.oauthError ? `<span class="auth-err">${esc(ST.oauthError)}</span>` : '');
    const g = box.querySelector('.ink-btn');
    if (g) g.addEventListener('click', () => {
      g.disabled = true;
      const nm = readMark(box);
      signIn(nm).catch(() => { if (g) g.disabled = false; });
    });
    const gg = box.querySelector('.g-btn');
    if (gg) gg.addEventListener('click', () => {
      gg.disabled = true;
      signInGoogle().catch(() => { if (gg) gg.disabled = false; });
    });
  }

  /* ---------------- QA: a paper cloud ---------------- */
  function debugFill() {
    ST.debug = true;
    ST.debugUser = { uid: 'qa-scribe', name: 'QA SCRIBE', photo: '' };
    ST.debugRank = 12;
    open('title');
  }

  function debugRows() {
    const N = ['THE UNWETTED BRUSH', 'SUMI NO KAMI', 'PAPER WRAITH', '一筆入魂', 'OLD WORM',
      'THE PALE HAND', 'WASHI GHOST', 'RED HANKO', 'SHEET IV HERMIT', 'INK VESSEL',
      'QUIET SPEAR', 'MOTH OF THE LAMP'];
    let wave = 612;
    return N.map((name, i) => {
      const row = { name, photo: '', wave, score: wave * 1370 + (i * 913) % 700, kills: wave * 31, hard: i === 2 || i === 7, __uid: i === 6 ? 'qa-scribe' : `u${i}` };
      wave -= 7 + ((i * 13) % 23);
      return row;
    });
  }

  /* ---------------- api ---------------- */
  return {
    onRunEnd, open, close, signIn, signInGoogle, signOut, setTab, consumeOAuthReturn,
    get user() { return me(); },
    get debug() { return ST.debug; },
    debugFill,
  };

})();
