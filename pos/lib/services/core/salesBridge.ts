import { kitchenPhase } from '@/lib/domain/kitchen'
import type { FloorDocument, PlanImage } from '@/lib/domain/floorPlan'
import type { SalesHistory } from '@/lib/domain/insights'
import type { KitCourse, KitLine, KitOrder } from '@/lib/domain/orderState'
import type { SalesScope } from '@/lib/domain/salesPeriod'
import type { Assignments, ZoneStaff } from '@/lib/domain/zoneStaff'
import { DEFAULT_ROLE_POLICY, type RolePolicy } from '@/lib/domain/permissions'
import type { CashClosing } from '@/lib/services/business'
import type { ClosingData, RegisterConfig } from '@/lib/services/cashRegister'
import type { CompletedCourse, CourseSummary, KitchenTicket } from '@/lib/services/kitchen'
import type { CreatedOrder } from '@/lib/services/orderCreate'
import type { OpenOrder, SavedOrder } from '@/lib/services/orders'
import type { ShiftOrder } from '@/lib/services/ops'
import type { PayableOrder } from '@/lib/services/paymentKit'
import type { MethodTotal, ProductTotal, SaleRow, ShiftRow, WaiterTotal } from '@/lib/services/sales'
import type { PosSession } from '@/lib/services/session'
import type { FloorSetting, LineStatus, OrderDetail, TableCall } from '@/lib/services/tables'
import type { InvoiceableOrder } from '@/lib/services/invoices'
import type { Catalog, Floor, PaymentMethod, Settings, Table } from '@/lib/types'
import type { CoreClosing, CoreClosingRow, CoreInsights, CoreMethod, CoreOrder, CoreSettings, CoreShift, CoreSummary } from '@/lib/services/core/sales'
import type { CoreTicket } from '@/lib/services/core/kitchen'
import type { CoreCall, CoreFloor, CorePlan, CoreZoneStaff } from '@/lib/services/core/tables'
import { backgroundUrl, planImageUrl } from '@/lib/services/core/tables'

// Plan T2: traduce pedidos, caja, cocina y salón del sistema propio a las formas que ya usan las pantallas del POS.
// Los ids del turno de caja valen como «sesión» (`PosSession.id`) y el restaurante como `configId`.

export const toPosSession = (s: CoreShift): PosSession => ({ id: s.id, configId: s.restaurant_id, state: 'opened' })
export const toRegisterConfig = (r: { id: number; name: string }): RegisterConfig => ({ id: r.id, name: r.name })

const state = (o: CoreOrder): KitOrder['state'] => (o.state === 'cancelled' ? 'cancel' : o.state)
const live = (o: CoreOrder) => o.lines.filter((l) => !l.cancelled)

