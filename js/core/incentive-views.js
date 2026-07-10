import { APP, CATEGORY_LABELS } from './state.js';
import { escapeHtml, norm, toTitleCase, fmt, fmtPct, csvSafe, downloadFile, toast, empById, money, confirmDestructive } from './utils.js';
import { scheduleSave } from './store.js';
import { ensureMonth } from './months.js';
import { calcAllFinalRows } from './incentive-engine.js';
import { calcBehavioral } from './behavioral.js';
import { canDo, isAdmin } from './auth.js';
import { openEmployeeEditor } from './admin-tabs/employees.js';

/* =========================================================================
   Behavioral Incentive tab — full bifurcation, sorted by designation
   ========================================================================= */
let behavioralSearch = '';
export function renderBehavioralIncentive() {
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  const rows = calcAllFinalRows(mk, false);
  const panel = document.getElementById('tab-behavioral');

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <strong>Behavioral Incentive — ${escapeHtml(m.label)}</strong>
        <div style="display:flex; gap:10px; align-items:center;">
          <div class="search-box"><span>🔍</span><input type="text" id="behSearch" placeholder="Search name…" value="${escapeHtml(behavioralSearch)}"></div>
          <button class="btn secondary" id="behExportBtn">Export CSV</button>
        </div>
      </div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Sorted by designation. Leave component requires Actual Absentee ≤ ${APP.settings.maxAbsenteeForLeaveComponent} and Approved Leaves ≥ Actual Absentee — edit attendance on the Master Menu.</p>
      <div class="table-scroll table-scroll-frozen">
        <table>
          <thead><tr>
            <th class="col-sticky-1">Sr</th><th class="col-sticky-2">Name</th><th>Designation</th><th>Category</th>
            <th class="num">Leave</th><th class="num">Late</th><th class="num">Tobacco</th><th class="num">Complaint</th><th class="num">Behavioral Total</th>
          </tr></thead>
          <tbody id="behBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const filtered = rows.filter(r => norm(r.emp.nameHR).includes(norm(behavioralSearch)));
  document.getElementById('behBody').innerHTML = filtered.map((r, i) => `
    <tr>
      <td class="col-sticky-1">${i + 1}</td>
      <td class="col-sticky-2">${escapeHtml(toTitleCase(r.emp.nameHR))}</td>
      <td>${escapeHtml(r.emp.designation || '—')}</td>
      <td><span class="pill pill-neutral">${r.emp.designation || CATEGORY_LABELS[r.emp.category]}</span></td>
      <td class="num">${fmt(r.behavioral.leaveAmt)}</td>
      <td class="num">${fmt(r.behavioral.lateAmt)}</td>
      <td class="num">${fmt(r.behavioral.tobaccoAmt)}</td>
      <td class="num">${r.behavioral.complaintCount == null ? '—' : fmt(r.behavioral.complaintAmt)}</td>
      <td class="num"><b>${fmt(r.behavioral.total)}</b></td>
    </tr>
  `).join('') || `<tr><td colspan="9"><div class="empty-state">No employees match your search.</div></td></tr>`;

  document.getElementById('behSearch').addEventListener('input', (e) => {
    behavioralSearch = e.target.value;
    renderBehavioralIncentive();
    document.getElementById('behSearch').focus();
    const v = document.getElementById('behSearch').value;
    document.getElementById('behSearch').setSelectionRange(v.length, v.length);
  });
  document.getElementById('behExportBtn').addEventListener('click', () => {
    const headers = ['Sr', 'Name', 'Designation', 'Category', 'Leave', 'Late', 'Tobacco', 'Complaint', 'Behavioral Total'];
    const lines = [headers.join(',')];
    filtered.forEach((r, i) => {
      lines.push([i + 1, csvSafe(r.emp.nameHR), csvSafe(r.emp.designation), r.emp.designation || CATEGORY_LABELS[r.emp.category],
        r.behavioral.leaveAmt, r.behavioral.lateAmt, r.behavioral.tobaccoAmt, r.behavioral.complaintAmt, r.behavioral.total].join(','));
    });
    downloadFile(`behavioral-incentive-${m.label.replace(/\s+/g, '-')}.csv`, lines.join('\n'), 'text/csv');
  });
}

