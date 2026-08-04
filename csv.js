/* ============================================================
   Keel - CSV-Import fuer Trade-Republic-Kontoauszuege
   ============================================================
   Diese Datei enthaelt drei Dinge:
     1. Einen robusten CSV-Leser (kommt mit Kommas und
        Anfuehrungszeichen innerhalb von Feldern klar).
     2. Die Uebersetzung der Trade-Republic-Spalten in
        Keel-Buchungen.
     3. Eine Tabelle, die Haendler-Branchenschluessel (MCC)
        auf Kategorien abbildet - dadurch ist schon der
        allererste Import weitgehend vorsortiert.
   ============================================================ */

const CSVLeser = (function () {

  /* -------- 1. Trennzeichen erkennen -------- */
  function trennzeichenRaten(text) {
    const ersteZeile = text.split(/\r?\n/, 1)[0] || '';
    const kandidaten = [',', ';', '\t', '|'];
    let bester = ',';
    let meiste = -1;
    for (const k of kandidaten) {
      let anzahl = 0;
      let inQuote = false;
      for (let i = 0; i < ersteZeile.length; i++) {
        const c = ersteZeile[i];
        if (c === '"') inQuote = !inQuote;
        else if (c === k && !inQuote) anzahl++;
      }
      if (anzahl > meiste) { meiste = anzahl; bester = k; }
    }
    return bester;
  }

  /* -------- 2. CSV in Zeilen/Felder zerlegen (nach RFC 4180) -------- */
  function zerlegen(text, trenner) {
    text = String(text).replace(/^﻿/, ''); // BOM entfernen, falls vorhanden
    if (!trenner) trenner = trennzeichenRaten(text);

    const zeilen = [];
    let zeile = [];
    let feld = '';
    let inQuote = false;
    let etwasGesehen = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') { feld += '"'; i++; }
          else inQuote = false;
        } else {
          feld += c;
        }
        continue;
      }

      if (c === '"') { inQuote = true; etwasGesehen = true; }
      else if (c === trenner) { zeile.push(feld); feld = ''; etwasGesehen = true; }
      else if (c === '\n') {
        zeile.push(feld);
        if (etwasGesehen || zeile.length > 1) zeilen.push(zeile);
        zeile = []; feld = ''; etwasGesehen = false;
      }
      else if (c === '\r') { /* ignorieren, Zeilenende faengt \n ab */ }
      else { feld += c; etwasGesehen = true; }
    }
    zeile.push(feld);
    if (etwasGesehen || zeile.length > 1) zeilen.push(zeile);

    return { zeilen: zeilen, trenner: trenner };
  }

  /* -------- 3. Zeilen in Objekte mit Spaltennamen umwandeln -------- */
  function alsObjekte(text) {
    const ergebnis = zerlegen(text);
    const zeilen = ergebnis.zeilen;
    if (!zeilen.length) return { kopf: [], daten: [], trenner: ergebnis.trenner };

    const kopf = zeilen[0].map((s) => String(s).trim().toLowerCase().replace(/^"|"$/g, ''));
    const daten = [];

    for (let i = 1; i < zeilen.length; i++) {
      const z = zeilen[i];
      if (z.length === 1 && String(z[0]).trim() === '') continue; // Leerzeile
      const obj = {};
      for (let s = 0; s < kopf.length; s++) obj[kopf[s]] = (z[s] !== undefined ? String(z[s]).trim() : '');
      daten.push(obj);
    }
    return { kopf: kopf, daten: daten, trenner: ergebnis.trenner };
  }

  /* -------- 4. Betrag in Cent umrechnen -------- */
  // Versteht "-12.100000" (Trade Republic) genauso wie "1.234,56" (deutsches Format).
  function zuCent(roh) {
    if (roh === undefined || roh === null) return null;
    let s = String(roh).trim();
    if (!s) return null;

    const hatKomma = s.indexOf(',') > -1;
    const hatPunkt = s.indexOf('.') > -1;

    if (hatKomma && hatPunkt) {
      // Das hintere Zeichen ist der Dezimaltrenner.
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hatKomma) {
      // Nur Komma: als Dezimaltrenner werten, wenn 1-2 Stellen folgen, sonst Tausendertrenner.
      if (/,\d{1,2}$/.test(s)) s = s.replace(',', '.');
      else s = s.replace(/,/g, '');
    }

    s = s.replace(/[^\d.+-]/g, '');
    const zahl = parseFloat(s);
    if (isNaN(zahl)) return null;
    return Math.round(zahl * 100);
  }

  /* -------- 5. Datum auf JJJJ-MM-TT normalisieren -------- */
  function zuDatum(roh) {
    if (!roh) return null;
    const s = String(roh).trim();

    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);            // 2026-06-01 / ISO-Zeitstempel
    if (m) return m[1] + '-' + m[2] + '-' + m[3];

    m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);   // 01.06.2026 / 1/6/26
    if (m) {
      let jahr = m[3];
      if (jahr.length === 2) jahr = (parseInt(jahr, 10) > 70 ? '19' : '20') + jahr;
      return jahr + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    }
    return null;
  }

  return {
    alsObjekte: alsObjekte,
    zerlegen: zerlegen,
    zuCent: zuCent,
    zuDatum: zuDatum
  };
})();


