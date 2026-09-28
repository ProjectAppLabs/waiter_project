'use client'

import { create } from 'zustand'

import { fromOdooDatetime, readStoredEmployee, storeEmployee, type Shift } from '@/lib/domain/employees'
import { useBusStore } from '@/lib/stores/busStore'
import type { AccountRole } from '@/lib/domain/roles'
import { openRegister as openRegisterRequest } from '@/lib/services/cashRegister'
import { endShift as endShiftRequest, findOpenAttendance, readEmployee, type CheckedEmployee } from '@/lib/services/employees'
import { currentUser, getOpenSession, login as loginRequest, logout as logoutRequest } from '@/lib/services/session'
import { pickRestaurant, readDeviceRestaurant, storeDeviceRestaurant, type DeviceRestaurant } from '@/lib/domain/restaurant'
import { listRestaurants, type Restaurant } from '@/lib/services/restaurants'
import type { AuthUser, PosSession } from '@/lib/services/session'

// Empleado activo en este dispositivo (pos_hr): quien firma los pedidos. El PIN lo validó el servidor
// (`waiter_check_pin`), que además abrió la asistencia: `checkIn` (ISO) alimenta el cronómetro del turno.
export interface ActiveEmployee {
  id: number; name: string; code: string | null; role: AccountRole | null; shift: Shift | null
  userId: number | null; checkIn: string; attendanceId: number | null
  // Token de sesión del empleado: prueba su identidad ante Odoo (cambiar PIN, cerrar turno). No se muestra.
  token: string
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
  startShift: (employee: CheckedEmployee, attendanceId: number, token: string) => Promise<void>
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
    return { ...employee, userId: null, token: stored.token, checkIn: open ? toIso(open.checkIn) : stored.checkIn, attendanceId: open?.id ?? null }
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

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  restaurant: null,
  restaurants: null,
  session: null,
  employee: null,
  hydrated: false,
  login: async (l, p) => {
    // El terminal entra sin empleado: se suelta también el guardado, que si no revive en la próxima recarga.
    storeEmployee(null)
    set({ employee: null })
    const user = await loginRequest(l, p)
    const { restaurants, restaurant } = await resolveRestaurant()
    const session = await getOpenSession(restaurant?.id ?? null)
    set({ user, restaurants, restaurant, session, hydrated: true })
  },
  // La cookie de Odoo es HttpOnly: la única forma de saber si hay sesión es preguntar.
  hydrate: async () => {
    try {
      const user = await currentUser()
      const { restaurants, restaurant } = user ? await resolveRestaurant() : { restaurants: null, restaurant: null }
      const session = user ? await getOpenSession(restaurant?.id ?? null) : null
      const employee = user ? await restoreEmployee(restaurant?.id ?? null) : null
      set({ session, user, restaurants, restaurant, employee, hydrated: true })
    } catch {
      set({ user: null, session: null, employee: null, restaurants: null, restaurant: null, hydrated: true })
    }
  },
  refreshSession: async () => set({ session: await getOpenSession(get().restaurant?.id ?? null) }),
  // Cambiar de restaurante suelta al empleado: su PIN y su turno son de un restaurante.
  chooseRestaurant: async (restaurant) => {
    storeDeviceRestaurant(restaurant)
    if (restaurant?.id !== get().restaurant?.id) { storeEmployee(null); set({ employee: null }) }
    set({ restaurant, session: restaurant ? await getOpenSession(restaurant.id) : null })
  },
  openRegister: async (configId, cash, notes) => set({ session: await openRegisterRequest(configId, cash, notes) }),
  // El PIN ya lo validó `waiter_check_pin`, que devolvió al empleado, la asistencia recién abierta y el token.
  startShift: async (employee, attendanceId, token) => {
    const open = await findOpenAttendance(employee.id).catch(() => null)
    const checkIn = open ? toIso(open.checkIn) : new Date().toISOString()
    storeEmployee({ id: employee.id, checkIn, token })
    set({ employee: { ...employee, checkIn, attendanceId, token } })
  },
  // "Cerrar sesión" del kit: cierra la asistencia (`waiter_end_shift`) y suelta al empleado; la sesión de Odoo del terminal sigue.
  endShift: async () => {
    const current = get().employee
    if (current) { try { await endShiftRequest(current.id, current.token) } catch { /* el token pudo caducar: el turno termina igual en el dispositivo */ } }
    storeEmployee(null)
    set({ employee: null })
  },
  logout: async () => {
    await logoutRequest()
    storeEmployee(null)
    // El bus deja de tener dueño: se cierra con la sesión, no en cada navegación.
    useBusStore.getState().stop()
    set({ user: null, session: null, employee: null, restaurants: null })
  },
}))

// Para los servicios que firman pedidos (pos_hr: pos.order.employee_id).
export const activeEmployeeId = (): number | null => useAuthStore.getState().employee?.id ?? null
