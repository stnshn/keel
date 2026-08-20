/* ============================================================
   Keel - Startseite, Ein & Aus, Sparen, Einstellungen
   ============================================================
   Die Startseite beantwortet eine einzige Frage:
   Wie viel Geld steht mir diesen Monat noch zur Verfügung?

   Alles, was zu dieser Zahl führt, steht im Reiter "Ein & Aus".
   ============================================================ */

'use strict';

/* ============================================================
   Die Rechnung hinter der großen Zahl
   ============================================================
   verfügbar =   Einnahmen
               − Sparrate
               − alles, was diesen Monat schon ausgegeben wurde
               − Fixkosten, die noch anstehen

   Warum so und nicht "Einnahmen − Fixkostenplan − Ausgaben"?
   Weil sonst doppelt gezählt würde: Eine bereits abgebuchte
   Miete steckt schon in den Ausgaben. Gezählt wird deshalb,
   was tatsächlich geflossen ist, plus das, was sicher noch
   kommt.
   ============================================================ */

// So viele abgeschlossene Monate gehen in das Durchschnittseinkommen ein.
const SCHNITT_MONATE = 6;

const Monatsrechnung = {

  // Das Gehalt, das für diesen Monat gilt (nach der Monatsmitte-Regel).
  gehalt: function (monat) {
    const treffer = Daten.buchungen.filter((b) =>
      istGehalt(b) && wirkMonat(b) === monat && zaehltMit(b));
    return {
      da: treffer.length > 0,
      cent: treffer.reduce((s, b) => s + b.betragCent, 0),
      buchungen: treffer
    };
  },

  // Einnahmen außer Gehalt
  sonstigeEinnahmen: function (monat) {
    return Daten.buchungen.reduce((s, b) =>
      (b.typ === 'einnahme' && !istGehalt(b) && wirkMonat(b) === monat && zaehltMit(b))
        ? s + b.betragCent : s, 0);
  },

  // Alles, was diesen Monat tatsächlich rausgegangen ist
  ausgaben: function (monat) {
    return Daten.buchungen.reduce((s, b) =>
      (b.typ === 'ausgabe' && wirkMonat(b) === monat && zaehltMit(b))
        ? s + b.betragCent : s, 0);
  },

  // Fixkosten, die diesen Monat fällig sind und noch nicht durchgelaufen sind
  fixkostenOffen: function (monat) {
    if (typeof Fixkosten === 'undefined') return { cent: 0, posten: [] };
    const offen = (Daten.fixkosten || []).filter((f) =>
      f.aktiv !== false &&
      Fixkosten.faelligImMonat(f, monat) &&
      !Fixkosten.schonAbgebucht(f, monat));
    return {
      cent: offen.reduce((s, f) => s + f.betragCent, 0),
      posten: offen
    };
  },

  /* Was kommt in einem normalen Monat herein?
     ------------------------------------------------------------
     Gemittelt wird über die letzten SCHNITT_MONATE abgeschlossenen
     Monate - der laufende bleibt außen vor, er ist noch nicht fertig.
     Gezählt werden nur Monate, in denen überhaupt etwas hereinkam;
     ein Monat ohne Einnahmen ist meist eine Lücke in den Daten und
     würde den Schnitt nach unten ziehen.

     Gibt es noch keinen einzigen solchen Monat, tritt das
     Mindestnetto an die Stelle des Schnitts - dieselbe Zahl, mit
     der auch die Monatsrechnung vor dem Zahltag arbeitet. */
  durchschnittsEinkommen: function () {
    const bis = monatVerschieben(monatVon(heuteISO()), -1);
    const von = monatVerschieben(bis, -(SCHNITT_MONATE - 1));

    const proMonat = {};
    Daten.buchungen.forEach((b) => {
      if (b.typ !== 'einnahme' || !zaehltMit(b)) return;
      const m = wirkMonat(b);
      if (m < von || m > bis) return;
      proMonat[m] = (proMonat[m] || 0) + b.betragCent;
    });

    const monate = Object.keys(proMonat);
    if (!monate.length) {
      return {
        cent: Daten.einstellungen.mindestnettoCent || 0,
        monate: 0,
        geschaetzt: true
      };
    }

    const summe = monate.reduce((s, m) => s + proMonat[m], 0);
    return {
      cent: Math.round(summe / monate.length),
      monate: monate.length,
      geschaetzt: false
    };
  },

  alles: function (monat) {
    const g = this.gehalt(monat);
    const mindest = Daten.einstellungen.mindestnettoCent || 0;

    // Vor dem Zahltag wird mit dem Mindestnetto gerechnet.
    const gehaltCent = g.da ? g.cent : mindest;
    const bonus = g.da ? g.cent - mindest : 0;

    const sonstige = this.sonstigeEinnahmen(monat);
    const sparrate = Daten.einstellungen.sparrateCent || 0;
    const ausgaben = this.ausgaben(monat);
    const offen = this.fixkostenOffen(monat);

    // Bereits abgebuchte Fixkosten stecken in den Ausgaben. Für die
    // Aufteilung werden sie herausgerechnet, damit "variabel" auch
    // wirklich nur das Freiwillige zeigt.
    const bezahlt = typeof Fixkosten !== 'undefined'
      ? Fixkosten.abgeglichen(monat) : { cent: 0, ids: new Set() };
    const variabel = Math.max(0, ausgaben - bezahlt.cent);

    const einnahmen = gehaltCent + sonstige;
    const verfuegbar = einnahmen - sparrate - ausgaben - offen.cent;

    return {
      geschaetzt: !g.da,
      gehaltCent: gehaltCent,
      mindestCent: mindest,
      bonusCent: bonus,
      sonstigeCent: sonstige,
      einnahmenCent: einnahmen,
      sparrateCent: sparrate,
      ausgabenCent: ausgaben,
      fixBezahltCent: bezahlt.cent,
      variabelCent: variabel,
      fixOffenCent: offen.cent,
      fixOffenPosten: offen.posten,
      verfuegbarCent: verfuegbar
    };
  }
};

