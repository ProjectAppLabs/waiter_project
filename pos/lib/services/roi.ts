import { callKw, inRestaurant } from '@/lib/services/odoo'
import type { Origin } from '@/lib/services/ops'

export interface PaidOrder { id: number; total: number; origin: Origin; paidAt: string }
interface RawPaid { id: number; amount_total: number; waiter_origin: Origin | false; date_order: string }

// Pedidos pagados en un rango (todas las sesiones del restaurante en uso): la materia prima del ROI. Fechas en UTC "YYYY-MM-DD HH:MM:SS".
export async function listPaidOrders(from: string, to: string): Promise<PaidOrder[]> {
  const rows = await callKw<RawPaid[]>('pos.order', 'search_read',
    [inRestaurant([['state', 'in', ['paid', 'done', 'invoiced']], ['date_order', '>=', from], ['date_order', '<', to]]), ['amount_total', 'waiter_origin', 'date_order']])
  return rows.map((r) => ({ id: r.id, total: r.amount_total, origin: r.waiter_origin || 'waiter', paidAt: r.date_order }))
}
