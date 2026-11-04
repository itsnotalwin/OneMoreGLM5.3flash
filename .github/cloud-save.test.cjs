'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const code = fs.readFileSync('js/cloud-save.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const worker = fs.readFileSync('sw.js', 'utf8');
const lobby = fs.readFileSync('js/lb.js', 'utf8');
const game = fs.readFileSync('js/game.js', 'utf8');
const main = fs.readFileSync('js/main.js', 'utf8');
const uid = '00000000-0000-4000-a000-000000000001';
let passed = 0;

function test(name, fn) {
  return Promise.resolve().then(fn).then(() => {
    passed += 1;
    console.log('PASS', name);
  });
}

class DeviceStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(i) { return Array.from(this.values.keys())[i] || null; }
  get length() { return this.values.size; }
}

function fakeClient(db) {
  return {
    from(table) {
      assert.equal(table, 'om_player_saves');
      let update = null, insert = null;
      const filters = {};
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        update(value) { update = value; return this; },
        insert(value) { insert = value; return this; },
        maybeSingle: async function () {
          const row = db.row;
          if (update) {
            if (!row || row.uid !== filters.uid || row.revision !== filters.revision) {
              return { data: null, error: null };
            }
            db.history.push(JSON.parse(JSON.stringify(row)));
            db.row = { ...row, ...update, updated_at: new Date().toISOString() };
            return { data: JSON.parse(JSON.stringify(db.row)), error: null };
          }
          return { data: row && row.uid === filters.uid ? JSON.parse(JSON.stringify(row)) : null, error: null };
        },
        single: async function () {
          if (insert && !db.row) {
            db.row = { ...insert, updated_at: new Date().toISOString() };
            return { data: JSON.parse(JSON.stringify(db.row)), error: null };
          }
          return { data: null, error: { message: 'duplicate' } };
        },
      };
    },
  };
}

