import { serverTime } from '@/lib/domain/time'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as sales from '@/lib/services/core/sales'
import type { Origin } from '@/lib/services/ops'

export interface PaidOrder { id: number; total: number; origin: Origin; paidAt: string }

// Pedidos pagados en un rango (todas las sesiones del restaurante en uso): la materia prima del ROI. Fechas en UTC "YYYY-MM-DD HH:MM:SS".
export async function listPaidOrders(from: string, to: string): Promise<PaidOrder[]> {
  // Las fechas llegan en UTC «YYYY-MM-DD HH:MM:SS»; el sistema propio filtra por días locales, así que se pide el
  // rango de días que las cubre y se recorta aquí con la hora exacta.
  const r = currentRestaurantId()
  if (r === null) return []
  const day = (v: string) => v.slice(0, 10)
  // El servidor entrega hasta 1000 pedidos por consulta: suficiente para el ROI de un restaurante en un mes.
  const rows = await sales.salesOrders(r, { from: day(from), to: day(to), limit: 1000 })
  const lo = serverTime(from), hi = serverTime(to)
  return rows.filter((o) => o.paid_at && serverTime(o.paid_at) >= lo && serverTime(o.paid_at) < hi).map((o) => ({ id: o.id, total: o.total, origin: o.origin, paidAt: o.paid_at as string }))
}
