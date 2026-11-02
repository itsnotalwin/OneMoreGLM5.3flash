'use strict';
/* ============================================================
   ONE MORE — the ink cloud's address (Supabase)

   The endless leaderboard lives on Supabase's free tier:
   a Postgres ledger, row-level security as the lock, and
   sign-the-page identity (anonymous sign-ins — the scribe
   picks their own mark, no account needed).

   To raise the cloud:

   1) Uses the existing Pinpoint Supabase project, but separate
      public.om_scores / public.om_daily tables and RLS policies.
   2) Schema installed via Supabase migration on 2026-11-02.
   3) Requires ANONYMOUS sign-ins enabled for Supabase Auth.
   4) Public publishable key only. Never use service_role or secret keys.
   5) For Google login, allow the actual deployment URL in
      Authentication → URL Configuration

   Until the object below is filled, the leaderboard stays
   quietly offline — the game plays exactly as before.
   ============================================================ */

window.OM_SUPABASE = {
  url: 'https://sffpyvxbgmhepftxoesy.supabase.co',       /* e.g. 'https://your-project.supabase.co' */
  anonKey: 'sb_publishable___dIulfnvx74SjfXuyFXZg_LPnlZv7I',   /* the anon public key — safe to ship, RLS is the lock */
};
