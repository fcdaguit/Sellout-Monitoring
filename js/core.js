/* Pure data + analytics logic (no DOM). Loaded in the browser as window.Core, and in Node for tests. */
(function (root) {
'use strict';

function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  text = String(text).replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

function num(v) {
  if (v == null) return 0;
  let s = String(v).trim(); if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[^0-9.]/g, '');
  const n = parseFloat(s); if (!isFinite(n)) return 0;
  return neg ? -n : n;
}
const norm = h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '');

// "RM4-Kim Mart Codera" -> {code:'RM4', name:'Kim Mart Codera', pos:'RM'}
function splitSalesperson(sp) {
  const m = String(sp).match(/^\s*([A-Za-z]+)\s*([0-9]*)\s*[-–]\s*(.+)$/);
  if (m) return { pos: m[1].toUpperCase(), name: m[3].trim() };
  return { pos: 'Unassigned', name: String(sp).trim() };
}

function csvToRows(text) {
  const t = parseCSV(text); if (t.length < 2) return [];
  const idx = {}; t[0].forEach((h, i) => { idx[norm(h)] = i; });
  const get = (r, k) => (idx[k] == null ? '' : (r[idx[k]] || '').trim());
  const out = [];
  for (let i = 1; i < t.length; i++) {
    const r = t[i];
    const sp = get(r, 'salesperson') || get(r, 'salesman'); if (!sp) continue;
    const wkRaw = get(r, 'periodweek') || get(r, 'week') || get(r, 'period'); if (!wkRaw) continue;
    const parts = splitSalesperson(sp);
    const wm = wkRaw.match(/(\d+)/);
    const code = get(r, 'customercode');
    out.push({
      sp, sm: parts.name, pos: get(r, 'position') || parts.pos,
      cust: code || get(r, 'customername'), custName: get(r, 'customername') || code,
      ch: get(r, 'channel') || 'Unassigned', wk: wkRaw, wn: wm ? parseInt(wm[1], 10) : 0,
      p: num(get(r, 'projection')), a: num(get(r, 'actual'))
    });
  }
  return out;
}

function sortWeeks(weeks) {
  return weeks.slice().sort((a, b) => (a.wn - b.wn) || a.wk.localeCompare(b.wk)).map(w => w.wk);
}
function weekList(rows) {
  const m = new Map(); rows.forEach(r => { if (!m.has(r.wk)) m.set(r.wk, { wk: r.wk, wn: r.wn }); });
  return sortWeeks([...m.values()]);
}
// Latest week that has any non-zero sell-out; falls back to last week listed.
function latestWeek(rows) {
  const weeks = weekList(rows); const act = new Map();
  rows.forEach(r => act.set(r.wk, (act.get(r.wk) || 0) + r.a));
  for (let i = weeks.length - 1; i >= 0; i--) if (act.get(weeks[i]) > 0) return weeks[i];
  return weeks[weeks.length - 1] || null;
}

function agg(rows, keyFn, extra) {
  const m = new Map();
  rows.forEach(r => {
    const k = keyFn(r); let o = m.get(k);
    if (!o) { o = { key: k, p: 0, a: 0, n: 0 }; if (extra) Object.assign(o, extra(r)); m.set(k, o); }
    o.p += r.p; o.a += r.a; o.n++;
  });
  m.forEach(o => { o.v = o.a - o.p; o.ach = o.p > 0 ? o.a / o.p * 100 : null; });
  return [...m.values()];
}

const DEFAULT_TH = { green: 100, yellow: 90 };
function status(ach, th) {
  th = th || DEFAULT_TH;
  if (ach == null) return 'gray';
  if (ach >= th.green) return 'green';
  if (ach >= th.yellow) return 'yellow';
  return 'red';
}

// Lines = (salesman, account, channel) totals over the selected weeks. Shortfall = max(0, projection - actual).
function buildLines(rows) {
  const lines = agg(rows, r => r.sp + '\u0001' + r.cust + '\u0001' + r.ch, r => ({ sp: r.sp, sm: r.sm, cust: r.cust, name: r.custName, ch: r.ch, pos: r.pos }));
  lines.forEach(l => { l.s = Math.max(0, l.p - l.a); });
  return lines;
}
const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);

function groupShort(lines, keyFn, total) {
  const m = new Map();
  lines.forEach(l => { const k = keyFn(l); m.set(k, (m.get(k) || 0) + l.s); });
  return (k) => ({ short: m.get(k) || 0, share: total > 0 ? (m.get(k) || 0) / total * 100 : 0 });
}

