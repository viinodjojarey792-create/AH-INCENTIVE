import { APP, SESSION, DEFAULT_SETTINGS, TABS } from './state.js';
import { SB, SUPABASE_OK, setSupabaseOk } from './config.js';
import { Store, scheduleSave } from './store.js';
import { escapeHtml, toast, uid, monthKeyOf, monthLabelOf } from './utils.js';
import { ensureMonth, sortedMonthKeys } from './months.js';
import { ALL_TAB_PERMS, ALL_ACTION_PERMS } from './auth.js';
import { ensureOldData } from './admin-tabs/rates-archive.js';
import { DEFAULT_PROCESS_INFO_TEXT } from './admin-tabs/process-info.js';
import { renderNav, openModal, closeModal, rerenderActiveTab } from './ui-shell.js';
import { renderAuthGate } from './auth-ui.js';
import { SEED_EMPLOYEES } from '../../data/seed-employees.js';

export function populateMonthSelect() {
  const sel = document.getElementById('monthSelect');
  const keys = sortedMonthKeys();
  sel.innerHTML = keys.map(k => `<option value="${k}" ${k === APP.meta.currentMonth ? 'selected' : ''}>${escapeHtml(monthLabelOf(k))}</option>`).join('');
}
export function currentRealMonthKey() {
  const d = new Date();
  return monthKeyOf(d);
}
export function wireMonthControls() {
  const sel = document.getElementById('monthSelect');
  const btn = document.getElementById('newMonthBtn');
  if (sel) {
    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('change', (e) => {
      APP.meta.currentMonth = e.target.value;
      ensureMonth(APP.meta.currentMonth);
      scheduleSave('meta', () => APP.meta, 50);
      rerenderActiveTab();
    });
  }
  if (btn) {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', openNewMonthModal);
  }
}
function openNewMonthModal() {
  const today = new Date();
  const defaultVal = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  openModal(`
    <h3>Start a New Month</h3>
    <div class="field"><label>Month</label><input type="month" id="nm-month" value="${defaultVal}"></div>
    <p class="kbd-note">Employees and their settings carry over automatically. Attendance, revenue, complaints and rates start blank for the new month.</p>
    <div class="modal-actions">
      <button class="btn secondary" id="nm-cancel">Cancel</button>
      <button class="btn" id="nm-create">Create Month</button>
    </div>
  `);
  document.getElementById('nm-cancel').addEventListener('click', closeModal);
  document.getElementById('nm-create').addEventListener('click', () => {
    const v = document.getElementById('nm-month').value; // YYYY-MM
    if (!v) { toast('Pick a month', true); return; }
    ensureMonth(v);
    APP.meta.currentMonth = v;
    scheduleSave('months', () => APP.months, 50);
    scheduleSave('meta', () => APP.meta, 50);
    populateMonthSelect();
    closeModal();
    rerenderActiveTab();
    toast('Switched to ' + monthLabelOf(v));
  });
}

/* =========================================================================
   Boot
   ========================================================================= */
export function initTabPanels() {
  document.getElementById('content').innerHTML = TABS.map(t => `<div class="tab-panel" id="tab-${t.id}"></div>`).join('');
}

function showBootLoader(msg) {
  const gate = document.getElementById('authGate');
  const card = document.getElementById('authCard');
  if (gate && card) {
    gate.classList.remove('hidden');
    card.innerHTML = `
      <div class="auth-brand"><div class="brand-dot"></div><div class="auth-title">Workshop Incentive</div></div>
      <div class="auth-sub" style="margin-top:6px;">${escapeHtml(msg)}</div>
      <div style="margin-top:18px; height:4px; background:var(--line); border-radius:99px; overflow:hidden;">
        <div style="height:100%; background:var(--amber); border-radius:99px; width:60%; animation:pulse 1.2s ease-in-out infinite;"></div>
      </div>`;
  }
}

