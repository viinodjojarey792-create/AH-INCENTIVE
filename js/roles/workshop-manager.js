import { money } from '../core/utils.js';
import { ensureMonth } from '../core/months.js';
import { getJobCardBucket, hasAnyJobCardData } from '../core/job-card-data.js';
import { registerRole } from '../core/role-registry.js';

// WM = Workshop Manager. No dedicated sub-dashboard exists in the original
// app for this category — its dashboard view is folded into the Service
// Manager dashboard (see roles/service-manager.js, which filters for
// SERVICE_MANAGER || WM). Only the calcPerformance branch is ported here.
export function calcPerformance(emp, monthKey) {
  const m = ensureMonth(monthKey);
  const monthBucket = getJobCardBucket(monthKey);
  const hasData = hasAnyJobCardData();
  let target, targetSource;
  if (m.targetOverrides[emp.id] != null) {
    target = money(m.targetOverrides[emp.id]);
    targetSource = 'override';
  } else if (emp.target && emp.target > 0) {
    target = money(emp.target);
    targetSource = 'manual';
  } else {
    target = money(m.special.wmTarget);
    targetSource = 'manual';
  }
  let achievement = 0, vehicleCount = null;
  if (monthBucket) { achievement = monthBucket.workshop.total; vehicleCount = monthBucket.workshop.count; }
  const basis = monthBucket ? 'Floor LOP + Bodyshop LOP (whole workshop job card total, GST removed)' : (hasData ? 'no job cards closed in this month yet' : 'no job card data uploaded');
  const pctAchievement = target > 0 ? (achievement / target) * 100 : 0;
  return { target, achievement, pctAchievement, vehicleCount, basis, targetSource, targetWindowLabel: null };
}

registerRole('WM', { calcPerformance });
