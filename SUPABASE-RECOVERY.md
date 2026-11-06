# ONE MORE GLM 5.3 Flash — Supabase integration recovery

> **Read this before manually replacing or uploading game files.** This is the canonical *source-repository recovery runbook*. A separate short BRAIN project record links here instead of duplicating the implementation. Last verified recovery update: **2026-11-06**. Source v12 restoration tested and committed; full real-browser OAuth still needs confirmation. This repo is **not** `itsnotalwin/ONE_MORE`.

## v19 uploads and one-branch safe recovery (6 November 2026)

Two owner uploads [`a4460592`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/a4460592b68cbfe8ba24500ae0ef58f6794f1225) and [`e71106c1`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/e71106c14d1b35315be13d2ffa45cd64e6e892ce) introduced new v19 gameplay, themed Settings and One Brush, One Blade. They also overwrote Supabase public config, Google OAuth/callbacks, cloud-save script tag and cache asset. An older full-file recovery would have lost new v19 Settings/theme code; the existing fail-closed planner rejected that unsafe update. We repaired the current v19 files by **only** replacing confirmed byte-identical broken config/lobby sources with validated good files, **additively** inserting OAuth/board return and local wipe safety hooks into `js/main.js`, restoring a single `js/cloud-save.js` script tag, and bumping PWA cache to `v19.0-cloud-1` while retaining all new assets. The source integration guard, cloud-save tests and repair tests passed; Pages was redeployed. These are code/CI checks, **not** proof of a real OAuth or cross-device progression test.

**One branch policy:** only `main` remains. Three bot-created orphan branches were preserved as Git tags at identical commit SHAs and deleted via an exact-SHA one-time cleanup; that workflow was subsequently removed. Due to GitHub Actions PR permission denial and owner preference for a single branch, the active [repair workflow](.github/workflows/supabase-auto-repair.yml) now creates **a review-only `one-more-integration-repair-patch` Actions artifact**, never a branch, PR or merge. An existing source guard failure runs the planner against latest `main`, and if the proposed diff is safe it publishes the patch; unknown partial auth changes abort. [Recovery planner](.github/supabase-auto-repair.cjs) has strict unique-anchor additive support for v19+ `main.js` so new Settings/game code is preserved, plus a v19 fixture test that rejects unknown layouts. To apply, review the patch, then make a separate owner-approved SHA-guarded commit onto `main`. This replaces the historical 3 November draft-PR behavior described later in this runbook.

## Cross-device Google progress saving (4 November 2026)

**Root cause:** The existing Google OAuth/leaderboards in `js/lb.js` use private Supabase identities, but progression `om_*` keys were entirely in browser `localStorage`; same email on PC and phone could not transfer unlocks. **No existing player data was destroyed.** The source snapshot before the feature is [`backup/pre-cloud-saves-2026-11-04`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/pre-cloud-saves-2026-11-04).

**Migration:** Existing shared Pinpoint project `sffpyvxbgmhepftxoesy` now has ONLY ONE NEW separate table `public.om_player_saves` with one account-owned snapshot per Google UID; see [`CLOUD-SAVE-SCHEMA.sql`](CLOUD-SAVE-SCHEMA.sql). It uses owner-only `select/insert/update` RLS, `anon` explicitly lacks grants, no delete grant, a monotonically increasing revision checked by a trigger, and the last 8 prior server snapshots preserved before updates. A rolled-back authenticated impersonation test confirmed own write/history plus denial of another user's read/update. Pinpoint's `scores` and `pinpoint_profiles`, and the ONE MORE leaderboard tables, remain untouched.

**How to migrate safely:** On the PC with the best existing progress, open Settings → CLOUD SAVE → **BACK UP THIS DEVICE** (export a JSON device backup first if desired). Only then sign in with the **same Google account** on the phone. If it is truly blank, cloud progress restores and the title reloads automatically. If it has its own run progress, the bridge presents both summaries and requires an explicit **USE CLOUD SAVE** or **KEEP THIS DEVICE** choice; it backs up the local save before overwriting and the server retains previous cloud versions. After link, changed local `om_*` progression is checked about every 14 seconds and on returning online/focusing the page. Conditional revision updates prevent a stale device from silently replacing a newer cloud save. If both devices changed since their common revision, syncing pauses in a conflict state instead of merging consumable ink/charms incorrectly. No live match/currency merge is attempted.

