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
- Backup als JSON-Datei, Wiederherstellung ebenso

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Grundgerüst, Meta-Angaben für iOS, untere Navigation |
| `styles.css` | Gestaltung, Dark Mode fest eingestellt |
| `app.js` | Datenhaltung, Oberfläche, Erfassung, Import, Backup |
| `csv.js` | CSV-Leser, Trade-Republic-Übersetzung, MCC- und Anbieter-Verzeichnis |
| `sw.js` | Service Worker für den Offline-Betrieb |
| `manifest.json` | App-Beschreibung für den Home-Bildschirm |
| `icons/` | App-Symbole |

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