/* ============================================================
   Erfassungs-Zähler
   ============================================================
   Misst nicht das Geld, sondern die Gewohnheit: An wie vielen
   der letzten 30 Kalendertage ist überhaupt etwas festgehalten
   worden?

   Ein Tag gilt als erfasst, wenn er mindestens eine Buchung
   trägt ODER als Nulltag eingetragen wurde.

   Bewusst kein Streak: ein ausgelassener Tag setzt nichts
   zurück, er fällt nach 30 Tagen einfach hinten aus dem
   Fenster heraus.

   Nichts davon wird gespeichert. Der Wert entsteht bei jedem
   Öffnen neu aus den Buchungen und der Liste "nullTage" -
   deshalb stimmt er auch nach dem Einspielen eines Backups.
   ============================================================ */

const FENSTER_TAGE = 30;
const ZIEL_TAGE    = 24;

const Zaehler = {

  // ISO-Datum von heute aus um "abstand" Tage zurück.
  tagVor: function (abstand) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);          // Mittag: keine Sommerzeit-Rutscher
    d.setDate(d.getDate() - abstand);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  },

  // Alle Tage, an denen etwas festgehalten wurde - als Menge.
  erfassteTage: function () {
    const menge = new Set(Daten.nullTage || []);
    (Daten.buchungen || []).forEach((b) => { if (b.datum) menge.add(b.datum); });
    return menge;
  },

  // Das Fenster der letzten 30 Tage, ältester Tag zuerst.
  fenster: function () {
    const menge = this.erfassteTage();
    const tage = [];
    for (let i = FENSTER_TAGE - 1; i >= 0; i--) {
      const iso = this.tagVor(i);
      tage.push({ datum: iso, erfasst: menge.has(iso) });
    }
    return tage;
  },

  // Wie viele der 30 Tage sind erfasst? Steht hier und nicht im HTML,
  // damit Kärtchen und Zeile dieselbe Zahl aus derselben Quelle nehmen.
  anzahl: function () {
    return this.fenster().reduce((s, t) => s + (t.erfasst ? 1 : 0), 0);
  },

  heuteErfasst: function () {
    return this.erfassteTage().has(heuteISO());
  },

  gesternErfasst: function () {
    return this.erfassteTage().has(this.tagVor(1));
  },

  // Trägt heute als Nulltag ein. Kommt später doch noch eine Buchung
  // dazu, bleibt der Tag einfach erfasst - beides zählt gleich.
  nullTagEintragen: function () {
    const heute = heuteISO();
    if (!Array.isArray(Daten.nullTage)) Daten.nullTage = [];
    if (Daten.nullTage.indexOf(heute) === -1) {
      Daten.nullTage.push(heute);
      Daten.nullTage.sort();
      sichern();
    }
    UI.zeichne();
    UI.melde('Heute als Nulltag festgehalten', 'gut');
  }
};

/* ============================================================
   Kennzahlen-Kärtchen
   ============================================================
   Eine Liste, zwei Abnehmer: das Karussell auf der Startseite
   und die Schalterliste in den Einstellungen. Eine weitere
   Kennzahl ist ein weiterer Eintrag hier - an beiden Abnehmern
   ist dafür nichts zu ändern.

   Pro Eintrag:
     id            Schlüssel in Daten.einstellungen.karten
     label         die kleine Zeile über der Zahl
     beschreibung  steht nur in den Einstellungen unter dem Schalter
     wert()        { text, klasse, kontext } - erst beim Zeichnen gerufen

   "klasse" ist '' (neutral), 'gut', 'warn' oder 'minus'.
   Gerechnet wird hier nichts: jeder Eintrag greift auf die
   Berechnung zu, die es in der App ohnehin schon gibt.
   ============================================================ */

/* Wie heroKlasse, nur für die kleinere Zahl im Kärtchen: ein langer
   Betrag bekommt dieselbe Stufe in schmal, statt umzubrechen.

   Die Schwellen sind auf einem 360px breiten Gerät ausgemessen - dem
   schmalsten, das noch in Frage kommt. "≈ −1.234.567,89 €" ist der
   längste Fall, der praktisch vorkommt, und liegt damit in "klein". */
function kkKlasse(text) {
  const laenge = String(text).length;
  return laenge > 16 ? ' klein' : laenge > 13 ? ' mittel' : '';
}

const KARTEN = [

  {
    id: 'rest',
    label: 'Diesen Monat noch übrig',
    beschreibung: 'Die große Zahl der Startseite',
    wert: function () {
      const r = Monatsrechnung.alles(monatVon(heuteISO()));
      const tage = Start.tageRest();
      const name = monatText(monatVon(heuteISO())).split(' ')[0];

      return {
        text: (r.geschaetzt ? '≈ ' : '') + geldE(r.verfuegbarCent),
        klasse: r.verfuegbarCent < 0 ? 'minus'
              : (r.einnahmenCent > 0 && r.verfuegbarCent < r.einnahmenCent * 0.1) ? 'warn' : '',
        kontext: tage === 0
          ? 'letzter Tag im ' + name
          : 'noch ' + tage + ' Tag' + (tage === 1 ? '' : 'e') + ' im ' + name
      };
    }
  },

  {
    id: 'puffer',
    label: 'Monatspuffer',
    beschreibung: 'Durchschnittliches Einkommen minus Fixkosten',
    wert: function () {
      const ein = Monatsrechnung.durchschnittsEinkommen();
      const fix = typeof Fixkosten !== 'undefined' ? Fixkosten.monatsSumme() : 0;
      const puffer = ein.cent - fix;

      return {
        text: geldE(puffer),
        klasse: puffer < 0 ? 'minus' : '',
        // Woher der Schnitt stammt, gehört an die Zahl. Sonst steht dort
        // eine Zahl, deren Grundlage niemand kennt.
        kontext: ein.geschaetzt
          ? (ein.cent ? 'geschätzt aus dem Mindestnetto' : 'noch keine Einnahmen erfasst')
          : 'Ø aus ' + ein.monate + ' Monat' + (ein.monate === 1 ? '' : 'en')
      };
    }
  },

  {
    id: 'fix',
    label: 'Fixkosten gesamt',
    beschreibung: 'Summe aller aktiven Posten pro Monat',
    wert: function () {
      if (typeof Fixkosten === 'undefined') {
        return { text: geldE(0), klasse: '', kontext: '' };
      }
      const anzahl = (Daten.fixkosten || []).filter((f) => f.aktiv !== false).length;

      return {
        text: geldE(Fixkosten.monatsSumme()),
        klasse: '',
        kontext: anzahl
          ? anzahl + ' Posten · pro Monat'
          : 'noch keine Posten eingetragen'
      };
    }
  },

  {
    id: 'quote',
    label: 'Erfassungsquote',
    beschreibung: 'Erfasste Tage der letzten 30',
    wert: function () {
      const anzahl = Zaehler.anzahl();
      return {
        text: String(anzahl),
        // Wie in der Zeile darunter: ab dem Ziel grün, sonst neutral.
        // Nie rot - der Zähler mahnt nicht.
        klasse: anzahl >= ZIEL_TAGE ? 'gut' : '',
        kontext: 'von ' + FENSTER_TAGE + ' Tagen erfasst'
      };
    }
  }

];

