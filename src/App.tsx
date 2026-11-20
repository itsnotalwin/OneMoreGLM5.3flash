import { useEffect } from 'react';
import { bootOneMore } from './engine/boot';

export function App() {
  useEffect(() => {
    bootOneMore();
    /* the door's painted panel is drawn by the engine's own ink */
    let n = 0;
    const paint = () => {
      const cv = document.getElementById('gateWash') as HTMLCanvasElement | null;
      const I = (window as unknown as { INTRO?: { paintGate?: (c: HTMLCanvasElement) => void } }).INTRO;
      if (cv && I?.paintGate) { I.paintGate(cv); return; }
      if (n++ < 24) requestAnimationFrame(paint);
    };
    const id = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      {/* hand-wobble filter: gives every ink border a brushed edge */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="inkrough" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves={3} seed={7} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={4.5} />
          </filter>
          <filter id="inkrough-soft" x="-8%" y="-8%" width="116%" height="116%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves={2} seed={12} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={2.6} />
          </filter>
        </defs>
      </svg>

      <div id="stage">
        <canvas id="game" />

        {/* ============ IN-RUN HUD ============ */}
        <div id="hud" className="hidden">
          <div className="hud-tl">
            <div className="wave-chip">
              <span className="wave-kanji" id="hudWave">1</span>
            </div>
            <div className="hud-wave-meta">
              <div className="hud-area" id="hudArea">
                <span className="hud-area-kanji" id="hudAreaKanji">一</span>
                <span className="hud-area-name" id="hudAreaName">FIRST WASH</span>
                <span className="hud-area-count" id="hudWaveTotal">SCENE 1 · 1/10</span>
              </div>
              <div className="wave-progress">
                <div className="wave-fill" id="waveFill" />
              </div>
            </div>
            <span className="hud-mode" id="hudMode">THE JOURNEY</span>
            <span className="hud-hard hidden" id="hudHard" title="REALLY HARD — the ink bites back" aria-hidden="true">難</span>
            <span className="hud-hard hud-auto hidden" id="hudAuto" title="THE AUTOBRUSH walks — its runs pay half" aria-hidden="true">自</span>
          </div>

          <div className="hud-tr">
            <div className="hp-row" id="hudHp" />
            <div className="hud-score" id="hudScore">0000000</div>
            <div className="combo-chip hidden" id="hudCombo" />
          </div>

          <div className="hud-bl">
            <div className="hud-loadout" id="hudLoadout" />
            <div className="hud-foot">
              <span className="hud-ink">
                <span className="hud-ink-k" aria-hidden="true">墨</span>
                <span className="hud-ink-n" id="hudInkLv">1</span>
              </span>
              <span className="hud-time" id="hudTime">00:00</span>
            </div>
          </div>

          <div className="boss-bar hidden" id="hudBoss">
            <span className="boss-kicker" id="hudBossKick">GUARDIAN</span>
            <span className="boss-name" id="hudBossName">THE STAIN</span>
            <div className="boss-track">
              <div className="boss-lag" id="hudBossLag" />
              <div className="boss-fill" id="hudBossFill" />
            </div>
          </div>

          <div className="hud-br">
            <button
              id="dashBtn"
              type="button"
              className="dash-seal-btn"
              aria-label="Ink Step dash"
              title="INK STEP (Space / Shift) — dissolve through threats; graze cleanly for a MIKIRI seal"
            >
              <span className="ds-k" aria-hidden="true">瞬</span>
              <span className="ds-ring" aria-hidden="true" />
              <span className="ds-label" aria-hidden="true">SPACE</span>
            </button>
            <button
              id="pauseBtn"
              type="button"
              className="icon-btn"
              aria-label="Pause run"
              title="Rest (P / Esc)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="6.5" y="5" width="3.4" height="14" rx="0.6" />
                <rect x="14.1" y="5" width="3.4" height="14" rx="0.6" />
              </svg>
            </button>
            <button
              id="muteBtn"
              type="button"
              className="icon-btn"
              aria-label="Toggle sound"
              title="Toggle sound (M)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
                <path d="M15.5 8.6a4.8 4.8 0 0 1 0 6.8" />
                <path d="M18.2 6a8.6 8.6 0 0 1 0 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ============ WAVE BANNER ============ */}
        <div id="waveBanner" className="wave-banner" aria-hidden="true">
          <div className="banner-core">
            <svg className="banner-stroke" viewBox="0 0 420 64" aria-hidden="true">
              <path d="M14 36 C 92 20, 214 15, 406 27 C 302 40, 152 47, 42 44 C 27 43.3, 17 40, 14 36 Z" fill="currentColor" />
              <circle cx={404} cy={29} r={2.6} fill="currentColor" />
            </svg>
            <span className="banner-kicker" id="bannerKicker">INCOMING</span>
            <span className="banner-title" id="bannerTitle">
              <span className="ban-kanji">一</span>
              <span className="ban-lat">WAVE 01</span>
            </span>
            <span className="banner-sub" id="bannerSub" aria-hidden="true" />
          </div>
        </div>

        {/* screen-reader twin of painted banners */}
        <span id="bannerLive" className="sr-only" aria-live="polite" />

        {/* ============ TITLE SCREEN ============ */}
        <section id="screenTitle" className="screen screen-title">
          <div id="toneWash" aria-hidden="true" />
          {/* a painted stage: the red sun low over two ridges of ink */}
          <div className="title-atmos" aria-hidden="true">
            <span className="ta-sun" />
            <span className="ta-haze" />
            <svg className="ta-ridge ta-r1" viewBox="0 0 1440 460" preserveAspectRatio="none">
              <path d="M0 300 C 150 232 250 258 330 236 C 430 208 470 150 560 168 C 660 188 700 262 800 268 C 900 274 960 196 1060 190 C 1160 184 1230 262 1310 276 C 1360 285 1400 272 1440 258 L1440 460 L0 460 Z" />
            </svg>
            <svg className="ta-ridge ta-r2" viewBox="0 0 1440 420" preserveAspectRatio="none">
              <path d="M0 330 C 120 300 210 322 300 300 C 400 276 470 216 570 226 C 690 238 720 314 830 318 C 940 322 990 244 1100 250 C 1200 256 1260 318 1440 336 L1440 420 L0 420 Z" />
            </svg>
            <span className="ta-grain" />
          </div>

          {/* the great brush circle, painted live by the scribe each visit */}
          <div className="enso-wrap" id="ensoWrap" aria-hidden="true">
            <canvas id="ensoBake" className="enso-bake" />
            <canvas id="ensoFront" className="enso-front" />
          </div>

          <aside className="side-ins side-r" aria-hidden="true">
            <span className="ins-col">一筆入魂</span>
            <span className="ins-seal">一</span>
          </aside>
          <aside className="side-ins side-l" aria-hidden="true">
            <span className="ins-seal ins-seal-ghost">墨</span>
            <span className="ins-col ins-col-pale">六巻六十景</span>
          </aside>

          <div className="title-shell">
            {/* ---- the hero: the name and the two ways in ---- */}
            <div className="title-hero">
              <div className="title-chip">
                <span className="kanji-inline" lang="zh">墨</span>A&nbsp;MONOCHROME&nbsp;SURVIVAL
              </div>
              <h1 className="title-word">ONE&nbsp;MORE</h1>
              <p className="title-sub">
                <span className="ts-en">One brush. Six scrolls. The paper never ends.</span>
                <span className="ts-jp" aria-hidden="true">一筆・六巻・終わらない紙</span>
              </p>

              <div className="mode-row">
                <button
                  id="playBtn"
                  type="button"
                  className="play-btn"
                  title="THE JOURNEY — straight onto the wet frontier. The SCENES door picks a sheet by hand."
                >
                  <span className="play-seal" id="playSeal" aria-hidden="true">一</span>
                  <span className="play-copy">
                    <span className="play-label">THE JOURNEY</span>
                    <span className="play-run" id="runNo">RUN 001</span>
                  </span>
                  <span className="play-arrow" aria-hidden="true">→</span>
                </button>
                <button
                  id="endlessBtn"
                  type="button"
                  className="endless-btn"
                  title="Endless waves across turning sheets — your build never resets"
                >
                  <span className="endless-kanji" aria-hidden="true">無</span>
                  <span className="play-copy">
                    <span className="play-label">THE ENDLESS SCROLL</span>
                    <span className="play-run">THE BUILD ENDURES</span>
                  </span>
                  <span className="endless-best" id="endlessBest" aria-hidden="true" />
                </button>
              </div>

              <button
                id="brushBtn"
                className="brush-entry"
                type="button"
                title="STARTER BRUSH — the tool this run begins with. Tap to open the shelf and choose."
                aria-haspopup="dialog"
                aria-controls="screenBrush"
              >
                <span className="be-kanji" id="brushBtnKanji" aria-hidden="true">細</span>
                <span className="be-copy">
                  <span className="be-kicker">STARTER BRUSH</span>
                  <span className="be-name" id="brushBtnName">THE NEEDLE</span>
                </span>
                <canvas className="be-tool" id="brushBtnTool" data-tool="needle" aria-hidden="true" />
                <span className="be-open" aria-hidden="true">▾</span>
              </button>

              <button id="endlessCheckpoint" className="checkpoint-btn hidden" type="button" />
              <p className="journey-line" id="journeyLine" aria-live="polite">
                RESUME — SCROLL 一 · SCENE 01 · WAVE 01
              </p>

              <div className="minor-row">
                <button id="boardBtn" className="board-btn" style={{ ['--i' as string]: 0 } as React.CSSProperties} type="button" title="THE ENDLESS LEDGER — who carried the ink furthest">
                  <span className="board-kanji" aria-hidden="true">榜</span>
                  <span className="minor-copy"><b>LEDGER</b><i>THE ENDLESS HALL</i></span>
                </button>
                <button id="dailyBtn" className="board-btn daily-btn" style={{ ['--i' as string]: 1 } as React.CSSProperties} type="button" title="DAILY INK — one seeded sheet a day, the same paper for every scribe.">
                  <span className="board-kanji" aria-hidden="true">日</span>
                  <span className="minor-copy"><b>DAILY</b><i id="dailyLabel">· TODAY</i></span>
                </button>
                <button id="charmBtn" className="board-btn charm-btn" style={{ ['--i' as string]: 2 } as React.CSSProperties} type="button" title="CHARMS — what the runs press out buys permanent power">
                  <span className="board-kanji" aria-hidden="true">符</span>
                  <span className="minor-copy"><b>CHARMS</b><i>THE PURSE</i></span>
                  <i className="charm-dot" aria-hidden="true" />
                  <span className="chip-count hidden" id="charmInk" aria-live="polite" title="Ink held by the purse" />
                </button>
                <button id="codexBtn" className="board-btn codex-btn" style={{ ['--i' as string]: 3 } as React.CSSProperties} type="button" title="THE COMPENDIUM (C) — Confluences, illustrated beasts, Guardians and the chronicle">
                  <span className="board-kanji" aria-hidden="true">図</span>
                  <span className="minor-copy"><b>CODEX</b><i>THE COMPENDIUM</i></span>
                </button>
              </div>

              <button id="sheetBtn" className="sheet-btn hidden" type="button" title="SCENES — the shelf of scrolls" />
              <p className="best-line hidden" id="bestLine" />
              <p className="title-help">
                <span className="hint-key">ENTER TO WALK · C FOR THE COMPENDIUM · P TO REST</span>
                <span className="hint-touch">TAP A DOOR TO BEGIN</span>
              </p>
            </div>

            {/* ---- the rail: the living scribe and the paper's records ---- */}
            <aside className="title-rail">
              <div className="rail-card rail-stage">
                <span className="rail-kicker"><i aria-hidden="true">筆</i>THE HAND IN THE INK</span>
                <canvas className="rail-fig" id="titleScribeFig" data-fig="needle" aria-hidden="true" />
                <span className="rail-sun" aria-hidden="true" />
                <span className="rail-name" id="titleScribeName">THE NEEDLE · 細</span>
                <span className="rail-note">THE TOOL SHAPES THE SCRIBE</span>
              </div>
              <div className="rail-card rail-records">
                <span className="rail-kicker"><i aria-hidden="true">録</i>THE PAPER REMEMBERS</span>
                <div className="title-meta" id="titleMeta" aria-label="Journey records">
                  <span className="tm-item"><b id="tmSeals">0</b><i>SCENES SEALED</i></span>
                  <span className="tm-item"><b id="tmRuns">0</b><i>RUNS PRESSED</i></span>
                  <span className="tm-item"><b id="tmEndless">—</b><i>DEEPEST ENDLESS</i></span>
                  <span className="tm-item"><b id="tmCharms">0</b><i>CHARM RANKS</i></span>
                </div>
              </div>
            </aside>
          </div>

          <div className="title-foot">
            <span className="foot-stamp" id="verStamp">BUILD —</span>
            <span className="foot-credit">A MONOCHROME SURVIVAL · SIXTY SCENES · SIX GUARDIANS</span>
          </div>

          <button
            id="settingsBtn"
            className="opening-btn settings-btn"
            type="button"
            title="Settings — the scribe's mark, sound, ghost rival, REALLY HARD, and the sheet's ink"
          >
            <span className="opening-kanji" aria-hidden="true">設</span>
            <span className="opening-label">SETTINGS</span>
          </button>
          <button id="openingBtn" className="opening-btn" type="button" title="Watch the opening again">
            <span className="opening-kanji" aria-hidden="true">序</span>
            <span className="opening-label">OPENING</span>
          </button>
        </section>

        {/* ============ THE SHELF OF SCROLLS ============ */}
        <section id="screenScrolls" className="screen screen-scrolls hidden">
          <div id="shelfWash" aria-hidden="true" />
          <span className="wm wm-scrolls" aria-hidden="true">巻</span>
          <div className="scrolls-head">
            <div className="scrolls-kicker">THE JOURNEY — SIX SCROLLS · SIXTY SCENES</div>
            <h2 className="scrolls-title">SIX SCROLLS</h2>
            <p className="scrolls-sub">Ten scenes of ten waves each. Fell a scroll&apos;s Guardian and the next unrolls.</p>
          </div>
          <div className="scroll-beam" aria-hidden="true" />
          <div className="scroll-strip-row" id="scrollRow" />
          <div className="scroll-strip-row hidden" id="levelRow" />
          <div className="scrolls-foot">
            <p className="scrolls-hint" id="scrollsHint" hidden />
            <button id="scrollsBackBtn" type="button" className="ghost-btn">RETURN</button>
          </div>
        </section>

        {/* ============ UPGRADE SCREEN ============ */}
        <section id="screenUpgrade" className="screen screen-upgrade hidden">
          <span className="wm wm-up" aria-hidden="true">選</span>
          <div className="panel">
            <div className="panel-banner">
              <div className="pb-left">
                <span className="pb-kicker" id="upKicker">WAVE 01 — CLEARED</span>
                <span className="pb-title">CHOOSE ONE MORE</span>
              </div>
              <div className="pb-right">
                <span className="pb-step-label">NEXT</span>
                <span className="pb-step-value" id="upNext">2</span>
              </div>
            </div>
            <p className="panel-notice hidden" id="upNotice" aria-live="polite" />
            <div className="upgrade-grid" id="upgradeGrid" />
            <div className="upgrade-tools">
              <button
                id="rerollBtn"
                className="tool-ink-btn"
                type="button"
                title="GRIND FRESH INK (R) — spend a fresh grind to deal three new picks"
              >
                <span className="tk-kanji" aria-hidden="true">研</span>
                <span>GRIND<span className="tk-key">&nbsp;(R)</span></span>
                <span className="tk-count" id="rerollCount">1</span>
              </button>
              <button
                id="banishBtn"
                className="tool-ink-btn"
                type="button"
                disabled
                title="BLOT OUT (X) — select a card, then blot it from the rest of this run"
              >
                <span className="tk-kanji" aria-hidden="true">消</span>
                <span>BLOT<span className="tk-key">&nbsp;(X)</span></span>
                <span className="tk-count" id="banishCount">1</span>
              </button>
              <button
                id="autoBtn"
                className="auto-btn"
                type="button"
                title="THE WALKER CHOOSES — intelligently picks Confluences, Arts and powers until a card is tapped"
              >
                <span className="ab-kanji" aria-hidden="true">任</span>
                <span className="ab-label">AUTO — LET THE HAND CHOOSE</span>
              </button>
            </div>
            <button id="deployBtn" type="button" className="deploy-btn is-disabled" disabled>DEPLOY</button>
            <div className="panel-hint">
              <span className="hint-key">PRESS 1 · 2 · 3 TO SELECT — ENTER TO DEPLOY · R GRINDS · X BLOTS</span>
              <span className="hint-touch">TAP A CARD TO CHOOSE — TAP AGAIN TO CONTINUE</span>
            </div>
          </div>
        </section>

        {/* ============ LEVEL CLEAR POPUP ============ */}
        <section id="screenClear" className="screen screen-clear hidden">
          <span className="wm wm-clear" aria-hidden="true">了</span>
          <div className="clear-box">
            <div className="clear-seal" aria-hidden="true">了</div>
            <div className="clear-kicker" id="clearKicker">THE SEAL BREAKS</div>
            <h2 className="clear-title" id="clearTitle">SCENE 1 — SEALED</h2>
            <p className="clear-sub" id="clearSub">The scene is pressed into the paper. The next begins unadorned.</p>
            <div className="clear-next" id="clearNextLine">
              <span className="cn-label">NEXT</span>
              <span className="cn-value" id="clearNextValue">SCENE 2</span>
            </div>
            <div className="clear-actions">
              <button id="clearNextBtn" type="button" className="block-btn big">NEXT SCENE</button>
              <button id="clearHomeBtn" type="button" className="ghost-btn">HOME</button>
            </div>
            <div className="clear-hint">THE NEXT SCENE BEGINS UNADORNED — ENTER TO CONTINUE</div>
          </div>
        </section>

        {/* ============ THE ENDLESS LEDGER ============ */}
        <section id="screenBoard" className="screen screen-board hidden">
          <span className="wm wm-board" aria-hidden="true">榜</span>
          <div className="board-wrap">
            <div className="board-head">
              <div className="board-kicker">THE ENDLESS SCROLL — <span className="kanji-inline">無</span></div>
              <h2 className="board-title">ENDLESS LEADERBOARD</h2>
              <p className="board-sub">HOW FAR THE BRUSH HAS CARRIED THE INK</p>
              <div className="board-tabs" role="tablist">
                <button id="boardTabAll" className="board-tab is-on" type="button" role="tab" aria-selected="true">ALL-TIME</button>
                <button id="boardTabDay" className="board-tab" type="button" role="tab" aria-selected="false">
                  DAILY — <span id="boardDayLabel">TODAY</span>
                </button>
                <button id="boardTabWeek" className="board-tab" type="button" role="tab" aria-selected="false">WEEKLY</button>
                <button id="boardTabLocal" className="board-tab" type="button" role="tab" aria-selected="false">THIS PAPER</button>
              </div>
            </div>
            <div className="board-auth" id="boardAuth" />
            <div className="board-cols" aria-hidden="true">
              <span>№</span><span /><span>SCRIBE</span><span>WAVE</span><span>SCORE</span><span className="col-echo">ECHO</span>
            </div>
            <ol className="board-rows" id="boardRows" />
            <div className="board-foot">
              <span className="board-mine" id="boardMine" />
              <button id="boardBackBtn" type="button" className="ghost-btn">RETURN</button>
            </div>
          </div>
        </section>

        {/* ============ PAUSE SCREEN ============ */}
        <section id="screenPause" className="screen screen-pause hidden">
          <span className="wm wm-pause" aria-hidden="true">休</span>
          <div className="pause-box">
            <canvas className="pause-fig" id="pauseFig" data-fig="needle" aria-hidden="true" />
            <div className="pause-chip">REST</div>
            <p className="pause-note">The ink waits. For now.</p>
            <div className="pause-meta" id="pauseMeta" />
            <div className="pause-build" id="pauseBuild" />
            <div className="pause-actions">
              <button id="resumeBtn" type="button" className="block-btn">RESUME</button>
              <button id="pauseRetryBtn" type="button" className="ghost-btn">RETRY THIS SCENE</button>
              <button id="pauseCodexBtn" type="button" className="ghost-btn">VIEW IN THE CODEX</button>
              <button id="pauseMenuBtn" type="button" className="ghost-btn">ABANDON</button>
            </div>
            <p className="pause-keys">WASD MOVE · SPACE INK STEP (瞬) · M SOUND · F FPS</p>
          </div>
        </section>

        {/* ============ GAME OVER SCREEN ============ */}
        <section id="screenOver" className="screen screen-over hidden">
          <span className="wm wm-over" aria-hidden="true">終</span>
          <div className="over-panel">
            <canvas className="over-fig" id="overFig" data-fig="needle" aria-hidden="true" />
            <div className="best-badge hidden" id="newBestBadge">NEW BEST</div>
            <p className="over-kicker" id="overKicker">RUN 001 — THE INK CLAIMS ANOTHER</p>
            <h2 className="over-title" id="overTitle">THE INK DRIES.</h2>
            <p className="over-sub" id="overSub">The paper keeps every stroke. Even this one.</p>
            <div className="over-body">
              <div className="rank-block">
                <div className="rank-value" id="overRank">D</div>
                <span className="rank-label">SEAL</span>
              </div>
              <div className="over-stats">
                <div className="stat-row"><span className="stat-check" aria-hidden="true" /><span className="stat-name">WAVES SURVIVED</span><span className="stat-dots" /><span className="stat-value" id="statWaves">0</span></div>
                <div className="stat-row"><span className="stat-check" aria-hidden="true" /><span className="stat-name">BLOTS CLEANED</span><span className="stat-dots" /><span className="stat-value" id="statKills">0</span></div>
                <div className="stat-row hidden" id="chainStatRow"><span className="stat-check" aria-hidden="true" /><span className="stat-name">LONGEST CHAIN</span><span className="stat-dots" /><span className="stat-value" id="statChain">0</span></div>
                <div className="stat-row hidden" id="mikiriStatRow"><span className="stat-check" aria-hidden="true" /><span className="stat-name">MIKIRI SEALS (切)</span><span className="stat-dots" /><span className="stat-value" id="statMikiri">0</span></div>
                <div className="stat-row"><span className="stat-check" aria-hidden="true" /><span className="stat-name">TIME IN ARENA</span><span className="stat-dots" /><span className="stat-value" id="statTime">00:00</span></div>
                <div className="stat-row"><span className="stat-check" aria-hidden="true" /><span className="stat-name">FINAL SCORE</span><span className="stat-dots" /><span className="stat-value" id="statScore">0</span></div>
                <div className="stat-row hidden" id="inkStatRow"><span className="stat-check" aria-hidden="true" /><span className="stat-name">PRESSED INTO THE PURSE</span><span className="stat-dots" /><span className="stat-value" id="statInk">+0</span></div>
              </div>
            </div>
            <div className="over-build hidden" id="overBuild" aria-label="Strokes carried this run" />
            <div className="ghost-line hidden" id="ghostLine" aria-live="polite" />
            <p className="over-goal" id="overGoal" aria-live="polite" />
            <div className="over-actions">
              <button id="continueBtn" type="button" className="block-btn big continue hidden">INTO THE ENDLESS — 無</button>
              <button id="againBtn" type="button" className="block-btn big">ONE MORE</button>
              <button id="shareBtn" type="button" className="ghost-btn" title="Press this run's report into a paper card">SHARE THE INK</button>
              <button id="overCodexBtn" type="button" className="ghost-btn">THE COMPENDIUM — 図</button>
              <button id="menuBtn" type="button" className="ghost-btn">MENU</button>
            </div>
            <div className="over-board hidden" id="overBoard" />
          </div>
        </section>

        {/* ============ THE ARMOURY — 筆 — a stage and a rack ============ */}
        <section id="screenBrush" className="screen screen-brush hidden">
          <span className="wm wm-brush" aria-hidden="true">筆</span>
          <div className="set-wrap armory">
            <div className="set-head">
              <div className="set-kicker">THE FIRST STROKE — <span className="kanji-inline">筆</span></div>
              <h2 className="set-title">STARTER BRUSH</h2>
              <p className="set-sub">ONE BRUSH, ONE BLADE — EACH DRESSES ITS SCRIBE AND CARRIES ITS OWN ARTS</p>
              <p className="brush-room-hint" id="brushRoomHint" aria-live="polite" />
            </div>
            <div className="armory-body">
              <div className="armory-stage" id="armoryStage">
                <span className="armory-ring" aria-hidden="true" />
                <canvas className="armory-fig" id="armoryFig" aria-hidden="true" />
                <canvas className="armory-tool" id="armoryTool" aria-hidden="true" />
                <div className="armory-plate">
                  <span className="ap-kanji" id="apKanji" aria-hidden="true">細</span>
                  <div className="ap-copy">
                    <span className="ap-name" id="apName">THE NEEDLE</span>
                    <span className="ap-kind" id="apKind" />
                  </div>
                  <span className="ap-state" id="apState">印 IN HAND</span>
                </div>
                <p className="ap-desc" id="apDesc" />
                <div className="ap-stats" id="apStats" />
                <div className="ap-arts" id="apArts" />
              </div>
              <div className="brush-rows" id="brushRows" role="listbox" aria-label="The eight brushes" />
            </div>
            <button id="brushBackBtn" className="set-back" type="button">戻 — BACK TO THE TITLE</button>
          </div>
        </section>

        {/* ============ SETTINGS — 設 ============ */}
        <section id="screenSettings" className="screen screen-settings hidden">
          <span className="wm wm-settings" aria-hidden="true">設</span>
          <div className="set-wrap">
            <div className="set-head">
              <div className="set-kicker">THE STUDY — <span className="kanji-inline">設</span></div>
              <h2 className="set-title">SETTINGS</h2>
              <p className="set-sub">THE SCRIBE&apos;S MARK AND THE SHEET&apos;S SMALL TRUTHS</p>
            </div>
            <div className="set-rows">
              <div className="room-kicker"><span className="kanji-inline" aria-hidden="true">印</span>THE SCRIBE&apos;S MARK</div>
              <div className="account-rows" id="accountRows" aria-live="polite" />
              <div className="room-kicker room-kicker-2"><span className="kanji-inline" aria-hidden="true">設</span>THE PAPER&apos;S HABITS</div>
              <button id="setSound" className="set-row" type="button">
                <span className="set-kanji" aria-hidden="true">音</span>
                <span className="set-name">SOUND</span>
                <span className="set-desc">THE BRUSH&apos;S VOICE, THE SEALS, THE TIDE</span>
                <span className="set-state" id="setSoundState">ON</span>
              </button>
              <button id="setVol" className="set-row" type="button">
                <span className="set-kanji" aria-hidden="true">響</span>
                <span className="set-name">VOICE WEIGHT</span>
                <span className="set-desc">STEP THE MASTER VOLUME — 100% · 70% · 40% · 20%</span>
                <span className="set-state" id="setVolState">100%</span>
              </button>
              <button id="setGhost" className="set-row" type="button">
                <span className="set-kanji" aria-hidden="true">影</span>
                <span className="set-name">THE GHOST RIVAL</span>
                <span className="set-desc">YOUR BEST RUN WALKS BESIDE THE LIVING BRUSH</span>
                <span className="set-state" id="setGhostState">ON</span>
              </button>
              <button id="setAuto" className="set-row hidden" type="button" title="THE AUTOBRUSH — the second scroll's gift. The brush walks itself; its runs pay half.">
                <span className="set-kanji" aria-hidden="true">自</span>
                <span className="set-name">THE AUTOBRUSH</span>
                <span className="set-desc">THE BRUSH WALKS ITSELF — YOU CHOOSE THE STROKES · ITS RUNS PRESS HALF THE INK AND HALF THE SCORE</span>
                <span className="set-state" id="setAutoState">OFF</span>
              </button>
              <button id="setHard" className="set-row" type="button">
                <span className="set-kanji" aria-hidden="true">難</span>
                <span className="set-name">REALLY HARD</span>
                <span className="set-desc">EVERY BEAST TALLER, FASTER, THICKER — THE LEDGER PAYS DOUBLE</span>
                <span className="set-state" id="setHardState">OFF</span>
              </button>
              <button id="setTheme" className="set-row" type="button">
                <span className="set-kanji" aria-hidden="true">墨</span>
                <span className="set-name">THE SHEET&apos;S INK</span>
                <span className="set-desc">THE TITLE WEARS A SCROLL&apos;S INK — AUTO FOLLOWS YOUR FARTHEST SCROLL</span>
                <span className="set-state" id="setThemeState">AUTO</span>
              </button>
              <button id="setCalm" className="set-row" type="button" title="CALM THE PAPER — still the camera, the rain and the heavy weather. The film becomes a quiet scroll.">
                <span className="set-kanji" aria-hidden="true">静</span>
                <span className="set-name">CALM THE PAPER</span>
                <span className="set-desc">STILL THE CAMERA, THE WEATHER AND THE SHAKE — THE FILM BECOMES A QUIET SCROLL</span>
                <span className="set-state" id="setCalmState">OFF</span>
              </button>
              <button id="setWipe" className="set-row set-danger" type="button">
                <span className="set-kanji" aria-hidden="true">墨</span>
                <span className="set-name">WIPE THE PAPER</span>
                <span className="set-desc">EVERY SCROLL, SEAL, RECORD AND GHOST — GONE</span>
                <span className="set-state" id="setWipeState">WIPE</span>
              </button>
            </div>
            <button id="setBackBtn" className="set-back" type="button">戻 — BACK TO THE TITLE</button>
          </div>
        </section>

        {/* ============ CHARMS — 符 ============ */}
        <section id="screenCharms" className="screen screen-charms hidden">
          <span className="wm wm-charms" aria-hidden="true">符</span>
          <div className="set-wrap">
            <div className="set-head">
              <div className="set-kicker">THE CHARM ROOM — <span className="kanji-inline">符</span></div>
              <h2 className="set-title">CHARMS</h2>
              <p className="set-sub">WHAT THE RUNS PRESS OUT, THE PAPER KEEPS</p>
              <p className="charm-purse">
                <span className="purse-kanji" aria-hidden="true">符</span> INK <b id="charmPurse">0</b>
                <span className="charm-worn" id="charmWorn">0 WORN</span>
              </p>
            </div>
            <div className="set-rows" id="charmRows" />
            <button id="charmBackBtn" className="set-back" type="button">戻 — BACK TO THE TITLE</button>
          </div>
        </section>

        {/* ============ THE COMPENDIUM — 図 (v23) ============ */}
        <section id="screenCodex" className="screen screen-codex hidden">
          <span className="wm wm-codex" aria-hidden="true">図</span>
          <div className="set-wrap codex-wrap">
            <div className="set-head">
              <div className="set-kicker">THE ILLUSTRATED STUDY — <span className="kanji-inline">図</span></div>
              <h2 className="set-title">COMPENDIUM</h2>
              <p className="set-sub">EVERY UNION WOKEN, EVERY BLOT MET, EVERY SEAL BROKEN</p>
              <div className="codex-summary" id="codexSummary" />
              <div className="board-tabs codex-tabs" role="tablist">
                <button id="codexTab_conf" className="board-tab is-on" type="button" role="tab" aria-selected="true">合 CONFLUENCES</button>
                <button id="codexTab_beasts" className="board-tab" type="button" role="tab" aria-selected="false">獣 INK-BORN</button>
                <button id="codexTab_bosses" className="board-tab" type="button" role="tab" aria-selected="false">守 SEALS</button>
                <button id="codexTab_chronicle" className="board-tab" type="button" role="tab" aria-selected="false">録 CHRONICLE</button>
              </div>
            </div>
            <div className="codex-body" id="codexBody" />
            <button id="codexBackBtn" className="set-back" type="button">戻 — BACK TO THE TITLE</button>
          </div>
        </section>

        <div id="flash" aria-hidden="true" />
        <div id="pageWipe" className="page-wipe" aria-hidden="true" />

        {/* ============ THE DOOR — a painted first frame, then the film ============ */}
        <div id="introGate" className="intro-gate hidden" role="button" tabIndex={0} aria-label="Tap to begin — the opening plays with sound">
          <canvas className="gate-wash" id="gateWash" aria-hidden="true" />
          <span className="gate-sun" aria-hidden="true" />
          <span className="gate-grid" aria-hidden="true" />
          <svg className="gate-ring" viewBox="0 0 300 300" aria-hidden="true">
            <path className="gate-ring-echo" d="M150 24 C 79 22, 24 78, 22 150 C 20 224, 80 276, 154 275 C 226 274, 277 219, 276 148 C 275 76, 229 33, 172 28" />
            <path className="gate-ring-ink" d="M150 24 C 78 22, 22 77, 22 149 C 20 225, 81 276, 155 275 C 227 274, 277 218, 276 147 C 275 75, 229 32, 172 28" />
          </svg>
          <div className="gate-frame" aria-hidden="true">
            <i className="gf-tl" /><i className="gf-tr" /><i className="gf-bl" /><i className="gf-br" />
          </div>

          <div className="gate-core">
            <span className="gate-kicker"><span className="kanji-inline" aria-hidden="true">墨</span>AN INK-BORN SURVIVAL</span>
            <div className="gate-brand">
              <span className="gate-word">ONE<br />MORE</span>
              <span className="gate-vertical" aria-hidden="true">一筆入魂</span>
            </div>
            <span className="gate-sub">ONE BRUSH · SIX SCROLLS · THE PAPER NEVER ENDS</span>
            <div className="gate-divider" aria-hidden="true"><i /><b>◆</b><i /></div>
            <span className="gate-cue">
              <span className="gate-cue-ink" aria-hidden="true">墨</span>
              <span className="gate-tap">TAP TO BEGIN</span>
              <span className="gate-arrow" aria-hidden="true">→</span>
            </span>
            <span className="gate-note hint-key">THE OPENING PLAYS WITH SOUND — SKIP IT ANY TIME</span>
            <span className="gate-note hint-touch">THE OPENING PLAYS WITH SOUND</span>
            <span className="gate-feats" aria-hidden="true">
              <span><b>六巻</b>SIXTY SCENES</span><i />
              <span><b>八筆</b>EIGHT BRUSHES</span><i />
              <span><b>無</b>ENDLESS</span>
            </span>
          </div>

          <span className="gate-corner gc-l" aria-hidden="true">六巻六十景</span>
          <span className="gate-corner gc-r" aria-hidden="true">一筆入魂</span>
          <span className="gate-foot" aria-hidden="true">BUILD V25.0 · YOUR PAPER STAYS YOURS · NO ACCOUNTS REQUIRED</span>
        </div>

        {/* ============ v23.1 FIRST-RUN COACHING — the new verbs, taught in order ============ */}
        <div id="runCoach" className="run-coach hidden" aria-hidden="true" />

        {/* ============ FIRST-RUN WHISPER ============ */}
        <div id="runHint" className="run-hint hidden" aria-hidden="true">
          <span className="rh-touch">DRAG TO MOVE · 瞬 INK STEP</span>
          <span className="rh-key">WASD MOVE · SPACE INK STEP (瞬)</span>
          <span className="rh-tail">AUTO-FIRE · GRAZE TO MIKIRI · HOLD 硯 INKSTONES</span>
        </div>

        {/* ============ OPENING / CUTSCENE SKIP ============ */}
        <div id="introSkip" className="intro-skip hidden" role="button" tabIndex={-1} aria-label="Skip the opening">
          <span className="skip-key">PRESS ANY KEY —</span>
          <span className="skip-tap">TAP —</span>
          <span>SKIP</span>
          <span className="skip-arrow" aria-hidden="true">▸</span>
        </div>
      </div>
    </>
  );
}

export default App;
