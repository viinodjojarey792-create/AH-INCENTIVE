import { APP, CATEGORY_LABELS } from '../state.js';
import { money, escapeHtml, fmt, toast, downloadFile, norm, parseDateFlexible, monthKeyOf, uid } from '../utils.js';
import { scheduleSave } from '../store.js';
import { isAdmin } from '../auth.js';
import { ensureMonth, sortedMonthKeys } from '../months.js';
import { SEED_EMPLOYEES } from '../../../data/seed-employees.js';
import { rerenderActiveTab } from '../ui-shell.js';
import { populateMonthSelect } from '../boot.js';
import { getCustomerCache, setCustomerCache, saveCustomer } from '../../roles/cre-crm.js';

/* =========================================================================
   Rules & Settings tab
   ========================================================================= */
const ALL_PERF_CATS = ['TECHNICIAN','ADVISOR','SUPERVISOR','NARODE','WM','SERVICE_MANAGER','STORE_MANAGER','WARRANTY','BODYSHOP'];

/* =========================================================================
   Google Sheets Import System
   =========================================================================
   Converts a public Google Sheet share URL to a CSV download URL, fetches
   the data, maps columns, merges with existing data (add-only or replace).
   Sheet links are saved per data type so re-import is one click.
   Data is compressed (JSON.stringify → LZ-style via btoa) when stored.
   ========================================================================= */

// Convert any Google Sheets share URL to CSV export URL
function gsheetToCsvUrl(url) {
  try {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!idMatch) return null;
    const id = idMatch[1];
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
  } catch (e) { return null; }
}

