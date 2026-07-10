import { APP, SESSION } from '../state.js';
import { escapeHtml, uid, toast, toTitleCase, confirmDestructive } from '../utils.js';
import { Store, scheduleSave } from '../store.js';
import {
  ROLE_PRESETS, ALL_TAB_PERMS, ALL_ACTION_PERMS, defaultPermissions,
  getRoleInfo, adminCount, generateOtp, TEAM_LEAD_DESIGS
} from '../auth.js';
import { openModal, closeModal, renderNav } from '../ui-shell.js';
import { paintCurrentUserPill } from '../personal-dashboard.js';

/* =========================================================================
   Users tab (Admin-only)
   ========================================================================= */
export function renderUsers() {
  const panel = document.getElementById('tab-users');
  panel.innerHTML = `
    <div class="banner info"><span>ℹ</span><div>These credentials only prevent accidental edits — they're not real account security. Create custom designations below to define role names and permissions for your specific staff types, then assign them when adding logins.</div></div>

    <!-- Custom Designations -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head">
        <strong>Designations & Rights</strong>
        <button class="btn secondary" id="addRoleBtn">+ New Designation</button>
      </div>
      <p class="kbd-note" style="margin-top:-6px;margin-bottom:14px;">Create named designations (e.g. CRE Service, Cashier, Receptionist) with their own permission sets. These appear in the Role dropdown when adding logins.</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Designation Name</th><th>Pages Accessible</th><th>Actions Allowed</th><th></th></tr></thead>
          <tbody id="customRoleBody"></tbody>
        </table>
      </div>
    </div>

    <!-- Logins -->
    <div class="card">
      <div class="card-head">
        <strong>Logins</strong>
        <button class="btn" id="addUserBtn">+ Add Login</button>
        <button class="btn secondary" id="bulkCreateLoginsBtn" style="margin-left:8px;">⚡ Bulk Create Employee Logins</button>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Name</th><th>Designation</th><th>Mobile</th><th>Email</th><th>Role</th><th>OTP</th><th></th></tr></thead>
          <tbody id="userBody"></tbody>
        </table>
      </div>
    </div>
  `;
  paintCustomRoleRows();
  paintUserRows();
  document.getElementById('addRoleBtn').addEventListener('click', () => openCustomRoleEditor(null));
  document.getElementById('addUserBtn').addEventListener('click', () => openUserEditor(null));
  document.getElementById('bulkCreateLoginsBtn').addEventListener('click', bulkCreateEmployeeLogins);
}

