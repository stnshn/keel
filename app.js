/* ============================================================
   Keel - Hauptanwendung
   Reines JavaScript, keine Bibliotheken.
   Alle Daten liegen ausschliesslich im localStorage
   dieses Geraets. Nichts wird irgendwohin gesendet.
   ============================================================ */

'use strict';

const SPEICHER_SCHLUESSEL = 'keel.daten.v1';
const APP_VERSION = '1.0';

/* ============================================================
   1. Standard-Kategorien
   ============================================================ */

const STANDARD_KATEGORIEN = [
  // Ausgaben
  { id: 'lebensmittel',  name: 'Lebensmittel',        emoji: '🛒', typ: 'ausgabe' },
  { id: 'restaurant',    name: 'Restaurant & Café',   emoji: '🍽️', typ: 'ausgabe' },
  { id: 'verkehr',       name: 'Auto & Verkehr',      emoji: '⛽', typ: 'ausgabe' },
  { id: 'wohnen',        name: 'Wohnen & Miete',      emoji: '🏠', typ: 'ausgabe' },
  { id: 'nebenkosten',   name: 'Strom & Nebenkosten', emoji: '💡', typ: 'ausgabe' },
  { id: 'telekom',       name: 'Handy & Internet',    emoji: '📶', typ: 'ausgabe' },
  { id: 'abos',          name: 'Abos & Digitales',    emoji: '📺', typ: 'ausgabe' },
  { id: 'versicherung',  name: 'Versicherungen',      emoji: '🛡️', typ: 'ausgabe' },
  { id: 'gesundheit',    name: 'Gesundheit & Drogerie', emoji: '💊', typ: 'ausgabe' },
  { id: 'sport',         name: 'Sport & Fitness',     emoji: '🏋️', typ: 'ausgabe' },
  { id: 'shopping',      name: 'Shopping',            emoji: '🛍️', typ: 'ausgabe' },
  { id: 'freizeit',      name: 'Freizeit & Reisen',   emoji: '✈️', typ: 'ausgabe' },
  { id: 'bargeld',       name: 'Bargeld',             emoji: '💶', typ: 'ausgabe' },
  { id: 'gebuehren',     name: 'Gebühren',            emoji: '🏦', typ: 'ausgabe' },
  { id: 'sonstiges',     name: 'Sonstiges',           emoji: '❓', typ: 'ausgabe' },

  // Einnahmen
  { id: 'gehalt',            name: 'Gehalt',            emoji: '💼', typ: 'einnahme' },
  { id: 'nebenverdienst',    name: 'Nebenverdienst',    emoji: '💻', typ: 'einnahme' },
  { id: 'erstattung',        name: 'Erstattung',        emoji: '↩️', typ: 'einnahme' },
  { id: 'zinsen',            name: 'Zinsen',            emoji: '📈', typ: 'einnahme' },
  { id: 'cashback',          name: 'Cashback & Bonus',  emoji: '🎁', typ: 'einnahme' },
  { id: 'geschenk',          name: 'Geschenk',          emoji: '💝', typ: 'einnahme' },
  { id: 'sonstigeeinnahme',  name: 'Sonstige Einnahme', emoji: '❔', typ: 'einnahme' },

  // Neutral - zaehlt bewusst NICHT in die Monatsrechnung.
  // Dafuer, wenn Geld nur verschoben wird (eigenes Konto, Depot, PayPal-Aufladung).
  { id: 'umbuchung', name: 'Umbuchung', emoji: '🔄', typ: 'neutral', ausBilanz: true, system: true }
];

/* Harte Obergrenze fuer aktive Ausgabe-Kategorien.
   Einnahme-Kategorien und die System-Kategorie "Umbuchung" zaehlen bewusst
   nicht mit: Einnahmen kosten bei der Erfassung keine Entscheidung, und die
   Umbuchung ist keine Wahl, sondern ein Sonderfall. */
const KAT_GRENZE = 12;

const EMOJI_AUSWAHL = [
  '🛒','🍽️','☕','⛽','🚗','🚌','🏠','💡','💧','📶','📱','💻','📺','🎮',
  '🛡️','💊','🏥','🏋️','⚽','🛍️','👕','👟','✈️','🏖️','🎬','🎵','📚','🎓',
  '💶','🏦','🎁','💝','💼','📈','↩️','🔄','🐶','🍼','🔧','🎨','❓','❔'
];

/* ============================================================
   2. Datenspeicher
   ============================================================ */

const Speicher = {

  leer: function () {
    return {
      version: 5,
      erstellt: new Date().toISOString(),
      buchungen: [],
      // Tage, an denen bewusst nichts ausgegeben wurde (ISO-Datum, z. B.
      // "2026-08-14"). Nur dafuer da, den Erfassungs-Zaehler zu fuettern.
      nullTage: [],
      kategorien: STANDARD_KATEGORIEN.map((k) => Object.assign({ archiviert: false }, k)),
      regeln: { exakt: {}, stamm: {} },
      fixkosten: [],
      budgets: {},
      vermoegen: [],
      kredite: [],
      notgroschen: { standCent: 0, zielCent: 0 },
      sparziele: [],
      einstellungen: {
        name: '',
        mindestnettoCent: 0,
        sparrateCent: 0,
        gehaltVerschieben: true,
        hinweisTag: '',
        // Zeitpunkt des letzten erfolgreichen Sicherns (ISO). Leer heisst:
        // es gab noch keines.
        letztesBackup: '',
        // Tag, an dem das Erinnerungsband weggetippt wurde.
        backupBandTag: '',
        // Der einmalige Hinweis, wenn mehr als KAT_GRENZE Kategorien aktiv sind.
        katHinweisGezeigt: false
      }
    };
  },

  laden: function () {
    let roh = null;
    try { roh = localStorage.getItem(SPEICHER_SCHLUESSEL); }
    catch (e) { console.warn('localStorage nicht verfügbar', e); }

    if (!roh) return this.leer();

    try {
      const d = JSON.parse(roh);
      return this.reparieren(d);
    } catch (e) {
      console.error('Daten unlesbar', e);
      return this.leer();
    }
  },

  // Faengt fehlende Felder ab, egal ob aus altem Stand oder aus einem Backup.
  reparieren: function (d) {
    const frisch = this.leer();
    if (!d || typeof d !== 'object') return frisch;

    d.version      = d.version || 1;
    d.buchungen    = Array.isArray(d.buchungen) ? d.buchungen : [];
    d.kategorien   = Array.isArray(d.kategorien) && d.kategorien.length ? d.kategorien : frisch.kategorien;
    d.regeln       = d.regeln && typeof d.regeln === 'object' ? d.regeln : { exakt: {}, stamm: {} };
    d.regeln.exakt = d.regeln.exakt && typeof d.regeln.exakt === 'object' ? d.regeln.exakt : {};
    d.regeln.stamm = d.regeln.stamm && typeof d.regeln.stamm === 'object' ? d.regeln.stamm : {};
    d.einstellungen = d.einstellungen || {};

    // --- Erweiterung auf Version 2 (Phase 2) ---
    // Alte Sicherungen aus Phase 1 kennen diese Felder nicht. Sie werden
    // ergaenzt, ohne dass Buchungen oder gelernte Regeln verloren gehen.
    d.fixkosten = Array.isArray(d.fixkosten) ? d.fixkosten : [];
    d.budgets   = d.budgets && typeof d.budgets === 'object' && !Array.isArray(d.budgets) ? d.budgets : {};
    d.vermoegen = Array.isArray(d.vermoegen) ? d.vermoegen : [];
    d.kredite   = Array.isArray(d.kredite) ? d.kredite : [];

    d.fixkosten.forEach((f) => { if (!Array.isArray(f.staende)) f.staende = f.staende || []; });
    d.vermoegen.forEach((p) => { if (!Array.isArray(p.staende)) p.staende = []; });
    d.kredite.forEach((k)   => { if (!Array.isArray(k.staende)) k.staende = []; });

    // --- Erweiterung auf Version 3 (neue Startseite) ---
    d.notgroschen = d.notgroschen && typeof d.notgroschen === 'object'
      ? d.notgroschen : { standCent: 0, zielCent: 0 };
    d.notgroschen.standCent = Number(d.notgroschen.standCent) || 0;
    d.notgroschen.zielCent  = Number(d.notgroschen.zielCent) || 0;

    d.sparziele = Array.isArray(d.sparziele) ? d.sparziele : [];
    d.sparziele.forEach((z) => {
      z.standCent = Number(z.standCent) || 0;
      z.zielCent  = Number(z.zielCent) || 0;
    });
    // Genau ein Ziel gehört auf die Startseite.
    if (d.sparziele.length && !d.sparziele.some((z) => z.aufStartseite)) {
      d.sparziele[0].aufStartseite = true;
    }

    const e = d.einstellungen;
    if (typeof e.name !== 'string') e.name = '';
    e.mindestnettoCent = Number(e.mindestnettoCent) || 0;
    e.sparrateCent     = Number(e.sparrateCent) || 0;
    if (typeof e.gehaltVerschieben !== 'boolean') e.gehaltVerschieben = true;

    // --- Erweiterung auf Version 4 (Erfassungs-Zaehler) ---
    // Aeltere Staende kennen die Nulltage nicht. Der Zaehler selbst wird
    // nirgends gespeichert, er ergibt sich jedes Mal neu aus Buchungen und
    // dieser Liste - deshalb bleibt er auch in einem Backup nachvollziehbar.
    d.nullTage = Array.isArray(d.nullTage) ? d.nullTage : [];
    d.nullTage = d.nullTage
      .filter((t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t))
      .filter((t, i, a) => a.indexOf(t) === i)
      .sort();

    // Merkt sich, an welchem Tag der leise Hinweis zuletzt gezeigt wurde,
    // damit er hoechstens einmal taeglich erscheint.
    if (typeof e.hinweisTag !== 'string') e.hinweisTag = '';

    // --- Erweiterung auf Version 5 (Kategorie-Obergrenze, Backup-Absicherung) ---
    // Kategorien werden ab hier archiviert statt geloescht. Aeltere Staende
    // und Backups kennen das Feld nicht - dort gilt alles als aktiv.
    if (typeof e.letztesBackup    !== 'string')  e.letztesBackup = '';
    if (typeof e.backupBandTag    !== 'string')  e.backupBandTag = '';
    if (typeof e.katHinweisGezeigt !== 'boolean') e.katHinweisGezeigt = false;

    d.version = 5;

    // Die System-Kategorie "Umbuchung" muss immer existieren.
    if (!d.kategorien.some((k) => k.id === 'umbuchung')) {
      d.kategorien.push(Object.assign({}, STANDARD_KATEGORIEN[STANDARD_KATEGORIEN.length - 1]));
    }

    // Nach dem Nachziehen der System-Kategorie, damit auch sie das Feld hat.
    // System-Kategorien lassen sich grundsaetzlich nicht archivieren.
    d.kategorien.forEach((k) => { k.archiviert = k.system ? false : k.archiviert === true; });

    d.buchungen = d.buchungen.filter((b) => b && b.id && b.datum && typeof b.betragCent === 'number');
    return d;
  },

  sichern: function (d) {
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(d));
      return true;
    } catch (e) {
      console.error('Speichern fehlgeschlagen', e);
      UI.melde('Speichern fehlgeschlagen. Ist der Speicher voll?', 'fehler');
      return false;
    }
  }
};

let Daten = Speicher.laden();
function sichern() { Speicher.sichern(Daten); }

/* ============================================================
   3. Hilfsfunktionen
   ============================================================ */

const MONATSNAMEN = ['Januar','Februar','März','April','Mai','Juni',
                     'Juli','August','September','Oktober','November','Dezember'];
const WOCHENTAGE  = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

