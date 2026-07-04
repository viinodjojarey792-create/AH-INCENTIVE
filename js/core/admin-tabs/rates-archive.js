import { APP, DEFAULT_CATEGORY_ELIGIBILITY, CATEGORY_LABELS } from '../state.js';
import { money, norm, escapeHtml, toTitleCase, fmt, toast, activeEmployees, monthLabelOf } from '../utils.js';
import { scheduleSave } from '../store.js';
import { isAdmin, canDo } from '../auth.js';
import { ensureMonth } from '../months.js';
import { calcPerformance, calcEarnedPerformance, setIncentivePct } from '../incentive-engine.js';
import { jobCardLookupAdvisor, jobCardRowKey } from '../job-card-data.js';
import { parseDateFlexible, monthKeyOf } from '../utils.js';
import { parseCsvFile, buildHrSheetSummary } from '../import-handlers.js';

/* =========================================================================
   Incentive Rates tab
   ========================================================================= */
export function renderRates(containerId) {
  containerId = containerId || 'tab-rates';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const s = APP.settings;
  const panel = document.getElementById(containerId);
  const cats = ['TECHNICIAN', 'ADVISOR', 'SUPERVISOR', 'NARODE', 'WM', 'SERVICE_MANAGER', 'STORE_MANAGER', 'WARRANTY', 'BODYSHOP'];
  const list = activeEmployees(false).filter(e => cats.includes(e.category)).sort((a, b) => a.srNo - b.srNo);
  const canBulk = isAdmin() || APP.currentUser?.role === 'OWNER' || canDo('edit_rates');

  // Get current category-level rates
  if (!m.categoryRates) m.categoryRates = {};

  const bulkCats = [
    { key: 'TECHNICIAN',      label: 'Technician' },
    { key: 'SUPERVISOR',      label: 'Floor Supervisor' },
    { key: 'NARODE',          label: 'Asst. Manager Floor' },
    { key: 'WM',              label: 'Workshop Manager' },
    { key: 'SERVICE_MANAGER', label: 'Service Manager' },
    { key: 'STORE_MANAGER',   label: 'Store Manager' },
  ];
  if (!m.categoryEligibility) m.categoryEligibility = { ...DEFAULT_CATEGORY_ELIGIBILITY };
  const eligSettings = m.categoryEligibility;

  let bulkHtml = '';
  if (canBulk) {
    const rows2 = bulkCats.map(c => {
      const count = list.filter(e => e.category === c.key).length;
      if (!count) return '';
      const curRate = (m.categoryRates && m.categoryRates[c.key] != null) ? m.categoryRates[c.key] : '';
      const curElig = eligSettings[c.key] != null ? eligSettings[c.key] : 100;
      return '<tr style="border-bottom:1px solid var(--line);">' +
        '<td style="padding:10px 12px;font-weight:600;">' + c.label + '</td>' +
        '<td style="padding:10px 12px;color:var(--ink-soft);">' + count + ' employee' + (count>1?'s':'') + '</td>' +
        '<td style="padding:6px 12px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;">' +
          '<input type="number" step="1" min="0" max="100" id="bulk-elig-' + c.key + '" value="' + curElig + '" style="width:70px;text-align:center;font-size:13px;font-weight:600;padding:5px 8px;border:1.5px solid var(--bad);border-radius:6px;background:var(--paper-raised);">' +
          '<span class="kbd-note">%</span></div></td>' +
        '<td style="padding:6px 12px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;">' +
          '<input type="number" step="0.01" min="0" max="100" id="bulk-rate-' + c.key + '" value="' + curRate + '" placeholder="0.00" style="width:70px;text-align:center;font-size:13px;font-weight:600;padding:5px 8px;border:1.5px solid var(--line);border-radius:6px;background:var(--paper-raised);">' +
          '<span class="kbd-note">%</span></div></td>' +
        '<td style="padding:6px 12px;"><button class="btn" data-bulk-apply="' + c.key + '" style="font-size:12px;padding:5px 14px;white-space:nowrap;">Apply to All</button></td>' +
        '</tr>';
    }).join('');
    bulkHtml = '<div class="card" style="margin-bottom:14px;">' +
      '<div class="card-head"><strong>⚡ Set Eligibility &amp; Incentive % by Category</strong><span class="pill pill-amber" style="font-size:10px;margin-left:8px;">Admin / Owner only</span></div>' +
      '<p class="kbd-note" style="margin-bottom:12px;"><b style="color:var(--bad);">Eligibility %</b> = minimum achievement% to qualify for any incentive (default 100%). ' +
      '<b>Incentive %</b> = rate applied to achievement when eligible. Click <b>Apply to All</b> to set both for all employees in that category instantly.</p>' +
      '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12.5px;">' +
      '<thead><tr style="background:#EFEAD9;">' +
      '<th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">Category</th>' +
      '<th style="padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">Employees</th>' +
      '<th style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--bad);">Eligibility Threshold %<br><span style="font-weight:400;font-size:10px;text-transform:none;">Min achievement to qualify</span></th>' +
      '<th style="padding:8px 12px;text-align:center;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">Incentive %<br><span style="font-weight:400;font-size:10px;text-transform:none;">Rate if eligible</span></th>' +
      '<th style="padding:8px 12px;border-bottom:1px solid var(--line);"></th>' +
      '</tr></thead><tbody>' + rows2 + '</tbody></table></div>' +
      '<div id="bulkRateStatus" style="font-size:12px;margin-top:8px;min-height:18px;"></div>' +
      '</div>';
  }

  panel.innerHTML = `
    ${canBulk ? `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-head">
        <strong>🎯 Service Advisor Incentive Criteria</strong>
        <span class="pill pill-amber" style="font-size:10px;">Admin / Owner only</span>
      </div>
      <p class="kbd-note" style="margin-bottom:14px;">
        Both targets must be met for an advisor to earn incentive. If either is missed → ₹0.
        Changes apply immediately to all calculations and dashboards.
      </p>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;font-size:12.5px;min-width:600px;">
          <thead><tr style="background:#EFEAD9;">
            <th style="padding:8px 14px;text-align:left;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">Parameter</th>
            <th style="padding:8px 14px;text-align:center;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">Current Value</th>
            <th style="padding:8px 14px;text-align:center;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">New Value</th>
            <th style="padding:8px 14px;text-align:left;border-bottom:1px solid var(--line);font-size:10.5px;font-weight:600;text-transform:uppercase;color:var(--ink-soft);">Description</th>
          </tr></thead>
          <tbody>
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:10px 14px;font-weight:600;">🚗 Vehicle Target</td>
              <td style="padding:10px 14px;text-align:center;"><span class="pill pill-amber">${s.advisorVehicleTarget||500} vehicles</span></td>
              <td style="padding:6px 14px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;"><input type="number" min="0" id="ir-advVehicleTarget" value="${s.advisorVehicleTarget||500}" style="width:90px;text-align:center;font-size:13px;font-weight:600;padding:5px 8px;border:1.5px solid var(--line);border-radius:6px;"><span class="kbd-note">vehicles/month</span></div></td>
              <td style="padding:10px 14px;color:var(--ink-soft);font-size:11.5px;">Minimum vehicles per advisor per month to qualify</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:10px 14px;font-weight:600;">💰 Avg Rev / Vehicle</td>
              <td style="padding:10px 14px;text-align:center;"><span class="pill pill-amber">${fmt(s.advisorAvgRevTarget||1300)}</span></td>
              <td style="padding:6px 14px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;"><input type="number" min="0" id="ir-advAvgRev" value="${s.advisorAvgRevTarget||1300}" style="width:90px;text-align:center;font-size:13px;font-weight:600;padding:5px 8px;border:1.5px solid var(--line);border-radius:6px;"><span class="kbd-note">₹ per vehicle</span></div></td>
              <td style="padding:10px 14px;color:var(--ink-soft);font-size:11.5px;">Minimum average revenue per vehicle to qualify</td>
            </tr>
            <tr style="border-bottom:1px solid var(--line);">
              <td style="padding:10px 14px;font-weight:600;">₹ Rate per Vehicle</td>
              <td style="padding:10px 14px;text-align:center;"><span class="pill pill-teal">₹${s.advisorPerVehicleRate||1} / vehicle</span></td>
              <td style="padding:6px 14px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;"><input type="number" min="0" step="0.1" id="ir-advPerVehicle" value="${s.advisorPerVehicleRate||1}" style="width:90px;text-align:center;font-size:13px;font-weight:600;padding:5px 8px;border:1.5px solid var(--line);border-radius:6px;"><span class="kbd-note">₹ per vehicle (if eligible)</span></div></td>
              <td style="padding:10px 14px;color:var(--ink-soft);font-size:11.5px;">Paid per vehicle handled (if both targets met)</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;">% of Revenue</td>
              <td style="padding:10px 14px;text-align:center;"><span class="pill pill-teal">${s.advisorRevPct||1}% of revenue</span></td>
              <td style="padding:6px 14px;text-align:center;"><div style="display:flex;align-items:center;justify-content:center;gap:6px;"><input type="number" min="0" step="0.01" id="ir-advRevPct" value="${s.advisorRevPct||1}" style="width:90px;text-align:center;font-size:13px;font-weight:600;padding:5px 8px;border:1.5px solid var(--line);border-radius:6px;"><span class="kbd-note">% of total revenue (if eligible)</span></div></td>
              <td style="padding:10px 14px;color:var(--ink-soft);font-size:11.5px;">% of total monthly revenue (if both targets met)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <button class="btn" id="ir-advApplyBtn" style="min-width:160px;">✓ Save &amp; Apply Changes</button>
        <div id="ir-advPreview" style="font-size:12.5px;color:var(--ink-soft);"></div>
      </div>
      <div id="ir-advStatus" style="font-size:12px;margin-top:8px;min-height:18px;"></div>
    </div>` : ''}

    ${bulkHtml}

    <div class="card" style="margin-bottom:14px;">
      <div class="card-head"><strong>Incentive Rates — ${escapeHtml(m.label)}</strong></div>
      <p class="kbd-note" style="margin-top:-6px;margin-bottom:14px;">
        Rates set above auto-fill here. Override individual employees below if needed.
        <span style="color:var(--bad);">Red Achv%</span> = below eligibility threshold → ₹0 earned.
      </p>
      <div class="table-scroll">
        <table>
          <thead><tr>
            <th>Sr</th><th>Name</th><th>Category</th>
            <th class="num">Target</th><th class="num">Achievement</th>
            <th class="num">Achv %</th>
            <th class="num">Eligibility</th>
            <th class="num">Incentive %</th>
            <th class="num">Earned ₹</th>
          </tr></thead>
          <tbody id="rateBody"></tbody>
        </table>
      </div>
    </div>
  `;
  paintRateRows(list);

  // Wire advisor criteria (Admin/Owner)
  if (canBulk && document.getElementById('ir-advApplyBtn')) {
    const advisors = activeEmployees().filter(e => e.category === 'ADVISOR');
    const updatePreview = () => {
      const vt  = parseFloat(document.getElementById('ir-advVehicleTarget').value) || 500;
      const art = parseFloat(document.getElementById('ir-advAvgRev').value) || 1300;
      const pvr = parseFloat(document.getElementById('ir-advPerVehicle').value) || 1;
      const rp  = parseFloat(document.getElementById('ir-advRevPct').value) || 1;
      let qualCount = 0, totalEarned = 0;
      for (const e of advisors) {
        const jc = jobCardLookupAdvisor(mk, e);
        const avg = jc.count > 0 ? jc.revenue / jc.count : 0;
        if (jc.count >= vt && avg >= art) {
          qualCount++;
          totalEarned += (jc.count * pvr) + (jc.revenue * rp / 100);
        }
      }
      const prev = document.getElementById('ir-advPreview');
      if (prev) prev.innerHTML =
        '<span style="color:var(--good);font-weight:600;">' + qualCount + '/' + advisors.length + ' advisors qualify</span> under new criteria &nbsp;|&nbsp; ' +
        'Total incentive: <b>₹' + fmt(Math.round(totalEarned)) + '</b>';
    };
    ['ir-advVehicleTarget','ir-advAvgRev','ir-advPerVehicle','ir-advRevPct'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', updatePreview);
    });
    updatePreview();
    document.getElementById('ir-advApplyBtn').addEventListener('click', () => {
      const vt  = parseFloat(document.getElementById('ir-advVehicleTarget').value);
      const art = parseFloat(document.getElementById('ir-advAvgRev').value);
      const pvr = parseFloat(document.getElementById('ir-advPerVehicle').value);
      const rp  = parseFloat(document.getElementById('ir-advRevPct').value);
      if ([vt,art,pvr,rp].some(isNaN)) { toast('Fill all fields before saving', true); return; }
      s.advisorVehicleTarget = vt; s.advisorAvgRevTarget = art;
      s.advisorPerVehicleRate = pvr; s.advisorRevPct = rp;
      scheduleSave('settings', () => APP.settings);
      const statusEl = document.getElementById('ir-advStatus');
      statusEl.innerHTML = '<span style="color:var(--good)">✓ Saved — Vehicle target: ' + vt + ', Avg Rev: ₹' + fmt(art) + '/vehicle, Rate: ₹' + pvr + '/vehicle + ' + rp + '% revenue</span>';
      setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 5000);
      renderRates(containerId);
      toast('Advisor criteria updated');
    });
  }


  // Wire bulk-apply buttons
  if (canBulk) {
    document.querySelectorAll('[data-bulk-apply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.bulkApply;
        const rateInp = document.getElementById('bulk-rate-' + cat);
        const eligInp = document.getElementById('bulk-elig-' + cat);
        const pct  = parseFloat(rateInp.value);
        const elig = parseFloat(eligInp.value);
        if (isNaN(pct) || pct < 0) { toast('Enter a valid Incentive % first', true); return; }
        if (isNaN(elig) || elig < 0 || elig > 100) { toast('Enter a valid Eligibility % (0-100)', true); return; }

        // Save category-level settings — PER MONTH, persists forward to future new months
        if (!m.categoryRates) m.categoryRates = {};
        m.categoryRates[cat] = pct;
        if (!m.categoryEligibility) m.categoryEligibility = {};
        m.categoryEligibility[cat] = elig;

        // Apply rate to all employees of this category
        const targets = list.filter(e => e.category === cat);
        targets.forEach(e => setIncentivePct(mk, e.id, cat, pct));

        scheduleSave('months', () => APP.months);
        paintRateRows(list);

        const statusEl = document.getElementById('bulkRateStatus');
        const qualCount = targets.filter(e => {
          const perf = calcPerformance(e, mk);
          const achvPct = perf.target > 0 ? (perf.achievement / perf.target) * 100 : 0;
          return achvPct >= elig;
        }).length;
        statusEl.innerHTML = '<span style="color:var(--good)">✓ Applied to ' + targets.length + ' ' + CATEGORY_LABELS[cat] + ' employees | ' +
          'Eligibility: ' + elig + '% | Incentive: ' + pct + '% | ' +
          '<b>' + qualCount + '/' + targets.length + ' currently qualify</b></span>';
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 5000);
        toast(qualCount + '/' + targets.length + ' ' + CATEGORY_LABELS[cat] + ' qualify at ' + elig + '% eligibility');
      });
    });
  }

  // Wire bulk-apply buttons
  if (canBulk) {
    document.querySelectorAll('[data-bulk-apply]').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.bulkApply;
        const inp = document.getElementById(`bulk-rate-${cat}`);
        const pct = parseFloat(inp.value);
        if (isNaN(pct) || pct < 0) { toast('Enter a valid % first', true); return; }

        // Save category-level rate
        m.categoryRates[cat] = pct;

        // Apply to all employees of this category
        const targets = list.filter(e => e.category === cat);
        targets.forEach(e => setIncentivePct(mk, e.id, cat, pct));

        scheduleSave('months', () => APP.months);
        paintRateRows(list);

        const statusEl = document.getElementById('bulkRateStatus');
        statusEl.innerHTML = `<span style="color:var(--good)">✓ ${pct}% applied to all ${targets.length} ${CATEGORY_LABELS[cat]} employees for ${escapeHtml(m.label)}</span>`;
        toast(`${pct}% set for all ${CATEGORY_LABELS[cat]} (${targets.length} employees)`);
        setTimeout(() => { if (statusEl) statusEl.innerHTML = ''; }, 4000);
      });
    });
  }
}

