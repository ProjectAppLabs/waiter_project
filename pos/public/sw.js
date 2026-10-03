// Plan U2: la app del POS abre sin internet. Guarda lo que el navegador ya descargó y lo sirve si no hay red:
// - páginas: primero la red; sin red, la última copia (o la del inicio, que arma la app en el navegador);
// - archivos de la app (/_next/static, fuentes, íconos): llevan su versión en el nombre, así que la copia vale siempre.
// Nunca guarda la API (/experience/…): los datos los guarda el POS por su cuenta (lib/offline/cache.ts). Solo se
// registra en producción (app/(pos)/layout.tsx), para no estorbar la recarga en caliente del desarrollo.
const CACHE = 'waiter-app-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name)
    await self.clients.claim()
  })())
})

const isAsset = (url) => url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/icons/')

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/experience/') || url.pathname.startsWith('/api/')) return
  if (isAsset(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const hit = await cache.match(request)
      if (hit) return hit
      const response = await fetch(request)
      if (response.ok) await cache.put(request, response.clone())
      return response
    })())
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(request)
        if (response.ok) await cache.put(request, response.clone())
        return response
      } catch {
        return (await cache.match(request)) ?? (await cache.match('/salon')) ?? (await cache.match('/pedidos')) ?? Response.error()
      }
    })())
  }
})