/* ============================================================
   Startseite
   ============================================================ */

const KAT_KURZ = 4;   // so viele Kategorien stehen offen, der Rest klappt auf

const Start = {

  zeitraum: 1,        // Monate für die Kategorie-Auswertung
  katOffen: false,    // ist die Kategorieliste aufgeklappt?

  tageRest: function () {
    const d = new Date();
    const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return letzter - d.getDate();
  },

  /* Oben eine leise Ansprache, darunter die Kennzahlen zum Wischen.
     Alles Weitere ordnet sich darunter ein - und was nur beim genauen
     Hinsehen zählt, liegt eine Tippbewegung tiefer. */
  html: function () {
    return '<div class="inhalt start-inhalt">' +
        this.begruessung() +
        this.karussell() +
        this.nulltagZeile() +
        this.band() +
        this.ruecklagenKarte() +
        this.kategorienKarte() +
      '</div>';
  },

  /* Eine halbe Zeile, kein Header. Ohne Namen: Keel fragt nirgends nach
     einem, und eine Abfrage nur für diese Zeile wäre der falsche Preis. */
  begruessung: function () {
    const stunde = new Date().getHours();
    const text = stunde < 5  ? 'Guten Abend'
               : stunde < 11 ? 'Guten Morgen'
               : stunde < 18 ? 'Guten Tag'
               :               'Guten Abend';
    return '<p class="gruss">' + text + '</p>';
  },

  /* Das Kennzahlen-Karussell. Gewischt wird mit scroll-snap, nicht mit
     JavaScript: das Gerät bringt die Trägheit und das Einrasten selbst
     mit, und zwar besser als jede Nachbildung. JS berührt hier nur die
     Punkte darunter - siehe verdrahte(). */
  karussell: function () {
    const sichtbar = KARTEN.filter((k) => this.karteAn(k.id));

    // Alle Karten abgeschaltet: dann steht dort nichts. Kein Platzhalter,
    // kein Hinweis - es war eine bewusste Entscheidung des Nutzers.
    if (!sichtbar.length) return '';

    return '<div class="kk">' +
        '<div class="kk-spur">' +
          sichtbar.map((k) => {
            const w = k.wert();
            return '<div class="kk-karte">' +
                '<div class="kk-label">' + esc(k.label) + '</div>' +
                '<div class="kk-wert' + (w.klasse ? ' ' + w.klasse : '') +
                  kkKlasse(w.text) + '">' + esc(w.text) + '</div>' +
                (w.kontext ? '<div class="kk-kontext">' + esc(w.kontext) + '</div>' : '') +
              '</div>';
          }).join('') +
        '</div>' +
        (sichtbar.length > 1
          ? '<div class="kk-punkte" aria-hidden="true">' +
              sichtbar.map((k, i) => '<i' + (i === 0 ? ' class="an"' : '') + '></i>').join('') +
            '</div>'
          : '') +
      '</div>';
  },

  karteAn: function (id) {
    return (Daten.einstellungen.karten || {})[id] !== false;
  },

  /* Nach dem Zeichnen: die Punkte dem Wischen nachführen. Der Index kommt
     nicht aus einer Kartenbreite - die Karte, deren Mitte der Mitte des
     Ausschnitts am nächsten liegt, ist die aktuelle. Das stimmt auch bei
     ungleich breiten Karten und bei jedem Rand. */
  verdrahte: function (ziel) {
    const spur = ziel.querySelector('.kk-spur');
    const punkte = ziel.querySelectorAll('.kk-punkte i');
    if (!spur || !punkte.length) return;

    let laeuft = false;
    spur.addEventListener('scroll', function () {
      if (laeuft) return;
      laeuft = true;

      requestAnimationFrame(function () {
        laeuft = false;
        const mitte = spur.scrollLeft + spur.clientWidth / 2;

        let beste = 0;
        let kleinster = Infinity;
        Array.prototype.forEach.call(spur.children, function (karte, i) {
          const abstand = Math.abs(karte.offsetLeft + karte.offsetWidth / 2 - mitte);
          if (abstand < kleinster) { kleinster = abstand; beste = i; }
        });

        punkte.forEach(function (p, i) { p.classList.toggle('an', i === beste); });
      });
    }, { passive: true });
  },

  /* Vom Erfassungs-Zähler bleibt an dieser Stelle nur die Handlung: der
     einzige Weg, einen Nulltag einzutragen. Die Zahl steht jetzt im
     Karussell, sie hier ein zweites Mal zu nennen wäre doppelt. */
  nulltagZeile: function () {
    if (Zaehler.heuteErfasst()) return '';
    return '<div class="zaehler">' +
        '<button class="zaehler-knopf" data-tu="nulltag">Heute nichts ausgegeben</button>' +
      '</div>';
  },

  /* Höchstens EIN Band, nach Dringlichkeit. Vorher konnten drei
     gleichzeitig zwischen der großen Zahl und den Karten stehen. */
  band: function () {
    if (this.nichtsEingerichtet()) {
      return this.bandHtml('⚙️', 'Mindestnetto und Fixkosten eintragen', 'einstellungen', null);
    }
    if (typeof Backup !== 'undefined' && Backup.bandZeigen()) {
      return this.bandHtml('💾', 'Zeit für ein Backup', 'export', 'backup-band-weg');
    }
    return this.zweiterTagHinweis();
  },

  bandHtml: function (symbol, text, tu, tuZu) {
    return '<div class="band-hinweis">' +
        '<button class="bh-haupt" data-tu="' + tu + '">' +
          '<span class="bh-symbol">' + symbol + '</span>' +
          '<span class="bh-text">' + esc(text) + '</span>' +
          '<span class="chevron">›</span>' +
        '</button>' +
        (tuZu
          ? '<button class="bh-zu" data-tu="' + tuZu + '" aria-label="Für heute ausblenden">✕</button>'
          : '') +
      '</div>';
  },

  /* Ein einziger leiser Hinweis, höchstens einmal am Tag. Er führt jetzt
     direkt in die Erfassung, statt nur davon zu sprechen. */
  zweiterTagHinweis: function () {
    if (Zaehler.heuteErfasst() || Zaehler.gesternErfasst()) return '';

    const heute = heuteISO();
    if (Daten.einstellungen.hinweisTag === heute) return '';
    Daten.einstellungen.hinweisTag = heute;
    sichern();

    return this.bandHtml('✏️', 'Zwei Tage nichts erfasst', 'neue-buchung', null);
  },

  nichtsEingerichtet: function () {
    return !(Daten.einstellungen.mindestnettoCent > 0) &&
           !(Daten.fixkosten || []).length;
  },

  /* Notgroschen und Sparziel standen als zwei gleich aussehende Karten
     untereinander - mit doppeltem Balken, doppeltem Ziel und doppelter
     Prozentzahl. Jetzt eine Karte, zwei Zeilen. Die Prozentzahl ist weg:
     der Balken zeigt sie bereits. */
  ruecklagenKarte: function () {
    const n = Daten.notgroschen || { standCent: 0, zielCent: 0 };
    const stand = Notgroschen.stand();        // gekoppelt: Stand des Postens
    const hatNot = !!(stand || n.zielCent);

    const ziele = Daten.sparziele || [];
    const z = ziele.find((x) => x.aufStartseite) || ziele[0] || null;

    if (!hatNot && !z) {
      return '<button class="karte karte-knopf leer-karte" data-tu="sparen">' +
        '<span class="leer-symbol">🛟</span>' +
        '<span class="leer-text">Notgroschen und Sparziele</span>' +
        '<span class="chevron">›</span></button>';
    }

    return '<button class="karte karte-knopf" data-tu="sparen">' +
      '<p class="karte-titel">Rücklagen<span class="karte-pfeil">›</span></p>' +
      (hatNot ? this.ruecklageZeile('🛟', 'Notgroschen', stand, n.zielCent)
              : this.ruecklageLeer('🛟', 'Notgroschen')) +
      (z ? this.ruecklageZeile('🎯', z.name, z.standCent, z.zielCent)
         : this.ruecklageLeer('🎯', 'Sparziel')) +
      (ziele.length > 1
        ? '<div class="rl-weitere">und ' + (ziele.length - 1) + ' weitere' +
          (ziele.length === 2 ? 's Ziel' : ' Ziele') + '</div>'
        : '') +
    '</button>';
  },

  ruecklageZeile: function (symbol, name, standCent, zielCent) {
    const anteil = zielCent > 0 ? Math.min(1, standCent / zielCent) : 0;
    return '<div class="rl-zeile">' +
        '<div class="rl-kopf">' +
          '<span class="rl-name">' + esc(symbol) + ' ' + esc(name) + '</span>' +
          '<span class="rl-wert">' + geld(standCent) +
            (zielCent > 0 ? '<small> von ' + geld(zielCent) + ' €</small>' : ' €') +
          '</span>' +
        '</div>' +
        (zielCent > 0
          ? '<div class="spar-balken"><i style="width:' + (anteil * 100).toFixed(1) + '%"></i></div>'
          : '') +
      '</div>';
  },

  ruecklageLeer: function (symbol, name) {
    return '<div class="rl-zeile rl-leer">' +
        '<span class="rl-name">' + esc(symbol) + ' ' + esc(name) + '</span>' +
        '<span class="rl-wert">noch nicht angelegt</span>' +
      '</div>';
  },

  /* Kurz gehalten: die vier größten Kategorien stehen offen, der Rest
     klappt auf. Der Zeitraum-Umschalter liegt mit im aufgeklappten Teil -
     wer ihn braucht, sieht ohnehin gerade genauer hin. */
  kategorienKarte: function () {
    const monate = this.zeitraum;
    const bis = monatVon(heuteISO());
    const von = monatVerschieben(bis, -(monate - 1));

    const proKat = {};
    Daten.buchungen.forEach((b) => {
      if (b.typ !== 'ausgabe' || !zaehltMit(b)) return;
      const m = wirkMonat(b);
      if (m < von || m > bis) return;
      proKat[b.kategorieId] = (proKat[b.kategorieId] || 0) + b.betragCent;
    });

    const liste = Object.keys(proKat)
      .map((id) => ({ id: id, cent: proKat[id] }))
      .sort((a, b) => b.cent - a.cent);

    // Der Zeitraum steht nur dann im Titel, wenn er vom Normalfall abweicht.
    const titel = 'Ausgaben' + (monate > 1 ? ' · ' + monate + ' Monate' : '');

    const schalter =
      '<div class="zeitschalter" role="group" aria-label="Zeitraum">' +
        [1, 3, 6, 12].map((m) =>
          '<button data-zeitraum="' + m + '" aria-pressed="' + (m === monate) + '">' +
          m + ' M</button>').join('') +
      '</div>';

    if (!liste.length) {
      // Der Zeitraum-Umschalter erscheint nur, wenn es ueberhaupt irgendwann
      // Ausgaben gab - sonst schiebt man einen leeren Zeitraum hin und her.
      const jeAusgaben = Daten.buchungen.some((b) => b.typ === 'ausgabe');
      return '<div class="karte">' +
        '<p class="karte-titel">' + esc(titel) + '</p>' +
        (jeAusgaben ? schalter : '') +
        '<div class="leer-hinweis" style="padding:18px 8px">Nichts ausgegeben.</div>' +
      '</div>';
    }

    const groesste = liste[0].cent;
    const gesamt = liste.reduce((s, e) => s + e.cent, 0);
    const sichtbar = this.katOffen ? liste : liste.slice(0, KAT_KURZ);

    return '<div class="karte">' +
      '<p class="karte-titel">' + esc(titel) +
        '<span class="karte-summe">' + geldE(gesamt) + '</span></p>' +
      (this.katOffen ? schalter : '') +
      sichtbar.map((e) => {
        const k = kategorie(e.id) || { name: 'Unbekannt', emoji: '❓' };
        const breite = Math.max(3, Math.round(e.cent / groesste * 100));
        return '<div class="kat-zeile">' +
          '<div class="kat-kopf">' +
            '<span class="emoji">' + esc(k.emoji) + '</span>' +
            '<span class="name">' + esc(k.name) + '</span>' +
            '<span class="betrag">' + geld(e.cent) + '</span>' +
          '</div>' +
          '<div class="balken"><i style="width:' + breite + '%;background:' + katFarbe() + '"></i></div>' +
        '</div>';
      }).join('') +
      (liste.length > KAT_KURZ || this.katOffen
        ? '<button class="mehr-zeile" data-tu="kat-mehr">' +
            (this.katOffen ? 'weniger' : 'alle ' + liste.length + ' anzeigen') +
          '</button>'
        : '') +
    '</div>';
  }
};

