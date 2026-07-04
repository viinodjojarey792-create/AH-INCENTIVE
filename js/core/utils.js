import { APP } from './state.js';

/* ---------- Utilities ---------- */
export function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 9); }
// norm() must stay consistent — job card archive keys are built AND looked up using this function.
// Changing the format breaks all existing stored data. Keep as uppercase-trim-collapse-spaces.
export function norm(s) { return (s || '').toString().trim().replace(/\s+/g, ' ').toUpperCase(); }
// Display only — Title Case: "ASHOK RAMCHANDRA PARDESHI" → "Ashok Ramchandra Pardeshi"
export function toTitleCase(s) {
  if (!s) return '';
  return s.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
export function money(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₹,]/g, '').trim();
  if (s === '' || s === '-' || /#REF|#VALUE|#DIV|#N\/A/i.test(s)) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
export function fmt(v, decimals = 0) {
  const n = money(v);
  const sign = n < 0 ? '-' : '';
  return sign + '₹' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
export function fmtPct(v, decimals = 2) {
  const n = money(v);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}
export function escapeHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function parseDateFlexible(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return null;
}

// Parses month strings like "Jan'26", "January 2026", "Jan 2026", "01/2026", "1-2026"
// Returns a month key like "2026-01" or null
export function parseMonthKey(s) {
  if (!s) return null;
  s = s.trim();
  const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
    january:1, february:2, march:3, april:4, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };

  // "Jan'26" or "Jan'2026" or "January'26"
  let m = s.match(/^([a-zA-Z]+)['\-\s]+(\d{2,4})$/i);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) {
      const yr = m[2].length === 2 ? 2000 + parseInt(m[2]) : parseInt(m[2]);
      return `${yr}-${String(mon).padStart(2,'0')}`;
    }
  }
  // "January 2026" or "Jan 2026"
  m = s.match(/^([a-zA-Z]+)\s+(\d{4})$/i);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) return `${parseInt(m[2])}-${String(mon).padStart(2,'0')}`;
  }
  // "01/2026" or "1-2026" or "01-2026"
  m = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${parseInt(m[2])}-${String(parseInt(m[1])).padStart(2,'0')}`;
  // "2026-01" already a month key
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return s;
  return null;
}
export function monthKeyOf(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}
export function monthLabelOf(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}
export function toast(msg, isErr) {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
export function activeEmployees(includeAll) {
  return APP.employees.filter(e => includeAll || e.status === 'ACTIVE');
}
export function empById(id) { return APP.employees.find(e => e.id === id); }
export function csvSafe(s) {
  s = (s == null ? '' : String(s));
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
export function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
