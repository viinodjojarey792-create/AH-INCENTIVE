import { APP } from '../core/state.js';
import { money, fmt, escapeHtml, toTitleCase, activeEmployees } from '../core/utils.js';
import { scheduleSave } from '../core/store.js';
import { ensureMonth, hrFor } from '../core/months.js';
import { jobCardLookupTech } from '../core/job-card-data.js';
import { isAdmin, canDo } from '../core/auth.js';
import { dashBack, dashBasis, setActiveDashboard, renderDashboard } from '../core/ui-shell.js';
import { registerRole } from '../core/role-registry.js';

export function calcPerformance(emp, monthKey) {
  const m = ensureMonth(monthKey);
  const bsData = m.special.bodyshop;
  if (!bsData.perEmpRevenue) bsData.perEmpRevenue = {};
  if (!bsData.perEmpTarget)  bsData.perEmpTarget  = {};
  const isExec = (emp.designation||'').toLowerCase().includes('executive') || (emp.designation||'').toLowerCase().includes('exec');
  const defaultTarget = isExec ? 400000 : 100000;
  const target = bsData.perEmpTarget[emp.id] != null ? money(bsData.perEmpTarget[emp.id]) : defaultTarget;
  const jcResult = jobCardLookupTech(monthKey, emp);
  let achievement, vehicleCount;
  if (isExec) {
    const bsEmps = APP.employees.filter(e => e.category === 'BODYSHOP' && e.status === 'ACTIVE');
    let bsTotal = 0, bsCount = 0;
    for (const bsE of bsEmps) {
      const r = jobCardLookupTech(monthKey, bsE);
      bsTotal += r.revenue; bsCount += r.count;
    }
    achievement = bsTotal || money(bsData.revenue);
    vehicleCount = bsCount || (bsData.vehicleCount || 0);
  } else {
    achievement = jcResult.revenue || (bsData.perEmpRevenue[emp.id] != null ? money(bsData.perEmpRevenue[emp.id]) : 0);
    vehicleCount = jcResult.count;
  }
  const basis = isExec ? 'Combined bodyshop job card revenue' : 'Individual job card revenue';
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource: null, targetWindowLabel: null };
}

// Tiered flat-rate incentive (not eligibility/rate% based).
export function calcEarnedPerformance(emp, monthKey, perf) {
  // Painter (noIncentive) gets ₹0
  if (emp.noIncentive) return { ...perf, pct: null, earned: 0, isFlat: true, incentiveNote: 'No incentive (Painter role)', bsIsExec: false, bsVehicles: perf.vehicleCount||0, bsAvgRev: 0, bsRevLacs: '0.00' };
  const bsData = ensureMonth(monthKey).special.bodyshop;
  const isExec = (emp.designation||'').toLowerCase().includes('executive') || (emp.designation||'').toLowerCase().includes('exec');
  const rev = perf.achievement;
  const lacs = rev / 100000;
  let earned = 0, incentiveNote = '';

  if (isExec) {
    // Exec: <3L → ₹0; ₹3L–₹4L → flat ₹1,500 each; >₹4L → ₹600 × total lacs each
    if (rev >= 300000 && rev <= 400000) {
      earned = 1500;
      incentiveNote = 'Flat ₹1,500 (revenue ₹3,00,000–₹4,00,000)';
    } else if (rev > 400000) {
      earned = Math.round(600 * lacs);
      incentiveNote = '₹600 × ' + lacs.toFixed(2) + ' lacs = ₹' + earned;
    } else {
      earned = 0;
      incentiveNote = 'Below ₹3,00,000 threshold — ₹0';
    }
  } else {
    // Technician: <1L → ₹0; ≥1L → ₹500 × individual lacs
    if (rev >= 100000) {
      earned = Math.round(500 * lacs);
      incentiveNote = '₹500 × ' + lacs.toFixed(2) + ' lacs = ₹' + earned;
    } else {
      incentiveNote = 'Below ₹1,00,000 threshold — ₹0';
    }
  }

  // Per-vehicle stats
  const vehicles = perf.vehicleCount || 0;
  const avgRevPerVehicle = vehicles > 0 ? Math.round(rev / vehicles) : 0;

  return { ...perf, pct: null, earned, isFlat: true, incentiveNote,
    bsIsExec: isExec, bsRevLacs: lacs.toFixed(2), bsVehicles: vehicles, bsAvgRev: avgRevPerVehicle };
}