**Wipe/limits:** Gameplay and Inkstone remain local-first/offline. Settings WIPE marks that local progress was intentionally cleared and **does not delete cloud data**; the next Settings visit asks whether to restore or deliberately replace it. The source bridge reads only whitelisted progress keys; no tokens, emails, identities, OAuth code or ghost recordings are saved in its JSON. Save payloads exceeding ~110 KB are rejected without wiping local data. Before every restore a separate durable local backup key `__omcloud_local_backup_v1_...` is written (or restore aborts if storage is full). Exporting a device JSON backup from Settings is available. The source module never reads/writes Pinpoint game scores.

**Manual upload rule:** Preserve `js/cloud-save.js` plus the `js/lb.js` `cloudAccess()`/auth notification and `js/main.js` `beforeLocalWipe()` integration, the `index.html` script after `lb.js`, and the `sw.js` cache asset. The source guard checks these; the draft-only auto-repair now pins a good source including cloud hooks and may insert only the missing cloud script/cache asset if safe. **No auto-merging to main.** Test via [`cloud-save-check.yml`](.github/workflows/cloud-save-check.yml) and `node .github/cloud-save.test.cjs`.

**Proof boundary:** DB security and mock PC/phone + rollback tests are verified; real Google login, live Cloud Save upload and cross-device restore must still be tested on the owner's actual PC and phone.

## Automated draft recovery PR for repeat manual uploads (3 November 2026)

**Implemented and source self-tested:** [`.github/supabase-auto-repair.cjs`](.github/supabase-auto-repair.cjs) + [`supabase-auto-repair.yml`](.github/workflows/supabase-auto-repair.yml) minimize recurring Supabase/Google login breakage **without automatically changing `main`**. On each `main` push the workflow runs read-only simulation tests; once the existing integration guard finishes **failed** after a main push, a separate workflow examines the latest `main` source and may propose a **DRAFT review pull request**.

The recovery engine pins:
- Verified working integrated source commit `365697c8dde79e6fe1a6edeea1e5cf289229564c`.
- Known broken manual-upload source commit `8def891bc3adccb2c4018f84f5618fbfcd22bbfe`.
- **Exact-byte matching required** before replacing any missing integration file. Unknown or refactored `js/supabase-config.js`, `js/lb.js`, or `js/main.js` is deliberately **rejected with a failed workflow**, not silently replaced.
- Only `js/supabase-config.js`, `js/lb.js`, `js/main.js` and the **current `sw.js` version string** may be proposed. All newer gameplay, other scripts, HTML, CSS, art, PWA cached asset lists, shared Supabase project and existing Pinpoint scores remain untouched.
- It verifies JavaScript syntax, script load order, PWA cache paths, narrow file scope and seven read-only failure/normal/novel-source scenarios before proposing. The PR is created on a separate `automation/supabase-repair-<base-SHA>` branch **without force pushing or merging `main`**. Review the diff before marking it ready and merging.

**Setup prerequisite:** GitHub repository **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** must be enabled by the owner; otherwise draft PR creation can fail even though the read-only self-tests pass. The workflow requests write permissions only for the separate draft-PR job. This GitHub setting has **not yet been confirmed** through the connected tools. A live failing-upload-to-draft-PR run has **not yet occurred**; do not confuse tested simulation with proven PR creation. No personal access token or privileged Supabase key is required. Live real-browser OAuth and score posting remain separately unverified.



- **Exact owner-upload backup:** [`backup/v18-1-manual-upload-2026-11-03`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v18-1-manual-upload-2026-11-03), verified pinned to [`8def891b`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/8def891bc3adccb2c4018f84f5618fbfcd22bbfe). Keep the v18.1 game/HTML/Inkstone/config changes. The prior `backup/v18-manual-upload-2026-11-03` remains a separate older snapshot.
- Latest manual upload passed Pages but failed the integration guard because it blanked `js/supabase-config.js` and removed Google PKCE callback/Settings restoration from `js/lb.js` and `js/main.js`. **All three source files exactly matched earlier, already-diagnosed broken v18 source blobs.** The previously validated versions from `365697c8` were restored with SHA-protected updates, and the Supabase **public** publishable key was matched against the current shared project. No privileged key or database change was involved.
- **Surgical source commits:** [config `45b6a936`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/45b6a936a1e1d9824c5b647a0a4ad73b54444b66), [OAuth `54d199dc`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/54d199dc9e030b8c0dfd71b7f8ac45766c8eb203), [Settings return `21683149`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/21683149c94c6e949407964f00d96e8b51c67c63), [PWA cache `a2eef379`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/a2eef3793229de0e5e968079a4aa657d7c286a81) (`v18.1-supabase-1`).
- **Verified:** 20/20 targeted callback, startup, source syntax and integration tests passed; only four integration/cache files changed compared with the unmodified manual upload. [Source guard passed](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41723992591), [Pages passed](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41723995312) at `a2eef379`. Shared Pinpoint project remains healthy; all three `om_*` tables have RLS, public read and authenticated write permissions; Pinpoint data untouched. Google-linked account last signed in at 2026-11-03 20:08 UTC **before** this update. End-to-end Google sign-in and score posting on v18.1 still need an owner browser test.
- **For the next manual upload:** preserve the new owner's files first. Compare against current `main` and the v18.1 backup, selectively restore Supabase public config + `LB.consumeOAuthReturn`/`LB.initAuth` + boot routing, then bump the new cache version. Avoid copying older gameplay or running schema SQL.

