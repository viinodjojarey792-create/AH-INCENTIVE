import { APP, CATEGORY_LABELS } from './state.js';
import { money, norm, fmt, uid, escapeHtml, toTitleCase, toast, parseMonthKey, monthLabelOf, activeEmployees, empById } from './utils.js';
import { scheduleSave } from './store.js';
import { ensureMonth, hrFor } from './months.js';
import { canDo, isAdmin } from './auth.js';
import { renderDashboard } from './ui-shell.js';

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: (err) => reject(err)
    });
  });
}

export function buildComplaintsSummary(rows, fileName) {
  const counts = {};
  let filteredRows = 0;
  const okStatus = new Set(['ACTION COMPLETED', 'CLOSED']);
  const unmatchedBlank = [];
  for (const row of rows) {
    const status = (row['Status'] || '').trim().toUpperCase();
    if (!okStatus.has(status)) continue;
    const hrName = norm(row['NAME AS PER HR SHEET']);
    if (!hrName) { unmatchedBlank.push(row['TECHNICIAN NAME'] || ''); continue; }
    filteredRows++;
    counts[hrName] = (counts[hrName] || 0) + 1;
  }
  return { counts, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length, filteredRows, unmatchedBlankCount: unmatchedBlank.length };
}

export function findUnmatchedComplaintNames(counts) {
  const aliasSet = new Set();
  for (const e of APP.employees) (e.hiriseAliases || []).forEach(a => aliasSet.add(norm(a)));
  const nameSet = new Set(APP.employees.map(e => norm(e.nameHR)));
  const unmatched = [];
  for (const key of Object.keys(counts)) {
    if (!aliasSet.has(key) && !nameSet.has(key)) unmatched.push({ name: key, count: counts[key] });
  }
  unmatched.sort((a, b) => b.count - a.count);
  return unmatched;
}

export function applyComplaintsToEmployees(monthKey, counts) {
  const m = ensureMonth(monthKey);
  const byAlias = {}, byHrName = {};
  for (const e of APP.employees) {
    (e.hiriseAliases || []).forEach(a => byAlias[norm(a)] = e.id);
    byHrName[norm(e.nameHR)] = e.id;
  }
  m.complaints = {};
  for (const key of Object.keys(counts)) {
    const empId = byAlias[key] || byHrName[key];
    if (empId) m.complaints[empId] = (m.complaints[empId] || 0) + counts[key];
  }
}

// Build a lookup of employees by both their full HR name and every Hirise alias.
export function employeeNameLookup() {
  const byKey = {};
  for (const e of APP.employees) {
    byKey[norm(e.nameHR)] = e.id;
    (e.hiriseAliases || []).forEach(a => { if (a) byKey[norm(a)] = e.id; });
  }
  return byKey;
}

/* ---- HR-SHEET upload: bulk attendance / leave / late mark / tobacco / status ---- */
export function buildHrSheetSummary(rows, fileName) {
  const parsed = [];
  for (const row of rows) {
    const name = (row['NAME OF EMPLOYEE'] || row['EMPLOYEE NAME'] || row['Name'] || '').trim();
    if (!name) continue;

    // Detect month from "Current Month" column — used to store data in the right month
    const monthStr = (row['Current Month'] || row['CURRENT MONTH'] || row['current month'] || '').trim();

    // Support both your Google Sheet column names AND old format column names
    const actualAbsentee = money(
      row['Leaves Taken in Current month'] ||
      row['LEAVES TAKEN IN CURRENT MONTH'] ||
      row['Leaves taken in current month'] ||
      row['ACTUAL ABSENTEE'] ||
      row['Actual Absentee'] || '0'
    );
    const approvedLeaves = money(
      row['Approved leaves in current month'] ||
      row['APPROVED LEAVES IN CURRENT MONTH'] ||
      row['Approved Leaves in current month'] ||
      row['No. OF APPROVED LEAVES'] ||
      row['Approved Leave'] || '0'
    );
    const lateMarks = money(
      row['late marks in current month'] ||
      row['LATE MARKS IN CURRENT MONTH'] ||
      row['Late marks in current month'] ||
      row['Late Marks in current month'] ||
      row['NUMBER OF LATE MARK'] ||
      row['Late Mark'] || '0'
    );
    const tobacco = (
      row['tobacco consumer ( YES/NO)'] ||
      row['tobacco consumer (YES/NO)'] ||
      row['TOBACCO CONSUMER (YES/NO)'] ||
      row['Tobacco Consumer'] ||
      row['TOBACCO'] || ''
    ).trim().toUpperCase() || null;

    parsed.push({
      name,
      monthStr,   // ← new: will be used to pick the right month
      hiriseName:  (row['NAMES AS PER HIRISE'] || row['Names As Per Hirise'] || '').trim(),
      department:  (row['DEPARTMENT'] || '').trim(),
      designation: (row['DESIGNATION'] || '').trim(),
      status:      (row['ACTIVE STATUS'] || row['Active Status'] || '').trim().toUpperCase(),
      actualAbsentee,
      approvedLeaves,
      lateMarks,
      tobacco,
      hrRemark: (row['HR REMARK'] || row['Hr Remark'] || '').trim(),
    });
  }
  return { rows: parsed, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length };
}

