// Enlaces de Google Maps → coordenadas del restaurante. El administrador pega el enlace que copia de Google Maps en vez
// de escribir latitud y longitud; en Odoo se siguen guardando las dos (el comensal las usa para la distancia y «Cómo
// llegar»). Los enlaces cortos (maps.app.goo.gl) no traen coordenadas: los resuelve el servidor del POS
// (app/api/mapas/resolver/route.ts) y el resultado vuelve a pasar por aquí.
export interface Coordinates { lat: number; lng: number }

const NUMBER = '(-?\\d{1,3}(?:\\.\\d+)?)'
// En orden de confianza. `!3d…!4d…` es el punto del lugar; los parámetros de consulta son el punto que alguien fijó; `@`
// es donde estaba la cámara del mapa al copiar el enlace (cerca, pero no siempre sobre el local): va de último.
const PATTERNS: RegExp[] = [
  new RegExp(`!3d${NUMBER}!4d${NUMBER}`),
  new RegExp(`[?&](?:q|ll|query|destination|center|daddr)=(?:loc:)?${NUMBER}(?:,|%2C)\\s*${NUMBER}`, 'i'),
  new RegExp(`@${NUMBER},${NUMBER}`),
]

const valid = ({ lat, lng }: Coordinates) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

export function coordinatesFromMapsUrl(url: string): Coordinates | null {
  let text = url.trim()
  try { text = decodeURIComponent(text) } catch { /* un % suelto: se lee tal cual */ }
  for (const pattern of PATTERNS) {
    const match = text.match(pattern)
    if (!match) continue
    const found = { lat: Number(match[1]), lng: Number(match[2]) }
    if (valid(found)) return found
  }
  return null
}

// Dominios de Google Maps que se aceptan (también los de país, como google.com.co). Nada más: el servidor solo sigue
// enlaces de estos dominios, para no convertirse en un proxy hacia cualquier dirección.
export function isGoogleMapsUrl(value: string): boolean {
  let url: URL
  try { url = new URL(value.trim()) } catch { return false }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  const host = url.hostname.toLowerCase()
  if (host === 'maps.app.goo.gl') return true
  if (host === 'goo.gl') return url.pathname.startsWith('/maps')
  const google = /^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)
  return google && (host.startsWith('maps.') || url.pathname.startsWith('/maps') || (url.pathname === '/' && url.searchParams.has('q')))
}

// Identificador del lugar (`ftid=0x…:0x…`) de los enlaces que se comparten desde el teléfono, que no traen coordenadas.
// Formato estricto: es lo único del enlace que el servidor le reenvía a Google Maps.
export function placeIdFromMapsUrl(url: string): string | null {
  let text = url
  try { text = decodeURIComponent(url) } catch { /* se lee tal cual */ }
  return text.match(/[?&]ftid=(0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16})(?:&|$)/i)?.[1].toLowerCase() ?? null
}

// Enlace corto de compartir: hay que seguir su redirección para ver las coordenadas.
export const isShortMapsUrl = (value: string) => { try { const host = new URL(value.trim()).hostname.toLowerCase(); return host === 'maps.app.goo.gl' || host === 'goo.gl' } catch { return false } }

// Enlace que se muestra en el formulario para unas coordenadas ya guardadas (y el de «Ver en el mapa»).
export const mapsUrlFor = ({ lat, lng }: Coordinates) => `https://www.google.com/maps?q=${lat},${lng}`
