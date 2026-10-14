import { type KitchenPhase } from '@/lib/domain/kitchen'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as core from '@/lib/services/core/sales'
import { toShiftOrder } from '@/lib/services/core/salesBridge'

export type Origin = 'waiter' | 'diner' | 'ai'
export interface ShiftOrder {
  id: number; reference: string; tableId: number | null; tableNumber: number | null; waiter: string; origin: Origin
  total: number; state: 'draft' | 'paid' | 'done' | 'invoiced' | 'cancel'; kitchen: KitchenPhase; firedAt: string | null; startedAt: string
}
export interface Autonomy { autonomous: number; total: number }

// Todos los pedidos del turno (abiertos y pagados), con su origen y en qué va cocina. Dos llamadas.
export async function listShiftOrders(sessionId: number, tableNumberOf: (tableId: number) => number | null): Promise<ShiftOrder[]> {
  void tableNumberOf
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const [open, paid] = await Promise.all([core.listOrders(r, 'open'), core.salesOrders(r, { shift_id: sessionId })])
  return [...open, ...paid].map(toShiftOrder)
}

// "Sin intervención humana": pedidos del día que no originó un mesero.
export async function countAutonomy(sessionId: number): Promise<Autonomy> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const [open, s] = await Promise.all([core.listOrders(r, 'open'), core.salesSummary(r, { shift_id: sessionId })])
  return { total: open.length + s.orders, autonomous: open.filter((o) => o.origin !== 'waiter').length + s.autonomous }
}
