import { type SalesScope } from '@/lib/domain/salesPeriod'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as core from '@/lib/services/core/sales'
import { scopeParams, toMethodTotals, toProductTotals, toSaleRow, toShiftRow, toWaiterTotals } from '@/lib/services/core/salesBridge'
import type { Origin } from '@/lib/services/ops'

export interface ShiftRow { id: number; name: string; state: string; startAt: string | null; stopAt: string | null; user: string; total: number; orders: number }
export interface MethodTotal { method: string; amount: number }
export interface WaiterTotal { waiter: string; amount: number; orders: number }
export interface ProductTotal { product: string; qty: number; amount: number }
export interface SaleRow { id: number; reference: string; paidAt: string; tableNumber: number | null; waiter: string; origin: Origin; total: number }

export async function listShifts(limit = 12): Promise<ShiftRow[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await core.listShifts(r, limit)).map(toShiftRow)
}

export const SALES_LIST_LIMIT = 200 // un mes pueden ser miles de pedidos: la tabla trae los más recientes y los KPI se suman aparte
export async function listSales(scope: SalesScope, tableNumberOf: (id: number) => number | null): Promise<SaleRow[]> {
  void tableNumberOf
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await core.salesOrders(r, { ...scopeParams(scope), limit: SALES_LIST_LIMIT })).map(toSaleRow)
}

export interface SalesSummary { total: number; orders: number; autonomous: number }
export async function salesSummary(scope: SalesScope): Promise<SalesSummary> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const s = await core.salesSummary(r, scopeParams(scope))
  return { total: s.total, orders: s.orders, autonomous: s.autonomous }
}

export async function paymentsByMethod(scope: SalesScope): Promise<MethodTotal[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return toMethodTotals(await core.salesSummary(r, scopeParams(scope)))
}

export async function salesByWaiter(scope: SalesScope): Promise<WaiterTotal[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return toWaiterTotals(await core.salesSummary(r, scopeParams(scope)))
}

export async function topProducts(scope: SalesScope, limit = 6): Promise<ProductTotal[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return toProductTotals(await core.salesSummary(r, scopeParams(scope))).slice(0, limit)
}