function analyze(rows, th) {
  th = th || DEFAULT_TH;
  const P = sum(rows, r => r.p), A = sum(rows, r => r.a);
  const lines = buildLines(rows);
  const totalShort = sum(lines, l => l.s);
  const sms = agg(rows, r => r.sp, r => ({ name: r.sm, pos: r.pos }));
  const chs = agg(rows, r => r.ch);
  const poss = agg(rows, r => r.pos);
  const accs = agg(rows, r => r.cust, r => ({ name: r.custName }));
  const smShort = groupShort(lines, l => l.sp, totalShort);
  const chShort = groupShort(lines, l => l.ch, totalShort);
  const accShort = groupShort(lines, l => l.cust, totalShort);
  [sms, chs, poss, accs].forEach(g => g.forEach(o => { o.status = status(o.ach, th); }));
  sms.forEach(o => Object.assign(o, smShort(o.key)));
  chs.forEach(o => Object.assign(o, chShort(o.key)));
  accs.forEach(o => Object.assign(o, accShort(o.key)));
  const byAchAsc = (a, b) => (a.ach - b.ach) || (b.s - a.s);
  const withProj = g => g.filter(o => o.p > 0);

  const smRank = withProj(sms).sort(byAchAsc);
  const chRank = withProj(chs).sort(byAchAsc);
  const accRank = withProj(accs).sort(byAchAsc);

  const out = {
    P, A, V: A - P, ach: P > 0 ? A / P * 100 : null, totalShort, lines,
    activeSm: sms.filter(o => o.a > 0).length, totalSm: sms.length,
    activeAcc: accs.filter(o => o.a > 0).length, totalAcc: accs.length,
    sms, chs, poss, accs,
    topSm: smRank.length ? smRank[smRank.length - 1] : null, lowSm: smRank.length ? smRank[0] : null,
    topCh: chRank.length ? chRank[chRank.length - 1] : null, lowCh: chRank.length ? chRank[0] : null,
    top5Acc: accs.slice().sort((a, b) => b.a - a.a).slice(0, 5),
    low5Acc: accRank.slice(0, 5),
    contrib: {
      sm: sms.slice().sort((a, b) => b.short - a.short).filter(o => o.short > 0).slice(0, 3),
      ch: chs.slice().sort((a, b) => b.short - a.short).filter(o => o.short > 0).slice(0, 3),
      acc: accs.slice().sort((a, b) => b.short - a.short).filter(o => o.short > 0).slice(0, 3)
    }
  };
  const gaps = g => ({
    pos: g.filter(o => o.v > 0).sort((a, b) => b.v - a.v).slice(0, 3),
    neg: g.filter(o => o.v < 0).sort((a, b) => a.v - b.v).slice(0, 3)
  });
  out.variance = { sm: gaps(sms), ch: gaps(chs), acc: gaps(accs) };
  if (out.topSm && out.lowSm && out.topSm.key === out.lowSm.key) out.lowSm = null;
  if (out.topCh && out.lowCh && out.topCh.key === out.lowCh.key) out.lowCh = null;
  return out;
}

// Why is a salesman (or channel) off target? Computed from the lines inside the group.
function explainGroup(lines, pred) {
  const mine = lines.filter(pred);
  const P = sum(mine, l => l.p), A = sum(mine, l => l.a), short = sum(mine, l => l.s);
  const chm = agg(mine, l => l.ch).map(o => ({ ch: o.key, short: sum(mine.filter(l => l.ch === o.key), l => l.s) }))
    .filter(o => o.short > 0).sort((a, b) => b.short - a.short);
  const zero = mine.filter(l => l.p > 0 && l.a <= 0);
  const miss = mine.filter(l => l.p > 0 && l.a / l.p * 100 < 90);
  const accs = mine.slice().sort((a, b) => b.s - a.s).filter(l => l.s > 0);
  return {
    P, A, short, accounts: mine.length, zeroCount: zero.length, zeroProj: sum(zero, l => l.p),
    missCount: miss.length, topCh: chm[0] || null,
    topAcc: accs.slice(0, 3), topAccShare: short > 0 ? sum(accs.slice(0, 3), l => l.s) / short * 100 : 0,
    bestAcc: mine.slice().sort((a, b) => (b.a - b.p) - (a.a - a.p)).filter(l => l.a > l.p)[0] || null
  };
}

// Top-N customers for ONE salesman ranked by total sell-out, with weekly actual vs projection.
function topCustomers(rows, sp, weeks, n) {
  const mine = rows.filter(r => r.sp === sp);
  const accs = agg(mine, r => r.cust, r => ({ name: r.custName, ch: r.ch }))
    .sort((a, b) => b.a - a.a).slice(0, n || 10);
  const wkMap = new Map();
  mine.forEach(r => { const k = r.cust + '\u0001' + r.wk; const o = wkMap.get(k) || { p: 0, a: 0 }; o.p += r.p; o.a += r.a; wkMap.set(k, o); });
  accs.forEach(c => { c.weeks = weeks.map(w => wkMap.get(c.key + '\u0001' + w) || { p: 0, a: 0 }); c.status = status(c.ach); });
  return accs;
}

root.Core = { parseCSV, num, csvToRows, splitSalesperson, weekList, latestWeek, agg, status, analyze, explainGroup, topCustomers, sum };
if (typeof module !== 'undefined') module.exports = root.Core;
})(typeof window !== 'undefined' ? window : globalThis);
