import { APP } from './state.js';
import { money, fmt, escapeHtml, parseDateFlexible, monthKeyOf, monthLabelOf, toast, confirmDestructive } from './utils.js';
import { scheduleSave } from './store.js';
import { ensureMonth } from './months.js';
import { canDo, isAdmin } from './auth.js';
import { rerenderActiveTab } from './ui-shell.js';

/* =========================================================================
   Sales Tax — OTC Tab — shared upload surface.
   Parses Sales Tax CSV:
     Col D  = Invoice Date   → filter by selected month
     Order Type column       → keep only rows where Order Type === "OTC Sales"
     Col X  = Basic Price    → excl. tax, summed as OTC revenue
   Result stored in m.otc = { total, count, fileName, uploadedAt }
   Used by: SERVICE_MANAGER (JC + OTC) and STORE_MANAGER (OTC only)
   ========================================================================= */
export function renderOtcTab(containerId) {
  containerId = containerId || 'tab-otc';
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const panel = document.getElementById(containerId);
  if (!panel) return;
  const canUp = canDo('upload_data') || isAdmin();

  const monthsWithData = Object.keys(APP.months)
    .filter(k => APP.months[k].otc && APP.months[k].otc.total > 0).sort();
  const hasAnyOtcData = monthsWithData.length > 0;
  const hasThisMonth = m.otc && m.otc.total > 0;

  panel.innerHTML = `
    <div class="card">
      <div class="card-head"><strong>Sales Tax — OTC</strong></div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Upload your Sales Tax CSV here — every month's OTC revenue is read automatically from <b>Invoice Date</b>, keeping only rows where <b>Order Type</b> is <b>OTC Sales</b>, summed from <b>Basic Price</b> (excl. tax). Each upload is merged into what's already stored: invoices already seen (matched by Order Number) are skipped automatically, so re-uploading the same file or an overlapping export never double-counts.</p>
      ${canUp ? `
      <label class="upload-zone" for="otcFileInput">
        <div class="icon">↑</div>
        <div><b>Click to choose CSV</b> or drag it here</div>
        <div class="hint">Sales-Tax.csv</div>
      </label>
      <input type="file" id="otcFileInput" accept=".csv" style="display:none;">
      <div id="otcUploadStatus" style="font-size:12px;margin-top:8px;min-height:18px;"></div>
      ` : `<div class="banner"><span>🔒</span><div>You don't have permission to upload data here. Contact an admin if you need this changed.</div></div>`}
      ${hasAnyOtcData ? `
        <div class="divider"></div>
        <div class="stat-row">
          <div class="stat"><div class="label">File</div><div class="value" style="font-size:13px;">${escapeHtml(m.otc.fileName || '—')}</div></div>
          <div class="stat"><div class="label">Data Period</div><div class="value" style="font-size:14px;">${m.otc.dateRange ? new Date(m.otc.dateRange.from).toLocaleDateString('en-GB') + ' – ' + new Date(m.otc.dateRange.to).toLocaleDateString('en-GB') : '—'}</div></div>
          <div class="stat"><div class="label">Months Covered</div><div class="value">${monthsWithData.length}</div></div>
          <div class="stat"><div class="label">OTC Invoices in ${escapeHtml(m.label)}</div><div class="value">${m.otc.count || 0}</div></div>
          <div class="stat"><div class="label">OTC Revenue (Basic Price) — ${escapeHtml(m.label)}</div><div class="value" style="font-size:18px;">${fmt(m.otc.total || 0)}</div></div>
        </div>
        ${!hasThisMonth ? `<div class="banner"><span>⚠</span><div>No OTC invoices in ${escapeHtml(m.label)} were found in the uploaded file(s). Months actually covered: ${monthsWithData.map(monthLabelOf).join(', ')}.</div></div>` : ''}
        ${hasThisMonth ? `<div class="banner info" style="margin-top:12px;"><span>ℹ</span><div>
          <b>Service Manager</b> achievement = Job Card Revenue + OTC ${fmt(m.otc.total)}<br>
          <b>Store Manager</b> achievement = OTC ${fmt(m.otc.total)} only
        </div></div>` : ''}
        ${m.otc.history && m.otc.history.length > 1 ? `
        <div style="margin-top:12px;">
          <div class="kbd-note" style="margin-bottom:4px;">Upload history (${m.otc.history.length} uploads):</div>
          ${m.otc.history.slice(-5).reverse().map(h =>
            `<div class="kbd-note">• ${new Date(h.at).toLocaleString()} — <b>+${h.added}</b> added, ${h.skipped} duplicates skipped (${escapeHtml(h.fileName)})</div>`
          ).join('')}
        </div>` : ''}
        ${canUp && hasThisMonth ? `<button class="btn ghost" id="otcClearBtn">Clear uploaded data</button>` : ''}
      ` : `<div class="empty-state" style="padding:24px 0 0 0;"><div class="icon">○</div>No OTC data uploaded yet.</div>`}
    </div>`;

  if (!canUp) return;
  document.getElementById('otcClearBtn')?.addEventListener('click', () => {
    if (!confirmDestructive(`Clear ALL OTC data for ${monthLabelOf(mk)}? This cannot be undone.`)) return;
    ensureMonth(mk).otc = { invoices: {}, total: 0, count: 0, fileName: null, uploadedAt: null, history: [] };
    scheduleSave('months', () => APP.months);
    renderOtcTab(containerId);
    rerenderActiveTab();
    toast('OTC data cleared for ' + monthLabelOf(mk));
  });
  document.getElementById('otcFileInput').addEventListener('change', async ev => {
    const file = ev.target.files[0]; if (!file) return;
    const statusEl = document.getElementById('otcUploadStatus');
    statusEl.textContent = '⏳ Parsing…'; statusEl.style.color = 'var(--ink-soft)';
    try {
      const text = await file.text();
      const rows = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
      if (!rows.length) throw new Error('File appears empty or could not be parsed.');

      // Group rows by month → then by Order Number → sum Basic Price per order
      const grouped = {}; // mk → { orderNo: basicPriceTotal }
      let skippedType = 0, skippedDate = 0;
      const groupedDates = {}; // mk → { min: Date, max: Date }

      for (const row of rows) {
        if ((row['Order Type'] || '').trim() !== 'OTC Sales') { skippedType++; continue; }
        const invoiceDate = parseDateFlexible((row['Invoice Date'] || '').trim());
        if (!invoiceDate) { skippedDate++; continue; }
        const rowMk = monthKeyOf(invoiceDate);
        const orderNo = (row['Order Number'] || '').trim();
        if (!orderNo) continue;
        if (!grouped[rowMk]) grouped[rowMk] = {};
        grouped[rowMk][orderNo] = (grouped[rowMk][orderNo] || 0) + money(row['Basic Price']);
        if (!groupedDates[rowMk]) groupedDates[rowMk] = { min: invoiceDate, max: invoiceDate };
        if (invoiceDate < groupedDates[rowMk].min) groupedDates[rowMk].min = invoiceDate;
        if (invoiceDate > groupedDates[rowMk].max) groupedDates[rowMk].max = invoiceDate;
      }

      // Merge into stored data — only NEW order numbers, per month
      let totalAdded = 0, totalSkipped = 0, monthsSummary = [];

      for (const [rowMk, orders] of Object.entries(grouped)) {
        const mData = ensureMonth(rowMk);
        if (!mData.otc) mData.otc = { invoices: {}, total: 0, count: 0, fileName: null, uploadedAt: null, history: [] };
        if (!mData.otc.invoices) mData.otc.invoices = {};

        let added = 0, skipped = 0;
        for (const [orderNo, orderTotal] of Object.entries(orders)) {
          if (mData.otc.invoices[orderNo] !== undefined) {
            skipped++; // already exists — skip
          } else {
            mData.otc.invoices[orderNo] = orderTotal; // NEW — append
            added++;
          }
        }

        // Recompute totals from all stored invoices
        mData.otc.total = Object.values(mData.otc.invoices).reduce((s, v) => s + v, 0);
        mData.otc.count = Object.keys(mData.otc.invoices).length;
        mData.otc.fileName = file.name;
        mData.otc.uploadedAt = new Date().toISOString();
        if (groupedDates[rowMk]) {
          const gd = groupedDates[rowMk];
          const existingRange = mData.otc.dateRange;
          mData.otc.dateRange = {
            from: (existingRange && new Date(existingRange.from) < gd.min) ? existingRange.from : gd.min.toISOString(),
            to:   (existingRange && new Date(existingRange.to)   > gd.max) ? existingRange.to   : gd.max.toISOString(),
          };
        }
        if (!mData.otc.history) mData.otc.history = [];
        mData.otc.history.push({ fileName: file.name, at: new Date().toISOString(), added, skipped });

        totalAdded += added; totalSkipped += skipped;
        monthsSummary.push(`${monthLabelOf(rowMk)}: +${added} new, ${skipped} duplicate`);
      }

      scheduleSave('months', () => APP.months);

      statusEl.innerHTML =
        `<span style="color:var(--good)">✓ <b>${totalAdded} new OTC invoices added</b></span>` +
        (totalSkipped ? ` <span class="kbd-note">(${totalSkipped} duplicates skipped)</span>` : '') +
        `<br><span class="kbd-note">${monthsSummary.join(' | ')}</span>` +
        (skippedType ? `<br><span class="kbd-note">${skippedType} non-OTC rows ignored (JobCard/CPOTC)</span>` : '');

      renderOtcTab(containerId);
      rerenderActiveTab();
      toast(`OTC: ${totalAdded} new invoices added${totalSkipped ? `, ${totalSkipped} duplicates skipped` : ''}`);
    } catch(e) {
      statusEl.textContent = '✗ ' + e.message;
      statusEl.style.color = 'var(--bad)';
    }
  });
}