export const toKitLine = (l: CoreOrder['lines'][number]): KitLine => ({
  id: l.id, uuid: l.uuid, productId: l.product_id, name: l.name, qty: l.qty, unitPrice: l.unit_price, subtotal: l.subtotal, total: l.total, note: l.note,
  courseId: l.course_id, readyAt: l.ready_at, servedAt: l.served_at, options: (l.options ?? []).map((o) => o.name),
})
export const toKitCourse = (c: CoreOrder['courses'][number]): KitCourse => ({ id: c.id, fired: true, preparationAt: c.preparation_at, readyAt: c.ready_at, servedAt: c.served_at })
export const toKitOrder = (o: CoreOrder): KitOrder => ({
  channel: o.channel === 'whatsapp' ? 'whatsapp' : null, phone: o.delivery_phone, id: o.id, number: o.number, type: o.service, state: state(o),
  tableId: o.table_id, tableNumber: o.table_number, customer: o.customer_name, startedAt: o.created_at, total: o.total, tax: o.tax,
  lines: live(o).map(toKitLine), courses: o.courses.map(toKitCourse), waiter: o.waiter?.name ?? '', tracking: String(o.tracking), refunded: o.refunded ?? 0,
  paid: o.paid, delivery: toDelivery(o),
})
// Plan D: los datos de entrega solo existen en los domicilios.
export const toDelivery = (o: CoreOrder): KitOrder['delivery'] => o.service !== 'delivery' ? null : {
  address: o.delivery_address ?? '', details: o.delivery_details ?? '', phone: o.delivery_phone ?? '',
  lat: o.delivery_lat ?? null, lng: o.delivery_lng ?? null, fee: Number(o.delivery_fee ?? 0), payment: o.delivery_payment ?? '',
  distanceKm: o.delivery_distance_km ?? null,
}
export const toSavedOrder = (o: CoreOrder): SavedOrder => ({ id: o.id, reference: o.number, state: o.state === 'paid' ? 'paid' : 'draft', total: o.total, tax: o.tax, paid: o.paid })
export const toCreatedOrder = (o: CoreOrder): CreatedOrder => ({ id: o.id, reference: o.number, trackingNumber: String(o.tracking), total: o.total, tax: o.tax })
export const toCourseSummaries = (o: CoreOrder): CourseSummary[] => o.courses.map((c) => ({ orderId: o.id, firedAt: c.fired_at, readyAt: c.ready_at, servedAt: c.served_at }))
export const toOpenOrder = (o: CoreOrder): OpenOrder | null => {
  if (o.table_id === null || o.state !== 'draft') return null
  const lines = live(o)
  return {
    id: o.id, tableId: o.table_id, total: o.total, tax: o.tax, state: 'draft', lineCount: lines.length, startedAt: o.created_at, waiter: o.waiter?.name ?? '',
    kitchen: lines.some((l) => l.ready_at && !l.served_at) ? 'ready' : kitchenPhase(toCourseSummaries(o)), tracking: String(o.tracking), unsent: lines.some((l) => l.course_id === null),
  }
}
const SERVICE_LABEL = { dine_in: 'En mesa', takeout: 'Para llevar', delivery: 'Domicilio' } as const
export const toPayableOrder = (o: CoreOrder): PayableOrder => ({
  id: o.id, reference: o.number, trackingNumber: String(o.tracking), presetId: null, presetName: SERVICE_LABEL[o.service], customerName: o.customer_name,
  tableId: o.table_id, tableNumber: o.table_number === null ? '' : String(o.table_number), date: o.created_at, total: o.total, tax: o.tax, tip: o.tip, paid: o.paid,
  lines: live(o).map((l) => ({ uuid: l.uuid, name: l.name, qty: l.qty, unitPrice: l.unit_price, total: l.total, note: l.note, discount: l.discount_pct, couponCode: '' })),
})
const lineStatus = (o: CoreOrder, l: CoreOrder['lines'][number]): LineStatus => {
  const course = o.courses.find((c) => c.id === l.course_id)
  if (!course) return 'unsent'
  if (l.served_at || course.served_at) return 'served'
  if (l.ready_at || course.ready_at) return 'ready'
  return course.preparation_at ? 'progress' : 'waiting'
}
export const toOrderDetail = (o: CoreOrder): OrderDetail => {
  const lines = live(o).map((l) => ({
    id: l.id, uuid: l.uuid, productId: l.product_id, name: l.name, qty: l.qty, unitPrice: l.unit_price, total: l.total, note: l.note,
    additions: l.options.map((x) => x.name), status: lineStatus(o, l),
  }))
  return {
    id: o.id, tracking: String(o.tracking), reference: o.number, serviceAt: o.service === 'dine_in' ? 'table' : o.service === 'takeout' ? 'counter' : 'delivery',
    customerName: o.customer_name, dateOrder: o.created_at, total: o.total, sent: lines.filter((l) => l.status !== 'unsent').length, served: lines.filter((l) => l.status === 'served').length, lines,
  }
}
export const toShiftOrder = (o: CoreOrder): ShiftOrder => {
  const pending = o.courses.filter((c) => c.ready_at === null)
  return {
    id: o.id, reference: o.number, tableId: o.table_id, tableNumber: o.table_number, waiter: o.waiter?.name ?? '', origin: o.origin, total: o.total, state: state(o),
    kitchen: kitchenPhase(toCourseSummaries(o)), firedAt: pending.length ? pending.map((c) => c.fired_at).sort()[0] : null, startedAt: o.created_at,
  }
}
export const toSaleRow = (o: CoreOrder): SaleRow => ({ id: o.id, reference: o.number, paidAt: o.paid_at ?? o.created_at, tableNumber: o.table_number, waiter: o.waiter?.name ?? '', origin: o.origin, total: o.total })
export const toInvoiceableOrder = (o: CoreOrder): InvoiceableOrder => ({
  id: o.id, reference: o.number, date: o.paid_at ?? o.created_at, total: o.total, tax: o.tax, tableId: o.table_id, partnerId: null, partnerName: o.customer_name, invoiceId: null,
  payments: o.payments.map((p) => ({ methodId: p.method_id, method: p.method, amount: p.amount })), tip: o.tip,
})

