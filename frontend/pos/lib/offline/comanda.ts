import type { Comanda, ComandaLine, ComandaPlace } from '@/lib/domain/comanda'
import { readPrintSettings } from '@/lib/print/settings'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { usePrintStore } from '@/lib/stores/printStore'

// Plan U2: sin conexión cocina no ve el pedido en su pantalla hasta que vuelva la red. Si este equipo imprime comandas,
// sale impresa en el acto con el sello «sin conexión». Devuelve si se imprimió.
export function stationOf(productId: number): string | null {
  const catalog = useCatalogStore.getState().catalog
  const ids = catalog?.products.find((p) => p.id === productId)?.categoryIds ?? []
  return catalog?.categories.find((c) => ids.includes(c.id) && c.station)?.station ?? null
}

export function tablePlace(tableId: number | null): ComandaPlace {
  const number = useCatalogStore.getState().catalog?.tables.find((t) => t.id === tableId)?.number
  return number === undefined ? { kind: 'takeout' } : { kind: 'table', number }
}

export function printOfflineComanda(input: { number: string; place: ComandaPlace; note?: string; lines: ComandaLine[] }): boolean {
  if (!readPrintSettings().autoComanda || input.lines.length === 0) return false
  const comanda: Comanda = { number: input.number, place: input.place, note: input.note ?? '', lines: input.lines, station: null, offline: true,
    waiter: useAuthStore.getState().employee?.name ?? '', at: new Date().toISOString() }
  usePrintStore.getState().printComanda(comanda, { auto: true })
  return true
}
