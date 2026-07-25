/* ============================================================
   Kickbase-Archiv-Sammler
   Läuft automatisch bei GitHub Actions (siehe .github/workflows).
   Holt die Daten, die Kickbase NICHT dauerhaft vorhält, und
   schreibt sie fortlaufend nach data/archive-<ligaId>.json.

   Zugangsdaten kommen aus den GitHub-Secrets:
     KICKBASE_EMAIL, KICKBASE_PASSWORD
   Sie stehen nirgends im Code.
   ============================================================ */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const API = 'https://api.kickbase.com';
const OUT = 'data';
const MARKET_KEEP_DAYS = 120;     // Markt-Snapshots so lange aufheben
const MAX_POINTS = 3000;          // Sicherung gegen unbegrenztes Wachstum

const EMAIL = process.env.KICKBASE_EMAIL;
const PASS  = process.env.KICKBASE_PASSWORD;
const ONLY  = (process.env.KICKBASE_LEAGUES || '').split(',').map(s => s.trim()).filter(Boolean);

if (!EMAIL || !PASS) {
  console.error('FEHLER: KICKBASE_EMAIL und KICKBASE_PASSWORD müssen als Secrets gesetzt sein.');
  process.exit(1);
}

let token = null;
let failed = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(pathname, opts = {}) {
  const r = await fetch(API + pathname, {
    method: opts.method || 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'kickbase-archive/1.0',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status + ' ' + pathname), { code: r.status });
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/** GET, das im Fehlerfall null liefert statt den Lauf abzubrechen */
async function get(pathname, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { return await req(pathname); }
    catch (e) {
      if (e.code === 401) throw e;                       // Token tot -> abbrechen
      if (i === tries - 1) { failed++; console.warn('  übersprungen:', pathname, e.message); return null; }
      await sleep(600 * (i + 1));
    }
  }
  return null;
}

/** Begrenzte Parallelität */
async function pool(items, fn, limit = 4) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/* ---------- Zeitreihen-Hilfen (spaltenweise = kompakt) ---------- */
function pushSeries(obj, key, ts, value) {
  const s = obj[key] || (obj[key] = { t: [], v: [] });
  // Gleicher Zeitstempel? Dann überschreiben statt doppelt anhängen.
  if (s.t.length && s.t[s.t.length - 1] === ts) { s.v[s.v.length - 1] = value; return; }
  s.t.push(ts); s.v.push(value);
  if (s.t.length > MAX_POINTS) { s.t.splice(0, s.t.length - MAX_POINTS); s.v.splice(0, s.v.length - MAX_POINTS); }
}

