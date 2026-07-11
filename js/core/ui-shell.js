import { APP, TABS } from './state.js';
import { canViewTab, isEmployee, isAdmin, currentUser, linkedEmployee } from './auth.js';
import { escapeHtml, toTitleCase, toast, fmt, csvSafe, downloadFile, activeEmployees } from './utils.js';
import { scheduleSave } from './store.js';
import { ensureMonth } from './months.js';
import { calcAllFinalRows } from './incentive-engine.js';
import { getJobCardBucket } from './job-card-data.js';
import { renderRevenue } from './job-card-data.js';
import { renderOtcTab } from './otc-data.js';
import { renderBehavioralIncentive, renderPerformanceIncentive } from './incentive-views.js';
import { renderEmployees, renderReportingTab, renderHiriseMapTab } from './admin-tabs/employees.js';
import { renderRates, renderOldData } from './admin-tabs/rates-archive.js';
import { renderUsers } from './admin-tabs/users.js';
import { renderSettings } from './admin-tabs/settings.js';
import { renderAttendance, renderComplaints } from './import-handlers.js';
import { switchEmpTab } from './personal-dashboard.js';
import { wireMonthControls } from './boot.js';
import { renderTechnicianDashboard } from '../roles/technician.js';
import { renderAdvisorDashboard } from '../roles/advisor.js';
import { renderSupervisorDashboard } from '../roles/supervisor.js';
import { renderCREDashboard, renderCustomers } from '../roles/cre-crm.js';
import { renderCRMDashboard } from '../roles/cre-crm.js';
import { renderSparePartsDashboard } from '../roles/store-manager.js';
import { renderServiceManagerDashboard } from '../roles/service-manager.js';
import { renderHRDashboard } from '../roles/hr.js';
import { renderBodyshopDashboard, renderBodyshopSection } from '../roles/bodyshop.js';
import { renderWarrantyDashboard, renderWarrantyDataSection } from '../roles/warranty.js';

/* =========================================================================
   Modal / nav helpers
   ========================================================================= */
export function openModal(html) {
  document.getElementById('modalBody').innerHTML = html;
  document.getElementById('modalBg').classList.add('show');
}
export function closeModal() {
  document.getElementById('modalBg').classList.remove('show');
  document.getElementById('modalBody').innerHTML = '';
}
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'modalBg') closeModal();
});

