import { APP, CATEGORY_LABELS } from '../state.js';
import { money, norm, escapeHtml, toTitleCase, uid, toast, downloadFile, empById, confirmDestructive } from '../utils.js';
import { scheduleSave } from '../store.js';
import { canDo, isAdmin } from '../auth.js';
import { openModal, closeModal, rerenderActiveTab } from '../ui-shell.js';
import { makeColumnsResizable } from '../import-handlers.js';

/* =========================================================================
   Employees tab
   ========================================================================= */
let empSearch = '';
export const CATEGORY_OPTIONS = ['NONE','TECHNICIAN','ADVISOR','SUPERVISOR','NARODE','WM','SERVICE_MANAGER','STORE_MANAGER','WARRANTY','BODYSHOP'];

export function renderEmployees() {
  const panel = document.getElementById('tab-employees');
  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <strong>Employee Roster</strong>
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="search-box"><span>🔍</span><input type="text" id="empSearch" placeholder="Search name…" value="${escapeHtml(empSearch)}"></div>
          ${canDo('edit_employees') ? `<button class="btn" id="addEmpBtn">+ Add Employee</button>` : ''}
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Sr</th><th>Name</th><th>Gender</th><th>Department</th><th>Designation</th>
            <th>Category</th><th>Status</th><th class="num">Fallback Target ₹</th><th>Supervisor</th><th>Hirise Aliases</th><th></th>
          </tr></thead>
          <tbody id="empBody"></tbody>
        </table>
      </div>
      <div class="footer-note">Category determines which performance formula applies. Technician/Advisor targets are calculated automatically from the matching prior-year 6-month average in the Job Card upload — the Fallback Target here only applies when that window has no data (e.g. a new hire). Hirise aliases are the exact spellings of this person's name as they appear in the HMSI Job Card / Complaint exports — add every variant you see so revenue and complaints match correctly.</div>
    </div>
  `;
  paintEmployeeRows();
  document.getElementById('empSearch').addEventListener('input', (e) => { empSearch = e.target.value; paintEmployeeRows(); });
  if (canDo('edit_employees')) document.getElementById('addEmpBtn')?.addEventListener('click', () => openEmployeeEditor(null));
}

/* =========================================================================
   Reporting Chain section — shows every employee mapped across 4 levels
   plus a fixed MD column. Admin can edit/clear any cell via a dropdown.
   ========================================================================= */
let rcEditState = {}; // {empId_level: true} — tracks which cells are in edit mode

export function getReportingLevels(empId) {
  return (APP.reportingChain[empId] || [null, null, null, null]).concat([null, null, null, null]).slice(0, 4);
}
export function setReportingLevel(empId, levelIdx, value) {
  if (!APP.reportingChain[empId]) APP.reportingChain[empId] = [null, null, null, null];
  APP.reportingChain[empId][levelIdx] = value || null;
  scheduleSave('reportingChain', () => APP.reportingChain);
}
export function empNameById(id) {
  if (!id) return null;
  const e = empById(id);
  return e ? e.nameHR : null;
}

/* =========================================================================
   HiRise Code Mapping Tab
   Maps HiRise codes (like MH060005SENH0029) to employee records.
   Stored in APP.hiriseMap = { code: { empId, hiriseName, type } }
   Affects job card achievement lookups and target calculations.
========================================================================= */
export const HIRISE_SEED = [
  // Technicians / Floor Staff
  { code:'MH060005SE051',      hiriseName:'Shrawan Hingole',                       type:'tech' },
  { code:'MH060005SE030',      hiriseName:'Vishal Aihre',                          type:'tech' },
  { code:'MH060005SE026',      hiriseName:'Khandu Katare',                         type:'tech' },
  { code:'MH060005SENH0101',   hiriseName:'Omkar Mutekar',                         type:'tech' },
  { code:'MH060005SENH0115',   hiriseName:'Akash Nikalje',                         type:'tech' },
  { code:'MH060005SENH0065',   hiriseName:'Afsar Kasim Shaikh',                    type:'tech' },
  { code:'MH060005SENH0121',   hiriseName:'Balerao Sandeep',                       type:'tech' },
  { code:'MH060005SENH0097',   hiriseName:'Sandip Laxman Bhalerao',                type:'tech' },
  { code:'MH060005SENH0105',   hiriseName:'Bhumare Bholeshankar',                  type:'tech' },
  { code:'MH060005SENH0029',   hiriseName:'Huzaif Khan Abid Khan',                 type:'tech' },
  { code:'MH060005SENH0049',   hiriseName:'Iliyas Beg Farahat Beg',                type:'tech' },
  { code:'MH060005SENH0104',   hiriseName:'Kale Saurabh',                          type:'tech' },
  { code:'MH060005SENH0094',   hiriseName:'Khan Arbaz',                            type:'tech' },
  { code:'MH060005NA090',      hiriseName:'Khan Feroz',                            type:'tech' },
  { code:'MH060005SENH0103',   hiriseName:'Khan Matin',                            type:'tech' },
  { code:'MH060005SENH0129',   hiriseName:'Khizar Hilabi Khaled',                  type:'tech' },
  { code:'MH060005SENH0108',   hiriseName:'Majid Shaikh',                          type:'tech' },
  { code:'MH060005SENH0018',   hiriseName:'Mohd Abdul Rafat Mohd Abdul Rashid',    type:'tech' },
  { code:'MH060005SENH0061',   hiriseName:'Mate Vijay',                            type:'tech' },
  { code:'MH060005NA006',      hiriseName:'Pardeshi Ashok',                        type:'tech' },
  { code:'MH060005SENH0020',   hiriseName:'Raut Amol',                             type:'tech' },
  { code:'MH060005SENH0109',   hiriseName:'Sayyad Salman',                         type:'tech' },
  { code:'MH060005SENH0123',   hiriseName:'Shaha Tausif',                          type:'tech' },
  { code:'MH060005SENH0107',   hiriseName:'Shaikh Afroz',                          type:'tech' },
  { code:'MH060005SENH0126',   hiriseName:'Shaikh Ashrif',                         type:'tech' },
  { code:'MH060005SENH0064',   hiriseName:'Shaikh Feroz',                          type:'tech' },
  { code:'MH060005NA089',      hiriseName:'Shaikh Nisar Shabbir',                  type:'tech' },
  { code:'MH060005SENH0128',   hiriseName:'Shaikh Ismail Shaikh Irfan',            type:'tech' },
  { code:'MH060005SENH0066',   hiriseName:'Syed Murad Syed Sheru',                 type:'tech' },
  { code:'MH060005SENH0046',   hiriseName:'Shaikh Iqlasuddin Shaikh Gayasuddin',   type:'tech' },
  { code:'MH060005SENH0047',   hiriseName:'Syed Tareq Syed Mukhtar',               type:'tech' },
  { code:'MH060005SENH0125',   hiriseName:'Tohid Shaikh',                          type:'tech' },
  // Service Advisors
  { code:'MH060005SE030',      hiriseName:'Vishal Jagnnath Aher',                  type:'advisor' },
  { code:'MH060005SE026',      hiriseName:'Khandu Baban Katare',                   type:'advisor' },
  { code:'MH060005SE051',      hiriseName:'Shravankumar Ingole',                   type:'advisor' },
  { code:'MH060005SE004',      hiriseName:'Mukesh Gundle',                         type:'advisor' },
  { code:'MH060005SE052',      hiriseName:'Anil Bhagwan Khare',                    type:'advisor' },
  { code:'MH060005SE055',      hiriseName:'Utkarsh Mahajan',                       type:'advisor' },
  { code:'MH060005SE056',      hiriseName:'Omkar Mutekar',                         type:'advisor' },
  { code:'MH060005SENH0115',   hiriseName:'Akash Subhash Nikalje',                 type:'advisor' },
  { code:'MH060005SENH0101',   hiriseName:'Omkar Mutekar',                         type:'advisor' },
];

// Auto-match a hirise name to an employee by normalized name similarity
export function hiriseAutoMatch(hiriseName) {
  const h = norm(hiriseName);
  // Exact norm match
  let emp = APP.employees.find(e => norm(e.nameHR) === h);
  if (emp) return emp.id;
  // Check if hirise name words are all contained in employee name or vice versa
  const hw = h.split('').join(''); // already normalized
  emp = APP.employees.find(e => {
    const en = norm(e.nameHR);
    return en.includes(hw) || hw.includes(en);
  });
  if (emp) return emp.id;
  // Partial: first word + last word match
  const parts = hiriseName.toLowerCase().trim().split(/\s+/);
  if (parts.length >= 2) {
    const first = norm(parts[0]), last = norm(parts[parts.length - 1]);
    emp = APP.employees.find(e => {
      const en = norm(e.nameHR);
      return en.includes(first) && en.includes(last);
    });
  }
  return emp ? emp.id : null;
}

// Resolve a hirise code OR name to employee id (used in job card lookup)
export function resolveHirise(codeOrName) {
  const n = norm(codeOrName);
  // Direct code match
  if (APP.hiriseMap[n]) return APP.hiriseMap[n].empId;
  if (APP.hiriseMap[codeOrName]) return APP.hiriseMap[codeOrName].empId;
  return null;
}

export function renderHiriseMapTab() {
  const panel = document.getElementById('tab-hirisemap');
  const canEdit = isAdmin() || canDo('edit_employees');
  if (!APP.hiriseMap) APP.hiriseMap = {};

  // Seed with provided data if empty
  if (Object.keys(APP.hiriseMap).length === 0) {
    let seeded = 0;
    for (const s of HIRISE_SEED) {
      const key = s.code + '_' + s.type;
      if (!APP.hiriseMap[key]) {
        const empId = hiriseAutoMatch(s.hiriseName);
        APP.hiriseMap[key] = { code: s.code, hiriseName: s.hiriseName, type: s.type, empId: empId || null };
        seeded++;
      }
    }
    if (seeded > 0) scheduleSave('hiriseMap', () => APP.hiriseMap);
  }

  const entries = Object.entries(APP.hiriseMap).sort((a, b) =>
    (a[1].type || '').localeCompare(b[1].type || '') || a[1].code.localeCompare(b[1].code)
  );

  const matched   = entries.filter(([, v]) => v.empId).length;
  const unmatched = entries.filter(([, v]) => !v.empId).length;

  const empOptions = APP.employees
    .filter(e => e.status !== 'INACTIVE')
    .sort((a,b) => (a.nameHR||'').localeCompare(b.nameHR||''))
    .map(e => `<option value="${e.id}">${escapeHtml(toTitleCase(e.nameHR))} (${escapeHtml(e.designation||'')})</option>`)
    .join('');

  panel.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-head"><strong>🔗 HiRise Code Mapping</strong></div>
      <p class="kbd-note" style="margin-bottom:12px;">
        Maps HiRise IDs and names to employee records. When job card data uses a HiRise code or name,
        the system resolves it to the correct employee for achievement calculations.
        <b>All names displayed in Title Case.</b>
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="stat"><div class="label">Total Mappings</div><div class="value">${entries.length}</div></div>
        <div class="stat"><div class="label">Matched ✅</div><div class="value" style="color:var(--good);">${matched}</div></div>
        <div class="stat"><div class="label">Unmatched ⚠</div><div class="value" style="color:${unmatched>0?'var(--bad)':'var(--good)'};">${unmatched}</div></div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
        ${canEdit ? `
        <button class="btn" id="hrAutoMatchBtn">⚡ Auto-Match All Unmatched</button>
        <button class="btn secondary" id="hrAddRowBtn">+ Add New Mapping</button>
        ` : ''}
        <button class="btn secondary" id="hrExportBtn">📥 Export CSV</button>
      </div>
      <div id="hrMapStatus" style="font-size:12px;min-height:18px;margin-bottom:8px;"></div>
    </div>

    <div class="card">
      <div class="table-scroll" style="max-height:65vh;">
        <table id="hiriseTable" style="width:100%;border-collapse:collapse;table-layout:auto;">
          <thead><tr>
            <th style="min-width:180px;">HiRise Code</th>
            <th style="min-width:180px;">Name in HiRise System</th>
            <th style="min-width:80px;">Type</th>
            <th style="min-width:220px;">Mapped Employee</th>
            <th style="min-width:120px;">Department</th>
            <th style="min-width:60px;text-align:center;">Status</th>
            ${canEdit ? '<th style="min-width:60px;"></th>' : ''}
          </tr></thead>
          <tbody>
            ${entries.map(([key, v]) => {
              const emp = v.empId ? APP.employees.find(e => e.id === v.empId) : null;
              return `<tr data-hrkey="${escapeHtml(key)}">
                <td style="font-family:var(--font-mono);font-size:11.5px;">${escapeHtml(v.code)}</td>
                <td><b>${escapeHtml(toTitleCase(v.hiriseName))}</b></td>
                <td><span class="pill pill-neutral" style="font-size:10.5px;">${v.type==='advisor'?'Advisor':'Tech'}</span></td>
                <td>
                  ${canEdit
                    ? `<select class="cell-input hr-emp-sel" data-hrkey="${escapeHtml(key)}" style="width:100%;font-size:11.5px;">
                        <option value="">— Not mapped —</option>
                        ${empOptions}
                       </select>`
                    : `<span>${emp ? escapeHtml(toTitleCase(emp.nameHR)) : '<span style="color:var(--bad);">Not mapped</span>'}</span>`
                  }
                </td>
                <td style="font-size:11px;color:var(--ink-soft);">${emp ? escapeHtml(emp.department||'—') : '—'}</td>
                <td style="text-align:center;font-size:16px;">${emp ? '✅' : '❌'}</td>
                ${canEdit ? `<td><button class="btn ghost hr-del-btn" data-hrkey="${escapeHtml(key)}" style="color:var(--bad);font-size:13px;padding:2px 8px;">🗑</button></td>` : ''}
              </tr>`;
            }).join('') || `<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--ink-soft);">No mappings yet. Click "Auto-Match All" to get started.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;

  // Set dropdown values to current mapped employee
  entries.forEach(([key, v]) => {
    const sel = panel.querySelector(`select[data-hrkey="${key}"]`);
    if (sel && v.empId) sel.value = v.empId;
  });

  // Wire employee selection dropdowns
  if (canEdit) {
    panel.querySelectorAll('.hr-emp-sel').forEach(sel => {
      sel.addEventListener('change', ev => {
        const key = ev.target.dataset.hrkey;
        if (APP.hiriseMap[key]) {
          APP.hiriseMap[key].empId = ev.target.value || null;
          // Add code as alias to the employee
          if (ev.target.value) applyHiriseAlias(ev.target.value, APP.hiriseMap[key]);
          scheduleSave('hiriseMap', () => APP.hiriseMap);
          scheduleSave('employees', () => APP.employees);
        }
      });
    });

    // Auto-match all unmatched
    document.getElementById('hrAutoMatchBtn')?.addEventListener('click', () => {
      let matched2 = 0;
      for (const [key, v] of Object.entries(APP.hiriseMap)) {
        if (!v.empId) {
          const empId = hiriseAutoMatch(v.hiriseName);
          if (empId) { v.empId = empId; applyHiriseAlias(empId, v); matched2++; }
        }
      }
      scheduleSave('hiriseMap', () => APP.hiriseMap);
      scheduleSave('employees', () => APP.employees);
      document.getElementById('hrMapStatus').innerHTML = `<span style="color:var(--good)">✓ Auto-matched ${matched2} new entries</span>`;
      renderHiriseMapTab();
      toast(`Auto-matched ${matched2} HiRise entries`);
    });

    // Add new row
    document.getElementById('hrAddRowBtn')?.addEventListener('click', () => {
      const code = prompt('Enter HiRise Code (e.g. MH060005SENH0099):');
      if (!code) return;
      const name = prompt('Enter Name as it appears in HiRise:');
      if (!name) return;
      const type = confirm('Is this a Service Advisor? (OK = Advisor, Cancel = Technician)') ? 'advisor' : 'tech';
      const key = code.trim() + '_' + type;
      APP.hiriseMap[key] = { code: code.trim(), hiriseName: name.trim(), type, empId: hiriseAutoMatch(name) || null };
      scheduleSave('hiriseMap', () => APP.hiriseMap);
      renderHiriseMapTab();
    });

    // Delete row
    panel.querySelectorAll('.hr-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirmDestructive('Remove this HiRise mapping?')) return;
        delete APP.hiriseMap[btn.dataset.hrkey];
        scheduleSave('hiriseMap', () => APP.hiriseMap);
        renderHiriseMapTab();
      });
    });
  }

  // Export CSV
  document.getElementById('hrExportBtn')?.addEventListener('click', () => {
    const rows = [['HiRise Code','HiRise Name','Type','Mapped Employee','Department','Status']];
    for (const [, v] of Object.entries(APP.hiriseMap)) {
      const emp = v.empId ? APP.employees.find(e => e.id === v.empId) : null;
      rows.push([v.code, toTitleCase(v.hiriseName), v.type, emp ? toTitleCase(emp.nameHR) : '', emp ? (emp.department||'') : '', emp ? 'Matched' : 'Unmatched']);
    }
    downloadFile('hirise-mapping.csv', rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\n'), 'text/csv');
  });

  makeColumnsResizable(document.getElementById('hiriseTable'));
}

