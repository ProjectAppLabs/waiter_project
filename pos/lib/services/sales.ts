import { onCore } from '@/lib/domain/backend'
import * as core from '@/lib/services/core/sales'
import { scopeParams, toMethodTotals, toProductTotals, toSaleRow, toShiftRow, toWaiterTotals } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { utcBounds, type SalesScope } from '@/lib/domain/salesPeriod'
import { callKw, inRestaurant } from '@/lib/services/odoo'
import type { Origin } from '@/lib/services/ops'

// `startAt` es null mientras la caja está creada pero sin abrir (`opening_control`): Odoo aún no le pone fecha de inicio.
export interface ShiftRow { id: number; name: string; state: string; startAt: string | null; stopAt: string | null; user: string; total: number; orders: number }
export interface MethodTotal { method: string; amount: number }
export interface WaiterTotal { waiter: string; amount: number; orders: number }
export interface ProductTotal { product: string; qty: number; amount: number }
export interface SaleRow { id: number; reference: string; paidAt: string; tableNumber: number | null; waiter: string; origin: Origin; total: number }

interface RawSession { id: number; name: string; state: string; start_at: string | false; stop_at: string | false; user_id: [number, string] | false; total_payments_amount: number; order_count: number }
interface RawSale { id: number; pos_reference: string; date_order: string; table_id: [number, string] | false; user_id: [number, string] | false; waiter_origin: Origin | false; amount_total: number }
const PAID = ['paid', 'done', 'invoiced']

export async function listShifts(limit = 12): Promise<ShiftRow[]> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await core.listShifts(r, limit)).map(toShiftRow) }
  const rows = await callKw<RawSession[]>('pos.session', 'search_read', [inRestaurant([]), ['name', 'state', 'start_at', 'stop_at', 'user_id', 'total_payments_amount', 'order_count']], { limit, order: 'id desc' })
  return rows.map((r) => ({ id: r.id, name: r.name, state: r.state, startAt: r.start_at || null, stopAt: r.stop_at || null, user: r.user_id ? r.user_id[1] : '', total: r.total_payments_amount, orders: r.order_count }))
}

// El alcance de una consulta de ventas: un turno (para cuadrar la caja) o un rango de días locales. `field` es el campo de
// fecha y `prefix` el camino hasta el pedido desde el modelo que se consulta (líneas y pagos cuelgan de él).
function scopeDomain(scope: SalesScope, prefix = '', field = 'date_order'): unknown[] {
  if (scope.kind === 'shift') return [[`${prefix}session_id`, '=', scope.sessionId]]
  const [from, to] = utcBounds(scope)
  // Un rango de días es del restaurante en uso (plan O): el dueño ve todos los pedidos de la empresa. Los pagos llegan
  // al restaurante por su sesión.
  const config = field === 'payment_date' ? `${prefix}session_id.config_id` : `${prefix}config_id`
  return inRestaurant([[`${prefix}${field}`, '>=', from], [`${prefix}${field}`, '<', to]], config)
}

export const SALES_LIST_LIMIT = 200 // un mes pueden ser miles de pedidos: la tabla trae los más recientes y los KPI se suman aparte
export async function listSales(scope: SalesScope, tableNumberOf: (id: number) => number | null): Promise<SaleRow[]> {
  if (onCore()) { void tableNumberOf; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await core.salesOrders(r, { ...scopeParams(scope), limit: SALES_LIST_LIMIT })).map(toSaleRow) }
  const rows = await callKw<RawSale[]>('pos.order', 'search_read',
    [[...scopeDomain(scope), ['state', 'in', PAID]], ['pos_reference', 'date_order', 'table_id', 'user_id', 'waiter_origin', 'amount_total']], { order: 'id desc', limit: SALES_LIST_LIMIT })
  return rows.map((r) => ({ id: r.id, reference: r.pos_reference, paidAt: r.date_order, tableNumber: r.table_id ? tableNumberOf(r.table_id[0]) : null,
    waiter: r.user_id ? r.user_id[1] : '', origin: r.waiter_origin || 'waiter', total: r.amount_total }))
}

// Totales del alcance, sumados en Odoo: no dependen de cuántas filas quepan en la tabla.
export interface SalesSummary { total: number; orders: number; autonomous: number }
export async function salesSummary(scope: SalesScope): Promise<SalesSummary> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); const s = await core.salesSummary(r, scopeParams(scope)); return { total: s.total, orders: s.orders, autonomous: s.autonomous } }
  const rows = await callKw<{ waiter_origin: Origin | false; amount_total: number; __count: number }[]>('pos.order', 'read_group',
    [[...scopeDomain(scope), ['state', 'in', PAID]], ['amount_total:sum'], ['waiter_origin']], { lazy: false })
  return rows.reduce((sum, r) => ({ total: sum.total + r.amount_total, orders: sum.orders + r.__count, autonomous: sum.autonomous + ((r.waiter_origin || 'waiter') !== 'waiter' ? r.__count : 0) }),
    { total: 0, orders: 0, autonomous: 0 })
}

// read_group de Odoo: cada fila trae el campo agrupado como [id, nombre] y las sumas por nombre de campo.
export async function paymentsByMethod(scope: SalesScope): Promise<MethodTotal[]> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return toMethodTotals(await core.salesSummary(r, scopeParams(scope))) }
  const rows = await callKw<{ payment_method_id: [number, string]; amount: number }[]>('pos.payment', 'read_group',
    [scopeDomain(scope, '', 'payment_date'), ['amount:sum'], ['payment_method_id']], { lazy: false })
  return rows.map((r) => ({ method: r.payment_method_id[1], amount: r.amount })).sort((a, b) => b.amount - a.amount)
}

export async function salesByWaiter(scope: SalesScope): Promise<WaiterTotal[]> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return toWaiterTotals(await core.salesSummary(r, scopeParams(scope))) }
  const rows = await callKw<{ user_id: [number, string] | false; amount_total: number; __count: number }[]>('pos.order', 'read_group',
    [[...scopeDomain(scope), ['state', 'in', PAID]], ['amount_total:sum'], ['user_id']], { lazy: false })
  return rows.map((r) => ({ waiter: r.user_id ? r.user_id[1] : '—', amount: r.amount_total, orders: r.__count })).sort((a, b) => b.amount - a.amount)
}

export async function topProducts(scope: SalesScope, limit = 6): Promise<ProductTotal[]> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return toProductTotals(await core.salesSummary(r, scopeParams(scope))).slice(0, limit) }
  const rows = await callKw<{ product_id: [number, string]; qty: number; price_subtotal_incl: number }[]>('pos.order.line', 'read_group',
    [[...scopeDomain(scope, 'order_id.'), ['order_id.state', 'in', PAID]], ['qty:sum', 'price_subtotal_incl:sum'], ['product_id']], { lazy: false, orderby: 'price_subtotal_incl desc', limit })
  return rows.map((r) => ({ product: r.product_id[1], qty: r.qty, amount: r.price_subtotal_incl }))
}
