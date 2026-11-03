'use strict';

/*
 * ONE MORE: fail-closed Supabase recovery planner.
 *
 * Never edits main. In GitHub Actions this may prepare a DRAFT pull request,
 * but only for three EXACT known-reset source files plus the SW cache version.
 * An unfamiliar change to auth/startup code aborts all proposed edits.
 *
 * For intentional auth refactors, update these pins and tests in a reviewed PR.
 */
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');

const GOOD = '365697c8dde79e6fe1a6edeea1e5cf289229564c';
const BAD = '8def891bc3adccb2c4018f84f5618fbfcd22bbfe';
const SOURCE_FILES = [
  'js/supabase-config.js',
  'js/lb.js',
  'js/main.js',
];
const SW = 'sw.js';
const HTML = 'index.html';
const ALLOWED = [...SOURCE_FILES, SW];

function snapshot(ref, path) {
  return cp.execFileSync('git', ['show', ref + ':' + path], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
}

function sourcesFromRef(ref) {
  const result = {};
  for (const path of [...ALLOWED, HTML]) result[path] = snapshot(ref, path);
  return result;
}

function sourcesFromWorktree() {
  const result = {};
  for (const path of [...ALLOWED, HTML]) result[path] = fs.readFileSync(path, 'utf8');
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
    ].every(piece => text.includes(piece));
  }
  throw new Error('Unsupported source path: ' + path);
}

function validate(content) {
  for (const path of SOURCE_FILES) {
    if (!healthy(path, content[path])) throw new Error('Integration still incomplete in ' + path);
  }
  const page = content[HTML];
  const names = SOURCE_FILES;
  const positions = names.map(name => page.indexOf('src="./' + name + '"'));
  if (positions.some(p => p < 0) ||
      !(positions[0] < positions[1] && positions[1] < positions[2])) {
    throw new Error('Supabase script order changed; refusing automatic repair');
  }
  const sw = content[SW];
  for (const cached of [
    ...SOURCE_FILES, 'js/charms.js', 'js/inkstone.js', 'inkstone.html',
  ]) {
    if (!sw.includes("'" + cached + "'")) {
      throw new Error('Service worker missing asset ' + cached + '; refusing repair');
    }
  }
  for (const path of ALLOWED) {
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

function plan(current, knownBad, knownGood) {
  const proposed = { ...current };
  const edits = [];
  const unfamiliar = [];
  for (const path of SOURCE_FILES) {
    if (healthy(path, current[path])) continue;
    if (current[path] === knownBad[path] && healthy(path, knownGood[path])) {
      proposed[path] = knownGood[path];
      edits.push(path);
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
  if (edits.length) {
    proposed[SW] = bumpCache(current[SW]);
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
    assert.deepEqual(p.edits, [...SOURCE_FILES, SW]);
    for (const path of SOURCE_FILES) assert.equal(p.proposed[path], good[path]);
    assert.equal(p.proposed[HTML], bad[HTML]);
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
