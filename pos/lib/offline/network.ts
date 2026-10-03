'use client'

import { create } from 'zustand'

// Plan U2: si el servidor responde. Pasa a «sin conexión» cuando una petición no llega (o el navegador lo dice) y
// vuelve cuando una petición llega o el sondeo responde. Al volver, la cola de salida se envía sola.
interface NetworkState {
  online: boolean
  since: number | null
  setOnline: (online: boolean) => void
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  online: true,
  since: null,
  setOnline: (online) => { if (get().online !== online) set({ online, since: online ? null : Date.now() }) },
}))

export const isOnline = () => useNetworkStore.getState().online
export const markOffline = () => useNetworkStore.getState().setOnline(false)
export const markOnline = () => useNetworkStore.getState().setOnline(true)
