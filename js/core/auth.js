import { APP, SESSION } from './state.js';
import { norm } from './utils.js';
import { scheduleSave } from './store.js';
import { renderAuthGate } from './auth-ui.js';

/* ---- Role presets ---- */
export const ROLE_PRESETS = {
  ADMIN:         { label: 'Admin',       color: 'pill-amber'   },
  OWNER:         { label: 'Owner',       color: 'pill-teal'    },
  HR:            { label: 'HR',          color: 'pill-neutral'  },
  FLOOR_MANAGER: { label: 'Floor Mgr',  color: 'pill-neutral'  },
  EMPLOYEE:      { label: 'Employee',    color: 'pill-neutral'  },
  TEAM_LEAD:     { label: 'Team Lead',   color: 'pill-neutral'  },
};
// Custom roles (admin-created) live in APP.customRoles
// Each entry: { id: 'cr_xxx', name: 'CRE Service', permissions: {...} }

export function getRoleInfo(roleId) {
  if (ROLE_PRESETS[roleId]) return { label: ROLE_PRESETS[roleId].label, color: ROLE_PRESETS[roleId].color };
  const cr = (APP.customRoles || []).find(r => r.id === roleId);
  return cr ? { label: cr.name, color: 'pill-neutral' } : { label: roleId || '—', color: 'pill-neutral' };
}

export const ALL_TAB_PERMS = [
  { key:'dashboard',    label:'Dashboard',             group:'View' },
  { key:'behavioral',   label:'Behavioral Incentive',  group:'View' },
  { key:'performance',  label:'Performance Incentive', group:'View' },
  { key:'processinfo',  label:'Process Info',          group:'View' },
  { key:'customers',    label:'Customers',             group:'View' },
  { key:'employees',    label:'Employees',             group:'View' },
  { key:'reporting',    label:'Reporting Structure',   group:'View' },
  { key:'hrsheet',      label:'HR-Sheet',              group:'View' },
  { key:'revenue',      label:'Job Card & Revenue',    group:'View' },
  { key:'warrantydata', label:'Warranty Data',         group:'View' },
  { key:'complaints',   label:'HMSI Complaints',       group:'View' },
  { key:'bodyshop',     label:'Bodyshop',              group:'View' },
  { key:'rates',        label:'Incentive Rates',       group:'View' },
  { key:'olddata',      label:'Old Data Archive',      group:'View' },
];

export const ALL_ACTION_PERMS = [
  { key:'upload_data',     label:'Upload CSV files (HR-Sheet, Job Card, etc.)' },
  { key:'edit_hrsheet',    label:'Edit HR-Sheet rows directly (leaves, late marks, tobacco, dept, designation)' },
  { key:'edit_employees',  label:'Add / edit / delete employees' },
  { key:'edit_rates',      label:'Edit Incentive Rates' },
  { key:'edit_overrides',  label:'Set Final Override on Dashboard' },
  { key:'edit_targets',    label:'Override Targets on Performance page' },
];
// Admin-only perms are never shown in the user editor checkboxes
export const ADMIN_ONLY_TABS = ['users','settings'];

export function defaultPermissions(roleId) {
  const all = Object.fromEntries(ALL_TAB_PERMS.map(p => [p.key, false]));
  const allActions = Object.fromEntries(ALL_ACTION_PERMS.map(p => [p.key, false]));
  const base = { ...all, ...allActions, users: false, settings: false };
  if (roleId === 'ADMIN') {
    Object.keys(base).forEach(k => base[k] = true);
    return base;
  }
  if (roleId === 'OWNER') {
    ['dashboard','behavioral','performance','customers','employees','reporting',
     'hrsheet','revenue','warrantydata','complaints','bodyshop','rates','olddata'].forEach(k => base[k] = true);
    return base;
  }
  if (roleId === 'HR') {
    ['dashboard','behavioral','customers','employees','hrsheet'].forEach(k => base[k] = true);
    base.upload_data = true; base.edit_employees = true; base.edit_hrsheet = true;
    return base;
  }
  if (roleId === 'FLOOR_MANAGER') {
    ['dashboard','behavioral','performance','revenue','complaints','bodyshop','rates'].forEach(k => base[k] = true);
    base.upload_data = true; base.edit_rates = true; base.edit_targets = true; base.edit_hrsheet = true;
    return base;
  }
  if (roleId === 'EMPLOYEE') { base.personal_dashboard = true; return base; }
  if (roleId === 'TEAM_LEAD') { base.personal_dashboard = true; base.team_dashboard = true; return base; }
  // Custom role — look up its saved permissions
  const cr = (APP.customRoles || []).find(r => r.id === roleId);
  return cr ? { ...base, ...(cr.permissions || {}) } : base;
}

