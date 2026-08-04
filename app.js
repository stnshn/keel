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

const BALKEN_FARBEN = [
  '#2DD4BF', '#60A5FA', '#A78BFA', '#F472B6', '#FBBF24',
  '#34D399', '#FB923C', '#22D3EE', '#C084FC', '#F87171'
];

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
      version: 1,
      erstellt: new Date().toISOString(),
      buchungen: [],
      kategorien: STANDARD_KATEGORIEN.map((k) => Object.assign({}, k)),
      regeln: { exakt: {}, stamm: {} },
      einstellungen: {}
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

    // Die System-Kategorie "Umbuchung" muss immer existieren.
    if (!d.kategorien.some((k) => k.id === 'umbuchung')) {
      d.kategorien.push(Object.assign({}, STANDARD_KATEGORIEN[STANDARD_KATEGORIEN.length - 1]));
    }

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

function kategorienNach(typ) {
  return Daten.kategorien.filter((k) => k.typ === typ);
}

function katFarbe(id) {
  const i = Daten.kategorien.findIndex((k) => k.id === id);
  return BALKEN_FARBEN[(i < 0 ? 0 : i) % BALKEN_FARBEN.length];
}

// Buchungen, die in Summen mitzaehlen (Umbuchungen fliegen raus).
function zaehltMit(b) {
  const k = kategorie(b.kategorieId);
  return !(k && k.ausBilanz);
}

