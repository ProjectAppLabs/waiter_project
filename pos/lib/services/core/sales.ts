import { coreFetch } from '@/lib/services/core/http'

// Plan T2: pedidos, cobro, caja e informes del sistema propio (contrato «Contrato T2» en
// docs/planes/2026-10-01-plan-T-sistema-propio.md). Los totales los calcula el servidor; las horas son ISO UTC.
export type Service = 'dine_in' | 'takeout' | 'delivery'
export type OrderState = 'draft' | 'paid' | 'cancelled'
export type Origin = 'waiter' | 'diner' | 'ai'
export interface CorePerson { id: number; name: string }
export interface CoreLine {
  id: number; uuid: string; product_id: number; name: string; qty: number; unit_price: number; subtotal: number; total: number; note: string
  options: { group: string; name: string; price_extra: number }[]; parent_id: number | null; discount_pct: number; course_id: number | null
  ready_at: string | null; served_at: string | null; cancelled: boolean
}
export interface CoreCourse { id: number; index: number; fired_at: string; preparation_at: string | null; ready_at: string | null; served_at: string | null }
export interface CorePayment { id: number; method_id: number; method: string; amount: number; received: number | null; reference: string; created_at: string; request_key: string | null }
export interface CoreOrder {
  id: number; uuid: string; number: string; tracking: number; service: Service; state: OrderState; origin: Origin; channel: 'pos' | 'menu' | 'whatsapp'
  table_id: number | null; table_number: number | null; guests: number; baby_chair: boolean; customer_name: string; delivery_address: string; delivery_phone: string
  note: string; billing: boolean; created_at: string; paid_at: string | null; waiter: CorePerson | null
  subtotal: number; tax: number; tip: number; total: number; paid: number; change: number; refunded?: number; lines: CoreLine[]; courses: CoreCourse[]; payments: CorePayment[]
}
export interface LineInput { uuid: string; product_id: number; qty: number; note?: string; options?: { group: string; name: string; price_extra: number }[]; children?: { uuid: string; product_id: number; qty: number }[] }
export interface OrderInput {
  restaurant_id: number; uuid: string; service: Service; table_id?: number | null; guests?: number; baby_chair?: boolean; customer_name?: string
  delivery_address?: string; delivery_phone?: string; note?: string; lines: LineInput[]; fire: boolean
  // La hora real de un pedido creado sin conexión (plan V).
  created_at?: string
}
export interface CoreShift {
  id: number; restaurant_id: number; state: 'open' | 'closed'; opened_at: string; opened_by: CorePerson | null; opening_cash: number; opening_notes: string
  closed_at?: string | null; closed_by?: CorePerson | null; expected_cash?: number; counted_cash?: number; difference?: number; closing_notes?: string; over_tolerance?: boolean
  total?: number; orders?: number
}
export interface CoreClosing {
  orders_count: number; orders_total: number; opening_cash: number; cash_payments: number; cash_moves: { kind: 'in' | 'out'; amount: number; reason: string }[]
  expected_cash: number; other_methods: { id: number; name: string; amount: number; count: number }[]; draft_orders: number; opening_notes: string
  // Plan U1: el efectivo devuelto en este turno, ya restado del esperado.
  refunds_cash?: number
}
export interface CoreClosingRow {
  shift_id: number; restaurant_id: number; restaurant_name: string; closed_at: string; closed_by: CorePerson | null; expected: number; counted: number
  difference: number; notes: string; over_tolerance: boolean
}
export interface CoreMethod { id: number; name: string; type: 'cash' | 'bank' | 'pay_later' }
export interface CoreSummary {
  total: number; orders: number; autonomous: number; by_method: { method: string; amount: number }[]
  by_waiter: { waiter: string; amount: number; orders: number }[]; top_products: { product: string; qty: number; amount: number }[]
}
export interface CoreInsights {
  today: string; window_days: number; history_days: number; daily: { date: string; total: number; orders: number }[]
  hourly: { hour: number; total: number; orders: number }[]; products: { product_id: number; name: string; qty: number; amount: number; prev_qty: number }[]
}
export interface CoreRestaurantSettings {
  alert_late_minutes: number; alert_bill_minutes: number; roi_hour_cost: number; roi_minutes_per_order: number; roi_baseline_hours_per_100: number
  roi_monthly_cost: number; roi_start_date: string | null; kitchen_prepay_roles: string[]
}
export interface CoreSettings { restaurant: CoreRestaurantSettings; role_policy: Record<string, { views: string[]; actions: string[] }>; can_charge: boolean; can_edit_inventory: boolean; cash_tolerance?: number
  // Plan W: módulos activos del local.
  modules?: string[] }

const q = (params: Record<string, string | number | null | undefined>) =>
  Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')

// Caja
export const openShift = (restaurantId: number) => coreFetch<{ shift: CoreShift | null }>(`shifts/open?restaurant_id=${restaurantId}`).then((r) => r.shift)
export const createShift = (restaurantId: number, openingCash: number, notes: string) =>
  coreFetch<{ shift: CoreShift }>('shifts', { method: 'POST', body: { restaurant_id: restaurantId, opening_cash: openingCash, notes } }).then((r) => r.shift)
