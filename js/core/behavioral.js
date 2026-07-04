import { APP } from './state.js';
import { money } from './utils.js';
import { hrFor, ensureMonth } from './months.js';

// ---- Behavioral incentive (verified against BEHAVIORAL-INCENTIVE sheet) ----
// Universal — applies to every employee regardless of role/category.
export function calcBehavioral(emp, monthKey) {
  const hr = hrFor(monthKey, emp.id);
  const s = APP.settings;
  const actual = money(hr.actualAbsentee);
  const approved = money(hr.approvedLeaves);
  const late = money(hr.lateMarks);

  let leaveAmt = 0, leaveEligible = (actual <= s.maxAbsenteeForLeaveComponent) && ((actual - approved) <= 0);
  if (leaveEligible) leaveAmt = s.leaveAmount;

  let lateAmt = (late === 0) ? s.lateMarkAmount : 0;

  let tobaccoAmt = 0;
  const tobaccoApplies = !s.tobaccoMaleOnly || emp.gender === 'Male';
  if (tobaccoApplies && (hr.tobacco || 'NO').toUpperCase() === 'NO') tobaccoAmt = s.tobaccoAmount;

  let complaintAmt = 0, complaintCount = null;
  if (s.complaintEligibleCategories.includes(emp.category)) {
    const m = ensureMonth(monthKey);
    complaintCount = money(m.complaints[emp.id] || 0);
    if (complaintCount === 0) complaintAmt = s.complaintBaseAmount;
    else if (complaintCount === s.complaintPenaltyAtCount) complaintAmt = s.complaintPenaltyAmount;
    else complaintAmt = 0;
  }

  const total = leaveAmt + lateAmt + tobaccoAmt + complaintAmt;
  return { leaveAmt, leaveEligible, lateAmt, tobaccoAmt, tobaccoApplies, complaintAmt, complaintCount, total };
}