function buchungenImMonat(monat, art) {
  return Daten.buchungen.filter((b) =>
    monatVon(b.datum) === monat && (!art || b.typ === art)
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
  const gelernt = Regeln.finde(v.normHaendler, v.stamm);
  if (gelernt && kategorie(gelernt.kategorieId)) {
    return { kategorieId: gelernt.kategorieId, quelle: 'gelernt' };
  }

  if (v.artText === 'Zinsen')   return { kategorieId: 'zinsen',   quelle: 'fest' };
  if (v.artText === 'Saveback') return { kategorieId: 'cashback', quelle: 'fest' };

  // Nur Kategorien vorschlagen, die zur Buchungsart passen.
  const passt = (id) => {
    const k = kategorie(id);
    return k && (k.typ === v.art || k.typ === 'neutral') ? id : null;
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
  return { kategorieId: kategorie(rueckfall) ? rueckfall : (kategorienNach(v.art)[0] || {}).id, quelle: 'rueckfall' };
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
    schirm: 'uebersicht',
    monat: monatVon(heuteISO()),
    suche: ''
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

    if (s === 'uebersicht')      ziel.innerHTML = this.uebersicht();
    else if (s === 'ausgaben')   ziel.innerHTML = this.buchungsListe('ausgabe');
    else if (s === 'einnahmen')  ziel.innerHTML = this.buchungsListe('einnahme');
    else if (s === 'mehr')       ziel.innerHTML = this.mehr();

    document.querySelectorAll('.nav button[data-schirm]').forEach((b) => {
      b.classList.toggle('an', b.dataset.schirm === s);
    });
  },

  /* ---------- Monatswaehler ---------- */

  monatswahlHtml: function () {
    return '<div class="monatswahl">' +
      '<button class="pfeil" data-tu="monat-zurueck" aria-label="Vorheriger Monat">‹</button>' +
      '<button class="aktuell" data-tu="monat-heute">' + esc(monatText(this.zustand.monat)) + '</button>' +
      '<button class="pfeil" data-tu="monat-vor" aria-label="Nächster Monat">›</button>' +
    '</div>';
  },

  /* ---------- Schirm: Übersicht ---------- */

  uebersicht: function () {
    const monat = this.zustand.monat;
    const ein = buchungenImMonat(monat, 'einnahme');
    const aus = buchungenImMonat(monat, 'ausgabe');
    const summeEin = summe(ein);
    const summeAus = summe(aus);
    const saldo = summeEin - summeAus;

    // Vergleich mit dem Vormonat
    const vormonat = monatVerschieben(monat, -1);
    const summeAusVor = summe(buchungenImMonat(vormonat, 'ausgabe'));
    let vergleich = '';
    if (summeAusVor > 0) {
      const diff = summeAus - summeAusVor;
      const prozent = Math.round((diff / summeAusVor) * 100);
      const hoch = diff > 0;
      vergleich =
        '<div class="karte" style="display:flex;align-items:center;gap:12px">' +
          '<div style="font-size:22px">' + (hoch ? '📈' : '📉') + '</div>' +
          '<div style="flex:1;font-size:14px;line-height:1.45">' +
            'Ausgaben ' + (hoch ? '<span class="minus">' : '<span class="plus">') +
            (hoch ? '+' : '') + prozent + '&nbsp;%</span> gegenüber ' + esc(monatText(vormonat)) +
            '<div class="leise" style="font-size:12.5px">damals ' + geldE(summeAusVor) + '</div>' +
          '</div>' +
        '</div>';
    }

    // Auswertung pro Kategorie
    const proKat = {};
    aus.forEach((b) => {
      if (!zaehltMit(b)) return;
      proKat[b.kategorieId] = (proKat[b.kategorieId] || 0) + b.betragCent;
    });
    const katListe = Object.keys(proKat)
      .map((id) => ({ id: id, cent: proKat[id] }))
      .sort((a, b) => b.cent - a.cent);

    let katHtml = '';
    if (katListe.length) {
      const groesste = katListe[0].cent;
      katHtml = '<div class="karte"><p class="karte-titel">Ausgaben nach Kategorie</p>' +
        katListe.map((e) => {
          const k = kategorie(e.id) || { name: 'Unbekannt', emoji: '❓' };
          const anteil = summeAus > 0 ? Math.round((e.cent / summeAus) * 100) : 0;
          const breite = groesste > 0 ? Math.max(3, Math.round((e.cent / groesste) * 100)) : 0;
          return '<div class="kat-zeile">' +
            '<div class="kat-kopf">' +
              '<span class="emoji">' + esc(k.emoji) + '</span>' +
              '<span class="name">' + esc(k.name) + '</span>' +
              '<span class="betrag">' + geldE(e.cent) + '</span>' +
              '<span class="anteil">' + anteil + '%</span>' +
            '</div>' +
            '<div class="balken"><i style="width:' + breite + '%;background:' + katFarbe(e.id) + '"></i></div>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    // Letzte Buchungen
    const letzte = Daten.buchungen
      .slice()
      .sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : (b.erstellt || 0) - (a.erstellt || 0)))
      .slice(0, 6);

    let letzteHtml = '';
    if (letzte.length) {
      letzteHtml = '<p class="abschnitt-titel">Zuletzt erfasst</p>' +
        letzte.map((b) => this.buchungHtml(b)).join('');
    }

    const anzahl = ein.length + aus.length;
    const leer = anzahl === 0 ?
      '<div class="leer-hinweis"><span class="gross">🌱</span>' +
      'Für ' + esc(monatText(monat)) + ' ist noch nichts erfasst.<br>' +
      'Tippe unten auf <b>+</b> oder importiere deinen Trade-Republic-Auszug unter <b>Mehr</b>.</div>' : '';

    return '<div class="kopf">' +
        '<h1>Übersicht</h1>' +
        '<div class="unterzeile">' + anzahl + ' Buchung' + (anzahl === 1 ? '' : 'en') + ' in diesem Monat</div>' +
        this.monatswahlHtml() +
      '</div>' +
      '<div class="inhalt">' +
        '<div class="karte saldo-karte">' +
          '<div class="saldo-wert ' + (saldo >= 0 ? 'plus' : 'minus') + '">' + geldE(saldo, true) + '</div>' +
          '<div class="saldo-label">Saldo ' + esc(monatText(monat)) + '</div>' +
        '</div>' +
        '<div class="zwei-spalten" style="margin-bottom:14px">' +
          '<div class="mini-karte"><div class="label">↓ Einnahmen</div>' +
            '<div class="wert plus">' + geldE(summeEin) + '</div></div>' +
          '<div class="mini-karte"><div class="label">↑ Ausgaben</div>' +
            '<div class="wert minus">' + geldE(summeAus) + '</div></div>' +
        '</div>' +
        vergleich +
        katHtml +
        letzteHtml +
        leer +
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
    const anzahlKat = Daten.kategorien.length;
    const anzahlRegeln = Regeln.anzahl();

    return '<div class="kopf"><h1>Mehr</h1>' +
        '<div class="unterzeile">' + anzahl + ' Buchungen insgesamt</div></div>' +
      '<div class="inhalt">' +

        '<p class="abschnitt-titel">Erfassen</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="import">' +
            '<span class="icon">📥</span>' +
            '<span class="mitte"><span class="haupt">Trade Republic importieren</span>' +
            '<span class="neben">CSV-Kontoauszug einlesen</span></span>' +
            '<span class="chevron">›</span></button>' +
        '</div>' +

        '<p class="abschnitt-titel">Verwalten</p>' +
        '<div class="liste">' +
          '<button class="listenzeile" data-tu="kategorien">' +
            '<span class="icon">🏷️</span>' +
            '<span class="mitte"><span class="haupt">Kategorien</span>' +
            '<span class="neben">' + anzahlKat + ' angelegt</span></span>' +
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
            '<span class="neben">Als JSON-Datei herunterladen</span></span>' +
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
      stamm: vorhanden.stamm || ''
    } : {
      bearbeiten: null,
      typ: 'ausgabe',
      centText: '',
      kategorieId: null,
      datum: heuteISO(),
      haendler: '',
      notiz: '',
      wiederkehrend: false,
      normHaendler: '',
      stamm: ''
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
      }
    });
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
        z.kategorieId = null;
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
    anzeige.className = 'betrag-anzeige ' + (z.typ === 'ausgabe' ? 'aus' : 'ein');
    if (!z.centText) {
      anzeige.innerHTML = '<span class="grau">0,00 €</span>';
    } else {
      anzeige.textContent = (z.typ === 'ausgabe' ? '−' : '+') + geld(cent) + ' €';
    }

    // Kategorien: haeufigste zuerst
    const nutzung = {};
    Daten.buchungen.forEach((b) => { nutzung[b.kategorieId] = (nutzung[b.kategorieId] || 0) + 1; });

    const liste = Daten.kategorien
      .filter((k) => k.typ === z.typ || k.typ === 'neutral')
      .sort((a, b) => {
        if (a.typ === 'neutral' && b.typ !== 'neutral') return 1;
        if (b.typ === 'neutral' && a.typ !== 'neutral') return -1;
        return (nutzung[b.id] || 0) - (nutzung[a.id] || 0);
      });

    const gitter = koerper.querySelector('#kat-gitter');
    gitter.innerHTML = liste.map((k) =>
      '<button class="kat-kachel' + (k.id === z.kategorieId ? ' an' : '') + '" data-kat="' + esc(k.id) + '">' +
        '<span class="emoji">' + esc(k.emoji) + '</span>' +
        '<span class="name">' + esc(k.name) + '</span>' +
      '</button>'
    ).join('');

    gitter.querySelectorAll('[data-kat]').forEach((b) => {
      b.addEventListener('click', () => {
        z.kategorieId = b.dataset.kat;
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

    // Sichern-Knopf aktiv?
    const bereit = cent > 0 && !!z.kategorieId;
    const rechts = Blatt.rechtsKnopf();
    if (rechts) rechts.disabled = !bereit;
    const knopf = koerper.querySelector('#knopf-speichern');
    if (knopf) knopf.disabled = !bereit;
  },

  speichern: function () {
    const z = this.zustand;
    const cent = parseInt(z.centText || '0', 10);

    if (cent <= 0)      { UI.melde('Bitte einen Betrag eingeben', 'fehler'); return; }
    if (!z.kategorieId) { UI.melde('Bitte eine Kategorie wählen', 'fehler'); return; }

    const haendler = z.haendler.trim();

    if (z.bearbeiten) {
      const b = Daten.buchungen.find((x) => x.id === z.bearbeiten);
      if (b) {
        b.typ = z.typ;
        b.betragCent = cent;
        b.kategorieId = z.kategorieId;
        b.datum = z.datum;
        b.haendler = haendler;
        b.notiz = z.notiz.trim();
        b.wiederkehrend = z.typ === 'einnahme' ? z.wiederkehrend : false;

        // Wenn die Buchung aus einem Import stammt und die Kategorie geaendert
        // wurde: Regel nachziehen, damit es beim naechsten Mal stimmt.
        if (b.normHaendler) Regeln.lerne(b.normHaendler, b.stamm, z.kategorieId);
      }
    } else {
      const norm = haendler ? TradeRepublic.normalisiere(haendler) : '';
      Daten.buchungen.push({
        id: neueId('b'),
        typ: z.typ,
        betragCent: cent,
        datum: z.datum,
        kategorieId: z.kategorieId,
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
      if (norm) Regeln.lerne(norm, TradeRepublic.stamm(norm), z.kategorieId);
    }

    sichern();
    Blatt.schliessen();

    // Damit die neue Buchung auch sichtbar ist, springt die Ansicht in ihren Monat.
    UI.zustand.monat = monatVon(z.datum);
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
      beiRechts: () => this.bearbeiten(null),
      nachOeffnen: (koerper) => { this.zeichne(koerper); }
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const nutzung = {};
    Daten.buchungen.forEach((b) => { nutzung[b.kategorieId] = (nutzung[b.kategorieId] || 0) + 1; });

    const gruppe = (typ, titel) => {
      const liste = Daten.kategorien.filter((k) => k.typ === typ);
      if (!liste.length) return '';
      return '<p class="abschnitt-titel">' + titel + '</p><div class="liste">' +
        liste.map((k) =>
          '<button class="listenzeile" data-kat="' + esc(k.id) + '">' +
            '<span class="icon">' + esc(k.emoji) + '</span>' +
            '<span class="mitte"><span class="haupt">' + esc(k.name) + '</span>' +
              '<span class="neben">' + (nutzung[k.id] || 0) + ' Buchungen' +
              (k.system ? ' · zählt nicht in die Bilanz' : '') + '</span></span>' +
            '<span class="chevron">›</span>' +
          '</button>').join('') +
      '</div>';
    };

    koerper.innerHTML =
      gruppe('ausgabe', 'Ausgaben') +
      gruppe('einnahme', 'Einnahmen') +
      gruppe('neutral', 'Neutral') +
      '<p class="hinweis">Beim Löschen einer Kategorie werden die zugehörigen Buchungen ' +
      'nicht gelöscht, sondern nach „Sonstiges" verschoben.</p><div style="height:12px"></div>';

    koerper.querySelectorAll('[data-kat]').forEach((b) => {
      b.addEventListener('click', () => this.bearbeiten(b.dataset.kat));
    });
  },

  bearbeiten: function (katId) {
    const vorhanden = katId ? kategorie(katId) : null;
    const z = vorhanden ? Object.assign({}, vorhanden) :
              { id: null, name: '', emoji: '🏷️', typ: 'ausgabe' };

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

      const doppelt = Daten.kategorien.some((k) =>
        k.id !== z.id && k.name.toLowerCase() === name.toLowerCase());
      if (doppelt) { UI.melde('Diese Kategorie gibt es schon', 'fehler'); return; }

      if (z.id) {
        const k = kategorie(z.id);
        k.name = name;
        k.emoji = z.emoji;
        if (!k.system) k.typ = z.typ;
      } else {
        Daten.kategorien.push({
          id: neueId('k'), name: name, emoji: z.emoji, typ: z.typ, ausBilanz: false, system: false
        });
      }
      sichern();
      Blatt.schliessen();
      Kategorien.zeichne();
      UI.zeichne();
      UI.melde('Gespeichert', 'gut');
    }
  },

  // Kleiner Auswahl-Dialog, den der Import benutzt.
  waehlen: function (art, aktuell, beiWahl) {
    const liste = Daten.kategorien.filter((k) => k.typ === art || k.typ === 'neutral');
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
          '<button class="datei-knopf" id="datei-waehlen">' +
            '<span class="gross">📄</span>' +
            'CSV-Datei auswählen<br>' +
            '<span style="font-size:12.5px;color:var(--text-sehrleise)">' +
            'Der Transaktionsexport aus der Trade-Republic-App</span>' +
          '</button>' +
          '<input type="file" id="datei-feld" accept=".csv,text/csv,text/plain" class="versteckt">' +

          '<p class="abschnitt-titel">So bekommst du die Datei</p>' +
          '<div class="karte" style="font-size:14px;line-height:1.65;color:var(--text-leise)">' +
            '1. Trade-Republic-App öffnen<br>' +
            '2. Profil → Transaktionen → Export<br>' +
            '3. Zeitraum wählen und anfordern<br>' +
            '4. Die CSV kommt per E-Mail<br>' +
            '5. Auf dem iPhone in „Dateien" sichern und hier auswählen' +
          '</div>' +

          '<p class="hinweis">Bereits vorhandene Buchungen erkennt Keel automatisch und ' +
            'überspringt sie. Du kannst dieselbe Datei also gefahrlos mehrfach einlesen. ' +
            'Wertpapierkäufe und -verkäufe werden übersprungen, weil sie keine Ausgabe sind – ' +
            'die Ordergebühr wird aber erfasst.</p>';

        const feld = koerper.querySelector('#datei-feld');
        koerper.querySelector('#datei-waehlen').addEventListener('click', () => feld.click());
        feld.addEventListener('change', (e) => {
          const datei = e.target.files && e.target.files[0];
          if (datei) this.lies(datei);
        });
      }
    });
  },

  lies: function (datei) {
    const leser = new FileReader();
    leser.onload = () => {
      try {
        this.auswerten(String(leser.result || ''));
      } catch (fehler) {
        console.error(fehler);
        UI.melde('Die Datei konnte nicht gelesen werden', 'fehler');
      }
    };
    leser.onerror = () => UI.melde('Die Datei konnte nicht geöffnet werden', 'fehler');
    leser.readAsText(datei, 'utf-8');
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

const Backup = {

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
            } catch (e) { /* Nutzer hat abgebrochen */ }
          });
        } else {
          teilen.classList.add('versteckt');
        }

        koerper.querySelector('#b-kopieren').addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(text);
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
          '<button class="datei-knopf" id="j-waehlen">' +
            '<span class="gross">♻️</span>' +
            'Backup-Datei auswählen<br>' +
            '<span style="font-size:12.5px;color:var(--text-sehrleise)">' +
            'Eine zuvor gesicherte keel-backup-….json</span>' +
          '</button>' +
          '<input type="file" id="j-feld" accept=".json,application/json" class="versteckt">' +
          '<p class="hinweis" style="margin-top:16px">Achtung: Beim Einspielen werden ' +
            '<b>alle jetzigen Daten ersetzt</b>. Sichere vorher den aktuellen Stand, ' +
            'falls du ihn noch brauchst.</p>';

        const feld = koerper.querySelector('#j-feld');
        koerper.querySelector('#j-waehlen').addEventListener('click', () => feld.click());
        feld.addEventListener('change', (e) => {
          const datei = e.target.files && e.target.files[0];
          if (!datei) return;
          const leser = new FileReader();
          leser.onload = () => this.einspielen(String(leser.result || ''));
          leser.onerror = () => UI.melde('Datei konnte nicht gelesen werden', 'fehler');
          leser.readAsText(datei, 'utf-8');
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
    UI.zeige('uebersicht');
    UI.melde(anzahl + ' Buchungen wiederhergestellt', 'gut');
  },

  allesLoeschen: function () {
    if (!confirm('Wirklich ALLE Daten löschen?\n\nBuchungen, Kategorien und gelernte ' +
                 'Zuordnungen werden entfernt. Das lässt sich nur über ein Backup rückgängig machen.')) return;
    if (!confirm('Letzte Sicherheitsfrage: endgültig löschen?')) return;

    Daten = Speicher.leer();
    sichern();
    UI.zeige('uebersicht');
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
    if (knopf.classList.contains('fab')) { Erfassung.oeffnen(null); return; }
    if (knopf.dataset.schirm) UI.zeige(knopf.dataset.schirm);
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
      else if (was === 'export') Backup.exportieren();
      else if (was === 'import-json') Backup.importieren();
      else if (was === 'alles-loeschen') Backup.allesLoeschen();
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
