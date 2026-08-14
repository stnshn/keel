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
   Startseite
   ============================================================ */

const Start = {

  zeitraum: 1,   // Monate für die Kategorie-Auswertung

  gruss: function () {
    const name = (Daten.einstellungen.name || '').trim();
    const std = new Date().getHours();
    const wort = std < 5  ? 'Noch wach'
               : std < 11 ? 'Guten Morgen'
               : std < 18 ? 'Hallo'
               : 'Guten Abend';
    return name ? wort + ', ' + name : wort;
  },

  tageRest: function () {
    const d = new Date();
    const letzter = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return letzter - d.getDate();
  },

  html: function () {
    const monat = monatVon(heuteISO());
    const r = Monatsrechnung.alles(monat);
    const rest = this.tageRest();

    const klasse = r.verfuegbarCent < 0 ? ' minus'
                 : (r.einnahmenCent > 0 && r.verfuegbarCent < r.einnahmenCent * 0.1) ? ' warn' : '';

    return '<div class="start-kopf">' +
        '<div class="gruss">' + esc(this.gruss()) + '</div>' +
        '<div class="gruss-unter">' + esc(monatText(monat)) + '</div>' +
      '</div>' +
      '<div class="inhalt">' +

        '<div class="karte hero">' +
          '<div class="hero-zahl' + klasse + '">' + geldE(r.verfuegbarCent) + '</div>' +
          '<div class="hero-unter">stehen dir noch zur Verfügung</div>' +
          '<div class="hero-tage">' +
            (rest === 0 ? 'letzter Tag im ' + esc(monatText(monat).split(' ')[0])
                        : 'noch ' + rest + ' Tag' + (rest === 1 ? '' : 'e') +
                          ' im ' + esc(monatText(monat).split(' ')[0])) +
          '</div>' +
          (r.geschaetzt
            ? '<div class="hero-schaetzung">≈ gerechnet mit deinem Mindestnetto</div>'
            : '') +
          this.zaehlerBlock() +
        '</div>' +

        this.zweiterTagHinweis() +
        this.backupBand() +
        this.notgroschenKarte() +
        this.sparzielKarte() +
        this.kategorienKarte() +

        (this.nichtsEingerichtet() ? this.einrichtenHinweis() : '') +
      '</div>';
  },

  // Der Erfassungs-Zähler unter der großen Zahl: eine Zeile Text,
  // darunter 30 Punkte, ältester links.
  zaehlerBlock: function () {
    const tage = Zaehler.fenster();
    const anzahl = tage.reduce((s, t) => s + (t.erfasst ? 1 : 0), 0);

    const punkte = tage.map((t) =>
      '<i class="' + (t.erfasst ? 'an' : '') + '"></i>').join('');

    // Ab dem Ziel in der Erfolgsfarbe, darunter neutral. Nie rot,
    // nie warnend - der Zähler soll nicht mahnen.
    const klasse = anzahl >= ZIEL_TAGE ? ' gut' : '';

    return '<div class="zaehler">' +
        '<div class="zaehler-text">' +
          '<b class="zaehler-zahl' + klasse + '">' + anzahl + '</b> von ' +
          FENSTER_TAGE + ' Tagen erfasst' +
        '</div>' +
        '<div class="zaehler-punkte" aria-hidden="true">' + punkte + '</div>' +
        (Zaehler.heuteErfasst()
          ? ''
          : '<button class="zaehler-knopf" data-tu="nulltag">Heute nichts ausgegeben</button>') +
      '</div>';
  },

  // Ein einziger leiser Hinweis, höchstens einmal am Tag. Keine
  // Benachrichtigung, kein Ton, keine Aufzählung verpasster Tage.
  zweiterTagHinweis: function () {
    if (Zaehler.heuteErfasst() || Zaehler.gesternErfasst()) return '';

    const heute = heuteISO();
    if (Daten.einstellungen.hinweisTag === heute) return '';
    Daten.einstellungen.hinweisTag = heute;
    sichern();

    return '<div class="karte hinweis-leise">' +
      'Zweiter Tag ohne Eintrag — kurz was erfassen?' +
    '</div>';
  },

  /* Das Erinnerungsband. Es steht zwischen den Karten, nicht über der
     großen Zahl - es soll nicht das Erste sein, was ins Auge fällt.
     Ein Antippen führt direkt zur Sicherung, das ✕ legt es für heute weg. */
  backupBand: function () {
    if (typeof Backup === 'undefined' || !Backup.bandZeigen()) return '';

    const tage = Backup.tageSeit();
    const unter = tage === null
      ? 'Deine Daten liegen nur auf diesem iPhone.'
      : 'Das letzte ist ' + tage + ' Tage her.';

    return '<div class="backup-band">' +
        '<button class="bb-haupt" data-tu="export">' +
          '<span class="bb-symbol">💾</span>' +
          '<span class="bb-text"><b>Zeit für ein Backup</b>' +
            '<small>' + esc(unter) + '</small></span>' +
          '<span class="chevron">›</span>' +
        '</button>' +
        '<button class="bb-zu" data-tu="backup-band-weg" aria-label="Für heute ausblenden">✕</button>' +
      '</div>';
  },

  nichtsEingerichtet: function () {
    return !(Daten.einstellungen.mindestnettoCent > 0) &&
           !(Daten.fixkosten || []).length;
  },

  einrichtenHinweis: function () {
    return '<div class="karte" style="text-align:center">' +
      '<div style="font-size:30px;margin-bottom:8px">👋</div>' +
      '<div style="font-size:14.5px;line-height:1.6;color:var(--text-leise)">' +
        'Damit die Zahl oben stimmt, braucht Keel zwei Angaben:<br>' +
        'dein <b>Mindestnetto</b> und deine <b>Fixkosten</b>.' +
      '</div>' +
      '<button class="knopf" data-tu="einstellungen" style="margin-top:14px">Jetzt einrichten</button>' +
    '</div>';
  },

  notgroschenKarte: function () {
    const n = Daten.notgroschen || { standCent: 0, zielCent: 0 };
    if (!n.standCent && !n.zielCent) {
      return '<button class="karte karte-knopf leer-karte" data-tu="sparen">' +
        '<span class="leer-symbol">🛟</span>' +
        '<span class="leer-text"><b>Notgroschen anlegen</b>' +
        '<small>Wie viele Monate trägt dein Polster?</small></span>' +
        '<span class="chevron">›</span></button>';
    }

    const anteil = n.zielCent > 0 ? Math.min(1, n.standCent / n.zielCent) : 0;
    const fix = typeof Fixkosten !== 'undefined' ? Fixkosten.monatsSumme() : 0;
    const fuss = fix > 0
      ? 'deckt ' + (n.standCent / fix).toFixed(1).replace('.', ',') + ' Monate Fixkosten'
      : (n.zielCent > n.standCent
          ? 'noch ' + geld(n.zielCent - n.standCent) + ' € bis zum Ziel'
          : 'Ziel erreicht');

    return '<button class="karte karte-knopf" data-tu="sparen">' +
      '<p class="karte-titel">Notgroschen<span class="karte-pfeil">›</span></p>' +
      '<div class="spar-kopf">' +
        '<span class="spar-stand">' + geldE(n.standCent) + '</span>' +
        '<span class="spar-ziel">Ziel ' + geldE(n.zielCent) + '</span>' +
      '</div>' +
      '<div class="spar-balken"><i style="width:' + (anteil * 100).toFixed(1) + '%"></i></div>' +
      '<div class="spar-fuss">' +
        '<span>' + esc(fuss) + '</span>' +
        '<span class="spar-prozent">' + Math.round(anteil * 100) + ' %</span>' +
      '</div>' +
    '</button>';
  },

  sparzielKarte: function () {
    const liste = Daten.sparziele || [];
    if (!liste.length) {
      return '<button class="karte karte-knopf leer-karte" data-tu="sparen">' +
        '<span class="leer-symbol">🎯</span>' +
        '<span class="leer-text"><b>Sparziel anlegen</b>' +
        '<small>Worauf sparst du gerade?</small></span>' +
        '<span class="chevron">›</span></button>';
    }

    const z = liste.find((x) => x.aufStartseite) || liste[0];
    const anteil = z.zielCent > 0 ? Math.min(1, z.standCent / z.zielCent) : 0;
    const fertig = z.zielCent > 0 && z.standCent >= z.zielCent;

    return '<button class="karte karte-knopf" data-tu="sparen">' +
      '<p class="karte-titel">Sparziel · ' + esc(z.name) +
        '<span class="karte-pfeil">›</span></p>' +
      '<div class="spar-kopf">' +
        '<span class="spar-stand">' + geldE(z.standCent) + '</span>' +
        '<span class="spar-ziel">Ziel ' + geldE(z.zielCent) + '</span>' +
      '</div>' +
      '<div class="spar-balken"><i style="width:' + (anteil * 100).toFixed(1) + '%"></i></div>' +
      '<div class="spar-fuss">' +
        '<span>' + (fertig ? 'Ziel erreicht 🎉'
                           : 'noch ' + geld(Math.max(0, z.zielCent - z.standCent)) + ' € bis zum Ziel') + '</span>' +
        '<span class="spar-prozent">' + Math.round(anteil * 100) + ' %</span>' +
      '</div>' +
      (liste.length > 1
        ? '<div class="spar-weitere">und ' + (liste.length - 1) + ' weitere' +
          (liste.length === 2 ? 's Ziel' : ' Ziele') + '</div>'
        : '') +
    '</button>';
  },

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

    const schalter =
      '<div class="zeitschalter" role="group" aria-label="Zeitraum">' +
        [1, 3, 6, 12].map((m) =>
          '<button data-zeitraum="' + m + '" aria-pressed="' + (m === monate) + '">' +
          m + ' M</button>').join('') +
      '</div>';

    if (!liste.length) {
      return '<div class="karte">' +
        '<p class="karte-titel">Ausgaben nach Kategorie</p>' + schalter +
        '<div class="leer-hinweis" style="padding:22px 8px">Keine Ausgaben in diesem Zeitraum.</div>' +
      '</div>';
    }

    const groesste = liste[0].cent;
    const gesamt = liste.reduce((s, e) => s + e.cent, 0);

    return '<div class="karte">' +
      '<p class="karte-titel">Ausgaben nach Kategorie' +
        '<span class="karte-summe">' + geldE(gesamt) + '</span></p>' +
      schalter +
      liste.map((e) => {
        const k = kategorie(e.id) || { name: 'Unbekannt', emoji: '❓' };
        const breite = Math.max(3, Math.round(e.cent / groesste * 100));
        return '<div class="kat-zeile">' +
          '<div class="kat-kopf">' +
            '<span class="emoji">' + esc(k.emoji) + '</span>' +
            '<span class="name">' + esc(k.name) + '</span>' +
            (monate > 1
              ? '<span class="anteil">⌀ ' + geld(Math.round(e.cent / monate)) + '</span>' : '') +
            '<span class="betrag">' + geldE(e.cent) + '</span>' +
          '</div>' +
          '<div class="balken"><i style="width:' + breite + '%;background:' + katFarbe() + '"></i></div>' +
        '</div>';
      }).join('') +
    '</div>';
  }
};

