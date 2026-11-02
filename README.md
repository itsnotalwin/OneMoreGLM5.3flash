# ONE MORE

> **Updating the repository manually?** Read [SUPABASE-RECOVERY.md](SUPABASE-RECOVERY.md) **before replacing files**. The preserved Supabase integration is on branch [`backup/supabase-integration-2026-11-02`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/supabase-integration-2026-11-02), and the [read-only Actions guard](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/workflows/supabase-integration-guard.yml) checks that core wiring survives new uploads. Google OAuth and Anonymous provider settings are external; the last observed Google Client Secret error still requires dashboard correction and retesting.

*An ink-born survival. No walls. No arena. One endless sheet of washi.*

**ONE MORE** is a zero-dependency, zero-build browser game written in vanilla
HTML/CSS/JS. You are a brush spirit walking an unbounded scroll of washi
paper — Vampire-Survivors style, the camera follows you and the paper never
ends. Your brush fires ink at the nearest threat on its own; your only job
is to *not be erased*.

The journey is **five scrolls of ten waves**, each sheet a different paper
with its own weather, each ruled by a **named Guardian**. Clear the fifth
sheet and the scroll offers itself forever: **THE ENDLESS SCROLL**, where
the paper cycles through all five faces and the difficulty never stops
compounding.

Every kill spills **ink motes** — gather them to fill the ink gauge and
*rise mid-battle*, Vampire-Survivors style. Kill in chains to multiply your
score. Guardians fall into chests. The paper remembers everything.

The whole game is painted like living sumi-e: every creature is a wobbling
blot of ink animated with hand-drawn line boil, every kill splatters real
ink that **permanently stains the paper** — the world slowly becomes a
painting of your fight. Wave banners are stamped in kanji. The one drop of
color belongs to the vermillion seal.

Every visit opens with **THE OPENING** — a short ink cinematic: a single
batch of ink falls through the void, bursts, and floods into a sheet of washi;
a brush cuts three strokes; the ink begins to move; and a vermilion seal
slams the first mark onto the paper. Press any key (or tap) to skip it,
or replay it anytime from the title screen — the button marked 序.

The loop closes like a film. **When a sheet is cleared the scroll literally
turns**: the next sheet of paper rolls in over the world, stamps its kanji,
its name and its temperament, and presses its red hanko before the first
wave crawls in. **Clear the fifth sheet and THE JOURNEY'S END plays** —
the ink stills, the five keepers are remembered, your brush spirit paints
one last great ensō around the run and seals it, and the credits roll
before the victory sheet offers the endless paper. Both films can be
skipped with any key or tap.

---

## The five scrolls

| Sheet | Paper & weather | The beasts that live there | Guardian |
|---|---|---|---|
| 一 FIRST WASH | Pale washi; drifting motes | BLOT, SPEAR, SPIT, POPPER, MOTH, DRIP, WISP, BRUTE | THE STAIN |
| 二 NIGHT SCROLL | Near-black paper; rising embers | WISP, SHADE, MOTH, KAGE, STILT, LOTUS, WARDEN, SPEAR | THE NIGHT MOTHER |
| 三 CINNABAR FIELD | Vermillion wash; falling petals | BRUTE, SPIT, ONI, CRANE, DRIP, TITAN, KAGE, GATE | THE CINNABAR ONI |
| 四 STORM SHEET | Storm-gray paper; driving rain and lightning | CRANE, SPEAR, KAGE, STILT, WISP, KOI, WARDEN, MOTH, POPPER | THE STORM EYE |
| 五 GILT SCROLL | Aged gold leaf; drifting flakes | ONI, BRUTE, GOLEM, GATE, SPIT, WARDEN, TITAN, KAGE, KOI | THE FIRST BRUSH |

Each sheet runs ten waves; the tenth summons its **Guardian** — a boss with
its own patterns, a named seal at the top of the screen, and a red arrow at
the rim when it waits beyond the eye. Slay it and it drops a **chest**, a
pot of fresh water, and a shower of ink. Waves 5 and 15 and 25 are
**SURGES** — denser, louder, meaner.

**The curve is built to bite.** Every sheet deep in the journey packs more
beasts per wave (the budget compounds per sheet), surges grow fiercer the
farther you travel, and every Guardian below a third of its ink **moves
like something cornered**. Survive the fifth sheet and the scroll turns
forever: each lap of THE ENDLESS SCROLL multiplies the beasts' ink, speed
and numbers again.