export function applyHrSheetToEmployees(monthKey, parsedRows) {
  // monthKey is the fallback; each row can override via its own monthStr
  const byKey = employeeNameLookup();
  const unmatched = [];
  for (const r of parsedRows) {
    const empId = byKey[norm(r.name)] || (r.hiriseName && byKey[norm(r.hiriseName)]);
    if (!empId) { unmatched.push(r); continue; }

    // Use row's own month if present, otherwise fall back to selected month
    const rowMonthKey = (r.monthStr && parseMonthKey(r.monthStr)) || monthKey;

    const hr = hrFor(rowMonthKey, empId);
    hr.actualAbsentee = r.actualAbsentee;
    hr.approvedLeaves  = r.approvedLeaves;
    hr.lateMarks       = r.lateMarks;
    if (r.tobacco === 'YES' || r.tobacco === 'NO') hr.tobacco = r.tobacco;
    hr.hrRemark = r.hrRemark || hr.hrRemark;

    // Sync employee static fields
    const emp = empById(empId);
    if (emp) {
      // HR-Sheet is the authoritative source — always overrides, even if blank (skip only if truly empty)
      if (r.designation) emp.designation = r.designation;
      if (r.department)  emp.department  = r.department;
      if (r.hiriseName) {
        if (!emp.hiriseAliases) emp.hiriseAliases = [];
        const alias = norm(r.hiriseName);
        if (alias && !emp.hiriseAliases.includes(alias)) emp.hiriseAliases.push(alias);
      }
      if (r.status === 'ACTIVE' || r.status === 'RESIGNED' || r.status === 'INACTIVE') emp.status = r.status;
    }
  }
  return unmatched;
}

/* ---- Tobacco Consumer Data upload (flexible column name) ---- */
const TOBACCO_COLUMN_CANDIDATES = ['TOBACCO CONSUMER (YES/NO)', 'TOBACCO (YES/NO)', 'TOBACCO CONSUMER', 'TOBACCO'];
const NAME_COLUMN_CANDIDATES = ['NAME OF EMPLOYEE', 'NAME', 'EMPLOYEE NAME'];
function detectColumn(row, candidates) {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const hit = keys.find(k => k.trim().toUpperCase() === cand.toUpperCase());
    if (hit) return hit;
  }
  return null;
}
export function buildTobaccoSummary(rows, fileName) {
  if (!rows.length) return { map: {}, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: 0 };
  const nameCol = detectColumn(rows[0], NAME_COLUMN_CANDIDATES);
  const tobCol = detectColumn(rows[0], TOBACCO_COLUMN_CANDIDATES);
  const map = {};
  if (nameCol && tobCol) {
    for (const row of rows) {
      const name = (row[nameCol] || '').trim();
      const val = (row[tobCol] || '').trim().toUpperCase();
      if (name && (val === 'YES' || val === 'NO')) map[norm(name)] = val;
    }
  }
  return { map, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length, columnsFound: !!(nameCol && tobCol) };
}
export function applyTobaccoToEmployees(monthKey, map) {
  const byKey = employeeNameLookup();
  const unmatched = [];
  for (const key of Object.keys(map)) {
    const empId = byKey[key];
    if (!empId) { unmatched.push({ name: key, value: map[key] }); continue; }
    hrFor(monthKey, empId).tobacco = map[key];
  }
  return unmatched;
}

/* =========================================================================
   HR-SHEET tab UI
   ========================================================================= */