## v18 manual-upload recovery (3 November 2026, 23:07 SAST)

**Source snapshot protected:** [`backup/v18-manual-upload-2026-11-03`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v18-manual-upload-2026-11-03) is the owner's exact new [`e4f63bda`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/e4f63bda480a1c199900c77b8dfeb58ed8938e53) upload, containing the sixth scroll/silk and 60-scene gameplay/rendering additions. **Do not replace these new assets or game logic with older versions.**

The upload unintentionally reverted the *same three* integration files to their exact pre-recovery v16 source hashes: `js/supabase-config.js` was blank; `js/lb.js` and `js/main.js` lacked Google OAuth callback restoration. The source guard correctly failed even though the game deployed.

**Recovery:** Verified all three broken files matched the older pre-fix baseline byte-for-byte, then restored only the previously tested versions from [last good integrated v16 commit `b24d194c`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/b24d194c18f0d7d234a6c19ad096c97d48a4eb27), using current file SHAs. The public Supabase publishable key was independently matched against currently active Pinpoint project keys; no secrets were placed in Git. Commits:
- [`1ccf9d15`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/1ccf9d15eadb9e4755054ad8d6b770181c4d9bfb): Supabase URL/publishable config.
- [`915e0367`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/915e0367845f0580f2c85f0de421a603e5a7494b): OAuth state tracking, error feedback, Google Settings return and pending post handling.
- [`96cc637c`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/96cc637c9a7f25a55639fe914d00ed97f6c55c27): resume Settings/board on PKCE return without replaying intro.
- [`d6110553`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/d61105532803ceaac86a894b568b1ec21f0a14ef): service-worker cache `v18-supabase-1`, retaining new v18 assets.

**Verified:** only these **four files** changed versus the owner upload; all six-scroll gameplay, art, render, audio, UI and CSS are untouched. 20/20 isolated JavaScript/OAuth/state/syntax tests passed. [GitHub source guard](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41719264286) and [GitHub Pages deploy](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/runs/41719264297) both passed at commit `d6110553`. Existing Supabase project `sffpyvxbgmhepftxoesy` ACTIVE_HEALTHY, isolated `om_scores`/`om_daily`/`om_weekly` tables, RLS and per-role privileges unchanged; no database migration performed. Supabase recorded Google sign-in on **3 Nov 2026 20:08:11 UTC** (before the 21:06 UTC v18 upload); this supports recent Google provider functionality but does **not** establish browser Google sign-in or live score posting on repaired v18. Require an owner device sign-in and post test to confirm.

**Next agent:** treat this v18 integration snapshot as the current recovery baseline. Compare new pushes against current `main` and the v18 upload branch; preserve the newest feature changes. A green code guard cannot attest to live OAuth. Never run fresh-project SQL or alter Pinpoint's tables just to recover a blank frontend config.

## Latest v16 manual upload recovery (3 November 2026)

**Latest owner's unmodified source snapshot:** [`backup/v16-manual-upload-2026-11-03`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v16-manual-upload-2026-11-03), pinned to commit [`94267ab9`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/94267ab9d0789f0f7f65dcf2e62f0a1fae68bea1). The previous v12 and initial integration backup branches remain independent. Two owner uploads, [`5f9b7c0`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/5f9b7c0a6faf31ef064da771b28511107da6d51c) and [`94267ab9`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/94267ab9d0789f0f7f65dcf2e62f0a1fae68bea1), introduced substantial v16 presentation/gameplay improvements but removed the shared project's public URL/key and Google OAuth return handling. The source guard correctly failed on both while Pages still deployed.