// Cocina. La comanda del sistema propio trae el número de mesa; el KDS busca la mesa por id y, si no la encuentra,
// muestra el valor tal cual: por eso aquí viaja el número.
export const toKitchenTicket = (t: CoreTicket): KitchenTicket => ({
  id: t.id, orderId: t.order_id, tableId: t.table_number ?? 0, service: t.service, tracking: t.number, waiter: typeof t.waiter === 'string' ? t.waiter : t.waiter?.name ?? '', note: t.note, firedAt: t.fired_at, preparationAt: t.preparation_at, readyAt: t.ready_at,
  lines: t.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, note: l.note, station: l.station || null, options: l.options ?? [], readyAt: l.ready_at, servedAt: l.served_at })),
})
export const toCompleted = (c: { fired_at: string; ready_at: string }): CompletedCourse => ({ firedAt: c.fired_at, readyAt: c.ready_at })

// Caja
export const toClosingData = (c: CoreClosing): ClosingData => ({
  ordersCount: c.orders_count, ordersTotal: c.orders_total, expectedCash: c.expected_cash, openingCash: c.opening_cash, cashPayments: c.cash_payments,
  cashMoves: c.cash_moves.map((m) => ({ name: m.reason, amount: m.kind === 'out' ? -m.amount : m.amount })), otherMethods: c.other_methods, draftOrders: c.draft_orders, openingNotes: c.opening_notes, refundsCash: c.refunds_cash ?? 0,
})
export const toShiftRow = (s: CoreShift): ShiftRow => ({
  id: s.id, name: `Turno ${s.id}`, state: s.state === 'open' ? 'opened' : 'closed', startAt: s.opened_at, stopAt: s.closed_at ?? null, user: s.opened_by?.name ?? '', total: s.total ?? 0, orders: s.orders ?? 0,
})
export const toCashClosing = (r: CoreClosingRow): CashClosing => ({
  sessionId: r.shift_id, name: `Turno ${r.shift_id}`, configId: r.restaurant_id, configName: r.restaurant_name, closedAt: r.closed_at,
  closedBy: r.closed_by ? { userId: r.closed_by.id, name: r.closed_by.name } : null, expected: r.expected, counted: r.counted, difference: r.difference, notes: r.notes, overTolerance: r.over_tolerance,
})
export const scopeParams = (scope: SalesScope) => (scope.kind === 'shift' ? { shift_id: scope.sessionId } : { from: scope.from, to: scope.to })
export const toMethodTotals = (s: CoreSummary): MethodTotal[] => s.by_method.map((m) => ({ method: m.method, amount: m.amount }))
export const toWaiterTotals = (s: CoreSummary): WaiterTotal[] => s.by_waiter.map((w) => ({ waiter: w.waiter || '—', amount: w.amount, orders: w.orders }))
export const toProductTotals = (s: CoreSummary): ProductTotal[] => s.top_products.map((p) => ({ product: p.product, qty: p.qty, amount: p.amount }))
export const toSalesHistory = (i: CoreInsights): SalesHistory => ({
  today: i.today, windowDays: i.window_days, historyDays: i.history_days, daily: i.daily, hourly: i.hourly,
  products: i.products.map((p) => ({ productId: p.product_id, templateId: p.product_id, name: p.name, qty: p.qty, amount: p.amount, prevQty: p.prev_qty })),
})

