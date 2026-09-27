import { coordinatesFromMapsUrl, isGoogleMapsUrl, placeIdFromMapsUrl, type Coordinates } from '@/lib/domain/mapsLink'

// Resuelve un enlace de Google Maps a las coordenadas del lugar. Vive en el servidor porque el navegador no puede leer
// la redirección de otro dominio ni consultar a Google Maps directamente.
//
// 1. Enlace corto (maps.app.goo.gl): se siguen sus redirecciones hasta la URL larga. Sin User-Agent a propósito: con el
//    de un navegador, Google responde una página intermedia en JavaScript sin redirección; sin él, un 302 limpio.
//    Solo se siguen enlaces de Google Maps, en cada salto: así no sirve para que el servidor pida cualquier dirección.
// 2. Si la URL larga trae el punto (!3d/!4d, q=lat,lng, @lat,lng), listo.
// 3. Los enlaces que se comparten desde el teléfono llegan a `?q=<nombre>&ftid=<id>`, sin coordenadas. Con el `ftid` se
//    consulta la ficha del lugar a Google Maps (`/maps/preview/place`). OJO: no es una API pública documentada; es la
//    que usa la propia web de Google Maps. Si cambia, este paso deja de encontrar el punto y el formulario pide el enlace
//    del computador (que sí trae coordenadas): se degrada, no se rompe. Se comprueba que la ficha sea del mismo `ftid`.
const MAX_HOPS = 5
const TIMEOUT_MS = 5000

type Place = Coordinates & { name: string | null }

// Ficha del lugar: tras el prefijo `)]}'`, un arreglo cuyo índice 6 es el lugar: [9] = [_, _, lat, lng], [10] = ftid,
// [11] = nombre. Cualquier forma distinta se trata como «no se encontró».
async function placeFor(ftid: string): Promise<Place | null> {
  const url = `https://www.google.com/maps/preview/place?authuser=0&hl=es&gl=co&pb=!1m1!1s${encodeURIComponent(ftid)}`
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  if (!response.ok) return null
  const text = await response.text()
  try {
    const place = JSON.parse(text.slice(text.indexOf('\n') + 1))?.[6]
    const [lat, lng] = [place?.[9]?.[2], place?.[9]?.[3]]
    if (place?.[10] !== ftid || typeof lat !== 'number' || typeof lng !== 'number') return null
    const found = coordinatesFromMapsUrl(`https://www.google.com/maps?q=${lat},${lng}`) // mismas reglas de validez
    return found && { ...found, name: typeof place[11] === 'string' ? place[11] : null }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get('url') ?? ''
  if (!isGoogleMapsUrl(target)) return Response.json({ error: 'not_maps' }, { status: 400 })
  let current = target
  try {
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      if (coordinatesFromMapsUrl(current) || placeIdFromMapsUrl(current)) break
      const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
      const next = response.headers.get('location')
      if (response.status < 300 || response.status >= 400 || !next) break
      const resolved = new URL(next, current).toString()
      if (!isGoogleMapsUrl(resolved)) break
      current = resolved
    }
    const direct = coordinatesFromMapsUrl(current)
    if (direct) return Response.json({ url: current, ...direct, name: null })
    const ftid = placeIdFromMapsUrl(current)
    const place = ftid ? await placeFor(ftid) : null
    return Response.json({ url: current, ...(place ?? { lat: null, lng: null, name: null }) })
  } catch {
    return Response.json({ error: 'unreachable' }, { status: 502 })
  }
}