/* =========================================================================
   Performance Incentive tab — full bifurcation, sorted by designation
   ========================================================================= */
let performanceSearch = '';
let showHiddenPerf = false;
let editingTargetEmpId = null;
let editingNameEmpId = null;
let perfSortCol = 'designation';
let perfSortDir = 1; // empId currently in inline target-edit mode, or null

// Has-target rows first (ascending by target value), then no-target rows
// (sorted by designation) at the bottom.
const DESIG_ORDER = [
  'technician','sr. technician','sr technician','senior technician',
  'floor supervisor','front line supervisor','frontline supervisor',
  'bodyshop technician','body shop technician',
  'bodyshop painter','body shop painter',
  'bodyshop executive','body shop executive',
  'service advisor','front line advisor','frontline advisor',
  'store manager','store executive','store assistant',
  'warranty in charge','warranty incharge',
  'process auditor',
  'assistant manager floor','asst. manager floor','asst manager floor',
  'service manager','accessories manager','pdi technician',
];
function designationRank(desig) {
  const d = (desig||'').toLowerCase().trim();
  for (let i = 0; i < DESIG_ORDER.length; i++) {
    if (d === DESIG_ORDER[i] || d.includes(DESIG_ORDER[i].split(' ')[0])) return i;
  }
  return DESIG_ORDER.length;
}
function sortForPerformancePage(rows) {
  return [...rows].sort((a, b) => {
    let va, vb;
    switch (perfSortCol) {
      case 'sr':           va = a.emp.srNo||0;            vb = b.emp.srNo||0; break;
      case 'name':         va = norm(a.emp.nameHR);        vb = norm(b.emp.nameHR); break;
      case 'designation':  va = (a.emp.designation||'').toLowerCase(); vb = (b.emp.designation||'').toLowerCase(); break;
      case 'target':       va = a.perf.target||0;          vb = b.perf.target||0; break;
      case 'achievement':  va = a.perf.achievement||0;     vb = b.perf.achievement||0; break;
      case 'achv':         va = a.perf.pctAchievement||0;  vb = b.perf.pctAchievement||0; break;
      case 'incentivepct': va = a.perf.pct||0;             vb = b.perf.pct||0; break;
      case 'perf':         va = a.perf.earned||0;          vb = b.perf.earned||0; break;
      case 'behavioral': { const ba=calcBehavioral(a.emp,APP.meta.currentMonth),bb=calcBehavioral(b.emp,APP.meta.currentMonth); va=ba.earned||0; vb=bb.earned||0; break; }
      case 'total': { va=(a.perf.earned||0)+(calcBehavioral(a.emp,APP.meta.currentMonth).earned||0); vb=(b.perf.earned||0)+(calcBehavioral(b.emp,APP.meta.currentMonth).earned||0); break; }
      case 'dhawal': { const dm=ensureMonth(APP.meta.currentMonth); va=(dm.dhawalCol&&dm.dhawalCol[a.emp.id])||0; vb=(dm.dhawalCol&&dm.dhawalCol[b.emp.id])||0; break; }
      case 'grand': { const gm=ensureMonth(APP.meta.currentMonth); va=(a.perf.earned||0)+(calcBehavioral(a.emp,APP.meta.currentMonth).earned||0)+((gm.dhawalCol&&gm.dhawalCol[a.emp.id])||0); vb=(b.perf.earned||0)+(calcBehavioral(b.emp,APP.meta.currentMonth).earned||0)+((gm.dhawalCol&&gm.dhawalCol[b.emp.id])||0); break; }
      default: va=0; vb=0;
    }
    if (va < vb) return -perfSortDir;
    if (va > vb) return perfSortDir;
    return norm(a.emp.nameHR).localeCompare(norm(b.emp.nameHR));
  });
}