/* ============================================================
   Reiter "Ein & Aus"
   ============================================================ */

const EinAus = {

  detailOffen: false,   // steht die Rechnung im Detail offen?

  /* Der Schirm hatte dieselbe Monatsrechnung viermal gezeigt: als Band, als
     Legende, als Fixkostenliste und als Rechnung. Jetzt trägt das Band sie,
     die Fixkosten zeigen nur noch, was aussteht, und die Rechnung liegt
     aufklappbar darunter. */
  html: function () {
    const monat = UI.zustand.monat;
    const r = Monatsrechnung.alles(monat);

    return '<div class="kopf kopf-schlank">' + UI.monatswahlHtml() + '</div>' +
      '<div class="inhalt">' +
        this.bandKarte(r) +
        this.fixkostenKarte(monat, r) +
        this.rechnung(monat, r) +
        '<button class="listen-knopf" data-tu="liste-ausgaben">' +
          '<span class="sym">🧾</span>' +
          '<span class="txt">Alle Ausgaben<small>' +
            buchungenText(buchungenImMonat(monat, 'ausgabe').length) +
          '</small></span><span class="chevron">›</span></button>' +
        '<button class="listen-knopf" data-tu="liste-einnahmen">' +
          '<span class="sym">💰</span>' +
          '<span class="txt">Alle Einnahmen<small>' +
            buchungenText(buchungenImMonat(monat, 'einnahme').length) +
          '</small></span><span class="chevron">›</span></button>' +
      '</div>';
  },

  /* Die tragende Karte des Schirms. Fixkosten und Sparen sind zwei
     Helligkeitsstufen desselben Blaus: beides ist fest verplant, nur
     unterschiedlicher Art. Zwei getrennte Farbtöne wären bei Rot-Grün-
     Sehschwäche nicht zu unterscheiden.

     Der Betrag steht in der Wertspalte, nicht zusätzlich im Namen. Die
     Summe im Kartentitel ist das Geld, um das es hier überhaupt geht. */
  bandKarte: function (r) {
    const fixGesamt = r.fixBezahltCent + r.fixOffenCent;
    const frei = Math.max(0, r.verfuegbarCent);
    const basis = Math.max(r.einnahmenCent,
      fixGesamt + r.sparrateCent + r.variabelCent, 1);

    const teile = [
      { farbe: 'var(--dg-blau-tief)', name: 'Fixkosten',           cent: fixGesamt },
      { farbe: 'var(--dg-blau)',      name: 'Sparen',              cent: r.sparrateCent },
      { farbe: 'var(--dg-teal)',      name: 'variabel ausgegeben', cent: r.variabelCent },
      { farbe: 'var(--linie)',        name: 'noch verfügbar',      cent: frei }
    ].filter((t) => t.cent > 0);

    return '<div class="karte">' +
      '<p class="karte-titel">Wohin dein Geld geht' +
        '<span class="karte-summe">' + geldE(r.einnahmenCent) + '</span></p>' +
      '<div class="band">' +
        teile.map((t) => '<i style="width:' + (t.cent / basis * 100).toFixed(1) +
          '%;background:' + t.farbe + '"></i>').join('') +
      '</div>' +
      '<div class="legende">' +
        teile.map((t) => '<div class="legenden-zeile">' +
          '<span class="punkt" style="background:' + t.farbe + '"></span>' +
          '<span class="name">' + esc(t.name) + '</span>' +
          '<span class="wert">' + geld(t.cent) + '</span>' +
        '</div>').join('') +
      '</div>' +
      // Nur wenn das Gehalt fehlt - dann steht die ganze Karte auf einer
      // Schaetzung, und das gehoert dazugesagt.
      (r.geschaetzt
        ? '<div class="band-fuss">Gehalt noch nicht da · gerechnet mit ' +
            geldE(r.mindestCent) + '</div>'
        : '') +
    '</div>';
  },

  /* Nur was aussteht. Das bereits Abgebuchte steckt schon im Band - hier
     stand es ein zweites Mal, oft fuenfzehn Zeilen lang. Die vollstaendige
     Liste liegt eine Tippbewegung entfernt im Fixkosten-Blatt. */
  fixkostenKarte: function (monat, r) {
    if (typeof Fixkosten === 'undefined') return '';
    const faellig = (Daten.fixkosten || []).filter((f) =>
      f.aktiv !== false && Fixkosten.faelligImMonat(f, monat));

    if (!faellig.length) {
      return '<button class="karte karte-knopf leer-karte" data-tu="fixkosten">' +
        '<span class="leer-symbol">📌</span>' +
        '<span class="leer-text">Fixkosten eintragen</span>' +
        '<span class="chevron">›</span></button>';
    }

    const offen    = faellig.filter((f) => !Fixkosten.schonAbgebucht(f, monat));
    const gebucht  = faellig.length - offen.length;

    const zeilen = offen
      .sort((a, b) => b.betragCent - a.betragCent)
      .map((f) => '<div class="posten-zeile">' +
          '<span>' + esc(f.name) + '</span>' +
          '<span class="wert">' + geld(f.betragCent) + '</span>' +
        '</div>').join('');

    return '<button class="karte karte-knopf" data-tu="fixkosten">' +
      '<p class="karte-titel">Fixkosten' +
        '<span class="karte-summe">' +
          (r.fixOffenCent > 0 ? geldE(r.fixOffenCent) + ' offen'
                              : '<span class="gut">✓ durchgelaufen</span>') +
        '</span></p>' +
      zeilen +
      (gebucht
        ? '<div class="karte-fuss">' + gebucht + ' bereits abgebucht</div>'
        : '') +
    '</button>';
  },

  /* Die Nachvollziehbarkeit der Zahl. Sie wird einmal beim Kennenlernen
     gelesen und danach selten - deshalb liegt sie zugeklappt da und nicht
     als halber Schirm voller Zeilen. */
  rechnung: function (monat, r) {
    if (!this.detailOffen) {
      return '<button class="detail-zeile" data-tu="rechnung-mehr">' +
        'Rechnung im Detail<span class="chevron">›</span></button>';
    }

    // Die Bezeichnung darf ausgezeichnetes HTML enthalten - der Aufrufer
    // maskiert selbst, was aus den Daten kommt.
    const zeile = (labelHtml, cent) =>
      '<div class="rechnung-zeile"><span>' + labelHtml + '</span>' +
        '<span class="wert">' + geld(cent) + '</span></div>';

    // Der Gehaltsstand steht an der Gehaltszeile selbst. Vorher stand er in
    // einer eigenen Karte darueber - und die Zeile "Gehalt" danach ein
    // zweites Mal.
    const g = Monatsrechnung.gehalt(monat);
    const gehaltLabel = g.da
      ? 'Gehalt <small class="gut">✓ am ' + esc(datumText(g.buchungen[0].datum)) + '</small>'
      : 'Gehalt <small class="leise">noch nicht da</small>';

    const quote = r.einnahmenCent > 0 && typeof Fixkosten !== 'undefined'
      ? Math.round(Fixkosten.monatsSumme() / r.einnahmenCent * 100) : null;

    return '<div class="karte">' +
      '<p class="karte-titel">Rechnung im Detail</p>' +
      zeile(gehaltLabel, r.gehaltCent) +
      (r.sonstigeCent > 0 ? zeile('sonstige Einnahmen', r.sonstigeCent) : '') +
      (r.sparrateCent > 0 ? zeile('− Sparrate', -r.sparrateCent) : '') +
      (r.fixBezahltCent > 0 ? zeile('− Fixkosten bezahlt', -r.fixBezahltCent) : '') +
      (r.variabelCent > 0 ? zeile('− variabel ausgegeben', -r.variabelCent) : '') +
      (r.fixOffenCent > 0 ? zeile('− Fixkosten noch offen', -r.fixOffenCent) : '') +
      '<div class="rechnung-zeile summe"><span>steht dir zur Verfügung</span>' +
        '<span class="wert">' + geldE(r.verfuegbarCent) + '</span></div>' +
      (quote !== null
        ? '<div class="quote"><span>Fixkostenquote</span><b>' + quote + ' %</b></div>'
        : '') +
      '<button class="mehr-zeile" data-tu="rechnung-mehr">weniger</button>' +
    '</div>';
  }
};

