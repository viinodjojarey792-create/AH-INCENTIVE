import { APP } from '../core/state.js';
import { money, fmt, escapeHtml, toTitleCase, toast, activeEmployees, parseDateFlexible } from '../core/utils.js';
import { scheduleSave } from '../core/store.js';
import { ensureMonth, hrFor } from '../core/months.js';
import { parseCsvFile } from '../core/import-handlers.js';
import { dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';

export function calcPerformance(emp, monthKey) {
  const m = ensureMonth(monthKey);
  const w = m.special.warranty;
  const target = money(w.fscTarget) + money(w.warrantyTarget);
  const achievement = money(w.fscAchievement) + money(w.warrantyAchievement);
  const basis = 'manual entry (Warranty / Bodyshop / VAS tab)';
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount: null, basis, targetSource: null, targetWindowLabel: null };
}

// Flat-rate incentive: pays w.flatAmount if the month was marked "achieved", else ₹0.
export function calcEarnedPerformance(emp, monthKey, perf) {
  const w = ensureMonth(monthKey).special.warranty;
  const earned = w.achieved ? money(w.flatAmount) : 0;
  return { ...perf, pct: null, earned, isFlat: true };
}

// ── Warranty Dashboard ───────────────────────────────────────
export function renderWarrantyDashboard(panel, mk, m) {
  const wEmps = activeEmployees().filter(e => e.category === 'WARRANTY');
  const rows = wEmps.map(e => ({ e, p: calcPerformance(e, mk), hr: hrFor(mk, e.id) }));

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">🛡 Warranty Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">Warranty Staff</div><div class="stat-value">${wEmps.length}</div></div>
      <div class="stat-card"><div class="stat-label">Total Target</div><div class="stat-value" style="font-size:15px;">${fmt(rows.reduce((s,r)=>s+r.p.target,0))}</div></div>
      <div class="stat-card"><div class="stat-label">Total Achievement</div><div class="stat-value" style="font-size:15px;">${fmt(rows.reduce((s,r)=>s+r.p.achievement,0))}</div></div>
    </div>
    <div class="card"><div class="table-scroll"><table>
      <thead><tr><th>SR</th><th>Name</th><th>Designation</th><th>Target</th><th>Achievement</th><th>Achv %</th><th>Leaves</th><th>Late Marks</th><th>Incentive ₹</th></tr></thead>
      <tbody>${rows.map((r,i)=>{
        const pct = r.p.target>0?((r.p.achievement/r.p.target)*100).toFixed(1):'—';
        const col = parseFloat(pct)>=100?'var(--good)':parseFloat(pct)>=80?'var(--amber)':'var(--bad)';
        return `<tr><td>${i+1}</td><td><b>${escapeHtml(r.e.nameHR)}</b></td>
          <td style="font-size:11px;">${escapeHtml(r.e.designation||'—')}</td>
          <td class="num">${fmt(r.p.target)}</td><td class="num">${fmt(r.p.achievement)}</td>
          <td class="num" style="color:${col};font-weight:700;">${pct}%</td>
          <td class="num">${r.hr.actualAbsentee}</td><td class="num">${r.hr.lateMarks}</td>
          <td class="num"><b>${fmt(r.p.earned)}</b></td></tr>`;
      }).join('') || '<tr><td colspan="9"><div class="empty-state">No warranty staff found. Set category = Warranty in Employees tab.</div></td></tr>'}
      </tbody></table></div></div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

/* =========================================================================
   Warranty Data tab (FSC / Warranty invoice log upload)
   ========================================================================= */
function buildWarrantyDataSummary(rows, monthKey) {
  const [yr, mo] = monthKey.split('-').map(Number);
  let fscAchievement = 0, warrantyAchievement = 0, rowsInMonth = 0;
  let fscBaseline = 0, warrantyBaseline = 0, baselineRows = 0;
  for (const row of rows) {
    const d = parseDateFlexible(row['DATE']);
    if (!d) continue;
    const fsc = money(row['FSC INVOCIE AMT']);
    const wr = money(row['WARRANTY INVOICE AMT']);
    if (d.getFullYear() === yr && (d.getMonth() + 1) === mo) {
      fscAchievement += fsc; warrantyAchievement += wr; rowsInMonth++;
    }
    if (d.getFullYear() === 2025 && d.getMonth() + 1 >= 1 && d.getMonth() + 1 <= 6) {
      fscBaseline += fsc; warrantyBaseline += wr; baselineRows++;
    }
  }
  return {
    fscAchievement, warrantyAchievement, rowsInMonth,
    fscTargetSuggested: baselineRows ? fscBaseline / 6 : null,
    warrantyTargetSuggested: baselineRows ? warrantyBaseline / 6 : null,
    totalRowsInFile: rows.length
  };
}

export function renderWarrantyDataSection(containerId) {
  containerId = containerId || 'tab-warrantydata';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const w = m.special.warranty;
  const wMeta = m.special.warrantyMeta || {};
  const warrantyEmps = activeEmployees(false).filter(e => e.category === 'WARRANTY');
  const panel = document.getElementById(containerId);

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>Warranty Data — ${escapeHtml(m.label)}</strong></div>
      ${warrantyEmps.map(e => `<div class="kbd-note" style="margin-bottom:8px;">${escapeHtml(toTitleCase(e.nameHR))}</div>`).join('') || '<div class="kbd-note" style="margin-bottom:8px;">No employee is currently set to the Warranty category.</div>'}
      <p class="kbd-note" style="margin-top:0; margin-bottom:14px;">Upload the FSC / Warranty invoice log — rows dated in ${escapeHtml(m.label)} are summed into Achievement automatically. Target stays as a fixed figure you set once (or accept the suggested 6-month average if the file includes Jan–Jun 2025 history).</p>
      <label class="upload-zone" for="wdFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">WARRANTY_DATA.csv</div>
      </label>
      <input type="file" id="wdFileInput" accept=".csv" style="display:none;">
      ${wMeta.fileName ? `<div class="footer-note">Last uploaded: ${escapeHtml(wMeta.fileName)} — ${wMeta.rowsInMonth ?? 0} row(s) in ${escapeHtml(m.label)}.</div>` : ''}
      <div class="divider"></div>
      <div class="grid-2">
        <div class="field"><label>FSC Target ₹</label><input type="text" class="cell-input" style="width:140px;" id="sp-fscT" value="${w.fscTarget}"></div>
        <div class="field"><label>FSC Achievement ₹</label><input type="text" class="cell-input" style="width:140px;" id="sp-fscA" value="${w.fscAchievement}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Warranty Target ₹</label><input type="text" class="cell-input" style="width:140px;" id="sp-wrT" value="${w.warrantyTarget}"></div>
        <div class="field"><label>Warranty Achievement ₹</label><input type="text" class="cell-input" style="width:140px;" id="sp-wrA" value="${w.warrantyAchievement}"></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Flat Incentive ₹ (if achieved)</label><input type="text" class="cell-input" style="width:140px;" id="sp-flat" value="${w.flatAmount}"></div>
        <div class="field"><label>Delay Days</label><input type="text" class="cell-input" style="width:140px;" id="sp-delay" value="${w.delayDays}"></div>
      </div>
      <label style="display:flex; align-items:center; gap:8px; font-size:13px; margin-top:4px;">
        <input type="checkbox" id="sp-achieved" ${w.achieved ? 'checked' : ''}> Target achieved this month (pays the flat amount)
      </label>
    </div>
  `;

  const bindNum = (id, setter) => document.getElementById(id).addEventListener('change', (e) => { setter(money(e.target.value)); scheduleSave('months', () => APP.months); if (APP.meta.activeTab === 'dashboard') renderDashboard(); });
  bindNum('sp-fscT', v => w.fscTarget = v);
  bindNum('sp-fscA', v => w.fscAchievement = v);
  bindNum('sp-wrT', v => w.warrantyTarget = v);
  bindNum('sp-wrA', v => w.warrantyAchievement = v);
  bindNum('sp-flat', v => w.flatAmount = v);
  bindNum('sp-delay', v => w.delayDays = v);
  document.getElementById('sp-achieved').addEventListener('change', (e) => {
    w.achieved = e.target.checked;
    scheduleSave('months', () => APP.months);
    if (APP.meta.activeTab === 'dashboard') renderDashboard();
  });

  document.getElementById('wdFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rows = await parseCsvFile(file);
      const summary = buildWarrantyDataSummary(rows, mk);
      w.fscAchievement = summary.fscAchievement;
      w.warrantyAchievement = summary.warrantyAchievement;
      if (!w.fscTarget && summary.fscTargetSuggested) w.fscTarget = Math.round(summary.fscTargetSuggested);
      if (!w.warrantyTarget && summary.warrantyTargetSuggested) w.warrantyTarget = Math.round(summary.warrantyTargetSuggested);
      m.special.warrantyMeta = { fileName: file.name, uploadedAt: new Date().toISOString(), rowsInMonth: summary.rowsInMonth };
      scheduleSave('months', () => APP.months);
      renderWarrantyDataSection(containerId);
      if (APP.meta.activeTab === 'dashboard') renderDashboard();
      if (summary.rowsInMonth === 0) {
        toast(`No warranty rows dated in ${m.label} were found in this file`, true);
      } else {
        toast(`Loaded ${summary.rowsInMonth} warranty row(s) for ${m.label}`);
      }
    } catch (err) {
      console.error(err);
      toast('Could not parse that CSV file', true);
    }
  });
}

registerRole('WARRANTY', { calcPerformance, calcEarnedPerformance, renderDashboard: renderWarrantyDashboard });