export function renderPerformanceIncentive() {
  const mk = APP.meta.currentMonth;
  const m = ensureMonth(mk);
  if (!m.dhawalCol) m.dhawalCol = {};
  const allRows = calcAllFinalRows(mk, false);
  const hiddenCount = allRows.filter(r => r.emp.hidden).length;
  const visibleRows = showHiddenPerf ? allRows : allRows.filter(r => !r.emp.hidden);
  const sorted = sortForPerformancePage(visibleRows);
  const panel = document.getElementById('tab-performance');
  const admin = canDo('edit_targets') || isAdmin() || APP.currentUser?.role === 'OWNER';
  const editableTargetCats = ['TECHNICIAN', 'ADVISOR', 'NARODE', 'WM', 'SERVICE_MANAGER'];
  if (!admin) editingTargetEmpId = null;

  panel.innerHTML = `
    <div class="card">
      <div class="card-head">
        <strong>Performance Incentive — ${escapeHtml(m.label)}</strong>
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
          <div class="search-box"><span>🔍</span><input type="text" id="perfSearch" placeholder="Search name…" value="${escapeHtml(performanceSearch)}"></div>
          ${hiddenCount ? `<label style="display:flex; align-items:center; gap:5px; font-size:12px; color:var(--ink-soft); cursor:pointer;"><input type="checkbox" id="perfShowHidden" ${showHiddenPerf ? 'checked' : ''}> Show hidden (${hiddenCount})</label>` : ''}
          ${admin ? `<button class="btn secondary" id="perfAddBtn">+ Add Record</button>` : ''}
          <button class="btn secondary" id="perfExportBtn">Export CSV</button>
        </div>
      </div>
      <p class="kbd-note" style="margin-top:-6px; margin-bottom:14px;">Sorted by target — lowest first, employees with no target at the bottom. Technician/Advisor targets marked <span class="pill pill-amber" style="padding:1px 6px;">auto</span> are the prior-year half-year average from the Job Card upload, divided by 6; <span class="pill pill-neutral" style="padding:1px 6px;">manual</span> means that window had no data and the stored fallback target was used; <span class="pill pill-teal" style="padding:1px 6px;">override</span> is a value set by hand below.${admin ? ' Click the pencil next to a Technician/Advisor target to override it for this month only.' : ''}</p>
      <div class="table-scroll table-scroll-frozen">
        <table style="font-size:12.5px;">
          <thead>
            <tr id="perfThead">
              ${(()=>{
                const sa = (col,label,extra='',align='left',customTitle='') => {
                  const active = perfSortCol===col;
                  const arrow = active?(perfSortDir===1?' ↑':' ↓'):' ⇅';
                  const bg = extra.includes('#1a1a2e')?'background:#1a1a2e;':'background:#EFEAD9;';
                  const color = active?(extra.includes('#1a1a2e')?'color:#fff;':'color:var(--ink);font-weight:700;'):(extra.includes('#1a1a2e')?'color:#ffffffaa;':'color:var(--ink-soft);');
                  const style = 'position:sticky;top:0;z-index:2;cursor:pointer;user-select:none;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:10px 8px;white-space:nowrap;border-bottom:2px solid var(--line);'+bg+color+(align==='right'?'text-align:right;':'')+extra;
                  const tooltipText = customTitle ? (customTitle + ' — Sort by ' + label) : ('Sort by ' + label);
                  return '<th data-sortcol="'+col+'" style="'+style+'" title="'+tooltipText+'">'+label+(customTitle?' ⓘ':'')+'<span style="opacity:'+(active?'1':'0.35')+';font-size:9px;margin-left:2px;">'+arrow+'</span></th>';
                };
                return [
                  sa('sr','Sr','min-width:36px;'),
                  sa('name','Name','min-width:190px;padding-left:12px;'),
                  sa('designation','Designation','min-width:160px;'),
                  sa('target','Target','','right'),
                  sa('achievement','Achievement','','right','LOP achievement without GST'),
                  sa('achv','Achv %','','right'),
                  sa('incentivepct','Incentive %','','right'),
                  sa('perf','Perf ₹','color:var(--good);border-left:2px solid #e5e5e5;','right'),
                  sa('behavioral','Behavioral ₹','color:var(--teal);','right'),
                  sa('total','Total Earned','background:#EFEAD9;','right'),
                  sa('dhawal','Dhawal Sir ✎','color:var(--teal);min-width:110px;border-left:2px solid #e5e5e5;','right'),
                  sa('grand','Grand Total','background:#1a1a2e;color:#fff;min-width:100px;','right'),
                  '<th style="min-width:72px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-soft);position:sticky;top:0;background:#EFEAD9;border-bottom:2px solid var(--line);padding:10px 8px;">Actions</th>',
                ].join('');
              })()}
            </tr>
          </thead>
          <tbody id="perfBody"></tbody>
        </table>
      </div>
    </div>
  `;

  const filtered = sorted.filter(r => norm(r.emp.nameHR).includes(norm(performanceSearch)));
  document.getElementById('perfBody').innerHTML = filtered.map((r, i) => {
    const targetEditable = admin && editableTargetCats.includes(r.emp.category);
    const overrideVal = m.targetOverrides[r.emp.id];
    const isEditingThis = targetEditable && editingTargetEmpId === r.emp.id;
    const isEditingName = admin && editingNameEmpId === r.emp.id;
    const beh = calcBehavioral(r.emp, mk);
    const behEarned = beh.earned || 0;
    const perfEarned = r.emp.category === 'NONE' ? 0 : (r.perf.earned || 0);
    const totalEarned = perfEarned + behEarned;
    const dhawalAmt = (m.dhawalCol && m.dhawalCol[r.emp.id] != null) ? m.dhawalCol[r.emp.id] : 0;
    const grandTotal = totalEarned + dhawalAmt;
    const achvPct = r.emp.category==='NONE'?'—':fmtPct(r.perf.pctAchievement);
    const achvCol = r.emp.category!=='NONE'&&r.perf.pctAchievement!=null?(r.perf.pctAchievement>=100?'color:var(--good);':r.perf.pctAchievement>=80?'color:var(--amber);':'color:var(--bad);'):'';

    let targetCell;
    if (r.emp.category === 'NONE') { targetCell = '—'; }
    else if (isEditingThis) {
      targetCell = '<input type="text" class="cell-input" style="width:90px;text-align:right;" id="targetEditInput-'+r.emp.id+'" value="'+(overrideVal!=null?overrideVal:Math.round(r.perf.target))+'">' +
        '<button class="icon-btn" data-targetsave="'+r.emp.id+'" title="Save">✓</button>' +
        '<button class="icon-btn" data-targetcancel="'+r.emp.id+'" title="Cancel">✕</button>';
    } else {
      const targetSpan = r.emp.targetNote
        ? '<span title="'+escapeHtml(r.emp.targetNote)+'" style="cursor:help;border-bottom:1px dotted var(--ink-soft);">'+fmt(r.perf.target)+'</span>'
        : fmt(r.perf.target);
      targetCell = targetSpan +
        (targetEditable ? ' <button class="icon-btn" data-targetpencil="'+r.emp.id+'" title="Edit target" style="opacity:0.5;font-size:11px;">✎</button>' : '');
    }

    const nameCell = isEditingName
      ? '<input type="text" class="cell-input" style="width:160px;" id="nameEditInput-'+r.emp.id+'" value="'+escapeHtml(toTitleCase(r.emp.nameHR))+'">' +
        '<button class="icon-btn" data-namesave="'+r.emp.id+'" title="Save">✓</button>' +
        '<button class="icon-btn" data-namecancel="'+r.emp.id+'" title="Cancel">✕</button>'
      : escapeHtml(toTitleCase(r.emp.nameHR)) + (r.emp.hidden?' <span class="kbd-note">(hidden)</span>':'') +
        (admin?' <button class="icon-btn" data-namepencil="'+r.emp.id+'" title="Edit name" style="opacity:0.4;font-size:11px;">✎</button>':'');

    const dhawalCell = admin
      ? '<input type="number" class="cell-input dhawal-inp" data-empid="'+r.emp.id+'" value="'+dhawalAmt+'" style="width:90px;text-align:right;font-size:12px;" placeholder="0">'
      : fmt(dhawalAmt);

    return '<tr style="border-bottom:1px solid var(--line)20;' + (r.emp.hidden?'opacity:0.55;':'') + '">' +
      '<td style="font-size:11px;color:var(--ink-soft);text-align:center;padding:10px 6px;">'+(i+1)+'</td>' +
      '<td style="padding:10px 12px;font-weight:600;font-size:12.5px;">'+nameCell+'</td>' +
      '<td style="font-size:11.5px;color:var(--ink-soft);">'+escapeHtml(r.emp.designation||'—')+'</td>' +
      '<td class="num">'+targetCell+'</td>' +
      '<td class="num">'+(r.emp.category==='NONE'?'—':fmt(r.perf.achievement))+'</td>' +
      '<td class="num" style="font-weight:700;'+achvCol+'">'+achvPct+'</td>' +
      '<td class="num">'+(r.perf.pct==null?'—':r.perf.pct+'%')+'</td>' +
      '<td class="num" style="color:var(--good);font-weight:600;border-left:2px solid #e5e5e5;">'+(r.emp.category==='NONE'?'—':fmt(perfEarned))+'</td>' +
      '<td class="num" style="color:var(--teal);font-weight:600;">'+fmt(behEarned)+'</td>' +
      '<td class="num" style="font-weight:700;background:var(--surface-2)40;">'+(r.emp.category==='NONE'?'—':fmt(totalEarned))+'</td>' +
      '<td class="num" style="border-left:2px solid #e5e5e5;">'+dhawalCell+'</td>' +
      '<td class="num" style="font-weight:700;font-size:13px;">'+(r.emp.category==='NONE'?'—':fmt(grandTotal))+'</td>' +
      '<td style="white-space:nowrap;padding:6px 8px;text-align:center;">' +
        '<button class="icon-btn" data-hidetoggle="'+r.emp.id+'" title="'+(r.emp.hidden?'Unhide':'Hide')+'" style="font-size:15px;padding:2px 5px;opacity:0.6;">'+(r.emp.hidden?'👁':'🙈')+'</button>' +
        (admin?'<button class="icon-btn" data-delrecord="'+r.emp.id+'" title="Delete" style="font-size:15px;padding:2px 5px;color:var(--bad);opacity:0.6;">🗑</button>':'') +
      '</td></tr>';
  }).join('') || '<tr><td colspan="13"><div class="empty-state">No employees match your search.</div></td></tr>';

  // Sort headers
  document.querySelectorAll('[data-sortcol]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sortcol;
      if (perfSortCol === col) { perfSortDir *= -1; } else { perfSortCol = col; perfSortDir = 1; }
      renderPerformanceIncentive();
    });
  });

  document.getElementById('perfSearch').addEventListener('input', (e) => {
    performanceSearch = e.target.value;
    renderPerformanceIncentive();
    document.getElementById('perfSearch').focus();
    const v = document.getElementById('perfSearch').value;
    document.getElementById('perfSearch').setSelectionRange(v.length, v.length);
  });

  const hiddenToggle = document.getElementById('perfShowHidden');
  if (hiddenToggle) hiddenToggle.addEventListener('change', (e) => { showHiddenPerf = e.target.checked; renderPerformanceIncentive(); });

  if (admin) {
    const addBtn = document.getElementById('perfAddBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEmployeeEditor(null));

    const saveTarget = (empId) => {
      const inp = document.getElementById('targetEditInput-' + empId);
      if (!inp) return;
      const v = inp.value.trim();
      m.targetOverrides[empId] = v === '' ? null : money(v);
      scheduleSave('months', () => APP.months);
      editingTargetEmpId = null;
      renderPerformanceIncentive();
    };
    const saveName = (empId) => {
      const inp = document.getElementById('nameEditInput-' + empId);
      if (!inp) return;
      const v = inp.value.trim();
      if (v) { const emp = empById(empId); emp.nameHR = v.toUpperCase(); scheduleSave('employees', () => APP.employees); toast('Name updated'); }
      editingNameEmpId = null; renderPerformanceIncentive();
    };
    document.querySelectorAll('[data-targetpencil]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        editingTargetEmpId = e.target.closest('[data-targetpencil]').dataset.targetpencil;
        renderPerformanceIncentive();
        const inp = document.getElementById('targetEditInput-' + editingTargetEmpId);
        if (inp) { inp.focus(); inp.select(); }
      });
    });
    document.querySelectorAll('[data-targetsave]').forEach(btn => btn.addEventListener('click', (e) => saveTarget(e.target.dataset.targetsave)));
    document.querySelectorAll('[data-targetcancel]').forEach(btn => btn.addEventListener('click', () => { editingTargetEmpId = null; renderPerformanceIncentive(); }));
    document.querySelectorAll('[id^="targetEditInput-"]').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        const empId = inp.id.replace('targetEditInput-', '');
        if (e.key === 'Enter') saveTarget(empId);
        if (e.key === 'Escape') { editingTargetEmpId = null; renderPerformanceIncentive(); }
      });
    });
    document.querySelectorAll('[data-namepencil]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        editingNameEmpId = e.target.closest('[data-namepencil]').dataset.namepencil;
        renderPerformanceIncentive();
        const inp = document.getElementById('nameEditInput-' + editingNameEmpId);
        if (inp) { inp.focus(); inp.select(); }
      });
    });
    document.querySelectorAll('[data-namesave]').forEach(btn => btn.addEventListener('click', (e) => saveName(e.target.dataset.namesave)));
    document.querySelectorAll('[data-namecancel]').forEach(btn => btn.addEventListener('click', () => { editingNameEmpId = null; renderPerformanceIncentive(); }));
    document.querySelectorAll('[id^="nameEditInput-"]').forEach(inp => {
      inp.addEventListener('keydown', (e) => {
        const empId = inp.id.replace('nameEditInput-', '');
        if (e.key === 'Enter') saveName(empId);
        if (e.key === 'Escape') { editingNameEmpId = null; renderPerformanceIncentive(); }
      });
    });
    document.querySelectorAll('.dhawal-inp').forEach(inp => {
      inp.addEventListener('change', () => {
        if (!m.dhawalCol) m.dhawalCol = {};
        m.dhawalCol[inp.dataset.empid] = parseFloat(inp.value) || 0;
        scheduleSave('months', () => APP.months);
        renderPerformanceIncentive();
      });
    });
    document.querySelectorAll('[data-hidetoggle]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const emp = empById(e.target.closest('[data-hidetoggle]').dataset.hidetoggle);
        emp.hidden = !emp.hidden;
        scheduleSave('employees', () => APP.employees);
        renderPerformanceIncentive();
        toast(emp.hidden ? (emp.nameHR + ' hidden') : (emp.nameHR + ' unhidden'));
      });
    });
    document.querySelectorAll('[data-delrecord]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const emp = empById(e.target.closest('[data-delrecord]').dataset.delrecord);
        if (!confirmDestructive('Delete ' + emp.nameHR + '? This cannot be undone.')) return;
        APP.employees = APP.employees.filter(x => x.id !== emp.id);
        scheduleSave('employees', () => APP.employees);
        renderPerformanceIncentive();
        toast('Employee deleted');
      });
    });
  }

  document.getElementById('perfExportBtn').addEventListener('click', () => {
    const headers = ['Sr','Name','Designation','Target','Target Source','Achievement','Achv %','Incentive %','Perf Incentive','Behavioral','Total Earned','Dhawal Sir Col','Grand Total'];
    const lines = [headers.join(',')];
    filtered.forEach((r, i) => {
      const beh = calcBehavioral(r.emp, mk);
      const behEarned = beh.earned||0;
      const perfEarned = r.emp.category==='NONE'?0:(r.perf.earned||0);
      const totalEarned = perfEarned+behEarned;
      const dhawalAmt = (m.dhawalCol&&m.dhawalCol[r.emp.id]!=null)?m.dhawalCol[r.emp.id]:0;
      lines.push([i+1,csvSafe(r.emp.nameHR),csvSafe(r.emp.designation||''),
        r.emp.category==='NONE'?'':r.perf.target, r.perf.targetSource||'',
        r.emp.category==='NONE'?'':r.perf.achievement,
        r.emp.category==='NONE'?'':r.perf.pctAchievement.toFixed(2),
        r.perf.pct==null?'':r.perf.pct,
        r.emp.category==='NONE'?'':perfEarned,
        behEarned, totalEarned, dhawalAmt, totalEarned+dhawalAmt].join(','));
    });
    downloadFile('performance-incentive-'+m.label.replace(/\s+/g,'-')+'.csv', lines.join('\n'), 'text/csv');
  });
}
