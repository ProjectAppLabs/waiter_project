'use client'

import { create } from 'zustand'

import { clearStoredEmployee, type Shift } from '@/lib/domain/employees'
import { pickRestaurant, readDeviceRestaurant, storeDeviceRestaurant, type DeviceRestaurant } from '@/lib/domain/restaurant'
import type { AccountRole } from '@/lib/domain/roles'
import { cacheSessionEnded, captureCacheContext, endCacheSession, isCurrentCacheContext, startCacheSession, type CacheContext } from '@/lib/offline/cache'
import { openRegister as openRegisterRequest } from '@/lib/services/cashRegister'
import { toActiveEmployee, toAuthUser, toRestaurant } from '@/lib/services/core/bridge'
import { CoreError } from '@/lib/services/core/http'
import * as core from '@/lib/services/core/pos'
import { enterSupport as enterSupportRequest } from '@/lib/services/core/support'
import { type Restaurant } from '@/lib/services/restaurants'
import type { AuthUser, PosSession } from '@/lib/services/session'
import { getOpenSession, logout as logoutRequest } from '@/lib/services/session'
import { useBusStore } from '@/lib/stores/busStore'

export interface ActiveEmployee {
  id: number; name: string; code: string | null; role: AccountRole | null; shift: Shift | null
  userId: number | null; checkIn: string; attendanceId: number | null
  // Cuándo se cierra sola la sesión (ISO): el fin de la ventana del turno para meseros y cajeros.
  sessionEnds: string | null
}

// La cuenta existe pero no puede abrir turno ahora: fuera de su horario o sin empleado vinculado.
export class ShiftDeniedError extends Error {
  constructor(readonly reason: 'no_employee' | 'outside_hours', readonly window: string | null) {
    super(reason === 'outside_hours' ? `Fuera de tu turno${window ? ` (${window})` : ''}. Solo puedes entrar durante tu horario.` : 'Tu cuenta no tiene un empleado vinculado. Pídele al encargado que la revise.')
    this.name = 'ShiftDeniedError'
  }
}

interface AuthState {
  user: AuthUser | null
  // Plan O: el restaurante que opera este dispositivo y los que la cuenta del terminal puede operar.
  restaurant: DeviceRestaurant | null
  restaurants: Restaurant[] | null
  session: PosSession | null
  employee: ActiveEmployee | null
  // Plan W: módulos activos de la organización (consola del dueño) y por local. null: el servidor no los manda.
  modules: string[] | null
  restaurantModules: Record<number, string[]> | null
  // Plan Y4: la sesión es de soporte de ProjectApp (con permiso del dueño) y vence a esta hora.
  support: { until: string; agent: string } | null
  hydrated: boolean
  login: (login: string, password: string) => Promise<void>
  hydrate: () => Promise<void>
  enterSupport: (token: string) => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  chooseRestaurant: (restaurant: DeviceRestaurant | null) => Promise<void>
  openRegister: (configId: number, openingCash: number, notes: string) => Promise<void>
  renewShift: () => Promise<void>
  endShift: () => Promise<void>
}

// Plan T: en el sistema propio entrar ya abre el turno y trae los restaurantes de la cuenta en una sola respuesta.
function fromCore(r: core.LoginResult): Pick<AuthState, 'user' | 'restaurants' | 'restaurant' | 'employee' | 'session' | 'modules' | 'restaurantModules' | 'support'> {
  const restaurants = r.restaurants.map(toRestaurant)
  const chosen = pickRestaurant(restaurants, readDeviceRestaurant())
  const restaurant = chosen ? { id: chosen.id, name: chosen.name } : null
  if (restaurant) storeDeviceRestaurant(restaurant)
  const restaurantModules = r.restaurant_modules ? Object.fromEntries(Object.entries(r.restaurant_modules).map(([id, list]) => [Number(id), list])) : null
  return { user: toAuthUser(r.account), restaurants, restaurant, employee: toActiveEmployee(r), session: null, modules: r.modules ?? null, restaurantModules, support: r.support ?? null }
}
// Plan T2: la caja abierta del restaurante elegido en el sistema propio (null si no hay restaurante o no hay turno).
const openShiftOf = (restaurant: { id: number } | null) => (restaurant ? getOpenSession(restaurant.id).catch(() => null) : Promise.resolve(null))
async function coreLogin(l: string, p: string): Promise<core.LoginResult> {
  try { return await core.login(l, p) }
  catch (e) {
    if (e instanceof CoreError && e.code === 'outside_hours') throw new ShiftDeniedError('outside_hours', typeof e.detail.window === 'string' ? e.detail.window : null)
    throw e
  }
}

