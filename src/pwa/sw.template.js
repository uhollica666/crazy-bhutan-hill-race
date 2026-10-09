/* Offline support. __BUILD_ID__ and __PRECACHE__ are substituted by the build (see vite.config.ts).
   Strategy: precache the app shell + hashed assets; navigations are network-first (so updates arrive
   immediately when online) with the cached shell as the offline fallback; other GETs are cache-first. */
const VERSION = '__BUILD_ID__';
const CACHE = 'cbhr-' + VERSION;
const PRECACHE = __PRECACHE__;
const scope = self.registration.scope;
const shell = new URL('index.html', scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new URL(p, scope).href)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('cbhr-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function networkFirst(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => caches.match(shell).then((hit) => (hit ? resolve(hit) : undefined)), 4000);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(shell, copy));
        }
        resolve(res);
      })
      .catch(() => {
        clearTimeout(timer);
        caches.match(shell).then((hit) => (hit ? resolve(hit) : reject(new Error('offline'))));
      });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
