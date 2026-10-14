'use client'

import { create } from 'zustand'

import { openBus, type BusEvent, type BusHandle } from '@/lib/services/bus'

interface BusState {
  // Vivo o no. Quien sondea afloja el ritmo mientras el bus esté vivo y lo recupera si se cae.
  up: boolean
  // Un contador por tipo de aviso: sube cuando el servidor dice que algo cambió. Los efectos lo miran.
  ticks: Record<BusEvent, number>
  start: () => void
  // Soltar, no cerrar: la conexión se cierra cuando la suelta la última pantalla.
  release: () => void
  stop: () => void
}

let handle: BusHandle | null = null
let users = 0
let closing: ReturnType<typeof setTimeout> | null = null
// Cada pantalla monta su propio armazón, así que al navegar hay un instante con cero dueños. Se espera
// un poco antes de cerrar: si en ese hueco entra la pantalla siguiente, la conexión no se toca.
const GRACE_MS = 2_000

// Una sola conexión por tablet, no una por pantalla. Se cuenta quién la usa: la última en soltarla la cierra.
export const useBusStore = create<BusState>((set, get) => ({
  up: false,
  ticks: { kitchen: 0, orders: 0, notify: 0 },
  start: () => {
    users += 1
    if (closing) { clearTimeout(closing); closing = null }
    if (handle) return
    handle = openBus(
      (event) => set((s) => ({ ticks: { ...s.ticks, [event]: s.ticks[event] + 1 } })),
      (up) => set({ up }),
    )
  },
  release: () => {
    users = Math.max(0, users - 1)
    if (users > 0 || closing) return
    closing = setTimeout(() => { closing = null; if (users === 0) get().stop() }, GRACE_MS)
  },
  stop: () => {
    if (closing) { clearTimeout(closing); closing = null }
    users = 0
    handle?.close()
    handle = null
    if (get().up) set({ up: false })
  },
}))