function neueId(praefix) {
  return (praefix || 'x') + '_' + Date.now().toString(36) + '_' +
         Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function heuteISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

function monatVon(iso) { return String(iso || '').slice(0, 7); }

function monatVerschieben(monat, schritte) {
  const jahr = parseInt(monat.slice(0, 4), 10);
  const mon  = parseInt(monat.slice(5, 7), 10) - 1 + schritte;
  const d = new Date(jahr, mon, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monatText(monat) {
  const j = parseInt(monat.slice(0, 4), 10);
  const m = parseInt(monat.slice(5, 7), 10) - 1;
  return MONATSNAMEN[m] + ' ' + j;
}

function datumText(iso) {
  if (!iso) return '';
  return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4);
}

function datumLang(iso) {
  const d = new Date(iso + 'T12:00:00');
  const heute = heuteISO();
  const gestern = (function () {
    const g = new Date(); g.setDate(g.getDate() - 1);
    return g.getFullYear() + '-' + String(g.getMonth() + 1).padStart(2, '0') + '-' + String(g.getDate()).padStart(2, '0');
  })();
  if (iso === heute)   return 'Heute';
  if (iso === gestern) return 'Gestern';
  return WOCHENTAGE[d.getDay()] + ', ' + datumText(iso);
}

// Cent -> "1.234,56"
function geld(cent, mitVorzeichen) {
  const negativ = cent < 0;
  const abs = Math.abs(Math.round(cent));
  const euro = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const eurotext = String(euro).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let s = eurotext + ',' + rest;
  if (mitVorzeichen) s = (negativ ? '−' : '+') + ' ' + s;
  else if (negativ) s = '−' + s;
  return s;
}

function geldE(cent, mitVorzeichen) { return geld(cent, mitVorzeichen) + ' €'; }

function kategorie(id) {
  return Daten.kategorien.find((k) => k.id === id) || null;
}

// Nur aktive Kategorien. Archivierte verschwinden aus der Erfassung und aus
// allen Vorschlaegen - bei alten Buchungen bleiben sie als Bezeichnung stehen,
// weil "kategorie(id)" weiterhin jede Kategorie findet.
function kategorienNach(typ) {
  return Daten.kategorien.filter((k) => k.typ === typ && !k.archiviert);
}

// Die Kategorien, die gegen die Obergrenze zaehlen.
function aktiveAusgabeKategorien() {
  return Daten.kategorien.filter((k) => k.typ === 'ausgabe' && !k.archiviert && !k.system);
}

function katGrenzeErreicht() {
  return aktiveAusgabeKategorien().length >= KAT_GRENZE;
}

// Wie oft wurde jede Kategorie bisher benutzt?
function nutzungProKategorie() {
  const n = {};
  Daten.buchungen.forEach((b) => { n[b.kategorieId] = (n[b.kategorieId] || 0) + 1; });
  return n;
}

function buchungenText(n) {
  return n === 1 ? '1 Buchung' : n + ' Buchungen';
}

// Die Kategorie-Balken zeigen EINE Groesse: Ausgaben. Also bekommen sie
// auch eine einzige Farbe. Zehn verschiedene Farbtoene wuerden nur die
// Balkenlaenge ein zweites Mal erzaehlen - jede Zeile ist ohnehin mit
// Symbol, Name, Betrag und Prozentwert beschriftet.
function katFarbe() {
  return typeof DIAGRAMM !== 'undefined' ? DIAGRAMM.serie : '#00A997';
}

// Buchungen, die in Summen mitzaehlen (Umbuchungen fliegen raus).
function zaehltMit(b) {
  const k = kategorie(b.kategorieId);
  return !(k && k.ausBilanz);
}

/* ------------------------------------------------------------
   Gehalt am Monatsende gilt für den Folgemonat
   ------------------------------------------------------------
   Zahlungen in der zweiten Monatshälfte zählen für den nächsten
   Monat. Das trifft den Normalfall (Gehalt am 28.03. gehört zum
   April) und fängt auch verspätete Zahlungen richtig ab: kommt
   das April-Gehalt erst am 02.04., liegt es in der ersten
   Monatshälfte und zählt damit ebenfalls für April.

   Die Regel gilt nur für Buchungen der Kategorie "Gehalt".
   ------------------------------------------------------------ */
function istGehalt(b) {
  return b.typ === 'einnahme' && b.kategorieId === 'gehalt';
}

function wirkMonat(b) {
  const monat = monatVon(b.datum);
  if (!istGehalt(b)) return monat;
  if (Daten.einstellungen.gehaltVerschieben === false) return monat;
  const tag = parseInt(b.datum.slice(8, 10), 10);
  return tag >= 16 ? monatVerschieben(monat, 1) : monat;
}

// Zählt die Buchung in einem anderen Monat, als ihr Datum sagt?
function istVerschoben(b) {
  return wirkMonat(b) !== monatVon(b.datum);
}

function buchungenImMonat(monat, art) {
  return Daten.buchungen.filter((b) =>
    wirkMonat(b) === monat && (!art || b.typ === art)
  );
}

function summe(liste) {
  return liste.reduce((s, b) => s + (zaehltMit(b) ? b.betragCent : 0), 0);
}

/* ============================================================
   4. Lernlogik fuer Haendler-Kategorien
   ============================================================ */

const Regeln = {

  // Was schlaegt Keel fuer diesen Haendler vor?
  // Rueckgabe: { kategorieId, quelle } oder null
  finde: function (normHaendler, stamm) {
    if (normHaendler && Daten.regeln.exakt[normHaendler]) {
      return { kategorieId: Daten.regeln.exakt[normHaendler], quelle: 'gelernt' };
    }
    if (stamm && Daten.regeln.stamm[stamm]) {
      const r = Daten.regeln.stamm[stamm];
      if (r && !r.mehrdeutig && r.kat) return { kategorieId: r.kat, quelle: 'gelernt' };
    }
    return null;
  },

  // Einmal zuordnen - ab dann merkt sich Keel das.
  lerne: function (normHaendler, stamm, kategorieId) {
    if (!normHaendler || !kategorieId) return;

    Daten.regeln.exakt[normHaendler] = kategorieId;

    if (stamm) {
      const vorhanden = Daten.regeln.stamm[stamm];
      if (!vorhanden) {
        Daten.regeln.stamm[stamm] = { kat: kategorieId, mehrdeutig: false };
      } else if (vorhanden.kat !== kategorieId) {
        // Zwei Haendler mit gleichem Anfangswort, aber verschiedenen
        // Kategorien -> Stammregel taugt nicht mehr, nur noch exakte Treffer.
        vorhanden.mehrdeutig = true;
      }
    }
  },

  loesche: function (art, schluessel) {
    if (art === 'exakt') delete Daten.regeln.exakt[schluessel];
    else delete Daten.regeln.stamm[schluessel];
    sichern();
  },

  anzahl: function () {
    return Object.keys(Daten.regeln.exakt).length;
  }
};

// Kategorie-Vorschlag fuer eine importierte Zeile.
function vorschlagKategorie(v) {
  // Auch eine gelernte Zuordnung zaehlt nicht mehr, wenn ihre Kategorie
  // archiviert wurde - sonst kaeme sie durch die Hintertuer zurueck.
  const gelernt = Regeln.finde(v.normHaendler, v.stamm);
  const gelernteKat = gelernt ? kategorie(gelernt.kategorieId) : null;
  if (gelernteKat && !gelernteKat.archiviert) {
    return { kategorieId: gelernt.kategorieId, quelle: 'gelernt' };
  }

  if (v.artText === 'Zinsen')   return { kategorieId: 'zinsen',   quelle: 'fest' };
  if (v.artText === 'Saveback') return { kategorieId: 'cashback', quelle: 'fest' };

  // Nur Kategorien vorschlagen, die zur Buchungsart passen.
  const passt = (id) => {
    const k = kategorie(id);
    return k && !k.archiviert && (k.typ === v.art || k.typ === 'neutral') ? id : null;
  };

  // Bekannter Anbietername schlaegt den Branchenschluessel,
  // weil er die genauere Information ist.
  const ausStichwort = passt(Stichworte.kategorie(v.haendler));
  if (ausStichwort) return { kategorieId: ausStichwort, quelle: 'stichwort' };

  if (v.mcc) {
    const ausMcc = passt(MCC.kategorie(v.mcc));
    if (ausMcc) return { kategorieId: ausMcc, quelle: 'mcc' };
  }

  // Ein positiver Betrag bei einer Kartenzahlung ist so gut wie immer
  // eine Rueckerstattung des Haendlers.
  if (v.art === 'einnahme' && v.artText.indexOf('Kartenzahlung') === 0) {
    return { kategorieId: 'erstattung', quelle: 'fest' };
  }

  const rueckfall = v.art === 'ausgabe' ? 'sonstiges' : 'sonstigeeinnahme';
  const rk = kategorie(rueckfall);
  return {
    kategorieId: rk && !rk.archiviert ? rueckfall : (kategorienNach(v.art)[0] || {}).id,
    quelle: 'rueckfall'
  };
}

/* ============================================================
   5. Blaetter (die von unten hochfahrenden Fenster)
   ============================================================ */

const Blatt = {
  stapel: [],

  oeffnen: function (o) {
    const tiefe = this.stapel.length;
    const hinter = document.createElement('div');
    hinter.className = 'blatt-hinter';
    hinter.style.zIndex = String(50 + tiefe * 2);

    const blatt = document.createElement('div');
    blatt.className = 'blatt';
    blatt.style.zIndex = String(51 + tiefe * 2);

    blatt.innerHTML =
      '<div class="blatt-kopf">' +
        '<button class="links" data-rolle="links">' + esc(o.linksText || 'Abbrechen') + '</button>' +
        '<h2>' + esc(o.titel || '') + '</h2>' +
        '<button class="rechts" data-rolle="rechts"' + (o.rechtsText ? '' : ' style="visibility:hidden"') + '>' +
          esc(o.rechtsText || '') + '</button>' +
      '</div>' +
      '<div class="blatt-koerper"></div>';

    blatt.querySelector('.blatt-koerper').innerHTML = o.koerper || '';

    document.body.appendChild(hinter);
    document.body.appendChild(blatt);

    const eintrag = { hinter: hinter, blatt: blatt, beimSchliessen: o.beimSchliessen };
    this.stapel.push(eintrag);

    const schliessen = () => this.schliessen();
    hinter.addEventListener('click', schliessen);
    blatt.querySelector('[data-rolle="links"]').addEventListener('click', () => {
      if (o.beiLinks) o.beiLinks(); else schliessen();
    });
    const rechtsKnopf = blatt.querySelector('[data-rolle="rechts"]');
    if (o.beiRechts) rechtsKnopf.addEventListener('click', () => o.beiRechts());

    if (o.nachOeffnen) o.nachOeffnen(blatt.querySelector('.blatt-koerper'), blatt);
    return blatt;
  },

  schliessen: function () {
    const e = this.stapel.pop();
    if (!e) return;
    e.hinter.remove();
    e.blatt.remove();
    if (e.beimSchliessen) e.beimSchliessen();
  },

  alleSchliessen: function () {
    while (this.stapel.length) this.schliessen();
  },

  koerper: function () {
    const e = this.stapel[this.stapel.length - 1];
    return e ? e.blatt.querySelector('.blatt-koerper') : null;
  },

  rechtsKnopf: function () {
    const e = this.stapel[this.stapel.length - 1];
    return e ? e.blatt.querySelector('[data-rolle="rechts"]') : null;
  }
};

/* ============================================================
   6. Oberflaeche
   ============================================================ */

const UI = {

  zustand: {
    schirm: 'start',
    monat: monatVon(heuteISO()),
    suche: '',
    listenArt: 'ausgabe'
  },

  melde: function (text, art) {
    const alt = document.querySelector('.toast');
    if (alt) alt.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (art ? ' ' + art : '');
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, 2600);
  },

  /* ---------- Navigation ---------- */

  zeige: function (schirm) {
    this.zustand.schirm = schirm;
    this.zustand.suche = '';
    this.zeichne();
    window.scrollTo(0, 0);
  },

  zeichne: function () {
    const ziel = document.getElementById('schirm');
    const s = this.zustand.schirm;

    if (s === 'start')          ziel.innerHTML = Start.html();
    else if (s === 'einaus')    ziel.innerHTML = EinAus.html();
    else if (s === 'vermoegen') ziel.innerHTML = this.vermoegenSchirm();
    else if (s === 'mehr')      ziel.innerHTML = this.mehr();
    else if (s === 'liste')     ziel.innerHTML = this.buchungsListe(this.zustand.listenArt);

    document.querySelectorAll('.nav button[data-schirm]').forEach((b) => {
      b.classList.toggle('an', b.dataset.schirm === s);
    });

    if (typeof Diagramm !== 'undefined') Diagramm.verdrahte(ziel);
  },

  /* ---------- Schirm: Vermögen ---------- */

  vermoegenSchirm: function () {
    if (typeof Vermoegen === 'undefined') {
      return '<div class="kopf"><h1>Vermögen</h1></div>' +
             '<div class="leer-hinweis">Nicht verfügbar.</div>';
    }

    const posten = Daten.vermoegen || [];
    const netto = Vermoegen.netto();
    const brutto = Vermoegen.brutto();
    const schulden = Vermoegen.schulden();
    const verlauf = Vermoegen.verlauf(true);

    let veraenderung = '';
    if (verlauf.length > 1) {
      const diff = netto - verlauf[0].cent;
      veraenderung = '<div class="hero-tage">' + (diff >= 0 ? '▲ ' : '▼ ') +
        geld(Math.abs(diff)) + ' € seit ' + esc(datumText(verlauf[0].datum)) + '</div>';
    }

    const diagramm = verlauf.length > 1
      ? '<div class="karte"><p class="karte-titel">Nettovermögen im Verlauf</p>' +
        Diagramm.verlauf(verlauf, DIAGRAMM.vermoegen, { titel: 'Nettovermögen im Verlauf' }) + '</div>'
      : '';

    const liste = posten.length
      ? '<div class="liste">' + posten.slice()
          .sort((a, b) => Vermoegen.letzterStand(b) - Vermoegen.letzterStand(a))
          .map((p) => {
            const art = VERMOEGENSARTEN[p.art] || VERMOEGENSARTEN.sonstiges;
            const letzte = (p.staende || []).length ? p.staende[p.staende.length - 1].datum : null;
            return '<button class="listenzeile" data-tu="vermoegen-posten" data-id="' + esc(p.id) + '">' +
              '<span class="icon">' + esc(p.emoji || art.emoji) + '</span>' +
              '<span class="mitte"><span class="haupt">' + esc(p.name) + '</span>' +
                '<span class="neben">' + esc(art.name) +
                (letzte ? ' · Stand vom ' + esc(datumText(letzte)) : ' · noch kein Stand') + '</span></span>' +
              '<span class="rechts mono">' + geld(Vermoegen.letzterStand(p)) + ' €</span></button>';
          }).join('') + '</div>'
      : '<button class="karte karte-knopf leer-karte" data-tu="vermoegen-neu">' +
          '<span class="leer-symbol">💎</span>' +
          '<span class="leer-text"><b>Ersten Posten anlegen</b>' +
          '<small>Konten, Depot, Bargeld</small></span>' +
          '<span class="chevron">›</span></button>';

    const kredite = (Daten.kredite || []).length
      ? '<p class="abschnitt-titel">Kredite</p><div class="liste">' +
        Daten.kredite.map((k) =>
          '<button class="listenzeile" data-tu="kredit">' +
            '<span class="icon">🏦</span>' +
            '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
              '<span class="neben">Rate ' + geld(k.rateCent || 0) + ' € · ' +
                String(k.zinssatz || 0).replace('.', ',') + ' %</span></span>' +
            '<span class="rechts mono minus">− ' + geld(Kredit.restschuld(k)) + ' €</span></button>').join('') +
        '</div>'
      : '';

    return '<div class="kopf"><h1>Vermögen</h1>' +
        '<div class="unterzeile">' + posten.length + ' Posten' +
          ((Daten.kredite || []).length ? ' · ' + Daten.kredite.length + ' Kredit' : '') + '</div></div>' +
      '<div class="inhalt">' +
        '<div class="karte hero">' +
          '<div class="hero-zahl' + (netto >= 0 ? '' : ' minus') + '">' + geldE(netto) + '</div>' +
          '<div class="hero-unter">Nettovermögen</div>' +
          veraenderung +
        '</div>' +
        (schulden > 0
          ? '<div class="zwei-spalten" style="margin-bottom:14px">' +
              '<div class="mini-karte"><div class="label">Besitz</div>' +
                '<div class="wert mono">' + geld(brutto) + ' €</div></div>' +
              '<div class="mini-karte"><div class="label">Schulden</div>' +
                '<div class="wert mono minus">− ' + geld(schulden) + ' €</div></div>' +
            '</div>'
          : '') +
        diagramm +
        (posten.length ? '<p class="abschnitt-titel">Posten</p>' : '') +
        liste +
        (posten.length
          ? '<button class="knopf zweit" data-tu="vermoegen-neu" style="margin-top:12px">Posten hinzufügen</button>'
          : '') +
        kredite +
        (!(Daten.kredite || []).length
          ? '<button class="knopf rand" data-tu="kredit" style="margin-top:12px">Kredit anlegen</button>' : '') +
      '</div>';
  },

  /* ---------- Monatswaehler ---------- */

  monatswahlHtml: function () {
    return '<div class="monatswahl">' +
      '<button class="pfeil" data-tu="monat-zurueck" aria-label="Vorheriger Monat">‹</button>' +
      '<button class="aktuell" data-tu="monat-heute">' + esc(monatText(this.zustand.monat)) + '</button>' +
      '<button class="pfeil" data-tu="monat-vor" aria-label="Nächster Monat">›</button>' +
    '</div>';
  },

  /* ---------- Schirm: Ausgaben / Einnahmen ---------- */

  buchungsListe: function (art) {
    const monat = this.zustand.monat;
    const suche = this.zustand.suche.toLowerCase().trim();

    let liste = buchungenImMonat(monat, art);
    if (suche) {
      liste = liste.filter((b) => {
        const k = kategorie(b.kategorieId);
        return (b.haendler || '').toLowerCase().indexOf(suche) !== -1 ||
               (b.notiz || '').toLowerCase().indexOf(suche) !== -1 ||
               (k ? k.name.toLowerCase().indexOf(suche) !== -1 : false);
      });
    }

    liste.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : (b.erstellt || 0) - (a.erstellt || 0)));

    const gesamt = summe(liste);
    const titel = art === 'ausgabe' ? 'Ausgaben' : 'Einnahmen';

    // Nach Tag gruppieren
    const tage = [];
    let letzterTag = null;
    liste.forEach((b) => {
      if (b.datum !== letzterTag) { tage.push({ datum: b.datum, posten: [] }); letzterTag = b.datum; }
      tage[tage.length - 1].posten.push(b);
    });

    const koerper = tage.length
      ? tage.map((t) => {
          const tagSumme = t.posten.reduce((s, b) => s + (zaehltMit(b) ? b.betragCent : 0), 0);
          return '<div class="tag-kopf"><span>' + esc(datumLang(t.datum)) + '</span>' +
                 '<span class="summe">' + geldE(tagSumme) + '</span></div>' +
                 t.posten.map((b) => this.buchungHtml(b)).join('');
        }).join('')
      : '<div class="leer-hinweis"><span class="gross">' + (art === 'ausgabe' ? '🧾' : '💰') + '</span>' +
        (suche ? 'Nichts gefunden für „' + esc(this.zustand.suche) + '".'
               : 'Keine ' + titel + ' in ' + esc(monatText(monat)) + '.') + '</div>';

    return '<div class="kopf">' +
        '<div class="kopf-reihe">' +
          '<button class="zurueck" data-tu="zurueck-einaus">‹ Ein &amp; Aus</button>' +
          '<button class="kopf-plus" data-tu="neue-buchung" aria-label="Buchung erfassen">+</button>' +
        '</div>' +
        '<h1>' + titel + '</h1>' +
        '<div class="unterzeile">' + liste.length + ' Buchung' + (liste.length === 1 ? '' : 'en') +
          ' · ' + geldE(gesamt) + '</div>' +
        this.monatswahlHtml() +
      '</div>' +
      '<div class="inhalt">' +
        '<div class="feld"><input type="search" id="suchfeld" placeholder="Suchen…" ' +
          'value="' + esc(this.zustand.suche) + '" autocomplete="off" autocorrect="off" ' +
          'autocapitalize="off" enterkeyhint="search"></div>' +
        koerper +
      '</div>';
  },

  buchungHtml: function (b) {
    const k = kategorie(b.kategorieId) || { name: 'Ohne Kategorie', emoji: '❓', ausBilanz: false };
    const neutral = !!k.ausBilanz;
    const klasse = neutral ? 'leise' : (b.typ === 'ausgabe' ? 'minus' : 'plus');
    const zeichen = neutral ? '' : (b.typ === 'ausgabe' ? '−' : '+');

    const untertitel = [];
    untertitel.push(k.name);
    if (istVerschoben(b)) untertitel.push('zählt für ' + monatText(wirkMonat(b)).split(' ')[0]);
    if (b.wiederkehrend) untertitel.push('🔁 wiederkehrend');
    if (b.quelle === 'csv') untertitel.push('importiert');
    if (b.notiz) untertitel.push(b.notiz);

    return '<button class="buchung" data-buchung="' + esc(b.id) + '">' +
      '<span class="icon">' + esc(k.emoji) + '</span>' +
      '<span class="mitte">' +
        '<span class="titel">' + esc(b.haendler || k.name) + '</span>' +
        '<span class="sub">' + esc(untertitel.join(' · ')) + '</span>' +
      '</span>' +
      '<span class="wert ' + klasse + '">' + zeichen + geld(b.betragCent) + ' €</span>' +
    '</button>';
  },

  /* ---------- Schirm: Mehr ---------- */

  mehr: function () {
    const anzahl = Daten.buchungen.length;
    const anzahlKat = aktiveAusgabeKategorien().length;
    const anzahlArchiv = Daten.kategorien.filter((k) => k.archiviert).length;
    const anzahlRegeln = Regeln.anzahl();

    return '<div class="kopf"><h1>Mehr</h1>' +
        '<div class="unterzeile">' + anzahl + ' Buchungen insgesamt</div></div>' +
      '<div class="inhalt">' +

        '<p class="abschnitt-titel">Dein Geld</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="einstellungen">' +
            '<span class="icon">⚙️</span>' +
            '<span class="mitte"><span class="haupt">Einkommen &amp; Name</span>' +
            '<span class="neben">' +
              (Daten.einstellungen.mindestnettoCent
                ? 'Mindestnetto ' + geld(Daten.einstellungen.mindestnettoCent) + ' €'
                : 'noch nicht eingerichtet') + '</span></span>' +
            '<span class="chevron">›</span></button>' +
          (typeof Sparen === 'undefined' ? '' :
          '<button class="listenzeile" data-tu="sparen">' +
            '<span class="icon">🛟</span>' +
            '<span class="mitte"><span class="haupt">Sparen</span>' +
            '<span class="neben">' +
              (Daten.einstellungen.sparrateCent
                ? geld(Daten.einstellungen.sparrateCent) + ' € im Monat · ' +
                  (Daten.sparziele || []).length + ' Ziel' + ((Daten.sparziele || []).length === 1 ? '' : 'e')
                : 'Sparrate, Notgroschen, Sparziele') + '</span></span>' +
            '<span class="chevron">›</span></button>') +
          (typeof Fixkosten === 'undefined' ? '' :
          '<button class="listenzeile" data-tu="fixkosten">' +
            '<span class="icon">📌</span>' +
            '<span class="mitte"><span class="haupt">Fixkosten</span>' +
            '<span class="neben">' +
              ((Daten.fixkosten || []).length
                ? (Daten.fixkosten || []).length + ' Posten · ' + geld(Fixkosten.monatsSumme()) + ' € im Monat'
                : 'Miete, Strom, Abos, Versicherungen') + '</span></span>' +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="budgets">' +
            '<span class="icon">🎯</span>' +
            '<span class="mitte"><span class="haupt">Budgets</span>' +
            '<span class="neben">' +
              (Object.keys(Daten.budgets || {}).length
                ? Object.keys(Daten.budgets).length + ' Kategorien begrenzt · ' +
                  geld(Budgets.gesamt()) + ' € gesamt'
                : 'Monatsgrenze pro Kategorie') + '</span></span>' +
            '<span class="chevron">›</span></button>') +
        '</div>' +

        '<p class="abschnitt-titel">Buchungen</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="import">' +
            '<span class="icon">📥</span>' +
            '<span class="mitte"><span class="haupt">Trade Republic importieren</span>' +
            '<span class="neben">CSV-Kontoauszug einlesen</span></span>' +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="neue-buchung">' +
            '<span class="icon">✏️</span>' +
            '<span class="mitte"><span class="haupt">Buchung erfassen</span>' +
            '<span class="neben">Von Hand eintragen, z. B. Bargeld</span></span>' +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="liste-ausgaben">' +
            '<span class="icon">🧾</span>' +
            '<span class="mitte"><span class="haupt">Alle Ausgaben</span>' +
            '<span class="neben">Einzelbuchungen ansehen und korrigieren</span></span>' +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="liste-einnahmen">' +
            '<span class="icon">💰</span>' +
            '<span class="mitte"><span class="haupt">Alle Einnahmen</span>' +
            '<span class="neben">Einzelbuchungen ansehen und korrigieren</span></span>' +
            '<span class="chevron">›</span></button>' +
        '</div>' +

        '<p class="abschnitt-titel">Verwalten</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="kategorien">' +
            '<span class="icon">🏷️</span>' +
            '<span class="mitte"><span class="haupt">Kategorien</span>' +
            '<span class="neben">' + anzahlKat + ' für Ausgaben · Grenze ' + KAT_GRENZE +
              (anzahlArchiv ? ' · ' + anzahlArchiv + ' im Archiv' : '') + '</span></span>' +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="regeln">' +
            '<span class="icon">🧠</span>' +
            '<span class="mitte"><span class="haupt">Gelernte Zuordnungen</span>' +
            '<span class="neben">' + anzahlRegeln + ' Händler bekannt</span></span>' +
            '<span class="chevron">›</span></button>' +
        '</div>' +

        '<p class="abschnitt-titel">Backup</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="export">' +
            '<span class="icon">💾</span>' +
            '<span class="mitte"><span class="haupt">Daten sichern</span>' +
            '<span class="neben">' + esc(Backup.standText()) + '</span></span>' +
            (Backup.faellig() && Backup.etwasZuVerlieren()
              ? '<span class="rechts warnpunkt">●</span>' : '') +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="backup-pruefen">' +
            '<span class="icon">🔍</span>' +
            '<span class="mitte"><span class="haupt">Backup prüfen</span>' +
            '<span class="neben">Testlauf: sichern, wieder einlesen, nachzählen</span></span>' +
            '<span class="chevron">›</span></button>' +
          '<button class="listenzeile" data-tu="import-json">' +
            '<span class="icon">♻️</span>' +
            '<span class="mitte"><span class="haupt">Backup einspielen</span>' +
            '<span class="neben">JSON-Datei wiederherstellen</span></span>' +
            '<span class="chevron">›</span></button>' +
        '</div>' +
        '<p class="hinweis">Deine Daten liegen nur auf diesem Gerät. Wenn du den Browser-Speicher ' +
          'löschst oder das iPhone wechselst, sind sie weg. Sichere sie regelmäßig.</p>' +

        '<p class="abschnitt-titel">Gefahrenzone</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="alles-loeschen">' +
            '<span class="icon">🗑️</span>' +
            '<span class="mitte"><span class="haupt minus">Alle Daten löschen</span>' +
            '<span class="neben">Setzt die App komplett zurück</span></span></button>' +
        '</div>' +

        '<div class="marke">Keel ' + APP_VERSION + '<br>' +
          'Alles offline. Keine Konten, keine Cloud, keine Werbung.</div>' +
      '</div>';
  }
};