/* ============================================================
   Sparen: Sparrate, Notgroschen, Sparziele
   ============================================================ */

const Sparen = {

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Sparen',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => this.zeichne(koerper)
    });
  },

  zeichne: function (koerper) {
    koerper = koerper || Blatt.koerper();
    if (!koerper) return;

    const n = Daten.notgroschen;
    const fix = typeof Fixkosten !== 'undefined' ? Fixkosten.monatsSumme() : 0;
    const posten = Notgroschen.posten();
    const stand = Notgroschen.stand();

    koerper.innerHTML =
      '<p class="abschnitt-titel" style="margin-top:0">Monatliche Sparrate</p>' +
      '<div class="feld">' +
        '<input type="text" inputmode="decimal" id="sp-rate" ' +
        'value="' + (Daten.einstellungen.sparrateCent ? geld(Daten.einstellungen.sparrateCent) : '') + '" ' +
        'placeholder="0,00">' +
        '<div class="hinweis" style="margin:7px 0 0;padding:0">Wird vom verfügbaren Geld ' +
          'abgezogen. Keel bucht nichts automatisch um.</div>' +
      '</div>' +

      '<p class="abschnitt-titel">Notgroschen</p>' +

      '<div class="feld"><label>Wo liegt er?</label>' +
        '<select id="sp-not-vm">' +
          '<option value=""' + (posten ? '' : ' selected') + '>Nirgends – Stand von Hand pflegen</option>' +
          (Daten.vermoegen || []).map((p) =>
            '<option value="' + esc(p.id) + '"' + (posten && posten.id === p.id ? ' selected' : '') + '>' +
            esc((p.emoji ? p.emoji + ' ' : '') + p.name) + '</option>').join('') +
          '<option value="__neu">＋ Neuen Vermögensposten anlegen</option>' +
        '</select></div>' +

      /* Gekoppelt gab es hier frueher ein gesperrtes Eingabefeld, drei Saetze
         Erklaerung, warum es gesperrt ist, und einen zweiten Knopf, der
         woanders hinfuehrt. Ein Feld, das erklaeren muss, warum man nicht
         hineinschreiben darf, ist das falsche Element. Jetzt steht dort eine
         Zeile, die den Stand zeigt und in den Posten fuehrt. */
      (posten
        ? '<div class="liste"><button class="listenzeile" id="sp-not-oeffnen">' +
            '<span class="icon">' + esc(posten.emoji || '🏦') + '</span>' +
            '<span class="mitte"><span class="haupt">' + esc(posten.name) + '</span>' +
              '<span class="neben">Stand hier eintragen</span></span>' +
            '<span class="rechts mono">' + geld(stand) + '</span>' +
            '<span class="chevron">›</span>' +
          '</button></div>' +
          '<div class="feld"><label>Ziel</label>' +
            '<input type="text" inputmode="decimal" id="sp-not-ziel" ' +
            'value="' + (n.zielCent ? geld(n.zielCent) : '') + '" placeholder="0,00"></div>'
        : '<div class="feld-reihe">' +
            '<div class="feld"><label>Aktueller Stand</label>' +
              '<input type="text" inputmode="decimal" id="sp-not-ist" ' +
              'value="' + (stand ? geld(stand) : '') + '" placeholder="0,00"></div>' +
            '<div class="feld"><label>Ziel</label>' +
              '<input type="text" inputmode="decimal" id="sp-not-ziel" ' +
              'value="' + (n.zielCent ? geld(n.zielCent) : '') + '" placeholder="0,00"></div>' +
          '</div>') +

      // Kein Ratgebertext, sondern eine Zeile: der Wert und der Massstab,
      // an dem man ihn misst. Ohne Daten steht dort nichts.
      (fix > 0 && stand > 0
        ? '<p class="hinweis" style="margin-top:-4px">Deckt ' +
          (stand / fix).toFixed(1).replace('.', ',') + ' Monate Fixkosten · empfohlen 3–6</p>'
        : '') +

      '<p class="abschnitt-titel">Sparziele</p>' +
      ((Daten.sparziele || []).length
        ? '<div class="liste">' + Daten.sparziele.map((z) => {
            const anteil = z.zielCent > 0 ? Math.min(1, z.standCent / z.zielCent) : 0;
            return '<button class="listenzeile" data-sz="' + esc(z.id) + '">' +
              '<span class="icon">' + (z.aufStartseite ? '⭐' : '🎯') + '</span>' +
              '<span class="mitte"><span class="haupt">' + esc(z.name) + '</span>' +
                '<span class="neben">' + geld(z.standCent) + ' € von ' + geld(z.zielCent) + ' € · ' +
                  Math.round(anteil * 100) + ' %' +
                  (z.aufStartseite ? ' · auf der Startseite' : '') + '</span></span>' +
              '<span class="chevron">›</span></button>';
          }).join('') + '</div>'
        : '<p class="hinweis" style="margin-top:0">Noch kein Sparziel angelegt.</p>') +

      '<button class="knopf zweit" id="sp-neu">Sparziel hinzufügen</button>' +
      '<div style="height:20px"></div>';

    const merke = () => {
      Daten.einstellungen.sparrateCent = Math.abs(CSVLeser.zuCent(koerper.querySelector('#sp-rate').value) || 0);
      // Bei gekoppeltem Notgroschen gehoert der Stand dem Vermoegensposten -
      // von hier aus wird er nicht ueberschrieben, das Feld gibt es dann gar nicht.
      const istFeld = koerper.querySelector('#sp-not-ist');
      if (!Notgroschen.gekoppelt() && istFeld) {
        Daten.notgroschen.standCent = Math.abs(CSVLeser.zuCent(istFeld.value) || 0);
      }
      Daten.notgroschen.zielCent = Math.abs(CSVLeser.zuCent(koerper.querySelector('#sp-not-ziel').value) || 0);
      sichern();
      UI.zeichne();
    };

    // "#sp-not-ist" gibt es nur ungekoppelt - gekoppelt steht dort eine Zeile
    // statt eines Feldes.
    ['#sp-rate', '#sp-not-ist', '#sp-not-ziel'].forEach((s) => {
      const feld = koerper.querySelector(s);
      if (feld) feld.addEventListener('change', merke);
    });

    koerper.querySelector('#sp-not-vm').addEventListener('change', (e) => {
      const wahl = e.target.value;
      merke(); // erst den handgepflegten Stand festhalten, dann umstellen

      if (wahl === '__neu') {
        const p = Notgroschen.alsPostenAnlegen();
        UI.melde('Posten „' + p.name + '" im Vermögen angelegt', 'gut');
      } else if (wahl) {
        const p = Notgroschen.koppeln(wahl);
        UI.melde(p ? 'Mit „' + p.name + '" verknüpft' : 'Posten nicht gefunden', p ? 'gut' : 'fehler');
      } else {
        Notgroschen.loesen();
        UI.melde('Verknüpfung gelöst');
      }

      sichern();
      this.zeichne(koerper);
      UI.zeichne();
    });

    const notOeffnen = koerper.querySelector('#sp-not-oeffnen');
    if (notOeffnen) notOeffnen.addEventListener('click', () => {
      merke();
      // Das Sparen-Blatt zumachen, damit der Posten allein davorsteht.
      Blatt.schliessen();
      Vermoegen.bearbeiten(posten.id);
    });

    koerper.querySelector('#sp-neu').addEventListener('click', () => { merke(); this.zielBearbeiten(null); });
    koerper.querySelectorAll('[data-sz]').forEach((b) =>
      b.addEventListener('click', () => { merke(); this.zielBearbeiten(b.dataset.sz); }));
  },

  zielBearbeiten: function (zielId) {
    const vorhanden = zielId ? (Daten.sparziele || []).find((z) => z.id === zielId) : null;
    const z = vorhanden ? Object.assign({}, vorhanden)
      : { id: null, name: '', standCent: 0, zielCent: 0, aufStartseite: !(Daten.sparziele || []).length };

    Blatt.oeffnen({
      titel: vorhanden ? 'Sparziel bearbeiten' : 'Neues Sparziel',
      linksText: 'Abbrechen',
      rechtsText: 'Sichern',
      beiRechts: () => speichern(),
      nachOeffnen: (koerper) => {
        koerper.innerHTML =
          '<div class="feld"><label>Wofür sparst du?</label>' +
            '<input type="text" id="sz-name" value="' + esc(z.name) + '" ' +
            'placeholder="z. B. Neues Auto" autocomplete="off" enterkeyhint="done"></div>' +
          '<div class="feld-reihe">' +
            '<div class="feld"><label>Aktueller Stand</label>' +
              '<input type="text" inputmode="decimal" id="sz-ist" ' +
              'value="' + (z.standCent ? geld(z.standCent) : '') + '" placeholder="0,00"></div>' +
            '<div class="feld"><label>Ziel</label>' +
              '<input type="text" inputmode="decimal" id="sz-ziel" ' +
              'value="' + (z.zielCent ? geld(z.zielCent) : '') + '" placeholder="0,00"></div>' +
          '</div>' +
          '<div class="schalter-zeile" style="margin-bottom:15px">' +
            '<div class="txt">Auf der Startseite zeigen' +
              '<small>Es kann immer nur ein Ziel dort stehen</small></div>' +
            '<div class="schalter' + (z.aufStartseite ? ' an' : '') + '" id="sz-start"></div>' +
          '</div>' +
          '<button class="knopf" id="sz-speichern">Speichern</button>' +
          (vorhanden ? '<button class="knopf gefahr" id="sz-loeschen">Sparziel löschen</button>' : '') +
          '<div style="height:20px"></div>';

        koerper.querySelector('#sz-start').addEventListener('click', function () {
          z.aufStartseite = !z.aufStartseite;
          this.classList.toggle('an', z.aufStartseite);
        });
        koerper.querySelector('#sz-speichern').addEventListener('click', () => speichern());

        const loeschen = koerper.querySelector('#sz-loeschen');
        if (loeschen) loeschen.addEventListener('click', () => {
          if (!confirm('Sparziel „' + z.name + '" löschen?')) return;
          Daten.sparziele = (Daten.sparziele || []).filter((x) => x.id !== z.id);
          if (Daten.sparziele.length && !Daten.sparziele.some((x) => x.aufStartseite)) {
            Daten.sparziele[0].aufStartseite = true;
          }
          sichern(); Blatt.schliessen(); Sparen.zeichne(); UI.zeichne();
          UI.melde('Gelöscht');
        });
      }
    });

    function speichern() {
      const koerper = Blatt.koerper();
      const name = koerper.querySelector('#sz-name').value.trim();
      if (!name) { UI.melde('Bitte einen Namen eingeben', 'fehler'); return; }

      z.name = name;
      z.standCent = Math.abs(CSVLeser.zuCent(koerper.querySelector('#sz-ist').value) || 0);
      z.zielCent  = Math.abs(CSVLeser.zuCent(koerper.querySelector('#sz-ziel').value) || 0);

      if (!Daten.sparziele) Daten.sparziele = [];
      if (z.id) {
        const i = Daten.sparziele.findIndex((x) => x.id === z.id);
        if (i >= 0) Daten.sparziele[i] = z;
      } else {
        z.id = neueId('sz');
        Daten.sparziele.push(z);
      }

      // Nur ein Ziel darf auf der Startseite stehen.
      if (z.aufStartseite) {
        Daten.sparziele.forEach((x) => { if (x.id !== z.id) x.aufStartseite = false; });
      } else if (!Daten.sparziele.some((x) => x.aufStartseite)) {
        Daten.sparziele[0].aufStartseite = true;
      }

      sichern(); Blatt.schliessen(); Sparen.zeichne(); UI.zeichne();
      UI.melde('Gespeichert', 'gut');
    }
  }
};

