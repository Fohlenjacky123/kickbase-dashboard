# Kickbase Dashboard – Einrichtung

Diese Anleitung führt dich in vier Schritten von „nichts" zu einer Webseite,
die du und deine Ligakollegen von überall aufrufen können. Kosten: 0 €.

Du brauchst kein Vorwissen. Wo etwas erklärungsbedürftig ist, steht daneben, *warum*.

---

## Was da eigentlich passiert

Zwei Dinge liegen bei GitHub:

1. **Die Webseite selbst** (`index.html`, `app.js`, `demo.js`)
   Sie enthält **keine** Daten. Wer sie aufruft, sieht erst mal nur eine Anmeldemaske.
   Erst wenn sich jemand mit *seinem* Kickbase-Konto anmeldet, holt sein Browser
   *seine* Daten direkt bei Kickbase. Dein Passwort läuft nie über GitHub.

2. **Der Sammel-Roboter** (`collector/`, `.github/workflows/`)
   Ein kleines Programm, das GitHub alle 6 Stunden für dich startet – auch wenn
   dein PC aus ist. Es speichert die Dinge, die Kickbase täglich vergisst
   (Transfermarkt, Teamwert-Verläufe) in den Ordner `data/`.

---

## Schritt 1 – GitHub-Konto anlegen (2 Minuten)

1. Gehe auf **https://github.com/signup**
2. E-Mail, Passwort, Benutzername eingeben. Der Benutzername taucht später in
   deiner Webadresse auf – wähle also etwas, das du magst (z. B. `jan-schluetter`).
3. E-Mail bestätigen.

> Merke dir den Benutzernamen. Er heißt ab hier **DEINNAME**.

---

## Schritt 2 – Repository anlegen und Dateien hochladen (5 Minuten)

Ein „Repository" ist einfach ein Ordner bei GitHub.

1. Gehe auf **https://github.com/new**
2. **Repository name:** `kickbase-dashboard`
3. Wähle **Public**
   *(Warum public? Nur damit ist die kostenlose Webseiten-Funktion nutzbar.
   Lies vorher den Abschnitt „Was ist dann öffentlich sichtbar?" ganz unten.)*
4. Klick **Create repository**
5. Auf der nächsten Seite: **uploading an existing file** anklicken
6. Öffne den Ordner `Kickbase-Dashboard` auf deinem Desktop, markiere **alles**
   mit `Strg+A` und ziehe es in das Browserfenster.
   **Wichtig:** Der Ordner `.github` muss mit dabei sein – darin steckt der Roboter.
7. Unten auf **Commit changes** klicken.

---

## Schritt 3 – Webseite einschalten (1 Minute)

1. In deinem Repository oben auf **Settings**
2. Links in der Leiste auf **Pages**
3. Bei *Branch* **main** auswählen, Ordner `/ (root)` lassen, **Save**
4. Ein bis zwei Minuten warten, Seite neu laden.

Deine Adresse lautet dann:

```
https://DEINNAME.github.io/kickbase-dashboard/
```

Die kannst du auf dem Handy im Browser öffnen und über „Zum Home-Bildschirm
hinzufügen" wie eine App ablegen.

---

## Schritt 4 – Sammel-Roboter scharfschalten (3 Minuten)

Damit der Roboter ohne dich Daten holen kann, braucht er deine Kickbase-Zugangsdaten.
GitHub bewahrt sie verschlüsselt auf („Secrets"); sie sind danach für niemanden
mehr lesbar – auch nicht für dich, nur überschreibbar.

1. Im Repository auf **Settings**
2. Links **Secrets and variables** → **Actions**
3. Knopf **New repository secret**
   * Name: `KICKBASE_EMAIL` → Wert: deine Kickbase-E-Mail → **Add secret**
4. Nochmal **New repository secret**
   * Name: `KICKBASE_PASSWORD` → Wert: dein Kickbase-Passwort → **Add secret**

Jetzt einmal von Hand starten, damit du siehst, dass es klappt:

5. Oben auf den Reiter **Actions**
6. Falls gefragt: **I understand my workflows, go ahead and enable them**
7. Links **Kickbase-Daten sammeln** anklicken
8. Rechts **Run workflow** → **Run workflow**
9. Nach ca. 1 Minute erscheint ein grüner Haken. Klick den Lauf an, um zu sehen,
   was geholt wurde.

Ab jetzt läuft er alle 6 Stunden von allein. Im Reiter **Archiv** deines
Dashboards füllen sich die Kurven mit jedem Lauf weiter.

---

## Was ist dann öffentlich sichtbar?

Ehrlich und vollständig:

| Sichtbar für jeden | Nicht sichtbar |
|---|---|
| Der Programmcode (unproblematisch) | Dein Kickbase-Passwort |
| Die gesammelten **Ligadaten** im Ordner `data/`: Manager-Anzeigenamen, Teamwerte, Punkte, Marktgeschehen | Deine E-Mail-Adresse |
| | Die Daten anderer Ligen, in denen du nicht bist |

Das sind Spitznamen und Spielzahlen – keine Adressen, keine Kontodaten. Für die
meisten ist das unkritisch. Es findet aber praktisch nur, wer die Adresse kennt.

**Wenn dir das zu offen ist:** Dann bleibt das Repository `Private` und wir
veröffentlichen die Seite über **Cloudflare Pages** statt GitHub Pages – ebenfalls
kostenlos, aber ein zweites Konto und ein paar Klicks mehr. Sag Bescheid, dann
richten wir das so ein.

---

## Wenn etwas nicht klappt

**Die Seite zeigt nur eine leere Fläche**
Ein bis zwei Minuten warten – GitHub braucht nach dem Hochladen kurz. Danach
Seite mit `Strg+F5` neu laden.

**„Anmeldung fehlgeschlagen"**
E-Mail und Passwort sind dieselben wie in der Kickbase-App. Bei aktivierter
Zwei-Faktor-Anmeldung funktioniert der direkte Login nicht.

**Der Roboter zeigt ein rotes X im Reiter „Actions"**
Klick den Lauf an – die Fehlermeldung steht im Klartext da. Meist ein Tippfehler
im Secret-Namen: es muss exakt `KICKBASE_EMAIL` und `KICKBASE_PASSWORD` heißen.

**Der Reiter „Archiv" sagt „noch nicht eingerichtet"**
Der Roboter ist noch nicht gelaufen (Schritt 4) oder er hat eine andere Liga
gesammelt. Nach dem ersten erfolgreichen Lauf verschwindet der Hinweis.

**Nur bestimmte Ligen sammeln**
Settings → Secrets and variables → Actions → Reiter **Variables** →
`KICKBASE_LEAGUES` anlegen, Wert = Liga-IDs mit Komma getrennt.

---

## Rechtliches in zwei Sätzen

Das Dashboard nutzt die inoffizielle Kickbase-API, die die App selbst verwendet.
Für private Auswertungen ist das gängige Praxis; automatisiertes Handeln (Kaufen
und Verkaufen per Programm) solltest du unterlassen – es könnte gegen die
Nutzungsbedingungen von Kickbase verstoßen. Dieses Dashboard liest ausschließlich,
es verändert nichts in deiner Liga.