let attSearch = '';
export function renderAttendance(containerId) {
  containerId = containerId || 'tab-attendance';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const panel = document.getElementById(containerId);
  const meta = m.hrSheetMeta || {};
  const canEdit = canDo('upload_data') || isAdmin();
  panel.innerHTML = `
    ${canEdit ? `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-head"><strong>HR-SHEET — ${escapeHtml(m.label)}</strong></div>
      <p class="kbd-note" style="margin-top:-4px;margin-bottom:10px;">Upload the HR-SHEET CSV to bulk-load attendance, leave, late mark and tobacco data for all employees at once.</p>
      <label class="upload-zone" for="hrFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">HR-SHEET.csv</div>
      </label>
      <input type="file" id="hrFileInput" accept=".csv" style="display:none;">
      ${meta.fileName ? `<div class="footer-note">Last uploaded for <b>${escapeHtml(m.label)}</b>: ${escapeHtml(meta.fileName)} ${meta.uploadedAt ? '(on ' + new Date(meta.uploadedAt).toLocaleDateString('en-GB') + ' at ' + new Date(meta.uploadedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) + ')' : ''}</div>` : ''}
    </div>` : ''}
    <div class="card">
      <div class="card-head"><strong>Attendance & HR Data — ${escapeHtml(m.label)}</strong></div>
      <!-- Month coverage summary -->
      ${(() => {
        const allMonths = Object.keys(APP.months).filter(mk2 => APP.months[mk2].hr && Object.keys(APP.months[mk2].hr).length > 0).sort();
        const hasCurrentMonth = allMonths.includes(mk);
        if (!allMonths.length) return `<div class="banner"><span>⚠</span><div>No HR data uploaded yet. Upload a CSV above to get started.</div></div>`;
        const pills = allMonths.map(mk2 => `<span class="pill ${mk2===mk?'pill-amber':'pill-neutral'}" style="padding:2px 8px;">${escapeHtml(monthLabelOf(mk2))}</span>`).join(' ');
        const warning = !hasCurrentMonth ? `<div class="banner" style="margin-top:8px;"><span>⚠</span><div><b>No HR data for ${escapeHtml(m.label)}</b> — upload the CSV for this month to calculate behavioral incentives.</div></div>` : '';
        return `<div style="margin-bottom:10px;"><div class="kbd-note" style="margin-bottom:6px;">Months with HR data (sorted): ${pills}</div>${warning}</div>`;
      })()}
      <div id="hrUnmatchedWrap"></div>
      <div class="card-head" style="margin-top:6px;">
        <strong>Attendance & HR Table — ${escapeHtml(m.label)}</strong>
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="kbd-note" style="font-size:10px;">← drag column edges to resize</span>
          <div class="search-box"><span>🔍</span><input type="text" id="attSearch" placeholder="Search name…" value="${escapeHtml(attSearch)}"></div>
        </div>
      </div>
      <div class="table-scroll table-scroll-frozen" style="max-height:60vh;">
        <table id="hrAttTable" style="border-collapse:collapse;table-layout:fixed;width:100%;">
          <thead><tr>
            <th class="col-sticky-1" style="width:46px;min-width:46px;">SR NO</th>
            <th class="col-sticky-2" style="width:170px;min-width:100px;">NAME OF EMPLOYEE</th>
            <th style="width:60px;min-width:50px;">Gender</th>
            <th style="width:85px;min-width:60px;">DOJ</th>
            <th style="width:110px;min-width:60px;">DEPARTMENT</th>
            <th style="width:110px;min-width:60px;">DESIGNATION</th>
            <th style="width:85px;min-width:60px;">ACTIVE STATUS</th>
            <th style="width:110px;min-width:60px;">NAMES AS PER HIRISE</th>
            <th style="width:90px;min-width:60px;">Current Month</th>
            <th style="width:80px;min-width:50px;">Tobacco (YES/NO)</th>
            <th class="num" style="width:70px;min-width:50px;">Leaves Taken</th>
            <th class="num" style="width:75px;min-width:50px;">Approved Leaves</th>
            <th class="num" style="width:70px;min-width:50px;">Late Marks</th>
            <th style="width:44px;min-width:44px;text-align:center;"></th>
          </tr></thead>
          <tbody id="attBody"></tbody>
        </table>
      </div>
      <div class="footer-note">Leave component (₹${APP.settings.leaveAmount}) requires Actual Absentee ≤ ${APP.settings.maxAbsenteeForLeaveComponent} and Approved Leaves ≥ Actual Absentee. Final payout is also multiplied by the leave deduction slab based on Actual Absentee — see Rules & Settings.</div>
    </div>
  `;
  paintAttendanceRows();
  document.getElementById('attSearch').addEventListener('input', (e) => { attSearch = e.target.value; paintAttendanceRows(); });
  // Make HR table columns resizable after first render
  setTimeout(() => makeColumnsResizable(document.getElementById('hrAttTable')), 100);

  // Wire paste import buttons — reads "Current Month" column to store data per month
  const mk_selected = mk; // the currently selected month (fallback if row has no month)
  const pasteImport = async (mode) => {
    const textarea = document.getElementById('hr-paste-area');
    const statusEl = document.getElementById('hr-import-status');
    if (!textarea || !statusEl) return;
    const text = textarea.value.trim();
    if (!text) { statusEl.textContent = '⚠ Paste your Google Sheet data first (Ctrl+A → Ctrl+C in sheet → Ctrl+V here)'; statusEl.style.color='var(--bad)'; return; }

    const istsv = text.includes('\t');
    let rows;
    if (istsv) {
      const lines = text.trim().split('\n');
      const headers = lines[0].split('\t').map(h => h.trim().replace(/^"|"$/g,''));
      rows = lines.slice(1).filter(l=>l.trim()).map(line => {
        const vals = line.split('\t').map(v=>v.trim().replace(/^"|"$/g,''));
        return Object.fromEntries(headers.map((h,i)=>[h,vals[i]||'']));
      });
    } else {
      rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
    }
    if (!rows.length) { statusEl.textContent = '⚠ Could not read pasted data'; statusEl.style.color='var(--bad)'; return; }
    statusEl.textContent = '⏳ Processing ' + rows.length + ' rows…'; statusEl.style.color='var(--ink-soft)';

    // Group rows by month from "Current Month" column
    const byMonth = {};
    let noMonthRows = 0;
    for (const row of rows) {
      const monthStr = row['Current Month']?.trim() || row['CURRENT MONTH']?.trim() || row['current month']?.trim() || '';
      const rowMk = parseMonthKey(monthStr) || mk_selected;
      if (!monthStr) noMonthRows++;
      if (!byMonth[rowMk]) byMonth[rowMk] = [];
      byMonth[rowMk].push(row);
    }

    let empAdded = 0, empUpdated = 0, monthsImported = [];

    for (const [rowMk, monthRows] of Object.entries(byMonth)) {
      const mData = ensureMonth(rowMk);
      if (mode === 'replace') mData.hr = {};
      if (!mData.hr) mData.hr = {};

      for (const row of monthRows) {
        const name = row['NAME OF EMPLOYEE']?.trim() || row['name']?.trim() || row['NAME']?.trim();
        if (!name) continue;

        const desig  = row['DESIGNATION']?.trim()        || '';
        const dept   = row['DEPARTMENT']?.trim()         || '';
        const gender = row['Gender']?.trim()             || '';
        const doj    = row['DOJ']?.trim()                || '';
        const status = row['ACTIVE STATUS']?.trim()      || 'ACTIVE';
        const hirise = row['NAMES AS PER HIRISE']?.trim()|| '';

        const tobacco       = (row['tobacco consumer ( YES/NO)']?.trim() || row['tobacco consumer (YES/NO)']?.trim() || '').toUpperCase() === 'YES';
        const leavesTaken   = parseFloat(row['Leaves Taken in Current month']?.trim()    || '0') || 0;
        const approvedLeave = parseFloat(row['Approved leaves in current month']?.trim()  || '0') || 0;
        const lateMarks     = parseFloat(row['late marks in current month']?.trim()       || '0') || 0;

        // Upsert employee
        const isInactive = status.toUpperCase() === 'INACTIVE' || status.toUpperCase() === 'RESIGNED';
        const ei = APP.employees.findIndex(e => norm(e.nameHR) === norm(name));
        if (ei >= 0) {
          APP.employees[ei] = { ...APP.employees[ei], designation: desig||APP.employees[ei].designation, department: dept||APP.employees[ei].department, gender: gender||APP.employees[ei].gender, doj: doj||APP.employees[ei].doj, status: isInactive?'INACTIVE':'ACTIVE', hiriseAliases: hirise?[norm(hirise)]:APP.employees[ei].hiriseAliases };
          empUpdated++;
        } else {
          APP.employees.push({ id: uid('e'), nameHR: name, designation: desig, department: dept, gender, doj, status: isInactive?'INACTIVE':'ACTIVE', category:'NONE', target:0, hiriseAliases: hirise?[norm(hirise)]:[], hidden:false, srNo: APP.employees.length+1 });
          empAdded++;
        }
        const emp = APP.employees.find(e => norm(e.nameHR) === norm(name));
        if (emp) {
          const hrRec = hrFor(rowMk, emp.id);
          hrRec.actualAbsentee = leavesTaken;
          hrRec.approvedLeaves = approvedLeave;
          hrRec.lateMarks     = lateMarks;
          hrRec.tobacco       = tobacco ? 'YES' : 'NO';
        }
      }
      monthsImported.push(rowMk);
    }

    scheduleSave('employees', () => APP.employees);
    scheduleSave('months', () => APP.months);

    // Sort months and show what was imported
    monthsImported.sort();
    const monthLabels = monthsImported.map(k => monthLabelOf(k)).join(', ');

    // Check if currently selected month now has data
    const selData = APP.months[mk_selected];
    const selHasData = selData && selData.hr && Object.keys(selData.hr).length > 0;
    const selLabel = monthLabelOf(mk_selected);

    let html = '<span style="color:var(--good)">✓ Imported: ' + monthLabels + '</span>';
    if (empAdded) html += ' · ' + empAdded + ' employees added';
    if (empUpdated) html += ' · ' + empUpdated + ' updated';
    if (noMonthRows) html += '<br><span style="color:var(--warn)">⚠ ' + noMonthRows + ' rows had no month — stored under ' + selLabel + '</span>';
    if (!selHasData) html += '<br><span style="color:var(--bad)">⚠ No HR data for <b>' + selLabel + '</b> (currently selected month). Please add ' + selLabel + ' data to your sheet and import again to calculate incentives for this month.</span>';

    statusEl.innerHTML = html;
    renderAttendance(containerId);
    toast('HR data imported for: ' + monthLabels);
  }
  document.getElementById('hrPasteImportBtn')?.removeEventListener('click', null);
  document.getElementById('hrPasteReplaceBtn')?.removeEventListener('click', null);

  document.getElementById('hrFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      const summary = buildHrSheetSummary(rows, file.name);
      const unmatched = applyHrSheetToEmployees(mk, summary.rows);
      m.hrSheetMeta = { fileName: summary.fileName, uploadedAt: summary.uploadedAt, unmatched: unmatched.map(u => u.name) };
      scheduleSave('months', () => APP.months);
      scheduleSave('employees', () => APP.employees);
      renderAttendance(containerId);
      if (APP.meta.activeTab === 'dashboard') renderDashboard();
      toast(`Loaded HR-SHEET for ${summary.rows.length - unmatched.length} employee(s)`);
      if (unmatched.length) {
        document.getElementById('hrUnmatchedWrap').innerHTML = `
          <div class="banner"><span>⚠</span><div><b>${unmatched.length} name(s) didn't match any employee</b> — add them on the Employees tab, or add an alias if it's a spelling variation.
          <div style="margin-top:8px;">${unmatched.map(u => `<div class="match-row"><span class="name">${escapeHtml(u.name)}</span></div>`).join('')}</div></div></div>`;
      }
    } catch (err) {
      console.error(err);
      toast('Could not parse that CSV file', true);
    }
  });
}
// Makes all th elements in a table resizable by dragging their right edge
export function makeColumnsResizable(tableOrSelector) {
  const tables = typeof tableOrSelector === 'string'
    ? document.querySelectorAll(tableOrSelector)
    : [tableOrSelector];
  tables.forEach(table => {
    if (!table) return;
    // Switch to fixed layout so width changes are respected
    table.style.tableLayout = 'fixed';
    const ths = table.querySelectorAll('thead th');
    ths.forEach(th => {
      // Set initial width from current rendered width if not already set
      if (!th.style.width) th.style.width = th.offsetWidth + 'px';
      if (th.querySelector('.col-resizer')) return;
      const resizer = document.createElement('div');
      resizer.className = 'col-resizer';
      th.style.position = 'relative';
      th.style.overflow = 'hidden';
      th.appendChild(resizer);
      let startX, startW;
      resizer.addEventListener('mousedown', e => {
        startX = e.pageX;
        startW = th.offsetWidth;
        th.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = ev => {
          const newW = Math.max(40, startW + ev.pageX - startX);
          th.style.width = newW + 'px';
          th.style.minWidth = newW + 'px';
        };
        const onUp = () => {
          th.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
      });
    });
  });
}

function paintAttendanceRows() {
  const mk = APP.meta.currentMonth;
  ensureMonth(mk);
  const tbody = document.getElementById('attBody');
  if (!tbody) return;
  const canEditHR = canDo('edit_hrsheet') || isAdmin();
  const list = activeEmployees(false)
    .filter(e => norm(e.nameHR).includes(norm(attSearch)))
    .sort((a, b) => (a.srNo || 999) - (b.srNo || 999));

  // text left, date center, number center
  const tInp = (empId, field, val, w) => {
    const style = 'width:'+(w||'100%')+';text-align:left;font-size:11px;word-break:break-word;white-space:normal;';
    return canEditHR
      ? '<input type="text" class="cell-input emp-edit" data-empid="'+empId+'" data-field="'+field+'" value="'+escapeHtml(val||'')+'" style="'+style+'">'
      : '<span style="font-size:11px;word-break:break-word;white-space:normal;">'+escapeHtml(val||'—')+'</span>';
  };
  const dInp = (empId, field, val) => canEditHR
    ? '<input type="text" class="cell-input emp-edit" data-empid="'+empId+'" data-field="'+field+'" value="'+escapeHtml(val||'')+'" style="width:85px;text-align:center;font-size:11px;">'
    : '<span style="font-size:11px;">'+escapeHtml(val||'—')+'</span>';
  const nInp = (field, empId, val) => canEditHR
    ? '<input type="text" class="cell-input" data-f="'+field+'" data-id="'+empId+'" value="'+val+'" style="width:52px;text-align:center;">'
    : '<span style="text-align:center;display:block;">'+val+'</span>';

  tbody.innerHTML = list.map((e, i) => {
    const hr = hrFor(mk, e.id);
    const isInactive = e.status === 'INACTIVE';
    const hirise = (e.hiriseAliases || []).join(', ');
    return '<tr'+(isInactive?' style="opacity:0.6;"':'')+'>'+
      '<td class="col-sticky-1" style="text-align:center;color:var(--ink-soft);font-size:12px;">'+(i+1)+'</td>'+
      '<td class="col-sticky-2">'+(canEditHR
        ?'<input type="text" class="cell-input emp-edit" data-empid="'+e.id+'" data-field="nameHR" value="'+escapeHtml(toTitleCase(e.nameHR))+'" style="width:100%;font-weight:600;font-size:12px;text-align:left;word-break:break-word;">'
        :'<b>'+escapeHtml(toTitleCase(e.nameHR))+'</b>')+'</td>'+
      '<td style="text-align:left;">'+tInp(e.id,'gender',e.gender,'50px')+'</td>'+
      '<td style="text-align:center;">'+dInp(e.id,'doj',e.doj)+'</td>'+
      '<td>'+tInp(e.id,'department',e.department)+'</td>'+
      '<td>'+tInp(e.id,'designation',e.designation)+'</td>'+
      '<td style="text-align:center;">'+(canEditHR
        ?'<select class="cell-input emp-edit" data-empid="'+e.id+'" data-field="status"><option value="ACTIVE"'+(isInactive?'':' selected')+'>ACTIVE</option><option value="INACTIVE"'+(isInactive?' selected':'')+'>RESIGNED</option></select>'
        :'<span class="pill'+(isInactive?'':' pill-teal')+'" style="'+(isInactive?'background:#fee2e2;color:#991b1b;':'')+'">'+(isInactive?'RESIGNED':'ACTIVE')+'</span>')+'</td>'+
      '<td>'+tInp(e.id,'hiriseAliases',hirise)+'</td>'+
      '<td style="text-align:center;font-size:11px;color:var(--ink-soft);">'+escapeHtml(monthLabelOf(mk))+'</td>'+
      '<td style="text-align:center;">'+(canEditHR
        ?'<select class="cell-input" data-f="tobacco" data-id="'+e.id+'"><option value="NO"'+(hr.tobacco!=='YES'?' selected':'')+'>NO</option><option value="YES"'+(hr.tobacco==='YES'?' selected':'')+'>YES</option></select>'
        :'<span class="pill '+(hr.tobacco==='YES'?'pill-amber':'pill-neutral')+'">'+(hr.tobacco==='YES'?'YES':'NO')+'</span>')+'</td>'+
      '<td style="text-align:center;">'+nInp('actualAbsentee',e.id,hr.actualAbsentee)+'</td>'+
      '<td style="text-align:center;">'+nInp('approvedLeaves',e.id,hr.approvedLeaves)+'</td>'+
      '<td style="text-align:center;">'+nInp('lateMarks',e.id,hr.lateMarks)+'</td>'+
      (isAdmin()?'<td style="text-align:center;"><button class="btn ghost del-emp-btn" data-delid="'+e.id+'" style="color:var(--bad);padding:2px 6px;font-size:14px;" title="Delete employee">🗑</button></td>':'<td></td>')+
      '</tr>';
  }).join('') || '<tr><td colspan="14"><div class="empty-state">No employees found.</div></td></tr>';

  if (canEditHR) {
    tbody.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', ev => {
      const hr = hrFor(mk, ev.target.dataset.id);
      const f = ev.target.dataset.f;
      hr[f] = f === 'tobacco' ? ev.target.value : money(ev.target.value);
      scheduleSave('months', () => APP.months);
    }));
    tbody.querySelectorAll('.emp-edit').forEach(inp => inp.addEventListener('change', ev => {
      const emp = empById(ev.target.dataset.empid);
      if (!emp) return;
      const field = ev.target.dataset.field;
      if (field === 'hiriseAliases') {
        emp.hiriseAliases = ev.target.value.split(',').map(s => norm(s.trim())).filter(Boolean);
      } else {
        emp[field] = ev.target.value.trim();
      }
      scheduleSave('employees', () => APP.employees);
      if (field === 'designation') {
        toast(`Designation for ${emp.nameHR} set to "${emp.designation}" — synced to all tabs`);
      } else if (field === 'department') {
        toast(`Department for ${emp.nameHR} updated — synced to all tabs`);
      }
    }));
  }
  if (isAdmin()) {
    tbody.querySelectorAll('.del-emp-btn').forEach(btn => btn.addEventListener('click', ev => {
      const emp = empById(ev.target.closest('[data-delid]').dataset.delid);
      if (!emp) return;
      if (!confirm('Delete ' + emp.nameHR + ' from employee list? This cannot be undone.')) return;
      APP.employees = APP.employees.filter(e => e.id !== emp.id);
      scheduleSave('employees', () => APP.employees);
      paintAttendanceRows();
      toast('Employee deleted: ' + emp.nameHR);
    }));
  }
  const t = document.getElementById('hrAttTable');
  if (t) makeColumnsResizable(t);
}

