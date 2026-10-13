(function () {
'use strict';
const C = window.Core;
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let CFG = { currency: '₱', thresholds: { green: 100, yellow: 90 } };
const COL = { green: '#1E9E4A', yellow: '#F2B01E', red: '#D62828', gray: '#9FB0C0', blue: '#0057A0' };

const state = { rows: [], weeks: [], opts: {}, sel: {}, charts: {}, source: '' };
const FILTERS = [
  { id: 'salesman', label: 'Salesman', field: 'sp' },
  { id: 'position', label: 'Position', field: 'pos' },
  { id: 'channel', label: 'Channel', field: 'ch' },
  { id: 'week', label: 'Week / Period', field: 'wk' }
];

/* ---------- formatting ---------- */
function fmtCompact(n) {
  const a = Math.abs(n), s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
  return s + a.toFixed(0);
}
const peso = n => (n < 0 ? '-' : '') + CFG.currency + fmtCompact(Math.abs(n));
const pesoSigned = n => (n > 0 ? '+' : '') + peso(n);
const pct = (n, d) => n == null ? 'n/a' : n.toFixed(d == null ? 1 : d) + '%';
const st = a => C.status(a, CFG.thresholds);
const pill = a => `<span class="pill ${st(a)}">${pct(a, 0)}</span>`;

/* ---------- data loading ---------- */
async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function loadData() {
  try { CFG = Object.assign(CFG, await (await fetch('data/config.json', { cache: 'no-store' })).json()); } catch (e) { /* defaults */ }
  let rows = [], source = '', err = '';
  try {
    rows = C.csvToRows(await fetchText(CFG.sheetUrl)); source = 'Live · Google Sheets';
    if (!rows.length) throw new Error('Sheet returned no rows');
  } catch (e) {
    err = e.message;
    try { rows = C.csvToRows(await fetchText(CFG.fallbackCsv)); source = 'SAMPLE DATA (offline)'; } catch (e2) { rows = []; }
  }
  state.rows = rows; state.source = source;
  const b = $('#dataSourceBadge'); b.textContent = source || 'No data'; b.classList.toggle('live', source.startsWith('Live'));
  const banner = $('#stateBanner');
  if (!source.startsWith('Live')) {
    banner.className = 'state-banner error';
    banner.textContent = rows.length
      ? `Could not load the live Google Sheet (${err}). Showing bundled SAMPLE data — numbers are not real.`
      : `Could not load data (${err}).`;
  } else banner.className = 'state-banner hidden';
  initOptions();
}

/* ---------- filters ---------- */
function initOptions() {
  const rows = state.rows;
  state.weeks = C.weekList(rows);
  const uniq = (f, sorter) => [...new Set(rows.map(f))].sort(sorter);
  state.opts.week = state.weeks.map(w => ({ v: w, l: w }));
  state.opts.channel = uniq(r => r.ch).map(v => ({ v, l: v }));
  state.opts.position = uniq(r => r.pos).map(v => ({ v, l: v }));
  const sm = new Map(); rows.forEach(r => sm.set(r.sp, r.sm));
  state.opts.salesman = [...sm].sort((a, b) => a[1].localeCompare(b[1])).map(([v, l]) => ({ v, l }));
  resetSel();
  buildDropdowns();
}
function resetSel() {
  FILTERS.forEach(f => { state.sel[f.id] = new Set(state.opts[f.id].map(o => o.v)); });
  const lw = C.latestWeek(state.rows);
  state.sel.week = new Set(lw ? [lw] : []);
}
function buildDropdowns() {
  const host = $('#filterDropdowns'); host.innerHTML = '';
  FILTERS.forEach(f => {
    const d = document.createElement('div'); d.className = 'dropdown-filter'; d.dataset.filter = f.id;
    d.innerHTML = `<button type="button" class="dropdown-btn"><span class="dropdown-label">${f.label}</span><span class="dropdown-value">All</span>
      <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></button>
      <div class="dropdown-panel"><div class="dropdown-panel-actions"><button type="button" data-bulk="all">Select All</button>
      <button type="button" data-bulk="clear">${f.id === 'week' ? 'Latest Only' : 'Uncheck All'}</button></div><div class="dropdown-options"></div></div>`;
    host.appendChild(d);
    $('.dropdown-btn', d).addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.dropdown-filter.open').forEach(o => { if (o !== d) o.classList.remove('open'); });
      d.classList.toggle('open');
    });
    $('.dropdown-panel', d).addEventListener('click', e => e.stopPropagation());
    d.querySelectorAll('[data-bulk]').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.bulk === 'all') state.sel[f.id] = new Set(state.opts[f.id].map(o => o.v));
      else if (f.id === 'week') { const lw = C.latestWeek(state.rows); state.sel.week = new Set(lw ? [lw] : []); }
      else state.sel[f.id] = new Set();
      syncDropdown(f.id); render();
    }));
    const box = $('.dropdown-options', d);
    state.opts[f.id].forEach(o => {
      const lab = document.createElement('label'); lab.className = 'dropdown-option';
      lab.innerHTML = `<input type="checkbox" value="${esc(o.v)}"><span>${esc(o.l)}</span>`;
      $('input', lab).addEventListener('change', ev => {
        ev.target.checked ? state.sel[f.id].add(o.v) : state.sel[f.id].delete(o.v);
        syncDropdown(f.id); render();
      });
      box.appendChild(lab);
    });
    syncDropdown(f.id);
  });
}
function syncDropdown(id) {
  const d = $(`.dropdown-filter[data-filter="${id}"]`); if (!d) return;
  const sel = state.sel[id], all = state.opts[id];
  d.querySelectorAll('input[type=checkbox]').forEach(i => { i.checked = sel.has(i.value); });
  let t;
  if (sel.size === all.length) t = 'All';
  else if (!sel.size) t = 'None';
  else if (sel.size <= 2) t = all.filter(o => sel.has(o.v)).map(o => o.l).join(', ');
  else t = sel.size + ' selected';
  $('.dropdown-value', d).textContent = t;
}
document.addEventListener('click', () => document.querySelectorAll('.dropdown-filter.open').forEach(o => o.classList.remove('open')));

