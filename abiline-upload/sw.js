// Abiline: töötab ka ilma netita. Uuenduse korral muuda versiooninumbrit.
const CACHE = 'abiline-v3';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png',
  './barlow-latin-400-normal.woff2', './barlow-latin-500-normal.woff2', './barlow-latin-600-normal.woff2', './barlow-latin-700-normal.woff2',
  './barlow-latin-ext-400-normal.woff2', './barlow-latin-ext-500-normal.woff2', './barlow-latin-ext-600-normal.woff2', './barlow-latin-ext-700-normal.woff2',
  './barlow-condensed-latin-700-normal.woff2', './barlow-condensed-latin-ext-700-normal.woff2',
];
// Paigaldamisel võetakse failid otse võrgust, mitte brauseri vahemälust.
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Fondid ja ikoonid vahemälust. Kõik muu kõigepealt võrgust, et uuendused jõuaksid kohe kohale; ilma netita vahemälust.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const fixed = /\.(woff2|png)$/.test(new URL(req.url).pathname);
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    if (fixed && hit) return hit;
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res && res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      if (hit) return hit;
      throw err;
    }
  }));
});