// Apply hirise code as alias to employee for lookup matching
export function applyHiriseAlias(empId, mapping) {
  const emp = APP.employees.find(e => e.id === empId);
  if (!emp) return;
  if (!emp.hiriseAliases) emp.hiriseAliases = [];
  // Add the code (normalized) as alias
  const codeAlias = norm(mapping.code);
  if (codeAlias && !emp.hiriseAliases.includes(codeAlias)) emp.hiriseAliases.push(codeAlias);
  // Add the hirise name (normalized) as alias
  const nameAlias = norm(mapping.hiriseName);
  if (nameAlias && !emp.hiriseAliases.includes(nameAlias)) emp.hiriseAliases.push(nameAlias);
}

export function renderReportingTab() {
  const panel = document.getElementById('tab-reporting');
  if (!panel) return;
  const admin = canDo('edit_employees') || isAdmin();
  const sorted = [...APP.employees].filter(e => e.status === 'ACTIVE').sort((a, b) => a.srNo - b.srNo);

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <strong>Reporting Structure</strong>
        ${admin ? `<button class="btn secondary" id="rcAutoMapBtn">Auto-map from Categories</button>` : ''}
      </div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Shows the full reporting chain for every active employee — Level 1 is who they directly report to, up to Level 4, with MD as the final level for everyone. ${admin ? 'Click the ✎ pencil in any cell to change who that employee reports to at that level.' : 'View-only — log in as Admin to edit.'}</p>
      <div class="rc-table-wrap" style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12.5px; table-layout:auto;">
          <thead><tr>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);">Sr</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:160px;">Employee</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:110px;">Designation</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:110px;">Department</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:160px;">Level 1 — Reports To</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:140px;">Level 2</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:140px;">Level 3</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);min-width:140px;">Level 4</th>
            <th style="position:sticky;top:0;background:#EFEAD9;z-index:2;padding:6px 8px;border-bottom:1px solid var(--line-strong);font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em;color:var(--ink-soft);">MD</th>
          </tr></thead>
          <tbody id="rcBody"></tbody>
        </table>
      </div>
    </div>
  `;

  paintRcRows(sorted, admin);
  if (admin) {
    document.getElementById('rcAutoMapBtn').addEventListener('click', autoMapReportingChain);
  }
}

export function paintRcRows(sorted, admin) {
  const tbody = document.getElementById('rcBody');
  if (!tbody) return;
  // Build employee options list for dropdowns
  const empOptions = APP.employees.filter(e => e.status === 'ACTIVE').sort((a, b) => a.srNo - b.srNo);

  tbody.innerHTML = sorted.map((e, i) => {
    const levels = getReportingLevels(e.id);
    const cols = levels.map((val, li) => {
      const cellKey = e.id + '_' + li;
      const isEditing = rcEditState[cellKey];
      const name = val ? (empNameById(val) || val) : null;

      if (isEditing) {
        return `<td style="padding:6px 8px;border-bottom:1px solid var(--line);">
          <div style="display:flex;gap:4px;align-items:center;">
            <select class="rc-select" data-rcsel="${e.id}" data-rclvl="${li}">
              <option value="">— clear —</option>
              ${empOptions.filter(o => o.id !== e.id).map(o =>
                `<option value="${o.id}" ${val === o.id ? 'selected' : ''}>${escapeHtml(o.nameHR)}</option>`
              ).join('')}
            </select>
            <button class="btn rc-save-btn" data-rcsave="${e.id}" data-rclvl="${li}">✓</button>
            <button class="rc-cancel-btn" data-rccancel="${e.id}" data-rclvl="${li}">✕</button>
          </div>
        </td>`;
      } else {
        return `<td style="padding:6px 10px;border-bottom:1px solid var(--line);">
          <div class="rc-cell">
            <span class="rc-pill ${!name ? 'rc-empty' : ''}">${name ? escapeHtml(name) : '—'}</span>
            ${admin ? `<button class="rc-edit-icon" data-rcedit="${e.id}" data-rclvl="${li}" title="Edit">✎</button>` : ''}
          </div>
        </td>`;
      }
    });

    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid var(--line);color:var(--ink-soft);font-size:12px;text-align:center;">${i + 1}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--line);">
        <b>${escapeHtml(toTitleCase(e.nameHR))}</b>
      </td>
      <td style="padding:4px 8px;border-bottom:1px solid var(--line);">
        ${admin
          ? `<input type="text" class="cell-input rc-emp-field" data-empid="${e.id}" data-field="designation"
               value="${escapeHtml(e.designation||'')}" style="width:100%;font-size:11.5px;text-align:left;">`
          : `<span style="font-size:11.5px;">${escapeHtml(e.designation||'—')}</span>`}
      </td>
      <td style="padding:4px 8px;border-bottom:1px solid var(--line);">
        ${admin
          ? `<input type="text" class="cell-input rc-emp-field" data-empid="${e.id}" data-field="department"
               value="${escapeHtml(e.department||'')}" style="width:100%;font-size:11.5px;text-align:left;">`
          : `<span style="font-size:11.5px;">${escapeHtml(e.department||'—')}</span>`}
      </td>
      ${cols.join('')}
      <td style="padding:6px 8px;border-bottom:1px solid var(--line);">
        <span class="rc-pill rc-md">MD</span>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" style="padding:20px;text-align:center;color:var(--ink-soft);">No active employees found.</td></tr>`;

  // Wire Designation / Department inline edits (syncs to all tabs automatically via APP.employees)
  tbody.querySelectorAll('.rc-emp-field').forEach(inp => inp.addEventListener('change', ev => {
    const emp = empById(ev.target.dataset.empid);
    if (!emp) return;
    emp[ev.target.dataset.field] = ev.target.value.trim();
    scheduleSave('employees', () => APP.employees);
    toast(ev.target.dataset.field === 'designation' ? 'Designation updated — synced to all tabs' : 'Department updated — synced to all tabs');
  }));

  // Wire up edit/save/cancel
  tbody.querySelectorAll('[data-rcedit]').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.rcedit + '_' + btn.dataset.rclvl;
      rcEditState = { [key]: true }; // only one cell editable at a time
      paintRcRows(sorted, admin);
      const sel = document.querySelector(`[data-rcsel="${btn.dataset.rcedit}"][data-rclvl="${btn.dataset.rclvl}"]`);
      if (sel) sel.focus();
    });
  });
  tbody.querySelectorAll('[data-rcsave]').forEach(btn => {
    btn.addEventListener('click', () => {
      const empId = btn.dataset.rcsave;
      const li = parseInt(btn.dataset.rclvl);
      const sel = document.querySelector(`[data-rcsel="${empId}"][data-rclvl="${li}"]`);
      setReportingLevel(empId, li, sel ? sel.value : null);
      rcEditState = {};
      paintRcRows(sorted, admin);
    });
  });
  tbody.querySelectorAll('[data-rccancel]').forEach(btn => {
    btn.addEventListener('click', () => { rcEditState = {}; paintRcRows(sorted, admin); });
  });
}

