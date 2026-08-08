# Keel

Ein privates Haushaltsbuch als Progressive Web App. Gebaut für das iPhone,
gedacht für den Home-Bildschirm.

## Grundsätze

- **Keine Konten, keine Cloud, kein Server.** Alle Daten liegen im
  `localStorage` des Geräts und verlassen es nie.
- **Kein Tracking, keine Analyse, keine Werbung.**
- **Keine Abhängigkeiten.** Reines HTML, CSS und JavaScript. Kein Framework,
  keine Bibliothek, kein CDN, kein Build-Schritt.
- **Offline.** Nach dem ersten Aufruf läuft alles ohne Internet.

## Funktionen

- Monatsübersicht: Saldo, Einnahmen, Ausgaben, Vergleich zum Vormonat,
  Auswertung pro Kategorie
- Ausgaben und Einnahmen erfassen, bearbeiten, löschen, filtern, durchsuchen
- Schnellerfassung über einen eigenen Ziffernblock — sechs Taps pro Buchung
- Frei anlegbare Kategorien
- CSV-Import für Trade-Republic-Kontoauszüge mit
  - Duplikat-Erkennung über die Transaktionskennung
  - Kategorie-Vorschlägen aus Branchenschlüssel (MCC) und einem
    Verzeichnis gängiger deutscher Anbieter
  - Lernlogik: einmal zugeordnet, danach automatisch
- Fixkosten mit Rhythmus von monatlich bis jährlich, Monatssumme und
  Abgleich gegen die tatsächlich gebuchten Abbuchungen
- Monatsbudget pro Kategorie mit dreistufiger Warnung
- Vermögensübersicht mit selbst gepflegten Ständen und Verlauf
- Kredit mit Restlaufzeit, Zinslast und vollständigem Tilgungsplan
- Backup als JSON-Datei, Wiederherstellung ebenso

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Grundgerüst, Meta-Angaben für iOS, untere Navigation |
| `styles.css` | Gestaltung, Dark Mode fest eingestellt |
| `app.js` | Datenhaltung, Oberfläche, Erfassung, Import, Backup |
| `csv.js` | CSV-Leser, Trade-Republic-Übersetzung, MCC- und Anbieter-Verzeichnis |
| `phase2.js` | Fixkosten, Budgets, Vermögen, Kredit, SVG-Verlaufsdiagramme |
| `start.js` | Startseite, Reiter „Ein & Aus", Sparen, Einstellungen |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.json` | App-Beschreibung für den Home-Bildschirm |
| `icons/` | App-Symbole |

`phase2.js` ist optional: Fehlt die Datei, läuft die App ohne den
Planen-Bereich weiter, statt abzustürzen.

## Diagramme und Farben

Die Verlaufsdiagramme sind handgeschriebenes Inline-SVG — 2px-Linien,
Flächenfüllung bei 10 % Deckkraft, durchgezogene Haarlinien als Gitter,
nur der Endwert direkt beschriftet. Jeder Wert ist zusätzlich als Liste
oder Tabelle lesbar; das Diagramm ist nie der einzige Zugang zu einer Zahl.

Die Diagrammfarben (`#00A997`, `#3292FF`) liegen bewusst im für den
Dunkelmodus vorgesehenen Helligkeitsband (OKLCH L 0,48–0,67) und damit
unterhalb der helleren UI-Akzentfarbe. Statusfarben tragen immer
zusätzlich Symbol und Wort — Rot und Gelb sind bei Rot-Grün-Sehschwäche
nicht zuverlässig zu unterscheiden.

## Betrieb

Statisches Hosting genügt — hier GitHub Pages. Es gibt nichts zu bauen
und nichts zu installieren.

**Bei jeder Änderung am Code muss `CACHE_VERSION` in `sw.js` hochgezählt
werden**, sonst liefern bereits installierte Geräte weiter die alte Fassung
aus dem Cache aus.

## Datensicherung

Die Daten liegen ausschließlich auf dem Gerät. Ein regelmäßiger Export über
**Mehr → Daten sichern** ist die einzige Absicherung gegen Geräteverlust
oder gelöschte Website-Daten.