## How to play

| Input | Action |
|---|---|
| `W A S D` / Arrow keys | Move — the sheet is endless, walk anywhere |
| Auto-fire | Engaged — the brush always flicks at the nearest blot |
| Ink motes | Walk over the drops your kills spill to fill the gauge — a full gauge = a mid-wave level-up |
| `1` `2` `3` | Select an upgrade (press again, or `Enter`, to deploy) |
| Any key / tap | Skip the opening or any cutscene (scroll turn / finale) |
| `P` / `Esc` | Pause |
| `M` | Toggle sound |
| Touch | Drag anywhere for a virtual joystick |

**Choose your brush** before the run: THE NEEDLE (fast, light), THE BROOM
(twin droplets), or THE STONE (heavy and hard to kill). Your choice is
remembered.

**The twenty ink-born**

| Name | Behavior |
|---|---|
| BLOT | Slow, relentless drifter |
| SPEAR | Telegraphs, then lunges in a straight line |
| SPIT | Keeps its distance, inflates, and lobs ink globs back at you |
| POPPER | A fast bomb of ink — bursts into a ring of needles when it dies |
| MOTH | Erratic flicker — never holds a course, bursts in jolts |
| DRIP | Dies into two fast blips |
| SHADE | Dissolves into flecks, blinks at your back, pounces |
| BRUTE | Hatched, dripping bruiser. Slow. Very hard to kill |
| WISP | Weaves sideways as it closes in |
| KAGE | Circles you like a stain, then cuts straight through in a dash |
| LOTUS | Roots itself and sprays fans of ink at range |
| WARDEN | The herald — quickens every beast near it. Kill it first |
| STILT | A tall sniper — draws a hair-thin line at you, then fires a needle |
| TITAN | The mother of blots — sheds her brood as she bears down |
| ONI | Horned bruiser — winds up, then bulldozes straight ahead |
| CRANE | Folded paper that swoops past in long, fast arcs |
| GATE | Slow and shielded — frontal strikes are turned; flank it or drown it in ink |
| KOI | Swims in long sine curves and *dives beneath your strokes*, untouchable |
| GOLEM | A folded colossus that breaks into two brutes |
| BLIP | A fast shard, born from deaths and titans |

**The five Guardians**

| Guardian | Pattern |
|---|---|
| THE STAIN | A rolling sea of ink that swells and slams rings of globs |
| THE NIGHT MOTHER | Dissolves, blinks at your back, fans needles, sheds shades |
| THE CINNABAR ONI | Bulldozer charges and 7-glob spreads — enrages at half health |
| THE STORM EYE | Orbits you, drags you inward, spirals needles, calls lightning bolts |
| THE FIRST BRUSH | Three phases: radial volleys, summoned brood, furious charges |

**The brush arts — 26 upgrades**, including seven weapons:

- *Strokes*: Quick Hand, Bitter Ink, Twin Stroke, Through Mist, Flick,
  Fleeting Foot, Thick Ink, Red Seal, Ink Burst, Echo Stroke, Ink Orbit,
  Black Tide, Wet Paper, Crimson Tip, Paper Ward, **Ink Hunger** (gather
  radius), **Paper Mends** (the sheet heals itself), **Deep Well** (ink
  motes are worth more)
- *Weapons* (marked 武 in vermilion on their cards):
  **Folded Fan** — a snapping spray of paper blades;
  **Ink Trail** — the smears you leave behind keep biting;
  **Spirit Scribes** — lesser brushes that wake and hunt on their own;
  **Crimson Hanko** — a great red seal that slams down on the nearest horde;
  **Sumi Arc** — a live stroke that leaps from beast to beast like spilled
  lightning;
  **Returning Stroke** — a wide brushstroke that flies out and recalls
  itself, biting twice;
  **Ink Vortex** — a whirlpool of living ink that drags beasts in and
  drowns them.
- *Talismans found on the paper*: the **pot** (+1 integrity), the **墨
  talisman** (vacuums every mote), the **ink bomb** (splashes the whole
  sheet), and the Guardians' **chest** (a free stroke of your choice).

---

## Deploy to GitHub Pages

This repository currently uses GitHub's built-in **pages build and deployment** workflow for pushes to `main` (rather than a committed `.github/workflows/deploy.yml`). Check the Actions tab for the latest run before considering a new deployment live.

