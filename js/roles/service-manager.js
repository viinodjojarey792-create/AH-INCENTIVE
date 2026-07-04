import { APP } from '../core/state.js';
import { money, fmt, escapeHtml, toTitleCase, activeEmployees } from '../core/utils.js';
import { getJobCardBucket } from '../core/job-card-data.js';
import { ensureMonth } from '../core/months.js';
import { calcAllFinalRows, calcPerformance as calcPerformanceAny } from '../core/incentive-engine.js';
import { dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';

export function calcPerformance(emp, monthKey) {
  const m = ensureMonth(monthKey);
  let target, targetSource;
  if (m.targetOverrides[emp.id] != null) { target = money(m.targetOverrides[emp.id]); targetSource = 'override'; }
  else if (emp.target && emp.target > 0) { target = money(emp.target); targetSource = 'manual'; }
  else { target = money(m.special.wmTarget); targetSource = 'manual'; }
  const monthBucket = getJobCardBucket(monthKey);
  const jcRevenue = monthBucket ? monthBucket.workshop.total : 0;
  const otcRevenue = money(m.otc ? m.otc.total : 0);
  const achievement = jcRevenue + otcRevenue;
  const vehicleCount = monthBucket ? monthBucket.workshop.count : 0;
  const basis = `Job Card ${fmt(jcRevenue)} + OTC ${fmt(otcRevenue)} = ${fmt(achievement)}`;
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource, targetWindowLabel: null };
}

// ── Service Manager Dashboard (incl. Workshop KPIs) ─────────
export function renderServiceManagerDashboard(panel, mk, m) {
  const svMgrs = activeEmployees().filter(e => e.category === 'SERVICE_MANAGER' || e.category === 'WM');
  const bucket = getJobCardBucket(mk);
  const otc = m.otc || {};
  const allRows = calcAllFinalRows(mk, false);
  const techCount = activeEmployees().filter(e=>e.category==='TECHNICIAN').length;
  const advCount  = activeEmployees().filter(e=>e.category==='ADVISOR').length;
  const supvCount = activeEmployees().filter(e=>e.category==='SUPERVISOR').length;
  const jcTotal = bucket ? bucket.workshop.total : 0;
  const grandTotal = jcTotal + (otc.total||0);
  const svMgrTarget = svMgrs.length > 0 ? calcPerformanceAny(svMgrs[0], mk).target : 0;
  const svMgrTargetNote = svMgrs.length > 0 ? svMgrs[0].targetNote : '';

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">⭐ Service Manager Dashboard — ${escapeHtml(m.label)}</div>
    <!-- Workshop KPIs -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head"><strong>Workshop KPIs</strong></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
        <div class="stat-card"><div class="stat-label"${svMgrTargetNote?` title="${escapeHtml(svMgrTargetNote)}" style="cursor:help;border-bottom:1px dotted var(--ink-soft);"`:''}>Target</div><div class="stat-value" style="font-size:15px;">${fmt(svMgrTarget)}</div></div>
        <div class="stat-card"><div class="stat-label">Job Card Revenue</div><div class="stat-value" style="font-size:15px;">${fmt(jcTotal)}</div></div>
        <div class="stat-card"><div class="stat-label">OTC Revenue</div><div class="stat-value" style="font-size:15px;">${fmt(otc.total||0)}</div></div>
        <div class="stat-card"><div class="stat-label" title="LOP achievement without GST" style="cursor:help;border-bottom:1px dotted var(--ink-soft);">Total Revenue</div><div class="stat-value" style="font-size:15px;color:var(--good);">${fmt(grandTotal)}</div></div>
        <div class="stat-card"><div class="stat-label">Achv %</div><div class="stat-value" style="font-size:15px;color:${svMgrTarget>0?(grandTotal/svMgrTarget*100>=100?'var(--good)':grandTotal/svMgrTarget*100>=80?'var(--amber)':'var(--bad)'):'var(--ink)'};">${svMgrTarget>0?((grandTotal/svMgrTarget)*100).toFixed(1)+'%':'—'}</div></div>
        <div class="stat-card"><div class="stat-label">Job Cards Closed</div><div class="stat-value">${bucket ? bucket.workshop.count : 0}</div></div>
        <div class="stat-card"><div class="stat-label">OTC Invoices</div><div class="stat-value">${otc.count||0}</div></div>
        <div class="stat-card"><div class="stat-label">Total Payout</div><div class="stat-value" style="font-size:14px;">${fmt(allRows.reduce((s,r)=>s+r.finalAmount,0))}</div></div>
      </div>
    </div>
    <!-- Team Headcount -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:16px;">
      <div class="stat-card"><div class="stat-label">Technicians</div><div class="stat-value">${techCount}</div></div>
      <div class="stat-card"><div class="stat-label">Advisors</div><div class="stat-value">${advCount}</div></div>
      <div class="stat-card"><div class="stat-label">Supervisors</div><div class="stat-value">${supvCount}</div></div>
    </div>
    <!-- Service Manager own row -->
    <div class="card">
      <div class="card-head"><strong>Service Manager Performance</strong></div>
      <div class="table-scroll"><table>
        <thead><tr><th>Name</th><th title="Floor LOP + Bodyshop LOP + Spare Counter (OTC) + Standard Part Sales + Counter Lube Sale" style="cursor:help;border-bottom:1px dotted var(--ink-soft);">Target</th><th>JC Revenue</th><th>OTC Revenue</th><th title="LOP achievement without GST" style="cursor:help;border-bottom:1px dotted var(--ink-soft);">Total Achievement</th><th>Achv %</th><th>Incentive ₹</th></tr></thead>
        <tbody>${svMgrs.map(e => {
          const p = calcPerformanceAny(e, mk);
          const pct = p.target > 0 ? ((p.achievement/p.target)*100).toFixed(1) : '—';
          const col = parseFloat(pct)>=100?'var(--good)':parseFloat(pct)>=80?'var(--amber)':'var(--bad)';
          return `<tr><td style="text-align:center;"><b>${escapeHtml(toTitleCase(e.nameHR))}</b></td>
            <td class="num" style="text-align:center;">${fmt(p.target)}</td>
            <td class="num" style="text-align:center;">${fmt(jcTotal)}</td>
            <td class="num" style="text-align:center;">${fmt(otc.total||0)}</td>
            <td class="num" style="text-align:center;"><b>${fmt(p.achievement)}</b></td>
            <td class="num" style="text-align:center;color:${col};font-weight:700;">${pct}%</td>
            <td class="num" style="text-align:center;"><b>${fmt(p.earned)}</b></td></tr>`;
        }).join('') || '<tr><td colspan="7"><div class="empty-state">No Service Manager found. Set category = Service Manager in Employees tab.</div></td></tr>'}
        </tbody></table></div></div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

registerRole('SERVICE_MANAGER', { calcPerformance, renderDashboard: renderServiceManagerDashboard });
