'use client'

import { create } from 'zustand'

const SPLIT_KEY = 'waiter.salonSplit'
const stored = (): boolean => { try { return localStorage.getItem(SPLIT_KEY) === '1' } catch { return false } }

// Qué piso se mira y qué mesa está elegida. La mesa elegida es una sola en toda la pantalla, también en pantalla partida.
// `split` y el piso del segundo panel son preferencia de esta tablet: `split` se recuerda entre visitas.
interface FloorState {
  activeFloorId: number | null
  secondFloorId: number | null
  split: boolean
  selectedTableId: number | null
  setFloor: (id: number) => void
  setSecondFloor: (id: number) => void
  setSplit: (on: boolean) => void
  selectTable: (id: number | null) => void
}

export const useFloorStore = create<FloorState>((set) => ({
  activeFloorId: null,
  secondFloorId: null,
  split: typeof window === 'undefined' ? false : stored(),
  selectedTableId: null,
  setFloor: (id) => set({ activeFloorId: id, selectedTableId: null }),
  setSecondFloor: (id) => set({ secondFloorId: id, selectedTableId: null }),
  setSplit: (on) => { try { localStorage.setItem(SPLIT_KEY, on ? '1' : '0') } catch { /* sin almacenamiento */ } set({ split: on }) },
  selectTable: (id) => set({ selectedTableId: id }),
}))
