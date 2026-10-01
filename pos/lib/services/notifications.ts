import type { Notification, NotificationKind } from '@/lib/domain/notifications'
import { callKw } from '@/lib/services/odoo'

// `waiter.notification` (projectapp_notify). La regla de registro limita lo que ve cada usuario, pero el administrador
// del punto de venta las ve todas: con su `uid` se piden solo las suyas y las generales. Sin esto, el aviso de acceso que
// va al encargado y al dueño le salía dos veces al encargado (plan P).
const MODEL = 'waiter.notification'
const FIELDS = ['kind', 'title', 'body', 'res_model', 'res_id', 'action', 'action_done', 'read', 'create_date']
const LIMIT = 50
const mine = (uid: number | null): unknown[] => (uid ? ['|', ['user_id', '=', false], ['user_id', '=', uid]] : [])

interface RawNotification {
  id: number; kind: NotificationKind; title: string; body: string | false; res_model: string | false
  res_id: number | false; action: string | false; action_done: boolean; read: boolean; create_date: string
}

// Latido: solo el aviso más nuevo. Es lo que se pregunta cada pocos segundos —doscientos bytes— para
// saber si hay algo; la lista entera (50 filas, ~8 KB) se pide solo cuando la respuesta cambia.
export async function peekNotification(uid: number | null = null): Promise<{ id: number; kind: NotificationKind } | null> {
  const [row] = await callKw<{ id: number; kind: NotificationKind }[]>(MODEL, 'search_read', [mine(uid), ['kind']], { limit: 1, order: 'id desc' })
  return row ? { id: row.id, kind: row.kind } : null
}

export async function listNotifications(uid: number | null = null): Promise<Notification[]> {
  const rows = await callKw<RawNotification[]>(MODEL, 'search_read', [mine(uid), FIELDS], { limit: LIMIT, order: 'create_date desc, id desc' })
  return rows.map((r) => ({
    id: r.id, kind: r.kind, title: r.title, body: r.body || '', resModel: r.res_model || null, resId: r.res_id || null,
    action: r.action || null, actionDone: r.action_done, read: r.read, at: r.create_date,
  }))
}

export const markAllRead = (): Promise<number> => callKw<number>(MODEL, 'waiter_mark_all_read', [])
export const markRead = (ids: number[]): Promise<true> => callKw<true>(MODEL, 'waiter_mark_read', [ids])

export interface IngredientRequest { purchaseId: number; name: string; partnerName: string; qty: number }

// "Solicitar ingredientes": el servidor crea la orden de compra en borrador y marca `action_done`.
export async function requestIngredient(productId: number, qty?: number): Promise<IngredientRequest> {
  const raw = await callKw<{ purchase_id: number; name: string; partner_name: string; product_qty: number }>(
    MODEL, 'waiter_request_ingredient', [productId, qty ?? null])
  return { purchaseId: raw.purchase_id, name: raw.name, partnerName: raw.partner_name, qty: raw.product_qty }
}
