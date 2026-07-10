import { APP } from '../core/state.js';
import { fmt, escapeHtml, norm, toast, activeEmployees, money, parseDateFlexible, toTitleCase } from '../core/utils.js';
import { scheduleSave } from '../core/store.js';
import { ensureMonth, hrFor, amcVasFor } from '../core/months.js';
import { jobCardLookupAdvisor } from '../core/job-card-data.js';
import { parseCsvFile } from '../core/import-handlers.js';
import { dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';
import { canDo, isAdmin } from '../core/auth.js';

export function calcPerformance(emp, monthKey) {
  const r        = jobCardLookupAdvisor(monthKey, emp);
  const s        = APP.settings;
  const vTarget  = s.advisorVehicleTarget  || 500;
  const arTarget = s.advisorAvgRevTarget   || 1300;
  const pvRate   = s.advisorPerVehicleRate || 1;
  const revPct   = s.advisorRevPct         || 1;

  const vehicleCount   = r.count;
  const achievement    = r.revenue;
  // Show target as vehicle target × avg rev target (₹ equivalent of full target)
  const target         = vTarget * arTarget;
  const targetSource   = 'auto';

  const avgRevPerVehicle = vehicleCount > 0 ? achievement / vehicleCount : 0;
  const hitVehicles      = vehicleCount >= vTarget;
  const hitAvgRev        = avgRevPerVehicle >= arTarget;
  const targetMet        = hitVehicles && hitAvgRev;

  // Incentive: ₹pvRate/vehicle + revPct% of revenue — only if BOTH targets met
  const rawEarned = targetMet ? (vehicleCount * pvRate) + (achievement * revPct / 100) : 0;

  const basis = `Vehicles: ${vehicleCount}/${vTarget} ${hitVehicles?'✓':'✗'} | `
        + `Avg Rev/Vehicle: ${fmt(Math.round(avgRevPerVehicle))}/${fmt(arTarget)} ${hitAvgRev?'✓':'✗'} | `
        + (targetMet
            ? `Both targets met → ₹${pvRate}/vehicle + ${revPct}% revenue`
            : `Target not met — ₹0 earned`);

  // NOTE: this `earned` value is NOT what actually gets paid — calcEarnedPerformance's
  // generic fallback (no bespoke calcEarnedPerformance is registered for ADVISOR)
  // recomputes earned from the standard eligibility/rate formula and overrides this
  // one. This mirrors an original-app quirk (the dual-target check here only feeds
  // the dashboard's "basis"/advisorDetails display) — preserved intentionally, not a bug.
  return {
    target, achievement, vehicleCount, targetSource, targetWindowLabel: null,
    earned: Math.round(rawEarned),
    achvPct: target > 0 ? Math.round((achievement / target) * 100 * 10) / 10 : 0,
    basis,
    advisorDetails: { vTarget, arTarget, pvRate, revPct, vehicleCount, avgRevPerVehicle, hitVehicles, hitAvgRev, targetMet, rawEarned }
  };
}

export function renderAdvisorDashboard(panel, mk, m) {
  const advisors = activeEmployees().filter(e => e.category === 'ADVISOR');
  const s = APP.settings;
  const vTarget  = s.advisorVehicleTarget  || 500;
  const arTarget = s.advisorAvgRevTarget   || 1300;
  const pvRate   = s.advisorPerVehicleRate || 1;
  const revPct   = s.advisorRevPct         || 1;

  const rows = advisors.map(e => {
    const p  = calcPerformance(e, mk);
    const hr = hrFor(mk, e.id);
    const jc = jobCardLookupAdvisor(mk, e);
    const avgRev = jc.count > 0 ? jc.revenue / jc.count : 0;
    const hitV  = jc.count   >= vTarget;
    const hitA  = avgRev     >= arTarget;
    const earned = (hitV && hitA) ? (jc.count * pvRate) + (jc.revenue * revPct / 100) : 0;
    return { e, p, hr, jc, avgRev, hitV, hitA, earned };
  }).sort((a, b) => b.jc.count - a.jc.count);

  const tick  = s => s ? '✅' : '❌';
  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:4px;">🎯 Advisor Dashboard — ${escapeHtml(m.label)}</div>
    <div class="kbd-note" style="margin-bottom:14px;">Target: <b>${vTarget} vehicles</b> + avg <b>${fmt(arTarget)}/vehicle</b> → earns ₹${pvRate}/vehicle + ${revPct}% revenue</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat"><div class="label">Advisors</div><div class="value">${advisors.length}</div></div>
      <div class="stat"><div class="label">Both Targets Met</div><div class="value" style="color:var(--good);">${rows.filter(r=>r.hitV&&r.hitA).length} / ${advisors.length}</div></div>
      <div class="stat"><div class="label">Total Vehicles</div><div class="value">${rows.reduce((s,r)=>s+r.jc.count,0)}</div></div>
      <div class="stat"><div class="label">Total Revenue</div><div class="value" style="font-size:14px;">${fmt(rows.reduce((s,r)=>s+r.jc.revenue,0))}</div></div>
      <div class="stat"><div class="label">Total Incentive</div><div class="value" style="font-size:14px;">${fmt(rows.reduce((s,r)=>s+r.earned,0))}</div></div>
    </div>
    <div class="card"><div class="table-scroll"><table>
      <thead><tr>
        <th>SR</th><th>Name</th>
        <th class="num">Vehicles<br><span class="kbd-note">Target: ${vTarget}</span></th>
        <th class="num">Avg Rev/Vehicle<br><span class="kbd-note">Target: ${fmt(arTarget)}</span></th>
        <th class="num">Total Revenue</th>
        <th style="text-align:center;">Vehicles ✓</th>
        <th style="text-align:center;">Avg Rev ✓</th>
        <th class="num">₹/Vehicle<br><span class="kbd-note">₹${pvRate}</span></th>
        <th class="num">Rev %<br><span class="kbd-note">${revPct}%</span></th>
        <th class="num">Total Incentive</th>
        <th class="num">Leaves</th>
        <th class="num">Late</th>
      </tr></thead>
      <tbody>${rows.map((r,i)=>{
        const vCol  = r.hitV ? 'var(--good)' : 'var(--bad)';
        const aCol  = r.hitA ? 'var(--good)' : 'var(--bad)';
        const vEarn = r.hitV && r.hitA ? r.jc.count * pvRate : 0;
        const rEarn = r.hitV && r.hitA ? r.jc.revenue * revPct / 100 : 0;
        return `<tr style="${(!r.hitV||!r.hitA)?'opacity:0.7;':''}">
          <td>${i+1}</td>
          <td><b>${escapeHtml(r.e.nameHR)}</b></td>
          <td class="num" style="color:${vCol};font-weight:700;">${r.jc.count}</td>
          <td class="num" style="color:${aCol};font-weight:700;">${fmt(Math.round(r.avgRev))}</td>
          <td class="num">${fmt(r.jc.revenue)}</td>
          <td style="text-align:center;font-size:16px;">${tick(r.hitV)}</td>
          <td style="text-align:center;font-size:16px;">${tick(r.hitA)}</td>
          <td class="num">${r.hitV&&r.hitA ? '₹'+fmt(vEarn) : '—'}</td>
          <td class="num">${r.hitV&&r.hitA ? '₹'+fmt(Math.round(rEarn)) : '—'}</td>
          <td class="num" style="font-weight:700;color:${r.earned>0?'var(--good)':'var(--bad)'};">${fmt(Math.round(r.earned))}</td>
          <td class="num">${r.hr.actualAbsentee}</td>
          <td class="num">${r.hr.lateMarks}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="12"><div class="empty-state">No advisors found.</div></td></tr>'}
      </tbody></table></div></div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

/* =========================================================================
   Vehicle-In Data tab — per-advisor service type counts (feeds amcVas)
   ========================================================================= */
function normalizeServiceType(raw) {
  const s = (raw || '').trim().toUpperCase();
  if (s.startsWith('PAID')) return 'paidService';
  if (s.startsWith('MINOR')) return 'minorRepair';
  if (s.startsWith('GENERAL')) return 'generalRepair';
  if (s === 'FREE1' || s === 'FREE 1') return 'free1';
  if (s === 'FREE2' || s === 'FREE 2') return 'free2';
  if (s === 'FREE3' || s === 'FREE 3') return 'free3';
  return null; // ACCIDENT / BODYSHOP DEP / etc. are not part of this bucket
}
function buildVehicleInSummary(rows, monthKey, fileName) {
  const [yr, mo] = monthKey.split('-').map(Number);
  const byAdvisor = {};
  let rowsInMonth = 0;
  for (const row of rows) {
    const d = parseDateFlexible(row['Timestamp']);
    if (!d || d.getFullYear() !== yr || (d.getMonth() + 1) !== mo) continue;
    const advName = norm(row['ADVISOR NAME']);
    if (!advName) continue;
    rowsInMonth++;
    if (!byAdvisor[advName]) byAdvisor[advName] = { paidService: 0, minorRepair: 0, generalRepair: 0, free1: 0, free2: 0, free3: 0, totalVehicles: 0 };
    const bucket = normalizeServiceType(row['SERVICE TYPE']);
    if (bucket) byAdvisor[advName][bucket]++;
    byAdvisor[advName].totalVehicles++;
  }
  return { byAdvisor, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length, rowsInMonth };
}
function findUnmatchedAdvisorNames(byAdvisor) {
  const aliasSet = new Set();
  for (const e of APP.employees) { if (e.category === 'ADVISOR') (e.hiriseAliases || []).forEach(a => aliasSet.add(norm(a))); }
  const unmatched = [];
  for (const key of Object.keys(byAdvisor)) {
    if (!aliasSet.has(key)) unmatched.push({ name: key, totalVehicles: byAdvisor[key].totalVehicles });
  }
  unmatched.sort((a, b) => b.totalVehicles - a.totalVehicles);
  return unmatched;
}
function applyVehicleInToEmployees(monthKey, byAdvisor) {
  const byKey = {};
  for (const e of APP.employees) { if (e.category === 'ADVISOR') (e.hiriseAliases || []).forEach(a => { if (a) byKey[norm(a)] = e.id; }); }
  for (const key of Object.keys(byAdvisor)) {
    const empId = byKey[key];
    if (!empId) continue;
    const slot = amcVasFor(monthKey, empId);
    const src = byAdvisor[key];
    slot.paidService = src.paidService; slot.minorRepair = src.minorRepair; slot.generalRepair = src.generalRepair;
    slot.free1 = src.free1; slot.free2 = src.free2; slot.free3 = src.free3; slot.totalVehicles = src.totalVehicles;
  }
}

const MANUAL_VAS_FIELDS = [
  { key: 'nitrogen', label: 'Nitrogen' }, { key: 'batteryCharging', label: 'Battery Charging' },
  { key: 'mufflerCoating', label: 'Muffler Coating' }, { key: 'coating', label: 'Coating' },
  { key: 'chainLube', label: 'Chain Lube' }, { key: 'amc', label: 'AMC' }
];
const AUTO_VEHICLE_FIELDS = [
  { key: 'paidService', label: 'Paid' }, { key: 'minorRepair', label: 'Minor Repair' },
  { key: 'generalRepair', label: 'General Repair' }, { key: 'free1', label: 'Free 1' },
  { key: 'free2', label: 'Free 2' }, { key: 'free3', label: 'Free 3' }, { key: 'totalVehicles', label: 'Total Vehicles' }
];

export function renderVehicleInSection(containerId) {
  containerId = containerId || 'tab-hrsheet';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const meta = m.special.vehicleInMeta || {};
  const advisors = activeEmployees(false).filter(e => e.category === 'ADVISOR').sort((a, b) => a.srNo - b.srNo);
  const panel = document.getElementById(containerId);
  const canUp = canDo('upload_data') || isAdmin();

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>Vehicle-In Data — ${escapeHtml(m.label)}</strong></div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Upload the Vehicle-In log — Paid / Minor Repair / General Repair / Free1-3 counts and total vehicles per advisor are computed automatically from rows dated in ${escapeHtml(m.label)}. Nitrogen, Battery Charging, Muffler Coating, Coating, Chain Lube and AMC have no source in this file, so they stay editable by hand.</p>
      ${canUp ? `
      <label class="upload-zone" for="viFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">VEHICLE-IN-DATA.csv</div>
      </label>
      <input type="file" id="viFileInput" accept=".csv" style="display:none;">
      ` : `<div class="banner"><span>🔒</span><div>You don't have permission to upload data here. Contact an admin if you need this changed.</div></div>`}
      ${meta.fileName ? `<div class="footer-note">Last uploaded: ${escapeHtml(meta.fileName)} — ${meta.rowsInMonth ?? 0} row(s) in ${escapeHtml(m.label)}.</div>` : ''}
      <div id="viUnmatchedWrap"></div>
      <div class="divider"></div>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Sr</th><th>Advisor</th>
            ${AUTO_VEHICLE_FIELDS.map(f => `<th class="num">${f.label} <span class="kbd-note">(auto)</span></th>`).join('')}
            ${MANUAL_VAS_FIELDS.map(f => `<th class="num">${f.label}</th>`).join('')}
          </tr></thead>
          <tbody id="viBody"></tbody>
        </table>
      </div>
    </div>
  `;
  paintVehicleInRows(advisors);

  document.getElementById('viFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      const summary = buildVehicleInSummary(rows, mk, file.name);
      const unmatched = findUnmatchedAdvisorNames(summary.byAdvisor);
      applyVehicleInToEmployees(mk, summary.byAdvisor);
      m.special.vehicleInMeta = { fileName: summary.fileName, uploadedAt: summary.uploadedAt, rowsInMonth: summary.rowsInMonth, unmatched: unmatched.map(u => u.name) };
      scheduleSave('months', () => APP.months);
      renderVehicleInSection(containerId);
      toast(`Loaded ${summary.rowsInMonth} vehicle-in row(s) for ${m.label}`);
      if (unmatched.length) {
        document.getElementById('viUnmatchedWrap').innerHTML = `
          <div class="banner"><span>⚠</span><div><b>${unmatched.length} advisor name(s) didn't match any employee</b> — add them as aliases on the Employees tab.
          <div style="margin-top:8px;">${unmatched.map(u => `<div class="match-row"><span class="name">${escapeHtml(u.name)}</span><span class="kbd-note">${u.totalVehicles} vehicle(s)</span></div>`).join('')}</div></div></div>`;
      }
    } catch (err) {
      console.error(err);
      toast('Could not parse that CSV file', true);
    }
  });
}
function paintVehicleInRows(advisors) {
  const mk = APP.meta.currentMonth;
  document.getElementById('viBody').innerHTML = advisors.map(e => {
    const slot = amcVasFor(mk, e.id);
    return `<tr>
      <td>${e.srNo}</td><td><b>${escapeHtml(toTitleCase(e.nameHR))}</b></td>
      ${AUTO_VEHICLE_FIELDS.map(f => `<td class="num">${slot[f.key] || 0}</td>`).join('')}
      ${MANUAL_VAS_FIELDS.map(f => `<td class="num"><input type="text" class="cell-input" data-vas="${e.id}" data-k="${f.key}" value="${slot[f.key] || 0}"></td>`).join('')}
    </tr>`;
  }).join('') || `<tr><td colspan="14"><div class="empty-state">No active Advisor-category employees yet.</div></td></tr>`;

  document.querySelectorAll('[data-vas]').forEach(inp => inp.addEventListener('change', (e) => {
    const slot = amcVasFor(mk, e.target.dataset.vas);
    slot[e.target.dataset.k] = money(e.target.value);
    scheduleSave('months', () => APP.months);
  }));
}

registerRole('ADVISOR', { calcPerformance, renderDashboard: renderAdvisorDashboard });