export function renderTobaccoSection(containerId) {
  containerId = containerId || 'tab-hrsheet';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const panel = document.getElementById(containerId);
  const meta = m.tobaccoMeta || {};
  const yesCount = activeEmployees(false).filter(e => hrFor(mk, e.id).tobacco === 'YES').length;
  const noCount = activeEmployees(false).length - yesCount;

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>Tobacco Consumer Data — ${escapeHtml(m.label)}</strong></div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Upload a sheet with a name column and a Tobacco Consumer (YES/NO) column — works whether it's a dedicated tobacco list or the same HR-SHEET export. This only updates the Tobacco field; edit individual values directly in the HR-SHEET table above.</p>
      <label class="upload-zone" for="tobFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">Tobacco Consumer Data.csv</div>
      </label>
      <input type="file" id="tobFileInput" accept=".csv" style="display:none;">
      ${meta.fileName ? `<div class="footer-note">Last uploaded: ${escapeHtml(meta.fileName)}</div>` : ''}
      <div id="tobUnmatchedWrap"></div>
      <div class="stat-row" style="margin-top:14px;">
        <div class="stat"><div class="label">Marked NO (clean)</div><div class="value">${noCount}</div></div>
        <div class="stat"><div class="label">Marked YES (consumer)</div><div class="value">${yesCount}</div></div>
      </div>
    </div>
  `;

  document.getElementById('tobFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      const summary = buildTobaccoSummary(rows, file.name);
      if (!summary.columnsFound) {
        toast('Could not find a name + tobacco column in that file', true);
        return;
      }
      const unmatched = applyTobaccoToEmployees(mk, summary.map);
      m.tobaccoMeta = { fileName: summary.fileName, uploadedAt: summary.uploadedAt, unmatched: unmatched.map(u => u.name) };
      scheduleSave('months', () => APP.months);
      renderTobaccoSection(containerId);
      paintAttendanceRows();
      if (APP.meta.activeTab === 'dashboard') renderDashboard();
      toast(`Updated tobacco status for ${Object.keys(summary.map).length - unmatched.length} employee(s)`);
      if (unmatched.length) {
        document.getElementById('tobUnmatchedWrap').innerHTML = `
          <div class="banner"><span>⚠</span><div><b>${unmatched.length} name(s) didn't match any employee.</b>
          <div style="margin-top:8px;">${unmatched.map(u => `<div class="match-row"><span class="name">${escapeHtml(u.name)}</span></div>`).join('')}</div></div></div>`;
      }
    } catch (err) {
      console.error(err);
      toast('Could not parse that CSV file', true);
    }
  });
}

/* =========================================================================
   HMSI Complaints tab
   ========================================================================= */
export function renderComplaints(containerId) {
  containerId = containerId || 'tab-complaints';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const panel = document.getElementById(containerId);
  const meta = m.complaintsMeta || {};
  const eligible = activeEmployees(false).filter(e => APP.settings.complaintEligibleCategories.includes(e.category)).sort((a, b) => a.srNo - b.srNo);

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>HMSI Complaints — ${escapeHtml(m.label)}</strong></div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Upload the HMSI complaint export. Only rows with status <b>Action Completed</b> or <b>Closed</b> are counted, grouped by the "Name as per HR Sheet" column. You can also edit any count by hand below.</p>
      <label class="upload-zone" for="cpFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">HMSI-COMPLAIN.csv</div>
      </label>
      <input type="file" id="cpFileInput" accept=".csv" style="display:none;">
      ${meta.fileName ? `<div class="footer-note">Last uploaded: ${escapeHtml(meta.fileName)} — ${meta.filteredRows ?? '?'} qualifying complaint(s) found.</div>` : ''}
      <div id="cpUnmatchedWrap"></div>
      <div class="divider"></div>
      <div class="table-scroll">
        <table>
          <thead><tr><th>Sr</th><th>Name</th><th>Category</th><th class="num">Complaint Count</th><th class="num">Behavioral Impact</th></tr></thead>
          <tbody id="cpBody"></tbody>
        </table>
      </div>
      <div class="footer-note">0 complaints → +₹${APP.settings.complaintBaseAmount} &middot; exactly ${APP.settings.complaintPenaltyAtCount} complaint → ₹${APP.settings.complaintPenaltyAmount} &middot; more than that → ₹0. Eligible categories are set on the Rules & Settings tab.</div>
    </div>
  `;

  paintComplaintRows(eligible);

  document.getElementById('cpFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      const summary = buildComplaintsSummary(rows, file.name);
      const unmatched = findUnmatchedComplaintNames(summary.counts);
      m.complaintsMeta = { fileName: summary.fileName, uploadedAt: summary.uploadedAt, unmatched: unmatched.map(u => u.name) };
      applyComplaintsToEmployees(mk, summary.counts);
      scheduleSave('months', () => APP.months);
      renderComplaints(containerId);
      if (APP.meta.activeTab === 'dashboard') renderDashboard();
      toast(`Matched ${summary.filteredRows} qualifying complaint(s)`);
      if (unmatched.length) {
        document.getElementById('cpUnmatchedWrap').innerHTML = `
          <div class="banner"><span>⚠</span><div><b>${unmatched.length} name(s) didn't match any employee</b> — their complaints were not counted.
          <div style="margin-top:8px;">${unmatched.map(u => `<div class="match-row"><span class="name">${escapeHtml(u.name)}</span><span class="kbd-note">${u.count} complaint(s)</span></div>`).join('')}</div></div></div>`;
      }
    } catch (err) {
      console.error(err);
      toast('Could not parse that CSV file', true);
    }
  });
}

function paintComplaintRows(eligible) {
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const s = APP.settings;
  document.getElementById('cpBody').innerHTML = eligible.map(e => {
    const count = m.complaints[e.id] || 0;
    let impact = s.complaintBaseAmount, impactClass = '';
    if (count === s.complaintPenaltyAtCount) { impact = s.complaintPenaltyAmount; }
    else if (count > 0) { impact = 0; }
    return `<tr>
      <td>${e.srNo}</td><td><b>${escapeHtml(toTitleCase(e.nameHR))}</b></td><td><span class="pill pill-neutral">${escapeHtml(e.designation || CATEGORY_LABELS[e.category])}</span></td>
      <td class="num"><input type="text" class="cell-input" data-cpid="${e.id}" value="${count}"></td>
      <td class="num">${fmt(impact)}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="5"><div class="empty-state">No employees are currently in a complaint-eligible category.</div></td></tr>`;

  document.querySelectorAll('[data-cpid]').forEach(inp => inp.addEventListener('change', (e) => {
    m.complaints[e.target.dataset.cpid] = money(e.target.value);
    scheduleSave('months', () => APP.months);
    paintComplaintRows(eligible);
  }));
}