const inScope = r => state.sel.salesman.has(r.sp) && state.sel.position.has(r.pos) && state.sel.channel.has(r.ch);
const scopedAll = () => state.rows.filter(inScope);
const periodRows = () => scopedAll().filter(r => state.sel.week.has(r.wk));
function periodLabel() {
  const w = state.weeks.filter(x => state.sel.week.has(x));
  if (!w.length) return 'the selected period';
  if (w.length === 1) return w[0];
  if (w.length === state.weeks.length) return 'All weeks (' + w[0] + ' – ' + w[w.length - 1] + ')';
  return w.length + ' selected weeks (' + w.join(', ') + ')';
}

/* ---------- charts ---------- */
function mk(id, cfg) {
  if (state.charts[id]) state.charts[id].destroy();
  const el = document.getElementById(id); if (!el) return;
  state.charts[id] = new Chart(el, cfg);
  return state.charts[id];
}
function barCfg(labels, groups, opt) {
  opt = opt || {};
  return {
    type: 'bar',
    data: { labels, datasets: [
      { label: 'Projection', data: groups.map(g => g.p), backgroundColor: groups.map(g => opt.faded && opt.faded(g) ? 'rgba(159,176,192,.35)' : COL.gray), borderRadius: 3 },
      { label: 'Actual', data: groups.map(g => g.a), backgroundColor: groups.map(g => { const c = COL[st(g.ach)] || COL.blue; return opt.faded && opt.faded(g) ? c + '55' : c; }), borderRadius: 3 }
    ] },
    options: {
      indexAxis: opt.horizontal ? 'y' : 'x', responsive: true, maintainAspectRatio: false,
      onClick: opt.onClick, onHover: (e, el) => { if (opt.onClick && e.native) e.native.target.style.cursor = el.length ? 'pointer' : 'default'; },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${peso(c.parsed[opt.horizontal ? 'x' : 'y'])}`,
          afterBody: it => { const g = groups[it[0].dataIndex]; return g.ach == null ? '' : `Achievement: ${pct(g.ach)}  ·  Variance: ${pesoSigned(g.v)}`; } } }
      },
      scales: opt.horizontal
        ? { x: { ticks: { callback: v => fmtCompact(v) }, grid: { color: '#EEF1F4' } }, y: { grid: { display: false }, ticks: { autoSkip: false } } }
        : { y: { ticks: { callback: v => fmtCompact(v) }, grid: { color: '#EEF1F4' } }, x: { grid: { display: false } } }
    }
  };
}

/* ---------- render ---------- */
function render() {
  const rows = periodRows();
  const A = C.analyze(rows, CFG.thresholds);
  const lw = C.latestWeek(state.rows);
  $('#lastUpdated').textContent = lw || '—';
  $('#dataScope').textContent = `${state.rows.length.toLocaleString()} rows`;
  $('#scopeHint').textContent = '(' + periodLabel() + ')';
  renderKpis(A); renderExec(A, rows); renderWeekly(); renderBreakdown(A); renderTop10(rows);
}

function kpiCard(label, value, cls, delta, sub) {
  return `<div class="summary-card ${cls || ''}"><div class="label">${label}</div><div class="value">${value}</div>${delta || ''}${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
function renderKpis(A) {
  if (!A.P && !A.A) { $('#kpiGrid').innerHTML = '<div class="state-banner">No data for the current filters.</div>'; return; }
  const s = st(A.ach);
  const dv = `<div class="delta ${A.V >= 0 ? 'up' : 'down'}">${A.V >= 0 ? '▲' : '▼'} ${pesoSigned(A.V)} vs projection</div>`;
  $('#kpiGrid').innerHTML =
    kpiCard('Total Sell-out', peso(A.A), '', '', periodLabel()) +
    kpiCard('Total Projection', peso(A.P), '', '', 'Target for the period') +
    kpiCard('Achievement Rate', pct(A.ach), s, `<div class="delta ${s === 'green' ? 'up' : s === 'red' ? 'down' : 'flat'}">${s === 'green' ? 'On / above target' : s === 'yellow' ? 'Slightly below target' : 'Off target'}</div>`, `Green ≥${CFG.thresholds.green}% · Yellow ≥${CFG.thresholds.yellow}% · Red below`) +
    kpiCard('Variance to Target', pesoSigned(A.V), A.V >= 0 ? 'green' : 'red', dv) +
    kpiCard('Active Salesmen', A.activeSm, '', '', `of ${A.totalSm} with data (sell-out > 0)`) +
    kpiCard('Active Accounts', A.activeAcc.toLocaleString(), '', '', `of ${A.totalAcc.toLocaleString()} accounts (sell-out > 0)`);
}

const nameList = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

function narrative(A) {
  if (!A.P && !A.A) return '<p>No data matches the current filters.</p>';
  const per = periodLabel(), ps = [];
  const verb = A.ach == null ? 'recorded sell-out with no projection' : `achieved <strong>${pct(A.ach)}</strong> of the sell-out target`;
  ps.push(`<strong>${esc(per)}</strong> ${verb} (${peso(A.A)} vs ${peso(A.P)} projected; variance <span class="${A.V >= 0 ? 'pos' : 'neg'}">${pesoSigned(A.V)}</span>).`);
  if (A.V < 0 && A.totalShort > 0) {
    const parts = [];
    if (A.contrib.ch[0]) parts.push(`the <strong>${esc(A.contrib.ch[0].key)}</strong> channel (${pct(A.contrib.ch[0].share, 0)} of the total shortfall)`);
    if (A.contrib.acc.length) {
      const sh = C.sum(A.contrib.acc, x => x.share);
      parts.push(`accounts <strong>${esc(nameList(A.contrib.acc.map(a => a.name)))}</strong> (together ${pct(sh, 0)} of the total shortfall)`);
    }
    if (parts.length) ps.push(`The largest performance gap was driven by ${parts.join(' and ')}.`);
  }
  const t = A.topSm, l = A.lowSm;
  if (t) {
    let s = `Salesman <strong>${esc(t.name)}</strong> ${t.ach >= 100 ? `exceeded target by <span class="pos">${pct(t.ach - 100, 0)}</span>` : `was the strongest at ${pct(t.ach, 0)} of target`}`;
    if (l) s += `, while salesman <strong>${esc(l.name)}</strong> achieved only <span class="${l.ach >= 100 ? 'pos' : 'neg'}">${pct(l.ach, 0)}</span>`;
    ps.push(s + '.');
  }
  if (A.topCh && A.lowCh) ps.push(`By channel, <strong>${esc(A.topCh.key)}</strong> led at ${pct(A.topCh.ach, 0)} while <strong>${esc(A.lowCh.key)}</strong> trailed at ${pct(A.lowCh.ach, 0)}.`);
  const zero = A.lines.filter(x => x.p > 0 && x.a <= 0);
  if (A.V < 0) {
    const f = [];
    if (A.contrib.acc.length) f.push('the underperforming accounts listed below');
    if (A.lowCh) f.push(`recovery in the ${esc(A.lowCh.key)} channel`);
    if (l) f.push(`coaching support for ${esc(l.name)}`);
    ps.push(`Immediate focus should be placed on ${nameList(f)}${zero.length ? `; ${zero.length} account line${zero.length > 1 ? 's' : ''} with a projection recorded no sell-out at all` : ''}.`);
  } else ps.push('The team is at or above target — protect the momentum and review accounts that are still below projection.');
  return ps.map(p => `<p>${p}</p>`).join('');
}

function spot(role, cls, o, lines, isCh) {
  if (!o) return '';
  const E = C.explainGroup(lines, isCh ? (l => l.ch === o.key) : (l => l.sp === o.key));
  const li = [];
  if (o.v < 0) {
    li.push(`Gap to projection: <b class="down">${pesoSigned(o.v)}</b> (${pct(o.share, 0)} of total shortfall)`);
    if (!isCh && E.topCh) li.push(`Biggest shortfall channel: ${esc(E.topCh.ch)} (${peso(E.topCh.short)} short)`);
    if (isCh) { const sm = new Map(); lines.filter(l => l.ch === o.key && l.s > 0).forEach(l => sm.set(l.sm, (sm.get(l.sm) || 0) + l.s)); const top = [...sm].sort((a, b) => b[1] - a[1])[0]; if (top) li.push(`Largest shortfall from salesman ${esc(top[0])} (${peso(top[1])} short)`); }
    if (E.zeroCount) li.push(`${E.zeroCount} of ${E.accounts} accounts had no sell-out against a ${peso(E.zeroProj)} projection`);
    if (E.missCount) li.push(`${E.missCount} of ${E.accounts} accounts are below ${CFG.thresholds.yellow}% of projection`);
    if (E.topAcc.length) li.push(`Top gaps: ${esc(E.topAcc.map(l => l.name).join(', '))} (${pct(E.topAccShare, 0)} of its shortfall)`);
  } else {
    li.push(`Ahead of projection by <b class="up">${pesoSigned(o.v)}</b>`);
    if (E.bestAcc) li.push(`Best account: ${esc(E.bestAcc.name)} (${pesoSigned(E.bestAcc.a - E.bestAcc.p)} vs projection)`);
    if (E.missCount) li.push(`Still ${E.missCount} of ${E.accounts} accounts below ${CFG.thresholds.yellow}% — room to lift`);
  }
  return `<div class="spot ${o.v >= 0 ? 'green' : 'red'}"><div class="spot-head"><span><span class="spot-role">${role}</span><br>${esc(o.name || o.key)}</span>${pill(o.ach)}</div>
    <div>${peso(o.a)} of ${peso(o.p)} projected</div><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul></div>`;
}
function accTable(list, withShare) {
  if (!list.length) return '<p class="note">None.</p>';
  return `<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Account</th><th class="num">Sell-out</th><th class="num">Proj.</th><th class="num">Ach.</th>${withShare ? '<th class="num">Gap</th>' : ''}</tr></thead><tbody>` +
    list.map(a => `<tr><td>${esc(a.name)}</td><td class="num">${peso(a.a)}</td><td class="num">${peso(a.p)}</td><td class="num">${pill(a.ach)}</td>${withShare ? `<td class="num ${a.v < 0 ? 'down' : 'up'}">${pesoSigned(a.v)}</td>` : ''}</tr>`).join('') + '</tbody></table></div>';
}
function contribTable(title, list, nameKey) {
  return `<div><p class="sub-title">${title}</p>` + (list.length ? `<table class="tbl"><tbody>` +
    list.map(o => `<tr><td>${esc(nameKey ? o[nameKey] : o.key)}</td><td class="num down">${peso(-o.short)}</td><td class="num">${pct(o.share, 0)}</td></tr>`).join('') + '</tbody></table>' : '<p class="note">No shortfall.</p>') + '</div>';
}
function varList(title, g, nameKey) {
  const row = (o, c) => `<tr><td>${esc(nameKey ? o[nameKey] : o.key)}</td><td class="num ${c}">${pesoSigned(o.v)}</td><td class="num">${pill(o.ach)}</td></tr>`;
  return `<div><p class="sub-title">${title}</p><table class="tbl"><tbody>` +
    g.pos.map(o => row(o, 'up')).join('') + g.neg.map(o => row(o, 'down')).join('') +
    (!g.pos.length && !g.neg.length ? '<tr><td class="note">No variance.</td></tr>' : '') + '</tbody></table></div>';
}
function renderExec(A) {
  $('#narrative').innerHTML = '<span class="tag">AI-style summary</span>' + narrative(A);
  if (!A.P && !A.A) { $('#execGrid').innerHTML = ''; return; }
  const L = A.lines;
  $('#execGrid').innerHTML =
    `<div class="panel"><p class="panel-title">Salesman — Top &amp; Lowest</p>${spot('Top salesman', 'green', A.topSm, L)}${spot('Lowest salesman', 'red', A.lowSm, L) || '<p class="note">Only one salesman in scope.</p>'}</div>` +
    `<div class="panel"><p class="panel-title">Channel — Top &amp; Lowest</p>${spot('Top channel', 'green', A.topCh, L, true)}${spot('Lowest channel', 'red', A.lowCh, L, true) || '<p class="note">Only one channel in scope.</p>'}</div>` +
    `<div class="panel"><p class="panel-title">Top 5 Accounts <span class="note">(by sell-out)</span></p>${accTable(A.top5Acc)}</div>` +
    `<div class="panel"><p class="panel-title">Lowest 5 Accounts <span class="note">(by achievement, with projection)</span></p>${accTable(A.low5Acc, true)}</div>` +
    `<div class="panel full"><p class="panel-title">Major Contributors to Low Performance</p><div class="var-grid">
      ${contribTable('Salesman', A.contrib.sm, 'name')}${contribTable('Channel', A.contrib.ch)}${contribTable('Accounts', A.contrib.acc, 'name')}</div>
      <p class="note">Shortfall = projection not delivered, summed per salesman-account-channel over the selected weeks (over-delivery elsewhere does not offset it). Shares add up to 100% of ${peso(A.totalShort)}.</p></div>` +
    `<div class="panel full"><p class="panel-title">Variance Analysis — Largest Gaps vs Projection</p><div class="var-grid">
      ${varList('Salesman', A.variance.sm, 'name')}${varList('Channel', A.variance.ch)}${varList('Accounts', A.variance.acc, 'name')}</div>
      <p class="note">Up to 3 largest positive and 3 largest negative gaps (sell-out minus projection).</p></div>`;
}

function renderWeekly() {
  const rows = scopedAll(), ag = C.agg(rows, r => r.wk);
  const by = new Map(ag.map(o => [o.key, o]));
  const groups = state.weeks.map(w => by.get(w) || { key: w, p: 0, a: 0, ach: null, v: 0 });
  groups.forEach(g => { if (g.p === 0 && g.a === 0) g.ach = null; });
  const sel = state.sel.week;
  mk('weeklyChart', barCfg(state.weeks, groups, { faded: g => !sel.has(g.key) }));
  $('#weekStrip').innerHTML = groups.map(g => `<div class="week-chip ${st(g.ach)} ${sel.has(g.key) ? 'sel' : ''}">${esc(g.key)}<small>${pct(g.ach, 0)}</small></div>`).join('');
}

function renderBreakdown(A) {
  const sm = A.sms.slice().sort((a, b) => b.a - a.a);
  $('#smWrap').style.height = Math.max(240, sm.length * 34 + 60) + 'px';
  mk('smChart', barCfg(sm.map(o => `${o.name} (${pct(o.ach, 0)})`), sm, { horizontal: true, onClick: (e, el) => {
    if (!el.length) return;
    const key = sm[el[0].index].key;
    setTimeout(() => { state.sel.salesman = new Set([key]); syncDropdown('salesman'); render(); $('#top10Section').scrollIntoView({ behavior: 'smooth' }); }, 0);
  } }));
  const pos = A.poss.slice().sort((a, b) => b.a - a.a), ch = A.chs.slice().sort((a, b) => b.a - a.a);
  mk('posChart', barCfg(pos.map(o => `${o.key} (${pct(o.ach, 0)})`), pos));
  mk('chChart', barCfg(ch.map(o => `${o.key} (${pct(o.ach, 0)})`), ch));
}

function renderTop10(rows) {
  const body = $('#top10Body'), sel = state.sel.salesman;
  if (sel.size !== 1) {
    $('#top10Title').textContent = 'Top 10 Customers';
    body.innerHTML = `<div class="placeholder">Select a <b>single Salesman</b> in the filter bar (or click a salesman bar above) to see that salesperson's Top 10 customers — weekly sell-out, actual vs projection, ranked by total sell-out.</div>`;
    if (state.charts.top10Chart) { state.charts.top10Chart.destroy(); delete state.charts.top10Chart; }
    return;
  }
  const sp = [...sel][0], name = (state.opts.salesman.find(o => o.v === sp) || {}).l || sp;
  const weeks = state.weeks.filter(w => state.sel.week.has(w));
  const top = C.topCustomers(rows, sp, weeks, 10);
  $('#top10Title').textContent = `Top 10 Customers — ${name}`;
  if (!top.length) { body.innerHTML = '<div class="placeholder">No customer data for this salesman in the selected weeks / channels.</div>'; return; }
  const tot = C.sum(top, c => c.a), totP = C.sum(top, c => c.p);
  body.innerHTML = `<div class="top10-grid">
    <div class="panel"><p class="panel-title">Actual vs Projection — ${esc(periodLabel())}</p><div class="chart-wrap" id="t10Wrap"><canvas id="top10Chart"></canvas></div></div>
    <div class="panel"><p class="panel-title">Weekly Sell-out per Customer <span class="note">(actual / projection)</span></p><div class="tbl-scroll"><table class="tbl"><thead><tr><th>#</th><th>Customer</th><th>Ch.</th>${weeks.map(w => `<th class="num">${esc(w)}</th>`).join('')}<th class="num">Total</th><th class="num">Proj.</th><th class="num">Ach.</th></tr></thead><tbody>
    ${top.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.name)}</td><td>${esc(c.ch)}</td>${c.weeks.map(w => { const a = w.p > 0 ? w.a / w.p * 100 : null; return `<td class="wk-cell ${w.p > 0 ? st(a) : ''}"><b>${peso(w.a)}</b><small>/ ${peso(w.p)}</small></td>`; }).join('')}<td class="num"><b>${peso(c.a)}</b></td><td class="num">${peso(c.p)}</td><td class="num">${pill(c.ach)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td></td><td><b>Top 10 total</b></td><td></td>${weeks.map(() => '<td></td>').join('')}<td class="num"><b>${peso(tot)}</b></td><td class="num">${peso(totP)}</td><td class="num">${pill(totP > 0 ? tot / totP * 100 : null)}</td></tr></tfoot></table></div></div></div>`;
  $('#t10Wrap').style.height = Math.max(260, top.length * 44 + 60) + 'px';
  mk('top10Chart', barCfg(top.map((c, i) => `${i + 1}. ${c.name.length > 26 ? c.name.slice(0, 25) + '…' : c.name}`), top, { horizontal: true }));
}

/* ---------- boot ---------- */
async function boot() {
  $('#refreshBtn').addEventListener('click', async () => {
    const b = $('#refreshBtn'); b.classList.add('spinning');
    try { await loadData(); render(); } finally { b.classList.remove('spinning'); }
  });
  $('#resetBtn').addEventListener('click', () => { resetSel(); FILTERS.forEach(f => syncDropdown(f.id)); render(); });
  await loadData(); render();
}
boot();
})();