export function renderNav() {
  const sections = [], seen = {};
  const visible = TABS.filter(t => canViewTab(t.id));
  visible.forEach(t => { if (!seen[t.section]) { seen[t.section] = true; sections.push(t.section); } });
  let html = '';
  for (const sec of sections) {
    html += `<div class="nav-section-label">${escapeHtml(sec)}</div>`;
    for (const t of visible.filter(x => x.section === sec)) {
      html += `<button class="nav-btn${APP.meta.activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
        <span class="nav-icon">${t.icon}</span><span>${escapeHtml(t.label)}</span></button>`;
    }
    // INDIVIDUAL section: Admin and Service Manager only (not Owner)
    if (sec === 'Overview' && !isEmployee()) {
      const u = currentUser();
      const linkedEmp = linkedEmployee();
      const isServiceMgr = linkedEmp && linkedEmp.category === 'SERVICE_MANAGER';
      const showEmpNav = isAdmin() || isServiceMgr;
      if (showEmpNav) {
        const activeEmps = activeEmployees().sort((a,b) => a.srNo - b.srNo);
        if (activeEmps.length > 0) {
          html += '<div class="nav-section-label" style="font-size:9px;letter-spacing:.08em;padding-left:16px;color:var(--ink-soft);opacity:.7;margin-top:6px;">INDIVIDUAL</div>';
          html += '<div id="empNavList" style="max-height:260px;overflow-y:auto;scrollbar-width:thin;">';
          for (const e of activeEmps) {
            const isActive = APP.meta.activeTab === 'emp_' + e.id;
            html += `<button class="nav-btn${isActive?' active':''}" data-emptab="${e.id}" style="padding:5px 10px 5px 18px;font-size:11.5px;">
              <span class="nav-icon" style="font-size:10px;">👤</span>
              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;">${escapeHtml(toTitleCase(e.nameHR))}</span>
            </button>`;
          }
          html += '</div>';
        }
      }
    }
  }
  document.getElementById('navList').innerHTML = html;
  document.querySelectorAll('.nav-btn[data-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.querySelectorAll('.nav-btn[data-emptab]').forEach(btn => btn.addEventListener('click', () => switchEmpTab(btn.dataset.emptab)));
}

const TAB_SUBTITLES = {
  dashboard: 'Lean monthly summary — full breakdowns live on the Behavioral and Performance pages',
  behavioral: 'Leave, late mark, tobacco and complaint bifurcation for the selected month',
  performance: 'Target, achievement and incentive % bifurcation for the selected month',
  customers: 'Customer and vehicle database — search, add, and manage service history',
  employees: 'Manage the employee roster, categories and Hirise name aliases',
  reporting: 'Map every employee\'s reporting chain — who they report to at each level up to MD',
  hrsheet: 'Upload attendance, leave, late mark and tobacco data for the selected month',
  revenue: 'Upload the Job Card Log — drives achievement for technicians, advisors and workshop manager',
  warrantydata: 'FSC and Warranty invoice data for the selected month',
  complaints: 'HMSI complaint export — determines the complaint component of behavioral incentive',
  bodyshop: 'Manually entered bodyshop revenue and incentive for the selected month',
  rates: 'Performance incentive percentage per employee for the selected month',
  olddata: 'One-time import of historical spreadsheet exports — kept separate from the live monthly engine',
  users: 'Admin-only — create logins and assign roles',
  settings: 'Edit the rules, amounts and slabs the calculations are based on'
};

export function switchTab(id) {
  if (id && id.startsWith('emp_')) { switchEmpTab(id.replace('emp_','')); return; }
  // Restore normal month selector wiring when leaving emp dashboard
  wireMonthControls();
  if (!canViewTab(id)) {
    toast('You don\'t have access to that section', true);
    const first = TABS.find(t => canViewTab(t.id));
    id = first ? first.id : 'dashboard';
  }
  if (['master','attendance','special'].includes(id)) id = 'hrsheet';
  if (['tobacco','vehiclein'].includes(id)) id = 'hrsheet';
  APP.meta.activeTab = id;
  scheduleSave('meta', () => APP.meta);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.tab-panel').forEach(p => p.style.display = (p.id === 'tab-' + id) ? 'block' : 'none');
  const tNow = TABS.find(x => x.id === id);
  document.getElementById('topbarTitle').textContent = tNow ? tNow.label : '';
  document.getElementById('topbarSub').textContent = TAB_SUBTITLES[id] || '';
  renderTab(id);
}

export function renderTab(id) {
  ensureMonth(APP.meta.currentMonth);
  if      (id === 'dashboard')    renderDashboard();
  else if (id === 'behavioral')   renderBehavioralIncentive();
  else if (id === 'performance')  renderPerformanceIncentive();
  else if (id === 'customers')    renderCustomers();
  else if (id === 'employees')    renderEmployees();
  else if (id === 'reporting')    renderReportingTab();
  else if (id === 'hirisemap')    renderHiriseMapTab();
  else if (id === 'hrsheet')      renderAttendance('tab-hrsheet');
  else if (id === 'revenue')      renderRevenue('tab-revenue');
  else if (id === 'otc')          renderOtcTab('tab-otc');
  else if (id === 'warrantydata') renderWarrantyDataSection('tab-warrantydata');
  else if (id === 'complaints')   renderComplaints('tab-complaints');
  else if (id === 'bodyshop')     renderBodyshopSection('tab-bodyshop');
  else if (id === 'rates')        renderRates('tab-rates');
  else if (id === 'olddata')      renderOldData();
  else if (id === 'users')        renderUsers();
  else if (id === 'settings')     renderSettings();
}

export function rerenderActiveTab() { renderTab(APP.meta.activeTab); }

/* =========================================================================
   Sub-Dashboard System — 10 role-based dashboards
   Each reads from APP.employees, APP.months, APP.jobCardArchive
   ========================================================================= */
let activeDashboard = null; // null = home page
export function setActiveDashboard(id) { activeDashboard = id; }

const SUB_DASHBOARDS = [
  { id:'technician',       icon:'🔧', label:'Technician',          color:'#E85D04', desc:'Target vs achievement, incentive earned per technician' },
  { id:'advisor',          icon:'🎯', label:'Advisor',             color:'#7209B7', desc:'Job card revenue, customer handling, incentive per advisor' },
  { id:'supervisor',       icon:'👥', label:'Floor Supervisor',     color:'#0077B6', desc:'Team targets, team achievement, supervisor incentive' },
  { id:'cre',              icon:'📞', label:'CRE',                  color:'#2D6A4F', desc:'Customer Relation Executive — complaints, behavioral incentive' },
  { id:'crm',              icon:'🤝', label:'CRM',                  color:'#6D6875', desc:'Customer follow-ups, customer database stats' },
  { id:'spareparts',       icon:'🏪', label:'Spare Parts',         color:'#B5451B', desc:'OTC revenue, Store Manager achievement (Chetan)' },
  { id:'servicemanager',   icon:'⭐', label:'Service Manager',      color:'#344E41', desc:'Workshop KPIs + OTC, total revenue, all team summary (Mukesh)' },
  { id:'hr',               icon:'📋', label:'HR & Attendance',      color:'#457B9D', desc:'Leave, late marks, tobacco, month-wise attendance trends' },
  { id:'bodyshop',         icon:'🚗', label:'Bodyshop',            color:'#6B4226', desc:'Bodyshop team targets, achievement, revenue' },
  { id:'warranty',         icon:'🛡', label:'Warranty',            color:'#1D3557', desc:'Warranty job cards, targets, achievement' },
];

function renderSubDashboardHome(panel, mk, m) {
  const bucket = getJobCardBucket(mk);
  const otcTotal = m.otc ? m.otc.total : 0;
  const activeEmps = activeEmployees().length;
  const allRows = calcAllFinalRows(mk, false);
  const totalPayout = allRows.reduce((s, r) => s + r.finalAmount, 0);

  panel.innerHTML = `
    <div style="margin-bottom:20px;">
      <div style="font-size:22px;font-weight:700;margin-bottom:4px;">Dashboards — ${escapeHtml(m.label)}</div>
      <div class="kbd-note">Click a dashboard to view role-specific KPIs. All data is live from the selected month.</div>
    </div>
    <!-- Quick Stats -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">
      <div class="stat"><div class="label">Active Employees</div><div class="value">${activeEmps}</div></div>
      <div class="stat"><div class="label">Workshop Revenue</div><div class="value" style="font-size:16px;">${fmt(bucket ? bucket.workshop.total : 0)}</div></div>
      <div class="stat"><div class="label">OTC Revenue</div><div class="value" style="font-size:16px;">${fmt(otcTotal)}</div></div>
      <div class="stat"><div class="label">Total Payout</div><div class="value" style="font-size:16px;">${fmt(totalPayout)}</div></div>
    </div>
    <!-- Dashboard Cards Grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;">
      ${SUB_DASHBOARDS.map(d => `
        <div class="dash-card" data-subdash="${d.id}" style="border-radius:12px;border:1.5px solid var(--line);padding:20px;cursor:pointer;transition:box-shadow .15s,transform .15s;background:var(--paper-raised);"
             onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)';this.style.transform='translateY(-2px)'"
             onmouseout="this.style.boxShadow='';this.style.transform=''">
          <div style="font-size:28px;margin-bottom:8px;">${d.icon}</div>
          <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:${d.color};">${d.label} Dashboard</div>
          <div class="kbd-note" style="font-size:11.5px;">${d.desc}</div>
          <div style="margin-top:12px;font-size:11px;color:${d.color};font-weight:600;">View →</div>
        </div>
      `).join('')}
    </div>`;

  panel.querySelectorAll('[data-subdash]').forEach(card => {
    card.addEventListener('click', () => {
      setActiveDashboard(card.dataset.subdash);
      renderDashboard();
    });
  });
}

