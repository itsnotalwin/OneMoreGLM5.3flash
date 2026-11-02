'use strict';
/* ============================================================
   ONE MORE — the ink cloud's address (Supabase)

   The endless leaderboard lives on Supabase's free tier:
   a Postgres ledger, row-level security as the lock, and
   sign-the-page identity (anonymous sign-ins — the scribe
   picks their own mark, no account needed).

   To raise the cloud:

   1) Shared Pinpoint project sffpyvxbgmhepftxoesy; do NOT create a new project
   2) The isolated om_scores, om_daily, om_weekly tables and RLS
      already exist via migrations. Do NOT rerun fresh-project SQL.
   3) Authentication → Sign In / Up → enable ANONYMOUS
      sign-ins → Save
   4) The browser key below is PUBLIC; never commit Supabase secret keys
   5) Authentication → URL Configuration → Site URL → your
      GitHub Pages address

   Until the object below is filled, the leaderboard stays
   quietly offline — the game plays exactly as before.
   ============================================================ */

window.OM_SUPABASE = {
  url: 'https://sffpyvxbgmhepftxoesy.supabase.co',       /* e.g. 'https://your-project.supabase.co' */
  anonKey: 'sb_publishable___dIulfnvx74SjfXuyFXZg_LPnlZv7I',   /* the anon public key — safe to ship, RLS is the lock */
};
