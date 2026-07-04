import { APP } from '../core/state.js';
import { money, fmt } from '../core/utils.js';
import { ensureMonth } from '../core/months.js';
import { jobCardLookupTech, getTechnicianTarget, getBodyshopDeptRevenue } from '../core/job-card-data.js';
import { registerRole } from '../core/role-registry.js';

// NARODE = "Asst. Manager Floor" (Floor Manager). No dedicated sub-dashboard
// exists in the original app for this category — only its calcPerformance
// branch is ported here.
export function calcPerformance(emp, monthKey) {
  const m = ensureMonth(monthKey);
  let target = 0, targetSource = null;

  // Exclude Bodyshop dept employees from both target and achievement
  const isBodyshop = e => (e.category === 'BODYSHOP') ||
                           (e.department || '').toUpperCase().includes('BODYSHOP');

  const allTech = APP.employees.filter(e =>
    e.category === 'TECHNICIAN' && e.status === 'ACTIVE' && !isBodyshop(e));
  const allSupv = APP.employees.filter(e =>
    e.category === 'SUPERVISOR' && e.status === 'ACTIVE' && !isBodyshop(e));

  // Sum of ALL non-bodyshop technician targets
  let techTargetSum = 0;
  for (const t of allTech) techTargetSum += getTechnicianTarget(monthKey, t).value;

  // Sum of ALL non-bodyshop supervisor targets
  let supvTargetSum = 0;
  for (const s of allSupv) {
    const team = APP.employees.filter(e =>
      e.category === 'TECHNICIAN' && e.supervisorId === s.id && !isBodyshop(e));
    for (const t of team) supvTargetSum += getTechnicianTarget(monthKey, t).value;
  }

  // Target = manual override (emp.target) if set, else auto MAX(tech, supv) — excluding Bodyshop
  if (m.targetOverrides[emp.id] != null) {
    target = money(m.targetOverrides[emp.id]);
    targetSource = 'override';
  } else if (emp.target && emp.target > 0) {
    target = money(emp.target);
    targetSource = 'manual';
  } else {
    target = Math.max(techTargetSum, supvTargetSum);
    targetSource = 'auto';
  }
  const usedBasis = techTargetSum >= supvTargetSum ? 'technicians' : 'supervisors';

  // Achievement = non-bodyshop TECHNICIAN job card revenues + Bodyshop dept revenue
  // (Advisors handle the SAME job cards as technicians — adding both would double-count)
  let nonBsAchievement = 0;
  let nonBsCount = 0;
  for (const t of allTech) {
    const r = jobCardLookupTech(monthKey, t);
    nonBsAchievement += r.revenue;
    nonBsCount += r.count;
  }
  const bsDept = getBodyshopDeptRevenue(monthKey);
  const achievement = nonBsAchievement + bsDept.revenue;
  const vehicleCount = nonBsCount + bsDept.count;
  const basis = `Target = MAX(tech ${fmt(techTargetSum)}, supv ${fmt(supvTargetSum)}) → ${usedBasis}. Achievement = Floor LOP ${fmt(nonBsAchievement)} + Bodyshop LOP ${fmt(bsDept.revenue)} = ${fmt(achievement)}.`;

  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource, targetWindowLabel: null };
}

registerRole('NARODE', { calcPerformance });