export const listShifts = (restaurantId: number, limit = 12) => coreFetch<{ shifts: CoreShift[] }>(`shifts?${q({ restaurant_id: restaurantId, limit })}`).then((r) => r.shifts)
export const shiftClosing = (shiftId: number) => coreFetch<CoreClosing>(`shifts/${shiftId}/closing`)
export const cashMove = (shiftId: number, kind: 'in' | 'out', amount: number, reason: string, requestKey: string) =>
  coreFetch<{ expected_cash: number }>(`shifts/${shiftId}/moves`, { method: 'POST', body: { kind, amount, reason, request_key: requestKey } })
export const closeShift = (shiftId: number, countedCash: number, notes: string) =>
  coreFetch<{ shift: CoreShift }>(`shifts/${shiftId}/close`, { method: 'POST', body: { counted_cash: countedCash, notes } }).then((r) => r.shift)
export const cashClosings = (from: string, to: string, restaurantIds: number[] | null, onlyDifferences: boolean) =>
  coreFetch<{ closings: CoreClosingRow[]; tolerance: number }>(`shifts/closings?${q({ from, to, restaurant_ids: restaurantIds?.join(','), only_differences: onlyDifferences ? 1 : undefined })}`)
export const setCashTolerance = (tolerance: number) => coreFetch<{ tolerance: number }>('settings/cash', { method: 'PUT', body: { tolerance } })
export const listMethods = (restaurantId: number) => coreFetch<{ methods: CoreMethod[] }>(`payment-methods?restaurant_id=${restaurantId}`).then((r) => r.methods)
export const assignShiftZones = (shiftId: number, floorId: number, assignments: Record<string, number[]> | null) =>
  coreFetch<unknown>(`shifts/${shiftId}/zones`, { method: 'PUT', body: { floor_id: floorId, assignments } })

// Pedidos
export const listOrders = (restaurantId: number, state: 'open' | 'paid', extra: { from?: string; to?: string; limit?: number } = {}) =>
  coreFetch<{ orders: CoreOrder[] }>(`orders?${q({ restaurant_id: restaurantId, state, ...extra })}`).then((r) => r.orders)
export const getOrder = (id: number, options: { offlineFallback?: boolean } = {}) => coreFetch<{ order: CoreOrder }>(`orders/${id}`, options).then((r) => r.order)
export const createOrder = (input: OrderInput) => coreFetch<{ order: CoreOrder }>('orders', { method: 'POST', body: input }).then((r) => r.order)
export const addLines = (id: number, lines: LineInput[], fire: boolean) => coreFetch<{ order: CoreOrder }>(`orders/${id}/lines`, { method: 'POST', body: { lines, fire } }).then((r) => r.order)
export const cancelLines = (id: number, lineIds: number[]) => coreFetch<{ order: CoreOrder }>(`orders/${id}/lines`, { method: 'DELETE', body: { line_ids: lineIds } }).then((r) => r.order)
export const fireOrder = (id: number) => coreFetch<{ order: CoreOrder; course_id: number | null }>(`orders/${id}/fire`, { method: 'POST' })
export const patchOrder = (id: number, patch: { table_id?: number; note?: string; guests?: number; billing?: boolean; customer_name?: string }) =>
  coreFetch<{ order: CoreOrder }>(`orders/${id}`, { method: 'PATCH', body: patch }).then((r) => r.order)
export const addPayment = (id: number, body: { method_id: number; amount: number; received?: number; reference?: string; request_key: string }) =>
  coreFetch<{ order: CoreOrder }>(`orders/${id}/payments`, { method: 'POST', body }).then((r) => r.order)
export const setTip = (id: number, amount: number) => coreFetch<{ order: CoreOrder }>(`orders/${id}/tip`, { method: 'PUT', body: { amount } }).then((r) => r.order)
// `paidAt`: la hora real de un cobro hecho sin conexión (plan V); el servidor la ajusta al turno.
export const payOrder = (id: number, paidAt?: string) => coreFetch<{ order: CoreOrder }>(`orders/${id}/pay`, { method: 'POST', ...(paidAt && { body: { paid_at: paidAt } }) }).then((r) => r.order)
export const cancelOrder = (id: number, reason: string) => coreFetch<{ order: CoreOrder }>(`orders/${id}/cancel`, { method: 'POST', body: { reason } }).then((r) => r.order)

// Informes
export const salesSummary = (restaurantId: number, scope: { shift_id?: number; from?: string; to?: string }) =>
  coreFetch<CoreSummary>(`sales/summary?${q({ restaurant_id: restaurantId, ...scope })}`)
export const salesOrders = (restaurantId: number, scope: { shift_id?: number; from?: string; to?: string; limit?: number }) =>
  coreFetch<{ orders: CoreOrder[] }>(`sales/orders?${q({ restaurant_id: restaurantId, ...scope })}`).then((r) => r.orders)
export const salesInsights = (restaurantId: number) => coreFetch<CoreInsights>(`sales/insights?restaurant_id=${restaurantId}`)

// Ajustes
export const getSettings = (restaurantId: number) => coreFetch<CoreSettings>(`settings?restaurant_id=${restaurantId}`)
export const patchSettings = (restaurantId: number, patch: Partial<CoreRestaurantSettings>) =>
  coreFetch<CoreSettings>(`settings?restaurant_id=${restaurantId}`, { method: 'PATCH', body: patch })
export const putRolePolicy = (policy: CoreSettings['role_policy']) =>
  coreFetch<{ role_policy: CoreSettings['role_policy'] }>('settings/roles', { method: 'PUT', body: policy }).then((r) => r.role_policy)
