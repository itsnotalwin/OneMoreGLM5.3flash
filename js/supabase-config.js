'use strict';
/* ============================================================
   ONE MORE — the ink cloud's address (Supabase)

   The endless leaderboard lives on Supabase's free tier:
   a Postgres ledger, row-level security as the lock, and
   sign-the-page identity (anonymous sign-ins — the scribe
   picks their own mark, no account needed).

   To raise the cloud:

   1) Connected to existing Pinpoint project sffpyvxbgmhepftxoesy
   2) Existing v12 isolated om_scores, om_daily, om_weekly tables
      and RLS are already migrated; DO NOT run fresh-project SQL.
   3) Authentication → Sign In / Up → enable ANONYMOUS
      sign-ins → Save
   4) This is a PUBLIC publishable key; never commit service-role keys
   5) In shared Auth URL Configuration, allowlist this game's
      GitHub Pages address. Never overwrite Pinpoint's Site URL.

   Until the object below is filled, the leaderboard stays
   quietly offline — the game plays exactly as before.
   ============================================================ */

window.OM_SUPABASE = {
  url: 'https://sffpyvxbgmhepftxoesy.supabase.co',       /* shared Pinpoint project */
  anonKey: 'sb_publishable___dIulfnvx74SjfXuyFXZg_LPnlZv7I',   /* public publishable key, RLS secures data */
};
