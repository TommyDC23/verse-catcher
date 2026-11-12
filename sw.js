// Verse Catcher service worker.
// 1. Adds the headers that let Chrome and Edge use several processor cores (cross-origin isolation, "credentialless"),
//    which GitHub Pages cannot send itself. Same approach as coi-serviceworker (MIT, Guido Zuidhof).
// 2. Keeps the site's own files on this computer, so later visits open quickly and the page still opens offline.
//    Files with a version stamp (?v=...) and the speech engine files never change, so they come straight from the copy.
//    The page itself is checked online first, so updates appear, with the saved copy as a fallback.
const CACHE = 'verse-catcher-files-v1';   // bump to clear every saved file

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith('verse-catcher-files-') && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));

function withIsolation(res) {
  if (!res || res.status === 0 || res.type === 'opaqueredirect') return res;
  const headers = new Headers(res.headers);
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });   // always ask GitHub if the page changed
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    const hit = await cache.match(request, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const r = event.request;
  if (r.cache === 'only-if-cached' && r.mode !== 'same-origin') return;
  const url = new URL(r.url);
  const own = url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (!own || r.method !== 'GET') {
    const request = r.mode === 'no-cors' ? new Request(r, { credentials: 'omit' }) : r;
    event.respondWith(fetch(request).then(withIsolation));
    return;
  }
  const isPage = r.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
  const keep = url.searchParams.has('v') || url.pathname.includes('/ort/');
  if (isPage) event.respondWith(networkFirst(r).then(withIsolation));
  else if (keep) event.respondWith(cacheFirst(r).then(withIsolation));
  else event.respondWith(fetch(r).then(withIsolation));
});
