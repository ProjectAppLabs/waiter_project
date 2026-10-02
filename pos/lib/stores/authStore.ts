'use client'

import { create } from 'zustand'

import { clearStoredEmployee, type Shift } from '@/lib/domain/employees'
import { pickRestaurant, readDeviceRestaurant, storeDeviceRestaurant, type DeviceRestaurant } from '@/lib/domain/restaurant'
import type { AccountRole } from '@/lib/domain/roles'
import { openRegister as openRegisterRequest } from '@/lib/services/cashRegister'
import { toActiveEmployee, toAuthUser, toRestaurant } from '@/lib/services/core/bridge'
import { CoreError } from '@/lib/services/core/http'
import * as core from '@/lib/services/core/pos'
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
  hydrated: boolean
  login: (login: string, password: string) => Promise<void>
  hydrate: () => Promise<void>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  chooseRestaurant: (restaurant: DeviceRestaurant | null) => Promise<void>
  openRegister: (configId: number, openingCash: number, notes: string) => Promise<void>
  renewShift: () => Promise<void>
  endShift: () => Promise<void>
}

// Plan T: en el sistema propio entrar ya abre el turno y trae los restaurantes de la cuenta en una sola respuesta.
function fromCore(r: core.LoginResult): Pick<AuthState, 'user' | 'restaurants' | 'restaurant' | 'employee' | 'session'> {
  const restaurants = r.restaurants.map(toRestaurant)
  const chosen = pickRestaurant(restaurants, readDeviceRestaurant())
  const restaurant = chosen ? { id: chosen.id, name: chosen.name } : null
  if (restaurant) storeDeviceRestaurant(restaurant)
  return { user: toAuthUser(r.account), restaurants, restaurant, employee: toActiveEmployee(r), session: null }
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  restaurant: null,
  restaurants: null,
  session: null,
  employee: null,
  hydrated: false,
  // Plan P: cada persona entra con su cuenta y en el mismo paso abre su turno; no hay cuenta del terminal ni PIN.
  login: async (l, p) => {
    clearStoredEmployee()
    set({ employee: null })
    const base = fromCore(await coreLogin(l, p))
    set({ ...base, session: await openShiftOf(base.restaurant), hydrated: true })
    return
  },
  hydrate: async () => {
    try { const base = fromCore(await core.me()); set({ ...base, session: await openShiftOf(base.restaurant), hydrated: true }) }
    catch { set({ user: null, session: null, employee: null, restaurants: null, restaurant: null, hydrated: true }) }
    return
  },
  refreshSession: async () => set({ session: await getOpenSession(get().restaurant?.id ?? null) }),
  // El encargado de varios restaurantes y el dueño cambian de restaurante sin soltar su turno: es la misma persona.
  chooseRestaurant: async (restaurant) => {
    storeDeviceRestaurant(restaurant)
    set({ restaurant, session: restaurant ? await getOpenSession(restaurant.id) : null })
  },
  openRegister: async (configId, cash, notes) => set({ session: await openRegisterRequest(configId, cash, notes) }),
  renewShift: async () => set({ employee: toActiveEmployee(await core.me()) }),
  endShift: async () => {
    // En el sistema propio la asistencia la cierra el propio logout.

    clearStoredEmployee()
    set({ employee: null })
  },
  logout: async () => {
    await get().endShift()
    await logoutRequest().catch(() => undefined)
    clearStoredEmployee()
    // El bus deja de tener dueño: se cierra con la sesión, no en cada navegación.
    useBusStore.getState().stop()
    set({ user: null, session: null, employee: null, restaurants: null })
  },
}))

export const activeEmployeeId = (): number | null => useAuthStore.getState().employee?.id ?? null
