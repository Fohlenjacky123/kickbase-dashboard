/* ============================================================
   Demo-Daten - erzeugt eine realistisch aussehende Liga,
   damit das Dashboard ohne Anmeldung ausprobiert werden kann.
   Struktur entspricht 1:1 den echten Kickbase-Antworten.
   ============================================================ */
(function () {
  // Reproduzierbarer Zufall, damit die Demo bei jedem Laden gleich aussieht
  let seed = 20260725;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
  const pick = a => a[Math.floor(rnd() * a.length)];

  const DAY = 24 * 3600 * 1000;
  const TODAY = Math.floor(Date.now() / DAY);   // Tage seit 1970 (API-Format "dt")
  const CURDAY = 24;                            // aktueller Spieltag

  const TEAMS = {
    2:  'Bayern München',  3: 'Borussia Dortmund', 15: 'RB Leipzig',    6: 'Bayer Leverkusen',
    9:  'Eintracht Frankfurt', 14: 'VfB Stuttgart', 24: 'VfL Wolfsburg', 4: 'Werder Bremen',
    7:  'SC Freiburg',    18: 'TSG Hoffenheim',   11: 'Mainz 05',      40: 'FC Augsburg',
    43: 'Union Berlin',   10: 'Bor. Mönchengladbach', 28: 'FC St. Pauli', 50: '1. FC Heidenheim',
    5:  '1. FC Köln',     51: 'Hamburger SV'
  };
  const TIDS = Object.keys(TEAMS);

  // Kader-Rohdaten: [Vorname, Nachname, TeamId, Position, Marktwert Mio, Ø-Punkte]
  const POOL = [
    ['Harry','Kane',2,4,26.5,168],       ['Jamal','Musiala',2,3,24.0,151],
    ['Michael','Olise',2,3,22.8,146],    ['Joshua','Kimmich',2,3,19.4,132],
    ['Alphonso','Davies',2,2,17.2,118],  ['Manuel','Neuer',2,1,14.6,121],
    ['Serhou','Guirassy',3,4,21.3,139],  ['Karim','Adeyemi',3,3,15.8,104],
    ['Julian','Brandt',3,3,14.2,99],     ['Nico','Schlotterbeck',3,2,15.1,112],
    ['Gregor','Kobel',3,1,13.9,116],     ['Pascal','Groß',3,3,11.4,95],
    ['Xavi','Simons',15,3,19.7,128],     ['Benjamin','Šeško',15,4,18.9,122],
    ['Willi','Orbán',15,2,12.6,101],     ['Péter','Gulácsi',15,1,10.8,98],
    ['Florian','Wirtz',6,3,25.1,158],    ['Patrik','Schick',6,4,17.6,124],
    ['Jeremie','Frimpong',6,2,16.4,119], ['Lukáš','Hrádecký',6,1,11.2,103],
    ['Omar','Marmoush',9,4,20.4,141],    ['Hugo','Ekitiké',9,4,16.1,113],
    ['Mario','Götze',9,3,9.8,84],        ['Kevin','Trapp',9,1,10.1,94],
    ['Deniz','Undav',14,4,16.8,121],     ['Angelo','Stiller',14,3,13.7,106],
    ['Alexander','Nübel',14,1,11.6,105], ['Maximilian','Mittelstädt',14,2,11.9,97],
    ['Jonas','Wind',24,4,12.3,92],       ['Lovro','Majer',24,3,10.6,86],
    ['Marvin','Ducksch',4,4,11.8,90],    ['Romano','Schmid',4,3,9.4,81],
    ['Ritsu','Doan',7,3,12.9,98],        ['Vincenzo','Grifo',7,3,11.1,89],
    ['Andrej','Kramarić',18,4,10.9,87],  ['Oliver','Baumann',18,1,9.6,91],
    ['Jonathan','Burkardt',11,4,12.1,95],['Robin','Zentner',11,1,8.9,86],
    ['Phillip','Tietz',40,4,8.4,74],     ['Finn','Dahmen',40,1,8.1,83],
    ['Benedict','Hollerbach',43,4,9.1,78],['Rani','Khedira',43,3,7.6,71],
    ['Tim','Kleindienst',10,4,13.4,102], ['Moritz','Nicolas',10,1,7.9,80],
    ['Johannes','Eggestein',28,4,7.4,68],['Nikola','Vasilj',28,1,6.8,73],
    ['Marvin','Pieringer',50,4,6.9,66],  ['Kevin','Müller',50,1,6.4,70],
    ['Marius','Bülter',5,4,8.8,76],      ['Marvin','Schwäbe',5,1,7.2,77],
    ['Ransford','Königsdörffer',51,4,7.8,72], ['Daniel','Heuer Fernandes',51,1,6.6,69]
  ];

  // Ergänzungsspieler, damit Kader und Transfermarkt realistisch gefüllt sind
  const VN = ['Leon','Nico','Tim','Jonas','Luca','Elias','Fabian','Marco','Kai','Sven','Diego','Yusuf',
              'Mattéo','Rafael','Ibrahim','Anton','Ole','Erik','Milan','Noah','Amir','Tobias','Janis','Piero'];
  const NN = ['Berger','Kraft','Wendt','Lehmann','Sattler','Fischer','Kowal','Baric','Sørensen','Ferreira',
              'Novak','Delgado','Ruiz','Brandão','Öztürk','Haaland','Lindqvist','Moreau','Bakker','Ricci',
              'Tanaka','Achouri','Voigt','Steiner','Neumann','Kellner','Hübner','Rossi','Vidal','Prskalo'];
  TIDS.forEach(tid => {
    for (let k = 0; k < 7; k++) {
      const pos = k === 0 ? 1 : k < 3 ? 2 : k < 6 ? 3 : 4;
      const mv = (0.6 + rnd() * 6.5);
      POOL.push([pick(VN), pick(NN), +tid, pos, +mv.toFixed(1), Math.round(28 + mv * 9 + rnd() * 22)]);
    }
  });

  const img = () => 'content/file/demo' + ri(1000, 9999) + '.png';

  // ---- Marktwert-Verlauf: 365 Tage Random-Walk mit leichtem Trend ----
  function mvHistory(mvNow, drift) {
    const it = [];
    let v = mvNow * (1 - drift);
    for (let d = 364; d >= 0; d--) {
      v *= 1 + (rnd() - 0.48) * 0.012 + (drift / 365);
      it.push({ dt: TODAY - d, mv: Math.round(v / 1000) * 1000 });
    }
    it[it.length - 1].mv = mvNow;
    const vals = it.map(x => x.mv);
    return { it, trp: 0, prlo: 0, lmv: Math.min(...vals), hmv: Math.max(...vals), idp: false };
  }

  // ---- Spieler zusammenbauen ----
  const players = POOL.map((p, idx) => {
    const [fn, ln, tid, pos, mvM, ap] = p;
    const mv = Math.round(mvM * 1e6);
    const drift = (rnd() - 0.42) * 0.5;
    const st = rnd() < 0.86 ? 0 : pick([1, 2, 4, 8]);
    const tp = Math.round(ap * CURDAY * (0.85 + rnd() * 0.3));
    const sdmvt = Math.round(mv * (rnd() - 0.45) * 0.02);
    return {
      i: String(300 + idx), fn, ln, n: ln, tid: String(tid), tn: TEAMS[tid],
      pos, st, stl: [], mv, mvt: sdmvt > 0 ? 1 : (sdmvt < 0 ? 2 : 0),
      // sdmvt ist der mehrtägige Trend (größer), tfhmvt die echte 24h-Änderung
      // (kleiner) - reales Verhältnis laut Kickbase-API-Beispieldaten.
      sdmvt, tfhmvt: Math.round(sdmvt * 0.18), p: tp, ap, tp,
      g: pos === 4 ? ri(2, 14) : pos === 3 ? ri(0, 8) : ri(0, 2),
      a: pos >= 3 ? ri(1, 11) : ri(0, 3),
      y: ri(0, 6), r: ri(0, 1) === 1 && rnd() < 0.1 ? 1 : 0,
      sec: ri(400, 2100) * 60, shn: ri(1, 45), day: CURDAY,
      pim: img(), tim: img(), _drift: drift, _mvh: null
    };
  });
  const byId = {};
  players.forEach(p => { byId[p.i] = p; p._mvh = mvHistory(p.mv, p._drift); });

  // ---- Manager ----
  const MGR = ['Du (Demo)', 'Kevin', 'Sandra', 'Basti', 'Nils', 'Melanie', 'Tobi', 'Jana', 'Ferdi', 'Ronny'];
  const managers = MGR.map((n, i) => {
    const lp = [];
    for (let d = 0; d < CURDAY; d++) lp.push(ri(180, 780));
    const sp = lp.reduce((a, b) => a + b, 0);
    return {
      i: String(1000 + i), n, uim: img(), adm: i === 0,
      sp, mdp: lp[lp.length - 1], lp, tv: ri(180, 285) * 1e6,
      b: ri(-8, 34) * 1e6, prft: ri(-12, 62) * 1e6,
      mdw: ri(0, 6), pa: true, shp: 0, lipc: 0, ppc: 0, hhsp: 0, hll: false, iapl: false
    };
  });
  managers.sort((a, b) => b.sp - a.sp);
  managers.forEach((m, i) => { m.spl = i + 1; m.mdpl = i + 1; });
  const ME = managers.find(m => m.n === 'Du (Demo)');

  // Kader auf Manager verteilen
  const shuffled = players.slice().sort(() => rnd() - 0.5);
  const owned = {};
  const PER = 14;
  managers.forEach((m, mi) => {
    m._squad = shuffled.slice(mi * PER, mi * PER + PER);
    m._squad.forEach(p => { owned[p.i] = m.i; });
  });

  const squadItem = (p, forMe) => ({
    i: p.i, n: p.ln, pos: p.pos, st: p.st, stl: [], mv: p.mv, mvt: p.mvt,
    p: p.tp, ap: p.ap, sdmvt: p.sdmvt, tfhmvt: p.tfhmvt, tid: p.tid, pim: p.pim,
    lo: forMe ? ri(0, 11) : 0, lst: rnd() < 0.6 ? 1 : 0, mdst: 3,
    prc: Math.round(p.mv * (0.7 + rnd() * 0.45)),
    mvgl: Math.round(p.mv * (rnd() - 0.35) * 0.4), iotm: rnd() < 0.12, ofc: ri(0, 3)
  });
  managers.forEach(m => { m._squadItems = m._squad.map(p => squadItem(p, m === ME)); });

  // ---- Transfermarkt ----
  const freeAgents = players.filter(p => !owned[p.i]);
  const market = {
    it: freeAgents.slice(0, 10).map(p => ({
      i: p.i, n: p.ln, fn: p.fn, pos: p.pos, st: p.st, mv: p.mv, mvt: p.mvt,
      prc: Math.round(p.mv * (0.95 + rnd() * 0.25)), tid: p.tid, pim: p.pim,
      exs: ri(3600, 82000), p: p.tp, ap: p.ap, sdmvt: p.sdmvt, ofc: ri(0, 4),
      u: rnd() < 0.35 ? { i: pick(managers).i, n: pick(managers).n } : null
    })),
    nps: 9, tv: ME.tv, day: CURDAY,
    mvud: new Date(Date.now() - 3 * 3600e3).toISOString(),
    dt: new Date(Date.now() + 19 * 3600e3).toISOString()
  };

  // ---- Bundesliga-Tabelle ----
  const table = TIDS.map(tid => ({
    tid, tn: TEAMS[tid], mc: CURDAY, cp: ri(14, 58), gd: ri(-24, 38),
    cpl: 0, pcpl: 0, sp: 0, il: false, mi: '', tim: img()
  })).sort((a, b) => b.cp - a.cp || b.gd - a.gd);
  table.forEach((t, i) => { t.cpl = i + 1; t.pcpl = Math.max(1, i + 1 + ri(-2, 2)); });

  // ---- Spielplan ----
  const mdList = [];
  for (let d = Math.max(1, CURDAY - 2); d <= CURDAY + 2; d++) {
    const ts = TIDS.slice().sort(() => rnd() - 0.5);
    const games = [];
    for (let k = 0; k + 1 < ts.length; k += 2) {
      const past = d <= CURDAY;
      games.push({
        mi: 'm' + d + '_' + k, day: d,
        dt: new Date(Date.now() + (d - CURDAY) * 7 * DAY + k * 3600e3).toISOString(),
        t1: ts[k], t2: ts[k + 1], t1sy: TEAMS[ts[k]].slice(0, 3).toUpperCase(),
        t2sy: TEAMS[ts[k + 1]].slice(0, 3).toUpperCase(),
        t1g: past ? ri(0, 4) : 0, t2g: past ? ri(0, 3) : 0,
        st: past ? 2 : 0, il: false, t1im: img(), t2im: img()
      });
    }
    mdList.push({ day: d, it: games });
  }

  // ---- Aktivitäten-Feed ----
  const feed = { af: [] };
  for (let i = 0; i < 26; i++) {
    const p = pick(players), m = pick(managers), m2 = pick(managers);
    const t = pick([3, 12, 15, 26]);
    feed.af.push({
      i: 'a' + i, t, coc: ri(0, 5),
      dt: new Date(Date.now() - i * ri(20, 400) * 60000).toISOString(),
      data: { pi: p.i, pn: p.ln, tid: p.tid, pim: p.pim, trp: Math.round(p.mv * (0.9 + rnd() * 0.3)),
              byr: m.n, slr: m2.n, uim: m.uim, n: m.n }
    });
  }

  // ---- Öffentliche Demo-Struktur ----
  window.KB_DEMO = {
    selection: { it: [{ i: 'demo1', n: 'Demo-Liga 25/26', cpi: '1', b: ME.b, tv: ME.tv, pl: ME.spl,
                        adm: true, un: 0, lim: img(), cpim: img(), gpm: 1, rnkm: 1 }], anol: 1 },
    userMe: { id: ME.i, name: ME.n, email: 'demo@beispiel.de', profile: ME.uim },
    league: {
      me: { b: ME.b, bs: 50e6, mppu: 18, un: 0, adm: true, cpi: '1', lnm: 'Demo-Liga 25/26',
            tpc: [], mpst: 3, lim: img(), gpm: 1, rnkm: 1 },
      budget: { pbas: ME.b + 12e6, b: ME.b, bs: 50e6 },
      overview: { i: 'demo1', lnm: 'Demo-Liga 25/26', cpi: '1', cpn: 'Bundesliga',
                  dt: '2025-08-01T12:00:00Z', mgc: managers.length, b: 50e6, mppu: 18, adm: true,
                  us: managers.map(m => ({ i: m.i, n: m.n, uim: m.uim })),
                  btls: [
                    { t: 1, n: 'Spieltagssieger', d: 'Die meisten Spieltagssiege', u: { i: managers[0].i, n: managers[0].n, uim: managers[0].uim } },
                    { t: 2, n: 'Transferkönig', d: 'Die meisten Transfers', u: { i: managers[1].i, n: managers[1].n, uim: managers[1].uim } },
                    { t: 7, n: 'Torjäger', d: 'Meiste Punkte mit Stürmern', u: { i: managers[2].i, n: managers[2].n, uim: managers[2].uim } },
                    { t: 4, n: 'Rückhalt', d: 'Meiste Punkte mit Torhütern', u: { i: managers[3].i, n: managers[3].n, uim: managers[3].uim } }
                  ] },
      ranking: { ti: 'Demo-Liga 25/26', cpi: '1', day: CURDAY, sn: '25/26', nd: 34, il: false,
                 us: managers.map(m => ({ i: m.i, n: m.n, adm: m.adm, sp: m.sp, mdp: m.mdp, shp: 0,
                                          tv: m.tv, spl: m.spl, mdpl: m.mdpl, pa: true, lp: m.lp,
                                          uim: m.uim, lipc: 0, ppc: 0, hhsp: 0, hll: false })) },
      squad: { it: ME._squadItems, ua: ME.i },
      market, feed,
      myeleven: { lp: ME._squad.slice(0, 11).map(p => ({ i: p.i, n: p.ln, tid: p.tid, pos: p.pos,
                    st: p.st, pim: p.pim, mst: 2, md: 'Demo', ictp: false })),
                  nlp: [], p: ME.mdp, pa: true, lpc: 11, clpc: 11 }
    },
    competition: { id: '1', table: { it: table, conf: [] }, matchdays: { it: mdList, day: CURDAY } },
    managers, players, byId, owned,
    meId: ME.i, curday: CURDAY, teams: TEAMS
  };

  // Manager-Detailantworten
  window.KB_DEMO.managerData = {};
  managers.forEach(m => {
    window.KB_DEMO.managerData[m.i] = {
      dashboard: { u: m.i, unm: m.n, st: 0, ap: Math.round(m.sp / CURDAY), tp: m.sp, mdw: m.mdw,
                   pl: m.spl, tv: m.tv, prft: m.prft, lnm: 'Demo-Liga 25/26', li: 'demo1',
                   adm: m.adm, ph: m.lp, uim: m.uim, fp: [], mds: [] },
      performance: { u: m.i, unm: m.n, st: 0, it: [{ sid: '25', sn: '25/26', pl: m.spl,
                     ap: Math.round(m.sp / CURDAY), tp: m.sp, mdw: m.mdw,
                     it: m.lp.map((p, d) => ({ day: d + 1, cur: d + 1 === CURDAY, mdp: p,
                                               tw: p > 600, md: 'Spieltag ' + (d + 1) })) }] },
      squad: { u: m.i, unm: m.n, uim: m.uim, st: 0, nps: m._squadItems.length,
               it: m._squadItems.map(s => ({ pi: s.i, pn: s.n, tid: s.tid, lo: s.lo, lst: s.lst,
                    pos: s.pos, st: s.st, stl: [], p: s.p, ap: s.ap, iotm: s.iotm, sdmvt: s.sdmvt,
                    tfhmvt: s.tfhmvt, mvgl: s.mvgl, mvt: s.mvt, prc: s.prc, mv: s.mv, pim: s.pim })) },
      transfers: { u: m.i, unm: m.n, it: m._squad.slice(0, 4).map(p => ({
                     pi: p.i, pn: p.ln, tid: p.tid, tty: ri(1, 2), trp: Math.round(p.mv * (0.85 + rnd() * 0.35)),
                     dt: new Date(Date.now() - ri(1, 60) * DAY).toISOString(), pim: p.pim,
                     othnm: pick(managers).n })) }
    };
  });

  // Spieler-Detailantworten
  window.KB_DEMO.playerData = {};
  players.forEach(p => {
    window.KB_DEMO.playerData[p.i] = {
      detail: { i: p.i, fn: p.fn, ln: p.ln, n: p.ln, shn: p.shn, tid: p.tid, tn: p.tn,
                oui: owned[p.i] || '', st: p.st, stl: [], pos: p.pos, tp: p.tp, ap: p.ap,
                sec: p.sec, g: p.g, a: p.a, y: p.y, r: p.r, mv: p.mv, cv: p.mv, mvt: p.mvt,
                sdmvt: p.sdmvt, tfhmvt: p.tfhmvt, day: CURDAY, pim: p.pim, tim: p.tim, mdsum: [] },
      mvHistory: p._mvh,
      performance: { it: [{ ti: '25', n: '25/26', ph: Array.from({ length: CURDAY }, (_, d) => ({
                       day: d + 1, p: Math.max(0, Math.round(p.ap * (0.3 + rnd() * 1.6))),
                       md: 'Spieltag ' + (d + 1), t1: p.tn, t2: TEAMS[pick(TIDS)],
                       t1g: ri(0, 4), t2g: ri(0, 3), st: 0, cur: d + 1 === CURDAY,
                       mdst: 2, ap: p.ap, tp: p.tp, asp: 0 })) }] },
      transferHistory: { it: Array.from({ length: ri(1, 5) }, () => ({
                          dt: new Date(Date.now() - ri(2, 200) * DAY).toISOString(),
                          trp: Math.round(p.mv * (0.8 + rnd() * 0.5)),
                          byr: pick(managers).n, slr: rnd() < 0.5 ? 'Kickbase' : pick(managers).n
                        })).sort((a, b) => new Date(b.dt) - new Date(a.dt)) }
    };
  });

  /* ---- Beispiel-Archiv: so sieht es aus, wenn der Sammel-Roboter
         drei Wochen lang alle 6 Stunden gelaufen ist ---- */
  (function buildArchive() {
    const RUNS = 21 * 4, STEP = 6 * 3600;                 // 3 Wochen, alle 6 Std
    const now = Math.floor(Date.now() / 1000);
    const stamps = Array.from({ length: RUNS }, (_, k) => now - (RUNS - 1 - k) * STEP);

    const A = { meta: {}, managers: {}, players: {}, market: [], daily: {} };

    managers.forEach(m => {
      const s = { sp: { t: [], v: [] }, tv: { t: [], v: [] }, pl: { t: [], v: [] }, mdp: { t: [], v: [] } };
      let sp = m.sp - ri(1400, 2600), tv = m.tv - ri(8, 26) * 1e6;
      stamps.forEach(t => {
        sp += ri(0, 90); tv += Math.round((rnd() - 0.44) * 2.4e6);
        s.sp.t.push(t); s.sp.v.push(sp);
        s.tv.t.push(t); s.tv.v.push(tv);
        s.mdp.t.push(t); s.mdp.v.push(m.mdp);
      });
      A.managers[m.i] = { n: m.n, uim: m.uim, series: s, lp: m.lp };
    });
    // Platzierung aus den Punktereihen ableiten (so macht es der Roboter auch)
    stamps.forEach((t, k) => {
      const order = managers.slice().sort((a, b) => A.managers[b.i].series.sp.v[k] - A.managers[a.i].series.sp.v[k]);
      order.forEach((m, idx) => { A.managers[m.i].series.pl.t.push(t); A.managers[m.i].series.pl.v.push(idx + 1); });
    });

    players.forEach(p => {
      const hist = p._mvh.it.slice(-RUNS);
      A.players[p.i] = { n: p.ln, tid: p.tid, pos: p.pos,
        series: { mv: { t: stamps.slice(0, hist.length), v: hist.map(x => x.mv) } } };
    });

    // Markt-Momentaufnahmen: wechselnde Spieler, mal mit Auf-, mal mit Abschlag
    const marketPool = players.filter(p => !owned[p.i]).concat(players.slice(0, 30));
    stamps.forEach(t => {
      const n = ri(6, 11), it = [];
      for (let k = 0; k < n; k++) {
        const p = pick(marketPool);
        if (it.some(x => x.pi === p.i)) continue;
        it.push({ pi: p.i, n: p.ln, tid: p.tid, pos: p.pos,
          prc: Math.round(p.mv * (0.92 + rnd() * 0.3)), mv: p.mv,
          ofc: ri(0, 4), exs: ri(1800, 84000),
          u: rnd() < 0.4 ? { i: pick(managers).i, n: pick(managers).n } : null });
      }
      A.market.push({ ts: t, it });
    });

    const owners = {};
    Object.keys(owned).forEach(pid => { owners[pid] = owned[pid]; });
    A.daily[new Date().toISOString().slice(0, 10)] = { owners, ts: now };

    A.meta = {
      leagueId: 'demo1', leagueName: 'Demo-Liga 25/26', competitionId: '1',
      firstRun: new Date(stamps[0] * 1000).toISOString(),
      lastRun: new Date(now * 1000).toISOString(),
      runs: RUNS, managerCount: managers.length, playerCount: players.length
    };
    window.KB_DEMO.archive = A;
  })();
})();
