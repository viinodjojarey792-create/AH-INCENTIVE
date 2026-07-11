import { APP } from './state.js';
import { CATEGORY_LABELS, TABS } from './state.js';
import { empById, escapeHtml, toTitleCase, fmt, norm, toast } from './utils.js';
import { scheduleSave } from './store.js';
import { ensureMonth, hrFor } from './months.js';
import { calcBehavioral } from './behavioral.js';
import { calcEarnedPerformance } from './incentive-engine.js';
import { getJobCardBucket } from './job-card-data.js';
import { getTeamMembers, linkedEmployee, isEmployee, canViewTab, currentUser, getRoleInfo, logout } from './auth.js';
import { applyHiriseAlias } from './admin-tabs/employees.js';
import { renderNav, switchTab } from './ui-shell.js';
import { currentRealMonthKey } from './boot.js';

function startRealtimeSync() {
  // No-op — app uses scheduleSave/Supabase polling instead of push channels.
}

// Categories whose Achievement is sourced from the Job Card Log Sheet upload.
const JOB_CARD_DRIVEN_CATEGORIES = ['TECHNICIAN', 'SUPERVISOR', 'NARODE', 'WM', 'SERVICE_MANAGER'];

function fmtDMY(iso) {
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
}

// ── switchEmpTab ──────────────────────────────────────────────────────────
export function switchEmpTab(empId) {
  const tabId = 'emp_' + empId;
  APP.meta.activeTab = tabId;
  scheduleSave('meta', () => APP.meta);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active',
    (b.dataset.tab === tabId) || (b.dataset.emptab === empId)));
  document.querySelectorAll('.tab-panel').forEach(p => p.style.display = p.id === 'tab-dashboard' ? 'block' : 'none');
  const emp = empById(empId);
  document.getElementById('topbarTitle').textContent = emp ? toTitleCase(emp.nameHR) : 'Employee';
  document.getElementById('topbarSub').textContent = emp ? (emp.designation||emp.department||'') + ' — Individual Dashboard' : '';
  // Default to current real month
  const realMk = currentRealMonthKey();
  if (APP.months[realMk]) APP.meta.currentMonth = realMk;
  // Rewire global month selector to re-render this dashboard
  const monthSel = document.getElementById('monthSelect');
  if (monthSel) {
    const newSel = monthSel.cloneNode(true);
    monthSel.parentNode.replaceChild(newSel, monthSel);
    newSel.value = APP.meta.currentMonth;
    newSel.addEventListener('change', e => {
      APP.meta.currentMonth = e.target.value;
      scheduleSave('meta', () => APP.meta, 50);
      renderEmpDashboard(empId);
    });
  }
  renderEmpDashboard(empId);
}

