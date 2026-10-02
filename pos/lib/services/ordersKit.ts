import { onCore } from '@/lib/domain/backend'
import * as coreCatalog from '@/lib/services/core/catalog'
import * as coreKitchen from '@/lib/services/core/kitchen'
import * as sales from '@/lib/services/core/sales'
import { toKitOrder } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import type { DraftLine } from '@/lib/domain/order'
import { customerName, orderNumber, orderTypeOf, type KitCourse, type KitLine, type KitOrder, type ServiceAt, type TaxRate } from '@/lib/domain/orderState'
import { fireUnsentLines } from '@/lib/services/kitchen'
import { callKw } from '@/lib/services/odoo'

// Pedidos en el lenguaje del kit (Dashboard, Pedidos, Historial, Agregar ronda). Convive con orders.ts, que sigue
// sirviendo al salón y al cobro; aquí solo se lee y se completa lo que esas pantallas necesitan.

interface RawOrder {
  waiter_channel?: 'whatsapp' | false; delivery_phone?: string | false
  id: number; tracking_number: string | false; user_id?: [number, string] | false; preset_id: [number, string] | false; floating_order_name: string | false; partner_id: [number, string] | false
  table_id: [number, string] | false; date_order: string; amount_total: number; amount_tax: number; state: KitOrder['state']
}
interface RawLine { id: number; uuid: string; order_id: [number, string]; product_id: [number, string]; full_product_name: string; qty: number; price_unit: number; price_subtotal: number; price_subtotal_incl: number; customer_note: string | false; course_id: [number, string] | false; waiter_ready_date: string | false; served_date: string | false }
interface RawCourse { id: number; order_id: [number, string]; fired: boolean; preparation_date: string | false; ready_date: string | false; served_date: string | false }
interface RawPreset { id: number; service_at: ServiceAt }
interface RawTax { id: number; amount: number; price_include: boolean }

const ORDER_FIELDS = ['tracking_number', 'user_id', 'preset_id', 'floating_order_name', 'partner_id', 'table_id', 'date_order', 'amount_total', 'amount_tax', 'state', 'waiter_channel', 'delivery_phone']
const LINE_FIELDS = ['uuid', 'order_id', 'product_id', 'full_product_name', 'qty', 'price_unit', 'price_subtotal', 'price_subtotal_incl', 'customer_note', 'course_id', 'waiter_ready_date', 'served_date']
const PAID = ['paid', 'done', 'invoiced']

let presetCache: Map<number, ServiceAt> | null = null
// Los presets de Odoo (Dine In / Takeout / Delivery) casi no cambian: se leen una vez por carga de la app.
async function presets(): Promise<Map<number, ServiceAt>> {
  if (presetCache) return presetCache
  const rows = await callKw<RawPreset[]>('pos.preset', 'search_read', [[], ['service_at']])
  presetCache = new Map(rows.map((p) => [p.id, p.service_at]))
  return presetCache
}
export const resetPresetCache = () => { presetCache = null }

const toLine = (l: RawLine): KitLine => ({
  id: l.id, uuid: l.uuid, productId: l.product_id[0], name: l.full_product_name, qty: l.qty, unitPrice: l.price_unit,
  subtotal: l.price_subtotal, total: l.price_subtotal_incl, note: l.customer_note || '', courseId: l.course_id ? l.course_id[0] : null,
  readyAt: l.waiter_ready_date || null,
  servedAt: l.served_date || null,
})
const toCourse = (c: RawCourse): KitCourse => ({ id: c.id, fired: c.fired, preparationAt: c.preparation_date || null, readyAt: c.ready_date || null, servedAt: c.served_date || null })

function toOrder(r: RawOrder, serviceAt: Map<number, ServiceAt>, tableNumberOf: (id: number) => number | null, lines: KitLine[], courses: KitCourse[]): KitOrder {
  const type = orderTypeOf(r.preset_id ? serviceAt.get(r.preset_id[0]) ?? null : null, r.table_id !== false)
  return {
    id: r.id, number: orderNumber(type, r.tracking_number || r.id), type, state: r.state,
    channel: r.waiter_channel || null, phone: r.delivery_phone || '',
    tableId: r.table_id ? r.table_id[0] : null, tableNumber: r.table_id ? tableNumberOf(r.table_id[0]) : null,
    customer: customerName(r.floating_order_name, r.partner_id), startedAt: r.date_order, total: r.amount_total, tax: r.amount_tax, lines, courses,
    waiter: r.user_id ? r.user_id[1] : '', tracking: r.tracking_number || null,
  }
}