/* ============================================================
   Dashboard-Karten
   ============================================================
   Ein Schalter je Eintrag aus KARTEN. Die Liste selbst steht
   nicht hier - sie kommt aus der Registry, damit ein neuer
   Kartentyp an dieser Stelle nichts kostet.

   Umgeschaltet wird sofort, ohne Speichern-Knopf: es gibt
   nichts zu prüfen und nichts zurückzunehmen.
   ============================================================ */

const Dashboard = {

  // Wie viele Karten sind an? Steht in der Zeile im Reiter "Mehr".
  anzahlAn: function () {
    return KARTEN.filter((k) => Start.karteAn(k.id)).length;
  },

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Dashboard-Karten',
      linksText: 'Fertig',
      // Die Startseite liegt hinter dem Blatt. Sie wird erst beim
      // Schliessen neu gezeichnet - waehrend des Schaltens wuerde das
      // nur unter dem Blatt flackern.
      beimSchliessen: () => UI.zeichne(),
      nachOeffnen: (koerper) => {
        const karten = Daten.einstellungen.karten;

        koerper.innerHTML =
          '<p class="hinweis" style="margin-top:0">Welche Kennzahlen oben auf der ' +
            'Startseite zum Wischen bereitstehen.</p>' +

          KARTEN.map((k) =>
            '<div class="schalter-zeile">' +
              '<div class="txt">' + esc(k.label) +
                '<small>' + esc(k.beschreibung) + '</small></div>' +
              '<div class="schalter' + (Start.karteAn(k.id) ? ' an' : '') +
                '" data-karte="' + esc(k.id) + '" role="switch" tabindex="0" ' +
                'aria-checked="' + Start.karteAn(k.id) + '" ' +
                'aria-label="' + esc(k.label) + '"></div>' +
            '</div>').join('') +

          '<div style="height:20px"></div>';

        koerper.querySelectorAll('[data-karte]').forEach((schalter) => {
          schalter.addEventListener('click', function () {
            const id = this.dataset.karte;
            const an = !Start.karteAn(id);
            karten[id] = an;
            this.classList.toggle('an', an);
            this.setAttribute('aria-checked', String(an));
            sichern();
          });
        });
      }
    });
  }
};

