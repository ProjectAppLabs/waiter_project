import { onCore } from '@/lib/domain/backend'
import * as sales from '@/lib/services/core/sales'
import { toOpenOrder, toSavedOrder } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { useAuthStore } from '@/lib/stores/authStore'
import { toSyncPayload } from '@/lib/domain/order'
import { kitchenPhase, type KitchenPhase } from '@/lib/domain/kitchen'
import { uuid } from '@/lib/domain/uuid'
import type { DraftOrder } from '@/lib/domain/order'
import { lineGroup, type KitOrder } from '@/lib/domain/orderState'
import { listCourseSummaries } from '@/lib/services/kitchen'
import { callKw } from '@/lib/services/odoo'
import { activeEmployeeId } from '@/lib/stores/authStore'

export interface SavedOrder { id: number; reference: string; state: 'draft' | 'paid'; total: number; tax: number; paid: number }
export interface OpenOrder { unsent?: boolean; id: number; tableId: number; total: number; tax: number; state: 'draft' | 'paid'; lineCount: number; startedAt: string; waiter: string; kitchen: KitchenPhase; tracking: string | null }
export interface ShiftSummary { sales: number; orders: number; waiters: number }

interface RawOrder { id: number; pos_reference: string; state: SavedOrder['state']; amount_total: number; amount_tax: number; amount_paid: number }
interface RawOpen { id: number; table_id: [number, string] | false; amount_total: number; amount_tax: number; state: SavedOrder['state']; lines: number[]; date_order: string; user_id: [number, string] | false; tracking_number: string | false }
interface RawPaid { amount_total: number; user_id: [number, string] | false }

const READ_FIELDS = ['pos_reference', 'state', 'amount_total', 'amount_tax', 'amount_paid']

async function readOrder(id: number): Promise<SavedOrder> {
  const [raw] = await callKw<RawOrder[]>('pos.order', 'read', [[id], READ_FIELDS])
  return { id: raw.id, reference: raw.pos_reference, state: raw.state, total: raw.amount_total, tax: raw.amount_tax, paid: raw.amount_paid }
}

export async function saveOrder(draft: DraftOrder): Promise<SavedOrder> {
  if (onCore()) {
    const { restaurant } = useAuthStore.getState()
    const order = await sales.createOrder({ restaurant_id: restaurant?.id ?? currentRestaurantId() ?? 0, uuid: draft.uuid, service: 'dine_in', table_id: draft.tableId, guests: draft.guests, note: draft.note,
      lines: draft.lines.map((l) => ({ uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note })), fire: false })
    return toSavedOrder(order)
  }
  const result = await callKw<{ 'pos.order': { id: number }[] }>('pos.order', 'sync_from_ui', [[toSyncPayload(draft, activeEmployeeId())]])
  const id = result['pos.order'][0].id
  // sync_from_ui deja amount_total en 0 por la API cruda: el recálculo es obligatorio.
  await callKw<void>('pos.order', 'recompute_prices', [[id]])
  return readOrder(id)
}

export async function payOrder(orderId: number, paymentMethodId: number, amount: number, received?: number, reference?: string): Promise<SavedOrder> {
  if (onCore()) return toSavedOrder(await sales.addPayment(orderId, { method_id: paymentMethodId, amount, received, reference, request_key: `pay-${orderId}-${uuid()}` }))
  await callKw<void>('pos.order', 'add_payment', [[orderId], { pos_order_id: orderId, payment_method_id: paymentMethodId, amount }])
  return readOrder(orderId)
}

// La propina en Odoo 19 es una línea del producto de propina (no hay set_tip): se agrega, se recalcula y se anota.
export async function addTip(orderId: number, tipProductId: number, amount: number): Promise<SavedOrder> {
  if (onCore()) return toSavedOrder(await sales.setTip(orderId, amount))
  // Sin recompute_prices (pondría el precio de lista del producto de propina) y con amount_total escrito a mano:
  // en Odoo 19 el total del pedido no se recalcula solo al agregar una línea; lo manda el cliente.
  const current = await readOrder(orderId)
  const line = { product_id: tipProductId, qty: 1, price_unit: amount, full_product_name: 'Propina', tax_ids: [[6, 0, []]], price_subtotal: amount, price_subtotal_incl: amount, uuid: uuid() }
  await callKw('pos.order', 'write', [[orderId], { lines: [[0, 0, line]], tip_amount: amount, is_tipped: true, amount_total: current.total + amount }])
  return readOrder(orderId)
}