1. Create a new repository on GitHub (e.g. `one-more`).
2. Push this folder's contents to the `main` branch:

   ```bash
   git init
   git add -A
   git commit -m "ONE MORE — the scroll turns"
   git branch -M main
   git remote add origin https://github.com/<your-username>/one-more.git
   git push -u origin main
   ```

3. In the repository, go to **Settings → Pages** and set
   **Build and deployment → Source** to **GitHub Actions**.
4. That's it. The workflow runs on every push and publishes the game to:

   `https://<your-username>.github.io/one-more/`

You can also trigger a redeploy manually from the **Actions** tab via
**Run workflow** (the workflow has `workflow_dispatch` enabled).

> Note: the first deploy requires step 3. If the workflow fails with a
> "Pages not enabled" error, this is the setting you missed.

## Run locally

No build step. Any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

(Opening `index.html` directly from disk also works.)

## Install as an app (PWA) · 端

ONE MORE is a full PWA — installable and fully offline. Visit the site
in Chrome, Edge or Safari and choose **Install app** / **Add to Home
Screen**: the game opens standalone with no browser chrome, stamped
with its own hanko icon (brush ensō + vermillion 一 seal), and plays
entirely offline. The service worker (`sw.js`) precaches the shell and
every ink asset on first visit and sweeps images into a runtime cache
as they are first painted; page navigations fall back to the cached
shell when the network is gone. Updates land on the next visit after a
deploy — the versioned cache (`om-core-vX.Y`) is swapped silently in
the background. All paths are scope-relative, so it works identically
at a user-site root or a project subpath on GitHub Pages.

## The endless leaderboard (榜) on Supabase

The **ENDLESS LEADERBOARD** records the furthest wave every scribe has
carried the ink in **THE ENDLESS SCROLL**. It runs on **Supabase**'s free
tier: a Postgres ledger, row-level security as the lock, and
**sign-the-page identity** — anonymous sign-ins with a mark the scribe
picks, no account needed. Until it is connected the game plays exactly
as before — the ledger sits quietly offline.

**How it behaves when connected**

- Endless runs post automatically on death — but only if the run carried
  further than your best on this device (one page per scribe, no spam).
- Died without signing? The over sheet offers **SIGN THE PAGE — POST
  WAVE n**; type a mark (or leave it blank and ride as INK DRIFTER), and
  the pending run posts itself the moment the sign lands.
- Rank = the wave you reached; score breaks ties. Top three wear red
  hanko seals. Your own row is edged in vermillion.
