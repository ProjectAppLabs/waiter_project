import type { AccountRole } from '@/lib/domain/roles'
import { coreFetch } from '@/lib/services/core/http'

// Plan T0: la API de acceso del POS en el sistema propio (contrato en docs/planes/2026-10-01-plan-T-sistema-propio.md).
// El POS la conecta en T2, cuando el sistema propio cubra también el salón, los pedidos y la caja; hasta entonces estas
// funciones solo las usa la verificación.
export interface OrgBrand { brand_color: string; brand_font: string; brand_radius: string; tagline: string; logo_url: string; greeting: string; waiter_name: string; welcome: string }
export interface PublicOrganization { slug: string; name: string; status: 'trial' | 'active' | 'suspended'; brand: OrgBrand }
export interface CoreAccount { id: string; name: string; username: string; email: string | null; role: AccountRole; restaurant_ids: string[]; shift: { from: number; to: number } | null
  // Plan Y5: valor de la hora, base de la nómina (null: sin definir).
  hourly_rate?: number | string | null }
export interface CoreRestaurant { id: string; slug: string; name: string; street: string; city: string; phone: string; latitude: string; longitude: string; access_margin_minutes: number }
export interface LoginResult { account: CoreAccount; attendance_id: string | null; session_ends: string; restaurants: { id: string; name: string }[]
  // Plan W: módulos activos de la organización y de cada local de la cuenta.
  modules?: string[]; restaurant_modules?: Record<string, string[]>
  // Plan Y4: presente solo en una sesión de soporte de ProjectApp.
  support?: { until: string; agent: string } | null }
export interface CorePerson extends CoreAccount { status: 'active' | 'pending' }
export interface CoreNotification { id: string; kind: 'kitchen' | 'inventory' | 'system' | 'access' | 'cash'; title: string; body: string; restaurant_id: string | null; read: boolean; action: string | null; action_done: boolean; created_at: string }

export const getOrg = () => coreFetch<{ organization: PublicOrganization }>('org').then((r) => r.organization)
export const login = (login: string, password: string, restaurantId?: string) => coreFetch<LoginResult>('auth/login', { method: 'POST', body: { login, password, restaurant_id: restaurantId } })
export const logout = () => coreFetch<{ ok: true; worked_hours: number }>('auth/logout', { method: 'POST' })
export const me = () => coreFetch<LoginResult>('auth/me')
export const requestCode = (login: string) => coreFetch<{ ok: true }>('auth/request_code', { method: 'POST', body: { login } })
export const activate = (login: string, code: string, password: string) => coreFetch<{ ok: true }>('auth/activate', { method: 'POST', body: { login, code, password } })
export const changePassword = (current: string, next: string) => coreFetch<{ ok: true }>('auth/change_password', { method: 'POST', body: { current, next } })

export const listRestaurants = () => coreFetch<{ restaurants: CoreRestaurant[] }>('restaurants').then((r) => r.restaurants)
export const createRestaurant = (input: { name: string; slug: string; street?: string; city?: string; phone?: string }) => coreFetch<{ restaurant: CoreRestaurant }>('restaurants', { method: 'POST', body: input }).then((r) => r.restaurant)
export const updateRestaurant = (id: string, patch: Partial<CoreRestaurant>) => coreFetch<{ restaurant: CoreRestaurant }>(`restaurants/${id}`, { method: 'PATCH', body: patch }).then((r) => r.restaurant)

export const listPeople = () => coreFetch<{ people: CorePerson[] }>('team').then((r) => r.people)
export const invitePerson = (input: { name: string; username?: string; email: string; role: AccountRole; restaurant_ids: string[]; shift_start?: number | null; shift_end?: number | null; hourly_rate?: number | null }) =>
  coreFetch<{ person: CorePerson; invite_sent: boolean }>('team', { method: 'POST', body: input })
export const updatePerson = (id: string, patch: Record<string, unknown>) => coreFetch<{ person: CorePerson }>(`team/${id}`, { method: 'PATCH', body: patch }).then((r) => r.person)
export const resendInvite = (id: string) => coreFetch<{ ok: true }>(`team/${id}/resend_invite`, { method: 'POST' })
export const deactivatePerson = (id: string) => coreFetch<{ ok: true }>(`team/${id}/deactivate`, { method: 'POST' })

export const listNotifications = (limit = 50) => coreFetch<{ notifications: CoreNotification[] }>(`notifications?limit=${limit}`).then((r) => r.notifications)
export const readAllNotifications = () => coreFetch<{ ok: true }>('notifications/read_all', { method: 'POST' })
export const readNotification = (id: string) => coreFetch<{ ok: true }>(`notifications/${id}/read`, { method: 'POST' })
