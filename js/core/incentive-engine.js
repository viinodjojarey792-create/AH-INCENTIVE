import { APP, DEFAULT_CATEGORY_RATES, DEFAULT_CATEGORY_ELIGIBILITY } from './state.js';
import { money, activeEmployees } from './utils.js';
import { ensureMonth } from './months.js';
import { hrFor } from './months.js';
import { calcBehavioral } from './behavioral.js';
import { getRole } from './role-registry.js';

// ---- Per-employee performance achievement/target by category ----
// Dispatches to the registered role module for emp.category. Categories with
// no registered role (NONE, and today CRE/CRM/HR have no performance branch)
// get a zeroed-out result, matching the original app's fall-through behavior.
export function calcPerformance(emp, monthKey) {
  const role = getRole(emp.category);
  if (!role) {
    return { target: 0, achievement: 0, pctAchievement: 0, vehicleCount: null, basis: '', targetSource: null, targetWindowLabel: null };
  }
  return role.calcPerformance(emp, monthKey);
}

export function getIncentivePct(monthKey, empId, category) {
  const m = ensureMonth(monthKey);
  // Per-employee rate takes priority; fall back to category-level rate
  if (m.incentivePct && m.incentivePct[empId] && m.incentivePct[empId][category] != null) {
    return money(m.incentivePct[empId][category]);
  }
  if (m.categoryRates && m.categoryRates[category] != null) {
    return money(m.categoryRates[category]);
  }
  if (DEFAULT_CATEGORY_RATES[category] != null) return DEFAULT_CATEGORY_RATES[category];
  return 0;
}
export function setIncentivePct(monthKey, empId, category, value) {
  const m = ensureMonth(monthKey);
  if (!m.incentivePct[empId]) m.incentivePct[empId] = {};
  m.incentivePct[empId][category] = money(value);
}

// Default earned-incentive formula: eligible (achv% >= category eligibility
// threshold) ? achievement * rate% : 0. Most roles use this as-is; Warranty
// and Bodyshop register their own calcEarnedPerformance because they use
// flat/tiered amounts instead of a percentage-of-achievement.
export function genericEarnedPerformance(emp, monthKey, perf) {
  const eligM = ensureMonth(monthKey);
  const eligSettings = eligM.categoryEligibility || DEFAULT_CATEGORY_ELIGIBILITY;
  const eligPct = eligSettings[emp.category] != null ? eligSettings[emp.category] : 100;
  const achvPct = perf.target > 0 ? (perf.achievement / perf.target) * 100 : 0;
  const eligible = achvPct >= eligPct;

  const pct = getIncentivePct(monthKey, emp.id, emp.category);
  const rawEarned = perf.achievement * (pct / 100);
  const earned = eligible ? rawEarned : 0;

  return { ...perf, pct, earned, isFlat: false, eligible, eligPct, achvPct };
}

// ---- Earned incentive for performance categories ----
export function calcEarnedPerformance(emp, monthKey) {
  const perf = calcPerformance(emp, monthKey);
  if (emp.category === 'NONE') return { ...perf, pct: null, earned: 0, isFlat: false };
  const role = getRole(emp.category);
  if (role && role.calcEarnedPerformance) return role.calcEarnedPerformance(emp, monthKey, perf);
  return genericEarnedPerformance(emp, monthKey, perf);
}

// ---- Leave deduction multiplier on grand total ----
export function leaveDeductionPct(actualAbsentee) {
  const a = money(actualAbsentee);
  for (const slab of APP.settings.leaveDeductionSlabs) {
    if (slab.inclusive ? a <= slab.upTo : a < slab.upTo) return slab.pct;
  }
  return 0;
}

// ---- Full final row for one employee ----
export function calcFinalRow(emp, monthKey) {
  const hr = hrFor(monthKey, emp.id);
  const behavioral = calcBehavioral(emp, monthKey);
  const perf = calcEarnedPerformance(emp, monthKey);
  const totalBeforeDeduction = behavioral.total + (perf.earned || 0);
  const deductionPct = leaveDeductionPct(hr.actualAbsentee);
  // Mirrors the original sheet: the leave-deduction slab multiplies the whole pre-deduction total.
  const afterDeduction = totalBeforeDeduction * (deductionPct / 100);
  const ov = ensureMonth(monthKey).overrides[emp.id] || {};
  const finalAmount = (ov.finalOverride != null && ov.finalOverride !== '') ? money(ov.finalOverride) : afterDeduction;
  return {
    emp, hr, behavioral, perf,
    totalBeforeDeduction, deductionPct, afterDeduction,
    remark: ov.remark || '', finalAmount
  };
}

export function sortByDesignation(rows) {
  return rows.sort((a, b) => {
    const d = (a.emp.designation || '').toUpperCase().localeCompare((b.emp.designation || '').toUpperCase());
    return d !== 0 ? d : a.emp.srNo - b.emp.srNo;
  });
}

export function calcAllFinalRows(monthKey, includeAll) {
  const rows = activeEmployees(includeAll).map(e => calcFinalRow(e, monthKey));
  return sortByDesignation(rows);
}
