/* ONE MORE — the build lands on the paper.
   ------------------------------------------------------------------
   GitHub Pages serves this branch's ROOT with zero Actions setup, so
   after `vite build` this script copies dist/ over the repo root: the
   built page lands as index.html (the entry source is index.src.html
   and must never be clobbered), the img/ set, manifest.json and the
   service worker all become exactly what the branch serves. dist/
   itself is gitignored — the root IS the deploy. */
'use strict';
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const ROOT = path.join(__dirname, '..');

function copyAll(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    let d = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyAll(s, d);
    } else {
      /* the built page takes the served name; the source entry survives */
      if (entry.name === 'index.src.html') d = path.join(to, 'index.html');
      fs.copyFileSync(s, d);
    }
  }
}

if (!fs.existsSync(DIST)) {
  console.error('no dist/ — run `vite build` first');
  process.exit(1);
}
copyAll(DIST, ROOT);
const built = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
console.log('landed on the root: index.html (' + built.length + ' chars), img/, manifest.json, snd/, sw.js');