/* ============================================================
   Reiter "Ein & Aus"
   ============================================================ */

const EinAus = {

  html: function () {
    const monat = UI.zustand.monat;
    const r = Monatsrechnung.alles(monat);

    return '<div class="kopf">' +
        '<h1>Ein &amp; Aus</h1>' +
        '<div class="unterzeile">' + geldE(r.verfuegbarCent) + ' verfügbar</div>' +
        UI.monatswahlHtml() +
      '</div>' +
      '<div class="inhalt">' +
        this.bandKarte(r) +
        this.einnahmenKarte(monat, r) +
        this.fixkostenKarte(monat, r) +
        this.rechnungKarte(r) +
        '<button class="listen-knopf" data-tu="liste-ausgaben">' +
          '<span class="sym">🧾</span>' +
          '<span class="txt">Alle Ausgaben<small>' +
            buchungenImMonat(monat, 'ausgabe').length + ' Buchungen in ' + esc(monatText(monat)) +
          '</small></span><span class="chevron">›</span></button>' +
        '<button class="listen-knopf" data-tu="liste-einnahmen">' +
          '<span class="sym">💰</span>' +
          '<span class="txt">Alle Einnahmen<small>' +
            buchungenImMonat(monat, 'einnahme').length + ' Buchungen in ' + esc(monatText(monat)) +
          '</small></span><span class="chevron">›</span></button>' +
      '</div>';
  },

  // Fixkosten und Sparen sind zwei Helligkeitsstufen desselben Blaus:
  // beides ist fest verplant, nur unterschiedlicher Art. Zwei getrennte
  // Farbtöne wären bei Rot-Grün-Sehschwäche nicht zu unterscheiden.
  bandKarte: function (r) {
    const fixGesamt = r.fixBezahltCent + r.fixOffenCent;
    const frei = Math.max(0, r.verfuegbarCent);
    const basis = Math.max(r.einnahmenCent,
      fixGesamt + r.sparrateCent + r.variabelCent, 1);

    const fixName = r.fixOffenCent > 0
      ? 'Fixkosten (' + geld(r.fixOffenCent) + ' € offen)'
      : 'Fixkosten';

    const teile = [
      { farbe: 'var(--dg-blau-tief)', name: fixName,              cent: fixGesamt },
      { farbe: 'var(--dg-blau)',      name: 'Sparen',             cent: r.sparrateCent },
      { farbe: 'var(--dg-teal)',      name: 'variabel ausgegeben', cent: r.variabelCent },
      { farbe: 'var(--linie)',        name: 'noch verfügbar',      cent: frei }
    ].filter((t) => t.cent > 0);

    const quote = r.einnahmenCent > 0 && typeof Fixkosten !== 'undefined'
      ? Math.round(Fixkosten.monatsSumme() / r.einnahmenCent * 100) : null;

    return '<div class="karte">' +
      '<p class="karte-titel">Wohin dein Geld geht</p>' +
      '<div class="band">' +
        teile.map((t) => '<i style="width:' + (t.cent / basis * 100).toFixed(1) +
          '%;background:' + t.farbe + '"></i>').join('') +
      '</div>' +
      '<div class="legende">' +
        teile.map((t) => '<div class="legenden-zeile">' +
          '<span class="punkt" style="background:' + t.farbe + '"></span>' +
          '<span class="name">' + esc(t.name) + '</span>' +
          '<span class="wert">' + geldE(t.cent) + '</span>' +
        '</div>').join('') +
      '</div>' +
      (quote !== null
        ? '<div class="quote"><span>Fixkostenquote</span><b>' + quote + ' %</b></div>'
        : '') +
    '</div>';
  },

  einnahmenKarte: function (monat, r) {
    const g = Monatsrechnung.gehalt(monat);
    let zeilen = '';

    if (g.da) {
      const datum = g.buchungen[0].datum;
      zeilen += '<div class="posten-zeile">' +
        '<span>Gehalt <small class="gut">✓ am ' + esc(datumText(datum)) + '</small></span>' +
        '<span class="wert">' + geldE(g.cent) + '</span></div>';
      if (Math.abs(r.bonusCent) >= 1 && r.mindestCent > 0) {
        zeilen += '<div class="posten-zeile">' +
          '<span class="leise">' + (r.bonusCent > 0 ? 'über' : 'unter') + ' deinem Mindestnetto</span>' +
          '<span class="wert ' + (r.bonusCent > 0 ? 'plus' : 'warn') + '">' +
            (r.bonusCent > 0 ? '+ ' : '− ') + geldE(Math.abs(r.bonusCent)) + '</span></div>';
      }
    } else {
      zeilen += '<div class="posten-zeile">' +
        '<span>Gehalt <small class="leise">noch nicht da</small></span>' +
        '<span class="wert leise">' + geldE(r.mindestCent) + '</span></div>';
    }

    if (r.sonstigeCent > 0) {
      zeilen += '<div class="posten-zeile"><span>sonstige Einnahmen</span>' +
        '<span class="wert">' + geldE(r.sonstigeCent) + '</span></div>';
    }

    return '<div class="karte">' +
      '<p class="karte-titel">Einnahmen<span class="karte-summe">' +
        geldE(r.einnahmenCent) + '</span></p>' + zeilen + '</div>';
  },

  fixkostenKarte: function (monat, r) {
    if (typeof Fixkosten === 'undefined') return '';
    const faellig = (Daten.fixkosten || []).filter((f) =>
      f.aktiv !== false && Fixkosten.faelligImMonat(f, monat));

    if (!faellig.length) {
      return '<button class="karte karte-knopf leer-karte" data-tu="fixkosten">' +
        '<span class="leer-symbol">📌</span>' +
        '<span class="leer-text"><b>Fixkosten eintragen</b>' +
        '<small>Miete, Strom, Handy, Versicherungen</small></span>' +
        '<span class="chevron">›</span></button>';
    }

    const zeilen = faellig
      .sort((a, b) => b.betragCent - a.betragCent)
      .map((f) => {
        const gebucht = Fixkosten.schonAbgebucht(f, monat);
        return '<div class="posten-zeile">' +
          '<span>' + esc(f.name) + ' ' +
            (gebucht
              ? '<small class="gut">✓ abgebucht</small>'
              : '<small class="leise">steht aus</small>') +
          '</span>' +
          '<span class="wert' + (gebucht ? ' leise' : '') + '">' + geldE(f.betragCent) + '</span>' +
        '</div>';
      }).join('');

    return '<button class="karte karte-knopf" data-tu="fixkosten">' +
      '<p class="karte-titel">Fixkosten in ' + esc(monatText(monat).split(' ')[0]) +
        '<span class="karte-pfeil">›</span></p>' +
      zeilen +
      (r.fixOffenCent > 0
        ? '<div class="quote"><span>steht noch aus</span><b>' + geldE(r.fixOffenCent) + '</b></div>'
        : '<div class="quote"><span class="gut">✓ alles durchgelaufen</span><b></b></div>') +
    '</button>';
  },

  rechnungKarte: function (r) {
    const zeile = (label, cent, art) =>
      '<div class="rechnung-zeile' + (art ? ' ' + art : '') + '">' +
        '<span>' + esc(label) + '</span><span class="wert">' + geldE(cent) + '</span></div>';

    return '<div class="karte">' +
      '<p class="karte-titel">So entsteht die Zahl</p>' +
      zeile(r.geschaetzt ? 'Mindestnetto (geschätzt)' : 'Gehalt', r.gehaltCent) +
      (r.sonstigeCent > 0 ? zeile('sonstige Einnahmen', r.sonstigeCent) : '') +
      (r.sparrateCent > 0 ? zeile('− Sparrate', -r.sparrateCent) : '') +
      (r.fixBezahltCent > 0 ? zeile('− Fixkosten bezahlt', -r.fixBezahltCent) : '') +
      (r.variabelCent > 0 ? zeile('− variabel ausgegeben', -r.variabelCent) : '') +
      (r.fixOffenCent > 0 ? zeile('− Fixkosten noch offen', -r.fixOffenCent) : '') +
      '<div class="rechnung-zeile summe"><span>steht dir zur Verfügung</span>' +
        '<span class="wert">' + geldE(r.verfuegbarCent) + '</span></div>' +
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

    koerper.innerHTML =
      '<p class="abschnitt-titel" style="margin-top:0">Monatliche Sparrate</p>' +
      '<div class="feld">' +
        '<input type="text" inputmode="decimal" id="sp-rate" ' +
        'value="' + (Daten.einstellungen.sparrateCent ? geld(Daten.einstellungen.sparrateCent) : '') + '" ' +
        'placeholder="0,00">' +
        '<div class="hinweis" style="margin:7px 0 0;padding:0">Wird auf der Startseite von deinem ' +
          'verfügbaren Geld abgezogen. Die Stände unten pflegst du getrennt davon – ' +
          'Keel bucht nichts automatisch um.</div>' +
      '</div>' +

      '<p class="abschnitt-titel">Notgroschen</p>' +
      '<div class="feld-reihe">' +
        '<div class="feld"><label>Aktueller Stand</label>' +
          '<input type="text" inputmode="decimal" id="sp-not-ist" ' +
          'value="' + (n.standCent ? geld(n.standCent) : '') + '" placeholder="0,00"></div>' +
        '<div class="feld"><label>Ziel</label>' +
          '<input type="text" inputmode="decimal" id="sp-not-ziel" ' +
          'value="' + (n.zielCent ? geld(n.zielCent) : '') + '" placeholder="0,00"></div>' +
      '</div>' +
      (fix > 0 && n.standCent > 0
        ? '<p class="hinweis" style="margin-top:-4px">Dein Polster deckt derzeit <b>' +
          (n.standCent / fix).toFixed(1).replace('.', ',') + ' Monate</b> deiner Fixkosten. ' +
          'Als Faustregel gelten drei bis sechs.</p>'
        : '<p class="hinweis" style="margin-top:-4px">Üblich sind drei bis sechs Monatsausgaben.</p>') +

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
      Daten.notgroschen.standCent = Math.abs(CSVLeser.zuCent(koerper.querySelector('#sp-not-ist').value) || 0);
      Daten.notgroschen.zielCent  = Math.abs(CSVLeser.zuCent(koerper.querySelector('#sp-not-ziel').value) || 0);
      sichern();
      UI.zeichne();
    };

    ['#sp-rate', '#sp-not-ist', '#sp-not-ziel'].forEach((s) =>
      koerper.querySelector(s).addEventListener('change', merke));

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
          '<div class="feld"><label>Wie sollen wir dich nennen?</label>' +
            '<input type="text" id="es-name" value="' + esc(e.name) + '" ' +
            'placeholder="Dein Vorname" autocomplete="off" enterkeyhint="done">' +
            '<div class="hinweis" style="margin:7px 0 0;padding:0">Erscheint als Begrüßung ' +
              'auf der Startseite.</div></div>' +

          '<p class="abschnitt-titel">Einkommen</p>' +
          '<div class="feld"><label>Mindestnetto pro Monat</label>' +
            '<input type="text" inputmode="decimal" id="es-netto" ' +
            'value="' + (e.mindestnettoCent ? geld(e.mindestnettoCent) : '') + '" placeholder="0,00">' +
            '<div class="hinweis" style="margin:7px 0 0;padding:0">Der Betrag, auf den du dich ' +
              'sicher verlassen kannst. Solange dein Gehalt noch nicht eingegangen ist, rechnet ' +
              'Keel damit. Kommt mehr, wird der echte Betrag verwendet.</div></div>' +

          '<div class="schalter-zeile" style="margin-bottom:15px">' +
            '<div class="txt">Gehalt gilt für den Folgemonat' +
              '<small>Zahlung in der zweiten Monatshälfte zählt zum nächsten Monat</small></div>' +
            '<div class="schalter' + (e.gehaltVerschieben !== false ? ' an' : '') + '" id="es-schieben"></div>' +
          '</div>' +
          '<p class="hinweis" style="margin-top:-4px">Beispiel: Gehalt am 28.03. gehört zum April. ' +
            'Kommt es verspätet erst am 02.04., zählt es ebenfalls für April. Damit das greift, ' +
            'muss die Buchung der Kategorie <b>💼 Gehalt</b> zugeordnet sein.</p>' +

          '<button class="knopf" id="es-speichern">Speichern</button>' +
          '<div style="height:20px"></div>';

        koerper.querySelector('#es-schieben').addEventListener('click', function () {
          e.gehaltVerschieben = !(e.gehaltVerschieben !== false);
          this.classList.toggle('an', e.gehaltVerschieben);
        });

        koerper.querySelector('#es-speichern').addEventListener('click', () => {
          e.name = koerper.querySelector('#es-name').value.trim();
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