// Pedidos abiertos de la sesión con sus líneas y cursos: tres llamadas por sondeo (pedidos, líneas, cursos).
export async function listKitOrders(sessionId: number, tableNumberOf: (id: number) => number | null): Promise<KitOrder[]> {
  if (onCore()) { void sessionId; void tableNumberOf; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await sales.listOrders(r, 'open')).map(toKitOrder) }
  const [rows, serviceAt] = await Promise.all([
    callKw<RawOrder[]>('pos.order', 'search_read', [[['session_id', '=', sessionId], ['state', '=', 'draft']], ORDER_FIELDS], { order: 'date_order desc, id desc' }),
    presets(),
  ])
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const [lines, courses] = await Promise.all([
    callKw<RawLine[]>('pos.order.line', 'search_read', [[['order_id', 'in', ids]], LINE_FIELDS], { order: 'id asc' }),
    callKw<RawCourse[]>('restaurant.order.course', 'search_read', [[['order_id', 'in', ids]], ['order_id', 'fired', 'preparation_date', 'ready_date', 'served_date']]),
  ])
  return rows.map((r) => toOrder(r, serviceAt, tableNumberOf,
    lines.filter((l) => l.order_id[0] === r.id).map(toLine), courses.filter((c) => c.order_id[0] === r.id).map(toCourse)))
}

// Historial: pedidos pagados (todas las sesiones, los últimos primero). Las líneas se leen al seleccionar la cuenta.
export async function listHistoryOrders(tableNumberOf: (id: number) => number | null, limit = 200): Promise<KitOrder[]> {
  if (onCore()) { void tableNumberOf; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await sales.salesOrders(r, { limit })).map(toKitOrder) }
  const [rows, serviceAt] = await Promise.all([
    callKw<RawOrder[]>('pos.order', 'search_read', [[['state', 'in', PAID]], ORDER_FIELDS], { order: 'date_order desc, id desc', limit }),
    presets(),
  ])
  return rows.map((r) => toOrder(r, serviceAt, tableNumberOf, [], []))
}

export async function getKitOrderLines(orderId: number): Promise<KitLine[]> {
  if (onCore()) return toKitOrder(await sales.getOrder(orderId)).lines
  const rows = await callKw<RawLine[]>('pos.order.line', 'search_read', [[['order_id', '=', orderId]], LINE_FIELDS], { order: 'id asc' })
  return rows.map(toLine)
}

// Servir plato a plato (projectapp_kitchen): el servidor marca la línea y cierra el curso cuando ya no
// queda ninguna sin servir. Antes la casilla solo vivía en la memoria de esta tablet.
export async function serveLines(lineIds: number[]): Promise<void> {
  if (onCore()) { if (lineIds.length) await coreKitchen.serveLines(lineIds); return }
  if (lineIds.length === 0) return
  await callKw('pos.order.line', 'action_kitchen_line_served', [lineIds])
}

export async function serveCourse(courseId: number): Promise<void> {
  if (onCore()) { await coreKitchen.serveCourse(courseId); return }
  await callKw('restaurant.order.course', 'action_kitchen_served', [[courseId]])
}

// El servidor cancela solo antes de preparar y recalcula el total en la misma transacción.
export async function cancelLines(orderId: number, lineIds: number[]): Promise<void> {
  if (onCore()) { if (lineIds.length) await sales.cancelLines(orderId, lineIds); return }
  if (lineIds.length === 0) return
  void orderId
  await callKw('pos.order.line', 'waiter_cancel_lines', [lineIds])
}

// Nueva ronda sobre un pedido abierto: se agregan las líneas, Odoo recalcula precios e impuestos y se dispara
// un curso nuevo con todo lo que aún no tenía curso. Devuelve el id del curso (null si no había nada nuevo).
export async function addRound(orderId: number, lines: DraftLine[]): Promise<number | null> {
  if (onCore()) { if (!lines.length) return null; const o = await sales.addLines(orderId, lines.map((l) => ({ uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note })), true); return o.courses.at(-1)?.id ?? null }
  if (lines.length === 0) return null
  const commands = lines.map((l) => [0, 0, {
    uuid: l.uuid, product_id: l.productId, qty: l.qty, price_unit: l.unitPrice, tax_ids: [[6, 0, l.taxIds]],
    price_subtotal: 0, price_subtotal_incl: 0, full_product_name: l.name, customer_note: l.note,
  }])
  await callKw('pos.order', 'write', [[orderId], { lines: commands }])
  await callKw('pos.order', 'recompute_prices', [[orderId]])
  return fireUnsentLines(orderId)
}

// Tasas reales de los impuestos que usa la carta, para mostrar el subtotal, el impuesto y el total de la ronda.
export async function listTaxes(ids: number[]): Promise<TaxRate[]> {
  if (onCore()) return (await coreCatalog.listTaxes()).taxes.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, amount: t.amount, priceInclude: t.included }))
  if (ids.length === 0) return []
  const rows = await callKw<RawTax[]>('account.tax', 'read', [ids, ['amount', 'price_include']])
  return rows.map((t) => ({ id: t.id, amount: t.amount, priceInclude: t.price_include }))
}
