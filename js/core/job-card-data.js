import { APP } from './state.js';
import { money, norm, fmt, escapeHtml, parseDateFlexible, monthKeyOf, monthLabelOf, toast, confirmDestructive } from './utils.js';
import { scheduleSave } from './store.js';
import { ensureMonth, targetWindowForMonth, monthKeyInWindow } from './months.js';
import { parseCsvFile } from './import-handlers.js';
import { renderDashboard } from './ui-shell.js';
import { canDo, isAdmin } from './auth.js';

// Shared "universal data" — job-card/revenue archive. Feeds Technician,
// Advisor, Supervisor, Floor Manager and Workshop Manager achievement/target.
export function ensureJobCardArchive() {
  if (!APP.jobCardArchive) APP.jobCardArchive = { byMonth: {}, fileName: null, uploadedAt: null, totalRowsInFile: 0 };
  if (!APP.jobCardArchive._seenRowKeys) APP.jobCardArchive._seenRowKeys = {}; // persisted de-dup guard — survives across uploads
  if (!APP.jobCardArchive.history) APP.jobCardArchive.history = [];
  if (!APP.hiriseMap) APP.hiriseMap = {}; // { code: { empId, hiriseName, type } }
  return APP.jobCardArchive;
}
// Builds a unique key for a job card row to detect accidental duplicates.
// Prefers an explicit Job Card Number / Job Card No / JC Number column if present;
// falls back to a composite of date + technician + advisor + revenue figures.
export function jobCardRowKey(row) {
  const idCol = row['Job Card Number'] || row['Job Card No'] || row['JC Number'] || row['Job Card No.'] || row['JobCard Number'];
  if (idCol && String(idCol).trim()) return 'JC:' + norm(String(idCol).trim());
  return 'COMPOSITE:' + [
    (row['Job Card Closed Date']||'').trim(),
    norm(row['Technician Name']||''),
    norm(advisorKeyOf(row)),
    money(row['Labour Revenue']), money(row['Parts Revenue']), money(row['Lubes Revenue'])
  ].join('|');
}

// Some DMS/HiRise exports only provide an advisor ID code (e.g. "MH060005SE026"),
// not a text name — fall back to the ID so byAdvisor still gets populated.
// jobCardLookupAdvisor already checks HiRise codes via APP.hiriseMap/hiriseAliases,
// so keying by the ID here is enough for those exports to match correctly.
function advisorKeyOf(row) {
  return row['Service Advisor Name'] || row['Service Advisor Id'] || '';
}

// Merges newly-uploaded job card rows into the existing archive in place.
// De-dup is persisted on the archive itself (_seenRowKeys), so a row that was
// already counted from a previous upload is skipped even if it reappears in
// a later, wider export — only genuinely new job cards get added.
export function mergeJobCardArchive(archive, rows, fileName) {
  let added = 0, duplicateCount = 0;
  let minDate = null, maxDate = null;
  for (const row of rows) {
    const d = parseDateFlexible(row['Job Card Closed Date']);
    if (!d) continue;

    const rowKey = jobCardRowKey(row);
    if (archive._seenRowKeys[rowKey]) { duplicateCount++; continue; }
    archive._seenRowKeys[rowKey] = true;
    added++;

    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;

    const mk = monthKeyOf(d);
    if (!archive.byMonth[mk]) archive.byMonth[mk] = { byTech: {}, byAdvisor: {}, workshop: { total: 0, count: 0 } };
    const labour = money(row['Labour Revenue']);
    const parts = money(row['Parts Revenue']);
    const lubes = money(row['Lubes Revenue']);
    // LOP = Labour + Lubes + Parts only (excludes Accessories Revenue), GST removed (18%)
    const lopGross = labour + parts + lubes;
    const lopNet = lopGross / 1.18;

    archive.byMonth[mk].workshop.total += lopNet;
    archive.byMonth[mk].workshop.count += 1;

    const techName = norm(row['Technician Name']);
    if (techName) {
      if (!archive.byMonth[mk].byTech[techName]) archive.byMonth[mk].byTech[techName] = { revenue: 0, count: 0 };
      archive.byMonth[mk].byTech[techName].revenue += lopNet;
      archive.byMonth[mk].byTech[techName].count += 1;
    }
    const advName = norm(advisorKeyOf(row));
    if (advName) {
      if (!archive.byMonth[mk].byAdvisor[advName]) archive.byMonth[mk].byAdvisor[advName] = { revenue: 0, count: 0 };
      archive.byMonth[mk].byAdvisor[advName].revenue += lopNet;
      archive.byMonth[mk].byAdvisor[advName].count += 1;
    }
  }

  archive.fileName = fileName;
  archive.uploadedAt = new Date().toISOString();
  archive.totalRowsInFile = (archive.totalRowsInFile || 0) + added;
  if (minDate && maxDate) {
    const existing = archive.dateRange;
    archive.dateRange = {
      from: (existing && new Date(existing.from) < minDate) ? existing.from : minDate.toISOString(),
      to:   (existing && new Date(existing.to)   > maxDate) ? existing.to   : maxDate.toISOString(),
    };
  }
  if (!archive.history) archive.history = [];
  archive.history.push({ fileName, at: archive.uploadedAt, added, duplicatesSkipped: duplicateCount, rowsInFile: rows.length });

  return { added, duplicatesSkipped: duplicateCount };
}

