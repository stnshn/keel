/* ============================================================
   Keel - Phase 2
   Fixkosten · Budgets · Vermögen · Kredit
   ============================================================
   Reines JavaScript, keine Bibliotheken. Die Diagramme sind
   handgezeichnetes SVG.
   ============================================================ */

'use strict';

/* ============================================================
   Diagrammfarben
   ============================================================
   Bewusst NICHT die UI-Akzentfarbe: Für Diagrammflächen im
   Dunkelmodus ist ein engeres Helligkeitsband vorgeschrieben
   (OKLCH L zwischen 0,48 und 0,67). Die hellere Akzentfarbe
   der Knöpfe würde darin blenden.

   Statusfarben tragen NIE allein die Aussage - es steht immer
   ein Symbol und ein Wort daneben. Rot und Gelb sind bei
   Rot-Grün-Sehschwäche kaum zu unterscheiden.
   ============================================================ */

const DIAGRAMM = {
  vermoegen: '#00A997',   // Verlauf Vermögen
  kredit:    '#3292FF',   // Verlauf Restschuld
  serie:     '#00A997',   // einzelne Datenreihe, z. B. Kategorie-Balken
  gitter:    '#263241',   // Hilfslinien, eine Stufe von der Fläche entfernt
  flaeche:   '#171F29'    // Kartenfläche, für Ringe und Lücken
};

const STATUS = {
  gut:     { farbe: '#00AD79', symbol: '✓', wort: 'im Rahmen' },
  eng:     { farbe: '#B98A00', symbol: '!', wort: 'wird eng' },
  drueber: { farbe: '#FF3E4D', symbol: '✕', wort: 'überschritten' }
};

function budgetStatus(anteil) {
  if (anteil > 1)    return STATUS.drueber;
  if (anteil >= 0.8) return STATUS.eng;
  return STATUS.gut;
}

/* ============================================================
   Verlaufsdiagramm
   ============================================================ */

const Diagramm = {

  zaehler: 0,

  // punkte: [{ datum: 'JJJJ-MM-TT', cent: 123456 }]  (aufsteigend sortiert)
  verlauf: function (punkte, farbe, o) {
    o = o || {};
    if (!punkte || punkte.length === 0) return '';

    const id = 'dg' + (++this.zaehler);
    const B = 320, H = 176;
    const links = 46, rechts = 10, oben = 14, unten = 42;   // unten traegt die Datumsbeschriftung
    const pb = B - links - rechts;
    const ph = H - oben - unten;

    // --- Wertebereich mit runden Achsenwerten ---
    const werte = punkte.map((p) => p.cent);
    let min = Math.min.apply(null, werte);
    let max = Math.max.apply(null, werte);
    if (min === max) { min = min - Math.abs(min || 100) * 0.1 - 100; max = max + Math.abs(max || 100) * 0.1 + 100; }
    if (min > 0 && (max - min) / max > 0.55) min = 0;        // Nulllinie zeigen, wenn sie nah ist
    const spanne = max - min;
    let schritt = this.rundeSchritt(spanne / 3);
    let achseMin = Math.floor(min / schritt) * schritt;
    let achseMax = Math.ceil(max / schritt) * schritt;
    // Die Beschriftung läuft in ganzen Schritten - sonst stehen
    // krumme Zwischenwerte wie "6,3k" an der Achse.
    while ((achseMax - achseMin) / schritt > 5) {
      schritt *= 2;
      achseMin = Math.floor(min / schritt) * schritt;
      achseMax = Math.ceil(max / schritt) * schritt;
    }
    const achseSpanne = (achseMax - achseMin) || 1;

    // --- Zeitachse ---
    const zeit = punkte.map((p) => new Date(p.datum + 'T12:00:00').getTime());
    const t0 = zeit[0], t1 = zeit[zeit.length - 1];
    const tSpanne = (t1 - t0) || 1;

    const x = (i) => punkte.length === 1 ? links + pb : links + ((zeit[i] - t0) / tSpanne) * pb;
    const y = (c) => oben + ph - ((c - achseMin) / achseSpanne) * ph;

    // --- Hilfslinien: durchgezogene Haarlinien, zurückhaltend ---
    let gitter = '';
    const anzahlLinien = Math.round(achseSpanne / schritt);
    for (let i = 0; i <= anzahlLinien; i++) {
      const wert = achseMin + schritt * i;
      const yy = y(wert);
      gitter +=
        '<line x1="' + links + '" y1="' + yy.toFixed(1) + '" x2="' + (B - rechts) + '" y2="' + yy.toFixed(1) +
          '" stroke="' + DIAGRAMM.gitter + '" stroke-width="1"/>' +
        '<text x="' + (links - 7) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" ' +
          'class="dg-achse">' + esc(this.kurzGeld(wert)) + '</text>';
    }

    // --- Linie und Fläche ---
    const pfad = punkte.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.cent).toFixed(1)).join(' ');
    const flaeche = punkte.length > 1
      ? '<path d="' + pfad + ' L' + x(punkte.length - 1).toFixed(1) + ' ' + (oben + ph) +
        ' L' + x(0).toFixed(1) + ' ' + (oben + ph) + ' Z" fill="' + farbe + '" fill-opacity="0.1"/>'
      : '';
    const linie = punkte.length > 1
      ? '<path d="' + pfad + '" fill="none" stroke="' + farbe + '" stroke-width="2" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>'
      : '';

    // --- Endpunkt: Ring in Flächenfarbe, damit er über der Linie lesbar bleibt ---
    const letzterX = x(punkte.length - 1), letzterY = y(punkte[punkte.length - 1].cent);
    const endpunkt =
      '<circle cx="' + letzterX.toFixed(1) + '" cy="' + letzterY.toFixed(1) + '" r="4.5" ' +
        'fill="' + farbe + '" stroke="' + DIAGRAMM.flaeche + '" stroke-width="2"/>';

    // --- Nur den Endwert beschriften, nicht jeden Punkt ---
    const endText = geld(punkte[punkte.length - 1].cent) + ' €';
    const textAnker = letzterX > B - 80 ? 'end' : 'start';
    const textX = textAnker === 'end' ? letzterX - 9 : letzterX + 9;
    const endLabel =
      '<text x="' + textX.toFixed(1) + '" y="' + (letzterY - 10).toFixed(1) + '" ' +
        'text-anchor="' + textAnker + '" class="dg-endwert">' + esc(endText) + '</text>';

    // --- Datumsbeschriftung: nur erster und letzter Punkt ---
    let datumText2 = '';
    if (punkte.length > 1) {
      datumText2 =
        '<text x="' + links + '" y="' + (H - 22) + '" text-anchor="start" class="dg-achse">' +
          esc(this.kurzDatum(punkte[0].datum)) + '</text>' +
        '<text x="' + (B - rechts) + '" y="' + (H - 22) + '" text-anchor="end" class="dg-achse">' +
          esc(this.kurzDatum(punkte[punkte.length - 1].datum)) + '</text>';
    }

    // --- Antippbare Flächen: großzügige Trefferbereiche, nicht die 9px-Punkte ---
    let treffer = '';
    punkte.forEach((p, i) => {
      const xi = x(i);
      const vor = i === 0 ? links : (x(i - 1) + xi) / 2;
      const nach = i === punkte.length - 1 ? B - rechts : (xi + x(i + 1)) / 2;
      treffer += '<rect x="' + vor.toFixed(1) + '" y="' + oben + '" width="' + Math.max(1, nach - vor).toFixed(1) +
        '" height="' + ph + '" fill="transparent" data-punkt="' + i + '" ' +
        'data-wert="' + esc(datumText(p.datum) + ' · ' + geld(p.cent) + ' €') + '"/>';
    });

    return '<div class="dg-halter">' +
      '<div class="dg-ablesung" id="' + id + '-ablesung">&nbsp;</div>' +
      '<svg viewBox="0 0 ' + B + ' ' + H + '" class="dg-svg" id="' + id + '" ' +
        'role="img" aria-label="' + esc(o.titel || 'Verlauf') + '">' +
        gitter + flaeche + linie + endpunkt + endLabel + datumText2 + treffer +
      '</svg></div>';
  },

  // Verdrahtet das Antippen. Nach dem Einfügen ins Dokument aufrufen.
  verdrahte: function (wurzel) {
    (wurzel || document).querySelectorAll('.dg-svg').forEach((svg) => {
      const ablesung = document.getElementById(svg.id + '-ablesung');
      if (!ablesung) return;
      const zeigen = (e) => {
        const ziel = e.target.closest('[data-wert]');
        if (ziel) ablesung.textContent = ziel.dataset.wert;
      };
      svg.addEventListener('pointerdown', zeigen);
      svg.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') zeigen(e); });
      svg.addEventListener('pointerleave', () => { ablesung.innerHTML = '&nbsp;'; });
    });
  },

  rundeSchritt: function (roh) {
    if (roh <= 0) return 100;
    const gr = Math.pow(10, Math.floor(Math.log10(roh)));
    const rest = roh / gr;
    const faktor = rest <= 1 ? 1 : rest <= 2 ? 2 : rest <= 5 ? 5 : 10;
    return faktor * gr;
  },

  kurzGeld: function (cent) {
    const euro = cent / 100;
    const abs = Math.abs(euro);
    if (abs >= 1000000) return (euro / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1).replace('.', ',') + ' Mio';
    if (abs >= 1000)    return (euro / 1000).toFixed(abs % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k';
    return String(Math.round(euro));
  },

  kurzDatum: function (iso) {
    return iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(2, 4);
  }
};

