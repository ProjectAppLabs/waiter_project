import { cartAmounts } from '@/lib/domain/cartAmounts'
import { serverDate } from '@/lib/domain/time'

export type OrderType = 'dine_in' | 'takeout' | 'delivery'
export type ServiceAt = 'table' | 'counter' | 'delivery'
export type KitStatus = 'pending_send' | 'in_progress' | 'ready' | 'served' | 'waiting_payment' | 'completed'
export type LineGroup = 'waiting' | 'in_progress' | 'ready' | 'served'
export type OrdersFilter = 'all' | KitStatus
export type OrdersSort = 'latest' | 'oldest' | 'type'
export type HistoryFilter = 'all' | OrderType

export interface KitCourse { id: number; fired: boolean; preparationAt?: string | null; readyAt: string | null; servedAt: string | null }
export interface KitLine {
  id: number; uuid: string; productId: number; name: string; qty: number; unitPrice: number; subtotal: number; total: number; note: string
  courseId: number | null; readyAt: string | null; servedAt: string | null
  // Opciones elegidas (tamaño, adiciones): van en la comanda impresa.
  options?: string[]
}
export interface KitOrder {
  channel?: 'whatsapp' | null; phone?: string
  id: number; number: string; type: OrderType; state: 'draft' | 'paid' | 'done' | 'invoiced' | 'cancel'
  tableId: number | null; tableNumber: number | null; customer: string; startedAt: string; total: number; tax: number
  lines: KitLine[]; courses: KitCourse[]
  // Lo devuelto de un pedido cobrado (plan U1).
  refunded?: number
  // Para derivar de aquí la lista del salón (`openOrderFromKit`) sin pedir los mismos pedidos otra vez.
  waiter?: string; tracking?: string | null
}

const PREFIX: Record<OrderType, string> = { dine_in: 'DI', takeout: 'TA', delivery: 'DE' }
const PAID = new Set(['paid', 'done', 'invoiced'])
const STATUS_ORDER: KitStatus[] = ['pending_send', 'in_progress', 'ready', 'served', 'waiting_payment', 'completed']

export function orderTypeOf(serviceAt: ServiceAt | null, hasTable: boolean): OrderType {
  if (serviceAt === 'counter') return 'takeout'
  if (serviceAt === 'delivery') return 'delivery'
  if (serviceAt === 'table') return 'dine_in'
  return hasTable ? 'dine_in' : 'takeout'
}

export function orderNumber(type: OrderType, tracking: string | number): string {
  const digits = String(tracking).replace(/\D/g, '') || '0'
  return `${PREFIX[type]}${digits.padStart(3, '0')}`
}

export function customerName(floatingName: string | false | null, partner: [number, string] | false | null): string {
  return (floatingName || '').trim() || (partner ? partner[1] : '')
}

const courseOf = (order: KitOrder, line: KitLine) => order.courses.find((c) => c.id === line.courseId)

// El viaje de un plato, tal como lo vive el mesero:
//   waiting     — pendiente de iniciar preparación, enviada o todavía sin enviar
//   in_progress — cocina lo está haciendo
//   ready       — cocina lo marcó listo: está en el pase, hay que ir por él
//   served      — el mesero lo dejó en la mesa
// Manda el plato, no la comanda: cocina saca de uno en uno y el mesero entrega de uno en uno. La fecha del
// curso se mira además del plato porque cierra la comanda entera cuando se marca "todo".
export function lineGroup(order: KitOrder, line: KitLine): LineGroup {
  const course = courseOf(order, line)
  if (!course || !course.fired) return 'waiting'
  if (line.servedAt || course.servedAt) return 'served'
  if (line.readyAt || course.readyAt) return 'ready'
  return course.preparationAt ? 'in_progress' : 'waiting'
}

// % = líneas servidas / líneas enviadas a cocina. Sin nada enviado, 0.
export function progressPercent(order: KitOrder): number {
  const sent = order.lines.filter((l) => lineGroup(order, l) !== 'waiting')
  if (sent.length === 0) return 0
  return Math.round((sent.filter((l) => lineGroup(order, l) === 'served').length / sent.length) * 100)
}

