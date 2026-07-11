import { money, fmt, escapeHtml, activeEmployees } from '../core/utils.js';
import { ensureMonth, hrFor } from '../core/months.js';
import { dashBack, dashBasis, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';
import { calcEarnedPerformance } from '../core/incentive-engine.js';

// STORE_MANAGER: Achievement = OTC Basic Price revenue only
export function calcPerformance(emp, monthKey) {
  const m = ensureMonth(monthKey);
  const target = money(m.special.wmTarget);  // admin can set override
  const achievement = money(m.otc ? m.otc.total : 0);
  const vehicleCount = m.otc ? m.otc.count : 0;
  const basis = `OTC sales (Basic Price excl. tax) = ${fmt(achievement)} from ${vehicleCount} invoices`;
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource: null, targetWindowLabel: null };
}

// ── Spare Parts (Store Manager) Dashboard ───────────────────
export function renderSparePartsDashboard(panel, mk, m) {
  const storeMgrs = activeEmployees().filter(e => e.category === 'STORE_MANAGER');
  const otc = m.otc || {};
  const rows = storeMgrs.map(e => ({ e, p: calcEarnedPerformance(e, mk), hr: hrFor(mk, e.id) }));

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">🏪 Spare Parts Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat"><div class="label">OTC Revenue (Basic Price)</div><div class="value" style="font-size:15px;">${fmt(otc.total||0)}</div></div>
      <div class="stat"><div class="label">OTC Invoices</div><div class="value">${otc.count||0}</div></div>
      <div class="stat"><div class="label">Avg per Invoice</div><div class="value" style="font-size:15px;">${fmt(otc.count > 0 ? Math.round((otc.total||0)/otc.count) : 0)}</div></div>
    </div>
    <div class="card">
      <div class="card-head"><strong>Store Manager Performance</strong></div>
      <div class="table-scroll"><table>
        <thead><tr><th>Name</th><th>Target</th><th>OTC Achievement</th><th>Achv %</th><th>Leaves</th><th>Late Marks</th><th>Incentive ₹</th></tr></thead>
        <tbody>${rows.map(r => {
          const pct = r.p.target > 0 ? ((r.p.achievement/r.p.target)*100).toFixed(1) : '—';
          const col = parseFloat(pct)>=100?'var(--good)':parseFloat(pct)>=80?'var(--amber)':'var(--bad)';
          return `<tr><td><b>${escapeHtml(r.e.nameHR)}</b></td>
            <td class="num">${fmt(r.p.target)}</td><td class="num">${fmt(r.p.achievement)}</td>
            <td class="num" style="color:${col};font-weight:700;">${pct}%</td>
            <td class="num">${r.hr.actualAbsentee}</td><td class="num">${r.hr.lateMarks}</td>
            <td class="num"><b>${fmt(r.p.earned)}</b></td></tr>`;
        }).join('') || '<tr><td colspan="7"><div class="empty-state">No Store Manager found. Set category = Store Manager in Employees tab.</div></td></tr>'}
        </tbody></table></div></div>
    ${!otc.total ? '<div class="banner" style="margin-top:12px;"><span>⚠</span><div>No OTC data for this month. Upload the Sales Tax CSV via <b>Sales Tax - OTC</b> tab.</div></div>' : ''}
    ${dashBasis('Achievement = OTC Revenue only (Basic Price, Order Type = OTC Sales, Part Category = STD - Standard, excl. tax). Incentive Earned = eligibility/rate% set on the Incentive Rates tab.')}`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

registerRole('STORE_MANAGER', { calcPerformance, renderDashboard: renderSparePartsDashboard });