/* ============================================================
   Fixkosten
   ============================================================
   Bewusste Entscheidung: Fixkosten erzeugen KEINE Buchungen.
   Die echten Abbuchungen kommen ohnehin über den CSV-Import.
   Automatisch erzeugte Buchungen würden alles doppelt zählen.
   Die Fixkostenliste ist eine Planungsübersicht - und gleicht
   ab, was diesen Monat schon tatsächlich abgebucht wurde.
   ============================================================ */

const INTERVALLE = {
  monat:    { name: 'monatlich',      monate: 1 },
  quartal:  { name: 'vierteljährlich', monate: 3 },
  halbjahr: { name: 'halbjährlich',   monate: 6 },
  jahr:     { name: 'jährlich',       monate: 12 }
};

const Fixkosten = {

  monatsAnteil: function (fk) {
    const iv = INTERVALLE[fk.intervall] || INTERVALLE.monat;
    return Math.round(fk.betragCent / iv.monate);
  },

  monatsSumme: function () {
    return (Daten.fixkosten || []).filter((f) => f.aktiv !== false)
      .reduce((s, f) => s + this.monatsAnteil(f), 0);
  },

  // Faellt dieser Posten im angegebenen Monat an?
  faelligImMonat: function (fk, monat) {
    const iv = INTERVALLE[fk.intervall] || INTERVALLE.monat;
    if (iv.monate === 1) return true;
    const m = parseInt(monat.slice(5, 7), 10);
    const start = fk.startMonat || 1;
    return ((m - start) % iv.monate + iv.monate) % iv.monate === 0;
  },

  naechsteFaelligkeit: function (fk) {
    const heute = new Date();
    const tag = Math.min(Math.max(fk.faelligTag || 1, 1), 31);
    for (let i = 0; i < 24; i++) {
      const d = new Date(heute.getFullYear(), heute.getMonth() + i, 1);
      const monat = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      if (!this.faelligImMonat(fk, monat)) continue;
      const letzterTag = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const echterTag = Math.min(tag, letzterTag);
      const kandidat = monat + '-' + String(echterTag).padStart(2, '0');
      if (kandidat >= heuteISO()) return kandidat;
    }
    return null;
  },

  // Wurde dieser Posten im laufenden Monat schon abgebucht?
  //
  // Der Name allein reicht nicht: Beim Fitnessstudio steht neben dem
  // Monatsbeitrag über 24 € auch jede Cola an der Theke im Auszug.
  // Deshalb zählt zusätzlich der Betrag - gesucht wird die Buchung,
  // die dem erwarteten Betrag am nächsten kommt. Alles unter der
  // Hälfte oder über dem Doppelten gilt nicht als Treffer.
  schonAbgebucht: function (fk, monat) {
    const suche = (fk.erkennung || TradeRepublic.normalisiere(fk.name) || '').trim();
    if (!suche) return null;

    const kandidaten = Daten.buchungen.filter((b) =>
      b.typ === 'ausgabe' &&
      wirkMonat(b) === monat &&
      b.normHaendler &&
      b.normHaendler.indexOf(suche) !== -1);

    if (!kandidaten.length) return null;

    const plan = fk.betragCent;
    if (!plan) return kandidaten[0];

    const passend = kandidaten.filter((b) =>
      b.betragCent >= plan * 0.5 && b.betragCent <= plan * 2);
    if (!passend.length) return null;

    passend.sort((a, b) =>
      Math.abs(a.betragCent - plan) - Math.abs(b.betragCent - plan));
    return passend[0];
  },

  // Welche Buchungen des Monats sind bereits erkannte Fixkosten?
  // Nötig, um sie nicht zweimal zu zählen: einmal als Fixkosten,
  // einmal als normale Ausgabe.
  abgeglichen: function (monat) {
    const ids = new Set();
    let cent = 0;
    (Daten.fixkosten || []).forEach((f) => {
      if (f.aktiv === false) return;
      if (!this.faelligImMonat(f, monat)) return;
      const b = this.schonAbgebucht(f, monat);
      if (b && !ids.has(b.id)) { ids.add(b.id); cent += b.betragCent; }
    });
    return { ids: ids, cent: cent };
  },

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Fixkosten',
      linksText: 'Fertig',
      rechtsText: 'Neu',
      beiRechts: () => this.bearbeiten(null),
      nachOeffnen: (koerper) => this.zeichne(koerper)
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const liste = (Daten.fixkosten || []).slice()
      .sort((a, b) => this.monatsAnteil(b) - this.monatsAnteil(a));

    if (!liste.length) {
      koerper.innerHTML =
        '<div class="leer-hinweis"><span class="gross">📌</span>' +
        'Noch keine Fixkosten erfasst.<br>Trag hier ein, was jeden Monat sicher abgeht – ' +
        'Miete, Strom, Handy, Versicherungen, Abos.</div>' +
        '<button class="knopf" id="fk-erste">Ersten Posten anlegen</button>' +
        '<div style="height:20px"></div>';
      koerper.querySelector('#fk-erste').addEventListener('click', () => this.bearbeiten(null));
      return;
    }

    const monat = UI.zustand.monat;
    const gesamt = this.monatsSumme();
    const einnahmen = summe(buchungenImMonat(monat, 'einnahme'));
    const anteilVomEinkommen = einnahmen > 0 ? Math.round((gesamt / einnahmen) * 100) : null;

    const zeilen = liste.map((fk) => {
      const k = kategorie(fk.kategorieId) || { name: '—', emoji: '❓' };
      const iv = INTERVALLE[fk.intervall] || INTERVALLE.monat;
      const naechste = this.naechsteFaelligkeit(fk);
      const gebucht = this.faelligImMonat(fk, monat) ? this.schonAbgebucht(fk, monat) : null;
      const inaktiv = fk.aktiv === false;

      const unterzeile = [];
      unterzeile.push(k.emoji + ' ' + k.name);
      unterzeile.push(iv.name);
      if (iv.monate > 1) unterzeile.push(geld(this.monatsAnteil(fk)) + ' €/Monat');

      return '<button class="listenzeile' + (inaktiv ? ' aus' : '') + '" data-fk="' + esc(fk.id) + '">' +
        '<span class="icon">' + (inaktiv ? '⏸️' : (gebucht ? '✅' : '📌')) + '</span>' +
        '<span class="mitte">' +
          '<span class="haupt">' + esc(fk.name) + '</span>' +
          '<span class="neben">' + esc(unterzeile.join(' · ')) + '</span>' +
          (gebucht
            ? '<span class="neben" style="color:' + STATUS.gut.farbe + '">' +
              STATUS.gut.symbol + ' diesen Monat abgebucht am ' + esc(datumText(gebucht.datum)) + '</span>'
            : (naechste && !inaktiv
                ? '<span class="neben">nächste Fälligkeit ' + esc(datumText(naechste)) + '</span>'
                : '')) +
        '</span>' +
        '<span class="rechts mono">' + geld(fk.betragCent) + ' €</span>' +
      '</button>';
    }).join('');

    koerper.innerHTML =
      '<div class="karte" style="text-align:center;padding:20px 16px">' +
        '<div class="hero-wert">' + geldE(gesamt) + '</div>' +
        '<div class="saldo-label">Fixkosten pro Monat</div>' +
        (anteilVomEinkommen !== null
          ? '<div class="leise" style="font-size:12.5px;margin-top:6px">das sind ' +
            anteilVomEinkommen + ' % deiner Einnahmen in ' + esc(monatText(monat)) + '</div>'
          : '') +
      '</div>' +
      '<div class="liste">' + zeilen + '</div>' +
      '<p class="hinweis">Fixkosten erzeugen keine Buchungen – deine echten Abbuchungen ' +
        'kommen über den CSV-Import. Keel gleicht nur ab, was diesen Monat schon ' +
        'durchgelaufen ist (✅).</p>' +
      '<div style="height:12px"></div>';

    koerper.querySelectorAll('[data-fk]').forEach((b) =>
      b.addEventListener('click', () => this.bearbeiten(b.dataset.fk)));
  },

  bearbeiten: function (fkId) {
    const vorhanden = fkId ? (Daten.fixkosten || []).find((f) => f.id === fkId) : null;
    const z = vorhanden ? Object.assign({}, vorhanden) : {
      id: null, name: '', betragCent: 0, intervall: 'monat', faelligTag: 1,
      startMonat: new Date().getMonth() + 1, kategorieId: null, erkennung: '', notiz: '', aktiv: true
    };

    Blatt.oeffnen({
      titel: vorhanden ? 'Fixkosten bearbeiten' : 'Neue Fixkosten',
      linksText: 'Abbrechen',
      rechtsText: 'Sichern',
      beiRechts: () => speichern(),
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<div class="feld"><label>Bezeichnung</label>' +
            '<input type="text" id="fk-name" value="' + esc(z.name) + '" ' +
            'placeholder="z. B. Miete" autocomplete="off" enterkeyhint="done"></div>' +

          '<div class="feld-reihe">' +
            '<div class="feld"><label>Betrag in €</label>' +
              '<input type="text" inputmode="decimal" id="fk-betrag" ' +
              'value="' + (z.betragCent ? geld(z.betragCent) : '') + '" placeholder="0,00"></div>' +
            '<div class="feld"><label>Fällig am</label>' +
              '<select id="fk-tag">' +
                Array.from({ length: 31 }, (_, i) =>
                  '<option value="' + (i + 1) + '"' + (z.faelligTag === i + 1 ? ' selected' : '') + '>' +
                  (i + 1) + '.</option>').join('') +
              '</select></div>' +
          '</div>' +

          '<div class="feld"><label>Rhythmus</label>' +
            '<div class="wahl-gitter" id="fk-intervall">' +
              Object.keys(INTERVALLE).map((s) =>
                '<button data-iv="' + s + '">' + INTERVALLE[s].name + '</button>').join('') +
            '</div></div>' +

          '<div class="feld' + (z.intervall === 'monat' ? ' versteckt' : '') + '" id="fk-startmonat-feld">' +
            '<label>Erstmals fällig im</label>' +
            '<select id="fk-startmonat">' +
              MONATSNAMEN.map((m, i) =>
                '<option value="' + (i + 1) + '"' + (z.startMonat === i + 1 ? ' selected' : '') + '>' +
                m + '</option>').join('') +
            '</select></div>' +

          '<div class="feld"><label>Kategorie</label>' +
            '<div class="kat-gitter" id="fk-kat"></div></div>' +

          '<div class="feld"><label>Abgleich mit Kontoauszug (optional)</label>' +
            '<input type="text" id="fk-erkennung" value="' + esc(z.erkennung) + '" ' +
            'placeholder="z. B. Vattenfall" autocomplete="off">' +
            '<div class="hinweis" style="margin:7px 0 0;padding:0">Steht hier ein Name, hakt Keel ' +
              'den Posten ab, sobald eine passende Buchung im Monat auftaucht.</div></div>' +

          '<div class="schalter-zeile" style="margin-bottom:15px">' +
            '<div class="txt">Aktiv<small>Pausierte Posten zählen nicht in die Monatssumme</small></div>' +
            '<div class="schalter' + (z.aktiv !== false ? ' an' : '') + '" id="fk-aktiv"></div>' +
          '</div>' +

          '<button class="knopf" id="fk-speichern">Speichern</button>' +
          (vorhanden ? '<button class="knopf gefahr" id="fk-loeschen">Fixkosten löschen</button>' : '') +
          '<div style="height:20px"></div>';

        const male = () => {
          koerper.querySelectorAll('[data-iv]').forEach((b) =>
            b.classList.toggle('an', b.dataset.iv === z.intervall));
          koerper.querySelector('#fk-startmonat-feld')
            .classList.toggle('versteckt', z.intervall === 'monat');
          koerper.querySelectorAll('[data-fkkat]').forEach((b) =>
            b.classList.toggle('an', b.dataset.fkkat === z.kategorieId));
          koerper.querySelector('#fk-aktiv').classList.toggle('an', z.aktiv !== false);
        };

        const gitter = koerper.querySelector('#fk-kat');
        gitter.innerHTML = kategorienNach('ausgabe').map((k) =>
          '<button class="kat-kachel" data-fkkat="' + esc(k.id) + '">' +
            '<span class="emoji">' + esc(k.emoji) + '</span>' +
            '<span class="name">' + esc(k.name) + '</span></button>').join('');

        gitter.querySelectorAll('[data-fkkat]').forEach((b) =>
          b.addEventListener('click', () => { z.kategorieId = b.dataset.fkkat; male(); }));
        koerper.querySelectorAll('[data-iv]').forEach((b) =>
          b.addEventListener('click', () => { z.intervall = b.dataset.iv; male(); }));
        koerper.querySelector('#fk-aktiv').addEventListener('click', () => { z.aktiv = z.aktiv === false; male(); });
        koerper.querySelector('#fk-speichern').addEventListener('click', () => speichern());

        const loeschen = koerper.querySelector('#fk-loeschen');
        if (loeschen) loeschen.addEventListener('click', () => {
          if (!confirm('Fixkosten „' + z.name + '" löschen?')) return;
          Daten.fixkosten = (Daten.fixkosten || []).filter((f) => f.id !== z.id);
          sichern(); Blatt.schliessen(); Fixkosten.zeichne(); UI.zeichne();
          UI.melde('Gelöscht');
        });

        male();
      }
    });

    function speichern() {
      const koerper = Blatt.koerper();
      const name = koerper.querySelector('#fk-name').value.trim();
      const cent = CSVLeser.zuCent(koerper.querySelector('#fk-betrag').value);

      if (!name)                 { UI.melde('Bitte eine Bezeichnung eingeben', 'fehler'); return; }
      if (!cent || cent <= 0)    { UI.melde('Bitte einen Betrag eingeben', 'fehler'); return; }
      if (!z.kategorieId)        { UI.melde('Bitte eine Kategorie wählen', 'fehler'); return; }

      z.name = name;
      z.betragCent = Math.abs(cent);
      z.faelligTag = parseInt(koerper.querySelector('#fk-tag').value, 10) || 1;
      z.startMonat = parseInt(koerper.querySelector('#fk-startmonat').value, 10) || 1;
      const erk = koerper.querySelector('#fk-erkennung').value.trim();
      z.erkennung = erk ? TradeRepublic.normalisiere(erk) : '';

      if (!Daten.fixkosten) Daten.fixkosten = [];
      if (z.id) {
        const i = Daten.fixkosten.findIndex((f) => f.id === z.id);
        if (i >= 0) Daten.fixkosten[i] = z;
      } else {
        z.id = neueId('fk');
        Daten.fixkosten.push(z);
      }

      sichern(); Blatt.schliessen(); Fixkosten.zeichne(); UI.zeichne();
      UI.melde('Gespeichert', 'gut');
    }
  }
};

