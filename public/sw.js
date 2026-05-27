// Calavera Riches — Service Worker
// Strategy:
//   - Cache-first for static assets (images, fonts, audio) — fast load, offline play
//   - Network-first for HTML/JS bundles — picks up updates
//   - Auto-cleanup old cache versions on activate
//
// To bump cache (after a release), change CACHE_VERSION.

const CACHE_VERSION = 'calavera-v1.17.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Core files that MUST be cached at install (game runs offline if these are cached)
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

// Install: precache core, skip waiting so new SW activates immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: cleanup old cache versions + take control of clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   - Static assets (img, audio, font, css): cache-first with network fallback
//   - HTML / JS modules: network-first (pick up updates), cache fallback
//   - Other: pass-through
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle same-origin (skip Google Fonts CDN etc to keep simple)
  if (url.origin !== self.location.origin) return;

  const isStatic = /\.(png|jpg|jpeg|webp|svg|mp4|mp3|wav|ogg|woff2?|ttf|css|ico)$/i.test(url.pathname);
  const isHtml = url.pathname === '/' || url.pathname.endsWith('.html');

  if (isStatic) {
    event.respondWith(cacheFirst(request));
  } else if (isHtml) {
    event.respondWith(networkFirst(request));
  } else {
    // JS modules, manifest, etc — network-first
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // Offline + not in cache — just fail gracefully
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

// Allow client to trigger immediate update via postMessage
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
