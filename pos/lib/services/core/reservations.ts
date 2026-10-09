import { coreFetch } from '@/lib/services/core/http'

const one = <T>(r: T | T[]): T => (Array.isArray(r) ? r[0] : r)
const q = (p: Record<string, string | number | null | undefined>) => Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')

export const timeline = <T>(restaurantId: number, date: string, floorId?: number | null) => coreFetch<T>(`reservations/timeline?${q({ restaurant_id: restaurantId, date, floor_id: floorId })}`)
export const slots = <T>(restaurantId: number, date: string) => coreFetch<T>(`reservations/slots?${q({ restaurant_id: restaurantId, date })}`)
// Todas las mesas con su estado (`include_unavailable`, como se pedía a Odoo): una que no sienta sola al grupo llega como
// «unavailable» y se puede juntar con otra, porque al crear el servidor acepta la suma de puestos.
export const tables = <T>(restaurantId: number, date: string, timeStart: number, people: number, prep: string, excludeId: number | null) =>
  coreFetch<T>(`reservations/tables?${q({ restaurant_id: restaurantId, date, time_start: timeStart, people, prep, exclude_id: excludeId, include_unavailable: 'true' })}`)
export const create = async <T>(body: Record<string, unknown>) => one(await coreFetch<T | T[]>('reservations', { method: 'POST', body }))
export const get = async <T>(id: number) => one(await coreFetch<T | T[]>(`reservations/${id}`))
export const byTable = <T>(tableId: number) => coreFetch<{ reservations: T[] }>(`reservations?table_id=${tableId}`).then((r) => r.reservations)
export const setTables = async <T>(id: number, tableIds: number[]) => one(await coreFetch<T | T[]>(`reservations/${id}/tables`, { method: 'PUT', body: { table_ids: tableIds } }))
export const transition = (id: number, action: 'seat' | 'no-show' | 'cancel') => coreFetch<unknown>(`reservations/${id}/${action}`, { method: 'POST' })
export const setDeposit = async <T>(id: number, amount: number) => one(await coreFetch<T | T[]>(`reservations/${id}/deposit`, { method: 'PUT', body: { amount } }))
export const depositPaid = async <T>(id: number, reference: string) => one(await coreFetch<T | T[]>(`reservations/${id}/deposit/paid`, { method: 'POST', body: { reference } }))
export const schedule = <T>(restaurantId: number) => coreFetch<T>(`reservations/schedule?restaurant_id=${restaurantId}`)
export const saveSchedule = <T>(restaurantId: number, body: T) => coreFetch<T>(`reservations/schedule?restaurant_id=${restaurantId}`, { method: 'PUT', body })