**Surgical changes on current main, not a rollback:**
- `js/supabase-config.js` restored the exact **active, public publishable** key from the shared Pinpoint Supabase project `sffpyvxbgmhepftxoesy` and its URL; no secrets added.
- `js/lb.js` restores the short-lived `om_lb_google_return_v1` marker and PKCE callback/error recognition, including Daily/Weekly/All-Time tabs, and preserves v16's **Google sign-in through Settings** with optional anonymous sign-in, named player identity and queued score posting. Exported `LB.consumeOAuthReturn()` and `LB.initAuth()` ensure session exchange runs after redirect and the account UI refreshes. The display error is cleaned from the URL without deleting a successful `?code`.
- `js/main.js` restores the callback to the **Settings account screen**, not the older v12 Google button on the leaderboard. When sign-in originated at a leaderboard, the background board and tab are prepared so **Back** returns correctly. Ordinary v16 first-tap audio/intro gate, once-per-session opening and gameplay initialization are unchanged.
- `sw.js` cache advanced to `v16-supabase-1`, retaining the new Inkstone/charm and other current PWA assets.
- **18/18 local isolated JavaScript/source checks passed** (including PKCE code retention, failed URL cleanup, Daily/Weekly return tabs, normal intro gate, pending posts, v16 systems and syntax). Source checks are *not* a hosted real-user login demonstration.

**Backend verified read-only after upload:** Pinpoint is `ACTIVE_HEALTHY`; `om_scores`, `om_daily`, and `om_weekly` still exist with RLS on, three policies each, public SELECT only and authenticated write grants. Pinpoint scores and profiles were not modified. Supabase auth has one Google-linked account with last recorded sign-in **2 Nov 2026 18:36:11 UTC**, but **no Google-linked login on 3 Nov** at verification time. Other HTTP 200 Auth events are not sufficient to prove Google sign-in in v16. Previous `invalid_client` and Anonymous-disabled errors were on 2 Nov; don't claim they describe today's settings without a new test.

**For the NEXT manual upload:** start from the new v16 source, diff it against main and this v16 backup, preserve the latest gameplay/Settings UI, merge only auth/config/PWA sections, run guard and browser login tests. Never blindly substitute older v12 `main.js` or `lb.js`, and never rerun fresh project SQL.

## Preserved source snapshot

- **Original integration backup branch:** [`backup/supabase-integration-2026-11-02`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/supabase-integration-2026-11-02).
- **Original untouched v12 manual-upload backup:** [`backup/v12-manual-upload-2026-11-03`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/tree/backup/v12-manual-upload-2026-11-03) at [`fb908350`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/fb9083507e81f69fbf092f626f8ba0b70bff8d7d); retain it for preserving the new Inkstone, charms, history, Guardians' Hall, weekly ledger, ghost replay and balancing changes. It is **not** the integrated backend state; the fixes are selectively merged on `main`.
- **Verified branch commit:** [`2e844ba957e3e8dcfb4dd4da33eb21357be46abe`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/2e844ba957e3e8dcfb4dd4da33eb21357be46abe).
- **Live game:** https://itsnotalwin.github.io/OneMoreGLM5.3flash/
- The backup captures a working *source/deployment and database integration baseline*, **not** proof that Google OAuth or anonymous login completed successfully in a real browser. See blockers below.
- The backup branch is a normal Git branch, not write-protected. Do not delete, force-push or reuse it for active game development.

## Files and behaviors that MUST survive a manual update

| File | Keep / merge this integration behavior |
| --- | --- |
| `js/supabase-config.js` | `window.OM_SUPABASE` with project URL `https://sffpyvxbgmhepftxoesy.supabase.co` and the project's **public** `sb_publishable_...` API key. **Never** use or commit secret/service-role credentials. |
| `js/lb.js` | Supabase v2 SDK; `signInAnonymously()`, optional Google OAuth with PKCE; **v12** leaderboard reads/upserts through `om_scores`, `om_daily`, **and `om_weekly`**, plus optional `ghost` and `has_ghost` replay data. |
| `js/lb.js` | Before Google redirect, store short-lived `om_lb_google_return_v1` intent in **sessionStorage** (active board tab **all/day/week** + timestamp only). `LB.consumeOAuthReturn()` recognizes this marker or `?code`/error URL, preserves successful PKCE `?code`, restores the prior tab, and clears *failed* OAuth error parameters after capture. It displays an actionable token-exchange error. |
| `js/main.js` | At startup call `LB.consumeOAuthReturn()` **before** the usual opening decision. On callback call `enterTitle(); LB.open('title', oauthReturn.tab)`; otherwise preserve normal introduction, game controls and `?lbdebug=1`. |
| `index.html` | Load `js/supabase-config.js` **before** `js/lb.js`, and `js/lb.js` **before** `js/main.js`. Retain the leaderboard/auth DOM elements and buttons. |
| `sw.js` | Precache JS, the new v12 Inkstone page/CSS and charm/inkstone scripts; bump `VER` whenever cached code or config changes. Restored v12 snapshot uses `v12.0-supabase-1`; do not regress to v8 or omit new assets. |
| `README.md`, `PROJECT.md`, `AGENTS.md`, `js/CONTEXT.md` | Keep architecture/setup instructions, build rules and this recovery reference. |
| `.github/workflows/supabase-integration-guard.yml` | Keep the read-only integration guard: it detects future source uploads that drop key Supabase/OAuth wiring. It does **not** prevent a push to an unprotected branch or validate remote OAuth credentials. |