/* ============================================================
   7. Schnellerfassung
   ============================================================ */

const Erfassung = {

  zustand: null,

  oeffnen: function (buchungId) {
    const vorhanden = buchungId ? Daten.buchungen.find((b) => b.id === buchungId) : null;

    this.zustand = vorhanden ? {
      bearbeiten: vorhanden.id,
      typ: vorhanden.typ,
      centText: String(vorhanden.betragCent),
      kategorieId: vorhanden.kategorieId,
      datum: vorhanden.datum,
      haendler: vorhanden.haendler || '',
      notiz: vorhanden.notiz || '',
      wiederkehrend: !!vorhanden.wiederkehrend,
      normHaendler: vorhanden.normHaendler || '',
      stamm: vorhanden.stamm || '',
      katVorbelegt: false
    } : {
      bearbeiten: null,
      typ: 'ausgabe',              // Ausgabe ist immer vorausgewaehlt
      centText: '',
      kategorieId: this.letzteKategorie('ausgabe'),
      datum: heuteISO(),           // immer heute
      haendler: '',
      notiz: '',
      wiederkehrend: false,
      normHaendler: '',
      stamm: '',
      katVorbelegt: true
    };

    Blatt.oeffnen({
      titel: vorhanden ? 'Buchung bearbeiten' : 'Neue Buchung',
      linksText: 'Abbrechen',
      rechtsText: 'Sichern',
      beiRechts: () => this.speichern(),
      nachOeffnen: (koerper) => {
        koerper.innerHTML = this.koerperHtml();
        this.verdrahten(koerper);
        this.aktualisiere();
        // Ziffernblock sofort im Blick - kein Feld zieht den Fokus an sich,
        // die erste Ziffer kann direkt getippt werden.
        koerper.scrollTop = 0;
      }
    });
  },

  /* Die zuletzt benutzte Kategorie dieser Art.
     Wird aus den vorhandenen Buchungen gelesen - es wird nichts zusaetzlich
     gespeichert, die Datenstruktur bleibt unveraendert. */
  letzteKategorie: function (typ) {
    let treffer = null;

    Daten.buchungen.forEach((b) => {
      if (b.typ !== typ) return;
      const k = kategorie(b.kategorieId);
      if (!k || (k.typ !== typ && k.typ !== 'neutral')) return;
      // Archivierte Kategorien werden uebersprungen - dann greift eben die
      // zuletzt benutzte, die noch aktiv ist.
      if (k.archiviert) return;
      const neuer = !treffer ||
        b.datum > treffer.datum ||
        (b.datum === treffer.datum && (b.erstellt || 0) > (treffer.erstellt || 0));
      if (neuer) treffer = b;
    });

    if (treffer) return treffer.kategorieId;

    // Noch nichts erfasst: die erste passende Kategorie nehmen, damit auch
    // beim allerersten Mal nur der Betrag Pflicht ist.
    const erste = Daten.kategorien.filter((k) =>
      !k.archiviert && (k.typ === typ || k.typ === 'neutral'))[0];
    return erste ? erste.id : null;
  },

  koerperHtml: function () {
    const z = this.zustand;
    return (
      (z.bearbeiten ? '' :
        '<div class="typ-schalter">' +
          '<button data-typ="ausgabe">Ausgabe</button>' +
          '<button data-typ="einnahme">Einnahme</button>' +
        '</div>') +

      '<div class="betrag-anzeige" id="betrag-anzeige"></div>' +

      '<div class="numpad">' +
        [1,2,3,4,5,6,7,8,9].map((n) => '<button data-ziffer="' + n + '">' + n + '</button>').join('') +
        '<button class="klein" data-loeschen="alles">C</button>' +
        '<button data-ziffer="0">0</button>' +
        '<button class="klein" data-loeschen="eins">⌫</button>' +
      '</div>' +

      '<div class="feld"><label>Kategorie</label>' +
        '<div class="kat-gitter" id="kat-gitter"></div></div>' +

      '<div class="feld-reihe">' +
        '<div class="feld"><label>Datum</label>' +
          '<input type="date" id="feld-datum" value="' + esc(z.datum) + '"></div>' +
        '<div class="feld"><label>Bezeichnung</label>' +
          '<input type="text" id="feld-haendler" placeholder="z. B. REWE" ' +
          'value="' + esc(z.haendler) + '" autocomplete="off" enterkeyhint="done"></div>' +
      '</div>' +

      '<div class="feld"><label>Notiz (optional)</label>' +
        '<input type="text" id="feld-notiz" placeholder="Wofür war das?" ' +
        'value="' + esc(z.notiz) + '" autocomplete="off" enterkeyhint="done"></div>' +

      '<div id="wiederkehrend-block"></div>' +

      '<button class="knopf" id="knopf-speichern" style="margin-top:6px">Speichern</button>' +

      (z.bearbeiten ?
        '<button class="knopf gefahr" id="knopf-loeschen" style="margin-top:10px">Buchung löschen</button>' : '') +

      '<div style="height:20px"></div>'
    );
  },

  verdrahten: function (koerper) {
    const z = this.zustand;

    koerper.querySelectorAll('[data-typ]').forEach((b) => {
      b.addEventListener('click', () => {
        z.typ = b.dataset.typ;
        z.kategorieId = this.letzteKategorie(z.typ);
        z.katVorbelegt = true;
        this.aktualisiere();
      });
    });

    koerper.querySelectorAll('[data-ziffer]').forEach((b) => {
      b.addEventListener('click', () => {
        if (z.centText.length >= 9) return;
        if (z.centText === '' && b.dataset.ziffer === '0') return;
        z.centText += b.dataset.ziffer;
        this.aktualisiere();
      });
    });

    koerper.querySelector('[data-loeschen="eins"]').addEventListener('click', () => {
      z.centText = z.centText.slice(0, -1);
      this.aktualisiere();
    });
    koerper.querySelector('[data-loeschen="alles"]').addEventListener('click', () => {
      z.centText = '';
      this.aktualisiere();
    });

    koerper.querySelector('#feld-datum').addEventListener('change', (e) => {
      z.datum = e.target.value || heuteISO();
    });
    koerper.querySelector('#feld-haendler').addEventListener('input', (e) => {
      z.haendler = e.target.value;
    });
    koerper.querySelector('#feld-notiz').addEventListener('input', (e) => {
      z.notiz = e.target.value;
    });
    koerper.querySelector('#knopf-speichern').addEventListener('click', () => this.speichern());

    const loeschKnopf = koerper.querySelector('#knopf-loeschen');
    if (loeschKnopf) {
      loeschKnopf.addEventListener('click', () => {
        if (!confirm('Diese Buchung wirklich löschen?')) return;
        Daten.buchungen = Daten.buchungen.filter((b) => b.id !== z.bearbeiten);
        sichern();
        Blatt.schliessen();
        UI.zeichne();
        UI.melde('Buchung gelöscht');
      });
    }
  },

  aktualisiere: function () {
    const z = this.zustand;
    const koerper = Blatt.koerper();
    if (!koerper) return;

    // Typ-Schalter
    koerper.querySelectorAll('[data-typ]').forEach((b) => {
      b.classList.toggle('an', b.dataset.typ === z.typ);
    });

    // Betrag
    const anzeige = koerper.querySelector('#betrag-anzeige');
    const cent = parseInt(z.centText || '0', 10);
    anzeige.className = 'betrag-anzeige ' + (z.typ === 'ausgabe' ? 'aus' : 'ein') +
      (z.centText ? '' : ' leer');
    if (!z.centText) {
      anzeige.innerHTML = '<span class="grau">0,00 €</span>';
    } else {
      anzeige.textContent = (z.typ === 'ausgabe' ? '−' : '+') + geld(cent) + ' €';
    }

    // Kategorien: haeufigste zuerst. Archivierte tauchen hier nicht mehr auf -
    // ausser sie haengt noch an der Buchung, die gerade bearbeitet wird. Sonst
    // wuerde die Bearbeitung die Kategorie stillschweigend umhaengen.
    const nutzung = nutzungProKategorie();

    const liste = Daten.kategorien
      .filter((k) => (k.typ === z.typ || k.typ === 'neutral') &&
                     (!k.archiviert || k.id === z.kategorieId))
      .sort((a, b) => {
        if (a.typ === 'neutral' && b.typ !== 'neutral') return 1;
        if (b.typ === 'neutral' && a.typ !== 'neutral') return -1;
        return (nutzung[b.id] || 0) - (nutzung[a.id] || 0);
      });

    // Die automatisch vorbelegte Kategorie nach vorn holen, damit sie ohne
    // Scrollen zu sehen ist.
    if (z.katVorbelegt && z.kategorieId) {
      const pos = liste.findIndex((k) => k.id === z.kategorieId);
      if (pos > 0) liste.unshift(liste.splice(pos, 1)[0]);
    }

    const gitter = koerper.querySelector('#kat-gitter');
    gitter.innerHTML = liste.map((k) =>
      '<button class="kat-kachel' + (k.id === z.kategorieId ? ' an' : '') +
        (z.katVorbelegt && k.id === z.kategorieId ? ' vorbelegt' : '') +
        '" data-kat="' + esc(k.id) + '">' +
        '<span class="emoji">' + esc(k.emoji) + '</span>' +
        '<span class="name">' + esc(k.name) + '</span>' +
      '</button>'
    ).join('');

    gitter.querySelectorAll('[data-kat]').forEach((b) => {
      b.addEventListener('click', () => {
        z.kategorieId = b.dataset.kat;
        z.katVorbelegt = false;
        this.aktualisiere();
      });
    });

    // Schalter "wiederkehrend" nur bei Einnahmen
    const block = koerper.querySelector('#wiederkehrend-block');
    if (z.typ === 'einnahme') {
      block.innerHTML =
        '<div class="schalter-zeile" style="margin-bottom:15px">' +
          '<div class="txt">Wiederkehrend<small>z. B. Gehalt, Miete, monatlicher Zuschuss</small></div>' +
          '<div class="schalter' + (z.wiederkehrend ? ' an' : '') + '" id="schalter-wdh"></div>' +
        '</div>';
      block.querySelector('#schalter-wdh').addEventListener('click', () => {
        z.wiederkehrend = !z.wiederkehrend;
        this.aktualisiere();
      });
    } else {
      block.innerHTML = '';
    }

    // Sichern-Knopf aktiv? Pflicht ist nur der Betrag - Bezeichnung und
    // Notiz duerfen leer bleiben, die Kategorie ist vorbelegt.
    const bereit = cent > 0;
    const rechts = Blatt.rechtsKnopf();
    if (rechts) rechts.disabled = !bereit;
    const knopf = koerper.querySelector('#knopf-speichern');
    if (knopf) knopf.disabled = !bereit;
  },

  speichern: function () {
    const z = this.zustand;
    const cent = parseInt(z.centText || '0', 10);

    if (cent <= 0) { UI.melde('Bitte einen Betrag eingeben', 'fehler'); return; }

    // Pflicht ist nur der Betrag. Wurde keine Kategorie angetippt, greift die
    // zuletzt benutzte.
    const katId = z.kategorieId || this.letzteKategorie(z.typ);
    if (!katId) { UI.melde('Bitte eine Kategorie wählen', 'fehler'); return; }

    const haendler = z.haendler.trim();

    if (z.bearbeiten) {
      const b = Daten.buchungen.find((x) => x.id === z.bearbeiten);
      if (b) {
        b.typ = z.typ;
        b.betragCent = cent;
        b.kategorieId = katId;
        b.datum = z.datum;
        b.haendler = haendler;
        b.notiz = z.notiz.trim();
        b.wiederkehrend = z.typ === 'einnahme' ? z.wiederkehrend : false;

        // Wenn die Buchung aus einem Import stammt und die Kategorie geaendert
        // wurde: Regel nachziehen, damit es beim naechsten Mal stimmt.
        if (b.normHaendler) Regeln.lerne(b.normHaendler, b.stamm, katId);
      }
    } else {
      const norm = haendler ? TradeRepublic.normalisiere(haendler) : '';
      Daten.buchungen.push({
        id: neueId('b'),
        typ: z.typ,
        betragCent: cent,
        datum: z.datum,
        kategorieId: katId,
        haendler: haendler,
        notiz: z.notiz.trim(),
        wiederkehrend: z.typ === 'einnahme' ? z.wiederkehrend : false,
        quelle: 'manuell',
        trId: '',
        hash: z.datum + '|' + (z.typ === 'ausgabe' ? -cent : cent) + '|' + norm,
        normHaendler: norm,
        stamm: TradeRepublic.stamm(norm),
        erstellt: Date.now()
      });
      if (norm) Regeln.lerne(norm, TradeRepublic.stamm(norm), katId);
    }

    sichern();
    Blatt.schliessen();

    // Beim Bearbeiten springt die Ansicht in den Monat der Buchung, damit die
    // Aenderung sichtbar wird. Neu Erfasstes laesst die Ansicht dagegen in
    // Ruhe: nach dem Speichern steht man wieder genau dort, wo man war.
    if (z.bearbeiten) UI.zustand.monat = monatVon(z.datum);
    UI.zeichne();
    UI.melde(z.bearbeiten ? 'Gespeichert' : 'Buchung erfasst', 'gut');
  }
};