// ── Bodyshop Dashboard ───────────────────────────────────────
export function renderBodyshopDashboard(panel, mk, m) {
  const bsEmps = activeEmployees().filter(e => e.category === 'BODYSHOP' || (e.department||'').toUpperCase().includes('BODYSHOP'));
  const rows = bsEmps.map(e => {
    const p = calcPerformance(e, mk);
    const ep = calcEarnedPerformance(e, mk, p);
    return { e, p, ep, hr: hrFor(mk, e.id) };
  });
  const b = m.special.bodyshop;
  const canEditTarget = isAdmin() || APP.currentUser?.role === 'OWNER' || canDo('edit_targets');

  // Exec rows (combined dept revenue) and tech rows (individual)
  const execRows = rows.filter(r => (r.e.designation||'').toLowerCase().includes('executive') || (r.e.designation||'').toLowerCase().includes('exec'));
  const techRows = rows.filter(r => !((r.e.designation||'').toLowerCase().includes('executive') || (r.e.designation||'').toLowerCase().includes('exec')));
  const deptRevenue = execRows.length > 0 ? execRows[0].p.achievement : 0;
  const deptVehicles = execRows.length > 0 ? (execRows[0].ep.bsVehicles || 0) : 0;
  const deptAvgRev = deptVehicles > 0 ? Math.round(deptRevenue / deptVehicles) : 0;

  const targetInputs = rows.map(r => {
    if (!canEditTarget) return '';
    if (r.e.noIncentive) return ''; // Painter — no target, no incentive
    const isExec = (r.e.designation||'').toLowerCase().includes('executive') || (r.e.designation||'').toLowerCase().includes('exec');
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
      '<span style="min-width:220px;font-size:13px;">' + escapeHtml(toTitleCase(r.e.nameHR)) +
      ' <span class="kbd-note">(' + (isExec?'Executive — combined dept':'Technician — individual') + ')</span></span>' +
      '<input type="number" class="cell-input bs-tgt-inp" data-empid="' + r.e.id + '" value="' + r.p.target + '" style="width:120px;">' +
      '</div>';
  }).join('');

  panel.innerHTML = dashBack() + `
    <div style="font-size:18px;font-weight:700;margin-bottom:16px;">🚗 Bodyshop Dashboard — ${escapeHtml(m.label)}</div>

    <!-- Dept Summary Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
      <div class="stat"><div class="label">Bodyshop Staff</div><div class="value">${bsEmps.length}</div></div>
      <div class="stat"><div class="label" title="LOP achievement without GST" style="cursor:help;border-bottom:1px dotted var(--ink-soft);">Dept Revenue</div><div class="value" style="font-size:15px;">${fmt(deptRevenue)}</div></div>
      <div class="stat"><div class="label">Vehicles Done</div><div class="value">${deptVehicles}</div></div>
      <div class="stat"><div class="label">Avg Rev / Vehicle</div><div class="value" style="font-size:15px;">${deptVehicles>0?fmt(deptAvgRev):'—'}</div></div>
    </div>

    <!-- Incentive Rate Card -->
    <div class="card" style="margin-bottom:14px;padding:14px 18px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--ink-soft);text-transform:uppercase;letter-spacing:.05em;">Incentive Criteria</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12.5px;">
        <div><b>Executives (Adil + Pandurang)</b>
          <div class="kbd-note" style="margin-top:4px;">₹3,00,000–₹4,00,000 → Flat <b>₹1,500 each</b></div><div class="kbd-note">Below ₹3,00,000 → <b>₹0</b></div>
          <div class="kbd-note">Revenue > ₹4,00,000 → <b>₹600 × total lacs</b> each</div>
        </div>
        <div><b>Technicians (Individual)</b>
          <div class="kbd-note" style="margin-top:4px;">Below ₹1,00,000 → <b>₹0</b></div>
          <div class="kbd-note">≥ ₹1,00,000 → <b>₹500 × individual lacs</b></div>
        </div>
      </div>
    </div>

    ${canEditTarget ? `<div class="card" style="margin-bottom:14px;"><div class="card-head"><strong>✏️ Edit Targets</strong><span class="pill pill-amber" style="font-size:10px;margin-left:8px;">Admin / Owner only</span></div><div class="kbd-note" style="margin-bottom:10px;">Executives share ₹4,00,000 combined dept target. Each technician ₹1,00,000 individual.</div>${targetInputs}</div>` : ''}

    <!-- Main Table -->
    <div class="card"><div class="table-scroll"><table>
      <thead><tr style="background:#EFEAD9;">
        <th style="font-size:10px;text-transform:uppercase;">SR</th>
        <th style="font-size:10px;text-transform:uppercase;">Name</th>
        <th style="font-size:10px;text-transform:uppercase;">Designation</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;">Target</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;">Vehicles Done</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;">Avg Rev/Vehicle</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;cursor:help;" title="LOP achievement without GST">Revenue Achievement</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;">Achv %</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;">Leaves</th>
        <th class="num" style="font-size:10px;text-transform:uppercase;color:var(--good);">Incentive ₹</th>
        <th style="font-size:10px;text-transform:uppercase;">Basis</th>
      </tr></thead>
      <tbody>${rows.map((r,i)=>{
        const isExec = (r.e.designation||'').toLowerCase().includes('executive') || (r.e.designation||'').toLowerCase().includes('exec');
        const empRev = r.p.achievement;
        const empTarget = r.p.target;
        const pct = empTarget > 0 ? ((empRev/empTarget)*100).toFixed(1) : '—';
        const col = parseFloat(pct)>=100?'var(--good)':parseFloat(pct)>=80?'var(--amber)':'var(--bad)';
        const veh = r.ep.bsVehicles || 0;
        const avgRev = r.ep.bsAvgRev || 0;
        return '<tr style="border-bottom:1px solid var(--line)20;">' +
          '<td style="font-size:11px;color:var(--ink-soft);">' + (i+1) + '</td>' +
          '<td style="font-weight:600;">' + escapeHtml(toTitleCase(r.e.nameHR)) + '</td>' +
          '<td style="font-size:11px;color:var(--ink-soft);">' + escapeHtml(r.e.designation||'—') + '</td>' +
          '<td class="num">' + fmt(empTarget) + '</td>' +
          '<td class="num" style="text-align:center;font-weight:600;">' + (veh||'—') + '</td>' +
          '<td class="num">' + (avgRev>0?fmt(avgRev):'—') + '</td>' +
          '<td class="num" style="font-weight:600;">' + fmt(empRev) + '</td>' +
          '<td class="num" style="color:'+col+';font-weight:700;">' + pct + '%</td>' +
          '<td class="num">' + r.hr.actualAbsentee + '</td>' +
          '<td class="num" style="color:var(--good);font-weight:700;">' + fmt(r.ep.earned) + '</td>' +
          '<td style="font-size:10px;color:var(--ink-soft);max-width:180px;">' + escapeHtml(r.ep.incentiveNote||'—') + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="11"><div class="empty-state">No bodyshop staff found.</div></td></tr>'}
      </tbody></table></div></div>
    ${dashBasis('Achievement = Job Card revenue (Labour + Parts + Lubes, GST excluded) matched by Technician Name — individual total for Technicians, combined Bodyshop-dept total for Executives. Incentive is a tiered flat-rate per the criteria above, not eligibility/rate%-based.')}`;
  document.getElementById('dashBackBtn').onclick = () => { setActiveDashboard(null); renderDashboard(); };
  if (canEditTarget) {
    if (!b.perEmpTarget) b.perEmpTarget = {};
    document.querySelectorAll('.bs-tgt-inp').forEach(inp => {
      inp.addEventListener('change', () => {
        b.perEmpTarget[inp.dataset.empid] = money(inp.value);
        scheduleSave('months', () => APP.months);
        renderBodyshopDashboard(panel, mk, m);
      });
    });
  }
}

