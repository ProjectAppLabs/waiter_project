import { elapsedSeconds } from '@/lib/domain/kitchen'
import type { LocalFlags } from '@/lib/domain/tableState'
import type { ShiftOrder } from '@/lib/services/ops'
import type { TableCall } from '@/lib/services/tables'

export type AlertKind = 'kitchen' | 'payment' | 'table'
export type Filter = 'all' | 'tables' | 'kitchen' | 'payments'
export interface Alert { id: string; kind: AlertKind; orderId: number | null; tableId: number | null; tableNumber: number | null; seconds: number; severity: 'busy' | 'warn' }
export type OrderStatus = 'late' | 'pending' | 'cooking' | 'ready' | 'served' | 'paid'

const PAID = new Set(['paid', 'done', 'invoiced'])

export function orderStatus(o: ShiftOrder, now: number, lateMinutes: number): { status: OrderStatus; minutes: number } {
  if (PAID.has(o.state)) return { status: 'paid', minutes: 0 }
  if (o.kitchen === 'cooking' && o.firedAt) {
    const minutes = Math.floor(elapsedSeconds(o.firedAt, now) / 60)
    return { status: minutes >= lateMinutes ? 'late' : 'cooking', minutes }
  }
  if (o.kitchen === 'ready') return { status: 'ready', minutes: 0 }
  if (o.kitchen === 'served') return { status: 'served', minutes: 0 }
  return { status: 'pending', minutes: 0 }
}

// Solo excepciones: si nada está mal, la lista está vacía y la pantalla tranquila.
export function deriveAlerts(orders: ShiftOrder[], flags: Record<number, LocalFlags>, billingSince: Record<number, number>, now: number,
  thresholds: { late: number; bill: number }, calls: TableCall[] = [], tableNumberOf: (id: number) => number | null = () => null): Alert[] {
  const alerts: Alert[] = []
  // El comensal llamó al mesero desde su móvil: siempre es excepción, desde el primer segundo.
  calls.filter((c) => c.kind === 'assist').forEach((c) => {
    alerts.push({ id: `assist-${c.tableId}`, kind: 'table', orderId: null, tableId: c.tableId, tableNumber: tableNumberOf(c.tableId), seconds: c.since ? elapsedSeconds(c.since, now) : 0, severity: 'busy' })
  })
  orders.forEach((o) => {
    const { status, minutes } = orderStatus(o, now, thresholds.late)
    if (status === 'late') alerts.push({ id: `late-${o.id}`, kind: 'kitchen', orderId: o.id, tableId: o.tableId, tableNumber: o.tableNumber, seconds: minutes * 60 + (elapsedSeconds(o.firedAt!, now) % 60), severity: 'busy' })
  })
  Object.entries(flags).forEach(([tableId, f]) => {
    const since = billingSince[Number(tableId)]
    if (!f.billing || !since) return
    const seconds = Math.floor((now - since) / 1000)
    if (seconds >= thresholds.bill * 60) {
      const order = orders.find((o) => o.tableId === Number(tableId) && !PAID.has(o.state))
      alerts.push({ id: `bill-${tableId}`, kind: 'payment', orderId: order?.id ?? null, tableId: Number(tableId), tableNumber: order?.tableNumber ?? null, seconds, severity: 'warn' })
    }
  })
  return alerts.sort((a, b) => b.seconds - a.seconds)
}

export function matchesFilter(kind: AlertKind, filter: Filter): boolean {
  return filter === 'all' || (filter === 'kitchen' && kind === 'kitchen') || (filter === 'payments' && kind === 'payment') || (filter === 'tables' && kind === 'table')
}

export function filterOrders(orders: ShiftOrder[], filter: Filter, now: number, lateMinutes: number): ShiftOrder[] {
  if (filter === 'all') return orders
  return orders.filter((o) => {
    const { status } = orderStatus(o, now, lateMinutes)
    if (filter === 'kitchen') return status === 'late' || status === 'cooking' || status === 'ready'
    if (filter === 'payments') return status === 'served' || status === 'pending'
    return o.tableId !== null && status !== 'paid'
  })
}
