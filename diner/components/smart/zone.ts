import type { Entry } from '@/lib/types'

// La zona de entrega de la sede (centro y radio de domicilio) para limitar el mapa; sin datos, el mapa queda libre.
export function zoneOf(entry: Entry | null | undefined) {
  const d = entry?.domicilio
  return d?.centro && d.radio_km ? { center: d.centro, radiusKm: d.radio_km } : null
}
