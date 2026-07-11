import { APP } from '../state.js';
import { escapeHtml, toast } from '../utils.js';
import { scheduleSave } from '../store.js';
import { isAdmin } from '../auth.js';

// Default content — pre-filled documentation of how every role's target,
// achievement and incentive are calculated. Admin can edit this freely from
// the page itself; edits are saved to Supabase (processInfo key) and are
// visible to every user the admin has granted "Process Info" view access to
// (Users tab → permissions checkboxes).
export const DEFAULT_PROCESS_INFO_TEXT =
`WORKSHOP INCENTIVE — HOW EACH ROLE IS CALCULATED

This page explains, for every designation, where the Target comes from, where
the Achievement comes from, and how the Incentive amount is worked out. Admin
can edit this page any time using the Edit button below.

────────────────────────────────────────
GENERAL RULE — Eligibility % and Incentive %
────────────────────────────────────────
Every performance-based category (Technician, Advisor, Floor Supervisor, Asst.
Manager Floor, Workshop Manager, Service Manager, Store Manager) uses the same
formula unless noted otherwise below:

  Eligible?   Achievement% >= Eligibility Threshold%  (set per category on the
              Incentive Rates tab)
  If eligible: Incentive Earned = Achievement x Incentive Rate%
  If not eligible: Incentive Earned = ₹0

These two settings (Eligibility % and Incentive %) reset to fixed defaults at
the start of every new month — an admin's change only applies to the month it
was made in, never carries forward:
  Technician            100% eligibility, 1% incentive
  Floor Supervisor      100% eligibility, 0.4% incentive
  Asst. Manager Floor   100% eligibility, 0.1% incentive
  Workshop Manager      100% eligibility, 0.1% incentive
  Service Manager       100% eligibility, 0.4% incentive
  Store Manager         100% eligibility, 0.4% incentive

────────────────────────────────────────
TECHNICIAN
────────────────────────────────────────
Target:      6-month historical average (Jan-Jun or Jul-Dec of the previous
             year's Job Card data for that technician), or an admin manual
             override.
Achievement: Job Card Log Sheet revenue matched by Technician Name — Labour +
             Parts + Lubes revenue, with GST (18%) removed.
Incentive:   General rule above (default 100% eligibility, 1% rate).

────────────────────────────────────────
SERVICE ADVISOR
────────────────────────────────────────
Target:      Vehicle Target (default 500 vehicles/month) x Avg Revenue Target
             (default ₹1,300/vehicle) — both set in Rules & Settings.
Achievement: Job Card revenue matched by Service Advisor Name/ID.
Incentive:   Both the vehicle-count target AND the avg-revenue/vehicle target
             must be met — if either is missed, incentive is ₹0. If both are
             met: (vehicles x ₹ per vehicle) + (revenue x % of revenue), rates
             set in Rules & Settings.
             Note: the Advisor Dashboard displays this dual-target figure for
             reference, but the amount actually paid out (shown on Performance
             Incentive / final payout) uses the General Rule above instead
             (default 100% eligibility, 1% rate on total achievement).

────────────────────────────────────────
FLOOR SUPERVISOR
────────────────────────────────────────
Target/Achievement: Sum of the Job Card target/revenue of every technician
             whose "Supervisor" field (set on the Employees tab) points to
             this supervisor.
Incentive:   General rule above (default 100% eligibility, 0.4% rate).

────────────────────────────────────────
ASST. MANAGER FLOOR
────────────────────────────────────────
Target:      Manual override if set, else automatically MAX(sum of every
             non-Bodyshop technician's target, sum of every non-Bodyshop
             Floor Supervisor's team target).
Achievement: Non-Bodyshop technicians' Job Card revenue + Bodyshop department
             revenue (Advisors are excluded — they'd double-count the same
             job cards as technicians).
Incentive:   General rule above (default 100% eligibility, 0.1% rate).

────────────────────────────────────────
WORKSHOP MANAGER
────────────────────────────────────────
(No separate dashboard — shown folded into the Service Manager Dashboard.)
Target:      Manual override, or the admin-set Workshop Manager Target
             (Rules & Settings, default ₹35,00,000).
Achievement: Whole-workshop Job Card revenue (Labour + Parts + Lubes, GST
             removed).
Incentive:   General rule above (default 100% eligibility, 0.1% rate).

────────────────────────────────────────
SERVICE MANAGER
────────────────────────────────────────
Target:      Admin-set manual target (per employee), or manual override.
Achievement: Whole-workshop Job Card Revenue + OTC Revenue (Basic Price,
             Order Type = OTC Sales, Part Category = STD - Standard).
Incentive:   General rule above (default 100% eligibility, 0.4% rate).

────────────────────────────────────────
STORE MANAGER (SPARE PARTS)
────────────────────────────────────────
Target:      Admin-set Workshop Manager Target field (shared setting), or
             manual override.
Achievement: OTC Revenue only (Basic Price, Order Type = OTC Sales, Part
             Category = STD - Standard, excl. tax).
Incentive:   General rule above (default 100% eligibility, 0.4% rate).

────────────────────────────────────────
WARRANTY
────────────────────────────────────────
Target/Achievement: Manually entered on the Warranty Data tab (FSC Target/
             Achievement + Warranty Target/Achievement), auto-added to from
             Warranty Data CSV uploads.
Incentive:   NOT the general rule — a flat amount (admin-set, default ₹750)
             is paid only if "Target achieved this month" is checked for that
             month; otherwise ₹0.

────────────────────────────────────────
BODYSHOP
────────────────────────────────────────
Target:      Executives (2 staff) share a combined ₹4,00,000 department
             target. Each Technician has an individual ₹1,00,000 target.
             Admin can edit each figure on the Bodyshop Dashboard.
Achievement: Job Card revenue matched by Technician Name — Executives get the
             COMBINED total of every Bodyshop employee's job card revenue;
             Technicians get only their own individual total.
Incentive:   NOT the general rule — a tiered flat-rate:
               Executives:   < ₹3,00,000            -> ₹0
                             ₹3,00,000 - ₹4,00,000   -> flat ₹1,500 each
                             > ₹4,00,000             -> ₹600 x total-lacs each
               Technicians:  < ₹1,00,000             -> ₹0
                             >= ₹1,00,000             -> ₹500 x individual-lacs
             The Painter designation gets no incentive at all.

────────────────────────────────────────
CRE / CRM / HR
────────────────────────────────────────
No Target/Achievement — these roles only receive the Behavioral Incentive
below; there is no performance/revenue component for them.

────────────────────────────────────────
BEHAVIORAL INCENTIVE (applies to every employee, every category)
────────────────────────────────────────
Independent of everything above. Based on Leaves, Late Marks, Tobacco Use and
HMSI Complaints — amounts, thresholds and deduction slabs are all set on the
Rules & Settings tab.
`;