/* ============================================================
   Budgets
   ============================================================ */

const Budgets = {

  fuer: function (kategorieId) {
    return (Daten.budgets && Daten.budgets[kategorieId]) || 0;
  },

  gesamt: function () {
    return Object.keys(Daten.budgets || {}).reduce((s, id) => s + (Daten.budgets[id] || 0), 0);
  },

  // Verbrauch einer Kategorie im Monat
  verbraucht: function (kategorieId, monat) {
    return Daten.buchungen.reduce((s, b) =>
      (b.typ === 'ausgabe' && b.kategorieId === kategorieId &&
       monatVon(b.datum) === monat && zaehltMit(b)) ? s + b.betragCent : s, 0);
  },

  // Alle Kategorien mit gesetztem Budget, samt Status
  uebersicht: function (monat) {
    return Object.keys(Daten.budgets || {})
      .filter((id) => (Daten.budgets[id] || 0) > 0 && kategorie(id))
      .map((id) => {
        const grenze = Daten.budgets[id];
        const ist = this.verbraucht(id, monat);
        const anteil = grenze > 0 ? ist / grenze : 0;
        return { kategorieId: id, grenze: grenze, ist: ist, anteil: anteil, status: budgetStatus(anteil) };
      })
      .sort((a, b) => b.anteil - a.anteil);
  },

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Budgets',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => this.zeichne(koerper)
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const monat = UI.zustand.monat;
    const mitBudget = this.uebersicht(monat);
    const gesamtGrenze = this.gesamt();
    const gesamtIst = mitBudget.reduce((s, e) => s + e.ist, 0);

    const frei = gesamtGrenze - gesamtIst;
    const kopf = gesamtGrenze > 0
      ? '<div class="karte" style="text-align:center;padding:20px 16px">' +
          '<div class="hero-wert ' + (frei >= 0 ? '' : 'minus') + '">' + geldE(Math.abs(frei)) + '</div>' +
          '<div class="saldo-label">' +
            (frei >= 0 ? 'noch frei in ' : 'über Budget in ') + esc(monatText(monat)) + '</div>' +
          '<div class="leise" style="font-size:12.5px;margin-top:6px">' +
            geld(gesamtIst) + ' € von ' + geld(gesamtGrenze) + ' € verbraucht</div>' +
        '</div>'
      : '<p class="hinweis" style="margin-top:0">Setz für die Kategorien ein Monatsbudget, ' +
        'bei denen du dich leicht verschätzt. Kategorien ohne Budget bleiben unbeschränkt.</p>';

    const zeile = (k) => {
      const grenze = this.fuer(k.id);
      const ist = this.verbraucht(k.id, monat);
      const anteil = grenze > 0 ? ist / grenze : 0;
      const st = budgetStatus(anteil);
      const breite = Math.min(100, Math.round(anteil * 100));

      return '<div class="budget-zeile" data-bk="' + esc(k.id) + '">' +
        '<div class="kat-kopf">' +
          '<span class="emoji">' + esc(k.emoji) + '</span>' +
          '<span class="name">' + esc(k.name) + '</span>' +
          (grenze > 0
            ? '<span class="betrag mono">' + geld(ist) + ' / ' + geld(grenze) + ' €</span>'
            : '<span class="anteil">kein Budget</span>') +
        '</div>' +
        (grenze > 0
          ? '<div class="balken"><i style="width:' + breite + '%;background:' + st.farbe + '"></i></div>' +
            '<div class="budget-status" style="color:' + st.farbe + '">' +
              '<span class="budget-symbol">' + st.symbol + '</span> ' + esc(st.wort) +
              '<span class="leise"> · ' + Math.round(anteil * 100) + ' % verbraucht' +
              (anteil > 1 ? ', ' + geld(ist - grenze) + ' € darüber' : '') + '</span>' +
            '</div>'
          : '') +
        '<input type="text" inputmode="decimal" class="budget-feld" data-bf="' + esc(k.id) + '" ' +
          'value="' + (grenze ? geld(grenze) : '') + '" placeholder="Budget in € – leer = keins">' +
      '</div>';
    };

    koerper.innerHTML = kopf +
      '<p class="abschnitt-titel">Monatsbudget je Kategorie</p>' +
      kategorienNach('ausgabe').map(zeile).join('') +
      '<p class="hinweis">Die Warnung springt bei 80 % auf „wird eng" und bei ' +
        'Überschreitung auf „überschritten". Farbe, Symbol und Wort sagen dasselbe – ' +
        'du musst dich nie auf die Farbe allein verlassen.</p>' +
      '<div style="height:12px"></div>';

    koerper.querySelectorAll('[data-bf]').forEach((feld) => {
      feld.addEventListener('change', () => {
        const id = feld.dataset.bf;
        const cent = CSVLeser.zuCent(feld.value);
        if (!Daten.budgets) Daten.budgets = {};
        if (!cent || cent <= 0) delete Daten.budgets[id];
        else Daten.budgets[id] = Math.abs(cent);
        sichern();
        this.zeichne(koerper);
        UI.zeichne();
      });
    });
  }
};