export function orderStatus(order: KitOrder, billing: boolean): KitStatus {
  if (PAID.has(order.state)) return 'completed'
  if (billing) return 'waiting_payment'
  if (!order.lines.some((line) => courseOf(order, line)?.fired)) return 'pending_send'
  const groups = order.lines.map((l) => lineGroup(order, l))
  if (groups.length > 0 && groups.every((g) => g === 'served')) return 'served'
  // Basta un plato esperando en el pase para que el pedido reclame al mesero.
  if (groups.includes('ready')) return 'ready'
  return 'in_progress'
}

// Lo que cocina ya dejó en el pase y nadie ha llevado: la lista de trabajo del mesero, lo que espera primero.
export interface ReadyDish { orderId: number; orderNumber: string; lineId: number; name: string; qty: number; tableNumber: number | null; customer: string; since: string }
export function readyToServe(orders: KitOrder[]): ReadyDish[] {
  const dishes = orders.flatMap((o) => o.lines.filter((l) => lineGroup(o, l) === 'ready').map((l) => ({
    orderId: o.id, orderNumber: o.number, lineId: l.id, name: l.name, qty: l.qty,
    tableNumber: o.tableNumber, customer: o.customer,
    since: l.readyAt ?? o.courses.find((c) => c.id === l.courseId)?.readyAt ?? o.startedAt,
  })))
  return dishes.sort((a, b) => a.since.localeCompare(b.since) || a.lineId - b.lineId)
}

// Cobrar exige que todo lo pedido esté servido (el kit deshabilita "Pay Bills" mientras haya casillas sin marcar).
export function canCharge(order: KitOrder): boolean {
  return order.lines.length > 0 && order.lines.every((l) => lineGroup(order, l) === 'served')
}

// Búsqueda por número de pedido ("DI104", "104", "#104") o por nombre de cliente.
export function matchesOrderSearch(order: KitOrder, query: string): boolean {
  const q = query.trim().replace(/^#/, '').toLowerCase()
  if (!q) return true
  return order.number.toLowerCase().includes(q) || order.customer.toLowerCase().includes(q) || String(order.id) === q
}

export function filterOrders(orders: KitOrder[], filter: OrdersFilter, statusOf: (o: KitOrder) => KitStatus): KitOrder[] {
  return filter === 'all' ? orders : orders.filter((o) => statusOf(o) === filter)
}

export function countByStatus(orders: KitOrder[], statusOf: (o: KitOrder) => KitStatus): Record<OrdersFilter, number> {
  const counts = { all: orders.length, pending_send: 0, in_progress: 0, ready: 0, served: 0, waiting_payment: 0, completed: 0 }
  orders.forEach((o) => { counts[statusOf(o)] += 1 })
  return counts
}

const TYPE_ORDER: OrderType[] = ['dine_in', 'takeout', 'delivery']
export function sortOrders(orders: KitOrder[], sort: OrdersSort): KitOrder[] {
  const byDate = (a: KitOrder, b: KitOrder) => b.startedAt.localeCompare(a.startedAt) || b.id - a.id
  if (sort === 'latest') return [...orders].sort(byDate)
  if (sort === 'oldest') return [...orders].sort((a, b) => -byDate(a, b))
  return [...orders].sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || byDate(a, b))
}

export function filterHistory(orders: KitOrder[], filter: HistoryFilter): KitOrder[] {
  return filter === 'all' ? orders : orders.filter((o) => o.type === filter)
}

export const statusRank = (s: KitStatus) => STATUS_ORDER.indexOf(s)

export function orderDate(at: string): Date {
  return serverDate(at)
}

// Saludo por hora local: mañana hasta las 12, tarde hasta las 19, noche después.
export function greetingFor(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  return hour < 19 ? 'afternoon' : 'evening'
}

export interface TaxRate { id: number; amount: number; priceInclude: boolean }
export interface CartLine { unitPrice: number; qty: number; taxIds: number[] }
export function cartTotals(lines: CartLine[], taxes: TaxRate[]): { subtotal: number; tax: number; total: number } {
  return cartAmounts(lines, taxes)
}
