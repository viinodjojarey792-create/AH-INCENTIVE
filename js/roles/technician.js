import { fmt, escapeHtml } from '../core/utils.js';
import { activeEmployees } from '../core/utils.js';
import { getJobCardBucket, hasAnyJobCardData, jobCardLookupTech, getTechnicianTarget } from '../core/job-card-data.js';
import { calcEarnedPerformance } from '../core/incentive-engine.js';
import { calcAllFinalRows } from '../core/incentive-engine.js';
import { hrFor } from '../core/months.js';
import { dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';

export function calcPerformance(emp, monthKey) {
  const monthBucket = getJobCardBucket(monthKey);
  const hasData = hasAnyJobCardData();
  const r = jobCardLookupTech(monthKey, emp);
  const t = getTechnicianTarget(monthKey, emp);
  const target = t.value, targetSource = t.source, targetWindowLabel = t.windowLabel;
  const achievement = r.revenue, vehicleCount = r.count;
  const basis = monthBucket ? (r.matched ? 'matched' : 'no match in job card upload') : (hasData ? 'no job cards closed in this month yet' : 'no job card data uploaded');
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource, targetWindowLabel };
}

// ── Technician Dashboard ─────────────────────────────────────
export function renderTechnicianDashboard(panel, mk, m) {
  const techs = activeEmployees().filter(e => e.category === 'TECHNICIAN');
  const bucket = getJobCardBucket(mk);
  const rows = techs.map(e => {
    const p   = calcEarnedPerformance(e, mk);
    const hr  = hrFor(mk, e.id);
    const jc  = jobCardLookupTech(mk, e);
    const allRow = calcAllFinalRows(mk, false).find(r => r.emp.id === e.id);
    return { e, p, hr, jc, allRow };
  }).sort((a, b) => b.p.achievement - a.p.achievement);

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">🔧 Technician Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat"><div class="label">Total Technicians</div><div class="value">${techs.length}</div></div>
      <div class="stat"><div class="label">Total Target</div><div class="value" style="font-size:15px;">${fmt(rows.reduce((s,r)=>s+r.p.target,0))}</div></div>
      <div class="stat"><div class="label">Total Achievement</div><div class="value" style="font-size:15px;">${fmt(rows.reduce((s,r)=>s+r.p.achievement,0))}</div></div>
      <div class="stat"><div class="label">Total Job Cards</div><div class="value">${rows.reduce((s,r)=>s+r.jc.count,0)}</div></div>
      <div class="stat"><div class="label">Total Behavioral ₹</div><div class="value" style="font-size:14px;">${fmt(rows.reduce((s,r)=>s+(r.allRow?r.allRow.behavioral.total:0),0))}</div></div>
      <div class="stat"><div class="label">Total Performance ₹</div><div class="value" style="font-size:14px;">${fmt(rows.reduce((s,r)=>s+(r.p.earned||0),0))}</div></div>
      <div class="stat"><div class="label">Total Incentive ₹</div><div class="value" style="font-size:14px;color:var(--good);">${fmt(rows.reduce((s,r)=>s+(r.allRow?r.allRow.finalAmount:0),0))}</div></div>
    </div>
    ${rows.every(r => !r.p.pct) ? `<div class="banner"><span>⚠</span><div><b>Incentive % not set for any technician in ${escapeHtml(m.label)}.</b> Go to <b>Incentive Rates</b> tab → set the % for each technician → performance incentive will calculate automatically.</div></div>` : ''}
    <div class="card"><div class="table-scroll"><table>
      <thead><tr>
        <th>SR</th><th>NAME</th>
        <th class="num">TARGET</th>
        <th class="num">ACHIEVEMENT</th>
        <th class="num">ACHV %</th>
        <th class="num">JOB CARDS</th>
        <th class="num">LEAVES</th>
        <th class="num">LATE MARKS</th>
        <th style="text-align:center;">TOBACCO</th>
        <th class="num">INCENTIVE %</th>
        <th class="num">BEHAVIORAL ₹</th>
        <th class="num">PERFORMANCE ₹</th>
        <th class="num">TOTAL INCENTIVE ₹</th>
      </tr></thead>
      <tbody>${rows.map((r, i) => {
        const pct = r.p.target > 0 ? ((r.p.achievement / r.p.target) * 100).toFixed(1) : '—';
        const pctColor = parseFloat(pct) >= 100 ? 'var(--good)' : parseFloat(pct) >= 80 ? 'var(--amber)' : 'var(--bad)';
        const beh   = r.allRow ? r.allRow.behavioral.total : 0;
        const perf  = r.p.earned || 0;
        const total = r.allRow ? r.allRow.finalAmount : 0;
        return `<tr>
          <td>${i+1}</td>
          <td><b>${escapeHtml(r.e.nameHR)}</b></td>
          <td class="num">${fmt(r.p.target)}</td>
          <td class="num">${fmt(r.p.achievement)}</td>
          <td class="num" style="color:${pctColor};font-weight:700;">${pct}%</td>
          <td class="num">${r.jc.count}</td>
          <td class="num">${r.hr.actualAbsentee}</td>
          <td class="num">${r.hr.lateMarks}</td>
          <td style="text-align:center;"><span class="pill ${r.hr.tobacco==='YES'?'pill-amber':'pill-neutral'}">${r.hr.tobacco==='YES'?'YES':'NO'}</span></td>
          <td class="num" style="color:${r.p.pct>0?'var(--ink)':'var(--bad)'};">${r.p.pct != null ? r.p.pct+'%' : '—'}</td>
          <td class="num">${fmt(beh)}</td>
          <td class="num" style="color:${perf>0?'var(--good)':'var(--bad)'};">${fmt(perf)}</td>
          <td class="num" style="font-weight:700;color:var(--good);">${fmt(total)}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="13"><div class="empty-state">No technicians found.</div></td></tr>'}
      </tbody>
    </table></div></div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

registerRole('TECHNICIAN', { calcPerformance, renderDashboard: renderTechnicianDashboard });
