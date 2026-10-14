// Service worker mínimo: instalable en el móvil del comensal. Sin caché: la carta y el carrito son en vivo.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
