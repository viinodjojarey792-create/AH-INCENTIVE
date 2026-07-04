import { APP } from '../core/state.js';
import { escapeHtml, activeEmployees } from '../core/utils.js';
import { hrFor } from '../core/months.js';
import { dashBack, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';

// HR has no calcPerformance branch in the original app — behavioral-incentive
// only, so nothing is registered with the role-registry here.

// ── HR & Attendance Dashboard ────────────────────────────────
export function renderHRDashboard(panel, mk, m) {
  const emps = activeEmployees(false);
  const hrData = emps.map(e => ({ e, hr: hrFor(mk, e.id) }));
  const tobaccoYes = hrData.filter(r => r.hr.tobacco === 'YES').length;
  const totalLeaves = hrData.reduce((s,r) => s + (r.hr.actualAbsentee||0), 0);
  const totalLate   = hrData.reduce((s,r) => s + (r.hr.lateMarks||0), 0);
  const resigned    = APP.employees.filter(e => e.status === 'INACTIVE').length;

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">📋 HR & Attendance Dashboard — ${escapeHtml(m.label)}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat-card"><div class="stat-label">Active Employees</div><div class="stat-value">${emps.length}</div></div>
      <div class="stat-card"><div class="stat-label">Resigned</div><div class="stat-value" style="color:var(--bad);">${resigned}</div></div>
      <div class="stat-card"><div class="stat-label">Total Leaves</div><div class="stat-value">${totalLeaves}</div></div>
      <div class="stat-card"><div class="stat-label">Total Late Marks</div><div class="stat-value" style="color:var(--amber);">${totalLate}</div></div>
      <div class="stat-card"><div class="stat-label">Tobacco Consumers</div><div class="stat-value" style="color:var(--bad);">${tobaccoYes}</div></div>
    </div>
    <div class="card"><div class="table-scroll"><table>
      <thead><tr>
        <th>SR</th><th>Name</th><th>Designation</th><th>Department</th>
        <th class="num">Leaves Taken</th><th class="num">Approved Leaves</th>
        <th class="num">Late Marks</th><th>Tobacco</th><th>Status</th>
      </tr></thead>
      <tbody>${hrData.sort((a,b)=>(b.hr.actualAbsentee||0)-(a.hr.actualAbsentee||0)).map((r,i)=>`<tr>
        <td>${i+1}</td><td><b>${escapeHtml(r.e.nameHR)}</b></td>
        <td style="font-size:11px;">${escapeHtml(r.e.designation||'—')}</td>
        <td style="font-size:11px;">${escapeHtml(r.e.department||'—')}</td>
        <td class="num" style="color:${r.hr.actualAbsentee>4?'var(--bad)':r.hr.actualAbsentee>2?'var(--amber)':'inherit'};">${r.hr.actualAbsentee}</td>
        <td class="num">${r.hr.approvedLeaves}</td>
        <td class="num" style="color:${r.hr.lateMarks>0?'var(--amber)':'inherit'};">${r.hr.lateMarks}</td>
        <td style="text-align:center;"><span class="pill ${r.hr.tobacco==='YES'?'pill-amber':'pill-neutral'}">${r.hr.tobacco==='YES'?'YES':'NO'}</span></td>
        <td><span class="pill ${r.e.status==='INACTIVE'?'':'pill-teal'}" style="${r.e.status==='INACTIVE'?'background:#fee2e2;color:#991b1b;':''}">${r.e.status==='INACTIVE'?'RESIGNED':'ACTIVE'}</span></td>
      </tr>`).join('')}
      </tbody></table></div></div>`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
}
