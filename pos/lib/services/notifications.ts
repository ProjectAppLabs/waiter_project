import type { Notification, NotificationKind } from '@/lib/domain/notifications'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreInventory from '@/lib/services/core/inventory'
import * as core from '@/lib/services/core/pos'
const LIMIT = 50

// Latido: solo el aviso más nuevo. Es lo que se pregunta cada pocos segundos —doscientos bytes— para
// saber si hay algo; la lista entera (50 filas, ~8 KB) se pide solo cuando la respuesta cambia.
export async function peekNotification(uid: number | null = null): Promise<{ id: number; kind: NotificationKind } | null> {
  void uid
  const [n] = await core.listNotifications(1)
  return n ? { id: Number(n.id), kind: n.kind } : null
}

export async function listNotifications(uid: number | null = null): Promise<Notification[]> {
  void uid
  return (await core.listNotifications(LIMIT)).map((n) => ({ id: Number(n.id), kind: n.kind, title: n.title, body: n.body, resModel: null, resId: null, action: n.action, actionDone: n.action_done, read: n.read, at: n.created_at }))
}

export const markAllRead = (): Promise<number> => (core.readAllNotifications().then(() => 0))
export const markRead = (ids: number[]): Promise<true> => (Promise.all(ids.map((id) => core.readNotification(String(id)))).then(() => true as const))

export interface IngredientRequest { purchaseId: number; name: string; partnerName: string; qty: number }

// "Solicitar ingredientes": el servidor crea la orden de compra en borrador y marca `action_done`.
export async function requestIngredient(productId: number, qty?: number): Promise<IngredientRequest> {
  // En el sistema propio se pide desde el inventario de la sede, con la cantidad por omisión del servidor.
  void qty
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const req = await coreInventory.requestIngredient(r, productId)
  const line = req.lines.find((l) => l.ingredient_id === productId)
  return { purchaseId: req.id, name: `Solicitud ${req.id}`, partnerName: req.supplier_name, qty: line?.qty ?? 0 }
}
