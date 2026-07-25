/* ============================================================
   xGuys1Cup - Ligaspezifisches Regelwerk als Code
   Quelle: https://xguys1cup.de/regelwerk-meisterschaft.php
           https://xguys1cup.de/regelwerk-coppa.php
   Saison 2026/27

   Alles, was hier steht, ist bewusst an einer Stelle gebündelt:
   Ändern sich Ligaregeln, muss nur diese Datei angefasst werden.
   ============================================================ */
window.LIGA = {
  name: 'xGuys1Cup',
  saison: '2026/27',
  einsatz: 20,
  maxManager: 12,

  /* --- Kaderregeln (Regel V) --- */
  maxKader: 16,
  maxFeldspieler: 14,
  maxTorhueter: 2,
  maxProVerein: 2,
  aufstellung: 11,

  /* --- Transfers (Regel X, XI) --- */
  richtpreisSchritt: 100000,   // interner Transfer: auf 100.000er aufrunden
  gebotSchritt: 100000,        // Mindesterhöhung je Gebot
  marktwertUpdate: '22:04',    // tägliche Marktwertänderung
  nachtruhe: [22, 8],          // Auktionsdauer ruht 22:00-08:00
  auktionMinStd: 4,
  auktionMaxStd: 24,
  letzterAuktionsSpieltag: 28, // ab dem 29. Spieltag keine Auktionen mehr

  /* --- Termine (Regel IX, XVIII) --- */
  termine: [
    { d: '2026-07-28T19:04', t: 'Ligastart & Reset',    i: 'Liga wird zurückgesetzt, danach Transfers frei' },
    { d: '2026-08-28T00:00', t: '1. Bundesligaspieltag', i: 'Saisonbeginn' },
    { d: '2026-12-21T00:00', t: 'Soft-Reset',            i: 'Kader geleert, Kontostand zurück auf 200 Mio' },
    { d: '2027-01-09T00:00', t: 'Rückrundenstart',       i: '' }
  ],
  softResetSpieltag: 14,

  /* --- Battles (Regel III): 5 € je Kategorie --- */
  battlePreis: 5,
  battleNamen: {           // Kickbase-Typ -> Ligabezeichnung
    1: 'Spieltagssieger', 2: 'Transferkönig', 4: 'Saubermann',
    5: 'Abwehrbollwerk',  6: 'Fädenzieher',   7: 'Angriffslustig',
    8: 'Punktejäger'
  },

  /* --- Gewinnverteilung (Regel III) --- */
  gewinne: [
    ['Gesamttabelle 1. Platz', '50 % des Pots'],
    ['Gesamttabelle 2. Platz', '30 % des Pots'],
    ['Gesamttabelle 3. Platz', '20 % des Pots'],
    ['Spieltagssieg',          '2 € je Spieltag (68 € gesamt)'],
    ['Coppa Corona',           '20 € für den Sieger'],
    ['Battlesieg',             '5 € je Kategorie']
  ],

  /* --- Coppa Corona --- */
  coppa: {
    gruppenSpieltage: [6, 9, 12, 15, 18, 21],   // an diese BL-Spieltage gekoppelt
    luckyLoosers: [23, 24, 25],
    viertelfinale: [27, 28],
    halbfinale: [30, 31],
    finale: [33],
    siegPunkte: 3, remisPunkte: 1,
    // Paarungen je Gruppenspieltag: Index 0-3 = Gruppenplatz bei der Auslosung
    paarungen: [
      [[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]],
      [[1, 0], [3, 2]], [[2, 0], [3, 1]], [[3, 0], [2, 1]]
    ],
    // Gruppen werden nach der Auslosung eingetragen: { A: [managerId, ...], B: [...], C: [...] }
    gruppen: null,
    historie: [['2025/26','Jonas'],['2024/25','Just'],['2023/24','Heimspiel'],
               ['2022/23','Fabian Drews'],['2021/22','Jack'],['2020/21','Max'],['2019/20','Heimspiel']]
  }
};

/* ============================================================
   Regelprüfung des eigenen Kaders
   Liefert eine Liste von Befunden mit Schweregrad.
   ============================================================ */
