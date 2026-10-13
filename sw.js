// Service worker: guarda la app en el teléfono para que abra sin conexión.
// Cambia VERSION cada vez que publiques cambios para que los teléfonos se actualicen.
const VERSION = 'bitacora-v1.0.0';
const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/api.js',
  'js/campos.js',
  'js/config.js',
  'js/db.js',
  'js/media.js',
  'js/negocio.js',
  'js/state.js',
  'js/sync.js',
  'js/ui.js',
  'js/views/adjuntos.js',
  'js/views/admin.js',
  'js/views/cuenta.js',
  'js/views/eventos.js',
  'js/views/login.js',
  'js/views/vehiculos.js',
  'demo/emulador.js',
  'demo/Code.gs',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'activar') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;            // las llamadas a la API (POST) van siempre a la red
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Google, Drive, etc.

  // Navegación: la app es una sola página
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html', { ignoreSearch: true }).then((r) => r || fetch(req)),
    );
    return;
  }
  // Archivos de la app: desde la caché de esta versión (rápido y sin conexión)
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const enCache = await cache.match(req, { ignoreSearch: true });
      if (enCache) return enCache;
      const r = await fetch(req);
      if (r && r.ok && r.type === 'basic') cache.put(req, r.clone());
      return r;
    }),
  );
});