async function main() {
  console.log('Kickbase-Archiv – Lauf gestartet', new Date().toISOString());

  // --- Anmelden ---
  const login = await req('/v4/user/login', { method: 'POST', body: { em: EMAIL, pass: PASS, loy: false, rep: {} } });
  if (!login?.tkn) { console.error('FEHLER: Anmeldung lieferte kein Token.'); process.exit(1); }
  token = login.tkn;
  console.log('Angemeldet als', login.u?.name || EMAIL);

  const sel = await get('/v4/leagues/selection');
  let leagues = sel?.it || login.srvl || [];
  if (ONLY.length) leagues = leagues.filter(l => ONLY.includes(String(l.i)));
  if (!leagues.length) { console.error('Keine Ligen gefunden.'); process.exit(1); }
  console.log('Ligen:', leagues.map(l => l.n).join(', '));

  await mkdir(OUT, { recursive: true });
  const now = new Date();
  const ts = Math.floor(now.getTime() / 1000);
  const today = now.toISOString().slice(0, 10);
  const index = [];

  for (const lg of leagues) {
    const lid = String(lg.i);
    console.log('\n--- Liga', lg.n, '(' + lid + ') ---');
    const file = path.join(OUT, 'archive-' + lid + '.json');

    // Vorhandenes Archiv laden
    let A = { meta: {}, managers: {}, players: {}, market: [], daily: {} };
    if (existsSync(file)) {
      try { A = JSON.parse(await readFile(file, 'utf8')); }
      catch { console.warn('  Archiv unlesbar, wird neu angelegt.'); }
    }
    A.meta ||= {}; A.managers ||= {}; A.players ||= {}; A.market ||= []; A.daily ||= {};

    const L = '/v4/leagues/' + lid;
    const [ranking, market, me, budget] = await Promise.all([
      get(L + '/ranking'), get(L + '/market'), get(L + '/me'), get(L + '/me/budget')
    ]);

    // --- Manager-Zeitreihen ---
    const users = ranking?.us || [];
    console.log('  Manager:', users.length);
    for (const u of users) {
      const uid = String(u.i);
      const m = A.managers[uid] || (A.managers[uid] = { n: u.n, uim: u.uim, series: {} });
      m.n = u.n; if (u.uim) m.uim = u.uim;
      pushSeries(m.series, 'sp', ts, u.sp ?? null);        // Saisonpunkte
      pushSeries(m.series, 'tv', ts, u.tv ?? null);        // Teamwert
      pushSeries(m.series, 'pl', ts, u.spl ?? null);       // Platz
      pushSeries(m.series, 'mdp', ts, u.mdp ?? null);      // Punkte letzter Spieltag
      if (Array.isArray(u.lp)) m.lp = u.lp;                // Punkte je Spieltag (Momentbild)
    }

    // --- Kader aller Manager: liefert nebenbei alle Marktwerte ---
    const squads = await pool(users.map(u => String(u.i)),
      uid => get(L + '/managers/' + uid + '/squad'), 3);

    // Kickbase rechnet Marktwerte nur einmal am Tag neu. Sie viermal täglich
    // mitzuschreiben bläht Archiv und Repository auf, ohne Erkenntnis zu bringen.
    const mvToday = A.meta.lastMvDay === today;
    if (mvToday) console.log('  Marktwerte für heute bereits erfasst – übersprungen.');

    const ownerOf = {};
    let playerCount = 0;
    squads.forEach((sq, i) => {
      if (!sq?.it) return;
      const uid = String(users[i].i);
      for (const p of sq.it) {
        const pid = String(p.pi);
        ownerOf[pid] = uid;
        const P = A.players[pid] || (A.players[pid] = { n: p.pn, tid: p.tid, pos: p.pos, series: {} });
        P.n = p.pn; P.tid = p.tid; P.pos = p.pos;
        if (!mvToday) {
          pushSeries(P.series, 'mv', ts, p.mv ?? null);
          if (p.p != null) pushSeries(P.series, 'p', ts, p.p);
        }
        playerCount++;
      }
    });
    console.log('  Spieler in Kadern:', playerCount);

    // Besitzverhältnisse als Tagesbild (wer hatte wen)
    A.daily[today] = A.daily[today] || {};
    A.daily[today].owners = ownerOf;
    A.daily[today].ts = ts;

    // --- Transfermarkt-Momentaufnahme (das Flüchtigste überhaupt) ---
    if (market?.it) {
      const snap = {
        ts,
        it: market.it.map(p => ({
          pi: String(p.i ?? p.pi ?? ''), n: p.n ?? p.pn ?? '', tid: p.tid ?? '',
          pos: p.pos ?? null, prc: p.prc ?? null, mv: p.mv ?? null,
          ofc: p.ofc ?? null, exs: p.exs ?? null,
          u: p.u ? { i: String(p.u.i ?? ''), n: p.u.n ?? '' } : null
        }))
      };
      A.market.push(snap);
      const cutoff = ts - MARKET_KEEP_DAYS * 86400;
      A.market = A.market.filter(s => s.ts >= cutoff);
      console.log('  Marktangebote gesichert:', snap.it.length, '| Snapshots gesamt:', A.market.length);

      // Marktspieler, die keinem Kader angehören, ebenfalls beobachten
      for (const p of snap.it) {
        if (!p.pi) continue;
        const P = A.players[p.pi] || (A.players[p.pi] = { n: p.n, tid: p.tid, pos: p.pos, series: {} });
        if (p.mv != null && !mvToday) pushSeries(P.series, 'mv', ts, p.mv);
      }
    }
    if (!mvToday) A.meta.lastMvDay = today;

    // --- Eigenes Budget (nur für den eigenen Account sichtbar) ---
    if (budget) {
      A.meta.myBudget = A.meta.myBudget || { t: [], v: [] };
      pushSeries({ b: A.meta.myBudget }, 'b', ts, budget.b ?? null);
    }

    // Alte Tagesbilder ausdünnen
    const dayKeys = Object.keys(A.daily).sort();
    while (dayKeys.length > 400) delete A.daily[dayKeys.shift()];

    A.meta.leagueId = lid;
    A.meta.leagueName = lg.n;
    A.meta.competitionId = lg.cpi ?? me?.cpi ?? null;
    A.meta.firstRun = A.meta.firstRun || now.toISOString();
    A.meta.lastRun = now.toISOString();
    A.meta.runs = (A.meta.runs || 0) + 1;
    A.meta.managerCount = users.length;
    A.meta.playerCount = Object.keys(A.players).length;

    await writeFile(file, JSON.stringify(A), 'utf8');
    const kb = Math.round((await readFile(file)).length / 1024);
    console.log('  gespeichert:', file, kb + ' KB', '| Lauf Nr.', A.meta.runs);

    index.push({ leagueId: lid, name: lg.n, file: 'archive-' + lid + '.json',
                 runs: A.meta.runs, lastRun: A.meta.lastRun, firstRun: A.meta.firstRun,
                 managers: users.length, players: A.meta.playerCount,
                 marketSnapshots: A.market.length, sizeKb: kb });
  }

  await writeFile(path.join(OUT, 'index.json'),
    JSON.stringify({ updated: now.toISOString(), leagues: index }, null, 1), 'utf8');

  console.log('\nFertig.', failed ? failed + ' Teilabfragen übersprungen.' : 'Ohne Fehler.');
}

main().catch(e => {
  console.error('ABBRUCH:', e.message);
  process.exit(1);
});
