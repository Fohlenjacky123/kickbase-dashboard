/* ============================================================
   Kickbase Dashboard - Anwendungslogik
   Reine Browser-App: spricht direkt mit api.kickbase.com.
   Kein eigener Server, keine Weitergabe von Zugangsdaten.
   ============================================================ */
(function () {
'use strict';

const API = 'https://api.kickbase.com';
const LS_TOKEN = 'kb_token', LS_THEME = 'kb_theme', LS_LEAGUE = 'kb_league';

/* ---------- Kurzschreibweisen & Formatierung ---------- */
const $  = (s, r) => (r || document).querySelector(s);
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

const nf  = new Intl.NumberFormat('de-DE');
const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function eur(v) {
  if (v == null || isNaN(v)) return '–';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return s + nf2.format(a / 1e6) + ' Mio €';
  if (a >= 1e3) return s + nf.format(Math.round(a / 1e3)) + ' Tsd €';
  return s + nf.format(a) + ' €';
}
function eurShort(v) {
  if (v == null || isNaN(v)) return '–';
  if (Math.round(v) === 0) return '0 €';
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e6) return s + nf1.format(a / 1e6) + ' Mio';
  if (a >= 1e3) return s + Math.round(a / 1e3) + ' Tsd';
  return s + nf.format(a);
}
const num = v => { if (v == null || isNaN(v)) return '–'; const r = Math.round(v); return nf.format(r === 0 ? 0 : r); };
function dmy(d) { const x = new Date(d); return isNaN(x) ? '–' : x.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' }); }
function dmyhm(d) { const x = new Date(d); return isNaN(x) ? '–' : x.toLocaleString('de-DE', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (isNaN(s)) return '';
  if (s < 60) return 'gerade eben';
  if (s < 3600) return Math.floor(s / 60) + ' Min';
  if (s < 86400) return Math.floor(s / 3600) + ' Std';
  return Math.floor(s / 86400) + ' Tg';
}
function countdown(sec) {
  if (sec == null) return '–';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? h + ' Std ' + m + ' Min' : m + ' Min';
}
const dayToDate = d => new Date(d * 86400000);
const cdnImg = p => p ? (/^https?:/.test(p) ? p : 'https://kickbase.b-cdn.net/' + p) : '';

const POS  = { 1: 'TW', 2: 'ABW', 3: 'MF', 4: 'ANG' };
const POSL = { 1: 'Torwart', 2: 'Abwehr', 3: 'Mittelfeld', 4: 'Angriff' };
const STATUS = {
  0:  ['Fit', 'var(--good)'],       1:  ['Verletzt', 'var(--crit)'],
  2:  ['Angeschlagen', 'var(--warn)'], 4: ['Aufbautraining', 'var(--serious)'],
  8:  ['Gesperrt', 'var(--crit)'],  16: ['Gelb-gesperrt', 'var(--warn)'],
  32: ['Abwesend', 'var(--muted)'], 64: ['Nicht im Kader', 'var(--muted)'],
  128:['Unbekannt', 'var(--muted)']
};
const statusOf = s => STATUS[s] || ['Status ' + s, 'var(--muted)'];
const SERIES = ['--s1','--s2','--s3','--s4','--s5','--s6','--s7','--s8'];
const sc = i => 'var(' + SERIES[i % 8] + ')';

function deltaHtml(v, fmt) {
  if (v == null || v === 0 || isNaN(v)) return '<span class="delta flat">–</span>';
  const f = fmt || eurShort;
  return '<span class="delta ' + (v > 0 ? 'up' : 'down') + '">' + (v > 0 ? '▲' : '▼') + ' ' + f(Math.abs(v)) + '</span>';
}

/* ---------- Kleine UI-Helfer ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
let busyN = 0;
function busy(on) {
  busyN = Math.max(0, busyN + (on ? 1 : -1));
  $('#loadbar').classList.toggle('on', busyN > 0);
  $('#refreshBtn').classList.toggle('busy', busyN > 0);
}

/* ============================================================
   API-Zugriff
   ============================================================ */
const api = {
  token: null,
  demo: false,
  cache: new Map(),

  setToken(t) { this.token = t; },

  async raw(path, opts) {
    const o = opts || {};
    const r = await fetch(API + path, {
      method: o.method || 'GET',
      headers: Object.assign(
        { 'Accept': 'application/json' },
        this.token ? { 'Authorization': 'Bearer ' + this.token } : {},
        o.body ? { 'Content-Type': 'application/json' } : {}
      ),
      body: o.body ? JSON.stringify(o.body) : undefined
    });
    if (r.status === 401) { const e = new Error('unauthorized'); e.code = 401; throw e; }
    if (!r.ok) { const e = new Error('HTTP ' + r.status + ' · ' + path); e.code = r.status; throw e; }
    const txt = await r.text();
    return txt ? JSON.parse(txt) : null;
  },

  // GET mit Zwischenspeicher; null statt Fehler, damit eine kaputte
  // Teilabfrage nie das ganze Dashboard blockiert
  async get(path, ttl) {
    const c = this.cache.get(path);
    if (c && Date.now() - c.t < (ttl == null ? 120000 : ttl)) return c.v;
    try {
      const v = await this.raw(path);
      this.cache.set(path, { t: Date.now(), v });
      return v;
    } catch (e) {
      if (e.code === 401) throw e;
      console.warn('API-Abfrage fehlgeschlagen:', path, e.message);
      return null;
    }
  },

  clearCache() { this.cache.clear(); },

  async login(em, pass) {
    return this.raw('/v4/user/login', { method: 'POST', body: { em, pass, loy: false, rep: {} } });
  }
};

// Begrenzte Parallelität, damit die API nicht überrannt wird
async function pool(items, worker, limit) {
  const lim = limit || 6, out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(lim, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await worker(items[k], k); }
  }));
  return out;
}

/* ============================================================
   Datenspeicher
   ============================================================ */
const S = {
  leagues: [], leagueId: null, user: null,
  me: null, budget: null, ranking: null, squad: null, market: null,
  overview: null, feed: null, myeleven: null,
  competition: null, compTable: null, matchdays: null, compPlayers: null,
  managers: {},      // userId -> {dashboard, performance, squad, transfers}
  players: {},       // playerId -> {detail, mvHistory, performance}
  meId: null, curday: 1, loadedAt: null,
  get league() { return this.leagues.find(l => String(l.i) === String(this.leagueId)); }
};

/* ---------- Marktwert-Verlauf (Zeitraum-Fallback) ---------- */
const MV_TF = ['365', '92', '30', '1'];
let mvTf = null;
async function loadMv(pid) {
  const base = '/v4/leagues/' + S.leagueId + '/players/' + pid + '/marketValue/';
  if (mvTf) { const r = await api.get(base + mvTf, 6e5); if (r) return r; }
  for (const tf of MV_TF) {
    const r = await api.get(base + tf, 6e5);
    if (r && r.it && r.it.length) { mvTf = tf; return r; }
  }
  return null;
}

/* ============================================================
   Diagramme (SVG, ohne Fremdbibliotheken)
   ============================================================ */
const tipEl = () => $('#tip');
function showTip(html, x, y) {
  const t = tipEl(); t.innerHTML = html; t.classList.add('on');
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 12;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 18;
  t.style.left = Math.max(8, left) + 'px'; t.style.top = top + 'px';
}
const hideTip = () => tipEl().classList.remove('on');

function niceTicks(min, max, n) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min, step0 = span / (n || 4);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/**
 * Liniendiagramm mit Fadenkreuz und Tooltip.
 * series: [{ name, color, points:[{x,y,label}] }]
 */
