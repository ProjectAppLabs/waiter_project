'use client'

import { create } from 'zustand'

import { play, setMuted, setStation } from '@/lib/audio/sounds'
import { ALL, FRESH_MIN, LATE_MIN, ticketMinutes } from '@/lib/domain/kitchen'
import { startPreparation, listKitchenBoard, markLineReady, markReady, markServed, type CompletedCourse, type KitchenTicket } from '@/lib/services/kitchen'

type StationOf = (productId: number) => string | null
const WARN_MIN = 12
setStation('kds')
void FRESH_MIN

interface KitchenState {
  tickets: KitchenTicket[]
  done: CompletedCourse[]
  tab: string
  muted: boolean
  primed: boolean
  error: string | null
  alarms: Record<number, { warned: boolean; lastCritical: number }>
  tick: (now: number) => void
  refresh: (sessionId: number, stationOf: StationOf) => Promise<void>
  start: (courseId: number, sessionId: number, stationOf: StationOf) => Promise<void>
  ready: (courseId: number, sessionId: number, stationOf: StationOf) => Promise<void>
  // Un plato suelto: cocina saca de uno en uno y el mesero se lo lleva sin esperar al resto.
  readyDish: (lineId: number, sessionId: number, stationOf: StationOf) => Promise<void>
  serve: (courseId: number, sessionId: number, stationOf: StationOf) => Promise<void>
  setTab: (tab: string) => void
  toggleMute: () => void
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const useKitchenStore = create<KitchenState>((set, get) => ({
  tickets: [], done: [], tab: ALL, muted: false, primed: false, error: null, alarms: {},
  refresh: async (sessionId, stationOf) => {
    try {
      const { tickets, done } = await listKitchenBoard(sessionId, stationOf)
      const known = new Set(get().tickets.map((t) => t.id))
      // Suena solo cuando entra algo nuevo después de la primera carga (no al abrir la pantalla).
      if (get().primed && tickets.some((t) => !known.has(t.id))) play('ticket')
      set({ tickets, done, primed: true, error: null })
    } catch (e) {
      set({ error: message(e) })
    }
  },
  // "Se está demorando" una vez a los 12 min; "se pasó el tiempo" a los 18 y cada 60 s hasta que alguien toca el ticket.
  tick: (now) => {
    const alarms = { ...get().alarms }
    let changed = false
    get().tickets.filter((t) => t.readyAt === null).forEach((t) => {
      const min = ticketMinutes(t, now)
      const a = alarms[t.id] ?? { warned: false, lastCritical: 0 }
      if (min >= LATE_MIN && now - a.lastCritical >= 60_000) { play('critico'); alarms[t.id] = { warned: true, lastCritical: now }; changed = true }
      else if (min >= WARN_MIN && !a.warned) { play('demora'); alarms[t.id] = { ...a, warned: true }; changed = true }
    })
    if (changed) set({ alarms })
  },
  start: async (courseId, sessionId, stationOf) => {
    await startPreparation(courseId)
    await get().refresh(sessionId, stationOf)
  },
  ready: async (courseId, sessionId, stationOf) => {
    play('listo')
    await markReady(courseId)
    await get().refresh(sessionId, stationOf)
  },
  readyDish: async (lineId, sessionId, stationOf) => {
    play('listo')
    await markLineReady([lineId])
    await get().refresh(sessionId, stationOf)
  },
  serve: async (courseId, sessionId, stationOf) => {
    await markServed(courseId)
    await get().refresh(sessionId, stationOf)
  },
  setTab: (tab) => set({ tab }),
  toggleMute: () => set((s) => { setMuted(!s.muted); return { muted: !s.muted } }),
}))
