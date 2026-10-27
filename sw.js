/* ONE MORE — service worker: the paper travels with the scribe.
   ------------------------------------------------------------------
   Core shell + every brush asset are precached on install; images get
   cached at runtime as they are first painted. Page navigations go
   network-first with the cached shell as the offline fall. Same-origin
   only — Firebase and the Google-Fonts CDN pass straight through.

   Everything is SCOPE-RELATIVE (`./`, `css/…`, `js/…`) so the worker is
   honest wherever the game is hosted: a user site root or a project
   subpath on GitHub Pages. Bump VER on every build — the activate step
   retires every cache that does not carry the current version. */
'use strict';

const VER = 'v7.7';
const CORE_CACHE = `om-core-${VER}`;
const RUN_CACHE = `om-run-${VER}`;

const CORE = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/audio.js',
  'js/config.js',
  'js/cutscene.js',
  'js/firebase-config.js',
  'js/game.js',
  'js/intro.js',
  'js/lb.js',
  'js/main.js',
  'js/render.js',
  'js/ui.js',
  'img/icons/icon-32.png',
  'img/icons/icon-180.png',
  'img/icons/icon-192.png',
  'img/icons/icon-192-maskable.png',
  'img/icons/icon-512.png',
  'img/icons/icon-512-maskable.png',
  'img/wash_cliff.webp',
  'img/wash_cliff_p.webp',
  'img/wash_guo.webp',
  'img/wash_guo2.webp',
  'img/wash_guo2_p.webp',
  'img/wash_guo_p.webp',
  'img/wash_hab1.webp',
  'img/wash_hab1_p.webp',
  'img/wash_hab2.webp',
  'img/wash_hab2_p.webp',
  'img/wash_kuan.webp',
  'img/wash_kuan_p.webp',
  'img/wash_shore.webp',
  'img/wash_shore_p.webp',
  'img/wash_shu.webp',
  'img/wash_shu2.webp',
  'img/wash_shu2_p.webp',
  'img/wash_shu_p.webp',
  'img/wash_trees.webp',
  'img/wash_trees_p.webp',
  'img/wash_waves.webp',
  'img/wash_waves2.webp',
  'img/wash_waves2_p.webp',
  'img/wash_waves_p.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    /* resilient: one missing asset must never block the install —
       the runtime handler sweeps stragglers in as they are fetched */
    await Promise.all(CORE.map((u) => cache.add(u).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== CORE_CACHE && k !== RUN_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase / fonts CDN: untouched

  /* page navigations: network-first, cached shell as the offline fall */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CORE_CACHE);
        cache.put('./', fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        const shell = (await caches.match('./')) || (await caches.match('index.html'));
        return shell || Response.error();
      }
    })());
    return;
  }

  /* every other same-origin GET: cache-first, refresh the hole behind you */
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const rung = url.pathname.includes('/img/') ? RUN_CACHE : CORE_CACHE;
        const cache = await caches.open(rung);
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch (_) {
      return Response.error();
    }
  })());
});