// Salón
export const toFloors = (floors: CoreFloor[]): Floor[] => floors.filter((f) => f.active).map((f) => ({ id: f.id, name: f.name, tableIds: f.tables.filter((t) => t.active).map((t) => t.id), hasBackground: f.has_background }))
export const toTables = (floors: CoreFloor[]): Table[] => floors.filter((f) => f.active).flatMap((f) => f.tables.filter((t) => t.active).map((t) => ({
  id: t.id, number: t.number, floorId: f.id, seats: t.seats, x: t.x, y: t.y, width: t.width, height: t.height, shape: t.shape, color: t.color || null,
})))
export const toFloorSetting = (f: CoreFloor): FloorSetting => ({ id: f.id, name: f.name, active: f.active, tableCount: f.tables.filter((t) => t.active).length })
export const toTableCall = (c: CoreCall): TableCall => ({ tableId: c.table_id, kind: c.kind, since: c.since })
export const toPaymentMethods = (methods: CoreMethod[]): PaymentMethod[] => methods.map((m) => ({ id: m.id, name: m.name, type: m.type }))
export const toRolePolicy = (p: CoreSettings['role_policy'] | undefined): RolePolicy => (p && 'waiter' in p && 'cashier' in p && 'admin' in p ? (p as unknown as RolePolicy) : DEFAULT_ROLE_POLICY)
export const toSettings = (s: CoreSettings, restaurantId: number, restaurantName: string): Settings => ({
  rolePermissions: toRolePolicy(s.role_policy), configId: restaurantId, configName: restaurantName, waiterCanCharge: s.can_charge, waiterCanEditInventory: s.can_edit_inventory,
  alertLateMinutes: s.restaurant.alert_late_minutes, alertBillMinutes: s.restaurant.alert_bill_minutes, roiHourCost: s.restaurant.roi_hour_cost, roiMinutesPerOrder: s.restaurant.roi_minutes_per_order,
  roiBaselineHoursPer100: s.restaurant.roi_baseline_hours_per_100, roiMonthlyCost: s.restaurant.roi_monthly_cost, roiStartDate: s.restaurant.roi_start_date, tipProductId: null, modules: s.modules ?? null,
})
export const salonOf = (floors: CoreFloor[], methods: CoreMethod[]): Pick<Catalog, 'floors' | 'tables' | 'paymentMethods'> => ({ floors: toFloors(floors), tables: toTables(floors), paymentMethods: toPaymentMethods(methods) })

// El plano. Las imágenes guardadas se muestran por su URL pública; las nuevas viajan en base64 hasta guardarse.
export const toFloorDocument = (p: CorePlan, background: string | null): FloorDocument => ({
  id: p.id, name: p.name, revision: p.revision, tables: p.tables.map((t) => ({ id: t.id, key: t.key, number: t.number, seats: t.seats, zone: t.zone, x: t.x, y: t.y, width: t.width, height: t.height })),
  walls: p.walls, zones: p.zones, decor: (p.decor ?? []) as FloorDocument['decor'],
  images: (p.images ?? []).map((i): PlanImage => ({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, ...(i.data ? { data: i.data } : { src: planImageUrl(p.id, i.id) }) })),
  background, backgroundSize: p.background_size ?? null,
})
export const toCorePlan = (d: FloorDocument, id: number): CorePlan => ({
  id, name: d.name, revision: d.revision, tables: d.tables.map((t) => ({ id: t.id, key: t.key, number: t.number, seats: t.seats, zone: t.zone, x: t.x, y: t.y, width: t.width, height: t.height })),
  walls: d.walls, zones: d.zones, decor: d.decor ?? [], images: (d.images ?? []).map((i) => ({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, ...(i.data ? { data: i.data } : {}) })),
  // `background` en base64 cambia el fondo; null lo quita; sin cambios no se manda.
  background: d.background === undefined ? true : d.background, background_size: d.backgroundSize ?? null,
})
export const backgroundOf = async (floorId: number, revision: number, has: boolean): Promise<string | null> => {
  if (!has) return null
  const response = await fetch(backgroundUrl(floorId, revision))
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
export const toZoneStaff = (now: CoreZoneStaff, plan: CoreZoneStaff | null): ZoneStaff => ({ assignments: now.assignments as Assignments, source: now.source, plan: (plan ?? now).assignments as Assignments })
