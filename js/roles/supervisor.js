import { APP } from '../core/state.js';
import { fmt, escapeHtml, activeEmployees } from '../core/utils.js';
import { jobCardLookupTech, getTechnicianTarget } from '../core/job-card-data.js';
import { dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';
// Technician sub-rows below need the category-dispatching calcPerformance
// (this module's own calcPerformance only implements the SUPERVISOR branch).
import { calcPerformance as calcPerformanceAny } from '../core/incentive-engine.js';

export function calcPerformance(emp, monthKey) {
  let target = 0, achievement = 0;
  const team = APP.employees.filter(e => e.category === 'TECHNICIAN' && e.supervisorId === emp.id);
  for (const t of team) {
    const r = jobCardLookupTech(monthKey, t);
    target += getTechnicianTarget(monthKey, t).value; achievement += r.revenue;
  }
  const vehicleCount = team.length;
  const basis = team.length ? team.length + ' technician(s) assigned' : 'no technicians assigned to this supervisor yet';
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource: null, targetWindowLabel: null };
}

// ── Floor Supervisor Dashboard ───────────────────────────────
export function renderSupervisorDashboard(panel, mk, m) {
  const supervisors = activeEmployees().filter(e => e.category === 'SUPERVISOR');
  const rows = supervisors.map(s => {
    const p = calcPerformance(s, mk);
    const team = activeEmployees().filter(e => e.category === 'TECHNICIAN' && e.supervisorId === s.id);
    const teamAch = team.reduce((sum, t) => sum + jobCardLookupTech(mk, t).revenue, 0);
    return { s, p, team, teamAch };
  });

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">👥 Floor Supervisor Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat"><div class="label">Supervisors</div><div class="value">${supervisors.length}</div></div>
      <div class="stat"><div class="label">Total Team Target</div><div class="value" style="font-size:15px;">${fmt(rows.reduce((s,r)=>s+r.p.target,0))}</div></div>
      <div class="stat"><div class="label">Total Team Achievement</div><div class="value" style="font-size:15px;">${fmt(rows.reduce((s,r)=>s+r.teamAch,0))}</div></div>
    </div>
    ${rows.map(r => {
      const pct = r.p.target > 0 ? ((r.p.achievement/r.p.target)*100).toFixed(1) : '—';
      const col = parseFloat(pct)>=100?'var(--good)':parseFloat(pct)>=80?'var(--amber)':'var(--bad)';
      return `<div class="card" style="margin-bottom:12px;">
        <div class="card-head">
          <strong>${escapeHtml(r.s.nameHR)}</strong>
          <span style="color:${col};font-weight:700;">${pct}% of target</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px;">
          <div class="stat"><div class="label">Target</div><div class="value" style="font-size:14px;">${fmt(r.p.target)}</div></div>
          <div class="stat"><div class="label">Achievement</div><div class="value" style="font-size:14px;">${fmt(r.p.achievement)}</div></div>
          <div class="stat"><div class="label">Team Size</div><div class="value">${r.team.length}</div></div>
          <div class="stat"><div class="label">Incentive Earned</div><div class="value" style="font-size:14px;">${fmt(r.p.earned)}</div></div>
        </div>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <thead><tr style="background:#f5f0e8;">
            <th style="padding:4px 8px;text-align:left;">Technician</th>
            <th style="padding:4px 8px;text-align:right;">Target</th>
            <th style="padding:4px 8px;text-align:right;">Achievement</th>
            <th style="padding:4px 8px;text-align:right;">Achv %</th>
          </tr></thead>
          <tbody>${r.team.map(t => {
            const tp = calcPerformanceAny(t, mk);
            const tpct = tp.target > 0 ? ((tp.achievement/tp.target)*100).toFixed(1) : '—';
            return `<tr style="border-bottom:1px solid var(--line);">
              <td style="padding:4px 8px;">${escapeHtml(t.nameHR)}</td>
              <td style="padding:4px 8px;text-align:right;">${fmt(tp.target)}</td>
              <td style="padding:4px 8px;text-align:right;">${fmt(tp.achievement)}</td>
              <td style="padding:4px 8px;text-align:right;color:${parseFloat(tpct)>=100?'var(--good)':parseFloat(tpct)>=80?'var(--amber)':'var(--bad)'};">${tpct}%</td>
            </tr>`;
          }).join('') || '<tr><td colspan="4" style="padding:8px;color:var(--ink-soft);">No technicians assigned</td></tr>'}</tbody>
        </table>
      </div>`;
    }).join('') || '<div class="banner"><span>⚠</span><div>No supervisors found. Assign Supervisor category in Employees tab.</div></div>'}`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}

registerRole('SUPERVISOR', { calcPerformance, renderDashboard: renderSupervisorDashboard });
