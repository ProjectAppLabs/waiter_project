import type { DraftLine } from '@/lib/domain/order'
import { type KitLine, type KitOrder, type TaxRate } from '@/lib/domain/orderState'
import * as coreCatalog from '@/lib/services/core/catalog'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreKitchen from '@/lib/services/core/kitchen'
import * as sales from '@/lib/services/core/sales'
import { toKitOrder } from '@/lib/services/core/salesBridge'
import { withComboChildren } from '@/lib/services/productOptions'

// Pedidos abiertos de la sesión con sus líneas y cursos: tres llamadas por sondeo (pedidos, líneas, cursos).
export async function listKitOrders(sessionId: number, tableNumberOf: (id: number) => number | null): Promise<KitOrder[]> {
  void sessionId
  void tableNumberOf
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await sales.listOrders(r, 'open')).map(toKitOrder)
}

// Historial: pedidos pagados (todas las sesiones, los últimos primero). Las líneas se leen al seleccionar la cuenta.
export async function listHistoryOrders(tableNumberOf: (id: number) => number | null, limit = 200): Promise<KitOrder[]> {
  void tableNumberOf
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await sales.salesOrders(r, { limit })).map(toKitOrder)
}

export async function getKitOrderLines(orderId: number): Promise<KitLine[]> {
  return toKitOrder(await sales.getOrder(orderId)).lines
}

// Servir plato a plato: el servidor marca la línea y cierra el curso cuando ya no
// queda ninguna sin servir. Antes la casilla solo vivía en la memoria de esta tablet.
export async function serveLines(lineIds: number[]): Promise<void> {
  if (lineIds.length) await coreKitchen.serveLines(lineIds)
  return
}

export async function serveCourse(courseId: number): Promise<void> {
  await coreKitchen.serveCourse(courseId)
  return
}

// El servidor cancela solo antes de preparar y recalcula el total en la misma transacción.
export async function cancelLines(orderId: number, lineIds: number[]): Promise<void> {
  if (lineIds.length) await sales.cancelLines(orderId, lineIds)
  return
}

export async function addRound(orderId: number, lines: DraftLine[]): Promise<number | null> {
  if (!lines.length) return null
  const o = await sales.addLines(orderId, await withComboChildren(lines.map((l) => ({ uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note }))), true)
  return o.courses.at(-1)?.id ?? null
}

// Tasas reales de los impuestos que usa la carta, para mostrar el subtotal, el impuesto y el total de la ronda.
export async function listTaxes(ids: number[]): Promise<TaxRate[]> {
  return (await coreCatalog.listTaxes()).taxes.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, amount: t.amount, priceInclude: t.included }))
}
