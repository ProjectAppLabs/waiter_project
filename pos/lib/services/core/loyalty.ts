import { coreFetch } from '@/lib/services/core/http'

export interface CoreCustomer { id: number; name: string; phone: string; email: string; vat: string; id_type: string; street: string; city: string; orders: number; invoiced: number }
export interface CoreCard { id: number; points: number; code: string; program: string; expires: string | null }
export interface CoreProgram { id: number; name: string; spend_per_point: number; value_per_point: number; minimum_points: number }
export interface CoreMember { card_id: number; code: string; name: string; phone: string; points: number }

export const listCustomers = (q = '') => coreFetch<{ customers: CoreCustomer[] }>(`customers?q=${encodeURIComponent(q)}`).then((r) => r.customers)
export const createCustomer = (body: Partial<CoreCustomer>) => coreFetch<{ customer: CoreCustomer }>('customers', { method: 'POST', body }).then((r) => r.customer)
export const updateCustomer = (id: number, body: Partial<CoreCustomer>) => coreFetch<{ customer: CoreCustomer }>(`customers/${id}`, { method: 'PATCH', body }).then((r) => r.customer)
export const idTypes = () => coreFetch<{ id_types: { id: string; name: string }[] }>('customers/id-types').then((r) => r.id_types)
export const customerCard = (id: number) => coreFetch<{ card: CoreCard | null }>(`customers/${id}/card`).then((r) => r.card)
export const customerOrders = (id: number) => coreFetch<{ orders: { id: number; number: string; paid_at: string; total: number; state: string }[] }>(`customers/${id}/orders`).then((r) => r.orders)
export const program = () => coreFetch<{ program: CoreProgram | null }>('loyalty/program').then((r) => r.program)
export const member = (code: string) => coreFetch<{ member: CoreMember }>(`loyalty/cards/${encodeURIComponent(code.trim())}`).then((r) => r.member)
export const redeem = (orderId: number, cardId: number) => coreFetch<{ amount: number; points: number }>(`orders/${orderId}/redeem`, { method: 'POST', body: { card_id: cardId } })
export const benefits = <T>(restaurantId: number) => coreFetch<T>(`benefits?restaurant_id=${restaurantId}`)
export const saveBenefits = <T>(body: Record<string, unknown>) => coreFetch<T>('benefits', { method: 'PUT', body })
export const banners = <T>(restaurantId: number) => coreFetch<{ banners: T[] }>(`banners?restaurant_id=${restaurantId}`)
export const saveBanners = <T>(list: T[]) => coreFetch<{ banners: T[] }>('banners', { method: 'PUT', body: list })
export const notifyPrefs = <T>() => coreFetch<{ prefs: T }>('me/notify-prefs').then((r) => r.prefs)
export const saveNotifyPrefs = <T>(prefs: Partial<T>) => coreFetch<{ prefs: T }>('me/notify-prefs', { method: 'PUT', body: { prefs } }).then((r) => r.prefs)
export const requestIngredient = (notificationId: number) => coreFetch<{ request: { id: number; supplier_name: string; lines: { name: string; qty: number }[] } }>(`notifications/${notificationId}/request-ingredient`, { method: 'POST' }).then((r) => r.request)
