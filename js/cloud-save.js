/* ONE MORE — cloud save bridge.
   Local-first, account-linked and conflict-safe. No game logic is changed.
   Supabase stores a revisioned snapshot; older cloud versions are retained
   by the server trigger. Conflicting local changes are NEVER auto-merged. */
'use strict';

window.OM_CLOUD = (() => {
  const TABLE = 'om_player_saves';
  const META = '__omcloud_meta_v1_';
  const WIPE = '__omcloud_local_wiped_v1';
  const BACKUP = '__omcloud_local_backup_v1_';
  const MAX_BYTES = 110000;
  const SYNC_MS = 14000;
  const KEYS = Object.freeze([
    'om_best_v1', 'om_runs_v1', 'om_unlocked_v1', 'om_furthest_v1',
    'om_cleared_v1', 'om_prog_v1', 'om_seal_v1', 'om_brush_v1',
    'om_charms_v1', 'om_stone_v1', 'om_daily_v1', 'om_lb_best_v1',
    'om_lb_name_v1',
  ]);

  let started = false;
  let running = false;
  let mode = 'signedOut';
  let status = 'SIGN IN WITH GOOGLE TO SAVE ACROSS DEVICES.';
  let cloud = null;
  let activeUid = '';
  let lastCheckedAt = 0;
  let timer = null;
  let needsRefresh = false;

  const $ = (id) => document.getElementById(id);
  const rawGet = (key) => {
    try { return localStorage.getItem(key); } catch (_) { return null; }
  };
  const rawSet = (key, value) => localStorage.setItem(key, value);
  const readJson = (key) => {
    try { return JSON.parse(rawGet(key) || 'null'); } catch (_) { return null; }
  };

  function access() {
    try { return typeof LB !== 'undefined' && LB.cloudAccess ? LB.cloudAccess() : null; }
    catch (_) { return null; }
  }

  function googleUser() {
    const a = access();
    const u = a && a.user;
    const app = u && u.app_metadata;
    const providers = app && Array.isArray(app.providers) ? app.providers : [];
    return a && a.client && u &&
      (app.provider === 'google' || providers.includes('google')) ? a : null;
  }

  function snapshot() {
    const values = {};
    for (const key of KEYS) {
      const value = rawGet(key);
      if (value !== null) values[key] = value;
    }
    return { schema: 1, values };
  }

  function validSave(payload) {
    if (!payload || payload.schema !== 1 ||
        !payload.values || typeof payload.values !== 'object' ||
        Array.isArray(payload.values)) return false;
    const actual = Object.keys(payload.values);
    if (actual.some(key => !KEYS.includes(key) || typeof payload.values[key] !== 'string')) return false;
    return JSON.stringify(payload).length < MAX_BYTES;
  }

  // A deterministic, non-security fingerprint. Cloud revisions and RLS enforce
  // ownership and conflict detection; this only spots local edits since sync.
  function signature(payload) {
    const ordered = { schema: payload.schema, values: {} };
    for (const key of KEYS) {
      if (Object.prototype.hasOwnProperty.call(payload.values, key)) {
        ordered.values[key] = payload.values[key];
      }
    }
    const s = JSON.stringify(ordered);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return s.length.toString(36) + ':' + (h >>> 0).toString(16);
  }

  function hasProgress(payload) {
    const v = payload.values;
    const number = (k) => {
      try { return Number(JSON.parse(v[k])) || 0; } catch (_) { return 0; }
    };
    const charms = () => {
      try {
        const c = JSON.parse(v.om_charms_v1 || 'null');
        return c && (c.earned > 0 || c.ink > 0 || Object.keys(c.lv || {}).length > 0);
      } catch (_) { return false; }
    };
    return number('om_runs_v1') > 0 || number('om_unlocked_v1') > 1 ||
      number('om_cleared_v1') > 0 || number('om_furthest_v1') > 1 ||
      !!v.om_prog_v1 || !!v.om_seal_v1 || !!v.om_best_v1 ||
      !!v.om_stone_v1 || !!v.om_daily_v1 || !!v.om_brush_v1 ||
      !!v.om_lb_best_v1 || !!v.om_lb_name_v1 || charms();
  }

  function summary(payload) {
    if (!validSave(payload)) return 'INVALID SAVE';
    const v = payload.values;
    const val = (k) => {
      try { return JSON.parse(v[k] || 'null'); } catch (_) { return null; }
    };
    const sheet = Math.max(1, Number(val('om_unlocked_v1')) || 1,
      Number(val('om_furthest_v1')) || 1);
    const runs = Number(val('om_runs_v1')) || 0;
    const charms = val('om_charms_v1') || {};
    return 'SCROLL ' + sheet + ' · ' + runs + ' RUNS · ' +
      (Number(charms.ink) || 0) + ' INK';
  }

  function metadata(uid) {
    const m = readJson(META + uid);
    return m && Number.isSafeInteger(m.revision) && m.revision >= 1 &&
      typeof m.signature === 'string' ? m : null;
  }

  function remember(uid, revision, payload) {
    rawSet(META + uid, JSON.stringify({
      revision: Number(revision),
      signature: signature(payload),
    }));
  }

  function setMode(next, message, row) {
    mode = next;
    status = message;
    if (row !== undefined) cloud = row;
    render();
  }

  function mount() {
    const anchor = $('accountRows');
    if (!anchor || $('cloudSavePanel')) return;
    const box = document.createElement('div');
    box.id = 'cloudSavePanel';
    box.setAttribute('aria-live', 'polite');
    anchor.insertAdjacentElement('afterend', box);
    render();
  }

  function render() {
    const box = $('cloudSavePanel');
    if (!box) return;
    const local = snapshot();
    const cloudSave = cloud && cloud.data;
    const localLine = 'THIS DEVICE: ' + summary(local);
    const cloudLine = cloudSave && validSave(cloudSave)
      ? 'CLOUD: ' + summary(cloudSave) : 'CLOUD: NO SAVE YET';
    const options = {
      initial: [['upload', 'BACK UP THIS DEVICE']],
      emptyCloud: [['upload', 'START CLOUD SAVE']],
      conflict: [['download', 'USE CLOUD SAVE'], ['upload', 'KEEP THIS DEVICE']],
      wiped: [['download', 'RESTORE CLOUD SAVE'], ['upload', 'KEEP THE WIPE']],
      remotePending: [['download', 'LOAD CLOUD SAVE']],
      offline: [['check', 'RETRY SYNC']],
      synced: [['check', 'CHECK FOR UPDATES']],
      error: [['check', 'RETRY']],
    };
    const buttons = [...(options[mode] || [])];
    if (hasProgress(local)) buttons.push(['export', 'EXPORT DEVICE BACKUP']);
    const message = status.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    box.innerHTML =
      '<div class="room-kicker room-kicker-2"><span class="kanji-inline" aria-hidden="true">雲</span>CLOUD SAVE</div>' +
      '<div class="acct-note" role="status">' + message + '</div>' +
      (mode === 'signedOut' || mode === 'loading' ? '' :
        '<div class="acct-note">' + localLine + '<br>' + cloudLine + '</div>') +
      (buttons.length ? '<div class="acct-google-wrap">' +
        buttons.map(([action, label]) =>
          '<button type="button" class="ghost-btn small" data-cloud-action="' +
          action + '">' + label + '</button>').join(' ') + '</div>' : '') +
      (mode === 'conflict' || mode === 'wiped' ?
        '<div class="acct-note">BOTH SAVES ARE PROTECTED. CHOOSE DELIBERATELY. THE CLOUD KEEPS PRIOR VERSIONS.</div>' : '');
    for (const button of box.querySelectorAll('[data-cloud-action]')) {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-cloud-action');
        if (action === 'download') void restoreCloud(true);
        else if (action === 'upload') void uploadLocal(true);
        else if (action === 'check') void check(true);
        else if (action === 'export') exportLocal();
      });
    }
  }

  function exportLocal() {
    const p = snapshot();
    if (!validSave(p)) { setMode('error', 'DEVICE BACKUP TOO LARGE. NO SAVE CHANGED.'); return; }
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'one-more-device-save-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readCloud(client, uid) {
    const { data, error } = await client.from(TABLE)
      .select('uid,revision,data,updated_at')
      .eq('uid', uid).maybeSingle();
    if (error) throw error;
    if (data && (!validSave(data.data) || !Number.isSafeInteger(Number(data.revision)) ||
        Number(data.revision) < 1 || data.uid !== uid)) {
      throw new Error('The cloud save format is not recognized. Nothing was changed.');
    }
    return data;
  }

  function safeToReload() {
    try {
      const s = typeof G !== 'undefined' && G.S && G.S.mode;
      return !s || ['title', 'settings', 'board', 'scrolls', 'charms', 'brush'].includes(s);
    } catch (_) { return false; }
  }

  function backupBeforeRestore(uid) {
    const old = snapshot();
    if (!validSave(old)) throw new Error('Local save is too large to back up safely.');
    const label = BACKUP + uid + '_' + Date.now();
    // If storage is full, abort rather than risk losing the only PC/phone copy.
    rawSet(label, JSON.stringify(old));
  }

  function restoreSnapshot(uid, row) {
    if (!safeToReload()) {
      setMode('remotePending', 'FINISH THIS RUN BEFORE RESTORING YOUR CLOUD SAVE.');
      return false;
    }
    if (!row || !validSave(row.data)) throw new Error('Invalid cloud save: nothing was restored.');
    const original = snapshot();
    const previousMeta = rawGet(META + uid);
    const previousWipe = rawGet(WIPE);
    backupBeforeRestore(uid);
    try {
      for (const key of KEYS) {
        if (Object.prototype.hasOwnProperty.call(row.data.values, key)) {
          rawSet(key, row.data.values[key]);
        } else {
          localStorage.removeItem(key);
        }
      }
      remember(uid, row.revision, row.data);
      localStorage.removeItem(WIPE);
    } catch (error) {
      // Roll back partial writes if storage is full; the independent backup
      // remains available even if the rollback itself cannot complete.
      for (const key of KEYS) {
        try {
          if (Object.prototype.hasOwnProperty.call(original.values, key)) {
            rawSet(key, original.values[key]);
          } else {
            localStorage.removeItem(key);
          }
        } catch (_) {}
      }
      try {
        if (previousMeta === null) localStorage.removeItem(META + uid);
        else rawSet(META + uid, previousMeta);
        if (previousWipe === null) localStorage.removeItem(WIPE);
        else rawSet(WIPE, previousWipe);
      } catch (_) {}
      throw new Error('Device storage rejected the restore. Original backup kept; no reload.');
    }
    location.reload();
    return true;
  }

  async function saveToCloud(client, uid, existing, payload) {
    if (!validSave(payload)) throw new Error('Save is too large; nothing was uploaded.');
    if (!existing) {
      const { data, error } = await client.from(TABLE)
        .insert({ uid, revision: 1, data: payload })
        .select('uid,revision,data,updated_at').single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await client.from(TABLE)
      .update({ data: payload, revision: Number(existing.revision) + 1 })
      .eq('uid', uid).eq('revision', existing.revision)
      .select('uid,revision,data,updated_at').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Another device updated the cloud. No save was overwritten; review both copies.');
    return data;
  }

  async function uploadLocal(explicit) {
    if (running) return;
    const a = googleUser();
    if (!a) { setMode('signedOut', 'SIGN IN WITH GOOGLE TO USE CLOUD SAVES.'); return; }
    if (explicit && cloud &&
        !confirm('Use THIS DEVICE as the cloud save? This will replace the active cloud version. Prior cloud revisions are backed up.')) return;
    running = true;
    setMode('loading', 'PROTECTING THIS DEVICE SAVE...');
    try {
      const current = snapshot();
      if (!validSave(current)) throw new Error('This save is too large to upload.');
      const latest = await readCloud(a.client, a.user.id);
      if (activeUid !== a.user.id) return;
      // An explicit choice may replace the latest revision, but a new intervening
      // update must never be replaced with a stale reading from an earlier check.
      if (latest && (!explicit || !cloud || Number(latest.revision) !== Number(cloud.revision))) {
        const meta = metadata(a.user.id);
        if (!meta || latest.revision !== meta.revision) {
          cloud = latest;
          setMode('conflict', 'CLOUD CHANGED. REVIEW BOTH VERSIONS BEFORE UPLOADING.', latest);
          return;
        }
      }
      if (!latest && cloud) throw new Error('Cloud save disappeared. No data was overwritten.');
      const saved = await saveToCloud(a.client, a.user.id, latest, current);
      remember(a.user.id, saved.revision, current);
      localStorage.removeItem(WIPE);
      cloud = saved;
      setMode('synced', 'CLOUD SAVED. FUTURE CHANGES SYNC AUTOMATICALLY.', saved);
      lastCheckedAt = Date.now();
    } catch (e) {
      setMode('error', 'SAVE FAILED: ' + (e && e.message || 'NETWORK ERROR') + '. LOCAL PROGRESS IS SAFE.');
    } finally { running = false; }
  }

  async function restoreCloud(explicit) {
    if (running) return;
    const a = googleUser();
    if (!a) return;
    if (explicit && hasProgress(snapshot()) &&
        !confirm('Restore the CLOUD save on this device? A backup of this device is created first, then the game reloads.')) return;
    running = true;
    setMode('loading', 'PROTECTING YOUR EXISTING DEVICE SAVE...');
    try {
      const latest = await readCloud(a.client, a.user.id);
      if (activeUid !== a.user.id) return;
      if (!latest) throw new Error('No cloud save was found.');
      cloud = latest;
      restoreSnapshot(a.user.id, latest);
    } catch (e) {
      setMode('error', 'RESTORE STOPPED: ' + (e && e.message || 'UNKNOWN ERROR') + '. LOCAL PROGRESS IS SAFE.');
    } finally { running = false; }
  }

  async function check(force) {
    if (running) { needsRefresh = true; return; }
    const a = googleUser();
    if (!a) {
      activeUid = '';
      cloud = null;
      setMode('signedOut', 'SIGN IN WITH GOOGLE TO SYNC YOUR SCROLLS, INK AND CHARMS.');
      return;
    }
    if (!force && Date.now() - lastCheckedAt < 2500) return;
    if (activeUid !== a.user.id) {
      activeUid = a.user.id;
      cloud = null;
    }
    const uid = a.user.id;
    running = true;
    if (mode === 'signedOut') setMode('loading', 'READING YOUR CLOUD SAVE...');
    try {
      const row = await readCloud(a.client, uid);
      if (activeUid !== uid) return;
      lastCheckedAt = Date.now();
      cloud = row;
      const local = snapshot();
      if (!validSave(local)) throw new Error('Local save exceeds the safe cloud size limit.');
      const sig = signature(local);
      const meta = metadata(uid);

      if (rawGet(WIPE)) {
        setMode('wiped', 'THIS DEVICE WAS WIPED. CLOUD SAVE IS STILL SAFE; CHOOSE WHAT TO DO.', row);
      } else if (!row) {
        setMode(hasProgress(local) ? 'initial' : 'emptyCloud',
          'NO CLOUD SAVE YET. THIS DEVICE STAYS LOCAL UNTIL YOU BACK IT UP.', null);
      } else if (!meta) {
        if (sig === signature(row.data)) {
          remember(uid, row.revision, local);
          setMode('synced', 'THIS DEVICE MATCHES THE CLOUD. AUTOMATIC SYNC IS ON.', row);
        } else if (!hasProgress(local) && safeToReload()) {
          restoreSnapshot(uid, row);
        } else {
          setMode('conflict', 'A CLOUD SAVE AND A DIFFERENT DEVICE SAVE EXIST. CHOOSE ONE.', row);
        }
      } else if (Number(row.revision) === Number(meta.revision)) {
        if (sig === meta.signature) {
          setMode('synced', 'CLOUD AND DEVICE MATCH. AUTOMATIC SYNC IS ON.', row);
        } else {
          const saved = await saveToCloud(a.client, uid, row, local);
          if (activeUid !== uid) return;
          remember(uid, saved.revision, local);
          setMode('synced', 'NEW PROGRESS SAVED TO THE CLOUD.', saved);
        }
      } else if (Number(row.revision) > Number(meta.revision) &&
                 sig === meta.signature) {
        if (safeToReload()) {
          restoreSnapshot(uid, row);
        } else {
          setMode('remotePending', 'A NEWER CLOUD SAVE IS READY. FINISH YOUR RUN BEFORE LOADING IT.', row);
        }
      } else {
        setMode('conflict', 'BOTH DEVICES CHANGED. CHOOSE WHICH COMPLETE SAVE TO KEEP.', row);
      }
    } catch (e) {
      setMode('error', 'CLOUD CHECK FAILED: ' + (e && e.message || 'NETWORK ERROR') +
        '. YOUR LOCAL PROGRESS IS UNCHANGED.');
    } finally {
      running = false;
      if (needsRefresh) {
        needsRefresh = false;
        setTimeout(() => check(false), 500);
      }
    }
  }

  function authChanged() {
    mount();
    void check(true);
  }

  function beforeLocalWipe() {
    // The existing WIPE must not silently erase the cloud or then re-upload
    // an empty page. The durable marker is intentionally NOT an "om_*" key.
    rawSet(WIPE, String(Date.now()));
  }

  function start() {
    mount();
    if (started) return;
    started = true;
    timer = setInterval(() => {
      if (googleUser()) void check(false);
    }, SYNC_MS);
    window.addEventListener('online', () => void check(true));
    window.addEventListener('focus', () => { if (googleUser()) void check(false); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && googleUser()) void check(false);
    });
    // Restore an existing login in the background; the game remains playable
    // if the CDN or Supabase is unreachable.
    try {
      if (rawGet('sb-sffpyvxbgmhepftxoesy-auth-token') && typeof LB !== 'undefined') {
        LB.initAuth().then(authChanged).catch(() => {});
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  return { start, authChanged, beforeLocalWipe, check, uploadLocal, restoreCloud,
    snapshot, validSave, signature, summary,
    get state() { return { mode, status, cloudRevision: cloud && cloud.revision }; } };
})();