/* ============================================================
   MCC - Branchenschluessel des Haendlers
   Steht bei Kartenzahlungen in der Spalte mcc_code.
   Damit kann Keel schon beim allerersten Import raten.
   ============================================================ */

const MCC = (function () {

  const EXAKT = {
    // --- Lebensmittel ---
    '5411': 'lebensmittel', '5422': 'lebensmittel', '5441': 'lebensmittel',
    '5451': 'lebensmittel', '5462': 'lebensmittel', '5499': 'lebensmittel',
    '5921': 'lebensmittel', '5715': 'lebensmittel',

    // --- Restaurant & Cafe ---
    '5811': 'restaurant', '5812': 'restaurant', '5813': 'restaurant', '5814': 'restaurant',

    // --- Auto & Verkehr ---
    '5541': 'verkehr', '5542': 'verkehr', '5533': 'verkehr', '5532': 'verkehr',
    '5511': 'verkehr', '5521': 'verkehr', '5571': 'verkehr', '5599': 'verkehr',
    '7523': 'verkehr', '7531': 'verkehr', '7534': 'verkehr', '7535': 'verkehr',
    '7538': 'verkehr', '7542': 'verkehr', '7549': 'verkehr',
    '4111': 'verkehr', '4112': 'verkehr', '4121': 'verkehr', '4131': 'verkehr',
    '4784': 'verkehr', '4789': 'verkehr',

    // --- Wohnen ---
    '5200': 'wohnen', '5211': 'wohnen', '5231': 'wohnen', '5251': 'wohnen',
    '5261': 'wohnen', '5712': 'wohnen', '5713': 'wohnen', '5714': 'wohnen',
    '5718': 'wohnen', '5719': 'wohnen', '5722': 'wohnen',
    '1711': 'wohnen', '1731': 'wohnen', '1740': 'wohnen', '1750': 'wohnen',
    '1761': 'wohnen', '1799': 'wohnen', '7349': 'wohnen', '6513': 'wohnen',

    // --- Strom & Nebenkosten ---
    '4900': 'nebenkosten',

    // --- Handy & Internet ---
    '4812': 'telekom', '4813': 'telekom', '4814': 'telekom', '4816': 'telekom',
    '4821': 'telekom',

    // --- Abos & Digitales ---
    '5815': 'abos', '5816': 'abos', '5817': 'abos', '5818': 'abos',
    '5967': 'abos', '5968': 'abos', '5969': 'abos', '4899': 'abos',
    '7372': 'abos', '7379': 'abos', '5734': 'abos', '7375': 'abos',

    // --- Versicherungen ---
    '5960': 'versicherung', '6300': 'versicherung', '6381': 'versicherung', '6399': 'versicherung',

    // --- Gesundheit & Drogerie ---
    '5122': 'gesundheit', '5912': 'gesundheit', '5975': 'gesundheit', '5976': 'gesundheit',
    '5977': 'gesundheit', '7230': 'gesundheit', '7297': 'gesundheit', '7298': 'gesundheit',
    '8011': 'gesundheit', '8021': 'gesundheit', '8031': 'gesundheit', '8041': 'gesundheit',
    '8042': 'gesundheit', '8043': 'gesundheit', '8049': 'gesundheit', '8050': 'gesundheit',
    '8062': 'gesundheit', '8071': 'gesundheit', '8099': 'gesundheit',

    // --- Sport & Fitness ---
    '5940': 'sport', '5941': 'sport', '7941': 'sport', '7997': 'sport',

    // --- Shopping ---
    '5300': 'shopping', '5310': 'shopping', '5311': 'shopping', '5331': 'shopping',
    '5399': 'shopping', '5611': 'shopping', '5621': 'shopping', '5631': 'shopping',
    '5641': 'shopping', '5651': 'shopping', '5655': 'shopping', '5661': 'shopping',
    '5681': 'shopping', '5691': 'shopping', '5697': 'shopping', '5698': 'shopping',
    '5699': 'shopping', '5732': 'shopping', '5733': 'shopping', '5735': 'shopping',
    '5931': 'shopping', '5942': 'shopping', '5943': 'shopping', '5944': 'shopping',
    '5945': 'shopping', '5946': 'shopping', '5947': 'shopping', '5948': 'shopping',
    '5949': 'shopping', '5950': 'shopping', '5970': 'shopping', '5971': 'shopping',
    '5992': 'shopping', '5999': 'shopping', '7278': 'shopping', '5310x': 'shopping',

    // --- Freizeit & Reisen ---
    '4011': 'freizeit', '4411': 'freizeit', '4511': 'freizeit', '4582': 'freizeit',
    '4722': 'freizeit', '4723': 'freizeit',
    '7011': 'freizeit', '7012': 'freizeit', '7032': 'freizeit', '7033': 'freizeit',
    '7829': 'freizeit', '7832': 'freizeit', '7841': 'freizeit',
    '7911': 'freizeit', '7922': 'freizeit', '7929': 'freizeit', '7932': 'freizeit',
    '7933': 'freizeit', '7991': 'freizeit', '7992': 'freizeit', '7993': 'freizeit',
    '7994': 'freizeit', '7996': 'freizeit', '7998': 'freizeit', '7999': 'freizeit',
    '5192': 'freizeit', '5733x': 'freizeit',

    // --- Bargeld ---
    '6010': 'bargeld', '6011': 'bargeld',

    // --- Gebuehren / Finanzdienste ---
    '6012': 'gebuehren', '6050': 'gebuehren', '6051': 'gebuehren',
    '6211': 'gebuehren', '6540': 'gebuehren',

    // --- Sonstiges (bewusst gesetzt) ---
    '4829': 'sonstiges',  // Geldtransfer (z. B. PayPal an Privatperson)
    '5993': 'sonstiges',  // Kiosk / Tabakwaren
    '7399': 'sonstiges',  // Geschaeftsdienstleistungen (z. B. Paketdienst)
    '9399': 'sonstiges',  // Behoerden
    '9311': 'sonstiges'   // Steuerzahlungen
  };

  // Ganze Zahlenbereiche, die eine gemeinsame Bedeutung haben.
  const BEREICHE = [
    [3000, 3299, 'freizeit'],   // Fluggesellschaften
    [3300, 3499, 'verkehr'],    // Autovermietungen
    [3500, 3999, 'freizeit'],   // Hotels
    [8000, 8099, 'gesundheit']  // Aerzte, Kliniken, Labore
  ];

  function kategorie(mccRoh) {
    if (!mccRoh) return null;
    const mcc = String(mccRoh).trim();
    if (!mcc) return null;
    if (EXAKT[mcc]) return EXAKT[mcc];

    const n = parseInt(mcc, 10);
    if (isNaN(n)) return null;
    for (const b of BEREICHE) if (n >= b[0] && n <= b[1]) return b[2];
    return null;
  }

  return { kategorie: kategorie };
})();