async function fetchGsheetCsv(url) {
  const csvUrl = gsheetToCsvUrl(url);
  if (!csvUrl) throw new Error('Invalid Google Sheets URL. Should look like: https://docs.google.com/spreadsheets/d/XXXXX/edit');

  const isRealCsv = (text) => {
    if (!text || text.trim().length < 5) return false;
    const t = text.trim();
    return !t.startsWith('<') && !t.startsWith('{');
  };

  // Method 1: Google gviz endpoint (best CORS support for public sheets)
  try {
    const res = await fetch(csvUrl, { redirect: 'follow' });
    if (res.ok) {
      const text = await res.text();
      if (isRealCsv(text)) return text;
    }
  } catch (e) { console.warn('[GS] gviz fetch failed:', e.message); }

  // Method 2: Standard export URL
  try {
    const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      const res2 = await fetch(`https://docs.google.com/spreadsheets/d/${idMatch[1]}/export?format=csv`, { redirect: 'follow' });
      if (res2.ok) { const t = await res2.text(); if (isRealCsv(t)) return t; }
    }
  } catch (e) { console.warn('[GS] export fetch failed:', e.message); }

  // Method 3: CORS proxies
  for (const proxy of [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(csvUrl)}`
  ]) {
    try {
      const r = await fetch(proxy);
      if (r.ok) { const t = await r.text(); if (isRealCsv(t)) return t; }
    } catch (e) { console.warn('[GS] proxy failed:', proxy.substring(0,40), e.message); }
  }

  throw new Error(
    'Could not load the Google Sheet. Your sharing settings look correct from the screenshot. ' +
    'Try clicking "Copy link" from the Share dialog in Google Sheets and pasting that URL here — ' +
    'the link copied from the Share button is the most reliable format.'
  );
}


// Column mapper — tries multiple possible header names for each field
const COL = {
  find: (row, ...candidates) => {
    for (const c of candidates) {
      for (const k of Object.keys(row)) {
        if (k.trim().toLowerCase().replace(/[^a-z0-9]/g,'').includes(c.toLowerCase().replace(/[^a-z0-9]/g,''))) return row[k]?.trim() || '';
      }
    }
    return '';
  }
};

// Import handlers — one per data type
const GS_IMPORTERS = {
  employees: {
    label: 'Employee List',
    hint: 'Columns needed: Name, Designation, Mobile, DOJ, Gender, Status',
    merge: (existing, rows) => {
      const out = [...existing];
      let added = 0, updated = 0;
      for (const row of rows) {
        const name  = COL.find(row, 'nameofemployee', 'name', 'empname', 'employeename', 'employee');
        if (!name) continue;
        const mobile = COL.find(row, 'mobile', 'phone', 'contact', 'mobileno');
        const desig  = COL.find(row, 'designation', 'post', 'role');
        const dept   = COL.find(row, 'department', 'dept');
        const doj    = COL.find(row, 'doj', 'dateofjoining', 'joining', 'date');
        const gender = COL.find(row, 'gender', 'sex');
        const status = COL.find(row, 'activestatus', 'status', 'active') || 'ACTIVE';
        const hirise = COL.find(row, 'namesasphirise', 'hirise', 'hirisename', 'namesasperh');
        // Match by mobile or name
        const existing_idx = out.findIndex(e => (mobile && e.mobile === mobile) || norm(e.nameHR) === norm(name));
        if (existing_idx >= 0) {
          // Update existing
          out[existing_idx] = { ...out[existing_idx], nameHR: name, designation: desig || out[existing_idx].designation, department: dept || out[existing_idx].department, mobile: mobile || out[existing_idx].mobile, doj: doj || out[existing_idx].doj, gender: gender || out[existing_idx].gender, status: status.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', hiriseAliases: hirise ? [norm(hirise)] : out[existing_idx].hiriseAliases };
          updated++;
        } else {
          out.push({ id: uid('e'), nameHR: name, designation: desig, department: dept, mobile, doj, gender, status: status.toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE', category: 'NONE', target: 0, hiriseAliases: hirise ? [norm(hirise)] : [], hidden: false, srNo: out.length + 1 });
          added++;
        }
      }
      return { data: out, added, updated };
    },
    replace: (rows) => {
      let idx = 0;
      return rows.filter(r => COL.find(r, 'name', 'empname')).map(row => {
        const name = COL.find(row, 'name', 'empname', 'employeename');
        const desig = COL.find(row, 'designation', 'post', 'role');
        return { id: uid('e'), nameHR: name, designation: desig, department: COL.find(row, 'department', 'dept'), mobile: COL.find(row, 'mobile', 'phone'), doj: COL.find(row, 'doj', 'dateofjoining'), gender: COL.find(row, 'gender'), status: 'ACTIVE', category: 'NONE', target: 0, hiriseAliases: [], hidden: false, srNo: ++idx };
      });
    }
  },

  hrsheet: {
    label: 'HR Sheet',
    hint: 'Columns: SR NO | NAME OF EMPLOYEE | Gender | DOJ | DEPARTMENT | DESIGNATION | ACTIVE STATUS | NAMES AS PER HIRISE | Current Month | tobacco consumer (YES/NO) | Leaves Taken in Current month | Approved leaves in current month | late marks in current month',
    merge: (existing_m, rows, monthKey) => {
      const m = existing_m;
      if (!m.hrSheet) m.hrSheet = {};
      let updated = 0;
      for (const row of rows) {
        const name = COL.find(row, 'name', 'empname', 'employeename');
        if (!name) continue;
        const emp = APP.employees.find(e => norm(e.nameHR) === norm(name));
        const id = emp ? emp.id : norm(name);
        m.hrSheet[id] = {
          nameHR: name,
          actualAbsentee: parseFloat(COL.find(row, 'absentee', 'absent', 'actualabsentee')) || 0,
          approvedLeave: parseFloat(COL.find(row, 'approvedleave', 'leave', 'al')) || 0,
          lateMarks: parseFloat(COL.find(row, 'latemark', 'late')) || 0,
          tobacco: (COL.find(row, 'tobacco', 'tobaccoconsumer') || '').toUpperCase() === 'YES',
          hrRemark: COL.find(row, 'remark', 'hrremarks', 'remarks')
        };
        updated++;
      }
      return { data: m, added: 0, updated };
    },
    replace: (rows, monthKey) => {
      const m = ensureMonth(monthKey);
      m.hrSheet = {};
      return GS_IMPORTERS.hrsheet.merge(m, rows, monthKey);
    }
  },

  jobcard: {
    label: 'Job Card & Revenue',
    hint: 'Columns needed: Job Card Closed Date, Technician Name, Service Advisor Name, Labour Revenue, Parts Revenue, Lubes Revenue',
    merge: (existing_archive, rows) => {
      const archive = existing_archive || { byMonth: {}, fileName: 'Google Sheets', uploadedAt: new Date().toISOString(), totalRowsInFile: 0 };
      if (!archive._seenRowKeys) archive._seenRowKeys = {}; // persisted de-dup guard across merges
      let added = 0, duplicates = 0;
      for (const row of rows) {
        const d = parseDateFlexible(COL.find(row, 'closeddate', 'jobcarddate', 'closingdate', 'date'));
        if (!d) continue;

        // De-dup: never count the same job card row twice, even across repeated/overlapping uploads
        const idCol = COL.find(row, 'jobcardnumber', 'jobcardno', 'jcnumber');
        const labour = money(COL.find(row, 'labour', 'labourrevenue', 'labouramount'));
        const parts = money(COL.find(row, 'parts', 'partsrevenue', 'partsamount'));
        const lubes = money(COL.find(row, 'lube', 'lubesrevenue', 'lubeamount'));
        const tech = norm(COL.find(row, 'technician', 'techname'));
        const adv = norm(COL.find(row, 'advisor', 'serviceadvisor', 'advname'));
        const rowKey = idCol ? ('JC:'+norm(String(idCol))) : ('COMPOSITE:'+[d.toISOString(),tech,adv,labour,parts,lubes].join('|'));
        if (archive._seenRowKeys[rowKey]) { duplicates++; continue; }
        archive._seenRowKeys[rowKey] = true;

        const mk = monthKeyOf(d);
        if (!archive.byMonth[mk]) archive.byMonth[mk] = { byTech: {}, byAdvisor: {}, workshop: { total: 0, count: 0 } };
        // LOP = Labour + Lubes + Parts only (excludes Accessories Revenue), GST removed (18%)
        const lopGross = labour + parts + lubes;
        const lopNet = lopGross / 1.18;
        archive.byMonth[mk].workshop.total += lopNet;
        archive.byMonth[mk].workshop.count += 1;
        if (tech) {
          if (!archive.byMonth[mk].byTech[tech]) archive.byMonth[mk].byTech[tech] = { revenue: 0, count: 0 };
          archive.byMonth[mk].byTech[tech].revenue += lopNet;
          archive.byMonth[mk].byTech[tech].count += 1;
        }
        if (adv) {
          if (!archive.byMonth[mk].byAdvisor[adv]) archive.byMonth[mk].byAdvisor[adv] = { revenue: 0, count: 0 };
          archive.byMonth[mk].byAdvisor[adv].revenue += lopNet;
          archive.byMonth[mk].byAdvisor[adv].count += 1;
        }
        added++;
      }
      archive.totalRowsInFile = (archive.totalRowsInFile || 0) + added;
      return { data: archive, added, updated: 0, duplicatesSkipped: duplicates };
    },
    replace: (rows) => {
      return GS_IMPORTERS.jobcard.merge({ byMonth: {}, fileName: 'Google Sheets', uploadedAt: new Date().toISOString(), totalRowsInFile: 0 }, rows);
    }
  },

  customers: {
    label: 'Customer Database',
    hint: 'Columns needed: Name, Mobile, Vehicle Number, Model, Frame Number, Last Service Date',
    merge: async (existing, rows) => {
      const out = [...existing];
      let added = 0, updated = 0;
      for (const row of rows) {
        const name = COL.find(row, 'name', 'customername', 'ownername');
        const mobile = COL.find(row, 'mobile', 'phone', 'contact');
        if (!name && !mobile) continue;
        const vno = COL.find(row, 'vehicleno', 'vehiclenumber', 'regNo', 'registration').toUpperCase();
        const existing_idx = out.findIndex(c =>
          (mobile && c.mobile === mobile.replace(/\D/g,'')) ||
          (vno && c.vehicle_number === vno)
        );
        const custData = {
          name, mobile: mobile.replace(/\D/g,''),
          vehicle_number: vno,
          model_name: COL.find(row, 'model', 'modelname', 'vehicle'),
          frame_number: COL.find(row, 'frame', 'chassis', 'framenumber'),
          last_service_date: COL.find(row, 'lastservice', 'servicedate', 'lastvisit') || null,
          notes: COL.find(row, 'notes', 'remarks', 'comment'),
          updated_at: new Date().toISOString()
        };
        if (existing_idx >= 0) { out[existing_idx] = { ...out[existing_idx], ...custData }; updated++; }
        else { out.push({ id: uid('c'), ...custData, total_visits: 0, created_at: new Date().toISOString() }); added++; }
      }
      return { data: out, added, updated };
    },
    replace: (rows) => GS_IMPORTERS.customers.merge([], rows)
  },

  complaints: {
    label: 'HMSI Complaints',
    hint: 'Columns needed: Complaint Date, Employee Name (or phone), Status (Action Completed / Closed)',
    merge: (existing_m, rows, monthKey) => {
      const m = existing_m;
      if (!m.complaints) m.complaints = {};
      let added = 0;
      for (const row of rows) {
        const status = COL.find(row, 'status', 'complaintstatus', 'action');
        if (!['action completed','closed','complete','resolved'].some(s => status.toLowerCase().includes(s))) continue;
        const name = COL.find(row, 'name', 'employee', 'advisor', 'techname');
        const emp = APP.employees.find(e => norm(e.nameHR) === norm(name));
        const id = emp ? emp.id : (uid('c'));
        if (!m.complaints[id]) m.complaints[id] = { name, count: 0 };
        m.complaints[id].count = (m.complaints[id].count || 0) + 1;
        added++;
      }
      return { data: m, added, updated: 0 };
    },
    replace: (rows, monthKey) => {
      const m = ensureMonth(monthKey);
      m.complaints = {};
      return GS_IMPORTERS.complaints.merge(m, rows, monthKey);
    }
  }
};

// Save Google Sheet links per data type
function getGsLinks() { return (APP.settings && APP.settings._gsLinks) || {}; }
function saveGsLink(type, url) {
  if (!APP.settings) APP.settings = {};
  if (!APP.settings._gsLinks) APP.settings._gsLinks = {};
  APP.settings._gsLinks[type] = url;
  scheduleSave('settings', () => APP.settings);
}

async function runGsImport(type, mode, statusEl) {
  const links = getGsLinks();
  const url = links[type];
  if (!url) { statusEl.textContent = '⚠ No Google Sheet link saved. Save a link above first.'; statusEl.style.color = 'var(--bad)'; return; }
  statusEl.textContent = '⏳ Fetching from Google Sheets…'; statusEl.style.color = 'var(--ink-soft)';
  try {
    const csvText = await fetchGsheetCsv(url);
    const rows = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;
    if (!rows.length) { statusEl.textContent = '⚠ Sheet appears empty or headers not found.'; statusEl.style.color = 'var(--bad)'; return; }
    await processParsedRows(type, rows, mode, statusEl);
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--bad)';
  }
}

export function renderGoogleSheetsPanel() {
  const links = getGsLinks();
  const mk = APP.meta.currentMonth;
  const SHEETS = [
    { key: 'employees', label: '👥 Employee List',      monthly: false },
    { key: 'hrsheet',   label: '📋 HR Sheet',           monthly: true  },
    { key: 'jobcard',   label: '₹ Job Card & Revenue', monthly: false },
    { key: 'customers', label: '🏍 Customer Database',  monthly: false },
    { key: 'complaints',label: '⚠ HMSI Complaints',    monthly: true  },
  ];
  const panel = document.getElementById('tab-settings');
  const existing = panel.innerHTML;
  const gsHtml = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head"><strong>📊 Import Data</strong></div>
      <div class="banner info" style="margin-top:0;margin-bottom:14px;"><span>ℹ</span><div>
        <b>Two ways to import:</b><br>
        <b>Option A — Paste directly</b> (always works): Open your Google Sheet → Select all (Ctrl+A) → Copy (Ctrl+C) → paste in the box below → click Import.<br>
        <b>Option B — Google Sheet URL</b> (requires "Anyone with link can view" + public internet access).
      </div></div>
      ${SHEETS.map(s => `
        <div style="border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${s.label}${s.monthly ? ` <span class="kbd-note">(for ${escapeHtml(ensureMonth(mk).label || mk)})</span>` : ''}</div>
          <p class="kbd-note" style="margin-bottom:10px;">${GS_IMPORTERS[s.key].hint}</p>

          <!-- OPTION A: Paste directly -->
          <div style="margin-bottom:10px;">
            <label style="font-size:11px;font-weight:600;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.5px;">Option A — Paste from Google Sheets (Ctrl+A then Ctrl+C in sheet)</label>
            <textarea id="gs-paste-${s.key}" rows="3" placeholder="Paste copied Google Sheet data here…" style="width:100%;margin-top:4px;font-size:11px;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);resize:vertical;font-family:var(--font-mono);"></textarea>
            <div style="display:flex;gap:8px;margin-top:6px;">
              <button class="btn" data-gs-paste-import="${s.key}" style="flex:1;">↓ Import Pasted Data</button>
              <button class="btn secondary" data-gs-paste-replace="${s.key}" style="flex:1;border-color:var(--bad);color:var(--bad);">⟳ Replace with Pasted Data</button>
            </div>
          </div>

          <!-- OPTION B: URL -->
          <div>
            <label style="font-size:11px;font-weight:600;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.5px;">Option B — Google Sheet URL (auto-fetch)</label>
            <div style="display:flex;gap:8px;margin-top:4px;margin-bottom:6px;flex-wrap:wrap;">
              <input type="url" id="gs-link-${s.key}" placeholder="https://docs.google.com/spreadsheets/d/..." value="${escapeHtml(links[s.key]||'')}" style="flex:1;min-width:180px;font-size:11px;padding:6px 10px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--ink);">
              <button class="btn secondary" data-gs-save="${s.key}" style="white-space:nowrap;font-size:12px;">💾 Save</button>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn secondary" data-gs-import="${s.key}" style="flex:1;font-size:12px;">↓ Fetch & Import New</button>
              <button class="btn secondary" data-gs-replace="${s.key}" style="flex:1;font-size:12px;border-color:var(--bad);color:var(--bad);">⟳ Fetch & Replace All</button>
            </div>
          </div>

          <div id="gs-status-${s.key}" style="font-size:12px;margin-top:8px;min-height:18px;"></div>
        </div>
      `).join('')}
    </div>
  `;
  panel.innerHTML = gsHtml + existing;

  // Parse pasted text — handles both TSV (from Google Sheets copy) and CSV
  function parsePasted(text) {
    const istsv = text.includes('\t');
    if (istsv) {
      const lines = text.trim().split('\n');
      const headers = lines[0].split('\t').map(h => h.trim().replace(/^"|"$/g,''));
      return lines.slice(1).filter(l => l.trim()).map(line => {
        const vals = line.split('\t').map(v => v.trim().replace(/^"|"$/g,''));
        return Object.fromEntries(headers.map((h,i) => [h, vals[i]||'']));
      });
    }
    return Papa.parse(text.trim(), { header: true, skipEmptyLines: true }).data;
  }

  SHEETS.forEach(s => {
    const statusEl = () => document.getElementById(`gs-status-${s.key}`);

    // Option A: paste import
    document.querySelector(`[data-gs-paste-import="${s.key}"]`)?.addEventListener('click', async () => {
      const text = document.getElementById(`gs-paste-${s.key}`).value.trim();
      if (!text) { statusEl().textContent = '⚠ Paste your Google Sheet data in the box above first'; statusEl().style.color='var(--bad)'; return; }
      const rows = parsePasted(text);
      if (!rows.length) { statusEl().textContent = '⚠ Could not read pasted data — make sure you copied from Google Sheets'; statusEl().style.color='var(--bad)'; return; }
      await processParsedRows(s.key, rows, 'merge', statusEl());
    });
    document.querySelector(`[data-gs-paste-replace="${s.key}"]`)?.addEventListener('click', async () => {
      const text = document.getElementById(`gs-paste-${s.key}`).value.trim();
      if (!text) { statusEl().textContent = '⚠ Paste your Google Sheet data in the box above first'; statusEl().style.color='var(--bad)'; return; }
      if (!confirm(`Replace ALL ${s.label} data with pasted data? Cannot be undone.`)) return;
      const rows = parsePasted(text);
      await processParsedRows(s.key, rows, 'replace', statusEl());
    });

    // Option B: URL fetch
    document.querySelector(`[data-gs-save="${s.key}"]`)?.addEventListener('click', () => {
      const url = document.getElementById(`gs-link-${s.key}`).value.trim();
      if (!url) { toast('Paste a Google Sheet URL first', true); return; }
      saveGsLink(s.key, url); toast('Link saved');
    });
    document.querySelector(`[data-gs-import="${s.key}"]`)?.addEventListener('click', async () => {
      const url = document.getElementById(`gs-link-${s.key}`).value.trim();
      if (url) saveGsLink(s.key, url);
      await runGsImport(s.key, 'merge', statusEl());
    });
    document.querySelector(`[data-gs-replace="${s.key}"]`)?.addEventListener('click', async () => {
      if (!confirm(`Replace ALL ${s.label} data? Cannot be undone.`)) return;
      const url = document.getElementById(`gs-link-${s.key}`).value.trim();
      if (url) saveGsLink(s.key, url);
      await runGsImport(s.key, 'replace', statusEl());
    });
  });
}

