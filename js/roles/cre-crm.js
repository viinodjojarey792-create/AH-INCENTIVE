import { APP } from '../core/state.js';
import { escapeHtml, toTitleCase, fmt, norm, toast, uid, parseDateFlexible, monthKeyOf, activeEmployees } from '../core/utils.js';
import { hrFor } from '../core/months.js';
import { canDo, isAdmin } from '../core/auth.js';
import { SB } from '../core/config.js';
import { openModal, closeModal, dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { calcAllFinalRows } from '../core/incentive-engine.js';

// CRE and CRM have no calcPerformance branch in the original app — they are
// behavioral-incentive-only roles, so nothing is registered here for
// calcPerformance/calcEarnedPerformance (the incentive-engine's dispatcher
// already returns a zeroed result when getRole() finds nothing registered).

/* =========================================================================
   Customer Database — backed by Supabase `customers` table
   Shared by the CRM dashboard and the Customers tab.
   ========================================================================= */
let customerSearch = '';
export let customerCache = []; // in-memory cache loaded from Supabase

async function loadCustomers() {
  try {
    const rows = await SB.select('customers');
    customerCache = rows || [];
  } catch (e) { customerCache = []; }
}

export async function saveCustomer(cust) {
  cust.updated_at = new Date().toISOString();
  return SB.upsert('customers', cust);
}

async function deleteCustomer(id) {
  return SB.delete('customers', { id });
}

export function getCustomerCache() { return customerCache; }
export function setCustomerCache(v) { customerCache = v; }

export async function renderCustomers() {
  const panel = document.getElementById('tab-customers');
  panel.innerHTML = `<div class="card"><div style="text-align:center;padding:30px;color:var(--ink-soft);">Loading customers…</div></div>`;
  await loadCustomers();

  const canEdit = canDo('edit_employees') || isAdmin();

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <strong>Customer Database</strong>
        <div style="display:flex;gap:10px;align-items:center;">
          <div class="search-box"><span>🔍</span><input type="text" id="custSearch" placeholder="Search name, mobile, or vehicle…" value="${escapeHtml(customerSearch)}" style="width:220px;"></div>
          ${canEdit ? `<button class="btn" id="addCustBtn">+ Add Customer</button>` : ''}
        </div>
      </div>
      <div class="stat-row" style="margin-bottom:10px;">
        <div class="stat"><div class="label">Total Customers</div><div class="value">${customerCache.length}</div></div>
        <div class="stat"><div class="label">Vehicles Registered</div><div class="value">${customerCache.filter(c=>c.vehicle_number).length}</div></div>
      </div>
      <div class="table-scroll table-scroll-frozen">
        <table>
          <thead><tr>
            <th class="col-sticky-1" style="min-width:40px;">Sr</th>
            <th class="col-sticky-2" style="min-width:180px;">Name</th>
            <th>Mobile</th><th>Vehicle No.</th><th>Model</th>
            <th>Last Service</th><th class="num">Visits</th><th></th>
          </tr></thead>
          <tbody id="custBody"></tbody>
        </table>
      </div>
    </div>
  `;

  paintCustomerRows(canEdit);

  document.getElementById('custSearch').addEventListener('input', e => {
    customerSearch = e.target.value;
    paintCustomerRows(canEdit);
    const el = document.getElementById('custSearch');
    el.focus(); el.setSelectionRange(el.value.length, el.value.length);
  });
  if (canEdit) document.getElementById('addCustBtn').addEventListener('click', () => openCustomerEditor(null));
}

function paintCustomerRows(canEdit) {
  const q = norm(customerSearch);
  const filtered = customerCache.filter(c =>
    norm(c.name||'').includes(q) ||
    norm(c.mobile||'').includes(q) ||
    norm(c.vehicle_number||'').includes(q) ||
    norm(c.frame_number||'').includes(q)
  );
  const tbody = document.getElementById('custBody');
  tbody.innerHTML = filtered.map((c, i) => `
    <tr>
      <td class="col-sticky-1">${i+1}</td>
      <td class="col-sticky-2"><b>${escapeHtml(c.name||'—')}</b>${c.alternate_mobile ? `<div class="kbd-note">${escapeHtml(c.alternate_mobile)}</div>` : ''}</td>
      <td>${escapeHtml(c.mobile||'—')}</td>
      <td>${escapeHtml(c.vehicle_number||'—')}</td>
      <td>${escapeHtml(c.model_name||'—')}</td>
      <td>${c.last_service_date ? new Date(c.last_service_date).toLocaleDateString('en-IN') : '—'}</td>
      <td class="num">${c.total_visits||0}</td>
      <td>${canEdit ? `<button class="btn ghost" data-editcust="${c.id}" style="padding:4px 10px;">Edit</button>` : ''}</td>
    </tr>
  `).join('') || `<tr><td colspan="8"><div class="empty-state">${customerSearch ? 'No customers match your search.' : 'No customers yet. Click + Add Customer to begin.'}</div></td></tr>`;
  if (canEdit) {
    tbody.querySelectorAll('[data-editcust]').forEach(b => b.addEventListener('click', () => openCustomerEditor(b.dataset.editcust)));
  }
}

function openCustomerEditor(custId) {
  const isNew = !custId;
  const c = isNew
    ? { id: uid('c'), name:'', mobile:'', alternate_mobile:'', email:'', vehicle_number:'', frame_number:'', model_name:'', registration_date:'', last_service_date:'', total_visits:0, notes:'' }
    : customerCache.find(x => x.id === custId) || {};

  openModal(`
    <h3>${isNew ? 'Add Customer' : 'Edit Customer'}</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      <div class="field" style="grid-column:1/-1;"><label>Customer Name *</label><input type="text" id="cf-name" value="${escapeHtml(c.name||'')}"></div>
      <div class="field"><label>Mobile Number *</label><input type="text" inputmode="numeric" id="cf-mobile" value="${escapeHtml(c.mobile||'')}"></div>
      <div class="field"><label>Alternate Mobile</label><input type="text" inputmode="numeric" id="cf-mobile2" value="${escapeHtml(c.alternate_mobile||'')}"></div>
      <div class="field"><label>Email</label><input type="email" id="cf-email" value="${escapeHtml(c.email||'')}"></div>
      <div class="field"><label>Total Visits</label><input type="number" id="cf-visits" value="${c.total_visits||0}" min="0"></div>
      <div class="field"><label>Vehicle Number</label><input type="text" id="cf-vno" value="${escapeHtml(c.vehicle_number||'')}" style="text-transform:uppercase;"></div>
      <div class="field"><label>Frame / Chassis Number</label><input type="text" id="cf-frame" value="${escapeHtml(c.frame_number||'')}"></div>
      <div class="field"><label>Model Name</label><input type="text" id="cf-model" value="${escapeHtml(c.model_name||'')}"></div>
      <div class="field"><label>Registration Date</label><input type="date" id="cf-regdate" value="${c.registration_date||''}"></div>
      <div class="field"><label>Last Service Date</label><input type="date" id="cf-lastservice" value="${c.last_service_date||''}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Notes</label><textarea id="cf-notes" rows="3" style="width:100%;resize:vertical;">${escapeHtml(c.notes||'')}</textarea></div>
    </div>
    <div class="auth-error" id="cf-error"></div>
    ${!isNew ? `<div class="divider"></div><button class="btn danger" id="cf-delete">Delete Customer</button>` : ''}
    <div class="modal-actions">
      <button class="btn secondary" id="cf-cancel">Cancel</button>
      <button class="btn" id="cf-save">${isNew ? 'Add Customer' : 'Save Changes'}</button>
    </div>
  `);

  document.getElementById('cf-cancel').addEventListener('click', closeModal);
  document.getElementById('cf-save').addEventListener('click', async () => {
    const name = document.getElementById('cf-name').value.trim();
    const mobile = document.getElementById('cf-mobile').value.replace(/\D/g,'');
    const err = document.getElementById('cf-error');
    if (!name) { err.textContent = 'Customer name is required.'; return; }
    if (!mobile) { err.textContent = 'Mobile number is required.'; return; }
    Object.assign(c, {
      name, mobile,
      alternate_mobile: document.getElementById('cf-mobile2').value.trim(),
      email: document.getElementById('cf-email').value.trim(),
      vehicle_number: document.getElementById('cf-vno').value.trim().toUpperCase(),
      frame_number: document.getElementById('cf-frame').value.trim(),
      model_name: document.getElementById('cf-model').value.trim(),
      registration_date: document.getElementById('cf-regdate').value || null,
      last_service_date: document.getElementById('cf-lastservice').value || null,
      total_visits: parseInt(document.getElementById('cf-visits').value)||0,
      notes: document.getElementById('cf-notes').value.trim(),
    });
    const btn = document.getElementById('cf-save');
    btn.textContent = 'Saving…'; btn.disabled = true;
    const ok = await saveCustomer(c);
    if (!ok) { err.textContent = 'Save failed — check your internet connection and try again.'; btn.textContent = isNew ? 'Add Customer' : 'Save Changes'; btn.disabled = false; return; }
    if (isNew) customerCache.push(c);
    else { const idx = customerCache.findIndex(x => x.id === c.id); if (idx >= 0) customerCache[idx] = c; }
    closeModal();
    paintCustomerRows(true);
    toast(isNew ? 'Customer added' : 'Customer updated');
  });

  if (!isNew) {
    document.getElementById('cf-delete').addEventListener('click', async () => {
      if (!confirm('Delete customer record for ' + (c.name||'this customer') + '? This cannot be undone.')) return;
      await deleteCustomer(c.id);
      customerCache = customerCache.filter(x => x.id !== c.id);
      closeModal(); paintCustomerRows(true); toast('Customer deleted');
    });
  }
}

/* ── CRE Dashboard ──────────────────────────────────────────── */
export function renderCREDashboard(panel, mk, m) {
  const cres = activeEmployees().filter(e => (e.designation||'').toLowerCase().includes('cre') || (e.department||'').toLowerCase().includes('customer relation'));
  const complaints = m.complaints || {};
  const allRows = calcAllFinalRows(mk, false);

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">📞 CRE Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">CRE Staff</div><div class="stat-value">${cres.length}</div></div>
      <div class="stat-card"><div class="stat-label">HMSI Complaints</div><div class="stat-value">${Object.values(complaints).reduce((s,c)=>s+(c.count||0),0)}</div></div>
      <div class="stat-card"><div class="stat-label">Employees with Complaints</div><div class="stat-value">${Object.keys(complaints).length}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><strong>CRE Staff — Behavioral Incentive</strong></div>
      <div class="table-scroll"><table>
        <thead><tr><th>SR</th><th>Name</th><th>Designation</th><th>Leaves</th><th>Late Marks</th><th>Tobacco</th><th>Complaints</th><th>Behavioral ₹</th><th>Final ₹</th></tr></thead>
        <tbody>${cres.map((e, i) => {
          const hr = hrFor(mk, e.id); const row = allRows.find(r => r.emp.id === e.id);
          const compCount = complaints[e.id] ? complaints[e.id].count : 0;
          return `<tr><td>${i+1}</td><td><b>${escapeHtml(toTitleCase(e.nameHR))}</b></td><td>${escapeHtml(e.designation||'—')}</td>
            <td class="num">${hr.actualAbsentee}</td><td class="num">${hr.lateMarks}</td>
            <td style="text-align:center;"><span class="pill ${hr.tobacco==='YES'?'pill-amber':'pill-neutral'}">${hr.tobacco==='YES'?'YES':'NO'}</span></td>
            <td class="num" style="color:${compCount>0?'var(--bad)':'var(--good)'};">${compCount}</td>
            <td class="num">${fmt(row ? row.behavioral.total : 0)}</td>
            <td class="num"><b>${fmt(row ? row.finalAmount : 0)}</b></td></tr>`;
        }).join('') || '<tr><td colspan="9"><div class="empty-state">No CRE staff found. Set designation to include "CRE".</div></td></tr>'}
        </tbody></table></div></div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

/* ── CRM Dashboard ──────────────────────────────────────────── */
export function renderCRMDashboard(panel, mk, m) {
  const customers = customerCache || [];
  const recentCusts = customers.filter(c => {
    if (!c.last_service_date) return false;
    const d = parseDateFlexible(c.last_service_date);
    return d && monthKeyOf(d) === mk;
  });

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">🤝 CRM Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">Total Customers (DB)</div><div class="stat-value">${customers.length}</div></div>
      <div class="stat-card"><div class="stat-label">Serviced This Month</div><div class="stat-value">${recentCusts.length}</div></div>
      <div class="stat-card"><div class="stat-label">HMSI Complaints</div><div class="stat-value">${Object.values(m.complaints||{}).reduce((s,c)=>s+(c.count||0),0)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><strong>Recent Customers — ${escapeHtml(m.label)}</strong></div>
      ${recentCusts.length ? `<div class="table-scroll" style="max-height:400px;"><table>
        <thead><tr><th>SR</th><th>Customer Name</th><th>Mobile</th><th>Vehicle No</th><th>Model</th><th>Last Service</th></tr></thead>
        <tbody>${recentCusts.slice(0,100).map((c,i)=>`<tr>
          <td>${i+1}</td><td><b>${escapeHtml(c.name||'—')}</b></td>
          <td>${escapeHtml(c.mobile||'—')}</td><td>${escapeHtml(c.vehicle_number||'—')}</td>
          <td>${escapeHtml(c.model_name||'—')}</td><td>${escapeHtml(c.last_service_date||'—')}</td>
        </tr>`).join('')}</tbody></table></div>`
      : '<div class="banner"><span>ℹ</span><div>No customer service records for this month. Upload the customer database to populate this view.</div></div>'}
    </div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}