export function dashBack(panel) {
  return `<button class="btn secondary" id="dashBackBtn" style="margin-bottom:16px;font-size:12px;">← All Dashboards</button>`;
}

// Thin footer line explaining how the figures above were calculated —
// appended at the bottom of a dashboard, wherever a basis explanation applies.
export function dashBasis(text) {
  return `<div class="kbd-note" style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);">ℹ Basis: ${text}</div>`;
}

export function renderDashboard() {
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const panel = document.getElementById('tab-dashboard');

  // Route to sub-dashboard if one is active
  if (activeDashboard) {
    const routes = {
      technician:     renderTechnicianDashboard,
      advisor:        renderAdvisorDashboard,
      supervisor:     renderSupervisorDashboard,
      cre:            renderCREDashboard,
      crm:            renderCRMDashboard,
      spareparts:     renderSparePartsDashboard,
      servicemanager: renderServiceManagerDashboard,
      hr:             renderHRDashboard,
      bodyshop:       renderBodyshopDashboard,
      warranty:       renderWarrantyDashboard,
    };
    if (routes[activeDashboard]) { routes[activeDashboard](panel, mk, m); return; }
  }

  renderSubDashboardHome(panel, mk, m);
}

export function exportDashboardCsv(rows, m) {
  const headers = ['Sr', 'Name', 'Designation', 'Behavioral Incentive', 'Performance Incentive',
    'Total Before Deduction', 'Absentee Days', 'Deduction %', 'Final Amount', 'Remark'];
  const lines = [headers.join(',')];
  rows.forEach((r, i) => {
    const vals = [i + 1, csvSafe(r.emp.nameHR), csvSafe(r.emp.designation),
      r.behavioral.total, r.emp.category === 'NONE' ? '' : r.perf.earned,
      r.totalBeforeDeduction, r.hr.actualAbsentee, r.deductionPct,
      r.finalAmount, csvSafe(r.remark)];
    lines.push(vals.join(','));
  });
  downloadFile(`incentive-summary-${m.label.replace(/\s+/g, '-')}.csv`, lines.join('\n'), 'text/csv');
}
