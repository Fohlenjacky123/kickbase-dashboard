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
  ['home',     'Überblick'],
  ['table',    'Liga-Tabelle'],
  ['squad',    'Mein Kader'],
  ['market',   'Transfermarkt'],
  ['managers', 'Mitspieler'],
  ['players',  'Spieler-Analyse'],
  ['buli',     'Bundesliga'],
  ['feed',     'Aktivitäten'],
  ['archive',  'Archiv']
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
  const fn = { home: vHome, table: vTable, squad: vSquad, market: vMarket,
               managers: vManagers, players: vPlayers, buli: vBuli, feed: vFeed,
               archive: vArchive }[curTab];
  if (fn) { try { fn($('#v-' + curTab)); } catch (e) { console.error(e); $('#v-' + curTab).innerHTML = '<div class="card"><div class="empty">Diese Ansicht konnte nicht gezeichnet werden.<br><small>' + esc(e.message) + '</small></div></div>'; } }
}

/* ---------- Mein Manager-Eintrag ---------- */
function meRow() {
  if (!S.ranking || !S.ranking.us) return null;
  return S.ranking.us.find(u => String(u.i) === String(S.meId)) || null;
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
  const teamVal = me ? me.tv : squad.reduce((s, p) => s + (p.mv || 0), 0);
  const dayVal = squad.reduce((s, p) => s + (p.sdmvt || 0), 0);
  const avg = me && me.lp && me.lp.length ? me.lp.filter(x => x != null).reduce((a, c) => a + c, 0) / me.lp.filter(x => x != null).length : null;
  const best = us.length ? Math.max(...us.map(u => u.sp || 0)) : 0;
  const gap = me ? best - (me.sp || 0) : 0;

  let h = '<div class="grid g-stats" style="margin-bottom:16px">' +
    statCard('Mein Platz', me ? (me.spl + '.') : '–', us.length ? 'von ' + us.length + ' Managern' : '') +
    statCard('Gesamtpunkte', me ? num(me.sp) : '–', avg ? 'Ø ' + num(avg) + ' je Spieltag' : '') +
    statCard('Teamwert', eur(teamVal), deltaHtml(dayVal) + ' <span style="color:var(--muted)">heute</span>') +
    statCard('Budget', eur(b), b != null && teamVal ? 'Gesamt ' + eurShort(b + teamVal) : '') +
    statCard('Rückstand Platz 1', me && me.spl > 1 ? num(gap) : '—', me && me.spl === 1 ? 'Du führst 🏆' : 'Punkte') +
    '</div>';

  // Eigene Leistung gegen die Liga - drei klar unterscheidbare Linien
  // statt aller Manager übereinander (das wäre unlesbar).
  const maxDay = Math.max(0, ...us.map(u => (u.lp || []).length));
  const days = Array.from({ length: maxDay }, (_, d) => d);
  const atDay = d => us.map(u => (u.lp || [])[d]).filter(x => x != null);
  const series = [];
  if (me) series.push({ name: 'Du', color: 'var(--s1)',
    points: days.map(d => ({ x: d + 1, y: (me.lp || [])[d] || 0, label: 'Spieltag ' + (d + 1) })) });
  series.push({ name: 'Ligadurchschnitt', color: 'var(--s4)',
    points: days.map(d => { const a = atDay(d); return { x: d + 1, y: a.length ? a.reduce((s, c) => s + c, 0) / a.length : 0, label: 'Spieltag ' + (d + 1) }; }) });
  series.push({ name: 'Bester des Spieltags', color: 'var(--s3)',
    points: days.map(d => { const a = atDay(d); return { x: d + 1, y: a.length ? Math.max(...a) : 0, label: 'Spieltag ' + (d + 1) }; }) });
  h += card('Deine Punkte gegen die Liga', 'je Spieltag', '<div id="c-home1"></div>');

  // Rückstand zur Spitze - eine Linie sagt mehr als zehn
  const cumAll = {}; us.forEach(u => cumAll[u.i] = 0);
  const gapPts = days.map(d => {
    us.forEach(u => { cumAll[u.i] += ((u.lp || [])[d] || 0); });
    const mx = Math.max(...Object.values(cumAll));
    return { x: d + 1, y: me ? cumAll[me.i] - mx : 0, label: 'Spieltag ' + (d + 1) };
  });
  const cum = [{ name: 'Rückstand', color: 'var(--s7)', points: gapPts }];
  h += card('Abstand zur Tabellenspitze', '0 = Platz 1 · Verlauf über die Saison', '<div id="c-home2"></div>');

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
  lineChart($('#c-home1', v), series, { fmtX: x => 'ST ' + x, fmtY: num, height: 250, yZero: true });
  lineChart($('#c-home2', v), cum, { fmtX: x => 'ST ' + x, fmtY: num, height: 220, area: true });
  barChart($('#c-home3', v), movers.filter(p => (p.sdmvt || 0) > 0).slice(0, 6).map(p => ({
    label: p.n, value: p.sdmvt, img: p.pim, color: 'var(--good)', onClick: () => openPlayer(p.i)
  })), { fmt: eurShort });
  barChart($('#c-home4', v), movers.filter(p => (p.sdmvt || 0) < 0).slice(-6).reverse().map(p => ({
    label: p.n, value: p.sdmvt, img: p.pim, color: 'var(--crit)', onClick: () => openPlayer(p.i)
  })), { fmt: eurShort });
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
    { label: 'Punkte', num: true, val: u => u.sp, html: u => '<b>' + num(u.sp) + '</b>' },
    { label: 'Ø/Spieltag', num: true, val: u => { const l = (u.lp || []).filter(x => x != null); return l.length ? Math.round(l.reduce((a, c) => a + c, 0) / l.length) : 0; }, html: u => { const l = (u.lp || []).filter(x => x != null); return num(l.length ? l.reduce((a, c) => a + c, 0) / l.length : 0); } },
    { label: 'Letzter ST', num: true, val: u => u.mdp, html: u => num(u.mdp) },
    { label: 'Bester ST', num: true, val: u => Math.max(0, ...(u.lp || []).filter(x => x != null)), html: u => num(Math.max(0, ...(u.lp || []).filter(x => x != null))) },
    { label: 'Teamwert', num: true, val: u => u.tv, html: u => eurShort(u.tv) },
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
    { label: 'Gewinn', num: true, val: p => (p.mv || 0) - (p.prc || 0),
      html: p => deltaHtml((p.mv || 0) - (p.prc || 0)) },
    { label: 'Punkte', num: true, val: p => p.p, html: p => num(p.p) },
    { label: 'Ø Punkte', num: true, val: p => p.ap, html: p => num(p.ap) },
    { label: 'Pkt/Mio', num: true, val: p => p.mv ? (p.ap || 0) / (p.mv / 1e6) : 0,
      html: p => p.mv ? nf1.format((p.ap || 0) / (p.mv / 1e6)) : '–' }
  ];
  sortTable($('#t-squad', v), cols, sq.map(p => Object.assign({ _id: p.i }, p)),
    { sort: 3, dir: -1, onRow: id => openPlayer(id) });

  barChart($('#c-sq1', v), sq.slice().sort((a, b) => ((b.mv || 0) - (b.prc || 0)) - ((a.mv || 0) - (a.prc || 0))).slice(0, 10)
    .map(p => { const d = (p.mv || 0) - (p.prc || 0);
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
  let head = '';
  if (m) {
    head = '<div class="grid g-stats" style="margin-bottom:16px">' +
      statCard('Angebote', it.length, m.dt ? 'Wechsel ' + dmyhm(m.dt) : '') +
      statCard('Freie Plätze', m.nps != null ? m.nps : '–', 'im Kader') +
      statCard('Marktwerte aktualisiert', m.mvud ? ago(m.mvud) : '–', m.mvud ? dmyhm(m.mvud) : '') +
      statCard('Spieltag', m.day || S.curday, '') + '</div>';
  }
  if (!it.length) { v.innerHTML = head + card('Transfermarkt', '', '<div class="empty">Aktuell stehen keine Spieler auf dem Markt.</div>'); return; }

  v.innerHTML = head +
    card('Aktuelle Angebote', 'Zeile anklicken für Marktwertverlauf', '<div id="t-mkt"></div>') +
    card('Preis gegen Marktwert', 'Grün = unter Marktwert angeboten', '<div id="c-mkt1"></div>');

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

  barChart($('#c-mkt1', v), it.slice().sort((a, b) => ((a.prc || 0) - (a.mv || 0)) - ((b.prc || 0) - (b.mv || 0)))
    .map(p => { const d = (p.prc || 0) - (p.mv || 0);
      return { label: p.n || p.pn, value: d, img: p.pim, color: d <= 0 ? 'var(--good)' : 'var(--crit)', onClick: () => openPlayer(p.i || p.pi) }; }),
    { fmt: eurShort });
}

/* ---------- 5) Mitspieler ---------- */
function vManagers(v) {
  const us = (S.ranking && S.ranking.us) || [];
  if (!us.length) { v.innerHTML = card('Mitspieler', '', '<div class="empty">Keine Daten.</div>'); return; }

  const rows = us.map(u => {
    const d = (S.managers[u.i] || {}).dashboard || {};
    const t = (S.managers[u.i] || {}).transfers || {};
    return Object.assign({ _id: u.i, _prft: d.prft, _mdw: d.mdw, _tr: (t.it || []).length }, u);
  });

  v.innerHTML =
    card('Alle Manager', 'Zeile anklicken für Kader und Transfers', '<div id="t-mgr"></div>') +
    '<div class="grid g-2">' +
      card('Teamwert', '', '<div id="c-mgr1"></div>') +
      card('Transfergewinn', 'seit Saisonstart', '<div id="c-mgr2"></div>') +
    '</div>' +
    card('Punkte gegen Teamwert', 'Wer holt am meisten aus seinem Kader?', '<div id="c-mgr3"></div>');

  const cols = [
    { label: '#', num: true, val: u => u.spl },
    { label: 'Manager', val: u => u.n, html: u => playerCell(u.n, u.uim, u.adm ? 'Admin' : '') },
    { label: 'Punkte', num: true, val: u => u.sp, html: u => '<b>' + num(u.sp) + '</b>' },
    { label: 'Teamwert', num: true, val: u => u.tv, html: u => eurShort(u.tv) },
    { label: 'Gewinn', num: true, val: u => u._prft, html: u => u._prft == null ? '<span class="skel" style="display:inline-block;width:56px;height:12px"></span>' : deltaHtml(u._prft) },
    { label: 'ST-Siege', num: true, val: u => u._mdw, html: u => u._mdw == null ? '–' : num(u._mdw) },
    { label: 'Transfers', num: true, val: u => u._tr, html: u => num(u._tr) },
    { label: 'Pkt/Mio TW', num: true, val: u => u.tv ? u.sp / (u.tv / 1e6) : 0, html: u => u.tv ? nf1.format(u.sp / (u.tv / 1e6)) : '–' }
  ];
  sortTable($('#t-mgr', v), cols, rows, { sort: 0, dir: 1,
    rowClass: r => String(r.i) === String(S.meId) ? 'me' : '', onRow: id => openManager(id) });

  barChart($('#c-mgr1', v), us.slice().sort((a, b) => b.tv - a.tv).map((u, i) => ({
    label: u.n, value: u.tv, img: u.uim, color: String(u.i) === String(S.meId) ? 'var(--s1)' : 'var(--s3)',
    onClick: () => openManager(u.i) })), { fmt: eurShort });

  const withP = rows.filter(r => r._prft != null).sort((a, b) => b._prft - a._prft);
  barChart($('#c-mgr2', v), withP.map(u => ({
    label: u.n, value: u._prft, img: u.uim, color: u._prft >= 0 ? 'var(--good)' : 'var(--crit)',
    onClick: () => openManager(u.i) })), { fmt: eurShort });

  barChart($('#c-mgr3', v), us.slice().filter(u => u.tv).sort((a, b) => (b.sp / b.tv) - (a.sp / a.tv)).map(u => ({
    label: u.n, value: u.sp / (u.tv / 1e6), img: u.uim,
    color: String(u.i) === String(S.meId) ? 'var(--s1)' : 'var(--s7)',
    onClick: () => openManager(u.i) })), { fmt: x => nf1.format(x) + ' P/Mio' });
}

/* ---------- 6) Spieler-Analyse (alle Bundesligaspieler) ---------- */
const pState = { pos: 0, q: '', onlyFit: false, sort: 'mv' };
function vPlayers(v) {
  const all = S.compPlayers && S.compPlayers.it ? S.compPlayers.it : null;
  if (!all) {
    v.innerHTML = card('Spieler-Analyse', '', '<div class="empty">Spielerdaten werden geladen …<div class="skel" style="height:12px;margin-top:14px"></div></div>');
    return;
  }
  const owned = {};
  Object.values(S.managers).forEach(m => ((m.squad && m.squad.it) || []).forEach(p => { owned[p.pi] = m.squad.unm; }));

  let list = all.filter(p => {
    if (pState.pos && p.pos !== pState.pos) return false;
    if (pState.onlyFit && p.st) return false;
    if (pState.q) {
      const s = ((p.fn || '') + ' ' + (p.ln || p.n || '') + ' ' + (p.tn || '')).toLowerCase();
      if (!s.includes(pState.q.toLowerCase())) return false;
    }
    return true;
  });

  const chips = '<div class="chips" style="margin-bottom:14px">' +
    '<input class="search" id="pq" placeholder="Spieler oder Verein suchen …" value="' + esc(pState.q) + '">' +
    [[0, 'Alle'], [1, 'Torwart'], [2, 'Abwehr'], [3, 'Mittelfeld'], [4, 'Angriff']]
      .map(([k, l]) => '<button class="chip' + (pState.pos === k ? ' on' : '') + '" data-pos="' + k + '">' + l + '</button>').join('') +
    '<button class="chip' + (pState.onlyFit ? ' on' : '') + '" id="pfit">Nur einsatzbereit</button>' +
    '<span class="hint" style="color:var(--muted);font-size:12.5px">' + num(list.length) + ' Spieler</span></div>';

  v.innerHTML = chips + card('Alle Spieler der Liga', 'Zeile anklicken für Marktwertverlauf', '<div id="t-pl"></div>') +
    '<div class="grid g-2">' +
      card('Teuerste Spieler', '', '<div id="c-pl1"></div>') +
      card('Beste Punkte je Million', 'mind. 5 Mio Marktwert', '<div id="c-pl2"></div>') +
    '</div>';

  const cols = [
    { label: 'Spieler', val: p => (p.ln || p.n), html: p => playerCell(((p.fn ? p.fn.charAt(0) + '. ' : '') + (p.ln || p.n)), p.pim, p.tn) },
    { label: 'Pos', val: p => p.pos, html: p => posPill(p.pos) },
    { label: 'Status', val: p => p.st, html: p => statusPill(p.st) },
    { label: 'Marktwert', num: true, val: p => p.mv, html: p => '<b>' + eurShort(p.mv) + '</b>' },
    { label: 'Heute', num: true, val: p => p.sdmvt, html: p => deltaHtml(p.sdmvt) },
    { label: 'Punkte', num: true, val: p => p.tp != null ? p.tp : p.p, html: p => num(p.tp != null ? p.tp : p.p) },
    { label: 'Ø Punkte', num: true, val: p => p.ap, html: p => num(p.ap) },
    { label: 'Pkt/Mio', num: true, val: p => p.mv ? (p.ap || 0) / (p.mv / 1e6) : 0,
      html: p => p.mv ? nf1.format((p.ap || 0) / (p.mv / 1e6)) : '–' },
    { label: 'Besitzer', val: p => owned[p.i] || 'frei', html: p => owned[p.i] ? esc(owned[p.i]) : '<span style="color:var(--muted)">frei</span>' }
  ];
  sortTable($('#t-pl', v), cols, list.map(p => Object.assign({ _id: p.i }, p)),
    { sort: 3, dir: -1, onRow: id => openPlayer(id) });

  barChart($('#c-pl1', v), list.slice().sort((a, b) => b.mv - a.mv).slice(0, 10)
    .map(p => ({ label: (p.ln || p.n), value: p.mv, img: p.pim, onClick: () => openPlayer(p.i) })), { fmt: eurShort });
  barChart($('#c-pl2', v), list.filter(p => p.mv >= 5e6).sort((a, b) => (b.ap / b.mv) - (a.ap / a.mv)).slice(0, 10)
    .map(p => ({ label: (p.ln || p.n), value: (p.ap || 0) / (p.mv / 1e6), img: p.pim, color: 'var(--s3)', onClick: () => openPlayer(p.i) })),
    { fmt: x => nf1.format(x) + ' P/Mio' });

  const q = $('#pq', v);
  q.oninput = () => { pState.q = q.value; const pos = q.selectionStart; vPlayers(v); const n = $('#pq', v); n.focus(); n.setSelectionRange(pos, pos); };
  v.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => { pState.pos = +b.dataset.pos; vPlayers(v); });
  $('#pfit', v).onclick = () => { pState.onlyFit = !pState.onlyFit; vPlayers(v); };
}

/* ---------- 7) Bundesliga ---------- */
function vBuli(v) {
  const t = (S.compTable && S.compTable.it) || [];
  const md = (S.matchdays && S.matchdays.it) || [];
  let h = '';
  if (t.length) {
    h += card('Bundesliga-Tabelle', S.matchdays ? 'Spieltag ' + (S.matchdays.day || '') : '', '<div id="t-buli"></div>');
  }
  if (md.length) {
    const cur = md.find(x => x.day === (S.matchdays.day || S.curday)) || md[md.length - 1];
    h += card('Spieltag ' + (cur.day || ''), '', '<div class="tbl-wrap"><table><tbody>' +
      (cur.it || []).map(g => {
        const done = g.st === 2 || (g.t1g + g.t2g) > 0;
        return '<tr><td style="width:1%;white-space:nowrap;color:var(--muted);font-size:12px">' + dmyhm(g.dt) + '</td>' +
          '<td class="num" style="width:34%">' + esc(g.t1sy || g.t1) + '</td>' +
          '<td style="width:1%;text-align:center;font-weight:700;white-space:nowrap">' +
            (done ? g.t1g + ' : ' + g.t2g : '–:–') + '</td>' +
          '<td style="width:34%">' + esc(g.t2sy || g.t2) + '</td></tr>';
      }).join('') + '</tbody></table></div>');
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

/* ---------- 8) Aktivitäten ---------- */
const FEED_T = { 3: 'Transfer', 12: 'Gebot', 15: 'Marktwert', 26: 'Aktivität', 14: 'Aufstellung', 22: 'Liga' };
function vFeed(v) {
  const af = (S.feed && S.feed.af) || [];
  if (!af.length) { v.innerHTML = card('Aktivitäten', '', '<div class="empty">Keine Aktivitäten gefunden.</div>'); return; }
  v.innerHTML = card('Letzte Aktivitäten', af.length + ' Einträge', '<div class="tbl-wrap"><table><tbody>' +
    af.map(a => {
      const d = a.data || {};
      const who = d.byr || d.n || d.unm || '';
      const what = d.pn || d.n || '';
      let txt = '';
      if (a.t === 3 || a.t === 12) txt = esc(who) + (d.slr ? ' ← ' + esc(d.slr) : '') + (d.trp ? ' · ' + eur(d.trp) : '');
      else txt = esc(Object.keys(d).length ? (d.m || d.msg || who || '') : '');
      return '<tr' + (d.pi ? ' class="clickable" data-p="' + esc(d.pi) + '"' : '') + '>' +
        '<td style="width:1%"><span class="pill">' + esc(FEED_T[a.t] || ('Typ ' + a.t)) + '</span></td>' +
        '<td>' + (what ? playerCell(what, d.pim) : '<span class="psub">–</span>') + '</td>' +
        '<td>' + txt + '</td>' +
        '<td class="num" style="color:var(--muted);font-size:12px">' + ago(a.dt) + '</td></tr>';
    }).join('') + '</tbody></table></div>');
  v.querySelectorAll('[data-p]').forEach(tr => tr.onclick = () => openPlayer(tr.dataset.p));
}

/* ---------- 9) Archiv (vom Sammel-Roboter aufgebaute Historie) ---------- */
function vArchive(v) {
  const A = S.archive;

  if (A === 'loading') { v.innerHTML = card('Archiv', '', '<div class="empty">Archiv wird geladen …</div>'); return; }
  if (!A) {
    v.innerHTML = card('Archiv – noch nicht eingerichtet', '', '<div class="empty" style="text-align:left;max-width:640px;margin:0 auto">' +
      '<p style="color:var(--ink);font-weight:600;margin-top:0">Hier entsteht deine eigene Datenhistorie.</p>' +
      '<p>Kickbase liefert Marktwerte und Punkte rückwirkend – die findest du bereits in den anderen Reitern. ' +
      'Drei Dinge vergisst Kickbase aber täglich:</p>' +
      '<ul style="line-height:1.9"><li>wer wann zu welchem Preis auf dem <b>Transfermarkt</b> stand</li>' +
      '<li>wie sich <b>Teamwert und Platzierung</b> deiner Mitspieler stündlich entwickeln</li>' +
      '<li>welcher <b>Spieler wem</b> an welchem Tag gehört hat</li></ul>' +
      '<p>Der Sammel-Roboter läuft alle sechs Stunden bei GitHub und schreibt genau das mit. ' +
      'Sobald er das erste Mal gelaufen ist, füllt sich diese Seite von allein.</p>' +
      '<p style="color:var(--muted);font-size:12.5px">Gesucht wurde: <code>data/archive-' + esc(S.leagueId) + '.json</code></p>' +
      '</div>');
    return;
  }

  const M = A.meta || {};
  const mgrs = Object.entries(A.managers || {});
  const mkt = A.market || [];
  const tsFmt = t => dmyhm(t * 1000);

  let h = '<div class="grid g-stats" style="margin-bottom:16px">' +
    statCard('Sammelt seit', M.firstRun ? dmy(M.firstRun) : '–', M.runs ? M.runs + ' Durchläufe' : '') +
    statCard('Letzter Stand', M.lastRun ? ago(M.lastRun) : '–', M.lastRun ? dmyhm(M.lastRun) : '') +
    statCard('Markt-Aufnahmen', num(mkt.length), 'gespeicherte Momentbilder') +
    statCard('Beobachtete Spieler', num(Object.keys(A.players || {}).length), mgrs.length + ' Manager') +
    '</div>';

  h += card('Teamwert im Zeitverlauf', 'echte Messpunkte, nicht je Spieltag', '<div id="c-arc1"></div>');
  h += card('Platzierung im Zeitverlauf', 'oben = vorne', '<div id="c-arc2"></div>');

  // Transfermarkt-Auswertung
  const seen = {};
  mkt.forEach(s => (s.it || []).forEach(p => {
    if (!p.pi) return;
    const e = seen[p.pi] || (seen[p.pi] = { n: p.n, pi: p.pi, count: 0, prcSum: 0, mvSum: 0, ofc: 0, last: 0 });
    e.count++; e.prcSum += (p.prc || 0); e.mvSum += (p.mv || 0); e.ofc += (p.ofc || 0);
    e.last = Math.max(e.last, s.ts);
  }));
  const seenList = Object.values(seen);

  if (seenList.length) {
    h += '<div class="grid g-2">' +
      card('Am häufigsten auf dem Markt', 'in ' + mkt.length + ' Aufnahmen', '<div id="c-arc3"></div>') +
      card('Höchster Aufschlag auf den Marktwert', 'Durchschnitt je Spieler', '<div id="c-arc4"></div>') +
      '</div>';
    h += card('Alle beobachteten Marktangebote', num(seenList.length) + ' verschiedene Spieler', '<div id="t-arc"></div>');
  } else {
    h += card('Transfermarkt-Historie', '', '<div class="empty">Noch keine Marktdaten gesammelt. Nach dem ersten Lauf des Roboters erscheinen sie hier.</div>');
  }

  v.innerHTML = h;

  // Zeitreihen zeichnen
  const pick = mgrs.slice(0, 8);
  const mk = (key) => pick.map(([uid, m], i) => {
    const s = (m.series || {})[key];
    if (!s || !s.t) return null;
    return { name: m.n, color: sc(i),
      points: s.t.map((t, k) => ({ x: t, y: s.v[k], label: tsFmt(t) })).filter(p => p.y != null) };
  }).filter(s => s && s.points.length);

  lineChart($('#c-arc1', v), mk('tv'), { fmtX: t => dmy(t * 1000), fmtY: eurShort, height: 260 });
  const plS = mk('pl').map(s => ({ ...s, points: s.points.map(p => ({ ...p, y: -p.y })) }));
  lineChart($('#c-arc2', v), plS, { fmtX: t => dmy(t * 1000), fmtY: y => Math.round(-y) + '.', height: 240 });

  if (seenList.length) {
    barChart($('#c-arc3', v), seenList.slice().sort((a, b) => b.count - a.count).slice(0, 10)
      .map(e => ({ label: e.n, value: e.count, onClick: () => openPlayer(e.pi) })), { fmt: v2 => num(v2) + '×' });
    barChart($('#c-arc4', v), seenList.filter(e => e.mvSum)
      .map(e => ({ ...e, diff: (e.prcSum - e.mvSum) / e.count }))
      .sort((a, b) => b.diff - a.diff).slice(0, 10)
      .map(e => ({ label: e.n, value: e.diff, color: e.diff >= 0 ? 'var(--crit)' : 'var(--good)',
                   onClick: () => openPlayer(e.pi) })), { fmt: eurShort });

    sortTable($('#t-arc', v), [
      { label: 'Spieler', val: e => e.n, html: e => '<span class="pname">' + esc(e.n) + '</span>' },
      { label: 'Gesehen', num: true, val: e => e.count, html: e => num(e.count) + '×' },
      { label: 'Ø Preis', num: true, val: e => e.prcSum / e.count, html: e => eurShort(e.prcSum / e.count) },
      { label: 'Ø Marktwert', num: true, val: e => e.mvSum / e.count, html: e => eurShort(e.mvSum / e.count) },
      { label: 'Ø Aufschlag', num: true, val: e => (e.prcSum - e.mvSum) / e.count,
        html: e => deltaHtml((e.prcSum - e.mvSum) / e.count) },
      { label: 'Gebote gesamt', num: true, val: e => e.ofc, html: e => num(e.ofc) },
      { label: 'Zuletzt', num: true, val: e => e.last, html: e => ago(e.last * 1000) }
    ], seenList.map(e => ({ ...e, _id: e.pi })), { sort: 1, dir: -1, onRow: id => openPlayer(id) });
  }
}

/** Archiv laden - liegt neben der Seite, wird vom Roboter erzeugt */
async function loadArchive() {
  if (api.demo) { S.archive = window.KB_DEMO.archive; if (curTab === 'archive') renderAll(); return; }
  S.archive = 'loading';
  try {
    const r = await fetch('data/archive-' + S.leagueId + '.json', { cache: 'no-cache' });
    S.archive = r.ok ? await r.json() : null;
  } catch (e) { S.archive = null; }
  if (curTab === 'archive') renderAll();
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
      api.get('/v4/competitions/' + cpi + '/players', 6e5).then(r => { S.compPlayers = r; if (curTab === 'players') renderAll(); })
    ]).catch(() => {});

    const ids = ((ranking && ranking.us) || []).map(u => u.i);
    pool(ids, loadManager, 4).then(() => { if (curTab === 'managers' || curTab === 'players') renderAll(); });
    loadArchive();

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
    managers: D.managerData, meId: D.meId, curday: D.curday, loadedAt: Date.now(),
    archive: D.archive
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
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
  if (next) document.documentElement.setAttribute('data-theme', next);
  else document.documentElement.removeAttribute('data-theme');
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