export function renderEmpDashboard(empId) {
  const panel = document.getElementById('tab-dashboard');
  const emp = empById(empId);
  if (!emp) { panel.innerHTML = '<div class="card"><div class="empty-state">Employee not found.</div></div>'; return; }
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const p = calcEarnedPerformance(emp, mk);
  const beh = calcBehavioral(emp, mk);
  const hr = hrFor(mk, emp.id);
  const pctNum = p.achvPct != null ? p.achvPct : (p.target > 0 ? (p.achievement/p.target)*100 : 0);
  const pct = pctNum > 0 ? pctNum.toFixed(1) : '—';
  const pctCol = pctNum>=100?'var(--good)':pctNum>=80?'var(--amber)':'var(--bad)';
  const eligible = p.eligible !== undefined ? p.eligible : pctNum>=(p.eligPct||100);
  const perfEarned = p.earned||0;
  const behEarned = beh.earned||0;
  const totalIncentive = perfEarned + behEarned;
  const team = getTeamMembers(emp);
  const jcBucket = JOB_CARD_DRIVEN_CATEGORIES.includes(emp.category) ? getJobCardBucket(mk) : null;
  const jcDateRange = jcBucket && jcBucket.dateRange ? jcBucket.dateRange : null;

  panel.innerHTML =
    '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px;">' +
      '<div style="display:flex;align-items:center;gap:14px;">' +
        '<div style="width:52px;height:52px;border-radius:50%;background:var(--bg-accent);display:flex;align-items:center;justify-content:center;font-size:22px;">👤</div>' +
        '<div>' +
          '<div style="font-size:20px;font-weight:700;">' + escapeHtml(toTitleCase(emp.nameHR)) + '</div>' +
          '<div style="font-size:12px;color:var(--ink-soft);">' + escapeHtml(emp.designation||'') + (emp.department?' &nbsp;·&nbsp; '+escapeHtml(emp.department):'') + '</div>' +
          '<div style="margin-top:4px;"><span class="pill pill-neutral" style="font-size:10px;">' + escapeHtml(CATEGORY_LABELS[emp.category]||emp.category||'—') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--ink-soft);">' + escapeHtml(m.label||mk) + '</div>' +
    '</div>' +

    (jcDateRange ?
      '<div class="kbd-note" style="margin:-10px 0 16px;">Data from: ' + fmtDMY(jcDateRange.from) + ' To ' + fmtDMY(jcDateRange.to) + '</div>'
    : '') +

    // KPI cards (hidden for advisors — they get the SA KPI card)
    (emp.category !== 'ADVISOR' ?
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:18px;">' +
        '<div class="stat"><div class="label">Target</div><div class="value" style="font-size:15px;' + (emp.targetNote?'cursor:help;border-bottom:1px dotted var(--ink-soft);':'') + '" ' + (emp.targetNote?'title="'+escapeHtml(emp.targetNote)+'"':'') + '>' + fmt(p.target) + '</div></div>' +
        '<div class="stat"><div class="label"' + (['TECHNICIAN','ADVISOR','SUPERVISOR','NARODE','WM','SERVICE_MANAGER','BODYSHOP'].includes(emp.category)?' title="LOP achievement without GST" style="cursor:help;border-bottom:1px dotted var(--ink-soft);"':'') + '>Achievement</div><div class="value" style="font-size:15px;">' + fmt(p.achievement) + '</div></div>' +
        '<div class="stat"><div class="label">Achv %</div><div class="value" style="font-size:20px;color:' + pctCol + ';">' + pct + '%</div></div>' +
        '<div class="stat"><div class="label">Perf Incentive</div><div class="value" style="font-size:15px;color:var(--good);">' + fmt(perfEarned) + '</div></div>' +
        '<div class="stat"><div class="label">Behavioral</div><div class="value" style="font-size:15px;color:var(--teal);">' + fmt(behEarned) + '</div></div>' +
        '<div class="stat" style="border:2px solid var(--good);"><div class="label">Total Incentive</div><div class="value" style="font-size:16px;color:var(--good);">' + fmt(totalIncentive) + '</div></div>' +
      '</div>' +
      '<div class="card" style="margin-bottom:14px;padding:16px 20px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
          '<span style="font-size:13px;font-weight:600;">Achievement Progress</span>' +
          '<span style="font-size:13px;color:' + pctCol + ';font-weight:700;">' + pct + '% of target</span>' +
        '</div>' +
        '<div style="background:var(--surface-2);border-radius:6px;height:12px;overflow:hidden;">' +
          '<div style="background:' + pctCol + ';height:100%;width:' + Math.min(pctNum,100) + '%;border-radius:6px;"></div>' +
        '</div>' +
      '</div>'
    : '') +

    // SA KPI card
    (emp.category === 'ADVISOR' && p.advisorDetails ? (function(){
      const ad = p.advisorDetails;
      const vPct = ad.vTarget>0?((ad.vehicleCount/ad.vTarget)*100).toFixed(1):0;
      const vCol = ad.hitVehicles?'var(--good)':'var(--bad)';
      const aCol = ad.hitAvgRev?'var(--good)':'var(--bad)';
      const vSh = ad.hitVehicles?0:ad.vTarget-ad.vehicleCount;
      const aSh = ad.hitAvgRev?0:Math.round(ad.arTarget-ad.avgRevPerVehicle);
      return '<div class="card" style="margin-bottom:14px;">' +
        '<div class="card-head"><strong>🚗 Service Advisor KPIs — ' + escapeHtml(m.label||mk) + '</strong>' +
        '<span class="pill ' + (ad.targetMet?'pill-teal':'pill-amber') + '" style="margin-left:8px;font-size:10px;">' + (ad.targetMet?'✓ Both targets met':'✗ Target not met') + '</span></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-top:8px;">' +
          '<div style="padding:12px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);"><div class="kbd-note">Vehicle Target</div><div style="font-size:18px;font-weight:700;">' + ad.vTarget + '</div></div>' +
          '<div style="padding:12px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);"><div class="kbd-note">Vehicles Done</div><div style="font-size:18px;font-weight:700;color:' + vCol + ';">' + ad.vehicleCount + '<span style="font-size:12px;color:var(--ink-soft);">/' + ad.vTarget + '</span></div>' +
            '<div style="font-size:11px;color:' + vCol + ';">' + vPct + '%' + (vSh>0?' · Shortfall: '+vSh:'  · ✓ Met') + '</div></div>' +
          '<div style="padding:12px 14px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);"><div class="kbd-note">Avg Rev Target</div><div style="font-size:18px;font-weight:700;">' + fmt(ad.arTarget) + '</div></div>' +
          '<div style="padding:12px 14px;border-bottom:1px solid var(--line);"><div class="kbd-note">Current Avg Rev</div><div style="font-size:18px;font-weight:700;color:' + aCol + ';">' + fmt(Math.round(ad.avgRevPerVehicle)) + '</div>' +
            '<div style="font-size:11px;color:' + aCol + ';">' + (aSh>0?'Shortfall: '+fmt(aSh)+'/vehicle':'✓ Met') + '</div></div>' +
          '<div style="padding:12px 14px;border-right:1px solid var(--line);"><div class="kbd-note">Total Revenue</div><div style="font-size:16px;font-weight:700;">' + fmt(p.achievement) + '</div></div>' +
          '<div style="padding:12px 14px;border-right:1px solid var(--line);"><div class="kbd-note">Perf Incentive</div><div style="font-size:16px;font-weight:700;color:var(--good);">' + fmt(perfEarned) + '</div></div>' +
          '<div style="padding:12px 14px;"><div class="kbd-note">Status</div>' +
            '<div style="font-size:12px;">' + (ad.hitVehicles?'<span style="color:var(--good);">✓ Vehicles</span>':'<span style="color:var(--bad);">✗ Vehicles</span>') + '</div>' +
            '<div style="font-size:12px;">' + (ad.hitAvgRev?'<span style="color:var(--good);">✓ Avg Rev</span>':'<span style="color:var(--bad);">✗ Avg Rev</span>') + '</div></div>' +
        '</div></div>';
    })() : '') +

    // Detail cards
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">' +
      '<div class="card"><div class="card-head"><strong>📈 Performance</strong></div>' +
        '<table style="width:100%;font-size:12.5px;border-collapse:collapse;">' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Target</td><td style="text-align:right;font-weight:600;' + (emp.targetNote?'cursor:help;border-bottom:1px dotted var(--ink-soft);':'') + '" ' + (emp.targetNote?'title="'+escapeHtml(emp.targetNote)+'"':'') + '>' + fmt(p.target) + '</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);"' + (['TECHNICIAN','ADVISOR','SUPERVISOR','NARODE','WM','SERVICE_MANAGER','BODYSHOP'].includes(emp.category)?' title="LOP achievement without GST" style="cursor:help;border-bottom:1px dotted var(--ink-soft);"':'') + '>Achievement</td><td style="text-align:right;font-weight:600;">' + fmt(p.achievement) + '</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Achv %</td><td style="text-align:right;font-weight:700;color:' + pctCol + ';">' + pct + '%</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Eligibility</td><td style="text-align:right;">' + (p.eligPct||100) + '%</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Status</td><td style="text-align:right;">' + (eligible?'<span style="color:var(--good);">✓ Eligible</span>':'<span style="color:var(--bad);">✗ Not eligible</span>') + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:var(--ink-soft);">Incentive Earned</td><td style="text-align:right;font-weight:700;color:var(--good);">' + fmt(perfEarned) + '</td></tr>' +
        '</table></div>' +
      '<div class="card"><div class="card-head"><strong>🗓 Attendance</strong></div>' +
        '<table style="width:100%;font-size:12.5px;border-collapse:collapse;">' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Leaves Taken</td><td style="text-align:right;font-weight:600;">' + (hr.actualAbsentee||0) + '</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Approved Leaves</td><td style="text-align:right;">' + (hr.approvedLeaves||0) + '</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Late Marks</td><td style="text-align:right;font-weight:600;">' + (hr.lateMarks||0) + '</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Tobacco</td><td style="text-align:right;">' + (hr.tobacco?'<span style="color:var(--bad);">YES ⚠</span>':'<span style="color:var(--good);">NO ✓</span>') + '</td></tr>' +
          '<tr style="border-bottom:1px solid var(--line);"><td style="padding:6px 0;color:var(--ink-soft);">Behavioral Deduction</td><td style="text-align:right;color:var(--bad);">−' + fmt(beh.deductions||0) + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:var(--ink-soft);">Behavioral Earned</td><td style="text-align:right;font-weight:700;color:var(--teal);">' + fmt(behEarned) + '</td></tr>' +
        '</table></div>' +
    '</div>' +

    // Team table
    (team.length > 0 ?
      '<div class="card">' +
        '<div class="card-head"><strong>👥 Team Performance — ' + escapeHtml(m.label||mk) + '</strong><span class="kbd-note" style="margin-left:8px;">' + team.length + ' members</span></div>' +
        '<div class="table-scroll"><table>' +
          '<thead><tr><th>Sr</th><th>Name</th><th>Designation</th><th class="num">Target</th><th class="num">Achievement</th><th class="num">Achv %</th><th class="num">Perf ₹</th><th class="num">Behavioral ₹</th><th class="num">Total ₹</th><th>Leaves</th></tr></thead>' +
          '<tbody>' + team.map((te,i) => {
            const tp=calcEarnedPerformance(te,mk), tb=calcBehavioral(te,mk), thr=hrFor(mk,te.id);
            const tpct=tp.target>0?((tp.achievement/tp.target)*100).toFixed(1):'—';
            const tcol=parseFloat(tpct)>=100?'var(--good)':parseFloat(tpct)>=80?'var(--amber)':'var(--bad)';
            return '<tr><td>'+(i+1)+'</td><td><b>'+escapeHtml(toTitleCase(te.nameHR))+'</b></td><td style="font-size:11px;">'+escapeHtml(te.designation||'—')+'</td>' +
              '<td class="num">'+fmt(tp.target)+'</td><td class="num">'+fmt(tp.achievement)+'</td>' +
              '<td class="num" style="color:'+tcol+';font-weight:700;">'+tpct+'%</td>' +
              '<td class="num" style="color:var(--good);">'+fmt(tp.earned||0)+'</td>' +
              '<td class="num" style="color:var(--teal);">'+fmt(tb.earned||0)+'</td>' +
              '<td class="num" style="font-weight:700;">'+fmt((tp.earned||0)+(tb.earned||0))+'</td>' +
              '<td class="num">'+(thr.actualAbsentee||0)+'</td></tr>';
          }).join('') + '</tbody>' +
          '<tr style="border-top:2px solid var(--line);font-weight:700;background:var(--surface-2);">' +
            '<td colspan="3" style="padding:8px 6px;">Team Total</td>' +
            '<td class="num">'+fmt(team.reduce((s,te)=>s+(calcEarnedPerformance(te,mk).target||0),0))+'</td>' +
            '<td class="num">'+fmt(team.reduce((s,te)=>s+(calcEarnedPerformance(te,mk).achievement||0),0))+'</td>' +
            '<td></td>' +
            '<td class="num" style="color:var(--good);">'+fmt(team.reduce((s,te)=>s+(calcEarnedPerformance(te,mk).earned||0),0))+'</td>' +
            '<td class="num" style="color:var(--teal);">'+fmt(team.reduce((s,te)=>s+(calcBehavioral(te,mk).earned||0),0))+'</td>' +
            '<td class="num">'+fmt(team.reduce((s,te)=>s+(calcEarnedPerformance(te,mk).earned||0)+(calcBehavioral(te,mk).earned||0),0))+'</td>' +
            '<td class="num">'+team.reduce((s,te)=>s+(hrFor(mk,te.id).actualAbsentee||0),0)+'</td>' +
          '</tr>' +
        '</table></div>' +
      '</div>'
    : '') +
    (p.basis ? '<div class="card" style="padding:12px 16px;margin-top:8px;"><span class="kbd-note"><b>Basis:</b> '+escapeHtml(p.basis)+'</span></div>' : '');
}

