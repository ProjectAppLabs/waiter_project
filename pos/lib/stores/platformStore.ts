'use client'

import { create } from 'zustand'

import { platformLogin, platformLogout, platformMe, type PlatformUser } from '@/lib/services/core/platform'

// Plan T0: la sesión de la gente de ProjectApp en su consola. La cookie es HttpOnly, así que saber si hay sesión es
// preguntarle al servidor (`hydrate`), igual que hace el POS.
interface PlatformState {
  user: PlatformUser | null
  hydrated: boolean
  hydrate: () => Promise<void>
  login: (login: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const usePlatformStore = create<PlatformState>((set) => ({
  user: null,
  hydrated: false,
  hydrate: async () => {
    try { set({ user: (await platformMe()).user, hydrated: true }) } catch { set({ user: null, hydrated: true }) }
  },
  login: async (l, p) => set({ user: (await platformLogin(l, p)).user, hydrated: true }),
  logout: async () => { await platformLogout().catch(() => undefined); set({ user: null }) },
}))
