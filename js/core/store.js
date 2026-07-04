import { SB, SUPABASE_OK } from './config.js';

/* ---------- Store — uses Supabase client, falls back to local storage ---------- */
export const Store = {
  async get(key, fallback) {
    if (SUPABASE_OK) {
      try {
        const rows = await SB.select('app_kv', { key });
        if (rows && rows.length > 0 && rows[0].value != null) return rows[0].value;
        return fallback;
      } catch (e) { console.warn('Supabase get failed for', key, e); }
    }
    return this._localGet(key, fallback);
  },
  async set(key, value) {
    if (SUPABASE_OK) {
      try {
        const ok = await SB.upsert('app_kv', { key, value, updated_at: new Date().toISOString() });
        if (ok) return true;
      } catch (e) { console.warn('Supabase set failed for', key, e); }
    }
    return this._localSet(key, value);
  },
  async _localGet(key, fallback) {
    try {
      if (!window.storage) return fallback;
      const r = await window.storage.get(key, true).catch(() => null)
             || await window.storage.get(key, false).catch(() => null);
      if (r && r.value != null) return JSON.parse(r.value);
    } catch (e) { /* no local storage */ }
    return fallback;
  },
  async _localSet(key, value) {
    try {
      if (window.storage) {
        await window.storage.set(key, JSON.stringify(value), true);
        return true;
      }
    } catch (e) { /* local storage unavailable */ }
    return false;
  },
  async getWithMigration(key, fallback) {
    if (SUPABASE_OK) {
      const sbVal = await this.get(key, undefined);
      if (sbVal !== undefined) return sbVal;
    }
    const legacyVal = await this._localGet(key, undefined);
    if (legacyVal !== undefined) {
      if (SUPABASE_OK) await this.set(key, legacyVal);
      return legacyVal;
    }
    return fallback;
  }
};

/* =========================================================================
   Save system — sequential queue, one write at a time.

   Problem with the old approach: multiple scheduleSave() calls fired their
   storage writes simultaneously (all timers expired at ~700ms), creating a
   burst of concurrent writes that triggered rate-limit errors in the storage
   backend.  Data that failed to save was lost on page refresh.

   Fix: every scheduleSave() call queues the key. A single async loop drains
   the queue one key at a time, waiting for each write to complete before
   starting the next. This keeps writes serialised regardless of how many
   keys are queued at once.
   ========================================================================= */
let pendingGetters = {};       // key -> latest getter fn (last writer wins per key)
let saveQueue = [];            // ordered list of keys waiting to be written
let saveRunning = false;       // true while the queue drain loop is running
let saveTimers = {};           // debounce timers (one per key)
let saveStatus = { state: 'idle', lastError: null };

function setSaveStatus(state, lastError) {
  saveStatus = { state, lastError: lastError || null };
}

// Schedule a key to be saved. Debounced: rapid repeated calls for the same
// key within `delay` ms collapse into a single write (last value wins).
export function scheduleSave(key, getter, delay = 400) {
  pendingGetters[key] = getter;
  clearTimeout(saveTimers[key]);
  saveTimers[key] = setTimeout(() => {
    // Add to queue if not already there
    if (!saveQueue.includes(key)) saveQueue.push(key);
    drainSaveQueue();
  }, delay);
}

// Drains the queue sequentially, one write at a time.
export async function drainSaveQueue() {
  if (saveRunning) return; // already draining
  saveRunning = true;
  setSaveStatus('saving');
  let anyFailed = false;
  while (saveQueue.length > 0) {
    const key = saveQueue.shift();
    const getter = pendingGetters[key];
    if (!getter) continue;
    let ok = false;
    try {
      ok = await Store.set(key, getter());
    } catch (e) {
      console.error('storage set threw:', key, e);
    }
    if (ok) {
      delete pendingGetters[key];
    } else {
      anyFailed = true;
      // Re-queue for retry — put it back at the front
      if (!saveQueue.includes(key)) saveQueue.unshift(key);
      // Stop draining and schedule a retry in a few seconds
      break;
    }
  }
  saveRunning = false;
  if (anyFailed) {
    setSaveStatus('error');
    setTimeout(() => drainSaveQueue(), 5000); // auto-retry after 5s
  } else if (saveQueue.length > 0) {
    drainSaveQueue(); // more items were added while we were running
  } else {
    if (Object.keys(pendingGetters).length === 0) setSaveStatus('saved');
  }
}
