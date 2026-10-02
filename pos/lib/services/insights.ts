import { onCore } from '@/lib/domain/backend'
import { salesInsights } from '@/lib/services/core/sales'
import { toSalesHistory } from '@/lib/services/core/salesBridge'
import type { SalesHistory } from '@/lib/domain/insights'
import { callKw } from '@/lib/services/odoo'

interface Raw { today: string; window_days: number; history_days: number; daily: { date: string; total: number; orders: number }[]; hourly?: { hour: number; total: number; orders: number }[]
  products: { product_id: number; template_id: number; name: string; qty: number; amount: number; prev_qty: number }[] }

// Historial de ventas ya sumado por el servidor (84 días por día; 28 días por producto): una sola llamada para el tablero.
export async function getSalesHistory(configId: number): Promise<SalesHistory> {
  if (onCore()) return toSalesHistory(await salesInsights(configId))
  const raw = await callKw<Raw>('pos.config', 'waiter_sales_insights', [[configId]])
  return { today: raw.today, windowDays: raw.window_days, historyDays: raw.history_days, daily: raw.daily, hourly: raw.hourly ?? [],
    products: raw.products.map((p) => ({ productId: p.product_id, templateId: p.template_id, name: p.name, qty: p.qty, amount: p.amount, prevQty: p.prev_qty })) }
}