/* ---- Auth helpers ---- */
export function currentUser()  { return APP.users.find(u => u.id === SESSION.userId) || null; }
export function isLoggedIn()   { return !!currentUser(); }
export function isEmployee()   { const u = currentUser(); return u && (u.role === 'EMPLOYEE' || u.role === 'TEAM_LEAD'); }
export function isTeamLead()   { const u = currentUser(); return u && u.role === 'TEAM_LEAD'; }
export function linkedEmployee() {
  const u = currentUser(); if (!u || !u.empId) return null;
  return APP.employees.find(e => e.id === u.empId) || null;
}
export const TEAM_LEAD_DESIGS = ['body shop executive','bodyshop executive','floor supervisor',
  'service manager','store manager','assistant manager floor','accessories manager',
  'asst. manager floor','asst manager floor'];
export function getTeamMembers(emp) {
  if (!emp) return [];
  const isLead = TEAM_LEAD_DESIGS.some(d => (emp.designation||'').toLowerCase().includes(d.split(' ')[0]));
  if (!isLead) return [];
  let team = APP.employees.filter(e => e.supervisorId === emp.id && e.id !== emp.id && e.status === 'ACTIVE');
  if (team.length === 0) {
    team = APP.employees.filter(e =>
      e.id !== emp.id && e.status === 'ACTIVE' &&
      norm(e.department) === norm(emp.department) &&
      !TEAM_LEAD_DESIGS.some(d => (e.designation||'').toLowerCase().includes(d.split(' ')[0]))
    );
  }
  return team;
}
export function isAdmin()      { const u = currentUser(); return !!u && u.role === 'ADMIN'; }
export function adminCount()   { return APP.users.filter(u => u.role === 'ADMIN').length; }
export function canDo(perm)    { if (!isLoggedIn()) return false; if (isAdmin()) return true; return !!(currentUser().permissions || {})[perm]; }
export function canViewTab(id) { if (ADMIN_ONLY_TABS.includes(id)) return isAdmin(); return canDo(id); }

export function loginWithEmail(email, password) {
  email = email.trim().toLowerCase();
  const u = APP.users.find(x => (x.email||'').toLowerCase() === email);
  if (!u) return { ok: false, error: 'No account with that email address.' };
  if ((u.password || '') !== password) return { ok: false, error: 'Incorrect password.' };
  SESSION.userId = u.id; return { ok: true };
}
export function loginWithMobile(mobile, otp) {
  mobile = mobile.replace(/\D/g,'');
  const u = APP.users.find(x => (x.mobile||'').replace(/\D/g,'') === mobile);
  if (!u) return { ok: false, error: 'No account with that mobile number.' };
  if (!u._otp || String(u._otp) !== String(otp)) return { ok: false, error: 'Incorrect OTP. Ask Admin to show you the OTP again.' };
  // Clear OTP after one successful use (optional – commented out to allow retry)
  SESSION.userId = u.id; return { ok: true };
}
export function generateOtp(userId) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const u = APP.users.find(x => x.id === userId);
  if (u) { u._otp = otp; scheduleSave('users', () => APP.users); }
  return otp;
}
export function logout() { SESSION.userId = null; renderAuthGate(); }
