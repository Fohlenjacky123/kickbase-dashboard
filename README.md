# Kickbase Dashboard

Ein Auswertungs-Dashboard für [Kickbase](https://kickbase.com) – als reine
Browser-Seite ohne eigenen Server, dazu ein optionaler Sammel-Roboter, der über
die Zeit ein eigenes Datenarchiv aufbaut.

**→ Einrichtung Schritt für Schritt: [ANLEITUNG.md](ANLEITUNG.md)**

## Zwei Schichten

**Live** – Der Browser spricht direkt mit `api.kickbase.com`. Anmeldung geschieht
im Browser, der Token bleibt im `localStorage`. Es gibt keinen Zwischenserver,
der Zugangsdaten sehen könnte.

**Archiv** – Eine GitHub Action ruft alle sechs Stunden `collector/collect.mjs`
auf und schreibt nach `data/archive-<ligaId>.json`. Damit werden die Daten
festgehalten, die die API nur als Momentaufnahme liefert: Transfermarkt-Angebote,
Teamwert- und Platzierungsverläufe, Besitzverhältnisse je Tag.

## Ansichten

| Reiter | Inhalt |
|---|---|
| Überblick | Platz, Punkte, Teamwert, Budget · eigene Punkte gegen Ligadurchschnitt und Spieltagsbesten · Abstand zur Spitze · Tagesgewinner und -verlierer |
| Liga-Tabelle | Vollständige Tabelle, Platzierungsverlauf, Punkte je Spieltag |
| Mein Kader | Alle Spieler mit Marktwert, Kaufpreis, Gewinn, Punkte je Million, Kaderwert nach Position |
| Transfermarkt | Aktuelle Angebote, Aufschlag gegenüber Marktwert, Restlaufzeit |
| Mitspieler | Alle Manager im Vergleich, Transfergewinn, Effizienz |
| Spieler-Analyse | Alle Spieler des Wettbewerbs mit Filter und Suche, inkl. Besitzer |
| Bundesliga | Tabelle und Spielplan |
| Aktivitäten | Feed der Liga |
| Archiv | Alles, was der Sammel-Roboter über die Zeit zusammengetragen hat |

Ein Klick auf jede Zeile öffnet Details – bei Spielern den Marktwertverlauf über
bis zu 365 Tage, die Punkte je Spieltag und die Transferhistorie.

## Dateien

```
index.html              Struktur und Gestaltung
app.js                  Anwendungslogik, API-Zugriff, Diagramme
demo.js                 Erfundene Beispieldaten für den Demo-Modus
collector/collect.mjs   Sammel-Roboter (Node 20, läuft bei GitHub Actions)
.github/workflows/      Zeitplan des Roboters
data/                   Vom Roboter erzeugtes Archiv
```

Keine Abhängigkeiten, kein Build-Schritt. Die Diagramme sind selbst gezeichnetes SVG.

## Lokal ausprobieren

`index.html` doppelklicken genügt für den Demo-Modus. Für den echten Betrieb
sollte die Seite über HTTP ausgeliefert werden (GitHub Pages erledigt das).

## Hinweis

Inoffiziell, nicht von Kickbase unterstützt. Das Dashboard liest ausschließlich
und verändert nichts in deiner Liga. API-Dokumentation der Community:
[kevinskyba.github.io/kickbase-api-doc](https://kevinskyba.github.io/kickbase-api-doc/)