export function paintCustomRoleRows() {
  const tbody = document.getElementById('customRoleBody');
  if (!tbody) return;

  // Built-in roles shown with Edit permission button
  const builtIn = [
    { id:'ADMIN',         name:'Admin',         permsLabel:'All pages', actionsLabel:'All actions' },
    { id:'OWNER',         name:'Owner',         permsLabel:'All pages (view only)', actionsLabel:'None' },
    { id:'HR',            name:'HR',            permsLabel:'Dashboard, Behavioral, Employees, HR-Sheet', actionsLabel:'Upload data, Edit employees' },
    { id:'FLOOR_MANAGER', name:'Floor Manager', permsLabel:'Dashboard, Behavioral, Performance, Job Card, Complaints, Bodyshop, Rates', actionsLabel:'Upload data, Edit rates, Override targets' },
  ];

  let html = builtIn.map(r => `
    <tr style="background:rgba(0,0,0,0.02);">
      <td><b>${escapeHtml(r.name)}</b> <span class="kbd-note">(built-in)</span></td>
      <td class="kbd-note">${escapeHtml(r.permsLabel)}</td>
      <td class="kbd-note">${escapeHtml(r.actionsLabel)}</td>
      <td><button class="btn ghost" data-editbuiltin="${r.id}" style="padding:4px 10px;">Edit Permissions</button></td>
    </tr>`).join('');

  html += (APP.customRoles || []).map(cr => {
    const tabs = ALL_TAB_PERMS.filter(p => cr.permissions[p.key]).map(p => p.label).join(', ') || '—';
    const acts = ALL_ACTION_PERMS.filter(p => cr.permissions[p.key]).map(p => p.label).join(', ') || '—';
    return `<tr>
      <td><b>${escapeHtml(cr.name)}</b></td>
      <td class="kbd-note" style="max-width:260px;white-space:normal;">${escapeHtml(tabs)}</td>
      <td class="kbd-note" style="max-width:240px;white-space:normal;">${escapeHtml(acts)}</td>
      <td style="white-space:nowrap;">
        <button class="btn ghost" data-editrole="${cr.id}" style="padding:4px 10px;">Edit</button>
        <button class="btn ghost" data-delrole="${cr.id}" style="padding:4px 10px;color:var(--bad);">Delete</button>
      </td>
    </tr>`;
  }).join('');

  tbody.innerHTML = html;

  // Edit built-in role permissions
  tbody.querySelectorAll('[data-editbuiltin]').forEach(b => b.addEventListener('click', () => openBuiltInRoleEditor(b.dataset.editbuiltin)));
  tbody.querySelectorAll('[data-editrole]').forEach(b => b.addEventListener('click', () => openCustomRoleEditor(b.dataset.editrole)));
  tbody.querySelectorAll('[data-delrole]').forEach(b => b.addEventListener('click', () => {
    const cr = (APP.customRoles||[]).find(r => r.id === b.dataset.delrole);
    if (!cr) return;
    const inUse = APP.users.some(u => u.role === cr.id);
    if (inUse) { toast('Cannot delete — some logins are using this designation. Reassign them first.', true); return; }
    if (!confirmDestructive('Delete designation "' + cr.name + '"?')) return;
    APP.customRoles = APP.customRoles.filter(r => r.id !== cr.id);
    scheduleSave('customRoles', () => APP.customRoles);
    renderUsers(); toast('Designation deleted');
  }));
}

// Edit permissions of a built-in role (Admin, Owner, HR, Floor Manager)
export function openBuiltInRoleEditor(roleId) {
  const roleInfo = ROLE_PRESETS[roleId];
  if (!roleInfo) return;
  // Use stored overrides or fall back to system defaults
  const storedKey = 'builtinPerms_' + roleId;
  const stored = (APP.settings && APP.settings[storedKey]) || null;
  const currentPerms = stored || defaultPermissions(roleId);

  const checkboxes = ALL_TAB_PERMS.map(p => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" data-perm="${p.key}" ${currentPerms[p.key] ? 'checked' : ''}> ${escapeHtml(p.label)}
    </label>`).join('');
  const actionChecks = ALL_ACTION_PERMS.map(p => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" data-perm="${p.key}" ${currentPerms[p.key] ? 'checked' : ''}> ${escapeHtml(p.label)}
    </label>`).join('');

  openModal(`
    <h3>Edit Permissions — ${escapeHtml(roleInfo.label)}</h3>
    <div class="banner info" style="margin-bottom:12px;"><span>ℹ</span><div>Changes here affect ALL users with the ${escapeHtml(roleInfo.label)} role. Users already logged in will see changes on next login.</div></div>
    <b style="font-size:12px;text-transform:uppercase;color:var(--ink-soft);">Pages this role can view</b>
    <div style="columns:2;column-gap:16px;margin-top:10px;" id="br-tabs">${checkboxes}</div>
    <div class="divider"></div>
    <b style="font-size:12px;text-transform:uppercase;color:var(--ink-soft);">Actions this role can perform</b>
    <div style="margin-top:10px;" id="br-actions">${actionChecks}</div>
    <div class="modal-actions">
      <button class="btn ghost" id="br-reset">↻ Reset to Defaults</button>
      <button class="btn secondary" id="br-cancel">Cancel</button>
      <button class="btn" id="br-save">Save Changes</button>
    </div>
  `);

  document.getElementById('br-cancel').addEventListener('click', closeModal);
  document.getElementById('br-reset').addEventListener('click', () => {
    const def = defaultPermissions(roleId);
    document.querySelectorAll('#br-tabs [data-perm], #br-actions [data-perm]').forEach(cb => { cb.checked = !!def[cb.dataset.perm]; });
    toast('Reset to system defaults — click Save to apply');
  });
  document.getElementById('br-save').addEventListener('click', () => {
    const perms = {};
    document.querySelectorAll('#br-tabs [data-perm], #br-actions [data-perm]').forEach(cb => { perms[cb.dataset.perm] = cb.checked; });
    if (roleId === 'ADMIN') { perms.users = true; perms.settings = true; }
    if (!APP.settings) APP.settings = {};
    APP.settings[storedKey] = perms;
    // Also update all existing users with this role
    APP.users.forEach(u => { if (u.role === roleId) u.permissions = { ...perms }; });
    scheduleSave('settings', () => APP.settings);
    scheduleSave('users', () => APP.users);
    closeModal(); renderUsers();
    toast(roleInfo.label + ' permissions updated for all users with this role');
  });
}

