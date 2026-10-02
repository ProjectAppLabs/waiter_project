'use client'

import { create } from 'zustand'

import { fromOdooDatetime, readStoredEmployee, storeEmployee, type Shift } from '@/lib/domain/employees'
import { useBusStore } from '@/lib/stores/busStore'
import type { AccountRole } from '@/lib/domain/roles'
import { openRegister as openRegisterRequest } from '@/lib/services/cashRegister'
import { endShift as endShiftRequest, findOpenAttendance, readEmployee, startMyShift, type MyShift } from '@/lib/services/employees'
import { currentUser, getOpenSession, login as loginRequest, logout as logoutRequest } from '@/lib/services/session'
import { onCore } from '@/lib/domain/backend'
import { toActiveEmployee, toAuthUser, toRestaurant } from '@/lib/services/core/bridge'
import { CoreError } from '@/lib/services/core/http'
import * as core from '@/lib/services/core/pos'
import { pickRestaurant, readDeviceRestaurant, storeDeviceRestaurant, type DeviceRestaurant } from '@/lib/domain/restaurant'
import { listRestaurants, type Restaurant } from '@/lib/services/restaurants'
import type { AuthUser, PosSession } from '@/lib/services/session'

// Empleado activo en este dispositivo (pos_hr): quien firma los pedidos. Plan P: es el de la cuenta que entró con su
// usuario o correo y su contraseña; `waiter_start_my_shift` comprobó su horario y abrió la asistencia: `checkIn` (ISO)
// alimenta el cronómetro del turno.
export interface ActiveEmployee {
  id: number; name: string; code: string | null; role: AccountRole | null; shift: Shift | null
  userId: number | null; checkIn: string; attendanceId: number | null
  // Token de sesión del empleado: prueba su identidad ante Odoo (firmar acciones, cerrar turno). No se muestra.
  token: string
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
  // Vuelve a pedir el token del turno (venció a mitad de una tarea): la sesión de Odoo ya prueba quién es.
  renewShift: () => Promise<void>
  endShift: () => Promise<void>
}

const toIso = (odoo: string) => fromOdooDatetime(odoo).toISOString()

// Tras una recarga se relee el empleado guardado y su asistencia abierta; si Odoo ya no lo conoce, se suelta.
async function restoreEmployee(restaurantId: number | null): Promise<ActiveEmployee | null> {
  const stored = readStoredEmployee()
  if (!stored) return null
  try {
    const employee = await readEmployee(stored.id, restaurantId)
    const open = await findOpenAttendance(stored.id).catch(() => null)
    return { ...employee, userId: null, token: stored.token, sessionEnds: stored.sessionEnds ?? null, checkIn: open ? toIso(open.checkIn) : stored.checkIn, attendanceId: open?.id ?? null }
  } catch {
    storeEmployee(null)
    return null
  }
}

// Restaurantes que la cuenta opera y cuál usar; si falla la lista, se sigue como un solo restaurante (sin filtro).
async function resolveRestaurant(): Promise<{ restaurants: Restaurant[] | null; restaurant: DeviceRestaurant | null }> {
  const restaurants = await listRestaurants().catch(() => null)
  if (!restaurants) return { restaurants: null, restaurant: null }
  const chosen = pickRestaurant(restaurants, readDeviceRestaurant())
  const restaurant = chosen ? { id: chosen.id, name: chosen.name } : null
  if (restaurant) storeDeviceRestaurant(restaurant)
  return { restaurants, restaurant }
}

// Abre el turno de la cuenta conectada; si no puede (fuera de horario), cierra la sesión de Odoo y explica por qué.
async function openMyShift(restaurantId: number | null): Promise<ActiveEmployee> {
  const shift: MyShift = await startMyShift(restaurantId)
  if (!shift.ok) {
    await logoutRequest().catch(() => undefined)
    throw new ShiftDeniedError(shift.reason, shift.window ?? null)
  }
  const open = await findOpenAttendance(shift.employee.id).catch(() => null)
  const checkIn = open ? toIso(open.checkIn) : new Date().toISOString()
  storeEmployee({ id: shift.employee.id, checkIn, token: shift.token, sessionEnds: shift.sessionEnds })
  return { ...shift.employee, checkIn, attendanceId: shift.attendanceId, token: shift.token, sessionEnds: shift.sessionEnds }
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
    storeEmployee(null)
    set({ employee: null })
    if (onCore()) { const base = fromCore(await coreLogin(l, p)); set({ ...base, session: await openShiftOf(base.restaurant), hydrated: true }); return }
    const user = await loginRequest(l, p)
    const { restaurants, restaurant } = await resolveRestaurant()
    const employee = await openMyShift(restaurant?.id ?? null)
    const session = await getOpenSession(restaurant?.id ?? null)
    set({ user, restaurants, restaurant, session, employee, hydrated: true })
  },
  // La cookie de Odoo es HttpOnly: la única forma de saber si hay sesión es preguntar.
  hydrate: async () => {
    if (onCore()) {
      try { const base = fromCore(await core.me()); set({ ...base, session: await openShiftOf(base.restaurant), hydrated: true }) }
      catch { set({ user: null, session: null, employee: null, restaurants: null, restaurant: null, hydrated: true }) }
      return
    }
    try {
      const user = await currentUser()
      const { restaurants, restaurant } = user ? await resolveRestaurant() : { restaurants: null, restaurant: null }
      const session = user ? await getOpenSession(restaurant?.id ?? null) : null
      // Sin empleado guardado (otra pestaña cerró el turno, o se borró el almacenamiento) se vuelve a abrir con la cuenta.
      const employee = user ? (await restoreEmployee(restaurant?.id ?? null)) ?? await openMyShift(restaurant?.id ?? null) : null
      set({ session, user, restaurants, restaurant, employee, hydrated: true })
    } catch {
      set({ user: null, session: null, employee: null, restaurants: null, restaurant: null, hydrated: true })
    }
  },
  refreshSession: async () => set({ session: await getOpenSession(get().restaurant?.id ?? null) }),
  // El encargado de varios restaurantes y el dueño cambian de restaurante sin soltar su turno: es la misma persona.
  chooseRestaurant: async (restaurant) => {
    storeDeviceRestaurant(restaurant)
    set({ restaurant, session: restaurant ? await getOpenSession(restaurant.id) : null })
  },
  openRegister: async (configId, cash, notes) => set({ session: await openRegisterRequest(configId, cash, notes) }),
  renewShift: async () => set({ employee: onCore() ? toActiveEmployee(await core.me()) : await openMyShift(get().restaurant?.id ?? null) }),
  // Cierra la asistencia (`waiter_end_shift`) y suelta al empleado. «Cerrar sesión» además cierra la sesión de Odoo (logout).
  endShift: async () => {
    const current = get().employee
    // En el sistema propio la asistencia la cierra el propio logout.
    if (current && !onCore()) { try { await endShiftRequest(current.id, current.token) } catch { /* el token pudo caducar: el turno termina igual en el dispositivo */ } }
    storeEmployee(null)
    set({ employee: null })
  },
  // «Cerrar sesión»: termina el turno y la sesión de Odoo, para que la siguiente persona entre con su cuenta.
  logout: async () => {
    await get().endShift()
    await logoutRequest().catch(() => undefined)
    storeEmployee(null)
    // El bus deja de tener dueño: se cierra con la sesión, no en cada navegación.
    useBusStore.getState().stop()
    set({ user: null, session: null, employee: null, restaurants: null })
  },
}))

// Para los servicios que firman pedidos (pos_hr: pos.order.employee_id).
export const activeEmployeeId = (): number | null => useAuthStore.getState().employee?.id ?? null
