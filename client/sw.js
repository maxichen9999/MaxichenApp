/* LoveChat Service Worker — macht die App installierbar (PWA) 💗 */
const CACHE = 'lovechat-v4';
const SHELL = ['/manifest.webmanifest', '/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API, WebSockets und Nicht-GET lassen wir komplett durch
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api') || url.pathname === '/ws' || url.searchParams.get('_nocache')) return;

  // HTML-Seiten IMMER frisch vom Server holen (sonst bleibt ein altes Update hängen)
  const isPage = e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isPage) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // offline-Kopie im Hintergrund aktualisieren
          if (res.ok && url.origin === location.origin) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', clone));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // Bilder, Icons & Manifest: erst Cache, dann Netz
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res.ok && url.origin === location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