export function autoMapReportingChain() {
  // Pre-fills the chain based on the existing category/supervisorId structure.
  // TECHNICIAN   -> L1=their Supervisor, L2=NARODE, L3=WM, L4=null
  // SUPERVISOR   -> L1=NARODE, L2=WM, L3=null, L4=null
  // NARODE       -> L1=WM, L2=null, L3=null, L4=null
  // ADVISOR      -> L1=WM, L2=null, L3=null, L4=null
  // WM           -> L1=null, L2=null, L3=null, L4=null (reports to MD directly)
  // WARRANTY/BODYSHOP/others -> L1=WM, L2=null, L3=null, L4=null
  if (!confirmDestructive('This will auto-fill the reporting chain for all active employees based on their Category and assigned Supervisor. Any entries you have already set manually will be overwritten. Continue?')) return;

  const narode = APP.employees.find(e => e.category === 'NARODE' && e.status === 'ACTIVE');
  const wm     = APP.employees.find(e => e.category === 'WM'     && e.status === 'ACTIVE');

  for (const emp of APP.employees.filter(e => e.status === 'ACTIVE')) {
    let chain = [null, null, null, null];
    if (emp.category === 'TECHNICIAN') {
      const sup = emp.supervisorId ? empById(emp.supervisorId) : null;
      chain[0] = sup ? sup.id : null;
      chain[1] = narode ? narode.id : null;
      chain[2] = wm ? wm.id : null;
    } else if (emp.category === 'SUPERVISOR') {
      chain[0] = narode ? narode.id : null;
      chain[1] = wm ? wm.id : null;
    } else if (emp.category === 'NARODE') {
      chain[0] = wm ? wm.id : null;
    } else if (['ADVISOR','WARRANTY','BODYSHOP','NONE'].includes(emp.category)) {
      chain[0] = wm ? wm.id : null;
    }
    // WM reports directly to MD — all levels null
    APP.reportingChain[emp.id] = chain;
  }
  scheduleSave('reportingChain', () => APP.reportingChain);
  rcEditState = {};
  renderReportingTab();
  toast('Reporting chain auto-mapped from categories');
}