- The journey's own deaths never post — the ledger belongs to the endless
  scroll alone (a journey victory that walks INTO THE ENDLESS posts from
  then on, carrying the whole run's depth).

**Current shared-backend setup (verified 2 November 2026)**

This variant is connected to the existing **Pinpoint** Supabase project `sffpyvxbgmhepftxoesy`, not a new project. Only the ONE MORE tables `public.om_scores` and `public.om_daily` were created (plus their indexes and RLS policies). The Pinpoint tables `public.scores` and `public.pinpoint_profiles` retain their own schemas, rows, and access policies.

- Migration: `20261102155646_onemore_glm_flash_isolated_leaderboards`; follow-up `onemore_daily_uid_foreign_key_index`.
- `js/supabase-config.js` contains the project URL and **public publishable key**. Never put a Supabase secret/service-role key in browser code.
- Database checks passed: simulated authenticated inserts and upserts to both game tables, denial of a different player's insert, and rollback of test rows.
- Pending real-browser check: **Authentication → Sign In / Up / Providers → Anonymous sign-ins** must be enabled; open LEADERBOARD, sign the page and submit an endless/daily run. Browser-hosted sign-in and posting have not yet been independently demonstrated.
- Google OAuth is now configured separately in the shared Supabase Auth project and its Google Cloud Web OAuth client; never expose the Google Client Secret. The game stores only a short-lived per-tab return intent before redirecting, and resumes the leaderboard (including the Daily tab) on the PKCE callback instead of replaying the opening. Verified in a local JavaScript callback-state harness; a live browser sign-in still needs confirmation.
- To test: open LEADERBOARD → OR USE GOOGLE → sign in → the app should **return directly to the leaderboard**, show the signed-in Google profile and retain the selected tab. A normal cold launch must still play the intro. Then play an Endless run and verify its score posts.
- This is not needed for anonymous score posting.
- This is a **shared Supabase project**: user authentication and project quotas are shared, even though the application tables and RLS are separate.
- **Google login troubleshooting (2 Nov 2026):** Supabase Auth logs confirm Google redirects work but external code exchange fails with `oauth2: invalid_client` / `The provided client secret is invalid`. In [Google Auth Platform](https://console.cloud.google.com/auth/clients), find the **Web application** OAuth Client ID and its corresponding Client Secret. Configure that exact pair in [shared Pinpoint project's Google provider](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy/auth/providers?provider=Google). Do not use a Supabase publishable key as a Google secret and never commit a secret. The callback URL remains `https://sffpyvxbgmhepftxoesy.supabase.co/auth/v1/callback`. Logs independently show that **anonymous sign-ins are disabled**, so enable Anonymous in this same Auth project if the game's `SIGN THE PAGE` login should work; Pinpoint also uses anonymous Auth. Browser `error_description` now yields an actionable message and failing error parameters are removed after capture, while successful PKCE `?code` remains for the SDK. Google sign-in remains unverified until the owner corrects credentials.
- PWA players should reload after the `v8.6-supabase-oauth-3` service-worker update so cached JavaScript refreshes. On an installed PWA, close and reopen it after the deploy, and refresh if it still shows the previous behavior.

**Fresh-project setup (only for a different Supabase project)**

1. Create a project at [supabase.com](https://supabase.com) — the free
   tier is plenty for a board of scribes.
2. **SQL Editor → New query** → paste the SQL below **→ Run**.
3. **Authentication → Sign In / Up → Anonymous sign-ins → Enable → Save.**
4. **Project Settings → API** → copy the **Project URL** and the **anon
   public key** into `js/supabase-config.js`.
5. **Authentication → URL Configuration → Site URL** — set it to your
   GitHub Pages address (`https://<your-username>.github.io/<repo>/`).

The free tier is generous (the anon key is rate-limited by a fair-use
quota, far beyond what a board of honest scribes spends); this ledger
costs a read when the board opens and a write only when a scribe beats
their own best.

**Reference bootstrap SQL (fresh empty database only):** The following is the original setup example, **not** the already-applied production migration. Do **not** re-run it inside the shared Pinpoint project: it attempts to recreate tables and policies. The actual shared-project migration uses explicit `anon`/`authenticated` grants and scoped `om_*` RLS policies with the same application data columns.

```sql
-- ONE MORE — the endless ledger (榜)

create table if not exists om_scores (
  uid   uuid primary key references auth.users(id) on delete cascade,
  name  text    not null default 'INK DRIFTER' check (char_length(name) between 1 and 24),
  wave  integer not null check (wave between 1 and 99999),
  score integer not null default 0 check (score between 0 and 999999999),
  kills integer not null default 0 check (kills between 0 and 999999),
  time  integer not null default 0 check (time >= 0),
  hard  boolean not null default false,
  v     integer not null default 1,
  ts    timestamptz not null default now()
);

create table if not exists om_daily (
  day   text    not null check (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  uid   uuid    not null references auth.users(id) on delete cascade,
  name  text    not null default 'INK DRIFTER' check (char_length(name) between 1 and 24),
  wave  integer not null check (wave between 1 and 99999),
  score integer not null default 0 check (score between 0 and 999999999),
  kills integer not null default 0 check (kills between 0 and 999999),
  hard  boolean not null default false,
  v     integer not null default 1,
  ts    timestamptz not null default now(),
  primary key (day, uid)
);

create index if not exists om_scores_wave_idx on om_scores (wave desc, score desc);
create index if not exists om_daily_day_idx  on om_daily (day, score desc);

alter table om_scores enable row level security;
alter table om_daily  enable row level security;

-- the world may read; only the signed scribe may raise their own page
create policy "the board is public" on om_scores
  for select using (true);
create policy "a scribe signs only their page" on om_scores
  for insert with check (auth.uid() = uid);
create policy "a scribe raises only their page" on om_scores
  for update using (auth.uid() = uid) with check (auth.uid() = uid);

create policy "the day is public" on om_daily
  for select using (true);
create policy "a scribe signs only their day" on om_daily
  for insert with check (auth.uid() = uid);
create policy "a scribe raises only their day" on om_daily
  for update using (auth.uid() = uid) with check (auth.uid() = uid);
```

> A client-only leaderboard can be poked by a determined hand — the
> SQL above caps the damage (sane ranges, one page per signed scribe,
> no deletes, RLS refusing every page but one's own). That is the
> right weight for a brush-and-paper arcade board.

**Optional: the Google door** — if you want cross-device identity too:
create an OAuth client at [console.cloud.google.com](https://console.cloud.google.com)
(Web application, authorized redirect `https://<your-project>.supabase.co/auth/v1/callback`),
then **Authentication → Sign In / Up → Google → enable** with that
client ID and secret. The board's quiet **OR USE GOOGLE** button comes
alive on its own — no further code.

## Project structure

```
one-more/
├── index.html                  # shell: canvas + all screens + ink wobble filters
├── css/
│   └── style.css               # the sumi-e design system
├── js/
│   ├── config.js               # tuning: areas, guardians, enemies, waves, xp, upgrades
│   ├── audio.js                # synthesized ink sound kit (splats, taiko, gong, thunder)
│   ├── ui.js                   # DOM screens, HUD, ink gauge, guardian seal, brush picker
│   ├── game.js                 # camera, areas, waves, xp/motes, guardians, weapons, flow
│   ├── render.js               # sumi-e renderer: five paper themes, weather, brush
│   │                           #   strokes, line boil, world-space stain layer
│   ├── cutscene.js             # the scroll-turn interludes & the journey's-end
│   │                           #   finale (credits, closing ensō) — skippable films
│   ├── intro.js                # THE OPENING — skippable ink cinematic before the title
│   ├── supabase-config.js      # the ink cloud's address (paste your Supabase URL + anon key)
│   ├── lb.js                   # the endless ledger: sign-the-page + Postgres board
│   └── main.js                 # bootstrap, input, hit-stop game loop, wiring
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Pages deployment
├── .nojekyll                   # serve files as-is, skip Jekyll
├── LICENSE
└── README.md
```

## Tuning the scrolls

All balance knobs live in `js/config.js`:

- `AREAS` — the five sheets: name, kanji, paper theme, difficulty multipliers,
  spawn roster and each sheet's Guardian
- `CFG.wave` — waves per sheet, spawn budgets, surge cadence, elite scaling
- `CFG.xp` — mote values, level curve, gathering radius, magnet duration
- `CFG.combo` — chain decay and the score-multiplier ceiling
- `CFG.brushes` — the three starting brushes and their stat mods
- `CFG.endless` — how fast the endless paper grows teeth after sheet five
- `ENEMIES` — hp, speed, size, score and the wave each type enters
- `UPGRADES` — the pool of strokes and weapons, and their level caps
- `CFG.world` — spawn padding, stain cap and fade, ambient mark density
- `CFG.ranks` — waves-cleared thresholds for the end-of-run seal

High score, run counter, brush choice and mute preference persist in
`localStorage` — no backend, no accounts, no tracking. GitHub Pages serves
static files only, and the game is 100% client-side by design.

### QA hooks (hidden)

For testing deep sheets, the Guardians and the ending without a full run:

- `?wave=N` — start a run at wave N (e.g. `?wave=50` drops you on the
  fifth Guardian; the wave after 50 triggers the finale)
- `&power=N` — seed a deep-run build of N upgrades (0–14)

Example: `index.html?wave=49&power=14`.

## Tech

- Vanilla JavaScript (ES6+), Canvas 2D, WebAudio API
- Opening cinematic rendered on the same canvas: animated drop physics,
  bleeding paper flood, progressive calligraphic strokes, rising beasts,
  a slamming seal — skippable, replayable, reduced-motion aware
- In-run cutscenes on the same ink engine: the scroll-turn interlude
  (rolling sheet edge, kanji stamp, hanko) and the journey's-end finale
  (stilling, the five keepers, the closing ensō, credits roll)
- Procedural brush rendering: tapered strokes, wobbling blobs, splatter
  stamps, dry-brush streaks, line-boil animation — no image assets
- Unbounded world: camera-follow, rectangle-accurate off-screen spawning,
  sprite-cached world-space stains, hash-grid ambient paper marks
- Per-sheet weather: motes, embers, petals, driving rain with lightning
  flashes, drifting gold leaf
- Vampire-Survivors loop: kill-dropped XP motes, mid-wave level-ups,
  chain-kill score multiplier, hit-stop on heavy kills
- Zero dependencies, zero build step, zero telemetry
- Full PWA: web manifest + service worker — installable, offline-capable,
  versioned cache, hanko icon set (192/512 any + maskable, apple-touch, favicon)
- Fonts: Zen Antique, IBM Plex Mono (Google Fonts CDN, with system
  fallbacks if offline)

## License

MIT — see [LICENSE](./LICENSE).