/* ============================================================
   Vermögen
   ============================================================ */

const VERMOEGENSARTEN = {
  konto:     { name: 'Konto',      emoji: '🏦' },
  depot:     { name: 'Depot',      emoji: '📈' },
  bargeld:   { name: 'Bargeld',    emoji: '💶' },
  sonstiges: { name: 'Sonstiges',  emoji: '💎' }
};

const Vermoegen = {

  letzterStand: function (posten) {
    if (!posten.staende || !posten.staende.length) return 0;
    return posten.staende[posten.staende.length - 1].centStand;
  },

  standAm: function (posten, datum) {
    let wert = 0;
    (posten.staende || []).forEach((s) => { if (s.datum <= datum) wert = s.centStand; });
    return wert;
  },

  brutto: function () {
    return (Daten.vermoegen || []).reduce((s, p) => s + this.letzterStand(p), 0);
  },

  schulden: function () {
    return (Daten.kredite || []).reduce((s, k) => s + Kredit.restschuld(k), 0);
  },

  netto: function () {
    return this.brutto() - this.schulden();
  },

  // Verlauf des Gesamtvermögens: an jedem Datum, an dem irgendwo ein Stand
  // eingetragen wurde, die Summe aller zu dem Zeitpunkt bekannten Stände.
  verlauf: function (mitSchulden) {
    const daten = new Set();
    (Daten.vermoegen || []).forEach((p) => (p.staende || []).forEach((s) => daten.add(s.datum)));
    if (mitSchulden) (Daten.kredite || []).forEach((k) => (k.staende || []).forEach((s) => daten.add(s.datum)));

    return Array.from(daten).sort().map((d) => {
      let cent = (Daten.vermoegen || []).reduce((s, p) => s + this.standAm(p, d), 0);
      if (mitSchulden) cent -= (Daten.kredite || []).reduce((s, k) => s + Kredit.restschuldAm(k, d), 0);
      return { datum: d, cent: cent };
    });
  },

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Vermögen',
      linksText: 'Fertig',
      rechtsText: 'Neu',
      beiRechts: () => this.bearbeiten(null),
      nachOeffnen: (koerper) => this.zeichne(koerper)
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const posten = Daten.vermoegen || [];

    if (!posten.length) {
      koerper.innerHTML =
        '<div class="leer-hinweis"><span class="gross">💎</span>' +
        'Noch nichts erfasst.<br>Trag deine Konten, dein Depot und dein Bargeld ein. ' +
        'Die Stände pflegst du selbst – Keel holt nichts von irgendwo ab.</div>' +
        '<button class="knopf" id="vm-erste">Ersten Posten anlegen</button>' +
        '<div style="height:20px"></div>';
      koerper.querySelector('#vm-erste').addEventListener('click', () => this.bearbeiten(null));
      return;
    }

    const brutto = this.brutto();
    const schulden = this.schulden();
    const netto = this.netto();
    const verlauf = this.verlauf(true);

    // Veränderung gegenüber dem Stand vor 30 Tagen
    let veraenderung = '';
    if (verlauf.length > 1) {
      const grenze = new Date(); grenze.setDate(grenze.getDate() - 30);
      const grenzDatum = grenze.getFullYear() + '-' + String(grenze.getMonth() + 1).padStart(2, '0') +
                         '-' + String(grenze.getDate()).padStart(2, '0');
      let vorher = verlauf[0].cent;
      verlauf.forEach((p) => { if (p.datum <= grenzDatum) vorher = p.cent; });
      const diff = netto - vorher;
      if (diff !== 0) {
        veraenderung = '<div class="leise" style="font-size:12.5px;margin-top:6px">' +
          (diff > 0 ? '▲ ' : '▼ ') + geld(Math.abs(diff)) + ' € in den letzten 30 Tagen</div>';
      }
    }

    const diagramm = verlauf.length > 1
      ? '<div class="karte"><p class="karte-titel">Nettovermögen im Verlauf</p>' +
        Diagramm.verlauf(verlauf, DIAGRAMM.vermoegen, { titel: 'Nettovermögen im Verlauf' }) +
        '</div>'
      : '';

    const zeilen = posten.slice()
      .sort((a, b) => this.letzterStand(b) - this.letzterStand(a))
      .map((p) => {
        const art = VERMOEGENSARTEN[p.art] || VERMOEGENSARTEN.sonstiges;
        const anzahl = (p.staende || []).length;
        const letzte = anzahl ? p.staende[anzahl - 1].datum : null;
        const istNot = p.id === Daten.notgroschen.vermoegenId && !Notgroschen.heisstSelbst(p);
        return '<button class="listenzeile" data-vm="' + esc(p.id) + '">' +
          '<span class="icon">' + esc(p.emoji || art.emoji) + '</span>' +
          '<span class="mitte"><span class="haupt">' + esc(p.name) + '</span>' +
            '<span class="neben">' + esc(art.name) + (istNot ? ' · 🛟 Notgroschen' : '') +
            (letzte ? ' · Stand vom ' + esc(datumText(letzte)) : ' · noch kein Stand') + '</span></span>' +
          '<span class="rechts mono">' + geld(this.letzterStand(p)) + ' €</span>' +
        '</button>';
      }).join('');

    koerper.innerHTML =
      '<div class="karte" style="text-align:center;padding:22px 16px">' +
        '<div class="hero-wert ' + (netto >= 0 ? 'plus' : 'minus') + '">' + geldE(netto) + '</div>' +
        '<div class="saldo-label">Nettovermögen</div>' +
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
      '<p class="abschnitt-titel">Posten</p>' +
      '<div class="liste">' + zeilen + '</div>' +
      '<p class="hinweis">Tippe einen Posten an, um einen neuen Stand einzutragen. ' +
        'Jeder Eintrag bleibt erhalten – daraus entsteht der Verlauf.</p>' +
      '<div style="height:12px"></div>';

    Diagramm.verdrahte(koerper);
    koerper.querySelectorAll('[data-vm]').forEach((b) =>
      b.addEventListener('click', () => this.bearbeiten(b.dataset.vm)));
  },

  bearbeiten: function (vmId) {
    const vorhanden = vmId ? (Daten.vermoegen || []).find((p) => p.id === vmId) : null;
    const z = vorhanden ? JSON.parse(JSON.stringify(vorhanden)) : {
      id: null, name: '', art: 'konto', emoji: '🏦', staende: []
    };

    Blatt.oeffnen({
      titel: vorhanden ? z.name : 'Neuer Posten',
      linksText: 'Abbrechen',
      rechtsText: 'Sichern',
      beiRechts: () => speichern(),
      nachOeffnen: (koerper) => zeichneFormular(koerper)
    });

    function zeichneFormular(koerper) {
      koerper = koerper || Blatt.koerper();
      const staende = (z.staende || []).slice().sort((a, b) => a.datum < b.datum ? -1 : 1);
      const punkte = staende.map((s) => ({ datum: s.datum, cent: s.centStand }));

      koerper.innerHTML =
        (z.id && z.id === Daten.notgroschen.vermoegenId
          ? '<p class="hinweis" style="margin-top:0">🛟 Dieser Posten ist dein <b>Notgroschen</b>. ' +
            'Der Stand, den du hier einträgst, steht auch auf der Startseite.</p>'
          : '') +

        '<div class="feld"><label>Bezeichnung</label>' +
          '<input type="text" id="vm-name" value="' + esc(z.name) + '" ' +
          'placeholder="z. B. Girokonto" autocomplete="off" enterkeyhint="done"></div>' +

        '<div class="feld"><label>Art</label>' +
          '<div class="wahl-gitter" id="vm-art">' +
            Object.keys(VERMOEGENSARTEN).map((s) =>
              '<button data-va="' + s + '">' + VERMOEGENSARTEN[s].emoji + ' ' +
              VERMOEGENSARTEN[s].name + '</button>').join('') +
          '</div></div>' +

        '<p class="abschnitt-titel">Neuen Stand eintragen</p>' +
        '<div class="feld-reihe">' +
          '<div class="feld"><label>Datum</label>' +
            '<input type="date" id="vm-datum" value="' + heuteISO() + '"></div>' +
          '<div class="feld"><label>Stand in €</label>' +
            '<input type="text" inputmode="decimal" id="vm-stand" placeholder="0,00"></div>' +
        '</div>' +
        '<button class="knopf zweit" id="vm-stand-hinzu">Stand hinzufügen</button>' +

        (punkte.length > 1
          ? '<div class="karte" style="margin-top:16px"><p class="karte-titel">Verlauf</p>' +
            Diagramm.verlauf(punkte, DIAGRAMM.vermoegen, { titel: 'Verlauf ' + z.name }) + '</div>'
          : '') +

        (staende.length
          ? '<p class="abschnitt-titel">Alle Stände (' + staende.length + ')</p><div class="liste">' +
            staende.slice().reverse().map((s, i) =>
              '<button class="listenzeile" data-vs="' + esc(s.datum) + '|' + s.centStand + '">' +
                '<span class="icon">•</span>' +
                '<span class="mitte"><span class="haupt mono">' + geld(s.centStand) + ' €</span>' +
                  '<span class="neben">' + esc(datumText(s.datum)) + '</span></span>' +
                '<span class="chevron">✕</span></button>').join('') +
            '</div>'
          : '<p class="hinweis">Noch kein Stand eingetragen.</p>') +

        '<button class="knopf" id="vm-speichern" style="margin-top:8px">Speichern</button>' +
        (vorhanden ? '<button class="knopf gefahr" id="vm-loeschen">Posten löschen</button>' : '') +
        '<div style="height:20px"></div>';

      Diagramm.verdrahte(koerper);

      const male = () => koerper.querySelectorAll('[data-va]').forEach((b) =>
        b.classList.toggle('an', b.dataset.va === z.art));

      koerper.querySelectorAll('[data-va]').forEach((b) =>
        b.addEventListener('click', () => {
          z.art = b.dataset.va;
          if (!vorhanden || !z.emoji) z.emoji = VERMOEGENSARTEN[z.art].emoji;
          z.emoji = VERMOEGENSARTEN[z.art].emoji;
          male();
        }));

      koerper.querySelector('#vm-name').addEventListener('input', (e) => { z.name = e.target.value; });

      koerper.querySelector('#vm-stand-hinzu').addEventListener('click', () => {
        const datum = koerper.querySelector('#vm-datum').value || heuteISO();
        const cent = CSVLeser.zuCent(koerper.querySelector('#vm-stand').value);
        if (cent === null) { UI.melde('Bitte einen Stand eingeben', 'fehler'); return; }
        z.staende = (z.staende || []).filter((s) => s.datum !== datum);
        z.staende.push({ datum: datum, centStand: cent });
        z.staende.sort((a, b) => a.datum < b.datum ? -1 : 1);
        zeichneFormular(koerper);
        UI.melde('Stand eingetragen', 'gut');
      });

      koerper.querySelectorAll('[data-vs]').forEach((b) =>
        b.addEventListener('click', () => {
          const datum = b.dataset.vs.split('|')[0];
          if (!confirm('Stand vom ' + datumText(datum) + ' löschen?')) return;
          z.staende = z.staende.filter((s) => s.datum !== datum);
          zeichneFormular(koerper);
        }));

      koerper.querySelector('#vm-speichern').addEventListener('click', () => speichern());

      const loeschen = koerper.querySelector('#vm-loeschen');
      if (loeschen) loeschen.addEventListener('click', () => {
        const warnung = z.id === Daten.notgroschen.vermoegenId
          ? '\n\nDein Notgroschen ist mit diesem Posten verknüpft. Die Verknüpfung ' +
            'wird gelöst; der zuletzt bekannte Stand bleibt als Zahl erhalten.'
          : '';
        if (!confirm('Posten „' + z.name + '" mit allen Ständen löschen?' + warnung)) return;
        Daten.vermoegen = (Daten.vermoegen || []).filter((p) => p.id !== z.id);
        sichern(); Blatt.schliessen(); Vermoegen.zeichne(); UI.zeichne();
        UI.melde('Gelöscht');
      });

      male();
    }

    function speichern() {
      const koerper = Blatt.koerper();
      const name = koerper.querySelector('#vm-name').value.trim();
      if (!name) { UI.melde('Bitte eine Bezeichnung eingeben', 'fehler'); return; }
      z.name = name;
      if (!z.emoji) z.emoji = VERMOEGENSARTEN[z.art].emoji;

      if (!Daten.vermoegen) Daten.vermoegen = [];
      if (z.id) {
        const i = Daten.vermoegen.findIndex((p) => p.id === z.id);
        if (i >= 0) Daten.vermoegen[i] = z;
      } else {
        z.id = neueId('vm');
        Daten.vermoegen.push(z);
      }

      sichern(); Blatt.schliessen(); Vermoegen.zeichne(); UI.zeichne();
      UI.melde('Gespeichert', 'gut');
    }
  }
};

