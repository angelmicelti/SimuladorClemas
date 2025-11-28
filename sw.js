const CACHE_NAME = 'simulador-clemas-v1.0';
const urlsToCache = [
  '/SimuladorClemas/',
  '/SimuladorClemas/index.html',
  '/SimuladorClemas/style.css',
  '/SimuladorClemas/script.js',
  '/SimuladorClemas/manifest.json',
  '/SimuladorClemas/icons/icon-72x72.png',
  '/SimuladorClemas/icons/icon-152x152.png',
  '/SimuladorClemas/icons/icon-512x512.png',
  '/SimuladorClemas/clemas.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la respuesta en caché o realiza la petición
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});