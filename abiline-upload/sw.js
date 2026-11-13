// Abiline: töötab ka ilma netita. Uuenduse korral muuda versiooninumbrit.
const CACHE = 'abiline-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './barlow-latin-400-normal.woff2', './barlow-latin-500-normal.woff2', './barlow-latin-600-normal.woff2', './barlow-latin-700-normal.woff2',
  './barlow-latin-ext-400-normal.woff2', './barlow-latin-ext-500-normal.woff2', './barlow-latin-ext-600-normal.woff2', './barlow-latin-ext-700-normal.woff2',
  './barlow-condensed-latin-700-normal.woff2', './barlow-condensed-latin-ext-700-normal.woff2',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Kõigepealt vahemälust, taustal värskendab: uus versioon ilmub järgmisel avamisel.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
});
