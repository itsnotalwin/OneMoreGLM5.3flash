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
      'async function initAuth(',
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
      'authReturnTo: \'title\'',
      'window.OM_CLOUD.authChanged()',
      'unable to exchange external code',
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
    ...SOURCE_FILES, 'js/cloud-save.js', 'js/charms.js',
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



function replaceOne(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error('Unrecognized ' + label + ' anchor (' + count + ')');
  return source.replace(before, after);
}
function extractBetween(source, start, end, label) {
  const a = source.indexOf(start), b = source.indexOf(end, a + 1);
  if (a < 0 || b < 0) throw new Error('Known-good ' + label + ' template unavailable');
  return source.slice(a, b);
}
function repairConfigAdditively(input, knownGood) {
  if (healthy('js/supabase-config.js', input)) return input;
  const oldBlock = input.match(/window\.OM_SUPABASE\s*=\s*\{[\s\S]*?\};/);
  const goodBlock = knownGood.match(/window\.OM_SUPABASE\s*=\s*\{[\s\S]*?\};/);
  if (!oldBlock || !goodBlock ||
      !/url\s*:\s*['"]{2}/.test(oldBlock[0]) ||
      !/anonKey\s*:\s*['"]{2}/.test(oldBlock[0])) {
    throw new Error('Supabase config is not the known empty template');
  }
  return replaceOne(input, oldBlock[0], goodBlock[0], 'blank Supabase config');
}
function repairLobbyAdditively(input, knownGood) {
  if (healthy('js/lb.js', input)) return input;
  const required = [
    "const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';",
    "    tab: 'all',        // the board's eye: 'all' time, the 'day' sheet, the 'week' sheet",
    'function init() {', 'client.auth.onAuthStateChange((evt, session) => {',
    'async function signInGoogle() {', 'function authFail(e) {', 'function postFail(e) {',
    'function renderAuth(err) {', 'function renderAccount(err) {',
    "from('om_scores')", "from('om_daily')", "from('om_weekly')",
    'function fetchEcho(', 'function renderWeeklyRows(', 'return {',
  ];
  for (const marker of required) {
    if (!input.includes(marker)) throw new Error('Unknown lobby layout: missing ' + marker);
  }
  for (const marker of ['om_lb_google_return_v1','function consumeOAuthReturn(',
    'function initAuth(','cloudAccess()','ST.oauthError','window.OM_CLOUD.authChanged()']) {
    if (input.includes(marker)) throw new Error('Partial lobby integration: ' + marker);
  }
  const oauthHelpers = extractBetween(knownGood,
    "  const oauthReturnKey = 'om_lb_google_return_v1';",
    '  const cfg = () => {', 'OAuth callback');
  const authFail = extractBetween(knownGood,
    '  function authFail(e) {', '  function postFail(e) {', 'auth error mapping');
  const signInGoogle = extractBetween(knownGood,
    '  async function signInGoogle() {', '  /* stamp the mark:', 'Google OAuth');
  let result = input;
  result = replaceOne(result,
    "    tab: 'all',        // the board's eye: 'all' time, the 'day' sheet, the 'week' sheet\n  };",
    "    tab: 'all',        // the board's eye: 'all' time, the 'day' sheet, the 'week' sheet\n" +
    "    oauthError: '',     // message for unsuccessful Google sign-in returns\n  };", 'lobby state');
  result = replaceOne(result,
    "  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';\n",
    "  const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';\n" + oauthHelpers,
    'OAuth helper insertion');
  result = replaceOne(result,
    extractBetween(result, '  function authFail(e) {', '  function postFail(e) {', 'current auth error'),
    authFail, 'OAuth error mapping');
  result = replaceOne(result,
    '          if (session && session.user) ST.user = session.user;',
    "          if (session && session.user) { ST.user = session.user; ST.oauthError = ''; }", 'auth state');
  result = replaceOne(result,
    '          renderAuth();\n          renderAccount();\n          if (ST.user && ST.pending)',
    '          renderAuth();\n          renderAccount();\n' +
    '          if (window.OM_CLOUD) setTimeout(() => window.OM_CLOUD.authChanged(), 0);\n' +
    '          if (ST.user && ST.pending)', 'cloud auth notification');
  result = replaceOne(result,
    extractBetween(result, '  async function signInGoogle() {', '  /* stamp the mark:', 'current Google sign-in'),
    signInGoogle, 'OAuth return state');
  result = replaceOne(result,
    '  function renderAuth(err) {\n    const box',
    '  function renderAuth(err) {\n    err = err || ST.oauthError;\n    const box', 'OAuth auth error display');
  result = replaceOne(result,
    '  function renderAccount(err) {\n    const box',
    '  function renderAccount(err) {\n    err = err || ST.oauthError;\n    const box', 'OAuth account error display');
  result = replaceOne(result,
    '    saveName, renderAccount,\n    get user() { return me(); },',
    '    saveName, renderAccount, consumeOAuthReturn, initAuth,\n' +
    "    authReturnTo: 'title',\n" +
    '    cloudAccess() { return ST.sb ? { client: ST.sb.client, user: ST.user } : null; },\n' +
    '    get user() { return me(); },', 'lobby public API');
  if (!healthy('js/lb.js', result)) throw new Error('Additive lobby repair did not restore all required hooks');
  return result;
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
    } else if (path === 'js/supabase-config.js') {
      try {
        proposed[path] = repairConfigAdditively(current[path], knownGood[path]);
        edits.push(path);
      } catch (e) {
        unfamiliar.push(path + ' (' + e.message + ')');
      }
    } else if (path === 'js/lb.js') {
      try {
        proposed[path] = repairLobbyAdditively(current[path], knownGood[path]);
        edits.push(path);
      } catch (e) {
        unfamiliar.push(path + ' (' + e.message + ')');
      }
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
  test('correct integration yields no repair patch', () => {
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
    assert.ok(p.proposed[SW].includes("'js/cloud-save.js'"));
    assert.ok(p.proposed[SW].includes("'js/charms.js'"));
  });
  test('cloud script missing from a new HTML upload gets a minimal patch diff', () => {
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

  test('v19.3 purse and ten-seal upload gets additive auth recovery without restoring Inkstone', () => {
    const v193 = sourcesFromRef('5d034d9cd68e6f1614f38736a21f47ed8336b7d8');
    const p = plan(v193, bad, good);
    assert.deepEqual(p.edits, [...SOURCE_FILES, HTML, SW]);
    assert.ok(p.proposed[HTML].includes('BUILD V19.3'));
    assert.ok(p.proposed[HTML].includes('id="charmInk"'));
    assert.ok(p.proposed[SW].includes("'js/cloud-save.js'"));
    assert.ok(!p.proposed[SW].includes("'inkstone.html'"));
    assert.ok(p.proposed['js/lb.js'].includes('cloudAccess()'));
    assert.ok(p.proposed['js/main.js'].includes('beforeLocalWipe()'));
  });
  test('unknown v19.3 lobby layout aborts without writing', () => {
    const v193 = sourcesFromRef('5d034d9cd68e6f1614f38736a21f47ed8336b7d8');
    v193['js/lb.js'] = v193['js/lb.js'].replace('function init() {', 'function alteredInit() {');
    assert.throws(() => plan(v193, bad, good), /UNKNOWN AUTH SOURCE/);
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
