'use client'

import { create } from 'zustand'

import { countAutonomy, listShiftOrders, type Autonomy, type ShiftOrder } from '@/lib/services/ops'

export interface Resolved { text: string; at: number }

interface OpsState {
  orders: ShiftOrder[]
  autonomy: Autonomy | null
  billingSince: Record<number, number>
  dismissed: Record<string, true>
  resolved: Resolved[]
  error: string | null
  refresh: (sessionId: number, tableNumberOf: (tableId: number) => number | null) => Promise<void>
  markBilling: (tableId: number, at: number) => void
  resolve: (alertId: string, text: string, at: number) => void
}

export const useOpsStore = create<OpsState>((set) => ({
  orders: [], autonomy: null, billingSince: {}, dismissed: {}, resolved: [], error: null,
  refresh: async (sessionId, tableNumberOf) => {
    try {
      const [orders, autonomy] = await Promise.all([listShiftOrders(sessionId, tableNumberOf), countAutonomy(sessionId)])
      set({ orders, autonomy, error: null })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  markBilling: (tableId, at) => set((s) => ({ billingSince: { ...s.billingSince, [tableId]: s.billingSince[tableId] ?? at } })),
  // "Resueltas hoy": lo que alguien atendió; vive en esta pantalla hasta que el turno cierra.
  resolve: (alertId, text, at) => set((s) => ({ dismissed: { ...s.dismissed, [alertId]: true }, resolved: [{ text, at }, ...s.resolved].slice(0, 12) })),
}))