// Shared: process already-parsed rows (used by both paste and URL fetch)
async function processParsedRows(type, rows, mode, statusEl) {
  statusEl.textContent = `⏳ Processing ${rows.length} rows…`; statusEl.style.color='var(--ink-soft)';
  try {
    const mk = APP.meta.currentMonth;
    let result;
    if (type === 'employees') {
      if (mode === 'replace') APP.employees = GS_IMPORTERS.employees.replace(rows);
      else { const r = GS_IMPORTERS.employees.merge(APP.employees, rows); APP.employees = r.data; result = r; }
      scheduleSave('employees', () => APP.employees);
    } else if (type === 'hrsheet') {
      const m = ensureMonth(mk);
      if (mode === 'replace') m.hrSheet = {};
      result = GS_IMPORTERS.hrsheet.merge(m, rows, mk);
      scheduleSave('months', () => APP.months);
    } else if (type === 'jobcard') {
      if (mode === 'replace') { const r = GS_IMPORTERS.jobcard.replace(rows); APP.jobCardArchive = r.data; result = r; }
      else { const r = GS_IMPORTERS.jobcard.merge(APP.jobCardArchive, rows); APP.jobCardArchive = r.data; result = r; }
      scheduleSave('jobCardArchive', () => APP.jobCardArchive);
    } else if (type === 'customers') {
      const existing = mode === 'replace' ? [] : (getCustomerCache() || []);
      const r = await GS_IMPORTERS.customers.merge(existing, rows);
      setCustomerCache(r.data); result = r;
      for (const c of r.data) await saveCustomer(c);
    } else if (type === 'complaints') {
      const m = ensureMonth(mk);
      if (mode === 'replace') m.complaints = {};
      result = GS_IMPORTERS.complaints.merge(m, rows, mk);
      scheduleSave('months', () => APP.months);
    }
    const msg = result ? `✓ Done — ${result.added} added, ${result.updated} updated from ${rows.length} rows` : `✓ Done — ${rows.length} rows processed`;
    statusEl.textContent = msg; statusEl.style.color = 'var(--good)';
    rerenderActiveTab();
  } catch (e) {
    statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--bad)';
  }
}