/* ============================================================
   Kredit
   ============================================================
   Rechenmodell: Annuitätendarlehen. Die Rate bleibt gleich,
   der Zinsanteil sinkt mit der Restschuld, der Tilgungsanteil
   steigt. Bei Zinssatz 0 wird daraus automatisch ein einfacher
   Ratenkredit - dasselbe Modell deckt beides ab.
   ============================================================ */

const Kredit = {

  restschuld: function (k) {
    if (!k.staende || !k.staende.length) return 0;
    return k.staende[k.staende.length - 1].restschuldCent;
  },

  restschuldAm: function (k, datum) {
    let wert = 0;
    (k.staende || []).forEach((s) => { if (s.datum <= datum) wert = s.restschuldCent; });
    return wert;
  },

  // Tilgungsplan vorausberechnen
  plan: function (k, maxMonate) {
    const rest0 = this.restschuld(k);
    const rate = k.rateCent || 0;
    const iMonat = (k.zinssatz || 0) / 100 / 12;
    const zeilen = [];

    if (rest0 <= 0) return { zeilen: zeilen, monate: 0, zinsenGesamt: 0, machbar: true, fertig: true };
    if (rate <= 0)  return { zeilen: zeilen, monate: null, zinsenGesamt: 0, machbar: false };

    // Reicht die Rate überhaupt, um die Zinsen zu decken?
    if (rest0 * iMonat >= rate) {
      return { zeilen: zeilen, monate: null, zinsenGesamt: 0, machbar: false,
               monatsZins: Math.round(rest0 * iMonat) };
    }

    let rest = rest0;
    let zinsenGesamt = 0;
    const grenze = maxMonate || 600;

    for (let m = 1; m <= grenze && rest > 0; m++) {
      const zins = Math.round(rest * iMonat);
      let tilgung = rate - zins;
      if (tilgung > rest) tilgung = rest;
      zinsenGesamt += zins;
      rest -= tilgung;
      zeilen.push({ monat: m, zins: zins, tilgung: tilgung, rest: Math.max(0, rest) });
    }

    return { zeilen: zeilen, monate: zeilen.length, zinsenGesamt: zinsenGesamt,
             machbar: true, fertig: rest <= 0 };
  },

  endDatum: function (monate) {
    const d = new Date();
    d.setMonth(d.getMonth() + monate);
    return MONATSNAMEN[d.getMonth()] + ' ' + d.getFullYear();
  },

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Kredit',
      linksText: 'Fertig',
      rechtsText: 'Neu',
      beiRechts: () => this.bearbeiten(null),
      nachOeffnen: (koerper) => this.zeichne(koerper)
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const liste = Daten.kredite || [];

    if (!liste.length) {
      koerper.innerHTML =
        '<div class="leer-hinweis"><span class="gross">🏦</span>' +
        'Kein Kredit erfasst.<br>Trag Restschuld, Zinssatz und Monatsrate ein – ' +
        'Keel rechnet dir Laufzeit, Zinsanteil und Tilgungsverlauf aus.</div>' +
        '<button class="knopf" id="kr-erste">Kredit anlegen</button>' +
        '<div style="height:20px"></div>';
      koerper.querySelector('#kr-erste').addEventListener('click', () => this.bearbeiten(null));
      return;
    }

    koerper.innerHTML = liste.map((k) => {
      const rest = this.restschuld(k);
      const p = this.plan(k);
      const verlauf = (k.staende || []).map((s) => ({ datum: s.datum, cent: s.restschuldCent }));

      let planText;
      if (rest <= 0) {
        planText = '<div class="karte" style="text-align:center;color:' + STATUS.gut.farbe + '">' +
          STATUS.gut.symbol + ' Abbezahlt</div>';
      } else if (!p.machbar) {
        planText = '<div class="karte" style="font-size:14px;line-height:1.6;color:' + STATUS.drueber.farbe + '">' +
          STATUS.drueber.symbol + ' <b>Die Rate reicht nicht.</b>' +
          '<div class="leise" style="margin-top:5px">' +
            (p.monatsZins
              ? 'Allein die Zinsen betragen ' + geld(p.monatsZins) + ' € im Monat. ' +
                'Bei dieser Rate wird die Restschuld nie kleiner.'
              : 'Trag eine Monatsrate ein, damit Keel rechnen kann.') +
          '</div></div>';
      } else {
        const jahre = Math.floor(p.monate / 12), monate = p.monate % 12;
        planText =
          '<div class="zwei-spalten" style="margin-bottom:14px">' +
            '<div class="mini-karte"><div class="label">Noch</div>' +
              '<div class="wert mono">' + (jahre ? jahre + ' J' : '') +
              (monate ? ' ' + monate + ' M' : (jahre ? '' : p.monate + ' M')) + '</div>' +
              '<div class="leise" style="font-size:11.5px;margin-top:3px">bis ' +
                esc(this.endDatum(p.monate)) + '</div></div>' +
            '<div class="mini-karte"><div class="label">Zinsen bis zum Ende</div>' +
              '<div class="wert mono">' + geld(p.zinsenGesamt) + ' €</div>' +
              '<div class="leise" style="font-size:11.5px;margin-top:3px">bei ' +
                String(k.zinssatz || 0).replace('.', ',') + ' % p. a.</div></div>' +
          '</div>' +

          '<div class="karte"><p class="karte-titel">Nächste Rate</p>' +
            '<div class="split-zeile">' +
              '<span>Tilgung</span><span class="mono">' + geld(p.zeilen[0].tilgung) + ' €</span></div>' +
            '<div class="split-balken">' +
              '<i style="width:' + Math.round(p.zeilen[0].tilgung / (k.rateCent || 1) * 100) + '%;' +
                'background:' + DIAGRAMM.kredit + '"></i></div>' +
            '<div class="split-zeile"><span>Zinsen</span>' +
              '<span class="mono">' + geld(p.zeilen[0].zins) + ' €</span></div>' +
          '</div>';
      }

      return '<div class="kredit-block" data-krblock="' + esc(k.id) + '">' +
        '<div class="karte" style="text-align:center;padding:22px 16px">' +
          '<div class="hero-wert">' + geldE(rest) + '</div>' +
          '<div class="saldo-label">Restschuld · ' + esc(k.name) + '</div>' +
          '<div class="leise" style="font-size:12.5px;margin-top:6px">Rate ' +
            geld(k.rateCent || 0) + ' € im Monat</div>' +
        '</div>' +
        planText +
        (verlauf.length > 1
          ? '<div class="karte"><p class="karte-titel">Restschuld im Verlauf</p>' +
            Diagramm.verlauf(verlauf, DIAGRAMM.kredit, { titel: 'Restschuld im Verlauf' }) + '</div>'
          : '') +
        '<button class="knopf zweit" data-kr="' + esc(k.id) + '">Bearbeiten & Stand eintragen</button>' +
        (p.machbar && p.zeilen.length
          ? '<button class="knopf rand" data-krplan="' + esc(k.id) + '" style="margin-top:10px">' +
            'Vollständigen Tilgungsplan zeigen</button>'
          : '') +
        '<div class="trenner"></div>' +
      '</div>';
    }).join('') + '<div style="height:12px"></div>';

    Diagramm.verdrahte(koerper);
    koerper.querySelectorAll('[data-kr]').forEach((b) =>
      b.addEventListener('click', () => this.bearbeiten(b.dataset.kr)));
    koerper.querySelectorAll('[data-krplan]').forEach((b) =>
      b.addEventListener('click', () => this.planZeigen(b.dataset.krplan)));
  },

  // Tabellenansicht - jeder Wert lesbar, nicht nur im Diagramm
  planZeigen: function (krId) {
    const k = (Daten.kredite || []).find((x) => x.id === krId);
    if (!k) return;
    const p = this.plan(k);

    Blatt.oeffnen({
      titel: 'Tilgungsplan',
      linksText: 'Zurück',
      nachOeffnen: (koerper) => {
        const heute = new Date();
        koerper.innerHTML =
          '<p class="hinweis" style="margin-top:0">Vorausberechnet mit gleichbleibender Rate von ' +
            geld(k.rateCent) + ' € und ' + String(k.zinssatz || 0).replace('.', ',') + ' % Zinsen im Jahr. ' +
            'Sondertilgungen und Zinsänderungen sind nicht eingerechnet.</p>' +
          '<div class="tabelle">' +
            '<div class="tabelle-kopf">' +
              '<span>Monat</span><span>Zinsen</span><span>Tilgung</span><span>Restschuld</span></div>' +
            p.zeilen.map((z) => {
              const d = new Date(heute.getFullYear(), heute.getMonth() + z.monat, 1);
              return '<div class="tabelle-zeile">' +
                '<span>' + MONATSNAMEN[d.getMonth()].slice(0, 3) + ' ' + String(d.getFullYear()).slice(2) + '</span>' +
                '<span class="mono">' + geld(z.zins) + '</span>' +
                '<span class="mono">' + geld(z.tilgung) + '</span>' +
                '<span class="mono">' + geld(z.rest) + '</span>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<p class="hinweis">Gesamte Zinslast bis zum Ende: <b>' + geld(p.zinsenGesamt) + ' €</b></p>' +
          '<div style="height:16px"></div>';
      }
    });
  },

  bearbeiten: function (krId) {
    const vorhanden = krId ? (Daten.kredite || []).find((k) => k.id === krId) : null;
    const z = vorhanden ? JSON.parse(JSON.stringify(vorhanden)) : {
      id: null, name: '', zinssatz: 0, rateCent: 0, staende: [], notiz: ''
    };

    Blatt.oeffnen({
      titel: vorhanden ? z.name : 'Neuer Kredit',
      linksText: 'Abbrechen',
      rechtsText: 'Sichern',
      beiRechts: () => speichern(),
      nachOeffnen: (koerper) => zeichneFormular(koerper)
    });

    function zeichneFormular(koerper) {
      koerper = koerper || Blatt.koerper();
      const staende = (z.staende || []).slice().sort((a, b) => a.datum < b.datum ? -1 : 1);

      koerper.innerHTML =
        '<div class="feld"><label>Bezeichnung</label>' +
          '<input type="text" id="kr-name" value="' + esc(z.name) + '" ' +
          'placeholder="z. B. Autokredit" autocomplete="off"></div>' +

        '<div class="feld-reihe">' +
          '<div class="feld"><label>Monatsrate in €</label>' +
            '<input type="text" inputmode="decimal" id="kr-rate" ' +
            'value="' + (z.rateCent ? geld(z.rateCent) : '') + '" placeholder="0,00"></div>' +
          '<div class="feld"><label>Zinssatz % p. a.</label>' +
            '<input type="text" inputmode="decimal" id="kr-zins" ' +
            'value="' + (z.zinssatz ? String(z.zinssatz).replace('.', ',') : '') + '" placeholder="0,00"></div>' +
        '</div>' +

        '<p class="abschnitt-titel">Restschuld eintragen</p>' +
        '<div class="feld-reihe">' +
          '<div class="feld"><label>Datum</label>' +
            '<input type="date" id="kr-datum" value="' + heuteISO() + '"></div>' +
          '<div class="feld"><label>Restschuld in €</label>' +
            '<input type="text" inputmode="decimal" id="kr-rest" placeholder="0,00"></div>' +
        '</div>' +
        '<button class="knopf zweit" id="kr-stand-hinzu">Stand hinzufügen</button>' +

        (staende.length
          ? '<p class="abschnitt-titel">Verlauf (' + staende.length + ')</p><div class="liste">' +
            staende.slice().reverse().map((s) =>
              '<button class="listenzeile" data-ks="' + esc(s.datum) + '">' +
                '<span class="icon">•</span>' +
                '<span class="mitte"><span class="haupt mono">' + geld(s.restschuldCent) + ' €</span>' +
                  '<span class="neben">' + esc(datumText(s.datum)) + '</span></span>' +
                '<span class="chevron">✕</span></button>').join('') +
            '</div>'
          : '<p class="hinweis">Noch keine Restschuld eingetragen.</p>') +

        '<button class="knopf" id="kr-speichern" style="margin-top:8px">Speichern</button>' +
        (vorhanden ? '<button class="knopf gefahr" id="kr-loeschen">Kredit löschen</button>' : '') +
        '<div style="height:20px"></div>';

      // Wichtig: Diese Felder laufend in den Datensatz übernehmen.
      // Das Formular zeichnet sich beim Hinzufügen eines Standes neu -
      // ohne das wären Rate und Zinssatz danach wieder leer.
      const leseRate = () => {
        const c = CSVLeser.zuCent(koerper.querySelector('#kr-rate').value);
        z.rateCent = c ? Math.abs(c) : 0;
      };
      const leseZins = () => {
        const roh = koerper.querySelector('#kr-zins').value.replace(',', '.').replace(/[^\d.]/g, '');
        const f = parseFloat(roh);
        z.zinssatz = isNaN(f) ? 0 : f;
      };

      koerper.querySelector('#kr-name').addEventListener('input', (e) => { z.name = e.target.value; });
      koerper.querySelector('#kr-rate').addEventListener('input', leseRate);
      koerper.querySelector('#kr-zins').addEventListener('input', leseZins);

      koerper.querySelector('#kr-stand-hinzu').addEventListener('click', () => {
        leseRate(); leseZins();
        const datum = koerper.querySelector('#kr-datum').value || heuteISO();
        const cent = CSVLeser.zuCent(koerper.querySelector('#kr-rest').value);
        if (cent === null) { UI.melde('Bitte eine Restschuld eingeben', 'fehler'); return; }
        z.staende = (z.staende || []).filter((s) => s.datum !== datum);
        z.staende.push({ datum: datum, restschuldCent: Math.abs(cent) });
        z.staende.sort((a, b) => a.datum < b.datum ? -1 : 1);
        zeichneFormular(koerper);
        UI.melde('Stand eingetragen', 'gut');
      });

      koerper.querySelectorAll('[data-ks]').forEach((b) =>
        b.addEventListener('click', () => {
          if (!confirm('Stand vom ' + datumText(b.dataset.ks) + ' löschen?')) return;
          z.staende = z.staende.filter((s) => s.datum !== b.dataset.ks);
          zeichneFormular(koerper);
        }));

      koerper.querySelector('#kr-speichern').addEventListener('click', () => speichern());

      const loeschen = koerper.querySelector('#kr-loeschen');
      if (loeschen) loeschen.addEventListener('click', () => {
        if (!confirm('Kredit „' + z.name + '" löschen?')) return;
        Daten.kredite = (Daten.kredite || []).filter((k) => k.id !== z.id);
        sichern(); Blatt.schliessen(); Kredit.zeichne(); UI.zeichne();
        UI.melde('Gelöscht');
      });
    }

    function speichern() {
      const koerper = Blatt.koerper();
      const name = koerper.querySelector('#kr-name').value.trim();
      if (!name) { UI.melde('Bitte eine Bezeichnung eingeben', 'fehler'); return; }
      z.name = name;

      // Stand der Eingabefelder noch einmal übernehmen
      const rate = CSVLeser.zuCent(koerper.querySelector('#kr-rate').value);
      z.rateCent = rate ? Math.abs(rate) : 0;
      const zinsRoh = koerper.querySelector('#kr-zins').value.replace(',', '.').replace(/[^\d.]/g, '');
      const zins = parseFloat(zinsRoh);
      z.zinssatz = isNaN(zins) ? 0 : zins;

      if (!Daten.kredite) Daten.kredite = [];
      if (z.id) {
        const i = Daten.kredite.findIndex((k) => k.id === z.id);
        if (i >= 0) Daten.kredite[i] = z;
      } else {
        z.id = neueId('kr');
        Daten.kredite.push(z);
      }

      sichern(); Blatt.schliessen(); Kredit.zeichne(); UI.zeichne();
      UI.melde('Gespeichert', 'gut');
    }
  }
};
