// sw.js - Service Worker do BH Entrega
const CACHE_NAME = 'bh-entrega-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Instalação: cacheia os arquivos essenciais
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Cacheando arquivos essenciais');
            return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
                console.warn('[SW] Falha ao cachear alguns recursos:', err);
            });
        })
    );
    self.skipWaiting();
});

// Ativação: limpa caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Intercepta requisições: usa cache primeiro, depois rede (estratégia offline-first)
self.addEventListener('fetch', (event) => {
    // Ignora requisições não-GET e de APIs externas
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then((response) => {
                // Cacheia apenas respostas válidas da mesma origem
                if (!response || response.status !== 200 || response.type !== 'basic') {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(() => {
                // Fallback para página offline
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});