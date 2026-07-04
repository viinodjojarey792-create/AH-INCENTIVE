import { APP, DEFAULT_CATEGORY_RATES, DEFAULT_CATEGORY_ELIGIBILITY } from './state.js';
import { monthLabelOf } from './utils.js';

// Returns the most recent prior month's categoryRates/categoryEligibility,
// so a new month inherits the last admin-set values rather than resetting.
export function getPriorMonthCategorySettings(key) {
  const keys = Object.keys(APP.months).filter(k => k < key).sort().reverse();
  for (const pk of keys) {
    const pm = APP.months[pk];
    if (pm && (pm.categoryRates || pm.categoryEligibility)) {
      return {
        rates: pm.categoryRates ? { ...pm.categoryRates } : {},
        elig: pm.categoryEligibility ? { ...pm.categoryEligibility } : {}
      };
    }
  }
  return null;
}
export function blankMonth(key) {
  const prior = getPriorMonthCategorySettings(key);
  const categoryRates = prior ? { ...DEFAULT_CATEGORY_RATES, ...prior.rates } : { ...DEFAULT_CATEGORY_RATES };
  const categoryEligibility = prior ? { ...DEFAULT_CATEGORY_ELIGIBILITY, ...prior.elig } : { ...DEFAULT_CATEGORY_ELIGIBILITY };
  return {
    label: monthLabelOf(key),
    hr: {},          // empId -> {actualAbsentee, approvedLeaves, lateMarks, tobacco, hrRemark}
    hrSheetMeta: { fileName: null, uploadedAt: null, unmatched: [] },
    tobaccoMeta: { fileName: null, uploadedAt: null, unmatched: [] },
    complaints: {},  // empId -> count
    complaintsMeta: { fileName: null, uploadedAt: null, unmatched: [] },
    jobCard: null,   // {byTech, byAdvisor, workshop, fileName, uploadedAt, monthLabel, unmatchedTech, unmatchedAdvisor}
    incentivePct: {}, // empId -> { CATEGORY: pctNumber }
    categoryRates,       // per-category Incentive % — inherited from prior month, or system default
    categoryEligibility, // per-category Eligibility % — inherited from prior month, or system default
    special: {
      wmTarget: APP.settings.defaultWmTarget,
      warranty: { fscTarget: 0, fscAchievement: 0, warrantyTarget: 0, warrantyAchievement: 0, flatAmount: APP.settings.warrantyFlatAmount, achieved: false, delayDays: 0, manager: '' },
      warrantyMeta: { fileName: null, uploadedAt: null, rowsInMonth: null },
      bodyshop: { revenue: 0, target: 0, incentivePct: 0, vehicleCount: 0, perEmpRevenue: {}, perEmpTarget: {} },
      amcVas: {}, // empId -> {paidService,minorRepair,generalRepair,free1,free2,free3,totalVehicles, nitrogen,batteryCharging,mufflerCoating,coating,chainLube,amc}
      vehicleInMeta: { fileName: null, uploadedAt: null, unmatched: [] }
    },
    overrides: {}, // empId -> {remark, finalOverride}
    targetOverrides: {} // empId -> number | null — admin manual target override for this month, takes priority over auto/fallback
  };
}
export function ensureMonth(key) {
  if (!APP.months[key]) APP.months[key] = blankMonth(key);
  const m = APP.months[key];
  if (!m.categoryRates) m.categoryRates = (function(){ const p=getPriorMonthCategorySettings(key); return p ? { ...DEFAULT_CATEGORY_RATES, ...p.rates } : { ...DEFAULT_CATEGORY_RATES }; })();
  if (!m.categoryEligibility) m.categoryEligibility = (function(){ const p=getPriorMonthCategorySettings(key); return p ? { ...DEFAULT_CATEGORY_ELIGIBILITY, ...p.elig } : { ...DEFAULT_CATEGORY_ELIGIBILITY }; })();
  if (!m.hrSheetMeta) m.hrSheetMeta = { fileName: null, uploadedAt: null, unmatched: [] };
  if (!m.tobaccoMeta) m.tobaccoMeta = { fileName: null, uploadedAt: null, unmatched: [] };
  if (!m.complaintsMeta) m.complaintsMeta = { fileName: null, uploadedAt: null, unmatched: [] };
  if (!m.special) m.special = blankMonth(key).special;
  if (!m.special.amcVas) m.special.amcVas = {};
  if (!m.special.warranty) m.special.warranty = blankMonth(key).special.warranty;
  if (!m.special.warrantyMeta) m.special.warrantyMeta = { fileName: null, uploadedAt: null, rowsInMonth: null };
  if (!m.special.vehicleInMeta) m.special.vehicleInMeta = { fileName: null, uploadedAt: null, unmatched: [] };
  if (!m.special.bodyshop) m.special.bodyshop = blankMonth(key).special.bodyshop;
  if (m.special.bodyshop.vehicleCount == null) m.special.bodyshop.vehicleCount = 0;
  if (!m.special.bodyshop.perEmpRevenue) m.special.bodyshop.perEmpRevenue = {};
  if (!m.special.bodyshop.perEmpTarget) m.special.bodyshop.perEmpTarget = {};
  if (m.special.wmTarget == null) m.special.wmTarget = APP.settings.defaultWmTarget;
  if (!m.overrides) m.overrides = {};
  if (!m.incentivePct) m.incentivePct = {};
  if (!m.targetOverrides) m.targetOverrides = {};
  if (!m.otc) m.otc = { invoices: {}, total: 0, count: 0, fileName: null, uploadedAt: null, history: [] };
  return m;
}
export function hrFor(monthKey, empId) {
  const m = ensureMonth(monthKey);
  if (!m.hr[empId]) m.hr[empId] = { actualAbsentee: 0, approvedLeaves: 0, lateMarks: 0, tobacco: 'NO', hrRemark: '' };
  return m.hr[empId];
}
export function amcVasFor(monthKey, empId) {
  const m = ensureMonth(monthKey);
  if (!m.special.amcVas[empId]) {
    m.special.amcVas[empId] = { paidService: 0, minorRepair: 0, generalRepair: 0, free1: 0, free2: 0, free3: 0, totalVehicles: 0, nitrogen: 0, batteryCharging: 0, mufflerCoating: 0, coating: 0, chainLube: 0, amc: 0 };
  }
  return m.special.amcVas[empId];
}
export function sortedMonthKeys() {
  return Object.keys(APP.months).sort().reverse();
}

// Jan-Jun of year Y uses the Jan-Jun average of year Y-1 as target;
// Jul-Dec of year Y uses the Jul-Dec average of year Y-1. Fixed per half-year,
// not recalculated month to month within that half.
export function targetWindowForMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const py = y - 1;
  if (m >= 1 && m <= 6) {
    return { startYear: py, startMonth: 1, endYear: py, endMonth: 6, label: `Jan ${py} – Jun ${py}` };
  }
  return { startYear: py, startMonth: 7, endYear: py, endMonth: 12, label: `Jul ${py} – Dec ${py}` };
}
export function dateInWindow(d, win) {
  const ym = d.getFullYear() * 12 + d.getMonth(); // months since epoch, 0-indexed month
  const startYm = win.startYear * 12 + (win.startMonth - 1);
  const endYm = win.endYear * 12 + (win.endMonth - 1);
  return ym >= startYm && ym <= endYm;
}
export function monthKeyInWindow(mk, win) {
  const [y, m] = mk.split('-').map(Number);
  const ym = y * 12 + (m - 1);
  const startYm = win.startYear * 12 + (win.startMonth - 1);
  const endYm = win.endYear * 12 + (win.endMonth - 1);
  return ym >= startYm && ym <= endYm;
}