function showSetupRequired(card) {
  card.innerHTML = `
    <div class="auth-brand"><div class="brand-dot" style="background:var(--bad);"></div><div class="auth-title">Database Setup Required</div></div>
    <div style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:12.5px;color:#78350F;">
      <b>The database tables have not been created yet.</b> Run the one-time SQL setup in your Supabase dashboard to continue.
    </div>
    <ol style="font-size:13px;line-height:1.9;padding-left:18px;color:var(--ink);">
      <li>Open <b>supabase.com</b> → your project</li>
      <li>Click <b>SQL Editor</b> → <b>New Query</b></li>
      <li>Open the <b>supabase_setup.sql</b> file you downloaded and paste its contents</li>
      <li>Click <b>Run</b> — you should see <b>"Database setup complete ✓"</b></li>
      <li>Come back here and click <b>Retry</b> below</li>
    </ol>
    <button class="btn" id="retryBootBtn" style="width:100%;margin-top:8px;">↻ Retry Connection</button>
  `;
  document.getElementById('retryBootBtn').addEventListener('click', () => boot());
}

function showNetworkError(card, status) {
  card.innerHTML = `
    <div class="auth-brand"><div class="brand-dot" style="background:var(--bad);"></div><div class="auth-title">Cannot Reach Database</div></div>
    <div style="background:#FEE2E2;border:1px solid #F87171;border-radius:8px;padding:12px 14px;margin:14px 0;font-size:12.5px;color:#7F1D1D;">
      <b>Connection to Supabase failed.</b> Status: ${status}<br><br>
      The app will work in <b>offline mode</b> (data saved locally only, not shared across devices). Check your internet connection and click Retry to try Supabase again.
    </div>
    <button class="btn" id="retryBootBtn" style="width:100%;margin-top:4px;">↻ Retry Supabase</button>
    <button class="btn secondary" id="offlineBtn" style="width:100%;margin-top:8px;">Continue in Offline Mode</button>
  `;
  document.getElementById('retryBootBtn').addEventListener('click', () => boot());
  document.getElementById('offlineBtn').addEventListener('click', () => bootWithFallback());
}

export async function boot() {
  showBootLoader('Loading your data…');

  // Try Supabase with a 6-second timeout — never block the app from starting.
  // If Supabase is reachable and tables exist → use it.
  // If anything fails → fall back to local storage silently.
  try {
    const result = await Promise.race([
      SB.healthCheck(),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 6000))
    ]);
    console.log('[Boot] Supabase status:', result);
    if (result === 'ok') {
      setSupabaseOk(true);
    } else {
      // Any other result — still boot the app. Show a soft warning after login.
      console.warn('[Boot] Supabase not ready:', result, '— using local fallback');
      setSupabaseOk(false);
    }
  } catch (e) {
    console.error('[Boot] Connection attempt failed:', e);
    setSupabaseOk(false);
  }

  await bootWithFallback();
}

