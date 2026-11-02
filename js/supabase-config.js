'use strict';
/* ============================================================
   ONE MORE — the ink cloud's address (Supabase)

   The endless leaderboard lives on Supabase's free tier:
   a Postgres ledger, row-level security as the lock, and
   sign-the-page identity (anonymous sign-ins — the scribe
   picks their own mark, no account needed).

   To raise the cloud:

   1) https://supabase.com → New project (free tier is plenty)
   2) SQL Editor → New query → paste the SQL from README.md
      → Run (three tables: om_scores, om_daily, om_weekly)
   3) Authentication → Sign In / Up → enable ANONYMOUS
      sign-ins → Save
   4) Project Settings → API → copy the Project URL and the
      anon public key into the object below
   5) Authentication → URL Configuration → Site URL → your
      GitHub Pages address

   Until the object below is filled, the leaderboard stays
   quietly offline — the game plays exactly as before.
   ============================================================ */

window.OM_SUPABASE = {
  url: '',       /* e.g. 'https://your-project.supabase.co' */
  anonKey: '',   /* the anon public key — safe to ship, RLS is the lock */
};