function lineChart(host, series, opts) {
  const o = Object.assign({ height: 260, fmtY: num, fmtX: v => v, yZero: false, area: false }, opts || {});
  host.innerHTML = '';
  const live = series.filter(s => s.points && s.points.length && !s.hidden);
  if (!live.length) { host.appendChild(el('div', 'empty', 'Keine Daten vorhanden.')); return; }

  const box = el('div', 'chart-box');
  const W = 1000, H = o.height, P = { t: 12, r: 14, b: 26, l: 56 };
  const xs = live.flatMap(s => s.points.map(p => p.x));
  const ys = live.flatMap(s => s.points.map(p => p.y));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (o.yZero) y0 = Math.min(0, y0);
  const pad = (y1 - y0) * 0.08 || Math.abs(y1 * 0.1) || 1;
  y0 -= pad; y1 += pad;
  const sx = v => P.l + (x1 === x0 ? 0.5 : (v - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = v => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);

  let g = '';
  niceTicks(y0, y1, 4).forEach(t => {
    g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + sy(t).toFixed(1) + '" y2="' + sy(t).toFixed(1) + '" stroke="var(--grid)" stroke-width="1"/>' +
         '<text x="' + (P.l - 8) + '" y="' + (sy(t) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="var(--muted)">' + esc(o.fmtY(t)) + '</text>';
  });
  const xt = live[0].points;
  [0, Math.floor(xt.length / 2), xt.length - 1].filter((v, i, a) => a.indexOf(v) === i && xt[v]).forEach(i => {
    g += '<text x="' + sx(xt[i].x).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle" font-size="11" fill="var(--muted)">' + esc(o.fmtX(xt[i].x, xt[i])) + '</text>';
  });
  g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + sy(Math.max(y0, Math.min(y1, 0))).toFixed(1) + '" y2="' + sy(Math.max(y0, Math.min(y1, 0))).toFixed(1) + '" stroke="var(--baseline)" stroke-width="1"/>';

  live.forEach((s, i) => {
    const col = s.color || sc(i);
    const d = s.points.map((p, k) => (k ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
    if (o.area && live.length === 1) {
      const base = sy(Math.max(y0, Math.min(y1, 0)));
      g += '<path d="' + d + ' L' + sx(s.points[s.points.length - 1].x).toFixed(1) + ' ' + base.toFixed(1) +
           ' L' + sx(s.points[0].x).toFixed(1) + ' ' + base.toFixed(1) + ' Z" fill="' + col + '" opacity=".12"/>';
    }
    g += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    if (s.points.length <= 40) {
      s.points.forEach(p => {
        g += '<circle cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="3.2" fill="' + col + '" stroke="var(--surface-1)" stroke-width="2"/>';
      });
    }
  });
  g += '<line id="cross" x1="0" x2="0" y1="' + P.t + '" y2="' + (H - P.b) + '" stroke="var(--baseline)" stroke-width="1" opacity="0"/>';

  box.innerHTML = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' + g + '</svg>';
  host.appendChild(box);

  // Fadenkreuz + Tooltip
  const svg = box.querySelector('svg'), cross = box.querySelector('#cross');
  const idxOf = px => {
    const vx = x0 + (px - P.l) / (W - P.l - P.r) * (x1 - x0);
    let best = 0, bd = Infinity;
    live[0].points.forEach((p, i) => { const d = Math.abs(p.x - vx); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const move = ev => {
    const r = svg.getBoundingClientRect();
    const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
    const px = (cx - r.left) / r.width * W;
    if (px < P.l - 6 || px > W - P.r + 6) { hideTip(); cross.setAttribute('opacity', '0'); return; }
    const i = idxOf(px), ref = live[0].points[i];
    cross.setAttribute('x1', sx(ref.x)); cross.setAttribute('x2', sx(ref.x)); cross.setAttribute('opacity', '.55');
    let h = '<div class="tt-h">' + esc(ref.label || o.fmtX(ref.x, ref)) + '</div>';
    live.forEach((s, k) => {
      const p = s.points[i] || s.points.find(q => q.x === ref.x);
      if (!p) return;
      h += '<div class="tt-r"><span class="k"><i class="legend sw" style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' +
           (s.color || sc(k)) + '"></i>' + esc(s.name) + '</span><span class="v">' + esc(o.fmtY(p.y)) + '</span></div>';
    });
    showTip(h, cx, cy);
  };
  svg.addEventListener('mousemove', move);
  svg.addEventListener('touchmove', ev => { move(ev); ev.preventDefault(); }, { passive: false });
  svg.addEventListener('mouseleave', () => { hideTip(); cross.setAttribute('opacity', '0'); });
  box.addEventListener('touchend', () => { hideTip(); cross.setAttribute('opacity', '0'); });

  // Legende (ab 2 Serien Pflicht, klickbar zum Aus-/Einblenden)
  if (series.length > 1) {
    const lg = el('div', 'legend');
    series.forEach((s, i) => {
      const it = el('div', 'it' + (s.hidden ? ' off' : ''));
      it.innerHTML = '<span class="sw" style="background:' + (s.color || sc(i)) + '"></span>' + esc(s.name);
      it.onclick = () => { s.hidden = !s.hidden; lineChart(host, series, o); };
      lg.appendChild(it);
    });
    host.appendChild(lg);
  }
}

/** Waagerechtes Balkendiagramm */
function barChart(host, rows, opts) {
  const o = Object.assign({ fmt: num, color: null, max: null }, opts || {});
  host.innerHTML = '';
  if (!rows.length) { host.appendChild(el('div', 'empty', 'Keine Daten vorhanden.')); return; }
  const max = o.max != null ? o.max : Math.max(...rows.map(r => Math.abs(r.value)), 1);
  const t = el('table');
  const tb = el('tbody');
  rows.forEach((r, i) => {
    const tr = el('tr');
    // Eine Farbe für Ranglisten: die Reihenfolge trägt die Aussage, nicht der Farbton.
    // Nur wo Farbe echte Bedeutung hat (Position, Gewinn/Verlust), wird sie gesetzt.
    const col = r.color || o.color || 'var(--s1)';
    tr.innerHTML =
      '<td style="width:38%">' + (r.img ? '<span class="player-cell"><img class="ava sm" src="' + esc(cdnImg(r.img)) + '" alt="" onerror="this.style.visibility=\'hidden\'"><span class="pname">' + esc(r.label) + '</span></span>' : '<span class="pname">' + esc(r.label) + '</span>') + '</td>' +
      '<td><div class="bar-track"><div class="bar-fill" style="width:' + (Math.abs(r.value) / max * 100).toFixed(1) + '%;background:' + col + '"></div></div></td>' +
      '<td class="num" style="width:1%">' + esc(o.fmt(r.value)) + '</td>';
    if (r.onClick) { tr.className = 'clickable'; tr.onclick = r.onClick; }
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  host.appendChild(t);
}

/** Miniatur-Verlauf ohne Achsen */
function sparkline(points, color, w, h) {
  if (!points || points.length < 2) return '';
  const W = w || 70, H = h || 22;
  const ys = points.map(p => p.y), mn = Math.min(...ys), mx = Math.max(...ys);
  const sx = i => (i / (points.length - 1)) * (W - 2) + 1;
  const sy = v => H - 2 - (mx === mn ? 0.5 : (v - mn) / (mx - mn)) * (H - 4);
  const d = points.map((p, i) => (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
  return '<svg width="' + W + '" height="' + H + '" style="vertical-align:middle;overflow:visible">' +
         '<path d="' + d + '" fill="none" stroke="' + (color || 'var(--s1)') + '" stroke-width="1.6" stroke-linejoin="round"/></svg>';
}

/* ============================================================
   Wiederverwendbare Bausteine
   ============================================================ */
function statCard(label, value, sub) {
  return '<div class="stat"><div class="lbl">' + esc(label) + '</div><div class="val">' + value + '</div>' +
         (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
}
function card(title, hint, bodyHtml, headExtra) {
  return '<div class="card"><div class="card-head"><h2>' + esc(title) + '</h2>' +
         (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') +
         '<span class="spacer"></span>' + (headExtra || '') + '</div>' + bodyHtml + '</div>';
}
function playerCell(name, img, sub) {
  return '<span class="player-cell"><img class="ava" src="' + esc(cdnImg(img)) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' +
         '<span style="min-width:0"><span class="pname">' + esc(name) + '</span>' + (sub ? '<br><span class="psub">' + esc(sub) + '</span>' : '') + '</span></span>';
}
const posPill = p => '<span class="pill p' + p + '">' + (POS[p] || '?') + '</span>';
function statusPill(st) {
  const [t, c] = statusOf(st);
  return '<span class="status-dot"><i style="background:' + c + '"></i>' + esc(t) + '</span>';
}

/** Sortierbare Tabelle */
function sortTable(host, cols, rows, opts) {
  const o = Object.assign({ sort: 0, dir: 1, maxHeight: true, rowClass: null, onRow: null }, opts || {});
  const state = { k: o.sort, d: o.dir };
  function draw() {
    const sorted = rows.slice().sort((a, b) => {
      const c = cols[state.k], va = c.sortVal ? c.sortVal(a) : c.val(a), vb = c.sortVal ? c.sortVal(b) : c.val(b);
      if (typeof va === 'string' || typeof vb === 'string')
        return String(va).localeCompare(String(vb), 'de') * state.d;
      return ((va == null ? -Infinity : va) - (vb == null ? -Infinity : vb)) * state.d;
    });
    const th = cols.map((c, i) =>
      '<th class="sortable' + (c.num ? ' num' : '') + '" data-i="' + i + '">' + esc(c.label) +
      (state.k === i ? ' <span class="arr">' + (state.d > 0 ? '▲' : '▼') + '</span>' : '') + '</th>').join('');
    const body = sorted.map(r =>
      '<tr class="' + (o.rowClass ? o.rowClass(r) : '') + (o.onRow ? ' clickable' : '') + '" data-id="' + esc(r._id == null ? '' : r._id) + '">' +
      cols.map(c => '<td class="' + (c.num ? 'num' : '') + '">' + (c.html ? c.html(r) : esc(c.val(r) == null ? '–' : c.val(r))) + '</td>').join('') +
      '</tr>').join('');
    host.innerHTML = '<div class="tbl-wrap"><div class="' + (o.maxHeight ? 'tbl-scroll' : '') + '"><table><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
    host.querySelectorAll('th.sortable').forEach(t => t.onclick = () => {
      const i = +t.dataset.i;
      if (state.k === i) state.d *= -1; else { state.k = i; state.d = cols[i].num ? -1 : 1; }
      draw();
    });
    if (o.onRow) host.querySelectorAll('tbody tr').forEach(tr => tr.onclick = () => o.onRow(tr.dataset.id));
  }
  draw();
}

/* ============================================================
   Ansichten
   ============================================================ */
const TABS = [
  ['home',      'Überblick'],
  ['preseason', 'Vorsaison'],
  ['table',    'Liga-Tabelle'],
  ['squad',    'Mein Kader'],
  ['market',   'Transfermarkt'],
  ['buli',     'Bundesliga'],
  ['liga',     'Regeln & Battles']
];
let curTab = 'home';

function renderTabs() {
  const t = $('#tabs'); t.innerHTML = '';
  TABS.forEach(([k, l]) => {
    const b = el('button', 'tab' + (k === curTab ? ' on' : ''), esc(l));
    b.onclick = () => { curTab = k; location.hash = k; renderTabs(); renderAll(); };
    t.appendChild(b);
  });
}

function renderAll() {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + curTab));
  const fn = { home: vHome, preseason: vPreseason, table: vTable, squad: vSquad, market: vMarket,
               buli: vBuli, liga: vLiga }[curTab];
  if (fn) { try { fn($('#v-' + curTab)); } catch (e) { console.error(e); $('#v-' + curTab).innerHTML = '<div class="card"><div class="empty">Diese Ansicht konnte nicht gezeichnet werden.<br><small>' + esc(e.message) + '</small></div></div>'; } }
}

/* ---------- Mein Manager-Eintrag ---------- */
function meRow() {
  if (!S.ranking || !S.ranking.us) return null;
  return S.ranking.us.find(u => String(u.i) === String(S.meId)) || null;
}

/* Kickbase meldet nach einem Ligareset "sp" und "tv" als 0, obwohl die
   Punkte je Spieltag vorhanden sind. Dann lieber selbst rechnen, sonst
   steht "0 Punkte" neben einem gefüllten Verlaufsdiagramm. */
const lpSum = u => ((u && u.lp) || []).reduce((a, c) => a + (c || 0), 0);
function spOf(u) {
  if (!u) return 0;
  return (u.sp != null && u.sp > 0) ? u.sp : lpSum(u);
}
function tvOf(u) {
  if (u && u.tv) return u.tv;
  // Ersatzweise der Kaderwert - für den eigenen Kader kennen wir ihn genau
  if (u && String(u.i) === String(S.meId)) {
    const sq = (S.squad && S.squad.it) || [];
    if (sq.length) return sq.reduce((s, p) => s + (p.mv || 0), 0);
  }
  const m = S.managers[u && u.i];
  const it = m && m.squad && m.squad.it;
  if (it && it.length) return it.reduce((s, p) => s + (p.mv || 0), 0);
  return (u && u.tv) || 0;
}

/* Kickbase zeigt den Kontostand anderer Manager grundsätzlich nicht an -
   /v4/leagues/{id}/me/budget liefert laut API-Doku nur den eigenen Wert.
   Er lässt sich aber aus öffentlichen Daten annähern (wie es auch das
   Community-Tool "Ligabase" macht): Startbudget + tägliche Auflaufprämie
   seit dem letzten Reset ± alle bekannten Transfers. Die Auflaufprämie
   ist offiziell gestaffelt (help.kickbase.com/help/staffelung-auflaufpramie):
   Tag 1-10 steigt sie in 10.000-€-Schritten, ab Tag 11 konstant 100.000 €/Tag -
   vorausgesetzt, der Manager holt sie sich jeden Tag ab. Wer einen Tag
   aussetzt, fällt zurück auf 10.000 € - das kann diese Schätzung nicht
   wissen, daher ist es eine Annäherung, kein exakter Wert. */
function letzterReset() {
  const L = window.LIGA, jetzt = Date.now();
  const resets = ((L && L.termine) || [])
    .filter(t => /reset/i.test(t.t))
    .map(t => new Date(t.d).getTime())
    .filter(ms => !isNaN(ms) && ms <= jetzt);
  return resets.length ? Math.max(...resets) : null;
}
function tageSeitReset() {
  const r = letzterReset();
  return r == null ? 0 : Math.max(0, Math.floor((Date.now() - r) / 86400000));
}
/* Kickbase liefert bei /managers/{id}/transfer die komplette Transferhistorie
   eines Managers über alle Saisons hinweg - nicht nur seit dem letzten Reset.
   Ohne diesen Filter fließen Käufe/Verkäufe aus Vorjahren mit in den "seit
   Ligastart"-Saldo ein, wodurch Manager mit langer Historie einen völlig
   falschen Kontostand bekämen, obwohl seit dem Reset noch gar nichts passiert ist. */
function seitReset(transfers) {
  const r = letzterReset();
  if (!transfers) return [];
  if (r == null) return transfers;
  return transfers.filter(t => { const ms = new Date(t.dt).getTime(); return !isNaN(ms) && ms >= r; });
}
function auflaufpraemie(tage) {
  const schritt = 100000 / 10, rampTage = 10, voll = 100000;
  if (tage <= 0) return 0;
  if (tage <= rampTage) return schritt * tage * (tage + 1) / 2;
  return schritt * rampTage * (rampTage + 1) / 2 + (tage - rampTage) * voll;
}
function startBudget() {
  // Fester Wert aus dem Regelwerk (liga.js): Ligastart & Soft-Reset setzen auf 200 Mio zurück.
  // S.budget ist die private Budget-Antwort des eigenen Kontos und enthält keinen
  // verlässlichen "Startbudget"-Wert für die ganze Liga - ein Feld wie "bs" darf
  // hier nicht geraten verwendet werden, sonst rutscht bei jedem Manager außer
  // einem selbst ein falscher (viel zu kleiner) Kontostand rein.
  return 200e6;
}
function budgetVon(uid) {
  if (String(uid) === String(S.meId)) {
    const b = (S.budget && S.budget.b) != null ? S.budget.b : (S.me && S.me.b);
    return b != null ? { wert: b, echt: true } : null;
  }
  const m = S.managers[uid];
  const tr = m && m.transfers && m.transfers.it;
  if (!tr) return null;
  const saldo = seitReset(tr).reduce((s, t) => s + (t.tty === 1 ? -(t.trp || 0) : (t.trp || 0)), 0);
  return { wert: startBudget() + auflaufpraemie(tageSeitReset()) + saldo, echt: false };
}
function kaderGroesseVon(uid) {
  if (String(uid) === String(S.meId)) {
    const sq = (S.squad && S.squad.it) || [];
    if (sq.length) return sq.length;
  }
  const it = S.managers[uid] && S.managers[uid].squad && S.managers[uid].squad.it;
  return it ? it.length : null;
}

/* ---------- 1) Überblick ---------- */
function vHome(v) {
  // Kam gar nichts an, liegt es fast immer an einer fehlenden Liga-ID -
  // dann lieber deutlich sagen als lauter Striche zeigen.
  if (!S.ranking && !S.squad && !S.me) {
    v.innerHTML = card('Keine Daten empfangen', '', '<div class="empty">' +
      'Für diese Liga kam keine Antwort von Kickbase.<br><br>' +
      (S.leagueId ? 'Abgefragte Liga: <code>' + esc(S.leagueId) + '</code><br>' : 'Es ist keine Liga ausgewählt.<br>') +
      'Versuch es mit dem ⟳-Knopf oben rechts oder melde dich neu an.</div>');
    return;
  }
  const me = meRow(), us = (S.ranking && S.ranking.us) || [];
  const b = (S.budget && S.budget.b) != null ? S.budget.b : (S.me && S.me.b);
  const squad = (S.squad && S.squad.it) || [];
  const teamVal = me ? tvOf(me) : squad.reduce((s, p) => s + (p.mv || 0), 0);
  const dayVal = squad.reduce((s, p) => s + (p.sdmvt || 0), 0);
  const myPts = spOf(me);
  const played = me && me.lp ? me.lp.filter(x => x != null).length : 0;
  const avg = played ? myPts / played : null;

  let h = '<div class="grid g-stats" style="margin-bottom:16px">' +
    statCard('Mein Platz', me ? (me.spl + '.') : '–', us.length ? 'von ' + us.length + ' Managern' : '') +
    statCard('Gesamtpunkte', me ? num(myPts) : '–', avg ? 'Ø ' + num(avg) + ' je Spieltag' : 'Saison noch nicht gestartet') +
    statCard('Teamwert', eur(teamVal), deltaHtml(dayVal) + ' <span style="color:var(--muted)">heute</span>') +
    statCard('Budget', eur(b), b != null && teamVal ? 'Gesamt ' + eurShort(b + teamVal) : '') +
    '</div>';

  // Regelverstöße gehören ganz nach oben - eine Sanktion kostet einen
  // Aufstellungsplatz und ist teurer als jede verpasste Auswertung.
  if (window.ligaCheck) {
    const ti = teamInfo();
    const krit = window.ligaCheck(squad, ti.names, ti.ids).filter(b => b.art === 'kritisch');
    if (krit.length) {
      h += '<div class="card-head"><h2 style="color:var(--crit)">⚠ Regelverstoß im Kader</h2>' +
           '<span class="hint">Sanktion droht – Details im Reiter „Regeln & Battles“</span></div>' + ruleCards(krit);
    }
  }

  // Top-Bewegungen im eigenen Kader
  const movers = squad.slice().sort((a, b) => (b.sdmvt || 0) - (a.sdmvt || 0));
  h += '<div class="grid g-2">' +
    card('Tagesgewinner im Kader', 'Marktwert heute', '<div id="c-home3"></div>') +
    card('Tagesverlierer im Kader', 'Marktwert heute', '<div id="c-home4"></div>') + '</div>';

  // Battles
  if (S.overview && S.overview.btls && S.overview.btls.length) {
    h += card('Ligawertungen', '', '<div class="tbl-wrap"><table><tbody>' +
      S.overview.btls.map(b2 => '<tr><td>' + esc(b2.n) + '<br><span class="psub">' + esc(b2.d || '') + '</span></td>' +
        '<td>' + (b2.u ? playerCell(b2.u.n, b2.u.uim) : '–') + '</td></tr>').join('') +
      '</tbody></table></div>');
  }

  v.innerHTML = h;
  barChart($('#c-home3', v), movers.filter(p => (p.sdmvt || 0) > 0).slice(0, 6).map(p => ({
    label: p.n, value: p.sdmvt, img: p.pim, color: 'var(--good)', onClick: () => openPlayer(p.i)
  })), { fmt: eurShort });
  barChart($('#c-home4', v), movers.filter(p => (p.sdmvt || 0) < 0).slice(-6).reverse().map(p => ({
    label: p.n, value: p.sdmvt, img: p.pim, color: 'var(--crit)', onClick: () => openPlayer(p.i)
  })), { fmt: eurShort });
}

/* ---------- 1b) Vorsaison — Titelseite bis zum Bundesliga-Start ----------
   Vor dem ersten Spieltag sind Punkte und Tabelle bedeutungslos - hier zählt
   nur der Kaderaufbau: wer hat wie viel Geld und wie viele Spieler, wessen
   Kader ist regelkonform, wer hat welche Vereine gehäuft, wer handelt gerade
   aktiv, und welche guten Spieler sind noch frei. Braucht die Hintergrund-
   Ladung aller Manager (squad + transfers) - bis dahin zeigen Skelette. */

/* Beobachtungsliste: nur ein Array von Spieler-IDs im Browser des Nutzers,
   keine Serverkomponente nötig. */
const WL_KEY = 'kb_watchlist';
function watchlist() {
  try { return JSON.parse(localStorage.getItem(WL_KEY) || '[]'); } catch (e) { return []; }
}
function isWatched(pid) { return watchlist().indexOf(String(pid)) !== -1; }
function toggleWatch(pid) {
  const id = String(pid), wl = watchlist();
  const next = wl.indexOf(id) !== -1 ? wl.filter(x => x !== id) : wl.concat(id);
  localStorage.setItem(WL_KEY, JSON.stringify(next));
}
function watchStar(pid) {
  const on = isWatched(pid);
  return '<button class="icon-btn watch-star" data-pid="' + esc(pid) + '" title="' +
    (on ? 'Von der Beobachtungsliste entfernen' : 'Merken') + '" style="width:26px;height:26px;font-size:14px' +
    (on ? ';color:var(--accent);border-color:var(--accent)' : '') + '">' + (on ? '★' : '☆') + '</button>';
}
function wireWatchStars(host, onChange) {
  host.querySelectorAll('.watch-star').forEach(b => b.onclick = e => {
    e.stopPropagation(); toggleWatch(b.dataset.pid); if (onChange) onChange();
  });
}

/* Nachtruhe für Auktionen (Regel XI): 22-8 Uhr ruht der Gebotsbetrieb. */
function nachtruheStatus() {
  const L = window.LIGA, nr = (L && L.nachtruhe) || [22, 8];
  const start = nr[0], end = nr[1], h = new Date().getHours();
  const aktiv = start > end ? (h >= start || h < end) : (h >= start && h < end);
  const pad = n => String(n).padStart(2, '0');
  return { aktiv, start, end, label: pad(aktiv ? end : start) + ':00 Uhr' };
}

function preseasonRows() {
  const us = (S.ranking && S.ranking.us) || [];
  const ti = teamInfo();
  return us.map(u => {
    const m = S.managers[u.i] || {};
    const sq = (m.squad && m.squad.it) ||
               (String(u.i) === String(S.meId) ? ((S.squad && S.squad.it) || null) : null);
    const tr = (m.transfers && m.transfers.it) || null;
    // Nur Transfers seit dem letzten Reset zählen - die API liefert die
    // komplette Historie über alle Saisons, sonst verzerren alte Transfers
    // aus Vorjahren jeden "seit Ligastart"-Wert (Kontostand, Aktivität, …).
    const trSeit = tr ? seitReset(tr) : null;
    const bud = budgetVon(u.i);
    const tv = tvOf(u);
    const clubs = {}, posCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    (sq || []).forEach(p => {
      const t = String(p.tid || '?'); clubs[t] = (clubs[t] || 0) + 1;
      posCounts[p.pos] = (posCounts[p.pos] || 0) + 1;
    });
    const findings = sq ? window.ligaCheck(sq, ti.names, ti.ids) : null;
    const expPts = sq && sq.length ? sq.reduce((s, p) => s + (p.ap || 0), 0) : null;
    const fitCount = sq ? sq.filter(p => !p.st || p.st === 0).length : null;
    const kaufSumme = trSeit ? trSeit.filter(t2 => t2.tty === 1).reduce((s, t2) => s + (t2.trp || 0), 0) : null;
    const verkaufSumme = trSeit ? trSeit.filter(t2 => t2.tty === 2).reduce((s, t2) => s + (t2.trp || 0), 0) : null;
    const letzteTransfer = trSeit && trSeit.length ? Math.max(...trSeit.map(t2 => new Date(t2.dt).getTime())) : (tr ? 0 : null);
    return {
      u, i: u.i, n: u.n, uim: u.uim,
      sq, sqCount: sq ? sq.length : null, posCounts: sq ? posCounts : null, fitCount,
      bud, tv, netto: bud ? bud.wert + tv : null,
      kaeufe: trSeit ? trSeit.filter(t2 => t2.tty === 1).length : null,
      verkaeufe: trSeit ? trSeit.filter(t2 => t2.tty === 2).length : null,
      kaufSumme, verkaufSumme, letzteTransfer,
      tr: trSeit ? trSeit.length : null,
      clubs, findings, expPts
    };
  });
}

const preFreeState = { pos: 0 };

function vPreseason(v) {
  const rows = preseasonRows();
  if (!rows.length) { v.innerHTML = card('Vorsaison', '', '<div class="empty">Noch keine Daten - erst nach dem Laden der Liga verfügbar.</div>'); return; }
  const L = window.LIGA, kaderMax = (L && L.maxKader) || 16, maxProVerein = (L && L.maxProVerein) || 2;
  const maxTorhueter = (L && L.maxTorhueter) || 2, aufstellung = (L && L.aufstellung) || 11;
  const ti = teamInfo();
  const jetzt = Date.now();

  const buliStart = L && L.termine.find(t => /Bundesligaspieltag/i.test(t.t));
  const tageBuli = buliStart ? Math.ceil((new Date(buliStart.d).getTime() - jetzt) / 86400000) : null;
  const ns = nachtruheStatus();

  // Alle Käufe ligaweit (aus jedem Manager-Transferverlauf) - Grundlage für
  // Rekordtransfers und Mini-Feed. Nur "Kauf"-Einträge, damit jede echte
  // Transaktion nur einmal auftaucht statt doppelt (Käufer- und Verkäufersicht).
  // Nur seit dem letzten Reset, sonst tauchen Transfers aus Vorjahren auf.
  const alleKaeufe = [];
  rows.forEach(r => {
    const tr = (S.managers[r.i] && S.managers[r.i].transfers && S.managers[r.i].transfers.it) || [];
    seitReset(tr).filter(t => t.tty === 1).forEach(t => alleKaeufe.push({
      kaeufer: r.n, kaeuferId: r.i, pn: t.pn, pi: t.pi, pim: t.pim,
      trp: t.trp, verkaeufer: t.othnm, dt: t.dt
    }));
  });

  // Wer besitzt wen: primär aus dem geladenen Kader, zusätzlich aus den
  // Transferdaten ergänzt (neuester Kauf je Spieler gewinnt). Der Kader
  // eines Managers ist nach einem frischen Kauf nicht immer schon nachgeladen -
  // ohne diese Ergänzung tauchen gerade gekaufte Spieler fälschlich noch
  // in "Freie Top-Spieler" auf.
  const ownedByTransfer = {};
  alleKaeufe.forEach(t => {
    const bisher = ownedByTransfer[t.pi];
    if (!bisher || new Date(t.dt) > new Date(bisher.dt)) ownedByTransfer[t.pi] = { n: t.kaeufer, dt: t.dt };
  });
  const owned = {};
  Object.entries(ownedByTransfer).forEach(([pi, o]) => { owned[pi] = o.n; });
  rows.forEach(r => (r.sq || []).forEach(p => { owned[p.pi || p.i] = r.n; }));
  const allPlayers = (S.compPlayers && S.compPlayers.it) || null;
  const frei = allPlayers ? allPlayers.filter(p => !owned[p.i]) : null;

  const baustellen = rows.filter(r => r.sqCount != null && r.sqCount < kaderMax).length;
  const budWerte = rows.filter(r => r.bud).map(r => r.bud.wert);
  const avgBud = budWerte.length ? budWerte.reduce((s, x) => s + x, 0) / budWerte.length : null;

  let h = '<div class="grid g-stats" style="margin-bottom:16px">' +
    statCard('Bundesliga-Start', tageBuli != null ? (tageBuli <= 0 ? 'heute' : 'in ' + tageBuli + ' Tg') : '–', buliStart ? dmy(buliStart.d) : '') +
    statCard('Ø Kontostand Liga', avgBud != null ? eurShort(avgBud) : '…', 'geschätzt') +
    statCard('Freie Spieler', frei ? num(frei.length) : '…', 'noch unvergeben') +
    statCard('Kader-Baustellen', baustellen, 'Manager unter ' + kaderMax + ' Spielern') +
    statCard('Auktionen', ns.aktiv ? 'Nachtruhe' : 'offen', ns.aktiv ? 'bis ' + ns.label : 'Nachtruhe ab ' + ns.label) +
    '</div>';

  h += card('Rekordtransfer je Manager', 'teuerster Kauf seit Ligastart · Zeile anklicken für Details', '<div id="pre-t8"></div>');

  h += card('Beobachtungsliste', 'Wunschspieler merken · ★ in „Freie Top-Spieler"', '<div id="pre-wl"></div>');

  h += card('Gesamtvermögen', 'Kontostand + Teamwert · ≈ = geschätzter Kontostand', '<div id="pre-t1"></div>');

  h += '<div class="grid g-2">' +
    card('Kadergröße', 'von ' + kaderMax + ' erlaubten Plätzen', '<div id="pre-c1"></div>') +
    card('Erwartete Kaderstärke', 'Summe Vorsaison-Ø-Punkte aller Kaderspieler', '<div id="pre-c2"></div>') +
  '</div>';

  h += card('Kaderaufbau nach Position', 'Torwart-Limit ' + maxTorhueter + ' · Aufstellung braucht ' + aufstellung + ' fitte Spieler', '<div id="pre-t5"></div>');

  h += card('Regelkonformität aller Kader', 'geprüft nach ' + (L ? L.name : '') + '-Statut · Zeile anklicken für Details', '<div id="pre-t2"></div>');

  h += '<div class="grid g-2">' +
    card('Vereinsverteilung je Manager', 'Vereine mit ' + maxProVerein + ' oder mehr Spielern', '<div id="pre-t3"></div>') +
    card('Meistgekaufte Vereine', 'Spieler-Slots über die ganze Liga', '<div id="pre-c3"></div>') +
  '</div>';

  h += '<div class="grid g-2">' +
    card('Transferaktivität seit Ligastart', 'Käufe und Verkäufe je Manager', '<div id="pre-c4"></div>') +
    card('Investitionsquote', 'Netto-Ausgaben in % des Startbudgets', '<div id="pre-c5"></div>') +
  '</div>';

  h += card('Wer hat sich zuletzt gerührt?', 'Letzter Transfer je Manager', '<div id="pre-t7"></div>');

  h += card('Letzte Transfers in der Liga', alleKaeufe.length + ' Käufe seit Ligastart', '<div id="pre-t6"></div>');

  const posChips = [[0, 'Alle'], [1, 'Torwart'], [2, 'Abwehr'], [3, 'Mittelfeld'], [4, 'Angriff']]
    .map(([k, l]) => '<button class="chip' + (preFreeState.pos === k ? ' on' : '') + '" data-fpos="' + k + '">' + l + '</button>').join('');
  h += card('Freie Top-Spieler auf dem Markt', frei ? num(frei.length) + ' verfügbar · nach Vorsaison-Punkten' : 'wird geladen …',
    '<div class="chips" style="margin-bottom:14px">' + posChips + '</div><div id="pre-t4"></div>');

  v.innerHTML = h;

  // Beobachtungsliste - Leistbar-Check gegen den eigenen (echten) Kontostand + Marktwertverlauf
  const wl = watchlist();
  const wlPlayers = allPlayers ? wl.map(id => allPlayers.find(p => String(p.i) === id)).filter(Boolean) : [];
  const meinBudget = budgetVon(S.meId);
  const meinKonto = meinBudget ? meinBudget.wert : null;
  if (!allPlayers) {
    $('#pre-wl', v).innerHTML = '<div class="empty">Spielerdaten werden geladen …</div>';
  } else if (!wlPlayers.length) {
    $('#pre-wl', v).innerHTML = '<div class="empty">Noch keine Spieler gemerkt. Klick den ★-Stern neben einem Spieler in „Freie Top-Spieler".</div>';
  } else {
    const leistbarN = meinKonto != null ? wlPlayers.filter(p => p.mv <= meinKonto).length : null;
    const wlHost = $('#pre-wl', v);
    wlHost.innerHTML = (leistbarN != null ? '<div class="psub" style="margin-bottom:10px">Du kannst dir <b>' +
      leistbarN + ' von ' + wlPlayers.length + '</b> gemerkten Spielern leisten (dein Kontostand: ' + eurShort(meinKonto) + ').</div>' : '') +
      '<div id="pre-wl-t"></div>';
    sortTable($('#pre-wl-t', v), [
      { label: '★', val: () => 0, html: p => watchStar(p.i) },
      { label: 'Spieler', val: p => (p.ln || p.n), html: p => playerCell(((p.fn ? p.fn.charAt(0) + '. ' : '') + (p.ln || p.n)), p.pim, p.tn) },
      { label: 'Pos', val: p => p.pos, html: p => posPill(p.pos) },
      { label: 'Marktwert', num: true, val: p => p.mv, html: p => '<b>' + eurShort(p.mv) + '</b>' },
      { label: 'Verlauf', val: () => 0, html: p => '<span id="wl-spark-' + esc(p.i) + '"></span>' },
      { label: 'Leistbar', num: true, val: p => meinKonto == null ? -1 : (p.mv <= meinKonto ? 1 : 0),
        html: p => meinKonto == null ? '<span class="psub">–</span>' :
          (p.mv <= meinKonto ? '<span class="status-dot"><i style="background:var(--good)"></i>ja</span>'
                              : '<span class="status-dot"><i style="background:var(--crit)"></i>fehlen ' + eurShort(p.mv - meinKonto) + '</span>') },
      { label: 'Besitzer', val: p => owned[p.i] || 'frei', html: p => owned[p.i] ? esc(owned[p.i]) : '<span style="color:var(--muted)">frei</span>' }
    ], wlPlayers.map(p => Object.assign({ _id: p.i }, p)), { sort: 3, dir: -1, maxHeight: false, onRow: id => openPlayer(id) });
    wireWatchStars($('#pre-wl-t', v), () => vPreseason(v));

    // Marktwertverlauf je gemerktem Spieler wird nachgeladen (Sparkline), damit
    // die Tabelle nicht auf 10 einzelne Netzwerkabfragen warten muss.
    wlPlayers.forEach(p => {
      (api.demo ? Promise.resolve(window.KB_DEMO.playerData[p.i] && window.KB_DEMO.playerData[p.i].mvHistory) : loadMv(p.i))
        .then(mv => {
          const pts = ((mv && mv.it) || []).map(x => ({ x: x.dt, y: x.mv })).filter(x => x.y != null);
          const el2 = document.getElementById('wl-spark-' + p.i);
          if (el2 && pts.length > 1) el2.innerHTML = sparkline(pts, 'var(--s1)');
        }).catch(() => {});
    });
  }

  // Gewinn/Verlust durch Marktwertsteigerung: Marktwert minus Kaufpreis über
  // den ganzen Kader. Fällt auf den Marktwert selbst zurück, wenn der Kaufpreis
  // fehlt (z.B. Startkader) - sonst würde das wie ein Gewinn in Kaufpreis-Höhe aussehen.
  const mvGewinnVon = r => r.sq ? r.sq.reduce((s, p) => s + ((p.mv || 0) - (p.prc || p.mv || 0)), 0) : null;
  const vermCols = [
    { label: 'Manager', val: r => r.n, html: r => playerCell(r.n, r.uim) },
    { label: 'Kontostand', num: true, val: r => r.bud && r.bud.wert,
      html: r => r.bud ? '<b>' + eurShort(r.bud.wert) + '</b>' + (r.bud.echt ? '' : ' <span class="psub">≈</span>')
                       : '<span class="skel" style="display:inline-block;width:50px;height:12px"></span>' },
    { label: 'Teamwert', num: true, val: r => r.tv, html: r => eurShort(r.tv) },
    { label: 'MW-Gewinn/Verlust', num: true, val: mvGewinnVon,
      html: r => { const g = mvGewinnVon(r); return g == null ? '–' : deltaHtml(g); } },
    { label: 'Gesamt', num: true, val: r => r.netto, html: r => r.netto != null ? '<b>' + eurShort(r.netto) + '</b>' : '–' }
  ];
  sortTable($('#pre-t1', v), vermCols, rows.map(r => Object.assign({ _id: r.i }, r)),
    { sort: 4, dir: -1, rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  // Kadergröße
  const withSq = rows.filter(r => r.sqCount != null).sort((a, b) => b.sqCount - a.sqCount);
  barChart($('#pre-c1', v), withSq.map(r => ({
    label: r.n, value: r.sqCount, img: r.uim,
    color: String(r.i) === String(S.meId) ? 'var(--s1)' : 'var(--s4)', onClick: () => openManager(r.i) })),
    { fmt: v2 => v2 + ' Spieler', max: kaderMax });

  // Erwartete Kaderstärke
  const withExp = rows.filter(r => r.expPts != null).sort((a, b) => b.expPts - a.expPts);
  barChart($('#pre-c2', v), withExp.map(r => ({
    label: r.n, value: r.expPts, img: r.uim,
    color: String(r.i) === String(S.meId) ? 'var(--s1)' : 'var(--s7)', onClick: () => openManager(r.i) })),
    { fmt: v2 => num(v2) + ' Pkt' });

  // Kaderaufbau nach Position + Aufstellbereit - Zahlen als kleine farbige
  // Positions-Badges (gleiche Farben wie sonst im Dashboard) und der Gesamtplatz
  // als 16er-Slot-Leiste, damit man den Baufortschritt auf einen Blick sieht.
  const posDot = (n, pos, over) => n == null ? '<span class="skel" style="display:inline-block;width:24px;height:12px"></span>' :
    '<span class="pill p' + pos + '"' + (over ? ' style="background:var(--crit);border-color:var(--crit);color:#fff"' : '') + '>' + n + '</span>';
  const slotBar = (filled, total) => {
    let s = '<span style="display:inline-flex;gap:2px;vertical-align:middle;margin-right:8px">';
    for (let i = 0; i < total; i++) {
      s += '<span style="width:7px;height:10px;border-radius:1px;display:inline-block;background:' + (i < filled ? 'var(--accent)' : 'var(--grid)') + '"></span>';
    }
    return s + '</span>';
  };
  sortTable($('#pre-t5', v), [
    { label: 'Manager', val: r => r.n, html: r => playerCell(r.n, r.uim) },
    { label: 'TW', num: true, val: r => r.posCounts && r.posCounts[1],
      html: r => posDot(r.posCounts && r.posCounts[1], 1, r.posCounts && r.posCounts[1] > maxTorhueter) },
    { label: 'ABW', num: true, val: r => r.posCounts && r.posCounts[2], html: r => posDot(r.posCounts && r.posCounts[2], 2) },
    { label: 'MF', num: true, val: r => r.posCounts && r.posCounts[3], html: r => posDot(r.posCounts && r.posCounts[3], 3) },
    { label: 'ANG', num: true, val: r => r.posCounts && r.posCounts[4], html: r => posDot(r.posCounts && r.posCounts[4], 4) },
    { label: 'Aufstellbereit', num: true, val: r => r.fitCount,
      html: r => r.fitCount == null ? '<span class="skel" style="display:inline-block;width:60px;height:12px"></span>' :
        '<span class="status-dot"><i style="background:' + (r.fitCount >= aufstellung ? 'var(--good)' : 'var(--crit)') + '"></i>' + r.fitCount + ' / ' + aufstellung + '</span>' },
    { label: 'Gesamt', num: true, val: r => r.sqCount,
      html: r => r.sqCount == null ? '–' : slotBar(r.sqCount, kaderMax) + '<b>' + r.sqCount + '</b> / ' + kaderMax }
  ], rows.map(r => Object.assign({ _id: r.i }, r)),
    { sort: 6, dir: -1, maxHeight: false, rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  // Regelkonformität aller Kader
  const rkRows = rows.map(r => {
    const f = r.findings || [];
    return Object.assign({ _id: r.i, _krit: f.filter(x => x.art === 'kritisch'), _warn: f.filter(x => x.art !== 'kritisch') }, r);
  });
  sortTable($('#pre-t2', v), [
    { label: 'Manager', val: r => r.n, html: r => playerCell(r.n, r.uim) },
    { label: 'Status', val: r => r.sq ? r._krit.length * 100 + r._warn.length : -1,
      html: r => !r.sq ? '<span class="skel" style="display:inline-block;width:90px;height:12px"></span>' :
        r._krit.length ? '<span class="status-dot"><i style="background:var(--crit)"></i>' + r._krit.length + ' kritisch</span>' :
        r._warn.length ? '<span class="status-dot"><i style="background:var(--warn)"></i>' + r._warn.length + ' Hinweis' + (r._warn.length > 1 ? 'e' : '') + '</span>' :
        '<span class="status-dot"><i style="background:var(--good)"></i>konform</span>' },
    { label: 'Größtes Problem', val: r => ((r._krit[0] || r._warn[0] || {}).titel || ''),
      html: r => { const b = r._krit[0] || r._warn[0]; return b ? esc(b.titel) : '<span class="psub">–</span>'; } }
  ], rkRows, { sort: 1, dir: -1, maxHeight: false, rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  // Vereinsverteilung je Manager
  sortTable($('#pre-t3', v), [
    { label: 'Manager', val: r => r.n, html: r => playerCell(r.n, r.uim) },
    { label: 'Vereine (' + maxProVerein + '+)', val: r => Math.max(0, ...Object.values(r.clubs), 0),
      html: r => {
        if (!r.sq) return '<span class="skel" style="display:inline-block;width:130px;height:12px"></span>';
        const entries = Object.entries(r.clubs).filter(([, c]) => c >= maxProVerein).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return '<span class="psub">keine Häufung</span>';
        return entries.map(([tid, c]) => {
          const col = c > maxProVerein ? 'background:var(--crit);color:#fff;border-color:var(--crit)'
                    : 'background:var(--warn);color:#0c0c0e;border-color:var(--warn)';
          return '<span class="pill" style="margin:0 5px 5px 0;' + col + '">' + esc(ti.names[tid] || ('Verein ' + tid)) + ' ' + c + '×</span>';
        }).join('');
      } }
  ], rows.map(r => Object.assign({ _id: r.i }, r)),
    { sort: 1, dir: -1, maxHeight: false, rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  // Meistgekaufte Vereine ligaweit
  const clubTotals = {};
  rows.forEach(r => Object.entries(r.clubs).forEach(([tid, c]) => { clubTotals[tid] = (clubTotals[tid] || 0) + c; }));
  const clubList = Object.entries(clubTotals).map(([tid, c]) => ({ tid, c, name: ti.names[tid] || ('Verein ' + tid) }))
    .sort((a, b) => b.c - a.c).slice(0, 12);
  barChart($('#pre-c3', v), clubList.map(x => ({ label: x.name, value: x.c, color: 'var(--s3)' })),
    { fmt: v2 => v2 + '×', max: rows.length * maxProVerein });

  // Transferaktivität
  const withTr = rows.filter(r => r.tr != null).sort((a, b) => b.tr - a.tr);
  barChart($('#pre-c4', v), withTr.map(r => ({
    label: r.n + ' · ' + r.kaeufe + ' Käufe / ' + r.verkaeufe + ' Verkäufe', value: r.tr, img: r.uim,
    color: String(r.i) === String(S.meId) ? 'var(--s1)' : 'var(--s2)', onClick: () => openManager(r.i) })),
    { fmt: v2 => v2 + '× gesamt' });

  // Investitionsquote - Netto-Ausgaben (Käufe minus Verkäufe) relativ zum Startbudget.
  // Bewusst ohne die geschätzte Auflaufprämie gerechnet: die ist Einkommen, keine
  // Investition, und würde die Kennzahl sonst verzerren.
  const start = startBudget();
  const withInv = rows.filter(r => r.kaufSumme != null).map(r => Object.assign({
    _quote: start ? ((r.kaufSumme - r.verkaufSumme) / start) * 100 : 0
  }, r)).sort((a, b) => b._quote - a._quote);
  barChart($('#pre-c5', v), withInv.map(r => ({
    label: r.n + ' · ' + eurShort(r.kaufSumme - r.verkaufSumme) + ' netto', value: r._quote, img: r.uim,
    color: r._quote >= 0 ? (String(r.i) === String(S.meId) ? 'var(--s1)' : 'var(--accent)') : 'var(--good)',
    onClick: () => openManager(r.i) })), { fmt: v2 => nf1.format(v2) + ' %' });

  // Wer hat sich zuletzt gerührt? "Noch nie" zählt als unendlich lange her,
  // damit es beim Sortieren nach Inaktivität ganz oben landet.
  const sentinel = Infinity;
  const withAkt = rows.map(r => Object.assign({ _id: r.i, _tage: r.letzteTransfer ? Math.floor((jetzt - r.letzteTransfer) / 86400000) : (r.tr === 0 ? sentinel : null) }, r));
  sortTable($('#pre-t7', v), [
    { label: 'Manager', val: r => r.n, html: r => playerCell(r.n, r.uim) },
    { label: 'Letzter Transfer', val: r => r.letzteTransfer || 0,
      html: r => r.tr == null ? '<span class="skel" style="display:inline-block;width:70px;height:12px"></span>' :
        (r.letzteTransfer ? dmy(r.letzteTransfer) : '<span class="psub">noch nie</span>') },
    { label: 'Zuletzt aktiv', num: true, val: r => r._tage,
      html: r => r.tr == null ? '–' : (r._tage === sentinel ? '<span class="status-dot"><i style="background:var(--muted)"></i>noch nie</span>' :
        r._tage >= 3 ? '<span class="status-dot"><i style="background:var(--warn)"></i>vor ' + r._tage + ' Tg</span>' :
        '<span class="status-dot"><i style="background:var(--good)"></i>vor ' + r._tage + ' Tg</span>') }
  ], withAkt, { sort: 2, dir: -1, maxHeight: false, rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  // Rekordtransfer je Manager - teuerster eigener Kauf, auch wenn noch keiner da ist
  const rekordRows = rows.map(r => {
    const eigene = alleKaeufe.filter(t => t.kaeuferId === r.i);
    const top = eigene.length ? eigene.reduce((a, b) => (b.trp || 0) > (a.trp || 0) ? b : a) : null;
    return Object.assign({ _id: r.i, _top: top }, r);
  });
  sortTable($('#pre-t8', v), [
    { label: 'Manager', val: r => r.n, html: r => playerCell(r.n, r.uim) },
    { label: 'Teuerster Kauf', val: r => r._top ? r._top.pn : '',
      html: r => r._top ? playerCell(r._top.pn, r._top.pim) : '<span class="psub">–</span>' },
    { label: 'Preis', num: true, val: r => r._top ? r._top.trp : null,
      html: r => r._top ? '<b>' + eur(r._top.trp) + '</b>' : '<span class="psub">–</span>' },
    { label: 'Datum', num: true, val: r => r._top ? new Date(r._top.dt).getTime() : null,
      html: r => r._top ? dmy(r._top.dt) : '–' }
  ], rekordRows, { sort: 2, dir: -1, maxHeight: false, rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  // Letzte Transfers in der Liga
  if (alleKaeufe.length) {
    const neueste = alleKaeufe.slice().sort((a, b) => new Date(b.dt) - new Date(a.dt)).slice(0, 15);
    const t6 = $('#pre-t6', v);
    t6.innerHTML = '<div class="tbl-wrap"><table><tbody>' +
      neueste.map(t => '<tr class="clickable" data-p="' + esc(t.pi) + '">' +
        '<td style="color:var(--muted);font-size:12px;width:1%;white-space:nowrap">' + dmy(t.dt) + '</td>' +
        '<td>' + playerCell(t.pn, t.pim) + '</td>' +
        '<td style="color:var(--muted)">' + esc(t.verkaeufer || 'Markt') + ' → <b>' + esc(t.kaeufer) + '</b></td>' +
        '<td class="num">' + eur(t.trp) + '</td></tr>').join('') + '</tbody></table></div>';
    t6.querySelectorAll('[data-p]').forEach(tr => tr.onclick = () => openPlayer(tr.dataset.p));
  } else {
    $('#pre-t6', v).innerHTML = '<div class="empty">Noch keine Transfers seit Ligastart.</div>';
  }

  // Freie Top-Spieler (nach Position filterbar, mit Beobachtungsliste-Stern)
  if (frei) {
    const list = preFreeState.pos ? frei.filter(p => p.pos === preFreeState.pos) : frei;
    sortTable($('#pre-t4', v), [
      { label: '★', val: () => 0, html: p => watchStar(p.i) },
      { label: 'Spieler', val: p => (p.ln || p.n), html: p => playerCell(((p.fn ? p.fn.charAt(0) + '. ' : '') + (p.ln || p.n)), p.pim, p.tn) },
      { label: 'Pos', val: p => p.pos, html: p => posPill(p.pos) },
      { label: 'Marktwert', num: true, val: p => p.mv, html: p => '<b>' + eurShort(p.mv) + '</b>' },
      { label: 'Ø Punkte (Vorsaison)', num: true, val: p => p.ap, html: p => num(p.ap) },
      { label: 'Pkt/Mio', num: true, val: p => p.mv ? (p.ap || 0) / (p.mv / 1e6) : 0,
        html: p => p.mv ? nf1.format((p.ap || 0) / (p.mv / 1e6)) : '–' }
    ], list.slice().sort((a, b) => (b.ap || 0) - (a.ap || 0)).slice(0, 30).map(p => Object.assign({ _id: p.i }, p)),
      { sort: 4, dir: -1, onRow: id => openPlayer(id) });
    wireWatchStars($('#pre-t4', v), () => vPreseason(v));
    v.querySelectorAll('[data-fpos]').forEach(b => b.onclick = () => { preFreeState.pos = +b.dataset.fpos; vPreseason(v); });
  } else {
    $('#pre-t4', v).innerHTML = '<div class="empty">Spielerdaten werden geladen …</div>';
  }
}

/* ---------- 2) Liga-Tabelle ---------- */
function vTable(v) {
  const us = (S.ranking && S.ranking.us) || [];
  if (!us.length) { v.innerHTML = card('Liga-Tabelle', '', '<div class="empty">Keine Tabellendaten verfügbar.</div>'); return; }
  const maxDay = Math.max(...us.map(u => (u.lp || []).length));

  v.innerHTML =
    card('Tabelle', S.ranking.sn ? 'Saison ' + S.ranking.sn + ' · Spieltag ' + (S.ranking.day || maxDay) : '', '<div id="t-rank"></div>') +
    card('Platzierungsverlauf', 'Platz 1 ist oben', '<div id="c-rankpos"></div>') +
    card('Punkte je Spieltag – alle Manager', '', '<div id="c-rankpts"></div>');

  const cols = [
    { label: '#', num: true, val: u => u.spl, html: u => '<b>' + u.spl + '</b>' },
    { label: 'Manager', val: u => u.n, html: u => playerCell(u.n, u.uim, u.adm ? 'Admin' : '') },
    { label: 'Punkte', num: true, val: u => spOf(u), html: u => '<b>' + num(spOf(u)) + '</b>' },
    { label: 'Ø/Spieltag', num: true, val: u => { const n = (u.lp || []).filter(x => x != null).length; return n ? spOf(u) / n : 0; },
      html: u => { const n = (u.lp || []).filter(x => x != null).length; return num(n ? spOf(u) / n : 0); } },
    { label: 'Letzter ST', num: true, val: u => u.mdp, html: u => num(u.mdp) },
    { label: 'Bester ST', num: true, val: u => Math.max(0, ...(u.lp || []).filter(x => x != null)), html: u => num(Math.max(0, ...(u.lp || []).filter(x => x != null))) },
    { label: 'Teamwert', num: true, val: u => tvOf(u), html: u => eurShort(tvOf(u)) },
    { label: 'Verlauf', num: false, val: u => 0, sortVal: () => 0,
      html: u => sparkline((u.lp || []).map((p, i) => ({ x: i, y: p || 0 })), 'var(--s1)') }
  ];
  const rows = us.map(u => Object.assign({ _id: u.i }, u));
  sortTable($('#t-rank', v), cols, rows, {
    sort: 0, dir: 1,
    rowClass: r => String(r.i) === String(S.meId) ? 'me' : '',
    onRow: id => openManager(id)
  });

  // Platzierungsverlauf berechnen
  const posSeries = us.slice(0, 8).map((u, i) => ({ name: u.n, color: sc(i), points: [] }));
  const cumMap = {}; us.forEach(u => cumMap[u.i] = 0);
  for (let d = 0; d < maxDay; d++) {
    us.forEach(u => { cumMap[u.i] += ((u.lp || [])[d] || 0); });
    const order = us.slice().sort((a, b) => cumMap[b.i] - cumMap[a.i]);
    posSeries.forEach(s => {
      const u = us.find(x => x.n === s.name);
      const p = order.findIndex(x => x.i === u.i) + 1;
      s.points.push({ x: d + 1, y: -p, label: 'Spieltag ' + (d + 1) });
    });
  }
  lineChart($('#c-rankpos', v), posSeries, { fmtX: x => 'ST ' + x, fmtY: y => Math.round(-y) + '.', height: 250 });
  lineChart($('#c-rankpts', v), us.map((u, i) => ({
    name: u.n, color: sc(i), hidden: i >= 5,
    points: (u.lp || []).map((p, d) => ({ x: d + 1, y: p || 0, label: 'Spieltag ' + (d + 1) }))
  })), { fmtX: x => 'ST ' + x, fmtY: num, height: 260, yZero: true });
}

/* ---------- 3) Mein Kader ---------- */
function vSquad(v) {
  const sq = (S.squad && S.squad.it) || [];
  if (!sq.length) { v.innerHTML = card('Mein Kader', '', '<div class="empty">Kein Kader gefunden.</div>'); return; }
  const tv = sq.reduce((s, p) => s + (p.mv || 0), 0);
  const pts = sq.reduce((s, p) => s + (p.p || 0), 0);
  const day = sq.reduce((s, p) => s + (p.sdmvt || 0), 0);
  const gain = sq.reduce((s, p) => s + ((p.mv || 0) - (p.prc || p.mv || 0)), 0);
  const inj = sq.filter(p => p.st && p.st !== 0).length;

  v.innerHTML =
    '<div class="grid g-stats" style="margin-bottom:16px">' +
      statCard('Spieler', sq.length, inj ? inj + ' nicht einsatzbereit' : 'alle fit') +
      statCard('Kaderwert', eur(tv), deltaHtml(day) + ' heute') +
      statCard('Gewinn seit Kauf', eur(gain), gain >= 0 ? 'im Plus' : 'im Minus') +
      statCard('Punkte gesamt', num(pts), sq.length ? 'Ø ' + num(pts / sq.length) + ' je Spieler' : '') +
    '</div>' +
    card('Kader', 'Zeile anklicken für Details', '<div id="t-squad"></div>') +
    '<div class="grid g-2">' +
      card('Wertentwicklung seit Kauf', 'Marktwert minus Kaufpreis', '<div id="c-sq1"></div>') +
      card('Punkte je Million Marktwert', 'Effizienz im Kader', '<div id="c-sq2"></div>') +
    '</div>' +
    card('Kaderwert nach Position', '', '<div id="c-sq3"></div>');

  const cols = [
    { label: 'Spieler', val: p => p.n, html: p => playerCell(p.n, p.pim, POSL[p.pos]) },
    { label: 'Pos', val: p => p.pos, html: p => posPill(p.pos) },
    { label: 'Status', val: p => p.st, html: p => statusPill(p.st) },
    { label: 'Marktwert', num: true, val: p => p.mv, html: p => '<b>' + eurShort(p.mv) + '</b>' },
    { label: 'Heute', num: true, val: p => p.sdmvt, html: p => deltaHtml(p.sdmvt) },
    { label: 'Kaufpreis', num: true, val: p => p.prc, html: p => eurShort(p.prc) },
    { label: 'Gewinn', num: true, val: p => (p.mv || 0) - (p.prc || p.mv || 0),
      html: p => deltaHtml((p.mv || 0) - (p.prc || p.mv || 0)) },
    { label: 'Punkte', num: true, val: p => p.p, html: p => num(p.p) },
    { label: 'Ø Punkte', num: true, val: p => p.ap, html: p => num(p.ap) },
    { label: 'Pkt/Mio', num: true, val: p => p.mv ? (p.ap || 0) / (p.mv / 1e6) : 0,
      html: p => p.mv ? nf1.format((p.ap || 0) / (p.mv / 1e6)) : '–' }
  ];
  sortTable($('#t-squad', v), cols, sq.map(p => Object.assign({ _id: p.i }, p)),
    { sort: 3, dir: -1, onRow: id => openPlayer(id) });

  barChart($('#c-sq1', v), sq.slice().sort((a, b) => ((b.mv || 0) - (b.prc || b.mv || 0)) - ((a.mv || 0) - (a.prc || a.mv || 0))).slice(0, 10)
    .map(p => { const d = (p.mv || 0) - (p.prc || p.mv || 0);
      return { label: p.n, value: d, img: p.pim, color: d >= 0 ? 'var(--good)' : 'var(--crit)', onClick: () => openPlayer(p.i) }; }),
    { fmt: eurShort });
  barChart($('#c-sq2', v), sq.slice().filter(p => p.mv).sort((a, b) => (b.ap / b.mv) - (a.ap / a.mv)).slice(0, 10)
    .map(p => ({ label: p.n, value: (p.ap || 0) / (p.mv / 1e6), img: p.pim, onClick: () => openPlayer(p.i) })),
    { fmt: v2 => nf1.format(v2) + ' P/Mio' });
  const byPos = [1, 2, 3, 4].map(pos => ({
    label: POSL[pos], value: sq.filter(p => p.pos === pos).reduce((s, p) => s + (p.mv || 0), 0), color: sc(pos - 1)
  }));
  barChart($('#c-sq3', v), byPos, { fmt: eurShort });
}

/* ---------- 4) Transfermarkt ---------- */
function vMarket(v) {
  const m = S.market, it = (m && m.it) || [];
  // Eigene freie Kaderplätze selbst berechnen statt Kickbases "nps"-Feld zu
  // vertrauen - das hat in der Praxis nicht zur tatsächlichen Kadergröße gepasst.
  const kaderMax = (window.LIGA && window.LIGA.maxKader) || 16;
  const meineSq = (S.squad && S.squad.it) || [];
  const freiePlaetze = Math.max(0, kaderMax - meineSq.length);
  let head = '';
  if (m) {
    head = '<div class="grid g-stats" style="margin-bottom:16px">' +
      statCard('Angebote', it.length, m.dt ? 'nächster Wechsel ' + dmyhm(m.dt) : '') +
      statCard('Freie Plätze', freiePlaetze, 'von ' + kaderMax + ' im eigenen Kader') +
      statCard('Marktwerte aktualisiert', m.mvud ? ago(m.mvud) : '–', m.mvud ? dmyhm(m.mvud) : '') +
      statCard('Spieltag', m.day || S.curday, '') + '</div>';
  }
  if (!it.length) { v.innerHTML = head + card('Transfermarkt', '', '<div class="empty">Aktuell stehen keine Spieler auf dem Markt.</div>'); return; }

  v.innerHTML = head +
    card('Aktuelle Angebote', 'Zeile anklicken für Marktwertverlauf', '<div id="t-mkt"></div>');

  const cols = [
    { label: 'Spieler', val: p => p.n || p.pn, html: p => playerCell((p.fn ? p.fn.charAt(0) + '. ' : '') + (p.n || p.pn), p.pim, POSL[p.pos]) },
    { label: 'Pos', val: p => p.pos, html: p => posPill(p.pos) },
    { label: 'Status', val: p => p.st, html: p => statusPill(p.st) },
    { label: 'Preis', num: true, val: p => p.prc, html: p => '<b>' + eurShort(p.prc) + '</b>' },
    { label: 'Marktwert', num: true, val: p => p.mv, html: p => eurShort(p.mv) },
    { label: 'Aufschlag', num: true, val: p => (p.prc || 0) - (p.mv || 0),
      html: p => deltaHtml((p.prc || 0) - (p.mv || 0)) },
    { label: 'Heute', num: true, val: p => p.sdmvt, html: p => deltaHtml(p.sdmvt) },
    { label: 'Ø Punkte', num: true, val: p => p.ap, html: p => num(p.ap) },
    { label: 'Anbieter', val: p => (p.u && p.u.n) || 'Kickbase', html: p => esc((p.u && p.u.n) || 'Kickbase') },
    { label: 'Läuft ab', num: true, val: p => p.exs, html: p => countdown(p.exs) }
  ];
  sortTable($('#t-mkt', v), cols, it.map(p => Object.assign({ _id: p.i || p.pi }, p)),
    { sort: 3, dir: -1, onRow: id => openPlayer(id) });
}

/* ---------- 6) Bundesliga ---------- */
function vBuli(v) {
  const t = (S.compTable && S.compTable.it) || [];
  const md = (S.matchdays && S.matchdays.it) || [];
  let h = '';
  if (md.length) {
    const cur = md.find(x => x.day === (S.matchdays.day || S.curday)) || md[md.length - 1];
    h += card('Spieltag ' + (cur.day || ''), '', '<div class="tbl-wrap"><table><tbody>' +
      (cur.it || []).map(g => {
        // g.st: 1 = läuft gerade, 2 = beendet - Kickbase liefert (Stand jetzt)
        // keine Torschützen über diesen Endpunkt, nur den Spielstand.
        const live = g.st === 1;
        const done = g.st === 2 || (g.t1g + g.t2g) > 0;
        const mitte = live ? '<span class="pill" style="background:var(--crit);color:#fff;animation:pulse 1.5s infinite">LIVE ' + g.t1g + ':' + g.t2g + '</span>'
                    : done ? g.t1g + ' : ' + g.t2g : dmyhm(g.dt).split(', ')[1] || dmyhm(g.dt);
        return '<tr>' +
          '<td style="width:44%">' + playerCell(g.t1sy || g.t1, g.t1im) + '</td>' +
          '<td style="width:1%;text-align:center;font-weight:700;white-space:nowrap">' + mitte + '</td>' +
          '<td style="width:44%;text-align:right">' + playerCell(g.t2sy || g.t2, g.t2im) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>');
  }
  if (t.length) {
    h += card('Bundesliga-Tabelle', S.matchdays ? 'Spieltag ' + (S.matchdays.day || '') : '', '<div id="t-buli"></div>');
  }
  if (!h) h = card('Bundesliga', '', '<div class="empty">Keine Wettbewerbsdaten verfügbar.</div>');
  v.innerHTML = h;

  if (t.length) {
    const cols = [
      { label: '#', num: true, val: r => r.cpl },
      { label: 'Verein', val: r => r.tn, html: r => playerCell(r.tn, r.tim) },
      { label: 'Spiele', num: true, val: r => r.mc },
      { label: 'Tordiff.', num: true, val: r => r.gd, html: r => (r.gd > 0 ? '+' : '') + r.gd },
      { label: 'Punkte', num: true, val: r => r.cp, html: r => '<b>' + r.cp + '</b>' },
      { label: 'Trend', num: true, val: r => (r.pcpl || 0) - (r.cpl || 0),
        html: r => { const d = (r.pcpl || 0) - (r.cpl || 0);
          return d === 0 ? '<span class="flat">–</span>' : '<span class="delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '▲' : '▼') + ' ' + Math.abs(d) + '</span>'; } }
    ];
    sortTable($('#t-buli', v), cols, t.map(r => Object.assign({ _id: r.tid }, r)), { sort: 0, dir: 1, maxHeight: false });
  }
}

/* ============================================================
   Ligaspezifisch: Regelprüfung, Termine, Battles, Coppa
   (Regelwerk steht in liga.js)
   ============================================================ */

/** Vereinsnamen und Bundesliga-Zugehörigkeit aus der Wettbewerbstabelle */
function teamInfo() {
  const t = (S.compTable && S.compTable.it) || [];
  const names = {}, ids = [];
  t.forEach(r => { names[String(r.tid)] = r.tn; ids.push(String(r.tid)); });
  return { names, ids };
}

/** Befunde des Regelwächters als Kartenliste */
function ruleCards(befunde) {
  if (!befunde.length) {
    return '<div class="card" style="border-color:color-mix(in srgb, var(--good) 45%, transparent)">' +
      '<div style="display:flex;gap:11px;align-items:center">' +
      '<span style="font-size:20px">✓</span><div><b>Kader ist regelkonform</b>' +
      '<div class="psub">Kadergröße, Vereinsgrenze und Bundesliga-Zugehörigkeit geprüft.</div></div></div></div>';
  }
  const farbe = a => a === 'kritisch' ? 'var(--crit)' : a === 'warnung' ? 'var(--warn)' : 'var(--muted)';
  const icon  = a => a === 'kritisch' ? '⚠' : a === 'warnung' ? '!' : 'i';
  return befunde.map(b =>
    '<div class="card" style="border-color:color-mix(in srgb, ' + farbe(b.art) + ' 45%, transparent);margin-bottom:12px">' +
      '<div style="display:flex;gap:11px">' +
        '<span style="font-size:17px;color:' + farbe(b.art) + ';flex:none">' + icon(b.art) + '</span>' +
        '<div><b>' + esc(b.titel) + '</b>' + (b.regel ? ' <span class="pill">Regel ' + esc(b.regel) + '</span>' : '') +
        '<div class="psub" style="margin-top:3px;line-height:1.5">' + esc(b.text) + '</div></div>' +
      '</div></div>').join('');
}

/* ---------- Reiter: Regeln & Battles ---------- */
function vLiga(v) {
  const L = window.LIGA;
  if (!L) { v.innerHTML = card('Regelwerk', '', '<div class="empty">Regeldatei nicht geladen.</div>'); return; }
  const sq = (S.squad && S.squad.it) || [];
  const ti = teamInfo();
  const befunde = window.ligaCheck(sq, ti.names, ti.ids);
  const krit = befunde.filter(b => b.art === 'kritisch').length;

  // Nächster Termin
  const jetzt = Date.now();
  const naechster = L.termine.map(t => ({ ...t, ms: new Date(t.d).getTime() }))
                             .filter(t => t.ms > jetzt).sort((a, b) => a.ms - b.ms)[0];
  const tage = naechster ? Math.ceil((naechster.ms - jetzt) / 86400000) : null;

  let h = '<div class="grid g-stats" style="margin-bottom:16px">' +
    statCard('Regelverstöße', krit ? String(krit) : '0',
             krit ? 'Sanktion droht' : 'alles sauber') +
    statCard('Kadergröße', sq.length + ' / ' + L.maxKader,
             sq.filter(p => p.pos === 1).length + ' TW · ' + sq.filter(p => p.pos !== 1).length + ' Feld') +
    statCard('Nächster Termin', naechster ? (tage <= 0 ? 'heute' : tage + ' Tg') : '–',
             naechster ? esc(naechster.t) : '') +
    statCard('Marktwert-Update', L.marktwertUpdate, 'täglich') +
    '</div>';

  h += '<div class="card-head"><h2>Regelwächter</h2><span class="hint">geprüft nach ' + esc(L.name) + '-Statut</span></div>' + ruleCards(befunde);

  // Battles
  h += card('Battle-Wertungen', L.battlePreis + ' € je Kategorie', '<div id="t-battle"></div>');

  // Termine - Status als farbiger Punkt statt reiner Ausgrauung, sonst wirkt
  // die Liste bei vielen vergangenen Terminen schnell wie "kaputt".
  h += card('Termine der Saison ' + L.saison, '', '<div class="tbl-wrap"><table><tbody>' +
    L.termine.map(t => {
      const ms = new Date(t.d).getTime(), vorbei = ms < jetzt;
      const d = Math.abs(Math.ceil((ms - jetzt) / 86400000));
      return '<tr>' +
        '<td style="width:1%;white-space:nowrap"><b>' + dmy(t.d) + '</b></td>' +
        '<td>' + esc(t.t) + (t.i ? '<div class="psub">' + esc(t.i) + '</div>' : '') + '</td>' +
        '<td class="num"><span class="status-dot"><i style="background:' + (vorbei ? 'var(--muted)' : 'var(--good)') + '"></i>' +
          (vorbei ? 'vorbei' : 'in ' + d + ' Tagen') + '</span></td></tr>';
    }).join('') + '</tbody></table></div>');

  // Auktionsrechner
  h += card('Auktionsrechner', 'Richtpreis nach Regel X', '<div class="chips" style="margin-bottom:12px">' +
    '<input class="search" id="aukMv" placeholder="Marktwert eingeben, z. B. 1767455" inputmode="numeric"></div>' +
    '<div id="aukOut"></div>');

  // Gewinnverteilung & Kernregeln
  h += '<div class="grid g-2">' +
    card('Gewinnverteilung', 'Einsatz ' + L.einsatz + ' €', '<div class="tbl-wrap"><table><tbody>' +
      L.gewinne.map(g => '<tr><td>' + esc(g[0]) + '</td><td class="num">' + esc(g[1]) + '</td></tr>').join('') +
      '</tbody></table></div>') +
    card('Kernregeln auf einen Blick', '', '<div class="tbl-wrap"><table><tbody>' +
      [['Kadergröße', L.maxKader + ' Spieler (' + L.maxFeldspieler + ' Feld + ' + L.maxTorhueter + ' TW)'],
       ['Je Verein', 'höchstens ' + L.maxProVerein + ' Spieler'],
       ['Interner Transfer', 'Richtpreis auf ' + eurShort(L.richtpreisSchritt) + ' aufgerundet'],
       ['Gebotsschritt', 'mindestens ' + eurShort(L.gebotSchritt)],
       ['Externer Transfer', 'mindestens exakter Marktwert (kein Underpay)'],
       ['Anti-Trading', 'gekaufter Spieler muss einen Spieltag im Kader stehen'],
       ['Auktionsdauer', L.auktionMinStd + '–' + L.auktionMaxStd + ' Std., Nachtruhe ' + L.nachtruhe[0] + '–' + L.nachtruhe[1] + ' Uhr'],
       ['Auktionsende', 'ab dem ' + (L.letzterAuktionsSpieltag + 1) + '. Spieltag keine Auktionen mehr'],
       ['Soft-Reset', 'nach dem ' + L.softResetSpieltag + '. Spieltag']
      ].map(r => '<tr><td>' + esc(r[0]) + '</td><td class="num">' + esc(r[1]) + '</td></tr>').join('') +
      '</tbody></table></div>') +
    '</div>';

  v.innerHTML = h;

  // Battle-Tabelle aus den Ligawertungen
  const btls = (S.overview && S.overview.btls) || [];
  const bt = $('#t-battle', v);
  if (btls.length) {
    bt.innerHTML = '<div class="tbl-wrap"><table><thead><tr><th>Kategorie</th><th>Wertung</th><th>Führend</th></tr></thead><tbody>' +
      btls.map(b => {
        const dn = L.battleNamen[b.t];
        return '<tr class="' + (b.u ? 'clickable' : '') + '" data-u="' + esc((b.u && b.u.i) || '') + '">' +
          '<td><b>' + esc(dn || b.n) + '</b>' + (dn && b.n !== dn ? '<div class="psub">' + esc(b.n) + '</div>' : '') + '</td>' +
          '<td class="psub">' + esc(b.d || '') + '</td>' +
          '<td>' + (b.u ? playerCell(b.u.n, b.u.uim) : '<span class="psub">noch offen</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    bt.querySelectorAll('[data-u]').forEach(tr => { if (tr.dataset.u) tr.onclick = () => openManager(tr.dataset.u); });
  } else {
    bt.innerHTML = '<div class="empty">Die Wertungen erscheinen, sobald die Saison läuft.</div>';
  }

  // Auktionsrechner
  const inp = $('#aukMv', v), out = $('#aukOut', v);
  const rechne = () => {
    const mv = parseInt(String(inp.value).replace(/\D/g, ''), 10);
    if (!mv) { out.innerHTML = '<div class="psub">Marktwert eingeben – der Richtpreis wird nach Regel X auf den nächsten ' + eurShort(L.richtpreisSchritt) + ' aufgerundet.</div>'; return; }
    const rp = window.richtpreis(mv);
    out.innerHTML =
      '<div class="grid g-stats" style="margin-bottom:12px">' +
        statCard('Marktwert', eur(mv), '') +
        statCard('Richtpreis', eur(rp), rp > mv ? '+' + eurShort(rp - mv) + ' aufgerundet' : 'bereits glatt') +
      '</div>' +
      '<div class="psub" style="margin-bottom:6px">Zulässige Gebote:</div>' +
      '<div class="chips">' + window.gebotsstufen(rp, 6).map(g => '<span class="chip">' + eur(g) + '</span>').join('') + '</div>' +
      '<div class="card" style="margin-top:14px;background:var(--surface-2)"><div class="psub" style="margin-bottom:6px">Auktionstext für die Gruppe:</div>' +
      '<code style="font-size:12.5px;line-height:1.7;display:block;white-space:pre-wrap">Name: [Spieler]\nakt. Marktwert: ' +
      nf.format(mv) + '\nRichtpreis: ' + nf.format(rp) + '\nLaufzeit: ' + L.auktionMinStd + ' Stunden</code></div>';
  };
  inp.oninput = rechne;
  rechne();
}

/* ============================================================
   Detail-Fenster
   ============================================================ */
function closeModal() { $('#modalBg').classList.remove('on'); }
function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modalBg').classList.add('on');
  const c = $('#modal .mclose');
  if (c) c.onclick = closeModal;
}
$('#modalBg').onclick = e => { if (e.target.id === 'modalBg') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function openPlayer(pid) {
  if (!pid) return;
  openModal('<div class="modal-head"><b>Spieler wird geladen …</b><span class="spacer" style="flex:1"></span><button class="icon-btn mclose">✕</button></div><div class="modal-body"><div class="skel" style="height:180px"></div></div>');
  let d, mv, perf, th;
  if (api.demo) {
    const p = window.KB_DEMO.playerData[pid];
    if (!p) { closeModal(); return; }
    d = p.detail; mv = p.mvHistory; perf = p.performance; th = p.transferHistory;
  } else {
    busy(true);
    const base = '/v4/leagues/' + S.leagueId + '/players/' + pid;
    [d, mv, perf, th] = await Promise.all([
      api.get(base, 3e5), loadMv(pid), api.get(base + '/performance', 3e5), api.get(base + '/transferHistory', 3e5)
    ]);
    busy(false);
    S.players[pid] = { detail: d, mvHistory: mv, performance: perf };
  }
  if (!d) { openModal('<div class="modal-head"><b>Spieler</b><span style="flex:1"></span><button class="icon-btn mclose">✕</button></div><div class="modal-body"><div class="empty">Details konnten nicht geladen werden.</div></div>'); return; }

  const name = ((d.fn ? d.fn + ' ' : '') + (d.ln || d.n || ''));
  const mvPoints = (mv && mv.it || []).map(p => ({ x: p.dt, y: p.mv, label: dmy(dayToDate(p.dt)) }));
  const first = mvPoints.length ? mvPoints[0].y : null;
  const chg = first ? d.mv - first : null;
  const ph = (perf && perf.it && perf.it.length ? (perf.it[perf.it.length - 1].ph || []) : []);
  const ptPoints = ph.filter(x => x.p != null).map(x => ({ x: x.day, y: x.p, label: 'Spieltag ' + x.day }));

  openModal(
    '<div class="modal-head">' + playerCell(name, d.pim, (d.tn || '') + (d.shn ? ' · Nr. ' + d.shn : '')) +
      '<span style="flex:1"></span>' + posPill(d.pos) + '<button class="icon-btn mclose">✕</button></div>' +
    '<div class="modal-body">' +
      '<div class="grid g-stats" style="margin-bottom:16px">' +
        statCard('Marktwert', eur(d.mv), deltaHtml(d.sdmvt) + ' heute') +
        statCard('Punkte', num(d.tp), 'Ø ' + num(d.ap) + ' je Spiel') +
        statCard('Tore / Vorlagen', (d.g || 0) + ' / ' + (d.a || 0), (d.sec ? Math.round(d.sec / 60) + ' Minuten' : '')) +
        statCard('Status', statusPill(d.st), (d.y || 0) + ' Gelbe · ' + (d.r || 0) + ' Rote') +
        (chg != null ? statCard('Wert seit ' + (mvPoints.length ? dmy(dayToDate(mvPoints[0].x)) : ''), deltaHtml(chg, eurShort), first ? nf1.format(chg / first * 100) + ' %' : '') : '') +
      '</div>' +
      (window.richtpreis ? card('Auktion nach Ligaregel', 'Regel X · Richtpreis auf ' + eurShort(window.LIGA.richtpreisSchritt) + ' aufgerundet',
        '<div class="chips"><span class="chip" style="background:var(--surface-2)">Richtpreis <b>' + eur(window.richtpreis(d.mv)) + '</b></span>' +
        window.gebotsstufen(window.richtpreis(d.mv), 4).slice(1).map(g => '<span class="chip">' + eur(g) + '</span>').join('') +
        '</div><div class="psub" style="margin-top:10px">Externer Verkauf: mindestens <b>' + eur(d.mv) + '</b> (kein Underpay, Regel XII).</div>') : '') +
      card('Marktwertverlauf', mvPoints.length ? mvPoints.length + ' Tage' : '', '<div id="c-pmv"></div>') +
      (ptPoints.length ? card('Punkte je Spieltag', '', '<div id="c-ppt"></div>') : '') +
      (th && th.it && th.it.length ? card('Transferhistorie', '', '<div class="tbl-wrap"><table><tbody>' +
        th.it.slice(0, 20).map(t => '<tr><td style="color:var(--muted);font-size:12px;width:1%;white-space:nowrap">' + dmy(t.dt) + '</td>' +
          '<td>' + esc(t.slr || '?') + ' → <b>' + esc(t.byr || '?') + '</b></td>' +
          '<td class="num">' + eur(t.trp) + '</td></tr>').join('') + '</tbody></table></div>') : '') +
    '</div>');

  lineChart($('#c-pmv'), [{ name: 'Marktwert', color: 'var(--s1)', points: mvPoints }],
    { fmtY: eurShort, fmtX: x => dmy(dayToDate(x)), height: 240, area: true });
  if (ptPoints.length) lineChart($('#c-ppt'), [{ name: 'Punkte', color: 'var(--s3)', points: ptPoints }],
    { fmtY: num, fmtX: x => 'ST ' + x, height: 200, yZero: true });
}

async function openManager(uid) {
  if (!uid) return;
  let m = S.managers[uid];
  if (api.demo) m = window.KB_DEMO.managerData[uid];
  if (!m || !m.dashboard) {
    openModal('<div class="modal-head"><b>Manager wird geladen …</b><span style="flex:1"></span><button class="icon-btn mclose">✕</button></div><div class="modal-body"><div class="skel" style="height:160px"></div></div>');
    if (!api.demo) { await loadManager(uid); m = S.managers[uid]; }
  }
  if (!m || !m.dashboard) { openModal('<div class="modal-head"><b>Manager</b><span style="flex:1"></span><button class="icon-btn mclose">✕</button></div><div class="modal-body"><div class="empty">Daten nicht verfügbar.</div></div>'); return; }

  const d = m.dashboard, sq = (m.squad && m.squad.it) || [], tr = (m.transfers && m.transfers.it) || [];
  const lp = d.ph || [];
  openModal(
    '<div class="modal-head">' + playerCell(d.unm, d.uim, 'Platz ' + d.pl) +
      '<span style="flex:1"></span><button class="icon-btn mclose">✕</button></div>' +
    '<div class="modal-body">' +
      '<div class="grid g-stats" style="margin-bottom:16px">' +
        statCard('Platz', d.pl + '.', d.mdw != null ? d.mdw + ' Spieltagssiege' : '') +
        statCard('Punkte', num(d.tp), 'Ø ' + num(d.ap)) +
        statCard('Teamwert', eur(d.tv), sq.length + ' Spieler') +
        statCard('Transfergewinn', deltaHtml(d.prft, eurShort), tr.length + ' Transfers') +
      '</div>' +
      (lp.length ? card('Punkte je Spieltag', '', '<div id="c-mpt"></div>') : '') +
      (sq.length ? card('Kader', num(sq.reduce((s, p) => s + (p.mv || 0), 0)) + ' € Gesamtwert', '<div id="t-msq"></div>') : '') +
      (tr.length ? card('Transfers', '', '<div class="tbl-wrap"><table><tbody>' +
        tr.slice(0, 25).map(t => '<tr class="clickable" data-p="' + esc(t.pi) + '"><td style="color:var(--muted);font-size:12px;width:1%;white-space:nowrap">' + dmy(t.dt) + '</td>' +
          '<td>' + playerCell(t.pn, t.pim) + '</td>' +
          '<td><span class="pill">' + (t.tty === 1 ? 'Kauf' : 'Verkauf') + '</span></td>' +
          '<td class="num">' + eur(t.trp) + '</td>' +
          '<td style="color:var(--muted);font-size:12px">' + esc(t.othnm || '') + '</td></tr>').join('') +
        '</tbody></table></div>') : '') +
    '</div>');

  if (lp.length) lineChart($('#c-mpt'), [{ name: d.unm, color: 'var(--s1)',
    points: lp.map((p, i) => ({ x: i + 1, y: p || 0, label: 'Spieltag ' + (i + 1) })) }],
    { fmtY: num, fmtX: x => 'ST ' + x, height: 210, yZero: true, area: true });

  if (sq.length) sortTable($('#t-msq'), [
    { label: 'Spieler', val: p => p.pn, html: p => playerCell(p.pn, p.pim, POSL[p.pos]) },
    { label: 'Pos', val: p => p.pos, html: p => posPill(p.pos) },
    { label: 'Marktwert', num: true, val: p => p.mv, html: p => eurShort(p.mv) },
    { label: 'Heute', num: true, val: p => p.sdmvt, html: p => deltaHtml(p.sdmvt) },
    { label: 'Punkte', num: true, val: p => p.p, html: p => num(p.p) },
    { label: 'Ø', num: true, val: p => p.ap, html: p => num(p.ap) }
  ], sq.map(p => Object.assign({ _id: p.pi }, p)), { sort: 2, dir: -1, onRow: id => openPlayer(id) });

  document.querySelectorAll('#modal [data-p]').forEach(tr2 => tr2.onclick = () => openPlayer(tr2.dataset.p));
}

/* ============================================================
   Daten laden
   ============================================================ */
async function loadManager(uid) {
  const b = '/v4/leagues/' + S.leagueId + '/managers/' + uid;
  const [dash, perf, squad, trans] = await Promise.all([
    api.get(b + '/dashboard', 3e5), api.get(b + '/performance', 3e5),
    api.get(b + '/squad', 3e5), api.get(b + '/transfer', 3e5)
  ]);
  S.managers[uid] = { dashboard: dash, performance: perf, squad: squad, transfers: trans };
}

async function loadLeague(force) {
  if (api.demo) { loadDemo(); return; }
  if (force) api.clearCache();
  busy(true);
  const L = '/v4/leagues/' + S.leagueId;
  try {
    const [me, budget, ranking, squad, market, overview, feed, elf] = await Promise.all([
      api.get(L + '/me', 6e4), api.get(L + '/me/budget', 6e4), api.get(L + '/ranking', 6e4),
      api.get(L + '/squad', 6e4), api.get(L + '/market', 3e4), api.get(L + '/overview', 3e5),
      api.get(L + '/activitiesFeed', 6e4), api.get(L + '/teamcenter/myeleven', 6e4)
    ]);
    Object.assign(S, { me, budget, ranking, squad, market, overview, feed, myeleven: elf, loadedAt: Date.now() });
    if (ranking && ranking.day) S.curday = ranking.day;

    // Eigene Manager-ID bestimmen
    if (!S.meId) {
      if (squad && squad.ua) S.meId = squad.ua;
      else if (S.user && S.user.id) S.meId = S.user.id;
    }
    freshness();
    renderAll();

    // Hintergrund: Wettbewerb, Manager-Details, Spielerpool
    const cpi = (S.league && S.league.cpi) || (me && me.cpi) || '1';
    S.competition = cpi;
    Promise.all([
      api.get('/v4/competitions/' + cpi + '/table', 6e5).then(r => { S.compTable = r; if (curTab === 'buli') renderAll(); }),
      api.get('/v4/competitions/' + cpi + '/matchdays', 6e5).then(r => { S.matchdays = r; if (curTab === 'buli') renderAll(); }),
      api.get('/v4/competitions/' + cpi + '/players', 6e5).then(r => { S.compPlayers = r; if (curTab === 'preseason') renderAll(); })
    ]).catch(() => {});

    const ids = ((ranking && ranking.us) || []).map(u => u.i);
    pool(ids, loadManager, 4).then(() => { if (curTab === 'preseason') renderAll(); });

  } catch (e) {
    if (e.code === 401) { logout('Sitzung abgelaufen – bitte neu anmelden.'); return; }
    toast('Daten konnten nicht vollständig geladen werden.');
    console.error(e);
  } finally { busy(false); }
}

function loadDemo() {
  const D = window.KB_DEMO;
  Object.assign(S, {
    me: D.league.me, budget: D.league.budget, ranking: D.league.ranking, squad: D.league.squad,
    market: D.league.market, overview: D.league.overview, feed: D.league.feed, myeleven: D.league.myeleven,
    compTable: D.competition.table, matchdays: D.competition.matchdays,
    compPlayers: { it: D.players.map(p => ({ i: p.i, fn: p.fn, ln: p.ln, n: p.ln, tid: p.tid, tn: p.tn,
                     pos: p.pos, st: p.st, mv: p.mv, sdmvt: p.sdmvt, tp: p.tp, ap: p.ap, pim: p.pim })) },
    managers: D.managerData, meId: D.meId, curday: D.curday, loadedAt: Date.now()
  });
  freshness();
  renderAll();
}

function freshness() {
  $('#freshness').textContent = S.loadedAt ? 'Stand ' + new Date(S.loadedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '';
}

/* ============================================================
   Anmeldung & Start
   ============================================================ */
function showApp() {
  $('#login').style.display = 'none';
  $('#app').classList.add('on');
}
function logout(msg) {
  localStorage.removeItem(LS_TOKEN);
  api.token = null; api.demo = false; api.clearCache();
  $('#app').classList.remove('on');
  $('#login').style.display = 'grid';
  if (msg) { $('#loginErr').innerHTML = '<div class="login-error">' + esc(msg) + '</div>'; }
}

async function afterLogin(leagues) {
  // Die Ligaliste kommt je nach Endpunkt mit unterschiedlichen Feldnamen:
  // /v4/leagues/selection liefert {i, n}, die Login-Antwort {id, name}.
  // Beides auf {i, n} vereinheitlichen, sonst bleibt die Liga-ID leer.
  S.leagues = (((leagues && leagues.it) || []).map(l => Object.assign({}, l, {
    i: l.i != null ? l.i : l.id,
    n: l.n != null ? l.n : l.name
  }))).filter(l => l.i != null);
  const sel = $('#leagueSel');
  sel.innerHTML = S.leagues.map(l => '<option value="' + esc(l.i) + '">' + esc(l.n) + '</option>').join('');
  const saved = localStorage.getItem(LS_LEAGUE);
  S.leagueId = (saved && S.leagues.some(l => String(l.i) === saved)) ? saved : (S.leagues[0] && S.leagues[0].i);
  sel.value = S.leagueId;
  sel.onchange = () => {
    S.leagueId = sel.value; localStorage.setItem(LS_LEAGUE, S.leagueId);
    S.managers = {}; S.players = {}; S.compPlayers = null; mvTf = null;
    loadLeague(true);
  };
  showApp();
  renderTabs();
  if (!S.leagues.length) {
    $('#v-home').innerHTML = card('Keine Liga gefunden', '', '<div class="empty">Zu diesem Konto ist keine Kickbase-Liga hinterlegt.</div>');
    $('#v-home').classList.add('on');
    return;
  }
  await loadLeague();
}

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('#loginBtn'), em = $('#em').value.trim(), pw = $('#pw').value;
  if (!em || !pw) return;
  btn.disabled = true; btn.textContent = 'Anmeldung läuft …';
  $('#loginErr').innerHTML = '';
  busy(true);
  try {
    const r = await api.login(em, pw);
    if (!r || !r.tkn) throw new Error('Keine Antwort vom Server.');
    api.setToken(r.tkn);
    api.demo = false;
    S.user = r.u || null;
    if (r.u && r.u.id) S.meId = r.u.id;
    localStorage.setItem(LS_TOKEN, JSON.stringify({ tkn: r.tkn, tknex: r.tknex, uid: r.u && r.u.id }));
    $('#pw').value = '';
    // Bevorzugt die Auswahlliste abfragen; die Ligen aus der Login-Antwort
    // dienen nur als Rückfallebene.
    const sel = await api.get('/v4/leagues/selection', 0);
    await afterLogin(sel && sel.it && sel.it.length ? sel : { it: r.srvl || [] });
  } catch (err) {
    const msg = err.code === 401 || /401/.test(err.message)
      ? 'E-Mail oder Passwort stimmt nicht.'
      : 'Anmeldung fehlgeschlagen: ' + err.message;
    $('#loginErr').innerHTML = '<div class="login-error">' + esc(msg) + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = 'Anmelden'; busy(false);
  }
};

$('#demoBtn').onclick = () => {
  api.demo = true; api.token = null;
  S.leagues = window.KB_DEMO.selection.it;
  S.leagueId = S.leagues[0].i;
  S.user = window.KB_DEMO.userMe;
  const sel = $('#leagueSel');
  sel.innerHTML = '<option>' + esc(S.leagues[0].n) + '</option>';
  sel.disabled = true;
  showApp(); renderTabs(); loadDemo();
  toast('Demo-Modus – erfundene Beispieldaten');
};

$('#refreshBtn').onclick = () => { if (!api.demo) loadLeague(true); else { loadDemo(); toast('Demo neu gewürfelt'); } };
$('#logoutBtn').onclick = () => { if (confirm('Wirklich abmelden?')) logout(); };
$('#themeBtn').onclick = () => {
  // Dunkel ist der Ligalook und damit die Voreinstellung; hell bleibt wählbar.
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(LS_THEME, next);
  if ($('#app').classList.contains('on')) renderAll();
};

/* ---------- Start ---------- */
(function init() {
  const th = localStorage.getItem(LS_THEME);
  if (th) document.documentElement.setAttribute('data-theme', th);
  const h = (location.hash || '').replace('#', '');
  if (TABS.some(t => t[0] === h)) curTab = h;

  const saved = localStorage.getItem(LS_TOKEN);
  if (saved) {
    try {
      const t = JSON.parse(saved);
      if (t && t.tkn) {
        api.setToken(t.tkn);
        if (t.uid) S.meId = t.uid;
        busy(true);
        api.raw('/v4/leagues/selection')
          .then(sel => afterLogin(sel))
          .catch(() => { localStorage.removeItem(LS_TOKEN); api.token = null; })
          .finally(() => busy(false));
      }
    } catch (e) { localStorage.removeItem(LS_TOKEN); }
  }
  window.addEventListener('hashchange', () => {
    const k = (location.hash || '').replace('#', '');
    if (TABS.some(t => t[0] === k) && k !== curTab) { curTab = k; renderTabs(); renderAll(); }
  });
})();

})();