function createDevice(db, local = new DeviceStorage(), signedIn = true) {
  const window = { addEventListener() {} };
  const document = { readyState: 'loading', getElementById: () => null, addEventListener() {} };
  let reloads = 0;
  const location = { reload() { reloads++; } };
  const client = fakeClient(db);
  const user = signedIn ? { id: uid, app_metadata: { provider: 'google', providers: ['google'] } } : null;
  const LB = { cloudAccess() { return { client, user }; } };
  const G = { S: { mode: 'title' } };
  const sandbox = {
    window, document, localStorage: local, location, LB, G,
    console, Date, JSON, Math, Object, Number, String, Array, Boolean,
    setInterval() {}, setTimeout() {}, clearTimeout() {},
    confirm: () => true,
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { cloud: window.OM_CLOUD, local, G, get reloads() { return reloads; } };
}

(async () => {
  const db = { row: null, history: [] };
  const pc = createDevice(db);
  pc.local.setItem('om_runs_v1', '4');
  pc.local.setItem('om_unlocked_v1', '3');
  pc.local.setItem('om_charms_v1', '{"ink":55,"earned":60,"lv":{"ward":1},"feats":{}}');

  await test('new PC progress stays local until explicitly uploaded', async () => {
    await pc.cloud.check(true);
    assert.equal(pc.cloud.state.mode, 'initial');
    assert.equal(db.row, null);
    assert.equal(pc.local.getItem('om_runs_v1'), '4');
  });

  await test('first PC upload creates private revision 1 without altering local save', async () => {
    await pc.cloud.uploadLocal(true);
    assert.equal(db.row.revision, 1);
    assert.equal(db.row.data.values.om_runs_v1, '4');
    assert.equal(pc.cloud.state.mode, 'synced');
    assert.equal(pc.local.getItem('om_charms_v1').includes('"ink":55'), true);
  });

  await test('cloud signatures ignore JSONB map key ordering', () => {
    const a = { schema: 1, values: { om_runs_v1: '4', om_unlocked_v1: '3' } };
    const b = { schema: 1, values: { om_unlocked_v1: '3', om_runs_v1: '4' } };
    assert.equal(pc.cloud.signature(a), pc.cloud.signature(b));
  });

  const phone = createDevice(db);
  await test('empty phone restores existing Google cloud save automatically and reloads', async () => {
    await phone.cloud.check(true);
    assert.equal(phone.reloads, 1);
    assert.equal(phone.local.getItem('om_runs_v1'), '4');
    assert.equal(phone.local.getItem('om_unlocked_v1'), '3');
    assert.ok(Array.from(phone.local.values.keys()).some(k => k.startsWith('__omcloud_local_backup')));
    assert.equal(db.row.revision, 1);
  });

  await test('new PC progress syncs via revision compare-and-swap', async () => {
    pc.local.setItem('om_runs_v1', '6');
    await pc.cloud.check(true);
    assert.equal(db.row.revision, 2);
    assert.equal(db.row.data.values.om_runs_v1, '6');
    assert.equal(db.history.length, 1);
    assert.equal(db.history[0].data.values.om_runs_v1, '4');
  });

  await test('unchanged phone pulls newer cloud revision safely', async () => {
    await phone.cloud.check(true);
    assert.equal(phone.reloads, 2);
    assert.equal(phone.local.getItem('om_runs_v1'), '6');
  });

  await test('divergent devices stop and never auto-overwrite either save', async () => {
    phone.local.setItem('om_runs_v1', '7');
    pc.local.setItem('om_runs_v1', '8');
    await pc.cloud.check(true);
    const before = db.row.revision;
    await phone.cloud.check(true);
    assert.equal(phone.cloud.state.mode, 'conflict');
    assert.equal(phone.local.getItem('om_runs_v1'), '7');
    assert.equal(db.row.data.values.om_runs_v1, '8');
    assert.equal(db.row.revision, before);
  });

  await test('a local WIPE does not upload an empty cloud snapshot', async () => {
    pc.cloud.beforeLocalWipe();
    pc.local.removeItem('om_runs_v1');
    pc.local.removeItem('om_unlocked_v1');
    await pc.cloud.check(true);
    assert.equal(pc.cloud.state.mode, 'wiped');
    assert.equal(db.row.data.values.om_runs_v1, '8');
  });

  await test('unfamiliar cloud keys are rejected', () => {
    assert.equal(pc.cloud.validSave({ schema: 1, values: { 'sb-secret': 'no' } }), false);
    assert.equal(pc.cloud.validSave({ schema: 2, values: {} }), false);
  });

  await test('signed-out account never downloads or uploads progress', async () => {
    const guest = createDevice(db, new DeviceStorage(), false);
    await guest.cloud.check(true);
    assert.equal(guest.cloud.state.mode, 'signedOut');
    assert.equal(guest.reloads, 0);
  });

  await test('existing v18.1 gameplay and OAuth entrypoints are preserved', () => {
    assert.match(game, /om_charms_v1/);
    assert.match(game, /om_unlocked_v1/);
    assert.match(lobby, /LB|consumeOAuthReturn/);
    assert.match(lobby, /cloudAccess\(\)/);
    assert.match(main, /beforeLocalWipe\(\)/);
    assert.ok(html.indexOf('js/supabase-config.js') < html.indexOf('js/lb.js'));
    assert.ok(html.indexOf('js/lb.js') < html.indexOf('js/cloud-save.js'));
    assert.ok(html.indexOf('js/cloud-save.js') < html.indexOf('js/main.js'));
    assert.ok(worker.includes("'js/cloud-save.js'"));
  });

  await test('all touched JS passes Node syntax check', () => {
    for (const p of ['js/lb.js', 'js/main.js', 'js/cloud-save.js', 'sw.js']) {
      const src = fs.readFileSync(p, 'utf8');
      new vm.Script(src, { filename: p });
    }
  });

  console.log('All ' + passed + '/12 cloud-save tests passed; no live user saves were accessed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
