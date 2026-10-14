import { areaBounds } from '@/lib/domain/venueRedirect'
import type { Entry } from '@/lib/types'

// La zona de entrega de la sede (centro y radio de domicilio) para limitar el mapa; sin datos, el mapa queda libre.
export function zoneOf(entry: Entry | null | undefined) {
  const d = entry?.domicilio
  return d?.centro && d.radio_km ? { center: d.centro, radiusKm: d.radio_km } : null
}

// Si un punto cae dentro de la zona del mapa de esta sede; fuera de ella, el mapa no puede mostrarlo y hay que revisar
// qué sede atiende esa dirección.
export function insideZone(entry: Entry | null | undefined, p: { lat: number; lng: number }) {
  const zone = zoneOf(entry)
  if (!zone) return true
  const [[west, south], [east, north]] = areaBounds(zone.center, zone.radiusKm)
  return p.lng >= west && p.lng <= east && p.lat >= south && p.lat <= north
}

export const NO_COVERAGE = 'Ninguna de nuestras sedes tiene cobertura en esa dirección.'
// Por qué no hay domicilio a esa dirección: la sede que llega está cerrada (y cuándo abre) o ninguna llega.
export const uncoveredText = (c: { motivo: string; mensaje?: string; recoger: { nombre: string }[] }) =>
  (c.motivo === 'cerrado' && c.mensaje ? c.mensaje : `${NO_COVERAGE}${pickupText(c.recoger)}`)
export const pickupText = (recoger: { nombre: string }[]) => (recoger.length ? ` Puedes recogerlo en ${recoger.map((r) => r.nombre).join(' o ')}.` : '')