export async function bootWithFallback() {
  showBootLoader('Loading your data…');

  // Load every key with migration-aware retry (tolerates transient storage failures).
  const savedSettings    = await Store.getWithMigration('settings',     null);
  const savedEmployees   = await Store.getWithMigration('employees',    null);
  const savedMonths      = await Store.getWithMigration('months',       null);
  const savedMeta        = await Store.getWithMigration('meta',         null);
  let   savedUsers       = await Store.getWithMigration('users',        null);
  const savedOldData     = await Store.getWithMigration('oldData',      null);
  const savedReporting   = await Store.getWithMigration('reportingChain', null);
  const savedArchive     = await Store.getWithMigration('jobCardArchive', null);

  // Triple retry for users — most critical key
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (savedUsers && savedUsers.length > 0) break;
    if (savedEmployees || savedMonths) {
      showBootLoader('Checking login data… (' + attempt + '/3)');
      await new Promise(r => setTimeout(r, 1000 * attempt));
      savedUsers = await Store.getWithMigration('users', null);
      if (!savedUsers || savedUsers.length === 0) {
        savedUsers = await Store.getWithMigration('users_backup', null);
      }
    }
  }

  // ── Populate APP ──────────────────────────────────────────────────────────
  APP.settings = savedSettings
    ? Object.assign({}, DEFAULT_SETTINGS, savedSettings)
    : JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

  APP.employees = (savedEmployees && savedEmployees.length)
    ? savedEmployees
    : JSON.parse(JSON.stringify(SEED_EMPLOYEES));

  APP.months = savedMonths || {};

  APP.meta = savedMeta || { currentMonth: currentRealMonthKey(), activeTab: 'dashboard' };
  if (!APP.meta.currentMonth) APP.meta.currentMonth = currentRealMonthKey();
  if (!APP.meta.activeTab)    APP.meta.activeTab = 'dashboard';
  // Migrate old tab IDs
  if (['attendance','master','special'].includes(APP.meta.activeTab)) APP.meta.activeTab = 'hrsheet';

  APP.users = savedUsers || [];
  // Seed permanent accounts — always present even if Supabase loses data
  const SEED_USERS = [
    { id:'u-dhawal-owner', name:'Dhawal Sir', designation:'Owner', mobile:'9823400019',
      email:'', password:'Arihant123', role:'OWNER', permissions:{}, empId:null,
      _otp:'123456', createdAt:'2024-01-01T00:00:00.000Z', _seed:true },
    { id:'u-vinod-admin', name:'Vinod', designation:'Admin', mobile:'7507279279',
      email:'viinod.jojarey792@gmail.com', password:'Arihant123', role:'ADMIN', permissions:{}, empId:null,
      _otp:'123456', createdAt:'2026-07-03T00:00:00.000Z', _seed:true }
  ];
  for (const su of SEED_USERS) {
    const existing = APP.users.find(u => u.id === su.id);
    if (!existing) { APP.users.push(su); }
    else {
      // Keep this seed account's core identity/rights correct even if a
      // prior boot reset it (e.g. mobile, email, role, password) — but
      // preserve its live _otp so an in-progress login isn't invalidated.
      existing.mobile = su.mobile; existing.email = su.email; existing.role = su.role;
      existing.password = su.password; existing.name = existing.name || su.name;
      existing.designation = existing.designation || su.designation;
    }
  }
  // Write backup immediately
  if (APP.users.length > 0) Store.set('users_backup', APP.users).catch(()=>{});
  APP.oldData        = savedOldData;
  APP.reportingChain = savedReporting   || {};
  APP.customRoles    = await Store.getWithMigration('customRoles', []);
  APP.processInfo    = await Store.getWithMigration('processInfo', null) || { text: DEFAULT_PROCESS_INFO_TEXT, updatedAt: null };

  // Seed default designations if this is a fresh install
  if (!APP.customRoles || APP.customRoles.length === 0) {
    const viewBasic   = { dashboard: true, behavioral: true, performance: false, customers: false, employees: false, reporting: false, hrsheet: false, revenue: false, warrantydata: false, complaints: false, bodyshop: false, rates: false, olddata: false, upload_data: false, edit_employees: false, edit_rates: false, edit_overrides: false, edit_targets: false };
    const viewPerf    = { ...viewBasic, performance: true };
    const viewMgr     = { ...viewPerf, employees: true, reporting: true, complaints: true, rates: true, edit_rates: true, edit_targets: true };
    const viewFloor   = { ...viewPerf, revenue: true, complaints: true, bodyshop: true, rates: true, upload_data: true, edit_rates: true, edit_targets: true };
    const viewSpare   = { ...viewBasic, revenue: true, warrantydata: true };
    const viewAccts   = { ...viewBasic, performance: true };
    const noAccess    = Object.fromEntries([...ALL_TAB_PERMS.map(p=>[p.key,false]), ...ALL_ACTION_PERMS.map(p=>[p.key,false])]);

    APP.customRoles = [
      { id: uid('cr'), name: 'Technician',           permissions: viewPerf   },
      { id: uid('cr'), name: 'Office Boy',            permissions: viewBasic  },
      { id: uid('cr'), name: 'Floor Supervisor',      permissions: viewFloor  },
      { id: uid('cr'), name: 'Service Manager',       permissions: viewMgr    },
      { id: uid('cr'), name: 'Accounts',              permissions: viewAccts  },
      { id: uid('cr'), name: 'Cashier',               permissions: viewBasic  },
      { id: uid('cr'), name: 'Spare Parts Executive', permissions: viewSpare  },
      { id: uid('cr'), name: 'Spare Parts Manager',   permissions: { ...viewSpare, edit_rates: true } },
      { id: uid('cr'), name: 'Custom',                permissions: noAccess   },
    ];
    scheduleSave('customRoles', () => APP.customRoles);
  }

  ensureOldData();

  // ── Job card archive (with legacy per-month migration) ────────────────────
  if (savedArchive) {
    APP.jobCardArchive = savedArchive;
  } else {
    const merged = { byMonth: {}, fileName: null, uploadedAt: null, totalRowsInFile: 0 };
    for (const mk of Object.keys(APP.months)) {
      const legacy = APP.months[mk] && APP.months[mk].jobCard;
      if (legacy && legacy.byTech) {
        merged.byMonth[mk] = { byTech: legacy.byTech, byAdvisor: legacy.byAdvisor, workshop: legacy.workshop };
        merged.fileName     = legacy.fileName    || merged.fileName;
        merged.uploadedAt   = legacy.uploadedAt  || merged.uploadedAt;
      }
    }
    APP.jobCardArchive = merged;
  }

  ensureMonth(APP.meta.currentMonth);

  // ── Always persist the full current state ─────────────────────────────────
  // This "heals" any key that failed to save in a previous session.
  // The sequential queue means these 8 writes happen one-at-a-time, not in
  // a burst, so they won't trigger rate-limit errors.
  scheduleSave('settings',       () => APP.settings,       200);
  scheduleSave('employees',      () => APP.employees,       300);
  scheduleSave('months',         () => APP.months,          400);
  scheduleSave('meta',           () => APP.meta,            500);
  scheduleSave('users',          () => APP.users,           600);
  scheduleSave('oldData',        () => APP.oldData,         700);
  scheduleSave('reportingChain', () => APP.reportingChain,  800);
  scheduleSave('jobCardArchive', () => APP.jobCardArchive,  900);
  scheduleSave('customRoles',    () => APP.customRoles,     1000);

  initTabPanels();
  renderNav();
  populateMonthSelect();
  wireMonthControls();
  renderAuthGate();
  // Show database connection status in sidebar footer
  const foot = document.getElementById('sidebarFoot');
  if (foot) {
    const dbBadge = document.createElement('div');
    dbBadge.id = 'dbStatusBadge';
    dbBadge.style.cssText = 'font-size:10.5px;padding:6px 10px;border-top:1px solid rgba(255,255,255,0.06);';
    if (SUPABASE_OK) {
      dbBadge.innerHTML = '<span style="color:#4ade80;">●</span> <span style="color:#83806f;">Connected to Supabase</span>';
    } else {
      dbBadge.innerHTML = `<span style="color:#fb923c;">●</span> <span style="color:#83806f;">Offline mode</span>
        <button onclick="retrySupabase()" style="display:block;width:100%;margin-top:4px;font-size:10px;padding:3px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#D8D3C3;cursor:pointer;">↻ Retry Supabase</button>`;
    }
    foot.parentNode.insertBefore(dbBadge, foot);
  }
}