function paintEmployeeRows() {
  const tbody = document.getElementById('empBody');
  const supervisors = APP.employees.filter(e => e.category === 'SUPERVISOR');
  const list = APP.employees.filter(e => norm(e.nameHR).includes(norm(empSearch))).sort((a, b) => a.srNo - b.srNo);
  tbody.innerHTML = list.map(e => `
    <tr>
      <td>${e.srNo}</td>
      <td><b>${escapeHtml(toTitleCase(e.nameHR))}</b><div class="kbd-note">${escapeHtml(e.designation || '')}</div></td>
      <td>${escapeHtml(e.gender || '')}</td>
      <td>${escapeHtml(e.department || '')}</td>
      <td>${escapeHtml(e.designation || '')}</td>
      <td>
        <select class="cell-input" data-cat="${e.id}">
          ${CATEGORY_OPTIONS.map(c => `<option value="${c}" ${e.category === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('')}
        </select>
      </td>
      <td>
        <select class="cell-input" data-status="${e.id}">
          <option value="ACTIVE" ${e.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
          <option value="RESIGNED" ${e.status === 'RESIGNED' ? 'selected' : ''}>Resigned</option>
        </select>
      </td>
      <td class="num"><input type="text" class="cell-input" style="width:90px;" data-target="${e.id}" value="${e.target || 0}"></td>
      <td>
        ${e.category === 'TECHNICIAN' ? `<select class="cell-input" data-sup="${e.id}">
          <option value="">—</option>
          ${supervisors.map(s => `<option value="${s.id}" ${e.supervisorId === s.id ? 'selected' : ''}>${escapeHtml(s.nameHR)}</option>`).join('')}
        </select>` : '<span class="kbd-note">—</span>'}
      </td>
      <td style="max-width:220px;">
        <div class="tag-row" data-aliaswrap="${e.id}">
          ${(e.hiriseAliases || []).map((a, i) => `<span class="tag">${escapeHtml(a)}<button data-rmalias="${e.id}" data-idx="${i}">×</button></span>`).join('')}
          <button class="btn-mini" data-addalias="${e.id}" style="padding:3px 8px;">+ alias</button>
        </div>
      </td>
      <td><button class="btn ghost" data-edit="${e.id}" style="padding:5px 10px;">Edit</button></td>
    </tr>
  `).join('') || `<tr><td colspan="11"><div class="empty-state">No employees match your search.</div></td></tr>`;

  tbody.querySelectorAll('[data-cat]').forEach(s => s.addEventListener('change', (e) => {
    const emp = empById(e.target.dataset.cat);
    emp.category = e.target.value;
    if (emp.category !== 'TECHNICIAN') emp.supervisorId = null;
    scheduleSave('employees', () => APP.employees);
    paintEmployeeRows();
  }));
  tbody.querySelectorAll('[data-status]').forEach(s => s.addEventListener('change', (e) => {
    empById(e.target.dataset.status).status = e.target.value;
    scheduleSave('employees', () => APP.employees);
  }));
  tbody.querySelectorAll('[data-target]').forEach(s => s.addEventListener('change', (e) => {
    empById(e.target.dataset.target).target = money(e.target.value);
    scheduleSave('employees', () => APP.employees);
  }));
  tbody.querySelectorAll('[data-sup]').forEach(s => s.addEventListener('change', (e) => {
    empById(e.target.dataset.sup).supervisorId = e.target.value || null;
    scheduleSave('employees', () => APP.employees);
  }));
  tbody.querySelectorAll('[data-rmalias]').forEach(b => b.addEventListener('click', (e) => {
    const emp = empById(e.target.dataset.rmalias);
    emp.hiriseAliases.splice(parseInt(e.target.dataset.idx), 1);
    scheduleSave('employees', () => APP.employees);
    paintEmployeeRows();
  }));
  tbody.querySelectorAll('[data-addalias]').forEach(b => b.addEventListener('click', (e) => {
    const emp = empById(e.target.dataset.addalias);
    const v = prompt('Add an exact Hirise name spelling for ' + emp.nameHR + ':');
    if (v && v.trim()) {
      emp.hiriseAliases = emp.hiriseAliases || [];
      emp.hiriseAliases.push(v.trim());
      scheduleSave('employees', () => APP.employees);
      paintEmployeeRows();
    }
  }));
  tbody.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', (e) => openEmployeeEditor(e.target.dataset.edit)));
}

export function openEmployeeEditor(empId) {
  const isNew = !empId;
  const emp = isNew ? { id: uid('e'), srNo: (Math.max(0, ...APP.employees.map(x => x.srNo)) + 1), nameHR: '', gender: 'Male', doj: '', department: '', designation: '', status: 'ACTIVE', category: 'NONE', target: 0, hiriseAliases: [], supervisorId: null } : empById(empId);
  openModal(`
    <h3>${isNew ? 'Add Employee' : 'Edit Employee'}</h3>
    <div class="field"><label>Name</label><input type="text" id="mf-name" value="${escapeHtml(toTitleCase(emp.nameHR))}"></div>
    <div class="grid-2">
      <div class="field"><label>Gender</label>
        <select id="mf-gender"><option ${emp.gender === 'Male' ? 'selected' : ''}>Male</option><option ${emp.gender === 'Female' ? 'selected' : ''}>Female</option></select>
      </div>
      <div class="field"><label>Date of Joining</label><input type="text" id="mf-doj" value="${escapeHtml(emp.doj)}" placeholder="DD/MM/YYYY"></div>
    </div>
    <div class="field"><label>Mobile Number <span class="kbd-note">(for OTP login)</span></label><input type="text" inputmode="numeric" id="mf-mobile" value="${escapeHtml(emp.mobile||'')}" placeholder="10-digit mobile number"></div>
    <div class="grid-2">
      <div class="field"><label>Department</label><input type="text" id="mf-dept" value="${escapeHtml(emp.department)}"></div>
      <div class="field"><label>Designation</label><input type="text" id="mf-desig" value="${escapeHtml(emp.designation)}"></div>
    </div>
    <div class="grid-2">
      <div class="field"><label>Category</label>
        <select id="mf-cat">${CATEGORY_OPTIONS.map(c => `<option value="${c}" ${emp.category === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('')}</select>
      </div>
      <div class="field"><label>Fallback Target ₹ <span class="kbd-note" style="font-weight:400; text-transform:none;">(used only if the prior-year 6-month window has no revenue for this person)</span></label><input type="text" id="mf-target" value="${emp.target || 0}"></div>
    </div>
    ${!isNew ? `<div class="divider"></div><button class="btn danger" id="mf-delete">Delete Employee</button>` : ''}
    <div class="modal-actions">
      <button class="btn secondary" id="mf-cancel">Cancel</button>
      <button class="btn" id="mf-save">${isNew ? 'Add' : 'Save'}</button>
    </div>
  `);
  document.getElementById('mf-cancel').addEventListener('click', closeModal);
  document.getElementById('mf-save').addEventListener('click', () => {
    emp.nameHR = document.getElementById('mf-name').value.trim();
    emp.gender = document.getElementById('mf-gender').value;
    emp.doj = document.getElementById('mf-doj').value.trim();
    emp.mobile = (document.getElementById('mf-mobile').value||'').replace(/\D/g,'');
    emp.department = document.getElementById('mf-dept').value.trim();
    emp.designation = document.getElementById('mf-desig').value.trim();
    emp.category = document.getElementById('mf-cat').value;
    emp.target = money(document.getElementById('mf-target').value);
    if (!emp.nameHR) { toast('Name is required', true); return; }
    if (isNew) {
      emp.hiriseAliases = [emp.nameHR];
      APP.employees.push(emp);
    }
    scheduleSave('employees', () => APP.employees);
    closeModal();
    rerenderActiveTab();
    toast(isNew ? 'Employee added' : 'Employee updated');
  });
  if (!isNew) {
    document.getElementById('mf-delete').addEventListener('click', () => {
      if (!confirmDestructive('Delete ' + emp.nameHR + '? This cannot be undone.')) return;
      APP.employees = APP.employees.filter(e => e.id !== emp.id);
      scheduleSave('employees', () => APP.employees);
      closeModal();
      rerenderActiveTab();
      toast('Employee deleted');
    });
  }
}
