import type { CoreAccount, CorePerson, CoreRestaurant, LoginResult } from '@/lib/services/core/pos'
import type { RestaurantInfo } from '@/lib/services/restaurantInfo'
import type { Restaurant } from '@/lib/services/restaurants'
import type { AuthUser } from '@/lib/services/session'
import type { Person, PersonValues } from '@/lib/services/team'
import type { ActiveEmployee } from '@/lib/stores/authStore'

const num = (v: string | number) => Number(v)

export const toAuthUser = (a: CoreAccount): AuthUser => ({ uid: num(a.id), name: a.name, companyId: 0, role: a.role })

// Las cookies del sistema propio llevan la identidad: no hay token de turno que mostrar ni guardar.
export const toActiveEmployee = (r: LoginResult): ActiveEmployee => ({
  id: num(r.account.id), name: r.account.name, code: null, role: r.account.role, shift: r.account.shift, userId: num(r.account.id),
  checkIn: new Date().toISOString(), attendanceId: r.attendance_id === null ? null : num(r.attendance_id), sessionEnds: r.session_ends,
})

// La lista de acceso no incluye cifras de ventas; los informes las consultan por separado.
export const toRestaurant = (r: CoreRestaurant | { id: string | number; name: string; slug?: string }): Restaurant => ({
  id: num(r.id), name: r.name, slug: r.slug ?? '', street: 'street' in r ? r.street : '', city: 'city' in r ? r.city : '', phone: 'phone' in r ? r.phone : '',
  open: false, salesToday: 0, ordersToday: 0,
})

export const toRestaurantInfo = (r: CoreRestaurant): RestaurantInfo => ({
  id: num(r.id), name: r.name, street: r.street, city: r.city, phone: r.phone, latitude: r.latitude, longitude: r.longitude, accessMargin: r.access_margin_minutes,
})

export const toPerson = (p: CorePerson): Person => ({
  id: num(p.id), name: p.name, role: p.role, configIds: p.restaurant_ids.map(num), shift: p.shift, userId: num(p.id), username: p.username, email: p.email, status: p.status,
  hourlyRate: p.hourly_rate === null || p.hourly_rate === undefined || p.hourly_rate === '' ? null : Number(p.hourly_rate),
})

export const toCorePerson = (v: Partial<PersonValues>) => ({
  ...(v.name !== undefined && { name: v.name }), ...(v.username !== undefined && { username: v.username }), ...(v.email !== undefined && { email: v.email }),
  ...(v.role !== undefined && { role: v.role }), ...(v.configIds !== undefined && { restaurant_ids: v.configIds }),
  ...(v.shiftStart !== undefined && { shift_start: v.shiftStart }), ...(v.shiftEnd !== undefined && { shift_end: v.shiftEnd }),
  ...(v.hourlyRate !== undefined && { hourly_rate: v.hourlyRate }),
})