**Do not copy the entire old `js/main.js` or `js/lb.js` over newer versions without review:** doing so might discard later gameplay/UI improvements. Merge the integration sections, review the diff, and run the guard.

## Shared Supabase backend: preserve the separation

**Project:** [Pinpoint, ID `sffpyvxbgmhepftxoesy`](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy) (Europe West 1). Both games share the **Supabase project Auth service and quotas**, but NOT their gameplay tables.

- ONE MORE tables: `public.om_scores` (one score per `auth.users` UID), `public.om_daily` (one score per day and UID), and v12 `public.om_weekly` (one score per ISO week and UID). All have owner-only writes; `ghost` and `has_ghost` columns support replay recording for each table.
- Pinpoint tables, **do not modify for this project**: `public.scores` and `public.pinpoint_profiles`.
- Installed Supabase migrations: `20261102155646_onemore_glm_flash_isolated_leaderboards`, `onemore_daily_uid_foreign_key_index`, `onemore_v12_weekly_ghost_leaderboards`, and `onemore_v12_weekly_restrict_public_grants`. The v12 migrations add two ghost columns per existing table and the independent RLS-protected weekly table (including indexes/role grants); no Pinpoint table migrations. Inspect `Database → Migrations` before applying anything.
- All three ONE MORE tables have **RLS on**. `anon` can SELECT only; `authenticated` can SELECT/INSERT/UPDATE, with `auth.uid() = uid` restrictions on writes. No direct DELETE to either. This was checked with owner insert/upsert and cross-owner rejection in rolled-back test transactions. Both game tables were empty after those tests (not a guarantee of present-day row counts).
- **Do not re-run the README's fresh-project SQL on an already configured shared project.** Never change `auth.users`, Pinpoint functions, or Pinpoint RLS policies to repair a ONE MORE front-end update.

## Auth dashboard configuration cannot be restored from Git

These are **external settings** you must preserve independently across manual source updates:

