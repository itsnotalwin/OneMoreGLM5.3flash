'use strict';
/* ============================================================
   ONE MORE — bootstrap: canvas, input, loop, wiring
   ============================================================ */

(function () {
  const canvas = document.getElementById('game');
  /* opaque canvas — the sheet always fills the frame, and the
     compositor gets to skip the alpha pass entirely */
  const ctx = canvas.getContext('2d', { alpha: false });
  const stage = document.getElementById('stage');

  /* ---------------- adaptive resolution ----------------
     a last-resort guard for genuinely modest hardware. The sheet
     only softens after struggle that PERSISTS — a hiccough, a GC
     pause, a spawn burst or a busy tab must never cost the scribe
     his detail — and it always finds its way back to full crispness.
     ?nores disables the guard entirely. */
  const ADAPT = {
    scale: 1,
    downCool: 0,      // s before the next step down
    upHold: 0,        // s of healthy pace before a step up
    sagT: 0,          // s of sustained struggle, decayed while healthy
    grace: 0,         // s of protection at a run's start (spawn bursts)
    on: true,
  };
  try { ADAPT.on = new URLSearchParams(location.search).get('nores') === null; } catch (e) {}

  /* ---------------- sizing ---------------- */
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * ADAPT.scale;
    canvas.width = Math.max(2, Math.round(w * dpr));
    canvas.height = Math.max(2, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    G.S.W = w; G.S.H = h; G.S.dpr = dpr;
  }
  /* a window change — moved, resized, zoomed, another monitor — is
     a natural moment to retry full crispness */
  window.addEventListener('resize', () => {
    if (ADAPT.scale < 1) { ADAPT.scale = 1; ADAPT.sagT = 0; ADAPT.downCool = 4; }
    resize();
  });
  resize();
  /* QA hook: force the internal scale to see the sheet softened or
     restored (the adapt guard itself stays otherwise automatic) */
  G.setResScale = v => { ADAPT.scale = Math.max(0.5, Math.min(1, v)); ADAPT.sagT = 0; resize(); };
  G.resScale = () => ADAPT.scale;
  G.S.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- input ---------------- */
  const keys = Object.create(null);

  function vec() {
    let x = 0, y = 0;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    const j = G.S.joy;
    if (j) {
      const l = Math.hypot(j.dx, j.dy);
      if (l > 6) { x = j.dx / 52; y = j.dy / 52; }
    }
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    /* a still hand lets the autobrush walk — any real input outranks it */
    if (m === 0 && G.autoVec) {
      const v = G.autoVec(0, 0);
      x = v.x; y = v.y;
    }
    G.S.inputVec.x = x; G.S.inputVec.y = y;
  }

  function pause() {
    if (G.mode !== 'playing') return;
    G.mode = 'paused';
    UI.show('pause');
  }

  function resume() {
    if (G.mode !== 'paused') return;
    SFX.ensure();
    SFX.namestamp();          /* the brush returns to the hand */
    G.mode = 'playing';
    UI.show(null);
  }

  let lastMode = 'journey';
  function start(mode, opts) {
    SFX.ensure();
    SFX.music.start('scroll');     /* the scroll's pulse carries the run */
    R.resetStains(); /* a fresh sheet */
    ADAPT.grace = 4; /* spawn bursts are allowed their jank */
    G.startRun(mode || lastMode, opts);
    lastMode = mode || lastMode;
    UI.markAuto(G.S.autoUpgrade);  /* the AUTO hand re-arms per run */
    /* the first-run whisper: startRun has already counted this run,
       so a first count of 1 is the only run the hint ever speaks in */
    if (G.getRuns() === 1) showRunHint();
  }

  /* ---------------- the first-run whisper ----------------
     the title carries no legend any more (v14 quiet title), so the
     teaching lives here: five seconds inside run 001, then the
     paper never repeats itself. */
  let runHintT = null;
  function showRunHint() {
    const h = document.getElementById('runHint');
    if (!h) return;
    h.classList.remove('hidden', 'gone');
    clearTimeout(runHintT);
    runHintT = setTimeout(() => {
      h.classList.add('gone');
      setTimeout(() => h.classList.add('hidden'), 950);
    }, 5200);
  }

  function goMenu() {
    SFX.ensure();
    SFX.thud();               /* a knock: the run is set down */
    R.resetStains();
    G.abandon();
    SFX.music.start('title'); /* the paper set down asks for its breath again */
  }

  /* the level-clear rest: onward naked, or home */
  function clearNext() {
    SFX.ensure();
    G.clearNext();
  }
  function clearHome() {
    SFX.ensure();
    SFX.page(0.7);            /* the paper folds home */
    G.clearHome();
  }

  /* the shelf of scrolls: opened from the title, answered by a run */
  function openScrolls() {
    SFX.ensure();
    SFX.page();               /* the shelf unrolls */
    UI.buildScrolls();
    UI.show('scrolls');
  }

  function closeScrolls() {
    SFX.ensure();
    SFX.page(0.7);
    UI.show('title');
  }

  const scrollsOpen = () => {
    const s = document.getElementById('screenScrolls');
    return s && !s.classList.contains('hidden');
  };

  /* the endless ledger: opened from the title or the over sheet,
     answered with RETURN back to wherever the hand stood */
  const boardOpen = () => {
    const b = document.getElementById('screenBoard');
    return b && !b.classList.contains('hidden');
  };
  function openBoard() {
    SFX.ensure();
    SFX.page();
    LB.open();
  }
  function closeBoard() {
    SFX.ensure();
    SFX.page(0.7);
    LB.close();
  }

  /* ---------------- the starter brush — 筆 ----------------
     one entry on the title; behind it, the shelf of tools:
     every brush at full length, its whole word on the page. */
  const brushRoomOpen = () => {
    const s = document.getElementById('screenBrush');
    return s && !s.classList.contains('hidden');
  };
  function openBrushRoom() {
    SFX.ensure();
    SFX.page();               /* the tool shelf slides out */
    UI.buildBrushes(G.getBrush());
    UI.show('brush');
  }
  function closeBrushRoom() {
    SFX.ensure();
    SFX.pick(1);
    UI.show('title');
  }
  document.getElementById('brushBtn').addEventListener('click', openBrushRoom);
  document.getElementById('brushBackBtn').addEventListener('click', closeBrushRoom);

  /* the paper's tactility: a hair of voice as the mouse crosses a door.
     Mice only, throttled, and it NEVER wakes the audio — tone() simply
     stays silent until a finger has blessed the context. */
  let lastHoverId = '', lastHoverT = 0;
  window.addEventListener('pointerover', e => {
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    const now = performance.now();
    if (now - lastHoverT < 70) return;
    const id = b.id || b.className;
    if (id === lastHoverId && now - lastHoverT < 900) return;
    lastHoverId = id; lastHoverT = now;
    SFX.tick();
  });

  /* ---------------- settings — 設 ----------------
     the study: the scribe's mark (the account) and the paper's
     habits. The room remembers where the hand came from — the
     board and the over sheet can send the player here to sign
     in, and RETURN walks them back. */
  const settingsOpen = () => {
    const s = document.getElementById('screenSettings');
    return s && !s.classList.contains('hidden');
  };
  let wipeArmed = false, wipeTimer = null;
  let settingsReturn = 'title';   /* title | board | over */
  function refreshSettings() {
    const on = (id, v) => {
      const row = document.getElementById(id);
      const st = document.getElementById(id + 'State');
      if (row) row.classList.toggle('is-on', !!v);
      if (st) st.textContent = v ? 'ON' : 'OFF';
    };
    /* the mute button's own class is the one truth for sound */
    const muted = document.getElementById('muteBtn').classList.contains('muted');
    on('setSound', !muted);
    on('setGhost', localStorage.getItem('om_ghost_off_v1') !== '1');
    /* THE AUTOBRUSH — the walker walks from the first sheet: no seal,
       AUTO is everyone's from the start (v24.6c) */
    const autoRow = document.getElementById('setAuto');
    if (autoRow) {
      const autoOn = G.getAutoBrush();
      autoRow.classList.toggle('hidden', false);   /* v24.6c the walker walks from the first sheet */
      const ast = document.getElementById('setAutoState');
      if (ast) ast.textContent = autoOn ? 'ON' : 'OFF';
      autoRow.classList.toggle('is-on', autoOn);
    }
    on('setHard', G.getHard());
    /* the sheet's ink: AUTO wears the highest unlocked scroll */
    const tst = document.getElementById('setThemeState');
    if (tst) tst.textContent = THEME_LABELS[G.getThemeSetting()] || 'AUTO';
    const wipe = document.getElementById('setWipe');
    const wst = document.getElementById('setWipeState');
    if (wipe) wipe.classList.toggle('armed', wipeArmed);
    if (wst) wst.textContent = wipeArmed ? 'SURE?' : 'WIPE';
  }
  function openSettings(from) {
    SFX.ensure();
    SFX.page();               /* the study door slides */
    settingsReturn = (from === 'board' || from === 'over') ? from : 'title';
    if (typeof LB !== 'undefined') LB.authReturnTo = settingsReturn;
    wipeArmed = false;
    refreshSettings();
    if (typeof LB !== 'undefined' && LB.renderAccount) LB.renderAccount();
    UI.show('settings');
    UI.hud(false);
  }
  function closeSettings() {
    wipeArmed = false;
    clearTimeout(wipeTimer);
    UI.show(settingsReturn);
    settingsReturn = 'title';
  }
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('setBackBtn').addEventListener('click', () => { SFX.pick(1); closeSettings(); });
  document.getElementById('setSound').addEventListener('click', () => {
    toggleMute();
    refreshSettings();
  });
  document.getElementById('setGhost').addEventListener('click', () => {
    SFX.ensure();
    const off = localStorage.getItem('om_ghost_off_v1') === '1';
    if (off) localStorage.removeItem('om_ghost_off_v1');
    else localStorage.setItem('om_ghost_off_v1', '1');
    SFX.pick(1);
    refreshSettings();
  });
  document.getElementById('setAuto').addEventListener('click', () => {
    SFX.ensure();
    G.setAutoBrush(!G.getAutoBrush());
    SFX.pick(1);
    refreshSettings();
  });
  document.getElementById('setHard').addEventListener('click', () => {
    SFX.ensure();
    G.setHard(!G.getHard());
    UI.setHard(G.getHard());
    SFX.pick(1);
    refreshSettings();
  });
  /* THE SHEET'S INK — the theme cycles AUTO → the six papers */
  const THEME_CYCLE = ['auto', 'pale', 'dark'];
  const THEME_LABELS = { auto: 'AUTO', pale: 'FIRST WASH', dark: 'NIGHT' };
  const themeBtn = document.getElementById('setTheme');
  if (themeBtn) themeBtn.addEventListener('click', () => {
    SFX.ensure();
    const cur = THEME_CYCLE.indexOf(G.getThemeSetting());
    const next = THEME_CYCLE[(cur + 1) % THEME_CYCLE.length];
    G.setThemeSetting(next);
    SFX.pick(1);
    refreshSettings();
  });
  document.getElementById('setWipe').addEventListener('click', () => {
    SFX.ensure();
    if (!wipeArmed) {
      /* the first press only asks: the ink cannot return */
      wipeArmed = true;
      refreshSettings();
      SFX.thud ? SFX.thud() : SFX.pick(0);
      clearTimeout(wipeTimer);
      wipeTimer = setTimeout(() => { wipeArmed = false; refreshSettings(); }, 4000);
      return;
    }
    /* Local wipe never silently erases the cloud account save. */
    clearTimeout(wipeTimer);
    try { if (window.OM_CLOUD) window.OM_CLOUD.beforeLocalWipe(); }
    catch (e) { wipeArmed = false; refreshSettings(); return; }
    try {
      const kill = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('om_') === 0) kill.push(k);
      }
      kill.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
    wipeArmed = false;
    try { UI.show('title'); } catch (e) {}
    location.reload();
  });

  /* the journey answers the shelf: a scene-strip pressed begins the
     run at that scene's first wave; a scroll-strip pressed unrolls
     the scroll to its ten scenes. The title's strip of seals walks
     straight to a scroll's frontier. */
  UI.onScrollPick = (sheet, level) => start('journey', { sheet, level });
  UI.onOpenScroll = n => { SFX.ensure(); UI.buildLevels(n); };
  UI.onJourneyPick = n => start('journey', { sheet: n, level: G.frontierLevel(n) });
  UI.onScrollsBack = closeScrolls;

  function toggleMute() {
    SFX.ensure();
    const m = SFX.toggle();
    UI.muteVisual(m);
    if (!m) SFX.tick();       /* sound returns: the ear hears it come back */
  }

  /* ---------------- fps meter (F toggles it, ?fps=1 pins it) ---------------- */
  let fpsOn = false;
  try { fpsOn = new URLSearchParams(location.search).get('fps') === '1'; } catch (e) {}
  const fpsBox = { ms: 16.7, fps: 60, t: 0 };

  window.addEventListener('keydown', e => {
    const k = e.code;
    /* the page must not scroll on arrows/space — but a focused control
       (button, field) owns its Space and keeps it */
    const tg = e.target;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k) &&
        !(tg && tg.closest && tg.closest('button, a, input, textarea, select'))) e.preventDefault();
    SFX.ensure();
    if (G.mode === 'intro') { INTRO.skip(); return; }  /* any key leaves the opening */
    if (G.mode === 'cutscene') {                       /* any key leaves a cutscene */
      if (k === 'KeyM') { toggleMute(); return; }
      CUT.skip(); return;
    }
    if (e.repeat) { keys[k] = true; return; }
    if (k === 'KeyM') { toggleMute(); return; }
    if (k === 'KeyF') { fpsOn = !fpsOn; return; }
    const m = G.mode;
    /* the seal choice: ENTER walks on naked, ESC goes home */
    if (m === 'clear') {
      if (k === 'Enter') clearNext();
      else if (k === 'Escape') clearHome();
      return;
    }
    /* the brush shelf answers only its own return keys —
       ENTER must never start a run behind the open shelf */
    if (brushRoomOpen()) {
      if (k === 'Enter' || k === 'Escape' || k === 'KeyP') closeBrushRoom();
      return;
    }
    /* the settings room answers only its own return keys */
    if (settingsOpen()) {
      if (k === 'Enter' || k === 'Escape') closeSettings();
      return;
    }
    /* the ledger overlay answers only its own return keys —
       ENTER must never start a run behind the open board */
    if (boardOpen()) {
      if (k === 'Enter' || k === 'Escape' || k === 'KeyP') closeBoard();
      return;
    }
    if (k === 'KeyP' || k === 'Escape') {
      if (scrollsOpen()) {
        /* the scene ladder folds back to the shelf before the title */
        if (UI.scrollsLadder) UI.buildScrolls(); else closeScrolls();
        return;
      }
      if (m === 'playing') pause();
      else if (m === 'paused') resume();
      return;
    }
    if (scrollsOpen()) {
      if (k === 'Enter') {
        /* the ladder answers Enter with its wet frontier; the shelf
           drills into the scroll the brush currently walks */
        if (UI.scrollsLadder) UI.onScrollPick(UI.scrollsLadder, G.frontierLevel(UI.scrollsLadder));
        else { SFX.pick(1); UI.buildLevels(Math.min(G.getUnlocked(), AREAS.length)); }
      }
      return;
    }
    if (k === 'Enter') {
      if (m === 'title') {
        if (G.qaDaily) start('daily');   /* ?daily=1 — the QA door into today's sheet */
        else start('journey', { sheet: G.getFurthest(), level: G.frontierLevel(G.getFurthest()) });
      }
      else if (m === 'over') start(null, { retry: true });
      else if (m === 'upgrade') G.deploy();
      else if (m === 'paused') resume();
      return;
    }
    if (m === 'upgrade' && /^Digit[123]$/.test(k)) {
      G.pickAt(Number(k.slice(5)) - 1);
      return;
    }
    keys[k] = true;
    vec();
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
    vec();
  });

  /* touch joystick */
  canvas.addEventListener('pointerdown', e => {
    SFX.ensure();
    if (G.mode === 'intro') { INTRO.skip(); return; }
    if (e.pointerType === 'mouse') return;
    if (G.mode !== 'playing') return;
    G.S.joy = { id: e.pointerId, ax: e.clientX, ay: e.clientY, dx: 0, dy: 0 };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    const j = G.S.joy;
    if (!j || e.pointerId !== j.id) return;
    let dx = e.clientX - j.ax, dy = e.clientY - j.ay;
    const l = Math.hypot(dx, dy);
    if (l > 52) { dx = (dx / l) * 52; dy = (dy / l) * 52; }
    j.dx = dx; j.dy = dy;
    vec();
  });
  const endJoy = e => {
    if (G.S.joy && e.pointerId === G.S.joy.id) {
      G.S.joy = null;
      G.S.inputVec.x = 0; G.S.inputVec.y = 0;
    }
  };
  canvas.addEventListener('pointerup', endJoy);
  canvas.addEventListener('pointercancel', endJoy);

  /* a mouse click anywhere also leaves the opening or a cutscene —
     and on the title it presses a splash of ink into the sheet */
  window.addEventListener('pointerdown', e => {
    if (G.mode === 'intro') INTRO.skip();
    else if (G.mode === 'cutscene') CUT.skip();
    else if (G.mode === 'title' && R.titleInkSplash) {
      const tg = e.target;
      if (!(tg && tg.closest && tg.closest('button, a, input, textarea'))) {
        R.titleInkSplash(e.clientX, e.clientY);
      }
    }
  });

  /* the title paper leans toward the hand (mice only) — and the
     hand paints: the title sheet takes wet strokes as it passes */
  window.addEventListener('pointermove', e => {
    if (G.mode !== 'title') return;
    if (R.titleInkMove) R.titleInkMove(e.clientX, e.clientY);
    if (e.pointerType && e.pointerType !== 'mouse') return;   /* only the mouse leans the paper */
    if (!G.S.titlePar) G.S.titlePar = { x: 0, y: 0 };
    G.S.titlePar.x = (e.clientX / Math.max(1, G.S.W)) * 2 - 1;
    G.S.titlePar.y = (e.clientY / Math.max(1, G.S.H)) * 2 - 1;
  });

  /* ---------------- the opening & the title ---------------- */
  const introSkip = document.getElementById('introSkip');

  function setSkipPrompt(v) {
    if (introSkip) introSkip.classList.toggle('hidden', !v);
  }

  /* v22.0 the paper blooms on its own: every few breaths a drop
     falls somewhere on the sheet and opens a small blot — the same
     language the hand's own taps speak, silent, occasional. The
     timer idles itself whenever the paper is not the title. */
  let bloomTimer = null;
  function armBlooms() {
    if (bloomTimer) return;
    bloomTimer = setInterval(() => {
      if (G.mode !== 'title' || document.hidden || Math.random() < 0.45) return;
      const S = G.S;
      const x = S.W * (0.12 + Math.random() * 0.76);
      const y = S.H * (0.14 + Math.random() * 0.66);
      R.titleInkBloom(x, y);
    }, 4200);
  }

  function enterTitle() {
    document.body.classList.remove('intro-live');
    setSkipPrompt(false);
    markIntroSeen();               /* the film has been screened — skip and finale both land here */
    G.S.titlePar = { x: 0, y: 0 };
    G.initAttract();
    R.startTitleRitual(performance.now() / 1000);   /* the brush returns */
    UI.setSheetContinue(G.getFurthest());
    const fr = G.getFurthest();
    UI.setJourneyProg(fr, G.getProg()[fr] || 0);    /* the hero road wears its distance */
    UI.setHard(G.getHard());                        /* the red toggle remembered */
    UI.setDailyChip(G.dailyState());                /* today's sheet, freshly read */
    UI.show('title');
    G.mode = 'title';
    armBlooms();
    SFX.ensure();
    SFX.music.start('title');      /* the title's breath — mute stills it with all */
  }

  function playIntro() {
    SFX.ensure();
    SFX.music.warm();              /* prime both loops while the film plays */
    SFX.warmSamples();             /* and the recorded impacts with them */
    UI.show(null);
    UI.hud(false);
    document.body.classList.add('intro-live');
    setSkipPrompt(true);
    INTRO.start();
    G.mode = 'intro';
  }

  INTRO.onEnd = enterTitle;

  /* ---------------- the first tap — the door that wakes the sound ----------------
     A browser refuses to sound an AudioContext no finger has blessed:
     a cold boot screens the opening mute, and the only gesture available
     would skip the film. The gate trades one quiet tap for the whole
     voice — the tap itself unlocks the audio, then the film plays with
     its sound design intact. QA URLs (?anything) and repeat visits and
     reduced motion walk straight through. */
  const introGate = document.getElementById('introGate');
  function showIntroGate() {
    G.mode = 'gate';            /* the loop just paints dry paper behind the door */
    if (introGate) introGate.classList.remove('hidden');
    const lift = e => {
      if (e && e.stopPropagation) e.stopPropagation();   /* the tap is spent on the door alone */
      window.removeEventListener('pointerdown', lift, true);
      window.removeEventListener('keydown', lift, true);
      if (introGate) introGate.classList.add('hidden');
      playIntro();
    };
    window.addEventListener('pointerdown', lift, { capture: true });
    window.addEventListener('keydown', lift, { capture: true });
  }

  /* one screening per session: the opening earns its audience once,
     then the title waits on the first paint — the film only returns
     when the scribe asks for it (序) */
  const INTRO_SEEN = 'om_intro_seen';
  function introSeen() {
    try { return sessionStorage.getItem(INTRO_SEEN) === '1'; } catch (e) { return false; }
  }
  function markIntroSeen() {
    try { sessionStorage.setItem(INTRO_SEEN, '1'); } catch (e) {}
  }

  /* ---------------- buttons ----------------
   THE JOURNEY is the honest verb now: one tap walks the wet frontier
   (the same answer ENTER always gave — the button simply stopped
   disagreeing with the keyboard). The shelf of scrolls hangs one
   line below on the SCENES door. */
  const startFrontier = () => start('journey', { sheet: G.getFurthest(), level: G.frontierLevel(G.getFurthest()) });
  document.getElementById('playBtn').addEventListener('click', startFrontier);
  document.getElementById('scrollsBackBtn').addEventListener('click', () => {
    /* the scene ladder folds back to the shelf before the title */
    if (UI.scrollsLadder) { SFX.ensure(); UI.buildScrolls(); return; }
    closeScrolls();
  });
  document.getElementById('endlessBtn').addEventListener('click', () => start('endless'));
  document.getElementById('dailyBtn').addEventListener('click', () => {
    /* one seeded sheet a day — the same paper for every scribe on Earth */
    start('daily');
  });
  document.getElementById('boardBtn').addEventListener('click', openBoard);
  /* the ledger's three eyes: all time, today's sheet, the week */
  document.getElementById('boardTabAll').addEventListener('click', () => LB.setTab('all'));
  document.getElementById('boardTabDay').addEventListener('click', () => LB.setTab('day'));
  document.getElementById('boardTabWeek').addEventListener('click', () => LB.setTab('week'));
  /* the board's 影 chips launch their race through the game's own door */
  LB.launchRun = mode => start(mode);
  /* the account room is the one sign-in door — the board and the
     over sheet knock on it through here, and RETURN leads back */
  LB.openSettings = from => openSettings(from);
  document.getElementById('boardBackBtn').addEventListener('click', closeBoard);
  /* the SCENES door: the shelf answers here — journey by hand */
  document.getElementById('sheetBtn').addEventListener('click', openScrolls);

  /* ---- v24.1 THE STUDY: the character menu — ink in, skills up ---- */
  function openChar() {
    SFX.ensure(); SFX.page();
    refreshChar();
    UI.show('char');
    UI.hud(false);
    const sc = document.getElementById('screenChar');
    if (sc) sc.scrollTop = 0;   /* the study always opens at its head */
    if (!charRaf) charRaf = requestAnimationFrame(drawCharPreview);
  }
  function closeChar() {
    if (charRaf) { cancelAnimationFrame(charRaf); charRaf = 0; }
    UI.show('title');
    refreshTitleInk();
  }  function refreshChar() {
    refreshRoster();
    const ink = G.getInk();
    const inkEl = document.getElementById('charInk');
    if (inkEl) inkEl.textContent = String(ink);
    const sk = G.getSkills();
    const grid = document.getElementById('charSkills');
    if (!grid) return;
    grid.innerHTML = '';
    for (const def of G.SKILLS) {
      const rank = sk[def.id] || 0;
      const maxed = rank >= def.max;
      const cost = maxed ? 0 : def.costs[rank];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'char-row' + (maxed ? ' is-max' : ink >= cost ? ' is-open' : ' is-poor');
      const pips = '●'.repeat(rank) + '○'.repeat(def.max - rank);
      row.innerHTML =
        `<span class="cr-kanji" aria-hidden="true">${def.kanji}</span>` +
        `<span class="cr-body"><b class="cr-name">${def.name}</b>` +
        `<span class="cr-desc">${def.desc}</span>` +
        `<span class="cr-pips">${pips}</span></span>` +
        `<span class="cr-cost">${maxed ? 'MASTERED' : cost + ' 墨'}</span>`;
      if (!maxed) row.addEventListener('click', () => {
        if (G.buySkill(def.id)) { SFX.ensure(); SFX.heal(); }
        else { SFX.ensure(); SFX.pick(0); }
        refreshChar();
        refreshTitleInk();
      });
      grid.appendChild(row);
    }
  }
  function refreshRoster() {
    const box = document.getElementById('charRoster');
    if (!box) return;
    const chars = G.getChars();
    box.innerHTML = '';
    for (const cd of chars) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'char-card' + (cd.current ? ' is-current' : '') + (cd.owned ? '' : ' is-locked');
      el.innerHTML =
        `<span class="cc-kanji" aria-hidden="true">${cd.kanji}</span>` +
        `<span class="cc-body"><b class="cc-name">${cd.name}</b>` +
        `<span class="cc-desc">${cd.desc}</span>` +
        `<span class="cc-skill">${cd.skill.name} — ${cd.skill.desc}</span></span>` +
        `<span class="cc-act">${cd.current ? 'WALKING' : cd.owned ? 'WALK WITH THEM' : cd.cost + ' 墨'}</span>`;
      if (!cd.current && cd.owned) el.addEventListener('click', () => {
        G.selectChar(cd.id); SFX.ensure(); SFX.page(); refreshRoster(); refreshChar();
      });
      if (!cd.owned) el.addEventListener('click', () => {
        if (G.buyChar(cd.id)) { SFX.ensure(); SFX.heal(); refreshRoster(); refreshChar(); }
        else { SFX.ensure(); SFX.pick(0); }
      });
      box.appendChild(el);
    }
  }

  function refreshTitleInk() {
    const el = document.getElementById('charInkBadge');
    if (el) el.textContent = G.getInk() > 0 ? '墨 ' + G.getInk() : '';
  }
  document.getElementById('charBtn').addEventListener('click', openChar);

  /* the portrait breathes: a little loop that lives while the study is open */
  let charRaf = 0;
  function drawCharPreview() {
    const cv = document.getElementById('charPreview');
    if (!cv || document.getElementById('screenChar').classList.contains('hidden')) { charRaf = 0; return; }
    const c2 = cv.getContext('2d');
    const cw = cv.clientWidth || 260, ch = cv.clientHeight || 190;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(cw * dpr)) {
      cv.width = Math.round(cw * dpr);
      cv.height = Math.round(ch * dpr);
    }
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, cw, ch);
    const sk = G.getSkills();
    let owned = 0, totalR = 0;
    for (const def of G.SKILLS) { totalR += def.max; owned += Math.min(sk[def.id] || 0, def.max); }
    const redK = totalR ? owned / totalR : 0;
    if (R.drawScribePreview) R.drawScribePreview(c2, cw / 2, ch * 0.62, Math.min(34, ch * 0.26), performance.now() / 1000, redK, G.getBrush(), G.getChar());
    charRaf = requestAnimationFrame(drawCharPreview);
  }
  /* v24.4b the wrapper is retired — the loop lives in openChar/closeChar */
  document.getElementById('charBackBtn').addEventListener('click', () => { SFX.pick(1); closeChar(); });
  refreshTitleInk();
  document.getElementById('openingBtn').addEventListener('click', playIntro);
  document.getElementById('continueBtn').addEventListener('click', () => {
    SFX.ensure();
    ADAPT.grace = 4;
    /* the same sheet keeps its stains — no fresh paper here */
    G.continueEndless();
  });
  document.getElementById('againBtn').addEventListener('click', () => start(null, { retry: true }));
  document.getElementById('menuBtn').addEventListener('click', goMenu);
  document.getElementById('resumeBtn').addEventListener('click', resume);
  document.getElementById('pauseMenuBtn').addEventListener('click', goMenu);
  document.getElementById('deployBtn').addEventListener('click', () => G.deploy());
  document.getElementById('autoBtn').addEventListener('click', () => {
    SFX.ensure();
    const on = !G.S.autoUpgrade;
    G.S.autoUpgrade = on;
    UI.markAuto(on);
    SFX.pick(1);
    if (on && G.mode === 'upgrade') {
      /* the hand answers at once: pick, flash, deploy */
      G.S.selected = Math.floor(Math.random() * Math.max(1, G.S.choices.length));
      UI.markSelected(G.S.selected);
      setTimeout(() => { if (G.mode === 'upgrade' && G.S.selected != null) G.deploy(); }, 300);
    }
  });
  const checkpointBtn = document.getElementById('endlessCheckpoint');
  if (checkpointBtn) checkpointBtn.addEventListener('click', () => {
    SFX.ensure();
    start('endless', { startWave: Number(checkpointBtn.dataset.startWave || 0) });
  });
  document.getElementById('clearNextBtn').addEventListener('click', clearNext);
  document.getElementById('clearHomeBtn').addEventListener('click', clearHome);
  document.getElementById('muteBtn').addEventListener('click', toggleMute);

  /* the run is never paused out from under the hand: leaving the
     window or the tab keeps the sheet live (the browser itself
     stills a hidden tab's frames — the paper waits, unpaused).
     REST stays a choice — Escape, the button. But a key held across
     a lost focus never hears its own keyup — the board is cleared
     on blur and hide, or a stuck walk stays on and the autobrush
     waits behind it forever */
  const clearKeys = () => {
    for (const k in keys) keys[k] = false;
    G.S.joy = null;
    vec();
  };
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

  /* ---------------- init ---------------- */
  /* the build's mark, worn where the title signs its name */
  {
    const stamp = document.getElementById('verStamp');
    if (stamp && window.OM_VERSION) stamp.textContent = 'BUILD ' + String(window.OM_VERSION).toUpperCase();
  }
  /* the wordmark pressed in letter by letter, like wet type */
  (function wrapLetters() {
    const w = document.querySelector('.title-word');
    if (!w) return;
    let i = 0;
    w.innerHTML = w.textContent.split('').map(ch =>
      (ch === ' ' || ch === '\u00A0')
        ? '<span class="tspace">&nbsp;</span>'
        : `<span class="tl" style="--i:${i++}">${ch}</span>`
    ).join('');
  })();
  UI.buildBrushes(G.getBrush());
  UI.muteVisual(SFX.muted);
  UI.setRunNo(G.getRuns() + 1);
  UI.setBest(G.getBest(), G.getEndlessBest());
  UI.setSheetContinue(G.getFurthest());
  /* the endless checkpoint door: open only to the era the ink has
     already turned on — never past the deepest wave walked */
  {
    const chip = document.getElementById('endlessCheckpoint');
    const eb = G.getEndlessBest();
    if (chip && eb >= CFG.endless.eraWaves) {
      const era = Math.floor((eb - 1) / CFG.endless.eraWaves);
      const sw2 = era * CFG.endless.eraWaves + 1;
      chip.dataset.startWave = sw2;
      chip.innerHTML = '⟳ THE ENDLESS — START AT WAVE ' + sw2 + ' · TURN ' + (era * 2 + 1) +
        ' · SCROLL ' + (era % AREAS.length + 1);
      chip.classList.remove('hidden');
    } else if (chip) chip.classList.add('hidden');
  }

  UI.setDailyChip(G.dailyState());                  /* today's sheet reads itself */
  /* Resume Google OAuth in Settings, preserving the previous board tab. */
  const oauthReturn = LB.consumeOAuthReturn();
  if (oauthReturn) {
    enterTitle();
    if (oauthReturn.from === 'board') LB.open('title', oauthReturn.tab);
    openSettings(oauthReturn.from);
    LB.initAuth().catch(() => {});
  } else if (G.S.reduced || introSeen()) {
    enterTitle();          /* the opening is a film — stillness and repeat visits go straight to the title */
  } else if (location.search.length > 1) {
    enterTitle();          /* a URL that asks questions is QA — the gate would hold the probes */
  } else {
    showIntroGate();       /* the first visit: one tap buys the film its whole voice */
  }

  /* QA: ?lbdebug=1 — the paper cloud, so the board can be E2E'd without a
     real ledger. Placed after the boot decision: the intro's enterTitle
     would otherwise cover the board the moment the opening ends. */
  try {
    if (new URLSearchParams(location.search).get('lbdebug') === '1') {
      const prevIntroEnd = INTRO.onEnd;
      INTRO.onEnd = () => { if (prevIntroEnd) prevIntroEnd(); LB.debugFill(); };
      if (G.mode !== 'intro') LB.debugFill();   /* no intro this boot — open at once */
    }
  } catch (e) {}

  /* ---------------- main loop ---------------- */
  let last = performance.now();
  let prevM = '';
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    const rawDt = dt;
    if (dt > 0.05) dt = 0.05;

    /* pacekeeping: a smoothed clock of how the frames truly land */
    if (rawDt > 0.0005) {
      const inst = 1 / rawDt;
      fpsBox.fps += (Math.min(inst, 240) - fpsBox.fps) * 0.05;
      fpsBox.ms += (rawDt * 1000 - fpsBox.ms) * 0.05;
    }
    if (ADAPT.on) {
      ADAPT.downCool -= rawDt; ADAPT.upHold += rawDt; ADAPT.grace -= rawDt;
      if (rawDt > 0.0005 && rawDt < 0.5) {
        /* struggle only counts while it lasts: the sag clock climbs
           while the pace is truly poor and decays twice as fast when
           the pace recovers — momentary hiccoughs never reach it */
        if (G.mode === 'playing') {
          if (fpsBox.fps < 46) ADAPT.sagT += rawDt;
          else if (fpsBox.fps > 55) ADAPT.sagT = Math.max(0, ADAPT.sagT - rawDt * 2);
        }
        if (ADAPT.downCool <= 0 && ADAPT.grace <= 0) {
          /* step down: sustained sag only, never below 75% */
          if (G.mode === 'playing' && ADAPT.sagT > 1.4 && ADAPT.scale > 0.75) {
            ADAPT.scale = Math.max(0.75, ADAPT.scale - 0.12);
            ADAPT.sagT = 0; ADAPT.downCool = 4; ADAPT.upHold = 0;
            resize();
          /* step up: quick and forgiving, any mode — a soft sheet
             should never outlive the struggle that earned it */
          } else if (fpsBox.fps > 57 && ADAPT.scale < 1 && ADAPT.upHold > 2.5) {
            ADAPT.scale = Math.min(1, ADAPT.scale + 0.12);
            ADAPT.downCool = 1.5; ADAPT.upHold = 0;
            resize();
          }
        }
      }
    }

    vec();
    /* hit-stop: the paper holds its breath on the heavy strokes */
    let gameDt = dt;
    if (G.S.hitstop > 0) {
      G.S.hitstop -= dt;
      gameDt = dt * 0.06;
    }
    const m = G.mode;
    if (m !== prevM) {
      prevM = m;
      setSkipPrompt(m === 'intro' || m === 'cutscene');   /* films can be left */
    }
    if (m === 'intro') INTRO.update(dt);
    else if (m === 'playing') {
      /* substep when a frame runs long: physics stays true to the
         stroke even if the sheet was shown at a humble pace */
      const steps = dt > 0.0251 ? 2 : 1;
      for (let i = 0; i < steps && G.mode === 'playing'; i++) G.update(gameDt / steps);
    }
    else if (m === 'dying') G.updateDying(dt);
    else if (m === 'cutscene') CUT.update(dt);
    else if (m === 'title' || m === 'over') G.updateIdle(dt);

    ctx.setTransform(G.S.dpr, 0, 0, G.S.dpr, 0, 0);
    if (m === 'intro') INTRO.draw(ctx, now / 1000);
    else {
      R.draw(ctx, now / 1000);
      if (m === 'cutscene') CUT.draw(ctx, now / 1000);
    }

    /* the pacekeeper's mark, bottom-left, quiet */
    if (fpsOn) {
      ctx.setTransform(G.S.dpr, 0, 0, G.S.dpr, 0, 0);
      let label = `${fpsBox.fps.toFixed(0)} FPS · ${fpsBox.ms.toFixed(1)} ms`;
      if (ADAPT.scale < 1) label += ` · ${(ADAPT.scale * 100) | 0}%`;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      const w = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15,13,11,0.62)';
      ctx.fillRect(8, G.S.H - 8 - 15, w + 12, 17);
      ctx.fillStyle = '#ede7d9';
      ctx.fillText(label, 14, G.S.H - 9);
    }
  }
  requestAnimationFrame(frame);
})();

/* ---------- PWA — the paper travels with the scribe ---------- */
/* Registers the service worker (relative path: honest wherever the
   game is hosted — root or a subpath on GitHub Pages). Silently does
   nothing on file:// or when the browser has no worker support. */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
