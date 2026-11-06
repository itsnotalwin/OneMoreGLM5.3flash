'use strict';

/*
 * ONE MORE: fail-closed Supabase recovery planner.
 *
 * Never edits main. GitHub Actions can publish a review-only repair patch,
 * scoped to known config/OAuth source and missing script-cache wiring.
 * Only a tightly matched ADDITIVE startup patch may touch novel game versions.
 * Unrecognized authentication or startup changes abort before edits.
 *
 * For intentional auth refactors, update these pins and tests in a reviewed PR.
 */
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const GOOD = 'b95fe772b31afcd233a2142db2098c2bc895bb77';
const BAD = '8def891bc3adccb2c4018f84f5618fbfcd22bbfe';
const SOURCE_FILES = [
  'js/supabase-config.js',
  'js/lb.js',
  'js/main.js',
];
const SW = 'sw.js';
const HTML = 'index.html';
const ALLOWED = [...SOURCE_FILES, HTML, SW];

function snapshot(ref, path) {
  return cp.execFileSync('git', ['show', ref + ':' + path], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function sourcesFromRef(ref) {
  const result = {};
  for (const path of ALLOWED) result[path] = snapshot(ref, path);
  return result;
}

function sourcesFromWorktree() {
  const result = {};
  for (const path of ALLOWED) result[path] = fs.readFileSync(path, 'utf8');
  return result;
}

function healthy(path, text) {
  if (path === 'js/supabase-config.js') {
    return text.includes('https://sffpyvxbgmhepftxoesy.supabase.co') &&
      /anonKey\s*:\s*['"]sb_publishable_[^'"]+['"]/.test(text) &&
      !/anonKey\s*:\s*['"](?:sb_secret_|eyJ)/.test(text);
  }
  if (path === 'js/lb.js') {
    return [
      'om_lb_google_return_v1',
      'function consumeOAuthReturn(',
      'function initAuth(',
      'signInWithOAuth(',
      'signInAnonymously(',
      "flowType: 'pkce'",
      'detectSessionInUrl: true',
      "from('om_weekly')",
      "from('om_daily')",
      "from('om_scores')",
      'function fetchEcho(',
      'function renderAccount(',
      'persistPending(',
      'cloudAccess()',
      'return {',
    ].every(piece => text.includes(piece));
  }
  if (path === 'js/main.js') {
    return [
      'LB.consumeOAuthReturn()',
      'openSettings(oauthReturn.from)',
      'LB.initAuth()',
      'showIntroGate()',
      'CH.open()',
      'LB.launchRun',
      'beforeLocalWipe()',
    ].every(piece => text.includes(piece));
  }
  throw new Error('Unsupported source path: ' + path);
}

function validate(content) {
  for (const path of SOURCE_FILES) {
    if (!healthy(path, content[path])) throw new Error('Integration still incomplete in ' + path);
  }
  const page = content[HTML];
  const names = [SOURCE_FILES[0], SOURCE_FILES[1], 'js/cloud-save.js', SOURCE_FILES[2]];
  const positions = names.map(name => page.indexOf('src="./' + name + '"'));
  if (positions.some(p => p < 0) ||
      !(positions[0] < positions[1] && positions[1] < positions[2] &&
        positions[2] < positions[3])) {
    throw new Error('Supabase script order changed; refusing automatic repair');
  }
  const sw = content[SW];
  for (const cached of [
    ...SOURCE_FILES, 'js/cloud-save.js', 'js/charms.js', 'js/inkstone.js', 'inkstone.html',
  ]) {
    if (!sw.includes("'" + cached + "'")) {
      throw new Error('Service worker missing asset ' + cached + '; refusing repair');
    }
  }
  for (const path of [...SOURCE_FILES, SW]) {
    try { new Function(content[path]); }
    catch (e) { throw new Error('JavaScript syntax error in ' + path + ': ' + e.message); }
  }
}

function bumpCache(sw) {
  const found = [...sw.matchAll(/const VER\s*=\s*['"]([^'"]+)['"]/g)];
  if (found.length !== 1) throw new Error('Unrecognized service-worker version; refusing repair');
  const version = found[0][1];
  const suffix = version.match(/^(.*-supabase-)(\d+)$/);
  const next = suffix ? suffix[1] + (Number(suffix[2]) + 1) : version + '-supabase-1';
  if (next === version || next.length > 100) throw new Error('Unsafe cache version');
  return sw.replace(found[0][0], "const VER = '" + next + "'");
}


/* This is deliberately an ADDITIVE adapter, not a file-level rollback.
 * New v19+ gameplay and Settings features live in main.js. We only insert
 * the three previously reviewed OAuth/cloud-wipe hooks at unique legacy
 * anchors. Any unexpected marker/anchor/partial integration aborts.
 */
function repairMainAdditively(input) {
  if (healthy('js/main.js', input)) return input;
  for (const required of ['showIntroGate()', 'LB.launchRun', 'CH.open()',
    "const INTRO_SEEN = 'om_intro_seen'",
    'function openSettings(from)',
    'function refreshSettings()',
    'function closeSettings()',
    "document.getElementById('setWipe')",
  ]) {
    if (!input.includes(required)) throw new Error('Unknown startup layout: missing ' + required);
  }
  for (const conflicting of ['LB.consumeOAuthReturn()', 'LB.initAuth()',
    'beforeLocalWipe()', 'LB.authReturnTo = settingsReturn']) {
    if (input.includes(conflicting)) throw new Error('Partial authentication integration: ' + conflicting);
  }
  const edits = [
    [
      "    settingsReturn = (from === 'board' || from === 'over') ? from : 'title';\n    wipeArmed = false;",
      "    settingsReturn = (from === 'board' || from === 'over') ? from : 'title';\n" +
      "    if (typeof LB !== 'undefined') LB.authReturnTo = settingsReturn;\n    wipeArmed = false;"
    ],
    [
      "    /* the second press closes the book */\n    clearTimeout(wipeTimer);\n    try {\n      const kill = [];",
      "    /* Local wipe never silently erases the cloud account save. */\n" +
      "    clearTimeout(wipeTimer);\n" +
      "    try { if (window.OM_CLOUD) window.OM_CLOUD.beforeLocalWipe(); }\n" +
      "    catch (e) { wipeArmed = false; refreshSettings(); return; }\n" +
      "    try {\n      const kill = [];"
    ],
    [
      "  if (typeof CH !== 'undefined' && CH.refreshChip) CH.refreshChip();\n  if (G.S.reduced || introSeen()) {",
      "  if (typeof CH !== 'undefined' && CH.refreshChip) CH.refreshChip();\n" +
      "  /* Resume Google OAuth in Settings, preserving the previous board tab. */\n" +
      "  const oauthReturn = LB.consumeOAuthReturn();\n" +
      "  if (oauthReturn) {\n" +
      "    enterTitle();\n" +
      "    if (oauthReturn.from === 'board') LB.open('title', oauthReturn.tab);\n" +
      "    openSettings(oauthReturn.from);\n" +
      "    LB.initAuth().catch(() => {});\n" +
      "  } else if (G.S.reduced || introSeen()) {"
    ]
  ];
  let result = input;
  for (const [before, after] of edits) {
    if (result.split(before).length !== 2) {
      throw new Error('Unrecognized startup anchor; refused additive auth repair');
    }
    result = result.replace(before, after);
  }
  if (!healthy('js/main.js', result)) throw new Error('Additive auth repair did not restore all startup hooks');
  return result;
}

function plan(current, knownBad, knownGood) {
  const proposed = { ...current };
  const edits = [];
  const unfamiliar = [];
  for (const path of SOURCE_FILES) {
    if (healthy(path, current[path])) continue;
    if (current[path] === knownBad[path] && healthy(path, knownGood[path])) {
      proposed[path] = knownGood[path];
      edits.push(path);
    } else if (path === 'js/main.js') {
      try {
        proposed[path] = repairMainAdditively(current[path]);
        edits.push(path);
      } catch (e) {
        unfamiliar.push(path + ' (' + e.message + ')');
      }
    } else {
      unfamiliar.push(path);
    }
  }
  if (unfamiliar.length) {
    throw new Error(
      'UNKNOWN AUTH SOURCE: ' + unfamiliar.join(', ') +
      '. No files changed. Review the diff manually; NEVER overwrite new gameplay.'
    );
  }
  // A manual HTML upload may omit the tiny cloud script tag while keeping
  // entirely new gameplay markup. Insert only this known, fixed tag.
  if (!proposed[HTML].includes('src="./js/cloud-save.js"')) {
    const anchor = '<script src="./js/lb.js"></script>';
    if (proposed[HTML].split(anchor).length !== 2 ||
        !proposed[HTML].includes('<script src="./js/main.js"></script>')) {
      throw new Error('Unknown HTML script layout. No files changed.');
    }
    proposed[HTML] = proposed[HTML].replace(anchor,
      anchor + '\n<script src="./js/cloud-save.js"></script>');
    edits.push(HTML);
  }
  if (edits.length || !proposed[SW].includes("'js/cloud-save.js'")) {
    let sw = proposed[SW];
    if (!sw.includes("'js/cloud-save.js'")) {
      const anchor = "'js/charms.js',";
      if (sw.split(anchor).length !== 2) {
        throw new Error('Unknown PWA cache layout. No files changed.');
      }
      sw = sw.replace(anchor, anchor + "\n  'js/cloud-save.js',");
    }
    proposed[SW] = bumpCache(sw);
    edits.push(SW);
  }
  validate(proposed);
  return { proposed, edits };
}

function selfTest(bad, good) {
  let passed = 0;
  function test(description, fn) {
    fn();
    passed++;
    process.stdout.write('PASS ' + description + '\n');
  }
  test('known missing OAuth/config is repaired, not gameplay', () => {
    const p = plan(bad, bad, good);
    assert.deepEqual(p.edits, [...SOURCE_FILES, HTML, SW]);
    for (const path of SOURCE_FILES) assert.equal(p.proposed[path], good[path]);
    assert.equal(
      p.proposed[HTML].replace('\n<script src="./js/cloud-save.js"></script>', ''),
      bad[HTML]
    );
  });
  test('correct integration does not create a PR', () => {
    assert.equal(plan(good, bad, good).edits.length, 0);
  });
  test('config-only regression changes config and SW only', () => {
    const partial = { ...good, [SOURCE_FILES[0]]: bad[SOURCE_FILES[0]] };
    assert.deepEqual(plan(partial, bad, good).edits, [SOURCE_FILES[0], SW]);
  });
  test('novel broken source aborts before ANY write', () => {
    const newCode = { ...bad, [SOURCE_FILES[1]]: bad[SOURCE_FILES[1]] + '\n// new gameplay change\n' };
    assert.throws(() => plan(newCode, bad, good), /UNKNOWN AUTH SOURCE/);
  });
  test('new code with intact integration remains untouched', () => {
    const newer = { ...good, [SOURCE_FILES[1]]: good[SOURCE_FILES[1]] + '\n// extra feature\n' };
    assert.equal(plan(newer, bad, good).edits.length, 0);
  });
  test('future PWA version is incremented without reverting assets', () => {
    const changed = { ...bad, [SW]: bad[SW].replace(
      /const VER\s*=\s*'[^']+'/,
      "const VER = 'v99'"
    ) };
    const p = plan(changed, bad, good);
    assert.match(p.proposed[SW], /const VER = 'v99-supabase-1'/);
    assert.ok(p.proposed[SW].includes("'js/inkstone.js'"));
  });
  test('cloud script missing from a new HTML upload gets a minimal PR diff', () => {
    const changed = { ...good,
      [HTML]: good[HTML].replace('<script src="./js/cloud-save.js"></script>\n', ''),
    };
    const p = plan(changed, bad, good);
    assert.deepEqual(p.edits, [HTML, SW]);
    assert.equal(p.proposed[HTML], good[HTML]);
  });
  test('v19 changed gameplay main receives only additive integration hooks', () => {
    const v19 = sourcesFromRef('e71106c14d1b35315be13d2ffa45cd64e6e892ce');
    const p = plan(v19, bad, good);
    assert.deepEqual(p.edits, [...SOURCE_FILES, HTML, SW]);
    for (const marker of ['THEME_CYCLE', 'THEME_LABELS', 'setThemeState']) {
      assert.ok(p.proposed['js/main.js'].includes(marker));
    }
    assert.equal(p.proposed[HTML].includes('BUILD V19.0'), true);
    assert.equal(p.proposed['js/main.js'].includes('beforeLocalWipe()'), true);
  });
  test('unrecognized main startup layout aborts without writing', () => {
    const v19 = sourcesFromRef('e71106c14d1b35315be13d2ffa45cd64e6e892ce');
    v19['js/main.js'] = v19['js/main.js'].replace("  if (G.S.reduced || introSeen()) {",
      "  if (otherNewGate()) {");
    assert.throws(() => plan(v19, bad, good), /UNKNOWN AUTH SOURCE/);
  });
  test('unknown PWA file is rejected', () => {
    const changed = { ...bad, [SW]: bad[SW].replace("'js/lb.js'", "'some-other-file.js'") };
    assert.throws(() => plan(changed, bad, good), /Service worker missing asset/);
  });
  process.stdout.write('All ' + passed + ' read-only fail-closed tests passed.\n');
}

function writeOutput(changed) {
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + (changed ? 'true' : 'false') + '\n');
  }
}

