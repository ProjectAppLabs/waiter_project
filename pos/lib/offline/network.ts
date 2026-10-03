'use client'

import { create } from 'zustand'

// Plan U2: si el servidor responde. Pasa a «sin conexión» cuando una petición no llega (o el navegador lo dice) y
// vuelve cuando una petición llega o el sondeo responde. Al volver, la cola de salida se envía sola.
// Plan V: la hora del corte se guarda en el equipo, para que la cuenta regresiva del modo de emergencia siga donde iba
// aunque se recargue la página o se apague el equipo.
interface NetworkState {
  online: boolean
  since: number | null
  setOnline: (online: boolean) => void
}

const KEY = 'waiter.offlineSince'
const stored = (): number | null => { try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && v > 0 ? v : null } catch { return null } }
const store = (since: number | null) => { try { if (since === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(since)) } catch { /* sin almacenamiento */ } }

export const useNetworkStore = create<NetworkState>((set, get) => ({
  online: true,
  since: null,
  setOnline: (online) => {
    if (get().online === online) return
    const since = online ? null : stored() ?? Date.now()
    store(since)
    set({ online, since })
  },
}))

export const isOnline = () => useNetworkStore.getState().online
export const markOffline = () => useNetworkStore.getState().setOnline(false)
export const markOnline = () => useNetworkStore.getState().setOnline(true)