export function renderSettings() {
  const s = APP.settings;
  const panel = document.getElementById('tab-settings');
  panel.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="card-head"><strong>Behavioral Incentive Amounts</strong></div>
        <div class="grid-2">
          <div class="field"><label>Leave Component ₹</label><input type="text" class="cell-input" style="width:120px;" id="st-leaveAmount" value="${s.leaveAmount}"></div>
          <div class="field"><label>Max Absentee Days for Leave ₹</label><input type="text" class="cell-input" style="width:120px;" id="st-maxAbsentee" value="${s.maxAbsenteeForLeaveComponent}"></div>
        </div>
        <div class="grid-2">
          <div class="field"><label>Late Mark Component ₹</label><input type="text" class="cell-input" style="width:120px;" id="st-lateMarkAmount" value="${s.lateMarkAmount}"></div>
          <div class="field"><label>No-Tobacco Component ₹</label><input type="text" class="cell-input" style="width:120px;" id="st-tobaccoAmount" value="${s.tobaccoAmount}"></div>
        </div>
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-top:6px;">
          <input type="checkbox" id="st-tobaccoMaleOnly" ${s.tobaccoMaleOnly ? 'checked' : ''}> Tobacco component applies to male employees only
        </label>
        <div class="divider"></div>
        <div class="grid-2">
          <div class="field"><label>Complaint Base ₹ (0 complaints)</label><input type="text" class="cell-input" style="width:120px;" id="st-complaintBase" value="${s.complaintBaseAmount}"></div>
          <div class="field"><label>Complaint Penalty ₹</label><input type="text" class="cell-input" style="width:120px;" id="st-complaintPenalty" value="${s.complaintPenaltyAmount}"></div>
        </div>
        <div class="field"><label>Penalty Applies at Exactly This Many Complaints</label><input type="text" class="cell-input" style="width:120px;" id="st-complaintAtCount" value="${s.complaintPenaltyAtCount}"></div>
        <div class="field"><label>Complaint Component Applies To</label>
          <div class="tag-row">
            ${ALL_PERF_CATS.concat(['NONE']).map(c => `<label style="display:flex; align-items:center; gap:5px; font-size:12px; border:1px solid var(--line-strong); padding:4px 8px; border-radius:6px;">
              <input type="checkbox" class="st-cplcat" value="${c}" ${s.complaintEligibleCategories.includes(c) ? 'checked' : ''}> ${CATEGORY_LABELS[c]}
            </label>`).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><strong>Leave Deduction Slabs (applied to grand total)</strong></div>
        <p class="kbd-note" style="margin-top:-4px; margin-bottom:10px;">Based on Actual Absentee days. Evaluated top to bottom — first match wins. Anything beyond the last row pays 0%.</p>
        <div id="slabRows"></div>
        <button class="btn ghost" id="addSlabBtn" style="margin-top:8px;">+ Add Slab</button>
        <div class="divider"></div>
        <div class="grid-2">
          <div class="field"><label>Default WM Target ₹ (new month)</label><input type="text" class="cell-input" style="width:140px;" id="st-defaultWm" value="${s.defaultWmTarget}"></div>
          <div class="field"><label>Default Warranty Flat ₹</label><input type="text" class="cell-input" style="width:140px;" id="st-warrantyFlat" value="${s.warrantyFlatAmount}"></div>
        </div>
      </div>
    </div>

    ${(isAdmin() || APP.currentUser?.role === 'OWNER') ? `
    <div class="card" style="margin-top:18px;">
      <div class="card-head"><strong>🎯 Service Advisor Incentive Criteria</strong> <span class="pill pill-amber" style="font-size:10px;">Admin / Owner only</span></div>
      <p class="kbd-note" style="margin-bottom:14px;">
        Each advisor must hit <b>both</b> targets to earn incentive. If either target is missed, incentive = ₹0.
      </p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:16px;">
        <div class="field">
          <label>Minimum Vehicles / Month</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" class="cell-input" style="width:120px;" id="st-advVehicleTarget" value="${s.advisorVehicleTarget||500}">
            <span class="kbd-note">vehicles</span>
          </div>
        </div>
        <div class="field">
          <label>Minimum Avg Revenue / Vehicle</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" class="cell-input" style="width:120px;" id="st-advAvgRev" value="${s.advisorAvgRevTarget||1300}">
            <span class="kbd-note">₹ per vehicle</span>
          </div>
        </div>
        <div class="field">
          <label>Incentive — Per Vehicle Rate</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" class="cell-input" style="width:120px;" id="st-advPerVehicle" value="${s.advisorPerVehicleRate||1}">
            <span class="kbd-note">₹ per vehicle</span>
          </div>
        </div>
        <div class="field">
          <label>Incentive — Revenue %</label>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" class="cell-input" style="width:120px;" id="st-advRevPct" value="${s.advisorRevPct||1}">
            <span class="kbd-note">% of total revenue</span>
          </div>
        </div>
      </div>
      <div class="banner info"><span>ℹ</span><div>
        <b>Formula (if both targets met):</b><br>
        Incentive = (Vehicles × ₹${s.advisorPerVehicleRate||1}) + (${s.advisorRevPct||1}% × Total Revenue)<br>
        <b>Example:</b> 550 vehicles, ₹8,00,000 revenue → (550 × ₹${s.advisorPerVehicleRate||1}) + ${s.advisorRevPct||1}% of ₹8,00,000
        = ${fmt(550*(s.advisorPerVehicleRate||1))} + ${fmt(800000*(s.advisorRevPct||1)/100)} = ${fmt(550*(s.advisorPerVehicleRate||1)+800000*(s.advisorRevPct||1)/100)}
      </div></div>
    </div>` : ''}

    <div class="card" style="margin-top:18px;">
      <div class="card-head"><strong>Backup & Reset</strong></div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <button class="btn secondary" id="exportBackupBtn">Export Full Backup (JSON)</button>
        <label class="btn secondary" for="importBackupInput" style="cursor:pointer;">Import Backup (JSON)</label>
        <input type="file" id="importBackupInput" accept=".json" style="display:none;">
        <button class="btn danger" id="resetSeedBtn">Reset Employees to Original Seed</button>
      </div>
      <div class="footer-note">Backup includes all employees, every month's data, and these settings. Resetting employees does not touch month data (attendance, revenue, complaints, rates).</div>
    </div>
  `;
  paintSlabRows();

  const bindNum = (id, setter) => document.getElementById(id).addEventListener('change', (e) => { setter(money(e.target.value)); scheduleSave('settings', () => APP.settings); rerenderActiveTab(); });
  bindNum('st-leaveAmount', v => s.leaveAmount = v);
  bindNum('st-maxAbsentee', v => s.maxAbsenteeForLeaveComponent = v);
  bindNum('st-lateMarkAmount', v => s.lateMarkAmount = v);
  bindNum('st-tobaccoAmount', v => s.tobaccoAmount = v);
  bindNum('st-complaintBase', v => s.complaintBaseAmount = v);
  bindNum('st-complaintPenalty', v => s.complaintPenaltyAmount = v);
  bindNum('st-complaintAtCount', v => s.complaintPenaltyAtCount = v);
  bindNum('st-defaultWm', v => s.defaultWmTarget = v);
  bindNum('st-warrantyFlat', v => s.warrantyFlatAmount = v);
  // Advisor incentive criteria (Admin/Owner)
  if (document.getElementById('st-advVehicleTarget')) {
    bindNum('st-advVehicleTarget', v => s.advisorVehicleTarget  = v);
    bindNum('st-advAvgRev',        v => s.advisorAvgRevTarget   = v);
    bindNum('st-advPerVehicle',    v => s.advisorPerVehicleRate = v);
    bindNum('st-advRevPct',        v => s.advisorRevPct         = v);
  }
  document.getElementById('st-tobaccoMaleOnly').addEventListener('change', (e) => { s.tobaccoMaleOnly = e.target.checked; scheduleSave('settings', () => APP.settings); });
  document.querySelectorAll('.st-cplcat').forEach(cb => cb.addEventListener('change', () => {
    s.complaintEligibleCategories = Array.from(document.querySelectorAll('.st-cplcat:checked')).map(c => c.value);
    scheduleSave('settings', () => APP.settings);
    rerenderActiveTab();
  }));
  document.getElementById('addSlabBtn').addEventListener('click', () => {
    s.leaveDeductionSlabs.push({ upTo: 0, inclusive: true, pct: 0 });
    scheduleSave('settings', () => APP.settings);
    paintSlabRows();
  });
  document.getElementById('exportBackupBtn').addEventListener('click', exportFullBackup);
  document.getElementById('importBackupInput').addEventListener('change', importFullBackup);
  document.getElementById('resetSeedBtn').addEventListener('click', resetEmployeesToSeed);
  renderGoogleSheetsPanel(); // adds Google Sheets import section at top
}

export function paintSlabRows() {
  const s = APP.settings;
  document.getElementById('slabRows').innerHTML = s.leaveDeductionSlabs.map((slab, i) => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span class="kbd-note" style="min-width:60px;">Absentee</span>
      <select class="cell-input" data-slab-op="${i}" style="width:auto;">
        <option value="lte" ${slab.inclusive ? 'selected' : ''}>≤</option>
        <option value="lt" ${!slab.inclusive ? 'selected' : ''}>&lt;</option>
      </select>
      <input type="text" class="cell-input" style="width:60px;" data-slab-upto="${i}" value="${slab.upTo}">
      <span class="kbd-note">→</span>
      <input type="text" class="cell-input" style="width:60px;" data-slab-pct="${i}" value="${slab.pct}">
      <span class="kbd-note">%</span>
      <button class="btn ghost" data-slab-rm="${i}" style="padding:4px 9px;">×</button>
    </div>
  `).join('');
  document.querySelectorAll('[data-slab-op]').forEach(sel => sel.addEventListener('change', (e) => {
    s.leaveDeductionSlabs[parseInt(e.target.dataset.slabOp)].inclusive = e.target.value === 'lte';
    scheduleSave('settings', () => APP.settings); rerenderActiveTab();
  }));
  document.querySelectorAll('[data-slab-upto]').forEach(inp => inp.addEventListener('change', (e) => {
    s.leaveDeductionSlabs[parseInt(e.target.dataset.slabUpto)].upTo = money(e.target.value);
    scheduleSave('settings', () => APP.settings); rerenderActiveTab();
  }));
  document.querySelectorAll('[data-slab-pct]').forEach(inp => inp.addEventListener('change', (e) => {
    s.leaveDeductionSlabs[parseInt(e.target.dataset.slabPct)].pct = money(e.target.value);
    scheduleSave('settings', () => APP.settings); rerenderActiveTab();
  }));
  document.querySelectorAll('[data-slab-rm]').forEach(btn => btn.addEventListener('click', (e) => {
    s.leaveDeductionSlabs.splice(parseInt(e.target.dataset.slabRm), 1);
    scheduleSave('settings', () => APP.settings);
    paintSlabRows();
    rerenderActiveTab();
  }));
}

