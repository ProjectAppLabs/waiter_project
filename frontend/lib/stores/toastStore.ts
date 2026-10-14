'use client'

import { create } from 'zustand'

export type ToastTone = 'success' | 'danger' | 'info'
export interface Toast { id: number; title: string; body?: string; tone: ToastTone }

const TTL_MS = 5_000
let seq = 0

interface ToastState { toasts: Toast[]; push: (t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => void; dismiss: (id: number) => void }

// Toasts del kit: llegan por orden, se cierran solos a los 5 s o con su ✕.
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: ({ title, body, tone = 'success' }) => {
    const id = ++seq
    set((s) => ({ toasts: [...s.toasts, { id, title, body, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), TTL_MS)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = (t: Parameters<ToastState['push']>[0]) => useToastStore.getState().push(t)