export function paintRateRows(list) {
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const eligSettings = m.categoryEligibility || DEFAULT_CATEGORY_ELIGIBILITY;
  document.getElementById('rateBody').innerHTML = list.map(e => {
    const perf    = calcEarnedPerformance(e, mk);
    const pct     = perf.pct || 0;
    const eligPct = eligSettings[e.category] != null ? eligSettings[e.category] : 100;
    const achvPct = perf.target > 0 ? (perf.achievement / perf.target) * 100 : 0;
    const eligible = achvPct >= eligPct;
    const earned   = perf.earned || 0;
    const achvColor = eligible ? 'var(--good)' : 'var(--bad)';
    return '<tr>' +
      '<td>' + e.srNo + '</td>' +
      '<td><b>' + escapeHtml(toTitleCase(e.nameHR)) + '</b></td>' +
      '<td><span class="pill pill-neutral">' + (e.designation || CATEGORY_LABELS[e.category]) + '</span></td>' +
      '<td class="num">' + fmt(perf.target) + (perf.targetSource ? '<span class="pill ' + (perf.targetSource==='auto'?'pill-amber':'pill-neutral') + '" style="padding:1px 6px;margin-left:4px;" title="' + escapeHtml(perf.targetWindowLabel||'') + '">' + perf.targetSource + '</span>' : '') + '</td>' +
      '<td class="num">' + fmt(perf.achievement) + '</td>' +
      '<td class="num" style="font-weight:700;color:' + achvColor + ';">' + achvPct.toFixed(1) + '%' + (eligible ? '' : ' ✗') + '</td>' +
      '<td class="num" style="color:' + achvColor + ';font-size:11.5px;">' + (eligible ? '<span style="color:var(--good);">≥' + eligPct + '% ✓</span>' : '<span style="color:var(--bad);">Need ' + eligPct + '%</span>') + '</td>' +
      '<td class="num"><input type="text" class="cell-input" data-rate="' + e.id + '" data-cat="' + e.category + '" value="' + pct + '" style="width:64px;text-align:center;"></td>' +
      '<td class="num"><b style="color:' + (earned>0?'var(--good)':eligible?'inherit':'var(--bad)') + ';">' + (eligible ? '₹'+fmt(Math.round(earned)) : '₹0 (ineligible)') + '</b></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="9"><div class="empty-state">No employees in a performance category.</div></td></tr>';

  document.querySelectorAll('[data-rate]').forEach(inp => inp.addEventListener('change', ev => {
    setIncentivePct(mk, ev.target.dataset.rate, ev.target.dataset.cat, ev.target.value);
    scheduleSave('months', () => APP.months);
    paintRateRows(list);
  }));
}

/* =========================================================================
   Old Data — one-time historical import, grouped by month, kept entirely
   separate from the live monthly engine above.
   ========================================================================= */
export function ensureOldData() {
  if (!APP.oldData) APP.oldData = {};
  const o = APP.oldData;
  if (!o.hrSheet) o.hrSheet = null;
  if (!o.jobCard) o.jobCard = null;
  if (!o.warrantyData) o.warrantyData = null;
  if (!o.complaints) o.complaints = null;
  if (!o.vehicleIn) o.vehicleIn = null;
  return o;
}

function buildJobCardHistoryByMonth(rows, fileName) {
  // Stores the FULL per-tech and per-advisor breakdown (not just summary counts),
  // so old data can also serve individual achievement lookups.
  const byMonth = {};
  const seenKeysHist = new Set(); // de-dup guard — never count the same job card row twice
  for (const row of rows) {
    const d = parseDateFlexible(row['Job Card Closed Date']);
    if (!d) continue;

    const rowKeyHist = jobCardRowKey(row);
    if (seenKeysHist.has(rowKeyHist)) continue; // skip accidental duplicate row
    seenKeysHist.add(rowKeyHist);

    const mk = monthKeyOf(d);
    if (!byMonth[mk]) byMonth[mk] = { byTech: {}, byAdvisor: {}, workshop: { total: 0, count: 0 } };

    const labour = money(row['Labour Revenue']), parts = money(row['Parts Revenue']), lubes = money(row['Lubes Revenue']);
    // LOP = Labour + Lubes + Parts only (excludes Accessories Revenue), GST removed (18%)
    const lopGross2 = labour + parts + lubes;
    const lopNet2 = lopGross2 / 1.18;
    byMonth[mk].workshop.total += lopNet2;
    byMonth[mk].workshop.count += 1;

    const techName = norm(row['Technician Name']);
    if (techName) {
      if (!byMonth[mk].byTech[techName]) byMonth[mk].byTech[techName] = { revenue: 0, count: 0 };
      byMonth[mk].byTech[techName].revenue += lopNet2;
      byMonth[mk].byTech[techName].count += 1;
    }
    const advName = norm(row['Service Advisor Name']);
    if (advName) {
      if (!byMonth[mk].byAdvisor[advName]) byMonth[mk].byAdvisor[advName] = { revenue: 0, count: 0 };
      byMonth[mk].byAdvisor[advName].revenue += lopNet2;
      byMonth[mk].byAdvisor[advName].count += 1;
    }
  }
  return { byMonth, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length };
}

function buildWarrantyDataHistoryByMonth(rows, fileName) {
  const byMonth = {};
  for (const row of rows) {
    const d = parseDateFlexible(row['DATE']);
    if (!d) continue;
    const mk = monthKeyOf(d);
    if (!byMonth[mk]) byMonth[mk] = { fscAchievement: 0, warrantyAchievement: 0, rowsInMonth: 0 };
    byMonth[mk].fscAchievement += money(row['FSC INVOCIE AMT']);
    byMonth[mk].warrantyAchievement += money(row['WARRANTY INVOICE AMT']);
    byMonth[mk].rowsInMonth++;
  }
  return { byMonth, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length };
}

function buildVehicleInHistoryByMonth(rows, fileName) {
  const byMonth = {};
  for (const row of rows) {
    const d = parseDateFlexible(row['Timestamp']);
    if (!d) continue;
    const mk = monthKeyOf(d);
    const advName = norm(row['ADVISOR NAME']);
    if (!byMonth[mk]) byMonth[mk] = { totalVehicles: 0, advisors: new Set() };
    byMonth[mk].totalVehicles++;
    if (advName) byMonth[mk].advisors.add(advName);
  }
  const out = {};
  for (const mk of Object.keys(byMonth)) out[mk] = { totalVehicles: byMonth[mk].totalVehicles, advisorCount: byMonth[mk].advisors.size };
  return { byMonth: out, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length };
}

function buildComplaintsHistoryByMonth(rows, fileName) {
  const byMonth = {};
  const okStatus = new Set(['ACTION COMPLETED', 'CLOSED']);
  for (const row of rows) {
    const status = (row['Status'] || '').trim().toUpperCase();
    if (!okStatus.has(status)) continue;
    const d = parseDateFlexible(row['Created']);
    if (!d) continue;
    const mk = monthKeyOf(d);
    const hrName = norm(row['NAME AS PER HR SHEET']);
    if (!hrName) continue;
    if (!byMonth[mk]) byMonth[mk] = { total: 0, people: new Set() };
    byMonth[mk].total++;
    byMonth[mk].people.add(hrName);
  }
  const out = {};
  for (const mk of Object.keys(byMonth)) out[mk] = { total: byMonth[mk].total, peopleCount: byMonth[mk].people.size };
  return { byMonth: out, fileName, uploadedAt: new Date().toISOString(), totalRowsInFile: rows.length };
}

/* =========================================================================
   Old Data tab — one-time historical import
   ========================================================================= */
export function monthBreakdownTable(byMonth, columns) {
  const keys = Object.keys(byMonth).sort();
  if (!keys.length) return `<div class="empty-state" style="padding:16px 0;">No dated rows found in this file.</div>`;
  return `<div class="table-scroll"><table>
    <thead><tr><th>Month</th>${columns.map(c => `<th class="num">${escapeHtml(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${keys.map(mk => `<tr><td>${escapeHtml(monthLabelOf(mk))}</td>${columns.map(c => `<td class="num">${c.fmt(byMonth[mk][c.key])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table></div>`;
}

export function oldDataUploadCard(opts) {
  // opts: {key, title, hint, fileHint, inputId}
  const o = ensureOldData();
  const data = o[opts.key];
  return `
    <div class="card">
      <div class="card-head"><strong>${escapeHtml(opts.title)}</strong></div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">${opts.hint}</p>
      <label class="upload-zone" for="${opts.inputId}">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">${escapeHtml(opts.fileHint)}</div>
      </label>
      <input type="file" id="${opts.inputId}" accept=".csv" style="display:none;">
      ${data ? `<div class="footer-note">Last uploaded: ${escapeHtml(data.fileName)} — ${data.totalRowsInFile} row(s) total.</div>` : ''}
      <div id="${opts.inputId}-result"></div>
    </div>
  `;
}

export function renderOldData() {
  const panel = document.getElementById('tab-olddata');
  const o = ensureOldData();

  // Build coverage status: which months come from old archive vs main archive
  const mainMonths = new Set(Object.keys((APP.jobCardArchive && APP.jobCardArchive.byMonth) || {}));
  const oldMonths = Object.keys((o.jobCard && o.jobCard.byMonth) || {}).sort();
  const activeOldMonths = oldMonths.filter(mk => !mainMonths.has(mk));
  const shadowedOldMonths = oldMonths.filter(mk => mainMonths.has(mk));

  let coverageHtml = '';
  if (oldMonths.length) {
    const activePills = activeOldMonths.map(mk => `<span class="pill pill-amber" style="padding:2px 8px;">${escapeHtml(monthLabelOf(mk))}</span>`).join(' ');
    const shadowPills = shadowedOldMonths.map(mk => `<span class="pill pill-neutral" style="padding:2px 8px;">${escapeHtml(monthLabelOf(mk))}</span>`).join(' ');
    coverageHtml = `
      <div class="card" style="margin-bottom:0;">
        <div class="card-head"><strong>Job Card Archive — Active Coverage</strong></div>
        ${activeOldMonths.length ? `
          <p class="kbd-note" style="margin-bottom:8px;">These months are <b>served by Old Data Archive</b> (not in the main Job Card & Revenue upload) — incentive calculations for these months use this data:</p>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px;">${activePills}</div>
        ` : `<p class="kbd-note">All months in the Old Data Archive are already covered by the main Job Card &amp; Revenue upload — the main upload takes priority.</p>`}
        ${shadowedOldMonths.length ? `
          <p class="kbd-note" style="margin-bottom:8px; color:var(--ink-soft);">These months exist in both archives — <b>main Job Card & Revenue upload is used</b> (old data ignored to avoid double-counting):</p>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">${shadowPills}</div>
        ` : ''}
      </div>`;
  }

  panel.innerHTML = `
    <div class="banner info"><span>ℹ</span><div><b>This data is used for live incentive calculations.</b> When you switch to any month — current or past — the app checks the <b>Job Card & Revenue</b> upload first. For any month that upload doesn't cover, it automatically falls back to the <b>Job Card Log Sheet</b> you upload here. So uploading historical data here lets you calculate incentives for past months (e.g. March 2026) without needing to re-upload the main Job Card file. Warranty, Complaints and Vehicle-In history here are for reference only and don't affect calculations.</div></div>
    ${coverageHtml}
    ${oldDataUploadCard({ key: 'jobCard', title: 'Job Card Log Sheet and Revenue (History)', hint: 'Upload your full historical export — it will be grouped month by month automatically. Any month not already in the main Job Card & Revenue upload will feed into live incentive calculations.', fileHint: 'Job_Card_Log_Sheet_and_Revenue.csv', inputId: 'od-jobcard' })}
    ${oldDataUploadCard({ key: 'warrantyData', title: 'WARRANTY DATA (History)', hint: 'FSC and Warranty invoice history, grouped by month. For reference only.', fileHint: 'WARRANTY_DATA.csv', inputId: 'od-warranty' })}
    ${oldDataUploadCard({ key: 'complaints', title: 'HMSI-COMPLAIN (History)', hint: 'Qualifying complaint counts (Action Completed / Closed), grouped by month. For reference only.', fileHint: 'HMSI-COMPLAIN.csv', inputId: 'od-complaints' })}
    ${oldDataUploadCard({ key: 'vehicleIn', title: 'VEHICLE-IN-DATA (History)', hint: 'Vehicle-in counts per month. For reference only.', fileHint: 'VEHICLE-IN-DATA.csv', inputId: 'od-vehiclein' })}
    ${oldDataUploadCard({ key: 'hrSheet', title: 'HR-SHEET (Snapshot)', hint: 'A point-in-time roster snapshot — shown as-is, not grouped by month.', fileHint: 'HR-SHEET.csv', inputId: 'od-hrsheet' })}
  `;

  paintOldDataResults();

  document.getElementById('od-jobcard').addEventListener('change', (e) => handleOldDataUpload(e, async (rows, fileName) => {
    o.jobCard = buildJobCardHistoryByMonth(rows, fileName);
  }, 'od-jobcard'));
  document.getElementById('od-warranty').addEventListener('change', (e) => handleOldDataUpload(e, async (rows, fileName) => {
    o.warrantyData = buildWarrantyDataHistoryByMonth(rows, fileName);
  }, 'od-warranty'));
  document.getElementById('od-complaints').addEventListener('change', (e) => handleOldDataUpload(e, async (rows, fileName) => {
    o.complaints = buildComplaintsHistoryByMonth(rows, fileName);
  }, 'od-complaints'));
  document.getElementById('od-vehiclein').addEventListener('change', (e) => handleOldDataUpload(e, async (rows, fileName) => {
    o.vehicleIn = buildVehicleInHistoryByMonth(rows, fileName);
  }, 'od-vehiclein'));
  document.getElementById('od-hrsheet').addEventListener('change', (e) => handleOldDataUpload(e, async (rows, fileName) => {
    o.hrSheet = buildHrSheetSummary(rows, fileName);
  }, 'od-hrsheet'));
}

async function handleOldDataUpload(e, applyFn, inputId) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const rows = await parseCsvFile(file);
    await applyFn(rows, file.name);
    scheduleSave('oldData', () => APP.oldData);
    renderOldData();
    toast('Old data loaded: ' + file.name);
  } catch (err) {
    console.error(err);
    toast('Could not parse that CSV file', true);
  }
}

export function paintOldDataResults() {
  const o = ensureOldData();
  if (o.jobCard) {
    document.getElementById('od-jobcard-result').innerHTML = monthBreakdownTable(o.jobCard.byMonth, [
      { key: 'workshop', label: 'Workshop Revenue (L+P+Lube)', fmt: b => fmt(b ? b.total : 0) },
      { key: 'workshop', label: 'Job Cards', fmt: b => b ? b.count : 0 },
      { key: 'byTech', label: 'Technicians', fmt: b => b ? Object.keys(b).length : 0 },
      { key: 'byAdvisor', label: 'Advisors', fmt: b => b ? Object.keys(b).length : 0 }
    ]);
  }
  if (o.warrantyData) {
    document.getElementById('od-warranty-result').innerHTML = monthBreakdownTable(o.warrantyData.byMonth, [
      { key: 'fscAchievement', label: 'FSC Amount', fmt: fmt },
      { key: 'warrantyAchievement', label: 'Warranty Amount', fmt: fmt },
      { key: 'rowsInMonth', label: 'Rows', fmt: v => v }
    ]);
  }
  if (o.complaints) {
    document.getElementById('od-complaints-result').innerHTML = monthBreakdownTable(o.complaints.byMonth, [
      { key: 'total', label: 'Qualifying Complaints', fmt: v => v },
      { key: 'peopleCount', label: 'People Involved', fmt: v => v }
    ]);
  }
  if (o.vehicleIn) {
    document.getElementById('od-vehiclein-result').innerHTML = monthBreakdownTable(o.vehicleIn.byMonth, [
      { key: 'totalVehicles', label: 'Total Vehicles', fmt: v => v },
      { key: 'advisorCount', label: 'Advisors', fmt: v => v }
    ]);
  }
  if (o.hrSheet) {
    document.getElementById('od-hrsheet-result').innerHTML = `<div class="table-scroll"><table>
      <thead><tr><th>Name</th><th>Department</th><th>Designation</th><th>Status</th><th class="num">Absentee</th><th class="num">Leaves</th><th class="num">Late</th><th>Tobacco</th></tr></thead>
      <tbody>${o.hrSheet.rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.department)}</td><td>${escapeHtml(r.designation)}</td><td>${escapeHtml(r.status)}</td><td class="num">${r.actualAbsentee}</td><td class="num">${r.approvedLeaves}</td><td class="num">${r.lateMarks}</td><td>${escapeHtml(r.tobacco || '')}</td></tr>`).join('')}</tbody>
    </table></div>`;
  }
}
