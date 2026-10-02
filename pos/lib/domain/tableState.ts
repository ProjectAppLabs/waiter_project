import { serverTime } from '@/lib/domain/time'
import type { OpenOrder } from '@/lib/services/orders'
import type { TableCall } from '@/lib/services/tables'
import type { KitchenPhase } from '@/lib/domain/kitchen'
import type { Table } from '@/lib/types'

export type TableState = 'free' | 'occupied' | 'kitchen' | 'ready' | 'billing' | 'paid' | 'ordering' | 'served' | 'assist' | 'closed'
export interface LocalFlags { billing?: boolean; assist?: boolean; closed?: boolean; ordering?: boolean }
export type TableNotice = 'ready' | 'unsent' | 'assist' | 'ordering' | 'bill'
export interface TableView { notices?: TableNotice[]; table: Table; state: TableState; total: number; tax: number; orderId: number | null; startedAt: string | null; waiter: string | null; callSince: string | null }

const STATES: TableState[] = ['free', 'occupied', 'kitchen', 'ready', 'billing', 'paid', 'ordering', 'served', 'assist', 'closed']

function stateFor(order: OpenOrder | undefined, flags: LocalFlags, call: TableCall | undefined): TableState {
  if (flags.closed) return 'closed'
  if (flags.assist || call?.kind === 'assist') return 'assist'
  if (flags.billing || call?.kind === 'bill') return 'billing'
  if (flags.ordering || call?.kind === 'ordering') return 'ordering'
  if (!order) return 'free'
  return phaseState(order.kitchen)
}
// "Listo" es su propio estado en el plano: es la mesa a la que el mesero tiene que ir ya.
function phaseState(phase: KitchenPhase): TableState {
  if (phase === 'served') return 'served'
  if (phase === 'ready') return 'ready'
  return phase === 'none' ? 'occupied' : 'kitchen'
}

export function deriveTableViews(tables: Table[], orders: OpenOrder[], flags: Record<number, LocalFlags>, calls: TableCall[] = []): TableView[] {
  return tables.map((table) => {
    const order = orders.find((o) => o.tableId === table.id)
    const call = calls.find((c) => c.tableId === table.id)
    const tableOrders = orders.filter((entry) => entry.tableId === table.id)
    const notices: TableNotice[] = []
    if (tableOrders.some((entry) => entry.kitchen === 'ready')) notices.push('ready')
    if (tableOrders.some((entry) => entry.unsent || (entry.kitchen === 'none' && entry.lineCount > 0))) notices.push('unsent')
    if (call) notices.push(call.kind)
    return { table, notices, state: stateFor(order, flags[table.id] ?? {}, call), total: order?.total ?? 0, tax: order?.tax ?? 0, orderId: order?.id ?? null,
      startedAt: order?.startedAt ?? null, waiter: order?.waiter ?? null, callSince: call?.since || null }
  })
}

// "Buscar mesa o pedido": por número de mesa, por número de pedido (#42 o 42) o por mesero.
export function matchesSearch(view: TableView, query: string): boolean {
  const q = query.trim().replace(/^#/, '').toLowerCase()
  if (!q) return true
  return String(view.table.number) === q || (view.orderId !== null && String(view.orderId) === q) || (view.waiter ?? '').toLowerCase().includes(q)
}

export function countByState(views: TableView[]): Record<TableState, number> {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0])) as Record<TableState, number>
  views.forEach((v) => { counts[v.state] += 1 })
  return counts
}

export function elapsedMinutes(startedAt: string, now: number): number {
  const t = serverTime(startedAt)
  return Math.max(0, Math.floor((now - t) / 60_000))
}

// "0:34", "1:12" — horas:minutos, como en las celdas del diseño.
export function formatElapsed(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

// Barra de 22 minutos con marcas a los 12 y 18, como el KDS del sistema Waiter.
export const BAR_SCALE_MIN = 22
export function barFill(minutes: number): number {
  return Math.min(100, Math.round((minutes / BAR_SCALE_MIN) * 100))
}
export function barTone(minutes: number): 'ok' | 'warn' | 'late' {
  return minutes >= 18 ? 'late' : minutes >= 12 ? 'warn' : 'ok'
}
