const CACHE_NAME = 'simulador-clemas-v1.0';
const urlsToCache = [
  '/SimuladorClemas/',
  '/SimuladorClemas/index.html',
  '/SimuladorClemas/manifest.json',
  '/SimuladorClemas/sw.js',
  // Añade aquí todos los archivos CSS, JS, imágenes, etc. que utiliza tu aplicación
];

// Instalación
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activación
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Fetch
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve la respuesta en caché o realiza la petición
        return response || fetch(event.request);
      }
    )
  );
});