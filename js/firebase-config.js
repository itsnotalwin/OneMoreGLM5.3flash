'use strict';
/* ============================================================
   ONE MORE — the ink cloud's address (Firebase)

   The endless leaderboard and Google sign-in live on Firebase's
   free Spark plan. To raise the cloud:

   1) https://console.firebase.google.com → Add project
   2) Project overview → the web glyph (</>) → register a Web app
      → copy the firebaseConfig values into the object below
   3) Build → Authentication → Get started → Sign-in method →
      enable GOOGLE (support email = yours)
   4) Build → Firestore Database → Create database (production
      mode) → Rules → paste the rules from README.md → Publish
   5) Authentication → Settings → Authorized domains → add your
      GitHub Pages domain (  <user>.github.io  ) and any custom
      domain. localhost is already trusted for local play.

   Until the object below is filled, the leaderboard stays
   quietly offline — the game plays exactly as before.
   ============================================================ */

window.OM_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