// Returns the bucket for a given month from whichever source has data.
// Main archive (APP.jobCardArchive) takes priority — if it has data for that
// month, that's what we use. Old data archive fills in any months the main
// archive doesn't cover. This prevents double-counting if both archives
// contain the same month (e.g. user uploaded the same file to both).
export function getJobCardBucket(monthKey) {
  const mainBucket = APP.jobCardArchive && APP.jobCardArchive.byMonth && APP.jobCardArchive.byMonth[monthKey];
  if (mainBucket) return mainBucket;
  const oldBucket = APP.oldData && APP.oldData.jobCard && APP.oldData.jobCard.byMonth && APP.oldData.jobCard.byMonth[monthKey];
  return oldBucket || null;
}

export function hasAnyJobCardData() {
  return (APP.jobCardArchive && Object.keys(APP.jobCardArchive.byMonth || {}).length > 0) ||
         (APP.oldData && APP.oldData.jobCard && Object.keys(APP.oldData.jobCard.byMonth || {}).length > 0);
}

export function jobCardLookupTech(monthKey, emp) {
  const bucket = getJobCardBucket(monthKey);
  if (!bucket) return { revenue: 0, count: 0, matched: false };
  // Check nameHR first, then all hiriseAliases
  const keys = [norm(emp.nameHR), ...(emp.hiriseAliases || []).map(norm)].filter(Boolean);
  for (const k of keys) {
    if (bucket.byTech && bucket.byTech[k]) return { revenue: bucket.byTech[k].revenue, count: bucket.byTech[k].count, matched: true };
  }
  return { revenue: 0, count: 0, matched: false };
}
export function jobCardLookupAdvisor(monthKey, emp) {
  const bucket = getJobCardBucket(monthKey);
  if (!bucket) return { revenue: 0, count: 0, matched: false };
  // Build all keys to check: nameHR + hiriseAliases + HiRise codes from hiriseMap
  const keys = [norm(emp.nameHR), ...(emp.hiriseAliases || []).map(norm)].filter(Boolean);
  // Also add HiRise codes mapped to this employee
  if (APP.hiriseMap) {
    Object.values(APP.hiriseMap).forEach(entry => {
      if (entry.empId === emp.id || entry.hiriseName && norm(entry.hiriseName) === norm(emp.nameHR)) {
        keys.push(norm(entry.code));
        if (entry.hiriseName) keys.push(norm(entry.hiriseName));
      }
    });
  }
  // Also check static HIRISE_SEED for this employee
  if (window.HIRISE_SEED) {
    window.HIRISE_SEED.filter(s => s.type === 'advisor' && norm(s.hiriseName) === norm(emp.nameHR))
      .forEach(s => keys.push(norm(s.code)));
  }
  const uniqueKeys = [...new Set(keys)].filter(Boolean);
  // Check byAdvisor first, then byTech (HiRise exports sometimes put advisor codes in tech column)
  for (const k of uniqueKeys) {
    if (bucket.byAdvisor && bucket.byAdvisor[k]) return { revenue: bucket.byAdvisor[k].revenue, count: bucket.byAdvisor[k].count, matched: true };
  }
  for (const k of uniqueKeys) {
    if (bucket.byTech && bucket.byTech[k]) return { revenue: bucket.byTech[k].revenue, count: bucket.byTech[k].count, matched: true };
  }
  return { revenue: 0, count: 0, matched: false };
}