/* ============================================================
   8. Kategorien verwalten
   ============================================================ */

const Kategorien = {

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Kategorien',
      linksText: 'Fertig',
      rechtsText: 'Neu',
      beiRechts: () => this.neu(),
      nachOeffnen: (koerper) => {
        this.zeichne(koerper);
        // Erst zeichnen, dann den einmaligen Hinweis darueberlegen.
        this.hinweisWennZuViele();
      }
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    // Die Zaehlung passiert hier - und "zeichne" laeuft bei jedem Oeffnen der
    // Verwaltung, nicht nur beim allerersten Laden.
    const aktiv = aktiveAusgabeKategorien().length;
    const voll  = aktiv >= KAT_GRENZE;

    const nutzung = nutzungProKategorie();
    const archiv  = Daten.kategorien.filter((k) => k.archiviert);

    const gruppe = (typ, titel) => {
      const liste = Daten.kategorien.filter((k) => k.typ === typ && !k.archiviert);
      if (!liste.length) return '';
      return '<p class="abschnitt-titel">' + titel + '</p><div class="liste">' +
        liste.map((k) =>
          '<button class="listenzeile" data-kat="' + esc(k.id) + '">' +
            '<span class="icon">' + esc(k.emoji) + '</span>' +
            '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
              '<span class="neben">' + buchungenText(nutzung[k.id] || 0) +
              (k.system ? ' · zählt nicht in die Bilanz' : '') + '</span></span>' +
            '<span class="chevron">›</span>' +
          '</button>').join('') +
      '</div>';
    };

    koerper.innerHTML =
      '<div class="kat-zaehler' + (voll ? ' voll' : '') + '">' +
        '<b>' + aktiv + ' von ' + KAT_GRENZE + '</b> Ausgabe-Kategorien in Gebrauch' +
        (aktiv > KAT_GRENZE ? '<small>Mehr als vorgesehen. Nichts wird von selbst ' +
          'archiviert — du entscheidest.</small>' : '') +
      '</div>' +

      gruppe('ausgabe', 'Ausgaben') +
      gruppe('einnahme', 'Einnahmen') +
      gruppe('neutral', 'Neutral') +

      '<button class="knopf' + (voll ? ' gesperrt' : '') + '" id="k-neu">Kategorie anlegen</button>' +

      (archiv.length
        ? '<p class="abschnitt-titel">Archiv</p><div class="liste">' +
            '<button class="listenzeile" id="k-archiv">' +
              '<span class="icon">📦</span>' +
              '<span class="mitte"><span class="haupt">Archivierte Kategorien</span>' +
                '<span class="neben">' + archiv.length + ' abgelegt · ansehen und zurückholen</span></span>' +
              '<span class="chevron">›</span>' +
            '</button>' +
          '</div>'
        : '') +

      '<p class="hinweis">Die Grenze gilt für Ausgabe-Kategorien. Einnahmen und ' +
        '„Umbuchung" zählen nicht mit. Archivierte Kategorien verschwinden aus der ' +
        'Erfassung, bleiben bei alten Buchungen aber stehen und tauchen in den ' +
        'Auswertungen weiter auf.</p><div style="height:12px"></div>';

    koerper.querySelectorAll('[data-kat]').forEach((b) => {
      b.addEventListener('click', () => this.bearbeiten(b.dataset.kat));
    });
    koerper.querySelector('#k-neu').addEventListener('click', () => this.neu());

    const archivKnopf = koerper.querySelector('#k-archiv');
    if (archivKnopf) archivKnopf.addEventListener('click', () => this.archiv());

    // Der Knopf oben rechts im Blattkopf wird mitgedimmt - antippen laesst er
    // sich weiterhin, dann kommt der Hinweis.
    const rechts = Blatt.rechtsKnopf();
    if (rechts) rechts.classList.toggle('gesperrt', voll);
  },

  // Einziger Weg zu einer neuen Kategorie. Hier haengt die Grenze.
  neu: function () {
    if (katGrenzeErreicht()) { this.ersetzenBlatt(); return; }
    this.bearbeiten(null);
  },

  /* Der Hinweis, wenn die Grenze erreicht ist. Er sagt nicht nur nein,
     sondern zeigt gleich, was stattdessen weichen kann. */
  ersetzenBlatt: function () {
    const nutzung = nutzungProKategorie();
    const liste = aktiveAusgabeKategorien()
      .slice()
      .sort((a, b) => (nutzung[a.id] || 0) - (nutzung[b.id] || 0));

    Blatt.oeffnen({
      titel: 'Grenze erreicht',
      linksText: 'Abbrechen',
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<p class="grenze-text">Du hast schon ' + KAT_GRENZE + ' Kategorien. ' +
            'Mehr Kategorien bedeuten mehr Entscheidungen bei jeder Erfassung — ' +
            'und dass du schneller aufhörst zu erfassen. Welche willst du ersetzen?</p>' +

          '<div class="liste">' +
            liste.map((k) =>
              '<button class="listenzeile" data-ers="' + esc(k.id) + '">' +
                '<span class="icon">' + esc(k.emoji) + '</span>' +
                '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
                  '<span class="neben">' + buchungenText(nutzung[k.id] || 0) + '</span></span>' +
                '<span class="rechts">archivieren</span>' +
              '</button>').join('') +
          '</div>' +

          '<p class="hinweis">Am seltensten benutzt steht oben. Archivieren löscht ' +
            'nichts: die Buchungen bleiben, die Kategorie taucht nur nicht mehr bei ' +
            'der Erfassung auf. Zurückholen geht jederzeit.</p>' +

          // Die Grenze gilt nur fuer Ausgaben. Ohne diesen Weg waere eine neue
          // Einnahme-Kategorie ab jetzt gar nicht mehr moeglich.
          '<button class="knopf rand" id="ers-einnahme">Stattdessen eine Einnahme-Kategorie</button>' +
          '<div style="height:12px"></div>';

        koerper.querySelector('#ers-einnahme').addEventListener('click', () => {
          Blatt.schliessen();
          this.bearbeiten(null, 'einnahme');
        });

        koerper.querySelectorAll('[data-ers]').forEach((b) => {
          b.addEventListener('click', () => {
            const k = kategorie(b.dataset.ers);
            if (!k) return;
            if (!confirm('„' + k.name + '" archivieren und stattdessen eine neue ' +
                         'Kategorie anlegen?')) return;
            this.archivieren(k.id);
            Blatt.schliessen();      // das Hinweisblatt
            this.zeichne();
            this.bearbeiten(null);   // direkt weiter zur neuen Kategorie
          });
        });
      }
    });
  },

  /* Der einmalige Hinweis fuer alle, die schon mehr als die Grenze haben.
     Er archiviert nichts von selbst, er zeigt nur die Nutzungshaeufigkeit
     und schlaegt die seltenen vor. */
  hinweisWennZuViele: function () {
    if (Daten.einstellungen.katHinweisGezeigt) return;
    if (aktiveAusgabeKategorien().length <= KAT_GRENZE) return;

    Daten.einstellungen.katHinweisGezeigt = true;
    sichern();

    Blatt.oeffnen({
      titel: 'Zu viele Kategorien',
      linksText: 'Später',
      nachOeffnen: (koerper) => {
        const male = () => {
          const nutzung = nutzungProKategorie();
          const aktiv = aktiveAusgabeKategorien();
          const zuViel = aktiv.length - KAT_GRENZE;
          const liste = aktiv.slice()
            .sort((a, b) => (nutzung[a.id] || 0) - (nutzung[b.id] || 0));

          koerper.innerHTML =
            '<p class="grenze-text">Keel arbeitet ab jetzt mit höchstens ' + KAT_GRENZE +
              ' Ausgabe-Kategorien. Du hast <b>' + aktiv.length + '</b>. ' +
              'Es wird nichts von selbst archiviert — hier steht nur, wie oft du jede ' +
              'wirklich benutzt hast. Die selten genutzten oben sind die Kandidaten.</p>' +

            (zuViel > 0
              ? '<div class="kat-zaehler voll"><b>' + zuViel + '</b> zu viel</div>'
              : '<div class="kat-zaehler"><b>Passt.</b> Jetzt sind es ' + aktiv.length +
                ' von ' + KAT_GRENZE + '.</div>') +

            '<div class="liste">' +
              liste.map((k) =>
                '<button class="listenzeile" data-hw="' + esc(k.id) + '">' +
                  '<span class="icon">' + esc(k.emoji) + '</span>' +
                  '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
                    '<span class="neben">' + buchungenText(nutzung[k.id] || 0) + '</span></span>' +
                  '<span class="rechts">archivieren</span>' +
                '</button>').join('') +
            '</div>' +

            '<button class="knopf" id="hw-fertig">Fertig</button>' +
            '<p class="hinweis">Archivieren löscht nichts. Alte Buchungen behalten ihre ' +
              'Bezeichnung, die Auswertungen bleiben vollständig.</p>' +
            '<div style="height:12px"></div>';

          koerper.querySelectorAll('[data-hw]').forEach((b) => {
            b.addEventListener('click', () => {
              const k = kategorie(b.dataset.hw);
              if (!k) return;
              if (!confirm('„' + k.name + '" archivieren?')) return;
              this.archivieren(k.id);
              male();
            });
          });
          koerper.querySelector('#hw-fertig').addEventListener('click', () => Blatt.schliessen());
        };

        male();
      },
      beimSchliessen: () => { this.zeichne(); }
    });
  },

  /* Der eigene Bereich fuer alles Archivierte. */
  archiv: function () {
    Blatt.oeffnen({
      titel: 'Archiv',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => {
        const male = () => {
          const nutzung = nutzungProKategorie();
          const liste = Daten.kategorien.filter((k) => k.archiviert);
          const frei = Math.max(0, KAT_GRENZE - aktiveAusgabeKategorien().length);

          if (!liste.length) {
            koerper.innerHTML = '<div class="leer-hinweis"><span class="gross">📦</span>' +
              'Nichts archiviert.</div>';
            return;
          }

          koerper.innerHTML =
            '<div class="kat-zaehler' + (frei ? '' : ' voll') + '">' +
              (frei
                ? '<b>' + frei + '</b> Platz' + (frei === 1 ? '' : 'e') + ' frei'
                : '<b>Kein Platz frei.</b><small>Erst eine aktive Ausgabe-Kategorie ' +
                  'archivieren, dann geht das Zurückholen.</small>') +
            '</div>' +

            '<div class="liste">' +
              liste.map((k) =>
                '<button class="listenzeile" data-re="' + esc(k.id) + '">' +
                  '<span class="icon">' + esc(k.emoji) + '</span>' +
                  '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
                    '<span class="neben">' + buchungenText(nutzung[k.id] || 0) + ' · ' +
                      (k.typ === 'einnahme' ? 'Einnahme' : 'Ausgabe') + '</span></span>' +
                  '<span class="rechts">zurückholen</span>' +
                '</button>').join('') +
            '</div>' +

            '<p class="hinweis">Die Buchungen dieser Kategorien sind unverändert da und ' +
              'zählen weiter in allen Auswertungen mit.</p><div style="height:12px"></div>';

          koerper.querySelectorAll('[data-re]').forEach((b) => {
            b.addEventListener('click', () => { this.reaktivieren(b.dataset.re); male(); });
          });
        };

        male();
      },
      beimSchliessen: () => { this.zeichne(); }
    });
  },

  archivieren: function (katId) {
    const k = kategorie(katId);
    if (!k || k.system) return false;
    k.archiviert = true;
    sichern();
    UI.zeichne();
    return true;
  },

  // Zurueckholen gilt als "aktiv werden" - also greift die Grenze auch hier.
  reaktivieren: function (katId) {
    const k = kategorie(katId);
    if (!k) return false;
    if (k.typ === 'ausgabe' && katGrenzeErreicht()) {
      UI.melde('Erst Platz schaffen: ' + KAT_GRENZE + ' Kategorien sind das Höchste', 'fehler');
      return false;
    }
    k.archiviert = false;
    sichern();
    UI.zeichne();
    UI.melde('„' + k.name + '" ist wieder dabei', 'gut');
    return true;
  },

  bearbeiten: function (katId, artVorgabe) {
    const vorhanden = katId ? kategorie(katId) : null;
    const z = vorhanden ? Object.assign({}, vorhanden) :
              { id: null, name: '', emoji: '🏷️', typ: artVorgabe || 'ausgabe' };

    Blatt.oeffnen({
      titel: vorhanden ? 'Kategorie bearbeiten' : 'Neue Kategorie',
      linksText: 'Abbrechen',
      rechtsText: 'Sichern',
      beiRechts: () => speichern(),
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<div class="feld"><label>Name</label>' +
            '<input type="text" id="k-name" value="' + esc(z.name) + '" ' +
            'placeholder="z. B. Hobby" autocomplete="off" enterkeyhint="done"></div>' +

          (vorhanden && vorhanden.system ? '' :
            '<div class="feld"><label>Art</label>' +
              '<div class="typ-schalter" style="margin-bottom:0">' +
                '<button data-ktyp="ausgabe">Ausgabe</button>' +
                '<button data-ktyp="einnahme">Einnahme</button>' +
              '</div></div>') +

          '<div class="feld"><label>Symbol</label>' +
            '<div class="kat-gitter" id="k-emojis" style="grid-template-columns:repeat(7,1fr)">' +
              EMOJI_AUSWAHL.map((e) =>
                '<button class="kat-kachel" data-emoji="' + esc(e) + '" style="min-height:46px;padding:8px 2px">' +
                  '<span class="emoji">' + e + '</span></button>').join('') +
            '</div></div>' +

          '<button class="knopf" id="k-speichern">Speichern</button>' +

          // Archivieren ist der sanfte Weg: nichts geht verloren, die Kategorie
          // tritt nur ab. Deshalb steht sie vor dem Loeschen.
          (vorhanden && !vorhanden.system && !vorhanden.archiviert ?
            '<button class="knopf zweit" id="k-archivieren">Kategorie archivieren</button>' : '') +

          (vorhanden && !vorhanden.system ?
            '<button class="knopf gefahr" id="k-loeschen">Kategorie löschen</button>' : '') +

          '<div style="height:20px"></div>';

        const male = () => {
          koerper.querySelectorAll('[data-ktyp]').forEach((b) =>
            b.classList.toggle('an', b.dataset.ktyp === z.typ));
          koerper.querySelectorAll('[data-emoji]').forEach((b) =>
            b.classList.toggle('an', b.dataset.emoji === z.emoji));
        };

        koerper.querySelectorAll('[data-ktyp]').forEach((b) =>
          b.addEventListener('click', () => { z.typ = b.dataset.ktyp; male(); }));
        koerper.querySelectorAll('[data-emoji]').forEach((b) =>
          b.addEventListener('click', () => { z.emoji = b.dataset.emoji; male(); }));
        koerper.querySelector('#k-name').addEventListener('input', (e) => { z.name = e.target.value; });
        koerper.querySelector('#k-speichern').addEventListener('click', () => speichern());

        const archivieren = koerper.querySelector('#k-archivieren');
        if (archivieren) {
          archivieren.addEventListener('click', () => {
            const anzahl = Daten.buchungen.filter((b) => b.kategorieId === z.id).length;
            if (!confirm('„' + z.name + '" archivieren?\n\n' +
                         'Sie verschwindet aus der Erfassung. ' +
                         (anzahl ? (anzahl === 1
                                      ? 'Die vorhandene Buchung bleibt unverändert und zählt weiter mit.'
                                      : 'Die ' + anzahl + ' vorhandenen Buchungen bleiben ' +
                                        'unverändert und zählen weiter mit.')
                                 : 'Zurückholen geht jederzeit.'))) return;
            Kategorien.archivieren(z.id);
            Blatt.schliessen();
            Kategorien.zeichne();
            UI.melde('Archiviert');
          });
        }

        const loeschen = koerper.querySelector('#k-loeschen');
        if (loeschen) {
          loeschen.addEventListener('click', () => {
            const betroffen = Daten.buchungen.filter((b) => b.kategorieId === z.id).length;
            const frage = betroffen
              ? 'Kategorie „' + z.name + '" löschen?\n\n' + betroffen +
                ' Buchung(en) werden nach „Sonstiges" verschoben.'
              : 'Kategorie „' + z.name + '" löschen?';
            if (!confirm(frage)) return;

            const ersatz = z.typ === 'einnahme' ? 'sonstigeeinnahme' : 'sonstiges';
            Daten.buchungen.forEach((b) => { if (b.kategorieId === z.id) b.kategorieId = ersatz; });
            Daten.kategorien = Daten.kategorien.filter((k) => k.id !== z.id);

            Object.keys(Daten.regeln.exakt).forEach((s) => {
              if (Daten.regeln.exakt[s] === z.id) delete Daten.regeln.exakt[s];
            });
            Object.keys(Daten.regeln.stamm).forEach((s) => {
              if (Daten.regeln.stamm[s].kat === z.id) delete Daten.regeln.stamm[s];
            });

            sichern();
            Blatt.schliessen();
            Kategorien.zeichne();
            UI.zeichne();
            UI.melde('Kategorie gelöscht');
          });
        }

        male();
      }
    });

    function speichern() {
      const name = String(z.name || '').trim();
      if (!name) { UI.melde('Bitte einen Namen eingeben', 'fehler'); return; }

      const doppelt = Daten.kategorien.find((k) =>
        k.id !== z.id && k.name.toLowerCase() === name.toLowerCase());
      if (doppelt) {
        UI.melde(doppelt.archiviert
          ? 'Diese Kategorie liegt im Archiv'
          : 'Diese Kategorie gibt es schon', 'fehler');
        return;
      }

      // Zweite Sperre hinter dem Knopf: auch beim Umschalten einer
      // Einnahme- auf eine Ausgabe-Kategorie darf die Grenze nicht kippen.
      const wirdAusgabe = z.typ === 'ausgabe' &&
        !(vorhanden && vorhanden.typ === 'ausgabe' && !vorhanden.archiviert);
      if (wirdAusgabe && katGrenzeErreicht()) {
        UI.melde('Schon ' + KAT_GRENZE + ' Ausgabe-Kategorien — erst eine archivieren', 'fehler');
        return;
      }

      if (z.id) {
        const k = kategorie(z.id);
        k.name = name;
        k.emoji = z.emoji;
        if (!k.system) k.typ = z.typ;
      } else {
        Daten.kategorien.push({
          id: neueId('k'), name: name, emoji: z.emoji, typ: z.typ,
          ausBilanz: false, system: false, archiviert: false
        });
      }
      sichern();
      Blatt.schliessen();
      Kategorien.zeichne();
      UI.zeichne();
      UI.melde('Gespeichert', 'gut');
    }
  },

  // Kleiner Auswahl-Dialog, den der Import benutzt. Archivierte stehen nicht
  // zur Wahl - ausser eine Zeile haengt bereits an einer.
  waehlen: function (art, aktuell, beiWahl) {
    const liste = Daten.kategorien.filter((k) =>
      (k.typ === art || k.typ === 'neutral') && (!k.archiviert || k.id === aktuell));
    Blatt.oeffnen({
      titel: 'Kategorie wählen',
      linksText: 'Abbrechen',
      nachOeffnen: (koerper) => {
        koerper.innerHTML = '<div class="liste">' +
          liste.map((k) =>
            '<button class="listenzeile" data-w="' + esc(k.id) + '">' +
              '<span class="icon">' + esc(k.emoji) + '</span>' +
              '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
              (k.system ? '<span class="neben">zählt nicht in die Bilanz</span>' : '') + '</span>' +
              (k.id === aktuell ? '<span class="chevron">✓</span>' : '') +
            '</button>').join('') + '</div><div style="height:12px"></div>';

        koerper.querySelectorAll('[data-w]').forEach((b) => {
          b.addEventListener('click', () => {
            Blatt.schliessen();
            beiWahl(b.dataset.w);
          });
        });
      }
    });
  }
};

