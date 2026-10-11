// Plan D: cuando la dirección de entrega la atiende otra sede, el comensal pasa a esa sede con su ubicación ya puesta.
// Lo que viaja entre sedes va en sessionStorage (la pestaña): la ubicación y el aviso que se muestra al llegar.
export interface CarriedLocation { lat: number; lng: number; direccion: string }
// Los platos que el comensal ya había escogido: se llevan a la otra sede (allá se revisa precio y disponibilidad).
export interface CarriedLine { producto_id: number; cantidad: number; nota: string; nombre: string }
const KEY = (rest: string) => `waiter:domicilio:${rest}`

function storage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage } catch { return null }
}

export function carryTo(rest: string, venue: string, location: CarriedLocation, motivo: string, lines: CarriedLine[] = []) {
  storage()?.setItem(KEY(rest), JSON.stringify({ venue, location, motivo, lines }))
}

// Lo que dejó la sede anterior para esta sede (se lee una vez).
export function takeCarried(rest: string, venue: string): { location: CarriedLocation; motivo: string; lines: CarriedLine[] } | null {
  const raw = storage()?.getItem(KEY(rest))
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (data.venue !== venue) return null
    storage()?.removeItem(KEY(rest))
    return { location: data.location, motivo: data.motivo, lines: Array.isArray(data.lines) ? data.lines : [] }
  } catch { return null }
}


// El rectángulo que contiene la zona de entrega (radio + margen), para limitar el mapa.
export function areaBounds(center: { lat: number; lng: number }, radiusKm: number, marginKm = 1.5): [[number, number], [number, number]] {
  const dLat = (radiusKm + marginKm) / 111
  const dLng = dLat / Math.max(.2, Math.cos(center.lat * Math.PI / 180))
  return [[center.lng - dLng, center.lat - dLat], [center.lng + dLng, center.lat + dLat]]
}
