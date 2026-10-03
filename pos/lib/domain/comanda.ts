import type { KitOrder } from '@/lib/domain/orderState'
import type { KitchenTicket } from '@/lib/services/kitchen'

// Plan U3: la comanda impresa de cocina. Sale del ticket de cocina (con conexión) o de las líneas que el POS acaba de
// enviar (sin conexión, U2): por eso es un tipo propio y no el ticket.
export interface ComandaLine { qty: number; name: string; options: string[]; note: string; station: string | null }
export type ComandaPlace = { kind: 'table'; number: number } | { kind: 'takeout' } | { kind: 'delivery' }
export interface Comanda {
  number: string; place: ComandaPlace; waiter: string; at: string; note: string; lines: ComandaLine[]
  // Estación de esta hoja (null: todas las de la carta, o una carta sin estaciones).
  station: string | null
  // Enviada sin conexión: cocina no la verá en pantalla hasta que vuelva la red.
  offline?: boolean
}

export function fromTicket(t: KitchenTicket): Comanda {
  const place: ComandaPlace = t.service === 'takeout' ? { kind: 'takeout' } : t.service === 'delivery' ? { kind: 'delivery' } : { kind: 'table', number: t.tableId }
  return {
    number: t.tracking, place, waiter: t.waiter, at: t.firedAt, note: t.note, station: null,
    lines: t.lines.map((l) => ({ qty: l.qty, name: l.name, options: l.options ?? [], note: l.note, station: l.station })),
  }
}

// Una hoja por estación, en el orden en que aparecen; los platos sin estación van en una hoja general. `only` limita a
// las estaciones de este equipo (vacío: todas). La hoja general sale siempre, porque ninguna estación la imprime.
export function byStation(c: Comanda, only: string[] = []): Comanda[] {
  const groups = new Map<string | null, ComandaLine[]>()
  for (const line of c.lines) groups.set(line.station, [...(groups.get(line.station) ?? []), line])
  return [...groups.entries()]
    .filter(([station]) => station === null || only.length === 0 || only.includes(station))
    .map(([station, lines]) => ({ ...c, station, lines }))
}

// La comanda de un pedido entero desde su detalle: lo ya enviado a cocina, con la estación de cada plato según su
// categoría en la carta.
export function fromOrder(o: KitOrder, stationOf: (productId: number) => string | null): Comanda {
  const place: ComandaPlace = o.type === 'takeout' ? { kind: 'takeout' } : o.type === 'delivery' ? { kind: 'delivery' } : { kind: 'table', number: o.tableNumber ?? 0 }
  return {
    number: o.number, place, waiter: o.waiter ?? '', at: new Date().toISOString(), note: '', station: null,
    lines: o.lines.filter((l) => l.courseId !== null).map((l) => ({ qty: l.qty, name: l.name, options: l.options ?? [], note: l.note, station: stationOf(l.productId) })),
  }
}
