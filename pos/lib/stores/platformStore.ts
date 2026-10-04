'use client'

import { create } from 'zustand'

import { platformLogin, platformLogout, platformMe, platformVerify2fa, type PlatformUser } from '@/lib/services/core/platform'

// Plan T0: la sesión de la gente de ProjectApp en su consola. La cookie es HttpOnly, así que saber si hay sesión es
// preguntarle al servidor (`hydrate`), igual que hace el POS.
interface PlatformState {
  user: PlatformUser | null
  hydrated: boolean
  hydrate: () => Promise<void>
  // Plan Y3: devuelve el desafío si la cuenta tiene doble factor (sin sesión todavía), o null si ya entró.
  login: (login: string, password: string) => Promise<string | null>
  verify: (challenge: string, code: string) => Promise<void>
  logout: () => Promise<void>
}

export const usePlatformStore = create<PlatformState>((set) => ({
  user: null,
  hydrated: false,
  hydrate: async () => {
    try { set({ user: (await platformMe()).user, hydrated: true }) } catch { set({ user: null, hydrated: true }) }
  },
  login: async (l, p) => {
    const r = await platformLogin(l, p)
    if ('challenge' in r) return r.challenge
    set({ user: r.user, hydrated: true }); return null
  },
  // Tras el código se pregunta `auth/me` para tener también si debe o tiene el doble factor.
  verify: async (challenge, code) => { await platformVerify2fa(challenge, code); try { set({ user: (await platformMe()).user, hydrated: true }) } catch { set({ hydrated: true }) } },
  logout: async () => { await platformLogout().catch(() => undefined); set({ user: null }) },
}))
