'use client'

import { create } from 'zustand'

import { productOf, unreadCount, type Notification } from '@/lib/domain/notifications'
import { useAuthStore } from '@/lib/stores/authStore'
import { listNotifications, markAllRead as markAllReadRequest, markRead, peekNotification } from '@/lib/services/notifications'

interface NotificationState {
  items: Notification[]
  // Sube cada vez que llega un aviso de cocina. Es la señal barata que despierta al sondeo caro: una
  // llamada diminuta cada pocos segundos avisa de que hay algo nuevo, y solo entonces se releen los pedidos.
  kitchenPing: number
  refresh: () => Promise<void>
  // Latido barato: pregunta por el último aviso y solo trae la lista si cambió.
  poll: () => Promise<void>
  markAllRead: () => Promise<void>
  markRead: (ids: number[]) => Promise<void>
  headId: number
  setActionDone: (productId: number) => void
  unread: () => number
}

// Todo el estado vive en Odoo (`waiter.notification`): leído y "ya solicitado" son campos del modelo.
export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  kitchenPing: 0,
  headId: 0,
  poll: async () => {
    const uid = useAuthStore.getState().user?.uid ?? null
    const head = await peekNotification(uid).catch(() => null)
    if (head === null || head.id === get().headId) return
    await get().refresh()
  },
  refresh: async () => {
    const items = await listNotifications(useAuthStore.getState().user?.uid ?? null).catch(() => get().items)
    const known = new Set(get().items.map((n) => n.id))
    const freshKitchen = items.some((n) => n.kind === 'kitchen' && !n.read && !known.has(n.id))
    set({ items, headId: items[0]?.id ?? get().headId, kitchenPing: get().kitchenPing + (freshKitchen ? 1 : 0) })
  },
  markAllRead: async () => {
    set({ items: get().items.map((n) => ({ ...n, read: true })) })
    await markAllReadRequest().catch(() => undefined)
  },
  markRead: async (ids) => {
    set({ items: get().items.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)) })
    await markRead(ids).catch(() => undefined)
  },
  // El servidor cierra todas las de inventario del producto: aquí se refleja lo mismo sin esperar al sondeo.
  setActionDone: (productId) => set({ items: get().items.map((n) => (productOf(n) === productId ? { ...n, actionDone: true } : n)) }),
  unread: () => unreadCount(get().items),
}))