window.ligaCheck = function (squad, teamNames, buliTeamIds) {
  const L = window.LIGA, out = [];
  const sq = squad || [];
  if (!sq.length) return out;

  // Regel V - Kadergröße
  const tw = sq.filter(p => p.pos === 1).length;
  const feld = sq.length - tw;
  if (sq.length > L.maxKader) {
    out.push({ art: 'kritisch', regel: 'V',
      titel: 'Kader zu groß: ' + sq.length + ' Spieler',
      text: 'Erlaubt sind ' + L.maxKader + '. Der zuletzt gekaufte Spieler muss als Nächstes verkauft werden (Regel VIII), sonst folgt je Transfer eine weitere Sanktion.' });
  }
  if (feld > L.maxFeldspieler) {
    out.push({ art: 'kritisch', regel: 'V',
      titel: feld + ' Feldspieler', text: 'Erlaubt sind ' + L.maxFeldspieler + '.' });
  }
  if (tw > L.maxTorhueter) {
    out.push({ art: 'kritisch', regel: 'V',
      titel: tw + ' Torhüter', text: 'Erlaubt sind ' + L.maxTorhueter + '.' });
  }

  // Regel V - höchstens zwei Spieler je Verein
  const proVerein = {};
  sq.forEach(p => {
    const t = String(p.tid || '?');
    (proVerein[t] = proVerein[t] || []).push(p.n || p.pn || '?');
  });
  Object.keys(proVerein).forEach(tid => {
    const namen = proVerein[tid];
    if (namen.length > L.maxProVerein) {
      const verein = (teamNames && teamNames[tid]) || ('Verein ' + tid);
      out.push({ art: 'kritisch', regel: 'V',
        titel: namen.length + ' Spieler von ' + verein,
        text: 'Erlaubt sind ' + L.maxProVerein + '. Betroffen: ' + namen.join(', ') + '.' });
    } else if (namen.length === L.maxProVerein) {
      const verein = (teamNames && teamNames[tid]) || ('Verein ' + tid);
      out.push({ art: 'hinweis', regel: 'V',
        titel: verein + ': Grenze erreicht',
        text: namen.join(' und ') + ' - ein dritter Spieler dieses Vereins löst eine Sanktion aus.' });
    }
  });

  // Regel XVI - neutrale Spieler (Verein nicht mehr in der Bundesliga)
  if (buliTeamIds && buliTeamIds.length) {
    sq.forEach(p => {
      if (p.tid && buliTeamIds.indexOf(String(p.tid)) === -1) {
        out.push({ art: 'kritisch', regel: 'XVI',
          titel: (p.n || p.pn) + ' spielt nicht in der Bundesliga',
          text: 'Neutrale Spieler müssen binnen 24 Stunden verkauft werden, sonst folgt je 24 Stunden eine Sanktion.' });
      }
    });
  }

  // Aufstellbarkeit - genug einsatzbereite Spieler?
  const fit = sq.filter(p => !p.st || p.st === 0).length;
  if (fit < L.aufstellung) {
    out.push({ art: 'warnung', regel: '',
      titel: 'Nur ' + fit + ' einsatzbereite Spieler',
      text: 'Für eine vollständige Aufstellung werden ' + L.aufstellung + ' benötigt.' });
  }

  return out;
};

/* --- Auktionshilfen (Regel X, XI) --- */
window.richtpreis = function (mv) {
  const s = window.LIGA.richtpreisSchritt;
  return Math.ceil((mv || 0) / s) * s;
};
window.gebotsstufen = function (start, anzahl) {
  const s = window.LIGA.gebotSchritt, out = [];
  for (let i = 0; i < (anzahl || 6); i++) out.push(start + i * s);
  return out;
};

/* --- Coppa-Tabellen aus Kickbase-Spieltagspunkten errechnen --- */
window.coppaTabellen = function (users) {
  const C = window.LIGA.coppa;
  if (!C.gruppen) return null;
  const punkteAn = (u, blTag) => {
    const lp = (u && u.lp) || [];
    return lp[blTag - 1] == null ? null : lp[blTag - 1];
  };
  const res = {};
  Object.keys(C.gruppen).forEach(g => {
    const ids = C.gruppen[g];
    const tab = ids.map(id => {
      const u = users.find(x => String(x.i) === String(id));
      return { id, n: (u && u.n) || ('Manager ' + id), u, s: 0, u_: 0, n_: 0, p: 0, pf: 0, pa: 0, sp: 0 };
    });
    C.gruppenSpieltage.forEach((blTag, i) => {
      (C.paarungen[i] || []).forEach(([a, b]) => {
        const A = tab[a], B = tab[b];
        if (!A || !B) return;
        const pa = punkteAn(A.u, blTag), pb = punkteAn(B.u, blTag);
        if (pa == null || pb == null) return;
        A.sp++; B.sp++; A.pf += pa; A.pa += pb; B.pf += pb; B.pa += pa;
        if (pa > pb)      { A.s++; B.n_++; A.p += C.siegPunkte; }
        else if (pb > pa) { B.s++; A.n_++; B.p += C.siegPunkte; }
        else              { A.u_++; B.u_++; A.p += C.remisPunkte; B.p += C.remisPunkte; }
      });
    });
    tab.sort((x, y) => y.p - x.p || (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf);
    res[g] = tab;
  });
  return res;
};
