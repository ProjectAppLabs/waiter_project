// Plan U2: la app del POS abre sin internet. Guarda lo que el navegador ya descargó y lo sirve si no hay red:
// - páginas: primero la red; sin red, la última copia (o la del inicio, que arma la app en el navegador);
// - archivos de la app (/_next/static, fuentes, íconos): llevan su versión en el nombre, así que la copia vale siempre.
// - navegación dentro de la app: Next pide cada pantalla como datos «RSC»; se guardan igual que las páginas, sin el
//   parámetro `_rsc` (cambia en cada pedido) y con el trozo de la precarga, si lo hay.
// Nunca guarda la API (/experience/…): los datos los guarda el POS por su cuenta (lib/offline/cache.ts). Solo se
// registra en producción (app/(pos)/layout.tsx), para no estorbar la recarga en caliente del desarrollo.
const CACHE = 'waiter-app-v4'

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
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    // Next 16 precarga cada pantalla por trozos (el árbol y la página): cada trozo va con su propia clave.
    const clean = new URL(url)
    clean.searchParams.delete('_rsc')
    const mode = request.headers.get('Next-Router-Prefetch') === '1' ? 'prefetch' : 'full'
    const segment = request.headers.get('Next-Router-Segment-Prefetch') ?? ''
    const keyFor = (u, m) => new Request(`${u.origin}${u.pathname}?${u.searchParams.toString() ? `${u.searchParams}&` : ''}__rsc=${m}&__seg=${encodeURIComponent(segment)}`)
    const bare = new URL(`${clean.origin}${clean.pathname}`)
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const response = await fetch(request)
        if (response.ok) await cache.put(keyFor(clean, mode), response.clone())
        return response
      } catch {
        // La misma pantalla con otros parámetros (?sinMesa=1): las pantallas los leen en el navegador.
        for (const candidate of [keyFor(clean, mode), keyFor(bare, mode), keyFor(clean, mode === 'full' ? 'prefetch' : 'full'), keyFor(bare, mode === 'full' ? 'prefetch' : 'full')]) {
          const hit = await cache.match(candidate)
          if (hit) return hit
        }
        return Response.error()
      }
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
        return (await cache.match(request)) ?? (await cache.match(request, { ignoreSearch: true })) ?? (await cache.match('/pedidos')) ?? (await cache.match('/salon')) ?? Response.error()
      }
    })())
  }
})