// Cambio entregado en efectivo: Odoo lo guarda en amount_return.
export async function setChange(orderId: number, amount: number): Promise<void> {
  // En el sistema propio el cambio sale del efectivo recibido en el pago: nada que escribir aparte.
  if (onCore()) return
  await callKw('pos.order', 'write', [[orderId], { amount_return: amount }])
}

export async function closeOrder(orderId: number): Promise<SavedOrder> {
  if (onCore()) return toSavedOrder(await sales.payOrder(orderId))
  await callKw<void>('pos.order', 'action_pos_order_paid', [[orderId]])
  return readOrder(orderId)
}

export async function listOpenOrders(sessionId: number): Promise<OpenOrder[]> {
  if (onCore()) { void sessionId; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await sales.listOrders(r, 'open')).map(toOpenOrder).filter((o): o is OpenOrder => o !== null) }
  const [rows, courses] = await Promise.all([
    callKw<RawOpen[]>('pos.order', 'search_read',
      [[['session_id', '=', sessionId], ['state', '=', 'draft']], ['table_id', 'amount_total', 'amount_tax', 'state', 'lines', 'date_order', 'user_id', 'tracking_number']]),
    listCourseSummaries(sessionId),
  ])
  return rows
    .filter((r) => r.table_id !== false)
    .map((r) => ({ id: r.id, tableId: (r.table_id as [number, string])[0], total: r.amount_total, tax: r.amount_tax, state: r.state, lineCount: r.lines.length,
      startedAt: r.date_order, waiter: r.user_id ? r.user_id[1] : '', kitchen: kitchenPhase(courses.filter((c) => c.orderId === r.id)), tracking: r.tracking_number || null }))
}

// La fila del salón a partir del pedido completo del kit, para no pedir los mismos pedidos dos veces. Equivale a
// `listOpenOrders`: solo pedidos en mesa, y la fase de cocina sale de los cursos ya enviados (los que no se han
// disparado no cuentan, como en `listCourseSummaries`).
export function openOrderFromKit(o: KitOrder): OpenOrder | null {
  if (o.tableId === null || o.state !== 'draft') return null
  const fired = o.courses.filter((c) => c.fired).map((c) => ({ orderId: o.id, firedAt: '', readyAt: c.readyAt, servedAt: c.servedAt }))
  return { id: o.id, tableId: o.tableId, total: o.total, tax: o.tax, state: 'draft', lineCount: o.lines.length, startedAt: o.startedAt,
    waiter: o.waiter ?? '', kitchen: o.lines.some((line) => lineGroup(o, line) === 'ready') ? 'ready' : kitchenPhase(fired), tracking: o.tracking ?? null,
    unsent: o.lines.some((line) => !o.courses.some((course) => course.id === line.courseId && course.fired)) }
}

// Líneas de un pedido que vive en Odoo pero no se compuso en este dispositivo (otra tablet, el comensal).

// Ventas del turno: lo pagado en la sesión, cuántos pedidos y cuántos meseros distintos.
export async function getShiftSummary(sessionId: number): Promise<ShiftSummary> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); const s = await sales.salesSummary(r, { shift_id: sessionId }); return { sales: s.total, orders: s.orders, waiters: s.by_waiter.length } }
  const rows = await callKw<RawPaid[]>('pos.order', 'search_read',
    [[['session_id', '=', sessionId], ['state', 'in', ['paid', 'done', 'invoiced']]], ['amount_total', 'user_id']])
  const waiters = new Set(rows.map((r) => (r.user_id ? r.user_id[0] : 0)))
  return { sales: rows.reduce((a, r) => a + r.amount_total, 0), orders: rows.length, waiters: waiters.size }
}
