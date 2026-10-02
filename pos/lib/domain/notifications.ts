// Centro de notificaciones del kit (Dashboard / Notification Expand.png) sobre el modelo `waiter.notification`
// del servidor: cocina (plato listo), inventario (stock bajo), sistema y acceso (plan P: alguien intentó
// entrar fuera de su turno; le llega al encargado y al dueño) y caja (plan Q: un cierre superó la tolerancia).
export type NotificationKind = 'kitchen' | 'inventory' | 'system' | 'access' | 'cash'
export type NotificationTab = 'all' | 'inventory' | 'kitchen'

export interface Notification {
  id: number; kind: NotificationKind; title: string; body: string
  resModel: string | null; resId: number | null; action: string | null; actionDone: boolean; read: boolean; at: string
}

export const filterByTab = (items: Notification[], tab: NotificationTab): Notification[] =>
  (tab === 'all' ? items : items.filter((n) => n.kind === tab))

export const unreadCount = (items: Notification[]): number => items.filter((n) => !n.read).length

// El generador de inventario escribe el producto en `res_id` con res_model product.product.
export const productOf = (n: Notification): number | null =>
  (n.kind === 'inventory' && n.resModel === 'product.product' && n.resId ? n.resId : null)

export const canRequest = (n: Notification): boolean => n.action === 'request_ingredient' && !n.actionDone && productOf(n) !== null

// «Para atender ahora»: los intentos de entrada fuera de turno que nadie ha visto todavía.
export const unreadAccess = (items: Notification[]): Notification[] => items.filter((n) => n.kind === 'access' && !n.read)

// «Para atender ahora»: los cierres de caja que superaron la tolerancia y nadie ha visto.
export const unreadCash = (items: Notification[]): Notification[] => items.filter((n) => n.kind === 'cash' && !n.read)