export function openCustomRoleEditor(roleId) {
  const isNew = !roleId;
  const cr = isNew
    ? { id: uid('cr'), name: '', permissions: defaultPermissions('') }
    : (APP.customRoles||[]).find(r => r.id === roleId) || {};

  const checkboxes = ALL_TAB_PERMS.map(p => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" data-perm="${p.key}" ${cr.permissions[p.key] ? 'checked' : ''}> ${escapeHtml(p.label)}
    </label>`).join('');
  const actionChecks = ALL_ACTION_PERMS.map(p => `
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" data-perm="${p.key}" ${cr.permissions[p.key] ? 'checked' : ''}> ${escapeHtml(p.label)}
    </label>`).join('');

  openModal(`
    <h3>${isNew ? 'New Designation' : 'Edit Designation'}</h3>
    <div class="field"><label>Designation Name *</label>
      <input type="text" id="cr-name" value="${escapeHtml(cr.name||'')}" placeholder="e.g. CRE Service, Cashier, Receptionist">
    </div>
    <div class="divider"></div>
    <b style="font-size:12px;text-transform:uppercase;color:var(--ink-soft);">Pages this designation can view</b>
    <div style="columns:2;column-gap:16px;margin-top:10px;" id="cr-tabs">${checkboxes}</div>
    <div class="divider"></div>
    <b style="font-size:12px;text-transform:uppercase;color:var(--ink-soft);">Actions this designation can perform</b>
    <div style="margin-top:10px;" id="cr-actions">${actionChecks}</div>
    <div class="auth-error" id="cr-error" style="margin-top:10px;"></div>
    <div class="modal-actions">
      <button class="btn secondary" id="cr-cancel">Cancel</button>
      <button class="btn" id="cr-save">${isNew ? 'Create Designation' : 'Save Changes'}</button>
    </div>
  `);

  document.getElementById('cr-cancel').addEventListener('click', closeModal);
  document.getElementById('cr-save').addEventListener('click', () => {
    const name = document.getElementById('cr-name').value.trim();
    const err = document.getElementById('cr-error');
    if (!name) { err.textContent = 'Designation name is required.'; return; }
    const perms = {};
    document.querySelectorAll('#cr-tabs [data-perm], #cr-actions [data-perm]').forEach(cb => { perms[cb.dataset.perm] = cb.checked; });
    cr.name = name; cr.permissions = perms;
    if (isNew) { APP.customRoles = APP.customRoles || []; APP.customRoles.push(cr); }
    scheduleSave('customRoles', () => APP.customRoles);
    closeModal(); renderUsers();
    toast(isNew ? 'Designation "' + name + '" created' : 'Designation updated');
  });
}

export function paintUserRows() {
  const tbody = document.getElementById('userBody');
  tbody.innerHTML = APP.users.map(u => {
    const rp = getRoleInfo(u.role);
    const isSelf = u.id === SESSION.userId;
    return `<tr>
      <td><b>${escapeHtml(u.name)}</b>${isSelf ? ' <span class="kbd-note">(you)</span>' : ''}</td>
      <td>${escapeHtml(u.designation||'—')}</td>
      <td>${escapeHtml(u.mobile||'—')}</td>
      <td>${escapeHtml(u.email||'—')}</td>
      <td><span class="pill ${rp.color}">${rp.label}</span></td>
      <td><span class="pill pill-neutral" style="font-family:var(--font-mono);letter-spacing:4px;">${u._otp||'——'}</span>
          <button class="btn ghost" data-genotp="${u.id}" style="padding:3px 8px;font-size:11px;">↻ New OTP</button></td>
      <td style="white-space:nowrap;">
        <button class="btn ghost" data-edituser="${u.id}" style="padding:5px 10px;">Edit</button>
        ${!isSelf ? `<button class="btn ghost" data-deluser="${u.id}" style="padding:5px 10px;color:var(--bad);">Delete</button>` : ''}
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="7"><div class="empty-state">No users yet.</div></td></tr>`;
  tbody.querySelectorAll('[data-edituser]').forEach(b => b.addEventListener('click', () => openUserEditor(b.dataset.edituser)));
  tbody.querySelectorAll('[data-genotp]').forEach(b => b.addEventListener('click', () => {
    const otp = generateOtp(b.dataset.genotp);
    toast('New OTP generated: ' + otp);
    paintUserRows();
  }));
  tbody.querySelectorAll('[data-deluser]').forEach(b => b.addEventListener('click', () => {
    const u = APP.users.find(x => x.id === b.dataset.deluser);
    if (!u) return;
    if (u.role === 'ADMIN' && adminCount() <= 1) { toast('Cannot delete the last Admin account', true); return; }
    if (!confirmDestructive('Delete login for ' + u.name + '? This cannot be undone.')) return;
    APP.users = APP.users.filter(x => x.id !== u.id);
    Store.set('users', APP.users);
    paintUserRows();
    toast('Login for ' + u.name + ' deleted');
  }));
}

export function openUserEditor(userId) {
  const isNew = !userId;
  const u = isNew
    ? { id: uid('u'), name:'', designation:'', mobile:'', email:'', password:'', role:'FLOOR_MANAGER', permissions: defaultPermissions('FLOOR_MANAGER'), createdAt: new Date().toISOString() }
    : APP.users.find(x => x.id === userId);
  if (!u.permissions) u.permissions = defaultPermissions(u.role);

  // Build role options: 4 built-in + all custom designations
  const customRoleOptions = (APP.customRoles||[]).map(cr =>
    `<option value="${cr.id}" ${u.role===cr.id?'selected':''}>${escapeHtml(cr.name)}</option>`
  ).join('');
  const builtInOptions = Object.entries(ROLE_PRESETS).map(([r,rp]) =>
    `<option value="${r}" ${u.role===r?'selected':''}>${rp.label}</option>`
  ).join('');
  const roleSelectHtml = builtInOptions + (customRoleOptions ? `<optgroup label="── Custom Designations">${customRoleOptions}</optgroup>` : '');

  const permCheckboxes = (role) => {
    const p = role ? defaultPermissions(role) : (u.permissions || {});
    const viewHtml = ALL_TAB_PERMS.map(tp => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:5px;cursor:pointer;">
        <input type="checkbox" data-perm="${tp.key}" ${p[tp.key] ? 'checked' : ''}>
        ${escapeHtml(tp.label)}
      </label>`).join('');
    const actionHtml = ALL_ACTION_PERMS.map(ap => `
      <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:5px;cursor:pointer;">
        <input type="checkbox" data-perm="${ap.key}" ${p[ap.key] ? 'checked' : ''}>
        ${escapeHtml(ap.label)}
      </label>`).join('');
    return viewHtml + '<div class="divider" style="margin:10px 0;"></div><b style="font-size:11px;text-transform:uppercase;color:var(--ink-soft);">Edit Actions</b><div style="margin-top:8px;">' + actionHtml + '</div>';
  };

  openModal(`
    <h3>${isNew ? 'Add Login' : 'Edit Login'}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="field"><label>Full Name *</label><input type="text" id="uf-name" value="${escapeHtml(u.name)}"></div>
      <div class="field"><label>Designation</label><input type="text" id="uf-desig" value="${escapeHtml(u.designation||'')}"></div>
      <div class="field"><label>Mobile Number *</label><input type="text" inputmode="numeric" id="uf-mobile" value="${escapeHtml(u.mobile||'')}"></div>
      <div class="field"><label>Email Address</label><input type="email" id="uf-email" value="${escapeHtml(u.email||'')}"></div>
      <div class="field"><label>Password (default: Arihant123)</label><input type="password" id="uf-pass" value="${escapeHtml(u.password||'')}" placeholder="${isNew ? 'Default: Arihant123' : 'Leave blank to keep current'}"></div>
      <div class="field"><label>Role / Designation</label>
        <select id="uf-role">
          ${roleSelectHtml}
        </select>
        ${(APP.customRoles||[]).length === 0 ? '<div class="kbd-note" style="margin-top:4px;">Create custom designations in the <b>Designations &amp; Rights</b> section above to see them here.</div>' : ''}
      </div>
    </div>
    <div class="field" style="margin-top:6px;">
      <label>Link to Employee Record <span class="kbd-note">(for Employee/Team Lead logins)</span></label>
      <select id="uf-empid" style="width:100%;">
        <option value="">— Not linked —</option>
        ${APP.employees.filter(e=>e.status==='ACTIVE').sort((a,b)=>a.srNo-b.srNo).map(e =>
          '<option value="' + e.id + '" ' + (u.empId===e.id?'selected':'') + '>' + escapeHtml(e.nameHR) + ' (' + escapeHtml(e.designation||e.department||'') + ')</option>'
        ).join('')}
      </select>
    </div>
    <div class="divider"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <b style="font-size:12.5px;">Page Access</b>
      <button class="btn ghost" id="uf-resetperms" style="font-size:11px;padding:4px 10px;">↻ Reset to Role Defaults</button>
    </div>
    <div id="uf-perms" style="columns:2;column-gap:20px;">${permCheckboxes(isNew ? u.role : null)}</div>
    <div class="auth-error" id="uf-error" style="margin-top:10px;"></div>
    ${!isNew && u.role!=='ADMIN' ? `<div class="divider"></div><button class="btn danger" id="uf-delete">Delete Login</button>` : ''}
    <div class="modal-actions">
      <button class="btn secondary" id="uf-cancel">Cancel</button>
      <button class="btn" id="uf-save">${isNew ? 'Add Login' : 'Save Changes'}</button>
    </div>
  `);

  // Role change → update permission checkboxes
  document.getElementById('uf-role').addEventListener('change', e => {
    document.getElementById('uf-perms').innerHTML = permCheckboxes(e.target.value);
  });
  document.getElementById('uf-resetperms').addEventListener('click', () => {
    const role = document.getElementById('uf-role').value;
    document.getElementById('uf-perms').innerHTML = permCheckboxes(role);
  });

  document.getElementById('uf-cancel').addEventListener('click', closeModal);
  document.getElementById('uf-save').addEventListener('click', () => {
    const name = document.getElementById('uf-name').value.trim();
    const desig = document.getElementById('uf-desig').value.trim();
    const mobile = document.getElementById('uf-mobile').value.replace(/\D/g,'');
    const email = document.getElementById('uf-email').value.trim().toLowerCase();
    const pass = document.getElementById('uf-pass').value;
    const role = document.getElementById('uf-role').value;
    const err = document.getElementById('uf-error');
    if (!name) { err.textContent = 'Name is required.'; return; }
    if (mobile.length < 10) { err.textContent = 'Enter a valid 10-digit mobile number.'; return; }
    if (isNew && !pass) { err.textContent = 'Set a password for this login.'; return; }
    if (!isNew && u.role === 'ADMIN' && role !== 'ADMIN' && adminCount() <= 1) { err.textContent = 'There must be at least one Admin.'; return; }
    // Collect permissions from checkboxes
    const perms = {};
    document.querySelectorAll('#uf-perms [data-perm]').forEach(cb => { perms[cb.dataset.perm] = cb.checked; });
    if (role === 'ADMIN') { perms.users = true; perms.settings = true; }
    // Safety net: if no tab is enabled and a preset role was chosen, apply role defaults
    const isBuiltIn = !!ROLE_PRESETS[role];
    if (ALL_TAB_PERMS.every(tp => !perms[tp.key])) {
      Object.assign(perms, defaultPermissions(role));
    }
    const empIdVal = document.getElementById('uf-empid')?.value || '';
    u.name = name; u.designation = desig; u.mobile = mobile; u.email = email;
    if (pass) u.password = pass; else if (isNew) u.password = 'Arihant123';
    u.role = role; u.permissions = perms; u.empId = empIdVal || null;
    if (!u._otp) u._otp = String(Math.floor(100000 + Math.random() * 900000));
    if (isNew) APP.users.push(u);
    Store.set('users', APP.users); // immediate — no debounce
    Store.set('users_backup', APP.users).catch(()=>{}); // backup
    closeModal(); renderUsers();
    if (u.id === SESSION.userId) { paintCurrentUserPill(); renderNav(); }
    toast(isNew ? 'Login added' : 'Login updated');
  });

  if (!isNew && u.role !== 'ADMIN') {
    document.getElementById('uf-delete').addEventListener('click', () => {
      if (u.id === SESSION.userId) { toast('You cannot delete the login you\'re currently using', true); return; }
      if (!confirmDestructive('Delete login for ' + u.name + '?')) return;
      APP.users = APP.users.filter(x => x.id !== u.id);
      Store.set('users', APP.users); // immediate
      closeModal(); renderUsers(); toast('Login deleted');
    });
  }
}