/* ============================================================
   9. Gelernte Zuordnungen
   ============================================================ */

const RegelSchirm = {

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Gelernte Zuordnungen',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => this.zeichne(koerper)
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const exakt = Object.keys(Daten.regeln.exakt).sort();
    const stamm = Object.keys(Daten.regeln.stamm).sort();

    if (!exakt.length && !stamm.length) {
      koerper.innerHTML = '<div class="leer-hinweis"><span class="gross">🧠</span>' +
        'Noch nichts gelernt.<br>Sobald du beim Import einem Händler eine Kategorie ' +
        'zuweist, merkt Keel sich das für alle künftigen Buchungen.</div>';
      return;
    }

    const zeile = (art, schluessel, katId, zusatz) => {
      const k = kategorie(katId);
      return '<button class="listenzeile" data-loesche="' + art + '" data-s="' + esc(schluessel) + '">' +
        '<span class="icon">' + esc(k ? k.emoji : '❓') + '</span>' +
        '<span class="mitte"><span class="haupt">' + esc(schluessel) + '</span>' +
          '<span class="neben">→ ' + esc(k ? k.name : 'gelöschte Kategorie') + (zusatz || '') + '</span></span>' +
        '<span class="chevron">✕</span></button>';
    };

    koerper.innerHTML =
      '<p class="hinweis" style="margin-top:0">Tippe auf eine Zeile, um sie zu vergessen. ' +
        'Beim nächsten Import wird dieser Händler dann wieder neu geraten.</p>' +

      (exakt.length ?
        '<p class="abschnitt-titel">Genaue Händler (' + exakt.length + ')</p><div class="liste">' +
        exakt.map((s) => zeile('exakt', s, Daten.regeln.exakt[s], '')).join('') + '</div>' : '') +

      (stamm.length ?
        '<p class="abschnitt-titel">Sammelregeln (' + stamm.length + ')</p><div class="liste">' +
        stamm.map((s) => {
          const r = Daten.regeln.stamm[s];
          return zeile('stamm', s, r.kat, r.mehrdeutig ? ' · deaktiviert (mehrdeutig)' : ' · alles was so anfängt');
        }).join('') + '</div>' : '') +

      '<div style="height:16px"></div>';

    koerper.querySelectorAll('[data-loesche]').forEach((b) => {
      b.addEventListener('click', () => {
        Regeln.loesche(b.dataset.loesche, b.dataset.s);
        this.zeichne(koerper);
        UI.melde('Zuordnung vergessen');
      });
    });
  }
};