export async function retrySupabase() {
  const badge = document.getElementById('dbStatusBadge');
  if (badge) badge.innerHTML = '<span style="color:#fbbf24;">●</span> <span style="color:#83806f;">Connecting…</span>';
  try {
    const result = await Promise.race([
      SB.healthCheck(),
      new Promise(resolve => setTimeout(() => resolve('timeout'), 6000))
    ]);
    if (result === 'ok') {
      setSupabaseOk(true);
      if (badge) badge.innerHTML = '<span style="color:#4ade80;">●</span> <span style="color:#83806f;">Connected to Supabase ✓</span>';
      toast('Connected to Supabase — data will now sync across all devices');
    } else {
      setSupabaseOk(false);
      if (badge) badge.innerHTML = `<span style="color:#fb923c;">●</span> <span style="color:#83806f;">Offline mode (${result})</span>
        <button onclick="retrySupabase()" style="display:block;width:100%;margin-top:4px;font-size:10px;padding:3px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#D8D3C3;cursor:pointer;">↻ Retry Supabase</button>`;
      toast('Still cannot reach Supabase — check console for details', true);
    }
  } catch (e) {
    if (badge) badge.innerHTML = `<span style="color:#fb923c;">●</span> <span style="color:#83806f;">Error</span>
      <button onclick="retrySupabase()" style="display:block;width:100%;margin-top:4px;font-size:10px;padding:3px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:5px;color:#D8D3C3;cursor:pointer;">↻ Retry Supabase</button>`;
  }
}
// Exposed for the inline onclick="retrySupabase()" handlers rendered above.
window.retrySupabase = retrySupabase;
