/* ---------- Global state ---------- */
export const APP = {
  employees: [],
  months: {},
  settings: null,
  meta: { currentMonth: null, activeTab: 'dashboard' },
  users: [],
  oldData: null,
  jobCardArchive: null,
  reportingChain: {},
  customRoles: []   // admin-created designations with custom permissions
};
// Session is intentionally NOT persisted to storage — every fresh load of the
// artifact requires logging in again, since this is a shared browser-based tool.
export const SESSION = { userId: null };

export const DEFAULT_SETTINGS = {
  leaveAmount: 200,
  lateMarkAmount: 200,
  tobaccoAmount: 200,
  tobaccoMaleOnly: true,
  complaintBaseAmount: 200,
  complaintPenaltyAmount: -50,
  complaintPenaltyAtCount: 1,
  maxAbsenteeForLeaveComponent: 4,
  complaintEligibleCategories: ['TECHNICIAN'],
  leaveDeductionSlabs: [
    { upTo: 2, inclusive: true, pct: 100 },
    { upTo: 3, inclusive: false, pct: 75 },
    { upTo: 4, inclusive: true, pct: 50 }
  ],
  defaultWmTarget: 3500000,
  bodyshopIncentiveLabel: '50% of Service Supervisor rate',
  warrantyFlatAmount: 750,
  // Service Advisor incentive criteria
  advisorVehicleTarget: 500,       // minimum vehicles per month
  advisorAvgRevTarget: 1300,       // minimum avg revenue per vehicle (₹)
  advisorPerVehicleRate: 1,        // ₹ per vehicle if target met
  advisorRevPct: 1,
  categoryEligibility: { TECHNICIAN:100, ADVISOR:100, SUPERVISOR:100, NARODE:100, WM:100, SERVICE_MANAGER:100, STORE_MANAGER:100 },
};

export const CATEGORY_LABELS = {
  NONE:'—', TECHNICIAN:'Technician', ADVISOR:'Service Advisor', SUPERVISOR:'Supervisor',
  NARODE:'Asst. Manager Floor', WM:'Workshop Manager', WARRANTY:'Warranty', BODYSHOP:'Bodyshop',
  SERVICE_MANAGER:'Service Manager', STORE_MANAGER:'Store Manager'
};
export const TABS = [
  { id: 'hrsheet',      label: 'HR-Sheet',              icon: '👤', section: 'Monthly Data' },
  { id: 'revenue',      label: 'Job Card & Revenue',    icon: '₹', section: 'Monthly Data' },
  { id: 'otc',          label: 'Sales Tax - OTC',       icon: '🏪', section: 'Monthly Data' },
  { id: 'warrantydata', label: 'Warranty Data',         icon: '🛡', section: 'Monthly Data' },
  { id: 'complaints',   label: 'HMSI Complaints',       icon: '⚠', section: 'Monthly Data' },
  { id: 'bodyshop',     label: 'Bodyshop',              icon: '🔧', section: 'Monthly Data' },
  { id: 'rates',        label: 'Incentive Rates',       icon: '%',  section: 'Monthly Data' },
  { id: 'olddata',      label: 'Old Data Archive',      icon: '⌛', section: 'Monthly Data' },
  { id: 'dashboard',    label: 'Dashboard',             icon: '◆',  section: 'Overview' },
  { id: 'behavioral',   label: 'Behavioral Incentive',  icon: '✓',  section: 'Overview' },
  { id: 'performance',  label: 'Performance Incentive', icon: '▲',  section: 'Overview' },
  { id: 'customers',    label: 'Customers',             icon: '🏍', section: 'Database' },
  { id: 'employees',    label: 'Employees',             icon: '☰',  section: 'Database' },
  { id: 'reporting',    label: 'Reporting Structure',   icon: '⬡',  section: 'Database' },
  { id: 'hirisemap',    label: 'HiRise Mapping',        icon: '🔗', section: 'Database' },
  { id: 'users',        label: 'Users',                 icon: '⚿',  section: 'Configuration', adminOnly: true },
  { id: 'settings',     label: 'Rules & Settings',      icon: '⚙',  section: 'Configuration', adminOnly: true },
];

export const DEFAULT_CATEGORY_RATES = {
  TECHNICIAN: 1, ADVISOR: 1, SUPERVISOR: 0.4, NARODE: 0.4, WM: 0.4,
  SERVICE_MANAGER: 0.4, STORE_MANAGER: 0.4
};
export const DEFAULT_CATEGORY_ELIGIBILITY = {
  TECHNICIAN: 80, ADVISOR: 90, SUPERVISOR: 85, NARODE: 100, WM: 90,
  SERVICE_MANAGER: 90, STORE_MANAGER: 90
};