/* =========================================================================
   Bodyshop tab (legacy manual-entry fallback — no upload source exists)
   ========================================================================= */
export function renderBodyshopSection(containerId) {
  containerId = containerId || 'tab-bodyshop';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const b = m.special.bodyshop;
  const bodyshopEmps = activeEmployees(false).filter(e => e.category === 'BODYSHOP');
  const panel = document.getElementById(containerId);

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>Bodyshop — ${escapeHtml(m.label)}</strong></div>
      ${bodyshopEmps.map(e => `<div class="kbd-note" style="margin-bottom:4px;">${escapeHtml(toTitleCase(e.nameHR))}</div>`).join('') || '<div class="kbd-note">No employee is currently set to the Bodyshop category.</div>'}
      <div class="footer-note" style="margin:8px 0 14px 0;">No upload source was found for Bodyshop revenue, so this stays a manual entry. All Bodyshop employees receive the same earned ₹ amount, computed once for the unit.</div>
      <div class="grid-2">
        <div class="field"><label>Revenue (Achievement) ₹</label><input type="text" class="cell-input" style="width:140px;" id="sp-bsRev" value="${b.revenue}"></div>
        <div class="field"><label>Target ₹</label><input type="text" class="cell-input" style="width:140px;" id="sp-bsTgt" value="${b.target}"></div>
      </div>
      <div class="field"><label>Incentive %</label><input type="text" class="cell-input" style="width:100px;" id="sp-bsPct" value="${b.incentivePct}"></div>
    </div>
  `;
  const bindNum = (id, setter) => document.getElementById(id).addEventListener('change', (e) => { setter(money(e.target.value)); scheduleSave('months', () => APP.months); if (APP.meta.activeTab === 'dashboard') renderDashboard(); });
  bindNum('sp-bsRev', v => b.revenue = v);
  bindNum('sp-bsTgt', v => b.target = v);
  bindNum('sp-bsPct', v => b.incentivePct = v);
}

registerRole('BODYSHOP', { calcPerformance, calcEarnedPerformance, renderDashboard: renderBodyshopDashboard });
