import { kitchenPhase, type KitchenPhase } from '@/lib/domain/kitchen'
import type { DraftOrder } from '@/lib/domain/order'
import { lineGroup, type KitOrder } from '@/lib/domain/orderState'
import { uuid } from '@/lib/domain/uuid'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as sales from '@/lib/services/core/sales'
import { toOpenOrder, toSavedOrder } from '@/lib/services/core/salesBridge'
import { printFiredCourse } from '@/lib/print/autoComanda'
import { withComboChildren } from '@/lib/services/productOptions'
import { useAuthStore } from '@/lib/stores/authStore'

export interface SavedOrder { id: number; reference: string; state: 'draft' | 'paid'; total: number; tax: number; paid: number }
export interface OpenOrder { unsent?: boolean; id: number; tableId: number; total: number; tax: number; state: 'draft' | 'paid'; lineCount: number; startedAt: string; waiter: string; kitchen: KitchenPhase; tracking: string | null }
export interface ShiftSummary { sales: number; orders: number; waiters: number }

export async function saveOrder(draft: DraftOrder): Promise<SavedOrder> {
  const { restaurant } = useAuthStore.getState()
  const order = await sales.createOrder({
    restaurant_id: restaurant?.id ?? currentRestaurantId() ?? 0, uuid: draft.uuid, service: 'dine_in', table_id: draft.tableId, guests: draft.guests, note: draft.note,
    lines: await withComboChildren(draft.lines.map((l) => ({ uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note }))), fire: false
  })
  return toSavedOrder(order)
}

export async function payOrder(orderId: number, paymentMethodId: number, amount: number, received?: number, reference?: string): Promise<SavedOrder> {
  return toSavedOrder(await sales.addPayment(orderId, { method_id: paymentMethodId, amount, received, reference, request_key: `pay-${orderId}-${uuid()}` }))
}

// La propina es un importe del pedido en el sistema propio (no un producto): se reemplaza con el valor elegido.
export async function addTip(orderId: number, amount: number): Promise<SavedOrder> {
  return toSavedOrder(await sales.setTip(orderId, amount))
}

export async function setChange(orderId: number, amount: number): Promise<void> {
  // En el sistema propio el cambio sale del efectivo recibido en el pago: nada que escribir aparte.
  return
}

export async function closeOrder(orderId: number): Promise<SavedOrder> {
  const saved = toSavedOrder(await sales.payOrder(orderId))
  // Cobrar envía a cocina lo que faltaba: esa ronda también sale impresa en los equipos que imprimen (plan U3).
  void printFiredCourse(null, orderId)
  return saved
}

export async function listOpenOrders(sessionId: number): Promise<OpenOrder[]> {
  void sessionId
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await sales.listOrders(r, 'open')).map(toOpenOrder).filter((o): o is OpenOrder => o !== null)
}

// La fila del salón a partir del pedido completo del kit, para no pedir los mismos pedidos dos veces. Equivale a
// `listOpenOrders`: solo pedidos en mesa, y la fase de cocina sale de los cursos ya enviados (los que no se han
// disparado no cuentan, como en `listCourseSummaries`).
export function openOrderFromKit(o: KitOrder): OpenOrder | null {
  if (o.tableId === null || o.state !== 'draft') return null
  const fired = o.courses.filter((c) => c.fired).map((c) => ({ orderId: o.id, firedAt: '', readyAt: c.readyAt, servedAt: c.servedAt }))
  return {
    id: o.id, tableId: o.tableId, total: o.total, tax: o.tax, state: 'draft', lineCount: o.lines.length, startedAt: o.startedAt,
    waiter: o.waiter ?? '', kitchen: o.lines.some((line) => lineGroup(o, line) === 'ready') ? 'ready' : kitchenPhase(fired), tracking: o.tracking ?? null,
    unsent: o.lines.some((line) => !o.courses.some((course) => course.id === line.courseId && course.fired))
  }
}

// Ventas del turno: lo pagado en la sesión, cuántos pedidos y cuántos meseros distintos.
export async function getShiftSummary(sessionId: number): Promise<ShiftSummary> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const s = await sales.salesSummary(r, { shift_id: sessionId })
  return { sales: s.total, orders: s.orders, waiters: s.by_waiter.length }
}
