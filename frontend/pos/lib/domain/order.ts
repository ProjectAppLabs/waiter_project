import { uuid } from '@/lib/domain/uuid'
import type { Product } from '@/lib/types'

export interface DraftLine { uuid: string; productId: number; name: string; unitPrice: number; qty: number; note: string; taxIds: number[] }
export interface DraftOrder { uuid: string; serverId: number | null; sessionId: number; tableId: number; guests: number; note: string; lines: DraftLine[] }

export function createDraft({ sessionId, tableId, guests = 1 }: { sessionId: number; tableId: number; guests?: number }): DraftOrder {
  return { uuid: uuid(), serverId: null, sessionId, tableId, guests, note: '', lines: [] }
}

export function addProduct(order: DraftOrder, product: Product): DraftOrder {
  const existing = order.lines.find((l) => l.productId === product.id && l.note === '')
  if (existing) return setQty(order, existing.uuid, existing.qty + 1)
  const line: DraftLine = { uuid: uuid(), productId: product.id, name: product.name,
    unitPrice: product.price, qty: 1, note: '', taxIds: product.taxIds }
  return { ...order, lines: [...order.lines, line] }
}

export function setQty(order: DraftOrder, lineUuid: string, qty: number): DraftOrder {
  if (qty <= 0) return removeLine(order, lineUuid)
  return { ...order, lines: order.lines.map((l) => (l.uuid === lineUuid ? { ...l, qty } : l)) }
}

export function setNote(order: DraftOrder, lineUuid: string, note: string): DraftOrder {
  return { ...order, lines: order.lines.map((l) => (l.uuid === lineUuid ? { ...l, note } : l)) }
}

export function removeLine(order: DraftOrder, lineUuid: string): DraftOrder {
  return { ...order, lines: order.lines.filter((l) => l.uuid !== lineUuid) }
}

// Nota general a cocina ("alergia en la mesa", "todo junto"): viaja en general_customer_note y la ve el KDS.
export function setOrderNote(order: DraftOrder, note: string): DraftOrder {
  return { ...order, note }
}

export function subtotal(order: DraftOrder): number {
  return order.lines.reduce((acc, l) => acc + l.unitPrice * l.qty, 0)
}