/* ============================================================
   10. CSV-Import
   ============================================================ */

const Import = {

  vorschlaege: [],

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Trade Republic importieren',
      linksText: 'Abbrechen',
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          // Das Dateifeld liegt unsichtbar ueber der gestrichelten Flaeche,
          // damit der Finger direkt darauf tippt. Kein accept-Filter:
          // iOS ordnet CSV-Dateien uneinheitliche Typen zu und blendet
          // sie sonst aus oder liefert die Auswahl nicht zurueck.
          '<div class="datei-halter">' +
            '<div class="datei-knopf">' +
              '<span class="gross">📄</span>' +
              'Datei auswählen<br>' +
              '<span style="font-size:12.5px;color:var(--text-sehrleise)">' +
              'Der Transaktionsexport aus der Trade-Republic-App</span>' +
            '</div>' +
            '<input type="file" id="datei-feld">' +
          '</div>' +
          '<div class="datei-status" id="datei-status"></div>' +

          '<button class="knopf rand" id="text-einfuegen" style="margin-top:14px">' +
            'Klappt nicht? Text einfügen</button>' +

          '<p class="abschnitt-titel">So bekommst du die Datei</p>' +
          '<div class="karte" style="font-size:14px;line-height:1.65;color:var(--text-leise)">' +
            '1. Trade-Republic-App öffnen<br>' +
            '2. Profil → Transaktionen → Export<br>' +
            '3. Zeitraum wählen und anfordern<br>' +
            '4. Die CSV kommt per E-Mail<br>' +
            '5. Anhang antippen → Teilen → <b>„In Dateien sichern"</b><br>' +
            '6. Hier oben auswählen' +
          '</div>' +

          '<p class="hinweis">Liegt die Datei in iCloud Drive und ist noch nicht ' +
            'aufs Gerät geladen (kleines Wolken-Symbol), tippe sie in der Dateien-App ' +
            'einmal an und warte, bis das Symbol verschwindet. Vorher kann Keel sie ' +
            'nicht öffnen.</p>' +

          '<p class="hinweis">Bereits vorhandene Buchungen erkennt Keel automatisch und ' +
            'überspringt sie. Du kannst dieselbe Datei also gefahrlos mehrfach einlesen. ' +
            'Wertpapierkäufe und -verkäufe werden übersprungen, weil sie keine Ausgabe sind – ' +
            'die Ordergebühr wird aber erfasst.</p>';

        const feld = koerper.querySelector('#datei-feld');
        feld.addEventListener('change', (e) => this.dateiGewaehlt(e));

        koerper.querySelector('#text-einfuegen')
          .addEventListener('click', () => this.textEingabe());
      }
    });
  },

  status: function (text, art) {
    const el = document.getElementById('datei-status');
    if (el) {
      el.className = 'datei-status' + (art ? ' ' + art : '');
      el.textContent = text || '';
    }
  },

  dateiGewaehlt: function (e) {
    const datei = e.target.files && e.target.files[0];

    if (!datei) {
      this.status('Es kam keine Datei zurück. Nimm „Text einfügen" weiter unten.', 'fehler');
      return;
    }

    this.status('„' + datei.name + '" wird gelesen (' +
                Math.max(1, Math.round(datei.size / 1024)) + ' KB) …');

    // Zuruecksetzen, damit dieselbe Datei erneut gewaehlt werden kann.
    e.target.value = '';

    this.lies(datei);
  },

  lies: function (datei) {
    const leser = new FileReader();

    leser.onload = () => {
      let text = '';
      try {
        const puffer = leser.result;

        if (typeof puffer === 'string') {
          text = puffer;
        } else {
          text = new TextDecoder('utf-8').decode(puffer);
          // Sind viele Zeichen kaputt, war es kein UTF-8 - dann als
          // Windows-Zeichensatz erneut versuchen (Umlaute!).
          const kaputt = (text.match(/�/g) || []).length;
          if (kaputt > 3) {
            try { text = new TextDecoder('windows-1252').decode(puffer); } catch (x) {}
          }
        }
      } catch (fehler) {
        console.error(fehler);
        this.status('Die Datei konnte nicht entschlüsselt werden.', 'fehler');
        return;
      }

      if (!text.trim()) {
        this.status('Die Datei ist leer. Liegt sie vielleicht noch in iCloud?', 'fehler');
        return;
      }

      this.status('Gelesen: ' + text.split('\n').length + ' Zeilen', 'gut');

      try {
        this.auswerten(text);
      } catch (fehler) {
        console.error(fehler);
        this.status('Die Datei konnte nicht ausgewertet werden: ' + fehler.message, 'fehler');
      }
    };

    leser.onerror = () => {
      this.status('Die Datei ließ sich nicht öffnen. Nimm „Text einfügen".', 'fehler');
    };

    try {
      leser.readAsArrayBuffer(datei);
    } catch (fehler) {
      // Sehr alte Safari-Versionen
      leser.readAsText(datei, 'utf-8');
    }
  },

  // Rueckfallebene: CSV-Inhalt von Hand einsetzen.
  // Funktioniert immer, auch wenn iOS bei der Dateiauswahl zickt.
  textEingabe: function () {
    Blatt.oeffnen({
      titel: 'Text einfügen',
      linksText: 'Zurück',
      rechtsText: 'Auswerten',
      beiRechts: () => {
        const feld = document.getElementById('einfuege-feld');
        const text = feld ? feld.value : '';
        if (!text.trim()) { UI.melde('Da ist noch nichts eingefügt', 'fehler'); return; }
        Blatt.schliessen();
        try {
          this.status('Gelesen: ' + text.split('\n').length + ' Zeilen', 'gut');
          this.auswerten(text);
        } catch (fehler) {
          console.error(fehler);
          this.status('Konnte nicht ausgewertet werden: ' + fehler.message, 'fehler');
        }
      },
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<p class="hinweis" style="margin-top:0">Öffne die CSV-Datei (z. B. direkt ' +
            'im E-Mail-Anhang), markiere alles, kopiere es und füge es hier ein. ' +
            'Die erste Zeile mit den Spaltennamen muss dabei sein.</p>' +
          '<textarea class="einfuege-feld" id="einfuege-feld" ' +
            'placeholder="&quot;datetime&quot;,&quot;date&quot;,&quot;account_type&quot;,…" ' +
            'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>' +
          '<button class="knopf" id="einfuegen-los" style="margin-top:14px">Auswerten</button>' +
          '<div style="height:20px"></div>';

        koerper.querySelector('#einfuegen-los').addEventListener('click', () => {
          const text = koerper.querySelector('#einfuege-feld').value;
          if (!text.trim()) { UI.melde('Da ist noch nichts eingefügt', 'fehler'); return; }
          Blatt.schliessen();
          try {
            this.status('Gelesen: ' + text.split('\n').length + ' Zeilen', 'gut');
            this.auswerten(text);
          } catch (fehler) {
            console.error(fehler);
            this.status('Konnte nicht ausgewertet werden: ' + fehler.message, 'fehler');
          }
        });
      }
    });
  },

  auswerten: function (text) {
    const ids = new Set();
    const hashes = new Set();
    Daten.buchungen.forEach((b) => {
      if (b.trId) ids.add(b.trId);
      if (b.hash) hashes.add(b.hash);
    });

    const ergebnis = TradeRepublic.auswerten(text, ids, hashes);

    if (ergebnis.fehler) {
      this.status(ergebnis.fehler, 'fehler');
      alert(ergebnis.fehler + '\n\nGefundene Spalten:\n' +
            (ergebnis.gefundeneSpalten || []).join(', '));
      return;
    }

    // Kategorie-Vorschlaege setzen
    ergebnis.vorschlaege.forEach((v) => {
      if (v.kategorieId) return;   // Ordergebuehr ist schon gesetzt
      const vs = vorschlagKategorie(v);
      v.kategorieId = vs.kategorieId;
      v.quelleVorschlag = vs.quelle;
    });

    this.vorschlaege = ergebnis.vorschlaege;

    if (!this.vorschlaege.length) {
      Blatt.schliessen();
      UI.melde(ergebnis.duplikate
        ? 'Alles schon vorhanden – ' + ergebnis.duplikate + ' Buchungen übersprungen'
        : 'Keine neuen Buchungen gefunden', 'gut');
      return;
    }

    this.vorschau(ergebnis);
  },

  vorschau: function (ergebnis) {
    Blatt.schliessen();   // Auswahlblatt zu

    Blatt.oeffnen({
      titel: 'Vorschau',
      linksText: 'Abbrechen',
      rechtsText: 'Importieren',
      beiRechts: () => this.uebernehmen(),
      nachOeffnen: (koerper) => {
        koerper.dataset.statistik = JSON.stringify({
          duplikate: ergebnis.duplikate,
          umbuchungen: ergebnis.umbuchungen,
          unlesbar: ergebnis.unlesbar
        });
        this.zeichneVorschau(koerper, ergebnis);
      }
    });
  },

  zeichneVorschau: function (koerper, ergebnis) {
    const gewaehlt = this.vorschlaege.filter((v) => v.gewaehlt).length;

    const kopf =
      '<div class="import-statistik">' +
        '<div><div class="zahl plus">' + this.vorschlaege.length + '</div>' +
          '<div class="txt">neu gefunden</div></div>' +
        '<div><div class="zahl leise">' + ergebnis.duplikate + '</div>' +
          '<div class="txt">schon vorhanden</div></div>' +
        '<div><div class="zahl leise">' + ergebnis.umbuchungen + '</div>' +
          '<div class="txt">Wertpapier<br>übersprungen</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:9px;margin-bottom:14px">' +
        '<button class="knopf zweit" data-alle="an" style="padding:11px;font-size:14px">Alle an</button>' +
        '<button class="knopf zweit" data-alle="aus" style="padding:11px;font-size:14px">Alle aus</button>' +
      '</div>' +
      '<p class="hinweis" style="margin-top:0">Tippe auf eine Kategorie, um sie zu ändern. ' +
        'Keel merkt sich deine Wahl für diesen Händler. ' +
        '<span style="color:var(--akzent)">Türkis</span> = schon gelernt.</p>';

    const zeilen = this.vorschlaege.map((v, i) => {
      const k = kategorie(v.kategorieId) || { name: '—', emoji: '❓' };
      const gelernt = v.quelleVorschlag === 'gelernt';
      return '<div class="import-zeile' + (v.gewaehlt ? '' : ' ab') + '" data-i="' + i + '">' +
        '<div class="haken' + (v.gewaehlt ? ' an' : '') + '" data-haken="' + i + '">✓</div>' +
        '<div class="mitte">' +
          '<div class="titel">' + esc(v.haendler) + '</div>' +
          '<div class="sub">' + esc(datumText(v.datum)) + ' · ' + esc(v.artText) + '</div>' +
        '</div>' +
        '<button class="katknopf' + (gelernt ? ' gelernt' : '') + '" data-katwahl="' + i + '">' +
          esc(k.emoji + ' ' + k.name) + '</button>' +
        '<div class="wert ' + (v.art === 'ausgabe' ? 'minus' : 'plus') + '">' +
          (v.art === 'ausgabe' ? '−' : '+') + geld(v.betragCent) + '</div>' +
      '</div>';
    }).join('');

    koerper.innerHTML = kopf + zeilen + '<div style="height:16px"></div>';

    const rechts = Blatt.rechtsKnopf();
    if (rechts) {
      rechts.textContent = gewaehlt ? 'Import (' + gewaehlt + ')' : 'Importieren';
      rechts.disabled = gewaehlt === 0;
    }

    koerper.querySelectorAll('[data-haken]').forEach((el) => {
      el.addEventListener('click', () => {
        const i = parseInt(el.dataset.haken, 10);
        this.vorschlaege[i].gewaehlt = !this.vorschlaege[i].gewaehlt;
        this.zeichneVorschau(koerper, ergebnis);
      });
    });

    koerper.querySelectorAll('[data-katwahl]').forEach((el) => {
      el.addEventListener('click', () => {
        const i = parseInt(el.dataset.katwahl, 10);
        const v = this.vorschlaege[i];
        Kategorien.waehlen(v.art, v.kategorieId, (neueKat) => {
          // Alle Zeilen desselben Haendlers gleich mitziehen - spart viele Taps.
          this.vorschlaege.forEach((andere) => {
            if (andere.normHaendler && andere.normHaendler === v.normHaendler) {
              andere.kategorieId = neueKat;
              andere.quelleVorschlag = 'gelernt';
            }
          });
          this.zeichneVorschau(koerper, ergebnis);
        });
      });
    });

    koerper.querySelectorAll('[data-alle]').forEach((el) => {
      el.addEventListener('click', () => {
        const an = el.dataset.alle === 'an';
        this.vorschlaege.forEach((v) => { v.gewaehlt = an; });
        this.zeichneVorschau(koerper, ergebnis);
      });
    });
  },

  uebernehmen: function () {
    const zuImportieren = this.vorschlaege.filter((v) => v.gewaehlt);
    if (!zuImportieren.length) return;

    zuImportieren.forEach((v) => {
      Daten.buchungen.push({
        id: neueId('b'),
        typ: v.art,
        betragCent: v.betragCent,
        datum: v.datum,
        kategorieId: v.kategorieId,
        haendler: v.haendler,
        notiz: v.notiz || '',
        wiederkehrend: false,
        quelle: 'csv',
        trId: v.trId || '',
        hash: v.hash,
        normHaendler: v.normHaendler,
        stamm: v.stamm,
        erstellt: Date.now()
      });

      // Lernlogik: einmal zugeordnet, ab jetzt automatisch.
      if (v.normHaendler) Regeln.lerne(v.normHaendler, v.stamm, v.kategorieId);
    });

    sichern();
    this.vorschlaege = [];
    Blatt.alleSchliessen();

    // In den Monat der neuesten importierten Buchung springen.
    const neuestes = zuImportieren.map((v) => v.datum).sort()[zuImportieren.length - 1];
    if (neuestes) UI.zustand.monat = monatVon(neuestes);

    UI.zeichne();
    UI.melde(zuImportieren.length + ' Buchungen importiert', 'gut');
  }
};