/* ============================================================
   Einstellungen
   ============================================================ */

const Einstellungen = {

  oeffnen: function () {
    Blatt.oeffnen({
      titel: 'Einstellungen',
      linksText: 'Fertig',
      nachOeffnen: (koerper) => {
        const e = Daten.einstellungen;

        koerper.innerHTML =
          '<div class="feld"><label>Mindestnetto pro Monat</label>' +
            '<input type="text" inputmode="decimal" id="es-netto" ' +
            'value="' + (e.mindestnettoCent ? geld(e.mindestnettoCent) : '') + '" placeholder="0,00">' +
            '<div class="hinweis" style="margin:7px 0 0;padding:0">Womit Keel rechnet, ' +
              'solange das Gehalt noch nicht da ist.</div></div>' +

          // Frueher hiess der Schalter "Gehalt gilt fuer den Folgemonat" und
          // brauchte darunter eine Unterzeile und einen vierzeiligen Absatz mit
          // Beispiel, um verstanden zu werden. Jetzt nennt er die Regel selbst.
          '<div class="schalter-zeile" style="margin-bottom:15px">' +
            '<div class="txt">Gehalt ab dem 16. zählt für den nächsten Monat</div>' +
            '<div class="schalter' + (e.gehaltVerschieben !== false ? ' an' : '') + '" id="es-schieben"></div>' +
          '</div>' +
          // Keine Erklaerung, sondern eine Bedingung: ohne diese Kategorie
          // greift die Regel nicht.
          '<p class="hinweis" style="margin-top:-4px">Gilt für Buchungen der Kategorie ' +
            '<b>💼 Gehalt</b>.</p>' +

          '<button class="knopf" id="es-speichern">Speichern</button>' +
          '<div style="height:20px"></div>';

        koerper.querySelector('#es-schieben').addEventListener('click', function () {
          e.gehaltVerschieben = !(e.gehaltVerschieben !== false);
          this.classList.toggle('an', e.gehaltVerschieben);
        });

        koerper.querySelector('#es-speichern').addEventListener('click', () => {
          e.mindestnettoCent = Math.abs(CSVLeser.zuCent(koerper.querySelector('#es-netto').value) || 0);
          sichern();
          Blatt.schliessen();
          UI.zeichne();
          UI.melde('Gespeichert', 'gut');
        });
      }
    });
  }
};