// ── Personal Dashboard (Employee/Team Lead own view) ──────────────────────
export function renderPersonalDashboard() {
  const emp = linkedEmployee();
  if (!emp) {
    const panel = document.getElementById('tab-dashboard');
    panel.innerHTML = '<div class="card" style="text-align:center;padding:40px;"><div style="font-size:40px;margin-bottom:12px;">👤</div><div style="font-size:16px;font-weight:600;">Account not linked to an employee</div><div class="kbd-note">Ask Admin to link your login in the Users tab.</div></div>';
    return;
  }
  switchEmpTab(emp.id);
}

export function proceedAfterLogin() {
  renderNav();
  paintCurrentUserPill();
  startRealtimeSync();
  runDataMigrations();
  if (isEmployee()) {
    APP.meta.activeTab = 'dashboard';
    renderPersonalDashboard();
    return;
  }
  if (!canViewTab(APP.meta.activeTab)) {
    const first = TABS.find(t => canViewTab(t.id));
    if (first) APP.meta.activeTab = first.id;
  }
  switchTab(APP.meta.activeTab);
}

/* =========================================================================
   Data Migrations — run once after every load
   Safe to run multiple times (idempotent).
   ========================================================================= */
export function runDataMigrations() {
  let dirty = false;

  // ── 0a-pre. Inject HiRise codes into advisor hiriseAliases ──────────────
  const ADVISOR_HIRISE = {
    'VISHAL JAGNNATH AHER':   ['MH060005SE030'],
    'KHANDU BABAN KATARE':    ['MH060005SE026'],
    'SHRAVANKUMAR INGOLE':    ['MH060005SE051'],
    'OMKAR MUTEKAR':          ['MH060005SE056','MH060005SENH0101','MH060005SENH0056'],
    'AKASH SUBHASH NIKALJE':  ['MH060005SENH0115'],
  };
  APP.employees.filter(e => e.category === 'ADVISOR').forEach(e => {
    const codes = ADVISOR_HIRISE[norm(e.nameHR)] || [];
    codes.forEach(code => {
      if (!e.hiriseAliases) e.hiriseAliases = [];
      if (!e.hiriseAliases.map(a=>norm(a)).includes(norm(code))) {
        e.hiriseAliases.push(code); dirty = true;
      }
    });
  });

  // ── 0a. Force-correct targets and categories ─────────────────────────────
  // Bodyshop Technicians
  ['Huzaif Khan Abid Khan','Matin Shabbir Khan'].forEach(name => {
    const e = APP.employees.find(x => norm(x.nameHR) === norm(name));
    if (e && (e.category !== 'BODYSHOP' || e.department !== 'BODYSHOP')) {
      e.category = 'BODYSHOP'; e.department = 'BODYSHOP';
      e.designation = 'BodyShop Technician'; e.target = 100000; dirty = true;
    }
  });
  // Bodyshop Executives
  ['Shaikh Aadil Shaikh Akbar','Pandurang Kurhade'].forEach(name => {
    const e = APP.employees.find(x => norm(x.nameHR) === norm(name));
    if (e) { e.category = 'BODYSHOP'; e.department = 'BODYSHOP';
      e.designation = 'Body Shop Executive'; e.target = 400000; dirty = true; }
  });
  // Painter — no incentive
  const fakr = APP.employees.find(e => norm(e.nameHR).includes('FAKRUDDIN'));
  if (fakr) { fakr.category = 'NONE'; fakr.noIncentive = true; fakr.target = 0; dirty = true; }

  // ── 0a. Force-correct Sandeep Narode and Mukesh Gundle targets ─────────
  const narode = APP.employees.find(e => norm(e.nameHR).includes('NARODE'));
  if (narode && narode.target !== 3000000) {
    narode.target = 3000000;
    narode.targetNote = 'Floor LOP + Bodyshop LOP';
    dirty = true;
  }
  const mukesh = APP.employees.find(e => norm(e.nameHR).includes('GUNDLE') || norm(e.nameHR).includes('MUKESH BALRAM'));
  if (mukesh && mukesh.target !== 3900000) {
    mukesh.target = 3900000;
    mukesh.targetNote = 'Floor LOP + Bodyshop LOP + Spare Counter (OTC) + Standard Part Sales + Counter Lube Sale';
    dirty = true;
  }

  // ── 0. FORCE-FIX Sandeep Bhalerao
  const sandipForce = APP.employees.find(e =>
    norm(e.nameHR).includes('BHALERAO') || norm(e.nameHR).includes('BALERAO') ||
    (norm(e.nameHR).includes('SANDIP') && norm(e.nameHR).includes('LAXMAN') && norm(e.category||'') === 'TECHNICIAN') ||
    (norm(e.nameHR).includes('SANDEEP') && norm(e.nameHR).includes('LAXMAN') && norm(e.category||'') === 'TECHNICIAN')
  );
  if (sandipForce) {
    const correctName = 'SANDEEP BHALERAO';
    const allAliases = [
      'SANDEEP BHALERAO','SANDIP BHALERAO','SANDIP LAXMAN BHALERAO',
      'SANDEEP LAXMAN BHALERAO','BALERAO SANDEEP','BHALERAO SANDIP',
      'BHALERAO SANDEEP','MH060005SENH0097','MH060005SENH0121',
      'SANDIP LAXMAN BALERAO','BALERAO SANDIP','SANDEEP BALERAO',
      'SANDIP BALERAO','SANDEEP LAXMAN BALERAO'
    ];
    if (sandipForce.nameHR !== correctName) { sandipForce.nameHR = correctName; dirty = true; }
    const existing = new Set((sandipForce.hiriseAliases || []).map(a => norm(a)));
    allAliases.forEach(a => {
      if (!existing.has(norm(a))) {
        if (!sandipForce.hiriseAliases) sandipForce.hiriseAliases = [];
        sandipForce.hiriseAliases.push(a); dirty = true;
      }
    });
    if (!APP.hiriseMap) APP.hiriseMap = {};
    ['MH060005SENH0097','MH060005SENH0121'].forEach(code => {
      const k = code + '_tech';
      if (!APP.hiriseMap[k] || APP.hiriseMap[k].empId !== sandipForce.id) {
        APP.hiriseMap[k] = { code, hiriseName: correctName, type: 'tech', empId: sandipForce.id };
        scheduleSave('hiriseMap', () => APP.hiriseMap); dirty = true;
      }
    });
  }

  // ── 1. Omkar aliases — both entries are the same person, cross-link them
  //    "Omkar Mutekar" (short, appears in job cards) ↔ "Omkar kamlesh Mutekar" (full name)
  const omkarShort = APP.employees.find(e => norm(e.nameHR) === norm('Omkar Mutekar'));
  const omkarFull  = APP.employees.find(e =>
    norm(e.nameHR) === norm('Omkar kamlesh Mutekar') ||
    norm(e.nameHR) === norm('Omkar Kashinath Mutekar')
  );
  const addAlias = (emp, alias) => {
    if (!emp) return;
    if (!emp.hiriseAliases) emp.hiriseAliases = [];
    if (!emp.hiriseAliases.includes(alias)) { emp.hiriseAliases.push(alias); dirty = true; }
  };
  const omkarAliases = [
    'Omkar Mutekar','Omkar kamlesh Mutekar','Omkar Kashinath Mutekar',
    'OMKAR MUTEKAR','OMKAR KAMLESH MUTEKAR','OMKAR KASHINATH MUTEKAR',
    'Omkar K Mutekar','OMKAR K MUTEKAR','MH060005SE056','MH060005SENH0101','MH060005SENH0056'
  ];
  if (omkarShort) omkarAliases.forEach(a => addAlias(omkarShort, norm(a)));
  if (omkarFull)  omkarAliases.forEach(a => addAlias(omkarFull,  norm(a)));
  if (!APP.hiriseMap) APP.hiriseMap = {};
  ['MH060005SE056','MH060005SENH0101'].forEach(code => {
    const k = code + '_advisor';
    if (omkarShort && (!APP.hiriseMap[k] || APP.hiriseMap[k].empId !== omkarShort.id)) {
      APP.hiriseMap[k] = { code, hiriseName: 'Omkar Mutekar', type: 'advisor', empId: omkarShort.id };
      scheduleSave('hiriseMap', () => APP.hiriseMap); dirty = true;
    }
  });

  // ── 2. Sandip Laxman Bhalerao — multiple name and spelling variations + HiRise code
  const sandip = APP.employees.find(e =>
    norm(e.nameHR).includes(norm('BHALERAO')) || norm(e.nameHR).includes(norm('BHALERAW'))
  );
  if (sandip) {
    const sandipAliases = [
      'SANDIP BHALERAO', 'SANDEEP BHALERAO', 'SANDIP LAXMAN BHALERAO',
      'SANDEEP LAXMAN BHALERAO', 'BALERAO SANDEEP', 'BHALERAO SANDIP',
      'BHALERAO SANDEEP', 'MH060005SENH0097', 'MH060005SENH0121'
    ];
    sandipAliases.forEach(a => addAlias(sandip, norm(a)));
    // Also add correct HiRise mapping
    if (!APP.hiriseMap) APP.hiriseMap = {};
    const key = 'MH060005SENH0097_tech';
    if (!APP.hiriseMap[key] || APP.hiriseMap[key].empId !== sandip.id) {
      APP.hiriseMap[key] = { code: 'MH060005SENH0097', hiriseName: 'Sandip Laxman Bhalerao', type: 'tech', empId: sandip.id };
      scheduleSave('hiriseMap', () => APP.hiriseMap);
      dirty = true;
    }
  }

  // ── 2. HR-Sheet designation sync — ensure emp.designation is never blank
  //    If an employee has no designation set, fall back to CATEGORY_LABELS
  //    (This runs passively; actual HR-Sheet upload will override with real designation)
  for (const emp of APP.employees) {
    if (!emp.designation && emp.category && CATEGORY_LABELS[emp.category] && CATEGORY_LABELS[emp.category] !== '—') {
      emp.designation = CATEGORY_LABELS[emp.category];
      dirty = true;
    }
  }

  // ── 3. Apply all HiRise mappings as aliases to employees
  if (APP.hiriseMap && Object.keys(APP.hiriseMap).length > 0) {
    for (const v of Object.values(APP.hiriseMap)) {
      if (v.empId) { applyHiriseAlias(v.empId, v); dirty = true; }
    }
  }

  if (dirty) scheduleSave('employees', () => APP.employees);
}

export function paintCurrentUserPill() {
  const el = document.getElementById('sidebarFoot');
  if (!el) return;
  const u = currentUser();
  if (!u) { el.innerHTML = ''; return; }
  const roleInfo = getRoleInfo(u.role);
  el.innerHTML = `
    <div class="current-user-pill">
      <div>
        <div style="font-weight:600;font-size:12.5px;">${escapeHtml(u.name)}</div>
        ${u.designation ? `<div style="font-size:10.5px;color:#83806f;">${escapeHtml(u.designation)}</div>` : ''}
      </div>
      <span class="role-badge ${roleInfo.color}">${roleInfo.label}</span>
      <button class="logout-link" id="logoutBtn">Log out</button>
    </div>`;
  document.getElementById('logoutBtn').addEventListener('click', logout);
}
