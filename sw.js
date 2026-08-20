/* Keel Service Worker
 * Sorgt dafuer, dass die App komplett offline laeuft.
 *
 * WICHTIG bei Aenderungen am Code: die Zahl in CACHE_VERSION erhoehen.
 * Sonst zeigt das iPhone weiter die alte, zwischengespeicherte Version an.
 */

const CACHE_VERSION = 'keel-v17';

const DATEIEN = [
  './',
  './index.html',
  './styles.css',
  './csv.js',
  './phase2.js',
  './start.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

// Beim Installieren: alle App-Dateien in den Cache legen.
//
// Bewusst Datei fuer Datei statt cache.addAll(): addAll bricht komplett
// ab, sobald eine einzige Datei nicht ankommt. Bei wackeligem Netz waere
// die App dann gar nicht offline verfuegbar. So wird gespeichert, was
// geht - der Rest landet beim ersten Aufruf im Cache.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.all(
        DATEIEN.map((datei) =>
          cache.add(datei).catch((fehler) => {
            console.warn('Keel: konnte nicht vorgeladen werden:', datei, fehler);
          })
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// Beim Aktivieren: alte Cache-Versionen wegraeumen.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Beim Laden: erst im Cache nachsehen, sonst aus dem Netz holen.
// Reine Offline-App -> Cache zuerst ist hier richtig und am schnellsten.
self.addEventListener('fetch', (event) => {
  const anfrage = event.request;

  if (anfrage.method !== 'GET') return;
  if (!anfrage.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(anfrage).then((treffer) => {
      if (treffer) return treffer;

      return fetch(anfrage)
        .then((antwort) => {
          if (antwort && antwort.status === 200 && antwort.type === 'basic') {
            const kopie = antwort.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(anfrage, kopie));
          }
          return antwort;
        })
        .catch(() => {
          // Offline und nichts im Cache: bei Seitenaufrufen die Startseite liefern.
          if (anfrage.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});