// Sums a technician/advisor's revenue across every month-bucket in the
// prior-year half-year window, checking BOTH archives (main first, then old
// data for any months the main archive doesn't cover).
export function archiveWindowSum(archive, win, byKey, normalizedName) {
  let sum = 0, found = false;
  for (const mk of Object.keys(archive.byMonth)) {
    if (!monthKeyInWindow(mk, win)) continue;
    const bucket = archive.byMonth[mk][byKey];
    if (bucket && bucket[normalizedName]) { sum += bucket[normalizedName].revenue; found = true; }
  }
  return found ? sum : null;
}

export function archiveWindowSumMerged(win, byKey, normalizedName) {
  // Collect months from both archives; main archive wins for overlapping months.
  const mainMonths = new Set(Object.keys((APP.jobCardArchive && APP.jobCardArchive.byMonth) || {}));
  let sum = 0, found = false;
  // From main archive
  if (APP.jobCardArchive) {
    const r = archiveWindowSum(APP.jobCardArchive, win, byKey, normalizedName);
    if (r !== null) { sum += r; found = true; }
  }
  // From old data archive — only months NOT already covered by main archive
  if (APP.oldData && APP.oldData.jobCard && APP.oldData.jobCard.byMonth) {
    for (const mk of Object.keys(APP.oldData.jobCard.byMonth)) {
      if (!monthKeyInWindow(mk, win)) continue;
      if (mainMonths.has(mk)) continue; // main archive already covers this month
      const bucket = APP.oldData.jobCard.byMonth[mk][byKey];
      if (bucket && bucket[normalizedName]) { sum += bucket[normalizedName].revenue; found = true; }
    }
  }
  return found ? sum : null;
}

// Target = average revenue over the matching prior-year half-year window,
// computed from the same Job Card upload. Falls back to the employee's
// stored manual target if that window's data isn't present in the upload
// (e.g. a new hire, or a file that doesn't reach back far enough).
// An admin-set per-month override (if present) takes priority over both.
export function getTechnicianTarget(monthKey, emp) {
  const m = ensureMonth(monthKey);
  if (m.targetOverrides[emp.id] != null) {
    return { value: money(m.targetOverrides[emp.id]), source: 'override', windowLabel: null };
  }
  const win = targetWindowForMonth(monthKey);
  const keys = [norm(emp.nameHR), ...(emp.hiriseAliases || []).map(norm)].filter(Boolean);
  for (const a of keys) {
    const sum = archiveWindowSumMerged(win, 'byTech', a);
    if (sum > 0) return { value: sum / 6, source: 'auto', windowLabel: win.label };
  }
  return { value: money(emp.target), source: 'manual', windowLabel: win.label };
}
export function getAdvisorTarget(monthKey, emp) {
  const m = ensureMonth(monthKey);
  if (m.targetOverrides[emp.id] != null) {
    return { value: money(m.targetOverrides[emp.id]), source: 'override', windowLabel: null };
  }
  const win = targetWindowForMonth(monthKey);
  const keys = [norm(emp.nameHR), ...(emp.hiriseAliases || []).map(norm)].filter(Boolean);
  for (const a of keys) {
    const sum = archiveWindowSumMerged(win, 'byAdvisor', a);
    if (sum > 0) return { value: sum / 6, source: 'auto', windowLabel: win.label };
  }
  return { value: money(emp.target), source: 'manual', windowLabel: win.label };
}

// Returns total Bodyshop department LOP revenue (GST-removed) for a month.
// This is the SAME figure used as combined achievement for both Bodyshop Executives —
// summing each bodyshop technician's individual job card revenue once.
export function getBodyshopDeptRevenue(monthKey) {
  const bsTechs = APP.employees.filter(e => e.category === 'BODYSHOP' && e.status === 'ACTIVE' && !e.noIncentive &&
    !(e.designation||'').toLowerCase().includes('executive') && !(e.designation||'').toLowerCase().includes('exec'));
  let total = 0, count = 0;
  for (const t of bsTechs) {
    const r = jobCardLookupTech(monthKey, t);
    total += r.revenue; count += r.count;
  }
  return { revenue: total, count };
}