// ── Bulk Create Employee Logins ───────────────────────────────────────────
export function bulkCreateEmployeeLogins() {
  const active = APP.employees.filter(e => e.status === 'ACTIVE');
  const existingEmpIds = new Set(APP.users.map(u => u.empId).filter(Boolean));
  const toCreate = active.filter(e => !existingEmpIds.has(e.id));
  if (toCreate.length === 0) { toast('All active employees already have logins.'); return; }
  const created = [], noMobile = [];
  for (const emp of toCreate) {
    const mobile = (emp.mobile || '').replace(/\D/g,'');
    if (!mobile || mobile.length < 10) { noMobile.push(emp.nameHR); continue; }
    const isLead = TEAM_LEAD_DESIGS.some(d => (emp.designation||'').toLowerCase().includes(d.split(' ')[0]));
    const role = isLead ? 'TEAM_LEAD' : 'EMPLOYEE';
    APP.users.push({ id: uid('u'), name: toTitleCase(emp.nameHR), designation: emp.designation||'',
      mobile, email:'', password:'Arihant123', role, empId: emp.id,
      permissions: defaultPermissions(role), _otp: String(Math.floor(100000+Math.random()*900000)),
      createdAt: new Date().toISOString() });
    created.push(emp.nameHR);
  }
  if (created.length > 0) {
    Store.set('users', APP.users);
    Store.set('users_backup', APP.users).catch(()=>{});
    paintUserRows();
    toast(created.length + ' logins created.' + (noMobile.length > 0 ? ' ' + noMobile.length + ' skipped (no mobile).' : ''));
  } else {
    toast('No logins created — add mobile numbers in Employees tab first.', true);
  }
}