1. [Supabase Google provider](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy/auth/providers?provider=Google): **Google enabled**, using the Client ID and **matching Client Secret** of a real Google Cloud **Web application** OAuth client. Secrets live in provider settings, never in Git.
2. [Google Auth Platform OAuth clients](https://console.cloud.google.com/auth/clients): callback URI `https://sffpyvxbgmhepftxoesy.supabase.co/auth/v1/callback`, with `https://itsnotalwin.github.io` as a web origin if applicable.
3. [Supabase Redirect URLs](https://supabase.com/dashboard/project/sffpyvxbgmhepftxoesy/auth/url-configuration): **allowlist** `https://itsnotalwin.github.io/OneMoreGLM5.3flash/`. **Do not replace Pinpoint's own Site URL**; add ONE MORE as an additional redirect.
4. Enable **Anonymous sign-ins** if players should use ONE MORE's `SIGN THE PAGE` option. This is a shared project setting and may also affect Pinpoint.

### Last *observed* blockers (do not present as resolved without retesting)

- **Google OAuth:** Supabase Auth logs 2026-11-02 ~17:39–17:51 UTC showed `oauth2: "invalid_client" "The provided client secret is invalid."` and `Unable to exchange external code`. Google authorization/redirect was reaching Supabase, but the **Google Client Secret** in the Supabase Google provider needed correction. Changing JavaScript, URL encoding, or leaderboard RLS does not resolve a bad external client secret.
- **Anonymous sign-ins:** Auth logs at ~17:50–17:51 UTC showed HTTP 422 `anonymous_provider_disabled`. Toggle Anonymous sign-ins in the shared project's Authentication provider settings.
- A real browser end-to-end **signed-in Google session, anonymous session and leaderboard post** has **not** been independently verified at this checkpoint. Never infer success from GitHub Pages build or SQL-only tests.

## Safe manual upgrade workflow

1. **Preserve this backup branch.** Upload/new-code changes should target `main` or a **new** development branch, not the backup.
2. Preserve the untouched v12 backup **and** the older integration backup. When updating locally, `git pull --ff-only origin main` first. Bring in new game changes as a feature branch/commit when possible. When using GitHub's **Upload files** UI, review every filename being replaced and keep the files listed above or merge their Supabase/OAuth code into replacements.
3. Review integration differences **before** the upload/merge:
   ```bash
   git fetch origin backup/supabase-integration-2026-11-02 backup/v12-manual-upload-2026-11-03
   git diff origin/backup/supabase-integration-2026-11-02..HEAD -- \
     js/supabase-config.js js/lb.js js/main.js index.html sw.js
   ```
4. If a file was accidentally overwritten, compare against `backup/supabase-integration-2026-11-02` in GitHub, then **selectively merge** the missing blocks. A full `git restore --source origin/backup/supabase-integration-2026-11-02 -- <file>` **replaces the whole current file** and could discard newer features; use it only after reviewing the consequences.
5. Bump `sw.js` `VER` for cached code changes, retaining the v12 Inkstone/charm assets. On the deployed PWA, do a hard refresh or close/reopen the installed app after the new service worker activates.
6. Check the [Supabase integration guard in GitHub Actions](https://github.com/itsnotalwin/OneMoreGLM5.3flash/actions/workflows/supabase-integration-guard.yml). It now checks v12 weekly/ghost/charms/Inkstone wiring as well. A green guard confirms **source wiring only**.
7. Manually verify: normal cold start still shows opening; Google login returns directly to the leaderboard and shows the signed-in player; Daily tab survives return; anonymous `SIGN THE PAGE` works; Endless and Daily run posts reach their separate Supabase tables; page refresh preserves identity and no stale OAuth query remains. Then check Pages deployment and browser console/network errors.

## Key source changes (for review/cherry-picking)

- [`842c037`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/842c0375ea6539f714c54725bb0d079a88c1c7ae): connect **public** Supabase config.
- [`36511c3`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/36511c31bd57115c186bb8c0fe023d328000fb36): OAuth return intent, PKCE callback recognition and tab restoration logic.
- [`232f5e4`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/232f5e49ee2d954708a53cc25800d6a62955622f): skip the opening/reopen leaderboard on OAuth return.
- [`7c0d191`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/7c0d191e5c7ee2d11f6c88575162a0660ba2040e): clearer Google token-exchange errors and removal of stale error callback URL parameters, preserving success `?code`.
- [`cbc86d5`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/cbc86d5de9638f0f6b1266e2210cd416cb63b667): PWA cache refresh to `v8.6-supabase-oauth-3`.
- [`fb908350`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/fb9083507e81f69fbf092f626f8ba0b70bff8d7d): untouched v12 game upload, preserved on dedicated backup branch.
- [`7449a90`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/7449a90ecad08aa89bbbcf72464088eea06d6131): restored current Pinpoint public key/config **without overwriting v12**.
- [`3e1a844`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/3e1a844b1329b6ecfa8f5b293604732deadc7632): restored Google return/error handling into the **v12 weekly/ghost** ledger.
- [`e00da16`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/e00da1612700d9cb58e67393c66957534d98a24c): resumes correct v12 tab after OAuth without resetting the opening behavior.
- [`0701f4d`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/0701f4d21aece4d7e58be52c848444e8624e8fbe): PWA cache `v12.0-supabase-1`.
- [`ac0e795`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/ac0e79501d49d6ee36b36f43cb0118fb8400bfbf): extend guard for v12 weekly, ghost, Inkstone and charms.
- [`2e844ba`](https://github.com/itsnotalwin/OneMoreGLM5.3flash/commit/2e844ba957e3e8dcfb4dd4da33eb21357be46abe): older integration-backup snapshot. Also see the repository's commit history for intermediate setup/docs.

**Future agent handoff:** First inspect this runbook and `PROJECT.md`, then current `main` and the backup branch. Confirm what changed before editing. The only verified backend requirement is shared Pinpoint with isolated `om_*` tables; the Google secret and Anonymous Auth status require fresh verification whenever OAuth behavior changes. Never treat old Auth errors as necessarily current.