/* ============================================================
   Stichwort-Woerterbuch
   ============================================================
   Ueberweisungen und Lastschriften haben keinen MCC-Code -
   dort steht nur ein Name. Damit auch Miete, Strom, Handy und
   Versicherung schon beim ALLERSTEN Import richtig einsortiert
   werden, kennt Keel die gaengigen deutschen Anbieter.

   Das ist nur ein Startvorschlag. Sobald du eine Zuordnung
   selbst aenderst, gilt deine Wahl - die lernt Keel und
   ueberschreibt damit dieses Woerterbuch.
   ============================================================ */

const Stichworte = (function () {

  // Reihenfolge egal - wird nach Laenge sortiert, damit der
  // genauere Treffer gewinnt ("prime video" vor "video").
  const LISTE = [
    // --- Wohnen ---
    ['immobilien', 'wohnen'], ['hausverwaltung', 'wohnen'], ['vermietung', 'wohnen'],
    ['wohnungsgenossenschaft', 'wohnen'], ['wohnungsbau', 'wohnen'], ['vonovia', 'wohnen'],
    ['deutsche wohnen', 'wohnen'], ['lego wohnen', 'wohnen'], ['miete', 'wohnen'],
    ['kaltmiete', 'wohnen'], ['nebenkostenabrechnung', 'wohnen'],

    // --- Strom, Gas, Wasser, Rundfunk ---
    ['vattenfall', 'nebenkosten'], ['stadtwerke', 'nebenkosten'], ['eon', 'nebenkosten'],
    ['e.on', 'nebenkosten'], ['enbw', 'nebenkosten'], ['rwe', 'nebenkosten'],
    ['yello', 'nebenkosten'], ['lichtblick', 'nebenkosten'], ['naturstrom', 'nebenkosten'],
    ['eprimo', 'nebenkosten'], ['ovag', 'nebenkosten'], ['gasag', 'nebenkosten'],
    ['wasserwerk', 'nebenkosten'], ['rundfunk', 'nebenkosten'], ['ard zdf', 'nebenkosten'],
    ['schleswig-holstein netz', 'nebenkosten'], ['hansewerk', 'nebenkosten'],

    // --- Handy & Internet ---
    ['telekom', 'telekom'], ['vodafone', 'telekom'], ['telefonica', 'telekom'],
    ['congstar', 'telekom'], ['1und1', 'telekom'], ['1&1', 'telekom'],
    ['freenet', 'telekom'], ['netcologne', 'telekom'], ['pyur', 'telekom'],
    ['unitymedia', 'telekom'], ['aldi talk', 'telekom'], ['blau.de', 'telekom'],
    ['o2 germany', 'telekom'], ['mobilcom', 'telekom'],

    // --- Versicherungen ---
    ['versicherung', 'versicherung'], ['r+v', 'versicherung'], ['axa', 'versicherung'],
    ['allianz', 'versicherung'], ['huk', 'versicherung'], ['ergo', 'versicherung'],
    ['debeka', 'versicherung'], ['signal iduna', 'versicherung'], ['generali', 'versicherung'],
    ['gothaer', 'versicherung'], ['provinzial', 'versicherung'], ['barmenia', 'versicherung'],
    ['hansemerkur', 'versicherung'], ['cosmos direkt', 'versicherung'], ['wgv', 'versicherung'],
    ['devk', 'versicherung'], ['lvm', 'versicherung'], ['wuerttembergische', 'versicherung'],
    ['assekuranz', 'versicherung'], ['krankenkasse', 'versicherung'], ['techniker', 'versicherung'],
    ['barmer', 'versicherung'], ['aok', 'versicherung'], ['dak', 'versicherung'],

    // --- Lebensmittel ---
    ['rewe', 'lebensmittel'], ['edeka', 'lebensmittel'], ['lidl', 'lebensmittel'],
    ['aldi', 'lebensmittel'], ['penny', 'lebensmittel'], ['netto marken', 'lebensmittel'],
    ['kaufland', 'lebensmittel'], ['famila', 'lebensmittel'], ['marktkauf', 'lebensmittel'],
    ['tegut', 'lebensmittel'], ['norma', 'lebensmittel'], ['alnatura', 'lebensmittel'],
    ['denns', 'lebensmittel'], ['hellofresh', 'lebensmittel'], ['hello fresh', 'lebensmittel'],
    ['marley spoon', 'lebensmittel'], ['flaschenpost', 'lebensmittel'], ['getraenke', 'lebensmittel'],
    ['baecker', 'lebensmittel'], ['bäcker', 'lebensmittel'], ['metzger', 'lebensmittel'],
    ['combi', 'lebensmittel'], ['globus', 'lebensmittel'], ['nahkauf', 'lebensmittel'],

    // --- Restaurant & Cafe ---
    ['mcdonald', 'restaurant'], ['burger king', 'restaurant'], ['subway', 'restaurant'],
    ['starbucks', 'restaurant'], ['lieferando', 'restaurant'], ['uber eats', 'restaurant'],
    ['wolt', 'restaurant'], ['dominos', 'restaurant'], ['pizza', 'restaurant'],
    ['restaurant', 'restaurant'], ['gasthaus', 'restaurant'], ['brauhaus', 'restaurant'],
    ['kfc', 'restaurant'], ['vapiano', 'restaurant'], ['nordsee', 'restaurant'],
    ['dean david', 'restaurant'], ['coffee', 'restaurant'], ['cafe', 'restaurant'],

    // --- Auto & Verkehr ---
    ['shell', 'verkehr'], ['aral', 'verkehr'], ['esso', 'verkehr'], ['total energies', 'verkehr'],
    ['tankstelle', 'verkehr'], ['sprit', 'verkehr'], ['adac', 'verkehr'], ['avd', 'verkehr'],
    ['deutsche bahn', 'verkehr'], ['db vertrieb', 'verkehr'], ['db fernverkehr', 'verkehr'],
    ['flixbus', 'verkehr'], ['bvg', 'verkehr'], ['hvv', 'verkehr'], ['hochbahn', 'verkehr'],
    ['freenow', 'verkehr'], ['free now', 'verkehr'], ['uber', 'verkehr'], ['moia', 'verkehr'],
    ['sixt', 'verkehr'], ['europcar', 'verkehr'], ['hertz', 'verkehr'], ['miles mobility', 'verkehr'],
    ['share now', 'verkehr'], ['parkhaus', 'verkehr'], ['parken', 'verkehr'], ['garagen', 'verkehr'],
    ['werkstatt', 'verkehr'], ['autohaus', 'verkehr'], ['atu ', 'verkehr'], ['pitstop', 'verkehr'],
    ['kfz-', 'verkehr'], ['tuev', 'verkehr'], ['dekra', 'verkehr'],

    // --- Abos & Digitales ---
    ['netflix', 'abos'], ['spotify', 'abos'], ['disney', 'abos'], ['dazn', 'abos'],
    ['sky deutschland', 'abos'], ['prime video', 'abos'], ['apple.com', 'abos'],
    ['itunes', 'abos'], ['audible', 'abos'], ['zattoo', 'abos'], ['waipu', 'abos'],
    ['joyn', 'abos'], ['youtube', 'abos'], ['anthropic', 'abos'], ['openai', 'abos'],
    ['adobe', 'abos'], ['microsoft', 'abos'], ['google', 'abos'], ['dropbox', 'abos'],
    ['notion', 'abos'], ['ionos', 'abos'], ['strato', 'abos'], ['github', 'abos'],
    ['patreon', 'abos'], ['steam', 'abos'], ['playstation', 'abos'], ['nintendo', 'abos'],
    ['zeitung', 'abos'], ['verlag', 'abos'], ['spiegel', 'abos'], ['zeit online', 'abos'],

    // --- Gesundheit & Drogerie ---
    ['apotheke', 'gesundheit'], ['rossmann', 'gesundheit'], ['dm-drogerie', 'gesundheit'],
    ['budni', 'gesundheit'], ['mueller ltd', 'gesundheit'], ['zahnarzt', 'gesundheit'],
    ['praxis', 'gesundheit'], ['klinik', 'gesundheit'], ['doktor', 'gesundheit'],
    ['physiotherapie', 'gesundheit'], ['optiker', 'gesundheit'], ['fielmann', 'gesundheit'],
    ['friseur', 'gesundheit'], ['sonnenstudio', 'gesundheit'], ['shop apotheke', 'gesundheit'],
    ['doc morris', 'gesundheit'], ['docmorris', 'gesundheit'],

    // --- Sport & Fitness ---
    ['fitx', 'sport'], ['fitnessfabrik', 'sport'], ['mcfit', 'sport'], ['clever fit', 'sport'],
    ['urban sports', 'sport'], ['fitness', 'sport'], ['sportverein', 'sport'],
    ['schwimmbad', 'sport'], ['kletterhalle', 'sport'], ['decathlon', 'sport'],

    // --- Shopping ---
    ['amazon', 'shopping'], ['amzn', 'shopping'], ['otto', 'shopping'], ['zalando', 'shopping'],
    ['temu', 'shopping'], ['shein', 'shopping'], ['about you', 'shopping'],
    ['mediamarkt', 'shopping'], ['media markt', 'shopping'], ['saturn', 'shopping'],
    ['ikea', 'shopping'], ['obi ', 'shopping'], ['bauhaus', 'shopping'], ['hornbach', 'shopping'],
    ['toom', 'shopping'], ['thalia', 'shopping'], ['hugendubel', 'shopping'],
    ['tk maxx', 'shopping'], ['h&m', 'shopping'], ['zara', 'shopping'], ['c&a', 'shopping'],
    ['deichmann', 'shopping'], ['galeria', 'shopping'], ['action ', 'shopping'],
    ['woolworth', 'shopping'], ['tedi', 'shopping'], ['ebay', 'shopping'],

    // --- Freizeit & Reisen ---
    ['hotel', 'freizeit'], ['booking.com', 'freizeit'], ['airbnb', 'freizeit'],
    ['lufthansa', 'freizeit'], ['eurowings', 'freizeit'], ['ryanair', 'freizeit'],
    ['easyjet', 'freizeit'], ['kino', 'freizeit'], ['cinemaxx', 'freizeit'],
    ['cineplex', 'freizeit'], ['theater', 'freizeit'], ['eventim', 'freizeit'],
    ['ticketmaster', 'freizeit'], ['zoo', 'freizeit'], ['museum', 'freizeit'],
    ['freizeitpark', 'freizeit'], ['strandbad', 'freizeit'], ['campingplatz', 'freizeit'],

    // --- Einnahmen ---
    ['gehalt', 'gehalt'], ['lohn', 'gehalt'], ['bezuege', 'gehalt'], ['bezüge', 'gehalt'],
    ['entgeltabrechnung', 'gehalt'], ['besoldung', 'gehalt'],
    ['kindergeld', 'sonstigeeinnahme'], ['familienkasse', 'sonstigeeinnahme'],
    ['steuererstattung', 'erstattung'], ['finanzamt', 'erstattung'],
    ['erstattung', 'erstattung'], ['rueckerstattung', 'erstattung'],

    // --- Gebuehren ---
    ['kontofuehrung', 'gebuehren'], ['kontogebuehr', 'gebuehren'], ['mahngebuehr', 'gebuehren']
  ];

  // Laengere Stichworte zuerst pruefen.
  const SORTIERT = LISTE.slice().sort((a, b) => b[0].length - a[0].length);

  function kategorie(haendlerRoh) {
    if (!haendlerRoh) return null;

    let s = ' ' + String(haendlerRoh).toLowerCase()
      .replace(/[^a-z0-9äöüß+&.\- ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() + ' ';

    for (const paar of SORTIERT) {
      const wort = paar[0];
      // Ganz kurze Stichworte nur als eigenstaendiges Wort werten,
      // sonst gaebe es zu viele Zufallstreffer.
      if (wort.length <= 3) {
        if (s.indexOf(' ' + wort + ' ') !== -1) return paar[1];
      } else if (s.indexOf(wort) !== -1) {
        return paar[1];
      }
    }
    return null;
  }

  return { kategorie: kategorie, anzahl: LISTE.length };
})();


/* ============================================================
   Trade-Republic-Uebersetzer
   ============================================================ */

const TradeRepublic = (function () {

  // Rechtsformen und Fuellwoerter, die fuer die Wiedererkennung
  // eines Haendlers keine Rolle spielen.
  const FUELLWOERTER = new Set([
    'gmbh', 'mbh', 'ag', 'kg', 'kgaa', 'ohg', 'gbr', 'ug', 'se', 'eg', 'ev',
    'sarl', 'sa', 'sas', 'srl', 'spa', 'bv', 'nv', 'oy', 'ab', 'as',
    'ltd', 'llc', 'inc', 'plc', 'corp', 'co', 'company',
    'inh', 'zw', 'nl', 'kst', 'zweigniederlassung', 'filiale',
    'und', 'and', 'der', 'die', 'das', 'the', 'von', 'fuer', 'markt', 'gmbhco'
  ]);

  /* ---- Haendlernamen fuer die Lernlogik vereinheitlichen ---- */
  // Beispiele:
  //   "SHELL   6728"          -> "shell"
  //   "SHELL   6751"          -> "shell"        (gleicher Schluessel!)
  //   "REWE Kim Ide oHG"      -> "rewe kim ide"
  //   "ANTHROPIC* CLAUDE SUB" -> "anthropic"
  //   "Rossmann 1433"         -> "rossmann"
  function normalisiere(roh) {
    let s = String(roh || '').toLowerCase();

    s = s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

    // Bei Zahlungsdienstleistern steht vor dem Stern der eigentliche Anbieter.
    // Nur abschneiden, wenn davor mindestens 4 Zeichen stehen - sonst wuerden
    // Sammel-Abwickler wie "SPC*..." alles in einen Topf werfen.
    const stern = s.indexOf('*');
    if (stern >= 4) s = s.slice(0, stern);

    s = s.replace(/[^a-z0-9 ]+/g, ' ');

    let woerter = s.split(/\s+/).filter(Boolean);
    woerter = woerter.filter((w) => !/\d/.test(w));          // Belegnummern raus
    woerter = woerter.filter((w) => !FUELLWOERTER.has(w));   // Rechtsformen raus
    woerter = woerter.filter((w) => w.length > 1);

    return woerter.join(' ').trim();
  }

  // Der "Stamm" ist das erste aussagekraeftige Wort.
  // Damit erkennt Keel auch "REWE Uetersen" wieder, wenn nur
  // "REWE Kim Ide" gelernt wurde.
  function stamm(normalisiert) {
    if (!normalisiert) return '';
    const erstes = normalisiert.split(' ')[0] || '';
    return erstes.length >= 3 ? erstes : '';
  }

  /* ---- Wer ist der echte Haendler? ---- */
  function haendlerAus(z) {
    const typ = String(z.type || '').toUpperCase();
    const beschreibung = String(z.description || '').trim();
    const name = String(z.name || '').trim();
    const gegen = String(z.counterparty_name || '').trim();

    // SEPA-Lastschrift: in "name" steht der KONTOINHABER (also man selbst),
    // der eigentliche Zahlungsempfaenger nur im Beschreibungstext.
    if (typ.indexOf('DIRECT_DEBIT') !== -1) {
      const m = beschreibung.match(/Direct Debit transfer to\s+(.+?)\s*\([A-Z]{2}[0-9A-Z ]{8,}\)\s*$/i);
      if (m && m[1]) return m[1].trim();
      const m2 = beschreibung.match(/Direct Debit transfer to\s+(.+?)$/i);
      if (m2 && m2[1]) return m2[1].trim();
    }

    if (typ === 'INTEREST_PAYMENT')   return 'Trade Republic Zinsen';
    if (typ === 'BENEFITS_SAVEBACK')  return 'Trade Republic Saveback';
    if (typ === 'BUY' || typ === 'SELL') return name || 'Wertpapier';

    if (typ.indexOf('TRANSFER') !== -1) return gegen || name || beschreibung || 'Überweisung';

    return name || beschreibung || 'Unbekannt';
  }

  /* ---- Buchungsart bestimmen ---- */
  // Rueckgabe: 'ausgabe' | 'einnahme' | 'umbuchung'
  function artBestimmen(typ, cent) {
    const t = String(typ || '').toUpperCase();

    // Wertpapierkaeufe und -verkaeufe sind KEINE Ausgaben bzw. Einnahmen.
    // Das Geld wird nur umgeschichtet. Die Ordergebuehr dagegen ist echt
    // und wird weiter unten als eigene Ausgabe erzeugt.
    if (t === 'BUY' || t === 'SELL') return 'umbuchung';

    if (t === 'INTEREST_PAYMENT')  return 'einnahme';
    if (t === 'BENEFITS_SAVEBACK') return 'einnahme';

    // Bei allen anderen entscheidet das Vorzeichen.
    // (Achtung: der Typname taeuscht - TRANSFER_DIRECT_DEBIT_INBOUND
    //  meint die eingehende Lastschriftanforderung, das Geld geht RAUS.)
    if (cent === null) return null;
    return cent < 0 ? 'ausgabe' : 'einnahme';
  }

  /* ---- Lesbaren Klartext fuer die Buchungsart ---- */
  const ART_TEXT = {
    'CARD_TRANSACTION': 'Kartenzahlung',
    'CARD_TRANSACTION_INTERNATIONAL': 'Kartenzahlung Ausland',
    'TRANSFER_DIRECT_DEBIT_INBOUND': 'Lastschrift',
    'TRANSFER_DIRECT_DEBIT_OUTBOUND': 'Lastschrift',
    'TRANSFER_INBOUND': 'Überweisung erhalten',
    'TRANSFER_INSTANT_INBOUND': 'Echtzeit erhalten',
    'TRANSFER_OUTBOUND': 'Überweisung gesendet',
    'TRANSFER_INSTANT_OUTBOUND': 'Echtzeit gesendet',
    'INTEREST_PAYMENT': 'Zinsen',
    'BENEFITS_SAVEBACK': 'Saveback',
    'BUY': 'Wertpapierkauf',
    'SELL': 'Wertpapierverkauf'
  };

  /* ---- Vorschlaege aus einer CSV-Datei erzeugen ---- */
  //
  // vorhandeneIds  : Set mit bereits importierten transaction_id
  // vorhandeneHashes: Set mit Ersatzschluessel (Datum|Betrag|Haendler)
  //                   fuer den Fall, dass eine ID fehlt
  //
  function auswerten(text, vorhandeneIds, vorhandeneHashes) {
    const gelesen = CSVLeser.alsObjekte(text);
    const kopf = gelesen.kopf;

    // Prueft, ob es sich ueberhaupt um einen TR-Export handelt.
    const pflicht = ['date', 'amount', 'type'];
    const fehlend = pflicht.filter((s) => kopf.indexOf(s) === -1);
    if (fehlend.length) {
      return {
        fehler: 'Die Datei sieht nicht wie ein Trade-Republic-Export aus. ' +
                'Es fehlen die Spalten: ' + fehlend.join(', ') + '.',
        gefundeneSpalten: kopf
      };
    }

    const vorschlaege = [];
    let duplikate = 0;
    let umbuchungen = 0;
    let unlesbar = 0;

    for (const z of gelesen.daten) {
      const datum = CSVLeser.zuDatum(z.date || z.datetime);
      const cent = CSVLeser.zuCent(z.amount);

      if (!datum || cent === null) { unlesbar++; continue; }

      const trId = String(z.transaction_id || '').trim();
      const haendler = haendlerAus(z);
      const typ = String(z.type || '').toUpperCase();
      const art = artBestimmen(typ, cent);

      // --- Ordergebuehr: eigene, echte Ausgabe ---
      const gebuehrCent = CSVLeser.zuCent(z.fee);
      if (gebuehrCent !== null && gebuehrCent !== 0) {
        const gebId = trId ? trId + '#fee' : '';
        const gebHash = datum + '|' + Math.abs(gebuehrCent) + '|' + normalisiere(haendler) + '|gebuehr';
        const gebSchonDa = (gebId && vorhandeneIds.has(gebId)) || vorhandeneHashes.has(gebHash);
        if (gebSchonDa) {
          duplikate++;
        } else {
          vorschlaege.push({
            trId: gebId,
            hash: gebHash,
            datum: datum,
            art: 'ausgabe',
            betragCent: Math.abs(gebuehrCent),
            haendler: haendler,
            normHaendler: normalisiere(haendler),
            stamm: stamm(normalisiere(haendler)),
            artText: 'Ordergebühr',
            mcc: '',
            notiz: 'Gebühr: ' + (ART_TEXT[typ] || typ),
            gewaehlt: true,
            kategorieId: 'gebuehren',
            quelleVorschlag: 'regel-fest'
          });
        }
      }

      if (!art) { unlesbar++; continue; }

      if (art === 'umbuchung') { umbuchungen++; continue; }

      const norm = normalisiere(haendler);
      const hash = datum + '|' + cent + '|' + norm;
      const schonDa = (trId && vorhandeneIds.has(trId)) || vorhandeneHashes.has(hash);

      if (schonDa) { duplikate++; continue; }

      vorschlaege.push({
        trId: trId,
        hash: hash,
        datum: datum,
        art: art,
        betragCent: Math.abs(cent),
        haendler: haendler,
        normHaendler: norm,
        stamm: stamm(norm),
        artText: ART_TEXT[typ] || typ,
        mcc: String(z.mcc_code || '').trim(),
        notiz: '',
        gewaehlt: true,
        kategorieId: null,          // wird gleich von der Lernlogik gefuellt
        quelleVorschlag: null
      });
    }

    // Neueste zuerst
    vorschlaege.sort((a, b) => (a.datum < b.datum ? 1 : a.datum > b.datum ? -1 : 0));

    return {
      fehler: null,
      vorschlaege: vorschlaege,
      zeilenGesamt: gelesen.daten.length,
      duplikate: duplikate,
      umbuchungen: umbuchungen,
      unlesbar: unlesbar
    };
  }

  return {
    auswerten: auswerten,
    normalisiere: normalisiere,
    stamm: stamm,
    haendlerAus: haendlerAus
  };
})();