export function exportFullBackup() {
  const backup = { employees: APP.employees, months: APP.months, settings: APP.settings, jobCardArchive: APP.jobCardArchive, reportingChain: APP.reportingChain, exportedAt: new Date().toISOString() };
  downloadFile(`workshop-incentive-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup, null, 2), 'application/json');
}
export function importFullBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.employees || !data.months || !data.settings) throw new Error('missing fields');
      if (!confirm('This will replace ALL current employees, month data, and settings with the backup file. Continue?')) return;
      APP.employees = data.employees; APP.months = data.months; APP.settings = data.settings;
      APP.jobCardArchive = data.jobCardArchive || { byMonth: {}, fileName: null, uploadedAt: null, totalRowsInFile: 0 };
      APP.reportingChain = data.reportingChain || {};
      scheduleSave('employees', () => APP.employees, 50);
      scheduleSave('months', () => APP.months, 50);
      scheduleSave('settings', () => APP.settings, 50);
      scheduleSave('jobCardArchive', () => APP.jobCardArchive, 50);
      scheduleSave('reportingChain', () => APP.reportingChain, 50);
      if (!APP.months[APP.meta.currentMonth]) APP.meta.currentMonth = sortedMonthKeys()[0] || APP.meta.currentMonth;
      populateMonthSelect();
      rerenderActiveTab();
      toast('Backup restored');
    } catch (err) {
      toast('That file does not look like a valid backup', true);
    }
  };
  reader.readAsText(file);
}
export function resetEmployeesToSeed() {
  if (!confirm('Reset all employees to the original seed list? Month data (attendance, revenue, complaints, rates) will NOT be affected, but any manually added employees or alias changes will be lost.')) return;
  APP.employees = JSON.parse(JSON.stringify(SEED_EMPLOYEES));
  scheduleSave('employees', () => APP.employees, 50);
  rerenderActiveTab();
  toast('Employees reset to seed');
}