function main() {
  const mode = process.argv[2];
  const current = sourcesFromWorktree();
  const bad = sourcesFromRef(BAD);
  const good = sourcesFromRef(GOOD);

  if (mode === '--self-test') return selfTest(bad, good);
  const cloudModule = fs.readFileSync('js/cloud-save.js', 'utf8');
  if (!cloudModule.includes('om_player_saves') ||
      !cloudModule.includes('restoreSnapshot') ||
      !cloudModule.includes('beforeLocalWipe')) {
    throw new Error('Cloud-save module missing or refactored. No auto-repair.');
  }
  if (mode === '--verify') {
    validate(current);
    const diff = cp.execFileSync('git', ['diff', '--name-only'], { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
    const unexpected = diff.filter(path => !ALLOWED.includes(path));
    if (unexpected.length) throw new Error('Forbidden changed path: ' + unexpected.join(', '));
    process.stdout.write('Integration syntax, script order, PWA assets and diff scope verified.\n');
    return;
  }
  if (mode !== '--repair' && mode !== '--dry-run') {
    throw new Error('Usage: node .github/supabase-auto-repair.cjs --self-test|--dry-run|--repair|--verify');
  }

  // Compute and validate the entire plan before touching a single file.
  const { proposed, edits } = plan(current, bad, good);
  process.stdout.write(edits.length
    ? 'Safe proposed repair: ' + edits.join(', ') + '\n'
    : 'No repair needed. Integration already intact.\n');
  if (mode === '--repair') {
    for (const path of edits) fs.writeFileSync(path, proposed[path], 'utf8');
    writeOutput(edits.length > 0);
  }
}

try { main(); }
catch (err) {
  console.error('Supabase auto-repair stopped safely: ' + err.message);
  process.exitCode = 1;
}