/* ============================================================
   11. Backup - Export und Import
   ============================================================ */

/* Wie lange darf das letzte Sichern her sein, bis Keel daran erinnert? */
const BACKUP_TAGE = 7;

const Backup = {

  /* ---------- Erinnerung ---------- */

  // Nach jedem erfolgreichen Sichern. Der Zeitstempel wird bewusst erst
  // danach gesetzt: die Datei selbst traegt noch den vorherigen Stand,
  // und genau das stimmt auch.
  stempeln: function () {
    Daten.einstellungen.letztesBackup = new Date().toISOString();
    sichern();
    UI.zeichne();
  },

  // Tage seit dem letzten Sichern. null heisst: es gab noch keines.
  tageSeit: function () {
    const iso = Daten.einstellungen.letztesBackup;
    if (!iso) return null;
    const dann = new Date(iso).getTime();
    if (!dann || isNaN(dann)) return null;
    return Math.floor((Date.now() - dann) / 86400000);
  },

  // Faellig, wenn noch nie gesichert wurde oder das letzte Mal zu lange her ist.
  faellig: function () {
    const tage = this.tageSeit();
    return tage === null || tage > BACKUP_TAGE;
  },

  // Ist ueberhaupt etwas da, das verloren gehen koennte?
  etwasZuVerlieren: function () {
    return Daten.buchungen.length > 0 ||
           (Daten.vermoegen || []).length > 0 ||
           (Daten.fixkosten || []).length > 0;
  },

  /* Fuer die Startseite: faellig, heute noch nicht weggetippt - und es gibt
     etwas zu sichern. Eine frisch eingerichtete, leere App zu mahnen waere
     genau das Gegenteil von unaufdringlich. */
  bandZeigen: function () {
    return this.faellig() &&
           this.etwasZuVerlieren() &&
           Daten.einstellungen.backupBandTag !== heuteISO();
  },

  bandWeg: function () {
    Daten.einstellungen.backupBandTag = heuteISO();
    sichern();
    UI.zeichne();
  },

  // Klartext fuer die Zeile unter "Daten sichern".
  standText: function () {
    const tage = this.tageSeit();
    if (tage === null) return 'noch nie gesichert';
    if (tage <= 0) return 'zuletzt heute gesichert';
    if (tage === 1) return 'zuletzt gestern gesichert';
    return 'zuletzt vor ' + tage + ' Tagen gesichert';
  },

  /* ---------- Wiederherstellungs-Test ---------- */

  /* Erzeugt intern ein Backup, liest es sofort wieder ein und vergleicht.
     Der echte Datensatz wird dabei nicht angefasst: gerechnet wird
     ausschliesslich auf dem, was aus dem Text zurueckkommt. */
  pruefung: function () {
    const zaehle = (d) => ({
      anzahl: (d.buchungen || []).length,
      summe:  (d.buchungen || []).reduce((s, b) => s + (Number(b.betragCent) || 0), 0)
    });

    const vorher = zaehle(Daten);

    let text;
    try { text = this.inhalt(); }
    catch (e) { return { ok: false, grund: 'Das Backup ließ sich nicht erzeugen.', vorher: vorher }; }

    let roh;
    try { roh = JSON.parse(text); }
    catch (e) { return { ok: false, grund: 'Das erzeugte Backup ist nicht lesbar.', vorher: vorher }; }

    const rein = roh && roh.daten ? roh.daten : roh;
    if (!rein || !Array.isArray(rein.buchungen)) {
      return { ok: false, grund: 'Im Backup fehlen die Buchungen.', vorher: vorher };
    }

    // Der gleiche Weg, den auch das echte Einspielen nimmt. "reparieren"
    // arbeitet auf dem frisch geparsten Objekt, nicht auf "Daten".
    const wieder = Speicher.reparieren(rein);
    const nachher = zaehle(wieder);

    return {
      ok: nachher.anzahl === vorher.anzahl && nachher.summe === vorher.summe,
      vorher: vorher,
      nachher: nachher,
      groesse: text.length
    };
  },

  pruefen: function () {
    const e = this.pruefung();

    Blatt.oeffnen({
      titel: 'Backup prüfen',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => {
        const diffAnzahl = e.nachher ? e.nachher.anzahl - e.vorher.anzahl : 0;
        const diffSumme  = e.nachher ? e.nachher.summe  - e.vorher.summe  : 0;

        koerper.innerHTML =
          '<div class="karte pruef-karte ' + (e.ok ? 'gut' : 'schlecht') + '">' +
            '<div class="pruef-symbol">' + (e.ok ? '✓' : '⚠️') + '</div>' +
            '<div class="pruef-wort">' +
              (e.ok ? 'Backup ist wiederherstellbar' : 'Achtung: Abweichung') +
            '</div>' +
            '<div class="pruef-unter">' +
              (e.ok
                ? 'Ein Backup wurde erzeugt, sofort wieder eingelesen und Stück für ' +
                  'Stück nachgezählt. Alles stimmt überein.'
                : (e.grund || 'Das eingelesene Backup deckt sich nicht mit deinen Daten.')) +
            '</div>' +
          '</div>' +

          (e.nachher
            ? '<div class="liste">' +
                '<div class="listenzeile"><span class="icon">🧾</span>' +
                  '<span class="mitte"><span class="haupt">Buchungen</span>' +
                    '<span class="neben">jetzt ' + e.vorher.anzahl +
                      ' · im Backup ' + e.nachher.anzahl +
                      (diffAnzahl ? ' · ' + (diffAnzahl > 0 ? '+' : '−') +
                        Math.abs(diffAnzahl) + ' Abweichung' : '') + '</span></span>' +
                  '<span class="rechts">' + (diffAnzahl ? '⚠️' : '✓') + '</span></div>' +
                '<div class="listenzeile"><span class="icon">∑</span>' +
                  '<span class="mitte"><span class="haupt">Summe aller Beträge</span>' +
                    '<span class="neben">jetzt ' + geldE(e.vorher.summe) +
                      ' · im Backup ' + geldE(e.nachher.summe) +
                      (diffSumme ? ' · ' + geldE(Math.abs(diffSumme)) + ' Abweichung' : '') +
                    '</span></span>' +
                  '<span class="rechts">' + (diffSumme ? '⚠️' : '✓') + '</span></div>' +
                '<div class="listenzeile"><span class="icon">💾</span>' +
                  '<span class="mitte"><span class="haupt">Umfang der Datei</span>' +
                    '<span class="neben">rund ' + Math.max(1, Math.round(e.groesse / 1024)) +
                      ' KB</span></span></div>' +
              '</div>'
            : '') +

          '<p class="hinweis">Dieser Test hat deine Daten nicht angefasst und nichts ' +
            'gespeichert. Er beweist, dass aus einer Sicherung derselbe Stand ' +
            'zurückkommt — nicht, dass die Datei sicher liegt. Dafür bewahre sie ' +
            'außerhalb des iPhones auf.</p>' +

          (e.ok ? '<button class="knopf" id="p-sichern">Jetzt richtig sichern</button>' : '') +
          '<div style="height:20px"></div>';

        const knopf = koerper.querySelector('#p-sichern');
        if (knopf) {
          knopf.addEventListener('click', () => { Blatt.schliessen(); this.exportieren(); });
        }
      }
    });
  },

  /* ---------- Export und Import ---------- */

  dateiname: function () {
    const d = new Date();
    return 'keel-backup-' + d.getFullYear() +
           String(d.getMonth() + 1).padStart(2, '0') +
           String(d.getDate()).padStart(2, '0') + '-' +
           String(d.getHours()).padStart(2, '0') +
           String(d.getMinutes()).padStart(2, '0') + '.json';
  },

  inhalt: function () {
    return JSON.stringify({
      app: 'Keel',
      appVersion: APP_VERSION,
      exportiertAm: new Date().toISOString(),
      daten: Daten
    }, null, 2);
  },

  exportieren: function () {
    const text = this.inhalt();
    const name = this.dateiname();

    Blatt.oeffnen({
      titel: 'Daten sichern',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<div class="karte" style="text-align:center">' +
            '<div style="font-size:34px;margin-bottom:8px">💾</div>' +
            '<div style="font-size:15px">' + Daten.buchungen.length + ' Buchungen, ' +
              Daten.kategorien.length + ' Kategorien,<br>' + Regeln.anzahl() + ' gelernte Zuordnungen</div>' +
            '<div class="leise" style="font-size:12.5px;margin-top:6px">' + esc(name) + '</div>' +
          '</div>' +
          '<button class="knopf" id="b-datei">Als Datei sichern</button>' +
          '<button class="knopf zweit" id="b-teilen">Teilen / in Dateien ablegen</button>' +
          '<button class="knopf rand" id="b-kopieren">In die Zwischenablage kopieren</button>' +
          '<p class="hinweis" style="margin-top:16px">Auf dem iPhone landet die Datei in ' +
            '„Downloads" oder du wählst über <b>Teilen</b> direkt einen Ort in der ' +
            'Dateien-App oder iCloud Drive. Bewahre die Datei außerhalb des iPhones auf – ' +
            'sonst nützt sie bei einem Gerätewechsel nichts.</p>';

        koerper.querySelector('#b-datei').addEventListener('click', () => {
          const blob = new Blob([text], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
          this.stempeln();
          UI.melde('Backup erstellt', 'gut');
        });

        const teilen = koerper.querySelector('#b-teilen');
        if (navigator.share) {
          teilen.addEventListener('click', async () => {
            try {
              const datei = new File([text], name, { type: 'application/json' });
              if (navigator.canShare && navigator.canShare({ files: [datei] })) {
                await navigator.share({ files: [datei], title: 'Keel Backup' });
              } else {
                await navigator.share({ title: 'Keel Backup', text: text });
              }
              // Erst wenn das Teilen durchgelaufen ist - ein Abbruch landet
              // im catch und zaehlt zu Recht nicht als Sicherung.
              this.stempeln();
            } catch (e) { /* Nutzer hat abgebrochen */ }
          });
        } else {
          teilen.classList.add('versteckt');
        }

        koerper.querySelector('#b-kopieren').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(text);
            this.stempeln();
            UI.melde('In die Zwischenablage kopiert', 'gut');
          } catch (e) {
            UI.melde('Kopieren nicht möglich', 'fehler');
          }
        });
      }
    });
  },

  importieren: function () {
    Blatt.oeffnen({
      titel: 'Backup einspielen',
      linksText: 'Abbrechen',
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<div class="datei-halter">' +
            '<div class="datei-knopf">' +
              '<span class="gross">♻️</span>' +
              'Backup-Datei auswählen<br>' +
              '<span style="font-size:12.5px;color:var(--text-sehrleise)">' +
              'Eine zuvor gesicherte keel-backup-….json</span>' +
            '</div>' +
            '<input type="file" id="j-feld">' +
          '</div>' +
          '<div class="datei-status" id="j-status"></div>' +

          '<button class="knopf rand" id="j-text" style="margin-top:14px">' +
            'Klappt nicht? Text einfügen</button>' +

          '<p class="hinweis" style="margin-top:16px">Achtung: Beim Einspielen werden ' +
            '<b>alle jetzigen Daten ersetzt</b>. Sichere vorher den aktuellen Stand, ' +
            'falls du ihn noch brauchst.</p>';

        const status = (t, art) => {
          const el = koerper.querySelector('#j-status');
          if (el) { el.className = 'datei-status' + (art ? ' ' + art : ''); el.textContent = t; }
        };

        koerper.querySelector('#j-feld').addEventListener('change', (e) => {
          const datei = e.target.files && e.target.files[0];
          if (!datei) { status('Es kam keine Datei zurück. Nimm „Text einfügen".', 'fehler'); return; }
          status('„' + datei.name + '" wird gelesen …');
          e.target.value = '';

          const leser = new FileReader();
          leser.onload = () => {
            const text = String(leser.result || '');
            if (!text.trim()) { status('Die Datei ist leer. Liegt sie noch in iCloud?', 'fehler'); return; }
            this.einspielen(text);
          };
          leser.onerror = () => status('Die Datei ließ sich nicht öffnen.', 'fehler');
          leser.readAsText(datei, 'utf-8');
        });

        koerper.querySelector('#j-text').addEventListener('click', () => {
          Blatt.oeffnen({
            titel: 'Backup einfügen',
            linksText: 'Zurück',
            nachOeffnen: (k2) => {
              k2.innerHTML =
                '<p class="hinweis" style="margin-top:0">Öffne die Backup-Datei, ' +
                  'kopiere den gesamten Inhalt und füge ihn hier ein.</p>' +
                '<textarea class="einfuege-feld" id="j-einfuege" placeholder="{ &quot;app&quot;: &quot;Keel&quot;, … }" ' +
                  'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea>' +
                '<button class="knopf" id="j-los" style="margin-top:14px">Einspielen</button>' +
                '<div style="height:20px"></div>';

              k2.querySelector('#j-los').addEventListener('click', () => {
                const text = k2.querySelector('#j-einfuege').value;
                if (!text.trim()) { UI.melde('Da ist noch nichts eingefügt', 'fehler'); return; }
                Blatt.schliessen();
                this.einspielen(text);
              });
            }
          });
        });
      }
    });
  },

  einspielen: function (text) {
    let roh;
    try { roh = JSON.parse(text); }
    catch (e) { UI.melde('Das ist keine gültige JSON-Datei', 'fehler'); return; }

    // Sowohl das Backup-Format als auch ein blanker Datensatz werden akzeptiert.
    const daten = roh && roh.daten ? roh.daten : roh;
    if (!daten || !Array.isArray(daten.buchungen)) {
      UI.melde('Das sieht nicht nach einem Keel-Backup aus', 'fehler');
      return;
    }

    const anzahl = daten.buchungen.length;
    const frage = 'Backup einspielen?\n\n' + anzahl + ' Buchungen werden geladen.\n' +
                  'Deine jetzigen ' + Daten.buchungen.length + ' Buchungen werden dabei ersetzt.';
    if (!confirm(frage)) return;

    Daten = Speicher.reparieren(daten);
    sichern();
    Blatt.alleSchliessen();
    UI.zustand.monat = monatVon(heuteISO());
    UI.zeige('start');
    UI.melde(anzahl + ' Buchungen wiederhergestellt', 'gut');
  },

  allesLoeschen: function () {
    if (!confirm('Wirklich ALLE Daten löschen?\n\nBuchungen, Kategorien und gelernte ' +
                 'Zuordnungen werden entfernt. Das lässt sich nur über ein Backup rückgängig machen.')) return;
    if (!confirm('Letzte Sicherheitsfrage: endgültig löschen?')) return;

    Daten = Speicher.leer();
    sichern();
    UI.zeige('start');
    UI.melde('Alle Daten gelöscht');
  }
};