// Compare a built byTech/byAdvisor map against current employees' aliases — names with revenue but no matching employee.
export function findUnmatchedNames(map, category) {
  const aliasSet = new Set();
  for (const e of APP.employees) {
    if (e.category !== category) continue;
    (e.hiriseAliases || []).forEach(a => aliasSet.add(norm(a)));
  }
  const unmatched = [];
  for (const key of Object.keys(map)) {
    if (!aliasSet.has(key)) unmatched.push({ name: key, revenue: map[key].revenue, count: map[key].count });
  }
  unmatched.sort((a, b) => b.revenue - a.revenue);
  return unmatched;
}

/* =========================================================================
   "Job Card & Revenue" tab UI — shared upload surface (feeds Technician,
   Advisor, Supervisor, Floor Manager, Workshop Manager).
   ========================================================================= */
export function renderRevenue(containerId) {
  containerId = containerId || 'tab-revenue';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const panel = document.getElementById(containerId);
  const canUp = canDo('upload_data') || isAdmin();
  const archive = ensureJobCardArchive();
  const hasArchive = !!archive.fileName;
  const bucket = getJobCardBucket(mk);  // merged: main archive first, old data fallback
  const win = targetWindowForMonth(mk);
  // Count window rows from both archives (deduplicated by month)
  const mainMonths = new Set(Object.keys(archive.byMonth || {}));
  let rowsInWindow = 0;
  for (const k of Object.keys(archive.byMonth || {})) { if (monthKeyInWindow(k, win)) rowsInWindow += archive.byMonth[k].workshop.count; }
  if (APP.oldData && APP.oldData.jobCard) {
    for (const k of Object.keys(APP.oldData.jobCard.byMonth || {})) {
      if (!mainMonths.has(k) && monthKeyInWindow(k, win)) rowsInWindow += APP.oldData.jobCard.byMonth[k].workshop.count;
    }
  }

  const unmatchedTech = bucket ? findUnmatchedNames(bucket.byTech, 'TECHNICIAN') : [];
  const unmatchedAdv = bucket ? findUnmatchedNames(bucket.byAdvisor, 'ADVISOR') : [];
  const monthsCovered = Object.keys(archive.byMonth).sort();

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>Job Card Log Sheet and Revenue</strong></div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Upload job card exports here — every month's achievement is read automatically from <b>Job Card Closed Date</b>. Each upload is merged into what's already stored: rows already seen (matched by Job Card Number) are skipped automatically, so re-uploading the same file or an overlapping export never double-counts. Achievement is also pulled from data you uploaded in the <b>Old Data Archive</b> tab, for any months this archive doesn't cover.</p>
      ${canUp ? `
      <label class="upload-zone" for="jcFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">Job_Card_Log_Sheet_and_Revenue.csv</div>
      </label>
      <input type="file" id="jcFileInput" accept=".csv" style="display:none;">
      ` : `<div class="banner"><span>🔒</span><div>You don't have permission to upload data here. Contact an admin if you need this changed.</div></div>`}
      ${hasArchive ? `
        <div class="divider"></div>
        <div class="stat-row">
          <div class="stat"><div class="label">File</div><div class="value" style="font-size:13px;">${escapeHtml(archive.fileName)}</div></div>
          <div class="stat"><div class="label">Data Period</div><div class="value" style="font-size:14px;">${archive.dateRange ? new Date(archive.dateRange.from).toLocaleDateString('en-GB') + ' – ' + new Date(archive.dateRange.to).toLocaleDateString('en-GB') : '—'}</div></div>
          <div class="stat"><div class="label">Months Covered</div><div class="value">${monthsCovered.length}</div></div>
          <div class="stat"><div class="label">Job Cards in ${escapeHtml(m.label)}</div><div class="value">${bucket ? bucket.workshop.count : 0}</div></div>
          <div class="stat"><div class="label">Workshop Revenue (L+P+Lube) — ${escapeHtml(m.label)}</div><div class="value" style="font-size:18px;">${fmt(bucket ? bucket.workshop.total : 0)}</div></div>
        </div>
        ${!bucket ? `<div class="banner"><span>⚠</span><div>No job cards with a <b>Job Card Closed Date</b> in ${escapeHtml(m.label)} were found in the uploaded file(s). ${monthsCovered.length ? 'Months actually covered: ' + monthsCovered.map(monthLabelOf).join(', ') + '.' : ''}</div></div>` : ''}
        ${archive.history && archive.history.length > 1 ? `
        <div style="margin-top:12px;">
          <div class="kbd-note" style="margin-bottom:4px;">Upload history (${archive.history.length} uploads):</div>
          ${archive.history.slice(-5).reverse().map(h =>
            `<div class="kbd-note">• ${new Date(h.at).toLocaleString()} — <b>+${h.added}</b> added, ${h.duplicatesSkipped} duplicates skipped (${escapeHtml(h.fileName)})</div>`
          ).join('')}
        </div>` : ''}
        <div class="banner info" style="margin-top:12px;"><span>📅</span><div><b>Technician / Advisor target window for ${escapeHtml(m.label)}: ${escapeHtml(win.label)}.</b> ${rowsInWindow} job card(s) from that window were found in this file and averaged ÷6 automatically. Anyone with no revenue in that window keeps their manually-set target instead.</div></div>
        ${(unmatchedTech.length || unmatchedAdv.length) ? `
          <div class="banner">
            <span>⚠</span>
            <div>
              <b>${unmatchedTech.length + unmatchedAdv.length} name(s) in ${escapeHtml(m.label)}'s data don't match any employee's alias list</b> — their revenue is currently excluded from individual figures (it's still counted in the Workshop Manager total). Add them as aliases on the Employees tab.
              <div style="margin-top:8px;">
                ${unmatchedTech.map(u => `<div class="match-row"><span class="name">${escapeHtml(u.name)}</span><span class="kbd-note">(Technician) — ${fmt(u.revenue)}, ${u.count} job card(s)</span></div>`).join('')}
                ${unmatchedAdv.map(u => `<div class="match-row"><span class="name">${escapeHtml(u.name)}</span><span class="kbd-note">(Advisor) — ${fmt(u.revenue)}, ${u.count} job card(s)</span></div>`).join('')}
              </div>
            </div>
          </div>` : (bucket ? `<div class="banner info"><span>✓</span><div>Every technician and advisor name in ${escapeHtml(m.label)}'s data matches a known employee alias.</div></div>` : '')}
        ${canUp ? `<button class="btn ghost" id="jcClearBtn">Clear uploaded data</button>` : ''}
      ` : `<div class="empty-state" style="padding:24px 0 0 0;"><div class="icon">○</div>No revenue data uploaded yet.</div>`}
      <div class="divider"></div>
      <div class="field" style="max-width:220px;"><label>Workshop Manager Monthly Target ₹</label><input type="text" class="cell-input" style="width:160px;" id="rv-wmtarget" value="${m.special.wmTarget}"></div>
    </div>
  `;
  document.getElementById('rv-wmtarget').addEventListener('change', (e) => {
    m.special.wmTarget = money(e.target.value);
    scheduleSave('months', () => APP.months);
    if (APP.meta.activeTab === 'dashboard') renderDashboard();
  });

  if (!canUp) return;

  document.getElementById('jcFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      const result = mergeJobCardArchive(archive, rows, file.name);
      if (result.added === 0 && result.duplicatesSkipped === 0) {
        toast('No rows with a valid Job Card Closed Date were found in this file.', true);
        return;
      }
      scheduleSave('jobCardArchive', () => APP.jobCardArchive);
      renderRevenue(containerId);
      if (APP.meta.activeTab === 'dashboard') renderDashboard();
      const dupMsg = result.duplicatesSkipped > 0 ? ` (${result.duplicatesSkipped} duplicate rows already on file, skipped)` : '';
      toast(`${result.added} new job card(s) added${dupMsg}`);
    } catch (err) {
      console.error(err);
      toast('Could not parse that CSV file', true);
    }
  });

  const clearBtn = document.getElementById('jcClearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (!confirmDestructive('Remove all uploaded revenue data? This affects every month, not just ' + m.label + '.')) return;
    APP.jobCardArchive = { byMonth: {}, fileName: null, uploadedAt: null, totalRowsInFile: 0, _seenRowKeys: {}, history: [] };
    scheduleSave('jobCardArchive', () => APP.jobCardArchive);
    renderRevenue(containerId);
    toast('Revenue data cleared');
  });
}
