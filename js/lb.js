'use strict';
/* ============================================================
   ONE MORE — the endless ledger (榜)
   Google sign-in + a Firestore ledger of endless runs.

   Design of the ledger:
   · one page per scribe — om_scores/{uid} — so the board reads
     a roster of ink-carriers, never one hand repeated;
   · a run is posted only when it carries further than the hand
     has ever carried before (local best, om_lb_best_v1);
   · rank counts the pages that reached further, +1.

   The cloud is raised lazily: until the board is opened or an
   endless run ends, no network breath is spent. Without config
   (js/firebase-config.js) the ledger stays quietly offline.
   ============================================================ */

const LB = (() => {

  /* ---------------- state ---------------- */
  const ST = {
    fb: null,          // { app, auth, db, A, F } once the SDK lands
    initing: null,     // the in-flight load promise
    loadErr: '',       // why the cloud could not be raised
    user: null,        // the signed-in scribe
    returnTo: 'title', // where RETURN leads
    pending: null,     // an endless run awaiting a sign-in before its post
    posting: false,
    debug: false,      // QA: a paper cloud — no network, fake rows
    rows: null,        // cached board rows
  };

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

  const cfg = () => {
    const c = window.OM_FIREBASE_CONFIG || {};
    return (c.apiKey && c.projectId && c.appId) ? c : null;
  };
  const configured = () => ST.debug || !!cfg();
  const signedIn = () => ST.debug ? !!ST.debugUser : !!ST.user;

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
    if (ST.fb || ST.debug) return Promise.resolve(ST.fb);
    if (!cfg()) return Promise.reject(new Error('unconfigured'));
    if (ST.initing) return ST.initing;
    ST.initing = (async () => {
      try {
        const [appM, authM, fsM] = await Promise.all([
          import(`${SDK}/firebase-app.js`),
          import(`${SDK}/firebase-auth.js`),
          import(`${SDK}/firebase-firestore.js`),
        ]);
        const app = appM.initializeApp(window.OM_FIREBASE_CONFIG);
        const auth = authM.getAuth(app);
        const db = fsM.getFirestore(app);
        ST.fb = { app, auth, db, A: authM, F: fsM };
        authM.onAuthStateChanged(auth, u => {
          ST.user = u || null;
          renderAuth();
          if (u && ST.pending) {           /* the sign-in answered the pending post */
            const run = ST.pending; ST.pending = null;
            postRun(run);
          } else {
            refreshOverStrip();
          }
        });
        return ST.fb;
      } catch (e) {
        ST.loadErr = (e && e.message) || 'the cloud could not be raised';
        ST.initing = null;
        throw e;
      }
    })();
    return ST.initing;
  }

  function authFail(e) {
    const c = (e && e.code) || '';
    if (c === 'auth/popup-blocked' || c === 'auth/popup-closed-by-user' || c === 'auth/cancel-popup-request')
      return 'THE WINDOW CLOSED — ALLOW POPUPS AND TRY AGAIN';
    if (c === 'auth/unauthorized-domain')
      return 'THIS DOMAIN IS NOT AUTHORIZED — ADD IT UNDER FIREBASE AUTHENTICATION → SETTINGS';
    if (c === 'auth/operation-not-allowed')
      return 'THE GOOGLE PROVIDER IS NOT ENABLED IN FIREBASE AUTHENTICATION';
    if (c === 'auth/network-request-failed')
      return 'THE NETWORK REFUSED THE STROKE — TRY AGAIN';
    if (c.startsWith('auth/')) return c.replace('auth/', '').replace(/-/g, ' ').toUpperCase();
    return 'THE SIGN-IN FAILED — TRY AGAIN';
  }

  async function signIn() {
    SFX.ensure();
    if (ST.debug) { ST.debugUser = { uid: 'qa-scribe', displayName: 'QA SCRIBE', photoURL: '' }; renderAuth(); refreshOverStrip(); return null; }
    const f = await init();
    if (!f) throw new Error('unconfigured');
    try {
      const prov = new f.A.GoogleAuthProvider();
      prov.setCustomParameters({ prompt: 'select_account' });
      const res = await f.A.signInWithPopup(f.auth, prov);
      ST.user = res.user;
      return ST.user;
    } catch (e) {
      const msg = authFail(e);
      renderAuth(msg);
      throw new Error(msg);
    }
  }

  async function signOut() {
    if (ST.debug) { ST.debugUser = null; renderAuth(); refreshOverStrip(); return; }
    if (!ST.fb) return;
    await ST.fb.A.signOut(ST.fb.auth);
    ST.user = null;
    renderAuth();
    refreshOverStrip();
  }

  /* ---------------- the ledger's strokes ---------------- */

  /* one page per scribe; a post only when the run carried further */
  async function submitRun(run) {
    if (ST.debug) return { ok: true, rank: ST.debugRank || 7 };
    const f = ST.fb;
    if (!f || !ST.user) return { ok: false, reason: 'signed-out' };
    const ref = f.F.doc(f.db, 'om_scores', ST.user.uid);
    const snap = await f.F.getDoc(ref);
    if (snap.exists()) {
      const old = snap.data();
      if ((old.wave | 0) > run.wave || ((old.wave | 0) === run.wave && (old.score | 0) >= run.score))
        return { ok: true, kept: true };
    }
    await f.F.setDoc(ref, {
      name: String(ST.user.displayName || 'INK DRIFTER').slice(0, 24),
      photo: ST.user.photoURL || '',
      wave: run.wave | 0,
      score: run.score | 0,
      kills: run.kills | 0,
      time: Math.max(0, Math.round(run.time || 0)),
      hard: !!run.hard,
      v: 1,
      ts: f.F.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
  }

  async function fetchTop() {
    if (ST.debug) return debugRows();
    const f = ST.fb;
    if (!f) throw new Error('unconfigured');
    const q = f.F.query(f.F.collection(f.db, 'om_scores'),
      f.F.orderBy('wave', 'desc'), f.F.limit(60));
    const snap = await f.F.getDocs(q);
    const rows = snap.docs.map(d => d.data());
    rows.sort((a, b) => ((b.wave | 0) - (a.wave | 0)) || ((b.score | 0) - (a.score | 0)));
    return rows.slice(0, 50);
  }

  async function fetchRank(wave) {
    if (ST.debug) return ST.debugRank || 7;
    const f = ST.fb;
    if (!f) return null;
    const q = f.F.query(f.F.collection(f.db, 'om_scores'), f.F.where('wave', '>', wave | 0));
    const s = await f.F.getCountFromServer(q);
    return (s.data().count || 0) + 1;
  }

  /* ---------------- the over sheet's post strip ---------------- */

  function overBox() { return document.getElementById('overBoard'); }

  /* an endless run has truly ended — the ledger takes its entry */
  function onRunEnd(run) {
    const box = overBox();
    if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
    ST.pending = null; ST.posting = false;
    if (!run || run.mode !== 'endless' || run.victory) return;
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
      renderOverStrip(run, (e && e.message) || 'post failed');
    }
  }

  function gBtn(label, small) {
    return `<button class="g-btn${small ? ' small' : ''}" type="button">
      <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C36.9 40.4 44 35 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
      <span>${esc(label)}</span></button>`;
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
      gBtn(`SIGN IN WITH GOOGLE — POST ${waveTxt}`, true);
    const g = box.querySelector('.g-btn');
    if (g) g.addEventListener('click', () => {
      ST.pending = run;
      renderOverStrip(run, 'posting');
      signIn().catch(() => { ST.pending = null; renderOverStrip(run, null); });
    });
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

  function open(returnTo) {
    const over = document.getElementById('screenOver');
    ST.returnTo = returnTo || (over && !over.classList.contains('hidden') ? 'over' : 'title');
    UI.show('board');
    renderAuth();
    const rows = document.getElementById('boardRows');
    const mine = document.getElementById('boardMine');
    if (mine) mine.textContent = '';
    if (!configured()) {
      if (rows) rows.innerHTML = `<li class="board-note">THE INK CLOUD IS NOT CONNECTED —<br>SEE README · LEADERBOARD SETUP (FIREBASE)</li>`;
      return;
    }
    if (rows) rows.innerHTML = `<li class="board-note board-loading"><span class="brush-spin"></span>UNROLLING THE LEDGER…</li>`;
    init()
      .then(() => fetchTop())
      .then(list => { renderRows(list); })
      .catch(e => {
        if (rows) rows.innerHTML = `<li class="board-note">THE CLOUD IS UNREACHABLE —<br>${esc(ST.loadErr || (e && e.message) || 'TRY AGAIN')}</li>`;
      });
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
    const me_ = ST.debug ? ST.debugUser : ST.user;
    const uid = me_ ? me_.uid : null;
    rows.innerHTML = list.map((r, i) => {
      const rank = i + 1;
      const top = rank <= 3;
      const me = uid && r.__uid === uid;
      const ava = r.photo
        ? `<img class="r-ava" src="${esc(r.photo)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="r-ava r-ava-ink" aria-hidden="true"></span>`;
      return `<li class="board-row${top ? ` top${rank}` : ''}${me ? ' me' : ''}">
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
    if (ST.debug && ST.debugUser) {
      box.innerHTML = `<span class="board-user"><span class="r-ava r-ava-ink" aria-hidden="true"></span><b>QA SCRIBE</b></span>
        <button id="boardOutBtn" class="ghost-btn small" type="button">SIGN OUT</button>`;
      const o = document.getElementById('boardOutBtn');
      if (o) o.addEventListener('click', signOut);
      return;
    }
    if (ST.user) {
      const n = String(ST.user.displayName || 'INK DRIFTER').slice(0, 24);
      const ava = ST.user.photoURL
        ? `<img class="r-ava" src="${esc(ST.user.photoURL)}" alt="" referrerpolicy="no-referrer">`
        : `<span class="r-ava r-ava-ink" aria-hidden="true"></span>`;
      box.innerHTML = `<span class="board-user">${ava}<b>${esc(n)}</b></span>
        <button id="boardOutBtn" class="ghost-btn small" type="button">SIGN OUT</button>`;
      const o = document.getElementById('boardOutBtn');
      if (o) o.addEventListener('click', () => signOut().catch(() => {}));
      return;
    }
    box.innerHTML = gBtn('SIGN IN WITH GOOGLE') + (err ? `<span class="auth-err">${esc(err)}</span>` : '');
    const g = box.querySelector('.g-btn');
    if (g) g.addEventListener('click', () => {
      g.disabled = true;
      signIn().catch(() => { if (g) g.disabled = false; });
    });
  }

  /* ---------------- QA: a paper cloud ---------------- */
  function debugFill() {
    ST.debug = true;
    ST.debugUser = { uid: 'qa-scribe', displayName: 'QA SCRIBE', photoURL: '' };
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
    onRunEnd, open, close, signIn, signOut,
    get user() { return ST.debug ? ST.debugUser : ST.user; },
    get debug() { return ST.debug; },
    debugFill,
  };

})();