const anonymous = { user: null, session: null, employee: null, restaurants: null, restaurant: null, modules: null, restaurantModules: null, support: null, hydrated: true }

export const useAuthStore = create<AuthState>((set, get) => {
  let revision = 0
  let restaurantRevision = 0
  const operation = () => ({ revision, context: captureCacheContext() })
  const current = (request: { revision: number; context: CacheContext }) =>
    request.revision === revision && isCurrentCacheContext(request.context)
  const active = (request: ReturnType<typeof operation>) => current(request) && !cacheSessionEnded(request.context)
  const beginAccess = () => {
    revision += 1
    endCacheSession()
    clearStoredEmployee()
    useBusStore.getState().stop()
    set(anonymous)
    return operation()
  }
  const restore = async (result: core.LoginResult, request: ReturnType<typeof operation>) => {
    if (!active(request)) return
    const base = fromCore(result)
    const session = await openShiftOf(base.restaurant)
    if (active(request)) set({ ...base, session, hydrated: true })
  }
  return {
    user: null,
    modules: null,
    restaurantModules: null,
    support: null,
    restaurant: null,
    restaurants: null,
    session: null,
    employee: null,
    hydrated: false,
    // Plan P: cada persona entra con su cuenta y en el mismo paso abre su turno; no hay cuenta del terminal ni PIN.
    login: async (l, p) => {
      const request = beginAccess()
      const result = await coreLogin(l, p)
      if (!current(request)) return
      startCacheSession()
      await restore(result, operation())
    },
    hydrate: async () => {
      revision += 1
      const request = operation()
      // Tras una salida, solo un acceso explícito puede abrir otra sesión; ni la caché ni una cookie sin cerrar bastan.
      if (cacheSessionEnded(request.context)) { set(anonymous); return }
      try { await restore(await core.me(), request) }
      catch { if (current(request)) set(anonymous) }
    },
    enterSupport: async (token) => {
      const request = beginAccess()
      const result = await enterSupportRequest(token)
      if (!current(request)) return
      startCacheSession()
      await restore(result, operation())
    },
    refreshSession: async () => {
      const request = operation()
      if (!active(request)) return
      const restaurantId = get().restaurant?.id ?? null
      const session = await getOpenSession(restaurantId)
      if (active(request) && restaurantId === (get().restaurant?.id ?? null)) set({ session })
    },
    // El encargado de varios restaurantes y el dueño cambian de restaurante sin soltar su turno: es la misma persona.
    chooseRestaurant: async (restaurant) => {
      const request = operation()
      if (!active(request)) return
      const choice = ++restaurantRevision
      storeDeviceRestaurant(restaurant)
      const session = restaurant ? await getOpenSession(restaurant.id) : null
      if (active(request) && choice === restaurantRevision) set({ restaurant, session })
    },
    openRegister: async (configId, cash, notes) => {
      const request = operation()
      if (!active(request)) return
      const session = await openRegisterRequest(configId, cash, notes)
      if (active(request)) set({ session })
    },
    renewShift: async () => {
      const request = operation()
      if (!active(request)) return
      const result = await core.me()
      if (active(request)) set({ employee: toActiveEmployee(result) })
    },
    endShift: async () => {
      // En el sistema propio la asistencia la cierra el propio logout.

      clearStoredEmployee()
      set({ employee: null })
    },
    logout: async () => {
      // Se invalida antes de esperar al servidor: una respuesta tardía ya no puede devolverle dueño al dispositivo.
      revision += 1
      endCacheSession()
      clearStoredEmployee()
      // El bus deja de tener dueño: se cierra con la sesión, no en cada navegación.
      useBusStore.getState().stop()
      set(anonymous)
      await logoutRequest().catch(() => undefined)
    },
  }
})

export const activeEmployeeId = (): number | null => useAuthStore.getState().employee?.id ?? null
