import { onCore } from '@/lib/domain/backend'
import { serverTime } from '@/lib/domain/time'
import * as sales from '@/lib/services/core/sales'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { callKw, inRestaurant } from '@/lib/services/odoo'
import type { Origin } from '@/lib/services/ops'

export interface PaidOrder { id: number; total: number; origin: Origin; paidAt: string }
interface RawPaid { id: number; amount_total: number; waiter_origin: Origin | false; date_order: string }

// Pedidos pagados en un rango (todas las sesiones del restaurante en uso): la materia prima del ROI. Fechas en UTC "YYYY-MM-DD HH:MM:SS".
export async function listPaidOrders(from: string, to: string): Promise<PaidOrder[]> {
  if (onCore()) {
    // Las fechas llegan en UTC «YYYY-MM-DD HH:MM:SS»; el sistema propio filtra por días locales, así que se pide el
    // rango de días que las cubre y se recorta aquí con la hora exacta.
    const r = currentRestaurantId(); if (r === null) return []
    const day = (v: string) => v.slice(0, 10)
    // El servidor entrega hasta 1000 pedidos por consulta: suficiente para el ROI de un restaurante en un mes.
    const rows = await sales.salesOrders(r, { from: day(from), to: day(to), limit: 1000 })
    const lo = serverTime(from), hi = serverTime(to)
    return rows.filter((o) => o.paid_at && serverTime(o.paid_at) >= lo && serverTime(o.paid_at) < hi).map((o) => ({ id: o.id, total: o.total, origin: o.origin, paidAt: o.paid_at as string }))
  }
  const rows = await callKw<RawPaid[]>('pos.order', 'search_read',
    [inRestaurant([['state', 'in', ['paid', 'done', 'invoiced']], ['date_order', '>=', from], ['date_order', '<', to]]), ['amount_total', 'waiter_origin', 'date_order']])
  return rows.map((r) => ({ id: r.id, total: r.amount_total, origin: r.waiter_origin || 'waiter', paidAt: r.date_order }))
}
