/* ---------- Supabase configuration ---------- */
export const SUPABASE_URL = 'https://vvebzvcpsjtgqsncvcnm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_cV19yf6RXmIGo_0GnQ3jnw_EuUBLHgo';

export let SUPABASE_OK = false;
export function setSupabaseOk(v) { SUPABASE_OK = v; }

let _sbClient = null; // official Supabase JS client, initialized after CDN loads

/* ---------- Initialize official Supabase client ----------
   The official @supabase/supabase-js library handles CORS, auth headers,
   key format detection, retries and real-time automatically.
   It is loaded from CDN in the <head> — window.supabase is the UMD global. */
export function initSupabaseClient() {
  try {
    if (window.supabase && window.supabase.createClient) {
      _sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 2 } }
      });
      return true;
    }
  } catch (e) { console.warn('Supabase client init failed:', e); }
  return false;
}

/* ---------- SB wrapper — uses official client when available ---------- */
export const SB = {
  async select(table, match = {}) {
    if (!_sbClient) throw new Error('No Supabase client');
    let q = _sbClient.from(table).select('*');
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async upsert(table, row) {
    if (!_sbClient) throw new Error('No Supabase client');
    const { error } = await _sbClient.from(table).upsert(row, { onConflict: 'key' });
    return !error;
  },
  async delete(table, match) {
    if (!_sbClient) throw new Error('No Supabase client');
    let q = _sbClient.from(table).delete();
    for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    const { error } = await q;
    return !error;
  },
  async healthCheck() {
    if (!initSupabaseClient()) return 'no_client';
    try {
      const { data, error, status } = await _sbClient.from('app_kv').select('key').limit(1);
      console.log('[Supabase] health check status:', status, 'error:', error?.message);
      if (status === 200 || status === 206) { SUPABASE_OK = true; return 'ok'; }
      if (status === 401 || status === 403)  return 'bad_key';
      if (status === 404 || !data)           return 'no_tables';
      return 'no_tables';
    } catch (e) {
      console.error('[Supabase] health check exception:', e);
      return 'network_error';
    }
  }
};