export function renderProcessInfo(containerId) {
  containerId = containerId || 'tab-processinfo';
  const panel = document.getElementById(containerId);
  if (!panel) return;
  if (!APP.processInfo) APP.processInfo = { text: DEFAULT_PROCESS_INFO_TEXT, updatedAt: null };
  const canEdit = isAdmin();
  const info = APP.processInfo;

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <strong>📖 Process Info — How the Incentive Scheme Works</strong>
        ${canEdit ? `<button class="btn secondary" id="piEditBtn" style="font-size:12px;">✏️ Edit</button>` : `<span class="pill pill-amber" style="font-size:10px;">Read-only</span>`}
      </div>
      <p class="kbd-note" style="margin-top:-6px;margin-bottom:14px;">Reference page — explains, per designation, where Target and Achievement come from and how Incentive is calculated. ${canEdit ? 'You can edit this content; who else can view this page is controlled in the Users tab.' : 'Admin controls who can view this page and its content.'}</p>
      <div id="piViewMode">
        <div style="white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;background:var(--surface-2);border-radius:8px;padding:16px 20px;">${escapeHtml(info.text)}</div>
        ${info.updatedAt ? `<div class="footer-note" style="margin-top:8px;">Last updated: ${new Date(info.updatedAt).toLocaleString()}</div>` : ''}
      </div>
      ${canEdit ? `
      <div id="piEditMode" style="display:none;">
        <textarea id="piTextarea" style="width:100%;min-height:480px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;padding:16px 20px;border:1px solid var(--line);border-radius:8px;">${escapeHtml(info.text)}</textarea>
        <div style="margin-top:10px;display:flex;gap:8px;">
          <button class="btn" id="piSaveBtn">✓ Save Changes</button>
          <button class="btn secondary" id="piCancelBtn">Cancel</button>
          <button class="btn ghost" id="piResetBtn" style="margin-left:auto;">Reset to Default Text</button>
        </div>
      </div>` : ''}
    </div>`;

  if (!canEdit) return;

  const viewMode = document.getElementById('piViewMode');
  const editMode = document.getElementById('piEditMode');
  document.getElementById('piEditBtn').addEventListener('click', () => {
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
  });
  document.getElementById('piCancelBtn').addEventListener('click', () => {
    renderProcessInfo(containerId);
  });
  document.getElementById('piResetBtn').addEventListener('click', () => {
    document.getElementById('piTextarea').value = DEFAULT_PROCESS_INFO_TEXT;
  });
  document.getElementById('piSaveBtn').addEventListener('click', () => {
    const newText = document.getElementById('piTextarea').value;
    APP.processInfo = { text: newText, updatedAt: new Date().toISOString() };
    scheduleSave('processInfo', () => APP.processInfo);
    toast('Process Info updated');
    renderProcessInfo(containerId);
  });
}