/* ============================================================
   12. Start
   ============================================================ */

function starten() {

  // --- Untere Navigation aufbauen ---
  const nav = document.querySelector('.nav');
  nav.addEventListener('click', (e) => {
    const knopf = e.target.closest('button');
    if (!knopf) return;

    // Der runde Knopf in der Mitte ist kein Reiter: er oeffnet direkt die
    // vorhandene Schnellerfassung.
    if (knopf.dataset.erfassen) { Erfassung.oeffnen(null); return; }

    if (!knopf.dataset.schirm) return;
    UI.zeige(knopf.dataset.schirm);
  });

  // --- Alles im Schirm ueber einen Zuhoerer abwickeln ---
  const schirm = document.getElementById('schirm');

  schirm.addEventListener('click', (e) => {
    const tu = e.target.closest('[data-tu]');
    if (tu) {
      const was = tu.dataset.tu;
      if (was === 'monat-zurueck') { UI.zustand.monat = monatVerschieben(UI.zustand.monat, -1); UI.zeichne(); }
      else if (was === 'monat-vor') { UI.zustand.monat = monatVerschieben(UI.zustand.monat, 1); UI.zeichne(); }
      else if (was === 'monat-heute') { UI.zustand.monat = monatVon(heuteISO()); UI.zeichne(); }
      else if (was === 'import') Import.oeffnen();
      else if (was === 'kategorien') Kategorien.oeffnen();
      else if (was === 'regeln') RegelSchirm.oeffnen();
      else if (was === 'fixkosten') Fixkosten.oeffnen();
      else if (was === 'budgets') Budgets.oeffnen();
      else if (was === 'kredit') Kredit.oeffnen();
      else if (was === 'sparen') Sparen.oeffnen();
      else if (was === 'einstellungen') Einstellungen.oeffnen();
      else if (was === 'neue-buchung') Erfassung.oeffnen(null);
      else if (was === 'nulltag') Zaehler.nullTagEintragen();
      else if (was === 'vermoegen-neu') Vermoegen.bearbeiten(null);
      else if (was === 'vermoegen-posten') Vermoegen.bearbeiten(tu.dataset.id);
      else if (was === 'liste-ausgaben')  { UI.zustand.listenArt = 'ausgabe';  UI.zeige('liste'); }
      else if (was === 'liste-einnahmen') { UI.zustand.listenArt = 'einnahme'; UI.zeige('liste'); }
      else if (was === 'zurueck-einaus')  UI.zeige('einaus');
      else if (was.indexOf('zeitraum') === 0) { /* siehe unten */ }
      else if (was === 'export') Backup.exportieren();
      else if (was === 'import-json') Backup.importieren();
      else if (was === 'backup-pruefen') Backup.pruefen();
      else if (was === 'backup-band-weg') Backup.bandWeg();
      else if (was === 'alles-loeschen') Backup.allesLoeschen();
      return;
    }

    const zeitraum = e.target.closest('[data-zeitraum]');
    if (zeitraum) {
      Start.zeitraum = parseInt(zeitraum.dataset.zeitraum, 10) || 1;
      UI.zeichne();
      return;
    }

    const buchung = e.target.closest('[data-buchung]');
    if (buchung) Erfassung.oeffnen(buchung.dataset.buchung);
  });

  // Suchfeld (wird bei jedem Neuzeichnen neu erzeugt -> Delegation)
  schirm.addEventListener('input', (e) => {
    if (e.target.id !== 'suchfeld') return;
    UI.zustand.suche = e.target.value;
    const pos = e.target.selectionStart;
    UI.zeichne();
    const neu = document.getElementById('suchfeld');
    if (neu) { neu.focus(); try { neu.setSelectionRange(pos, pos); } catch (x) {} }
  });

  UI.zeichne();

  // --- Service Worker fuer den Offline-Betrieb ---
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .catch((e) => console.warn('Service Worker nicht registriert:', e));
    });
  }
}

document.addEventListener('DOMContentLoaded', starten);
