import { onCore } from '@/lib/domain/backend'
import * as sales from '@/lib/services/core/sales'
import * as coreTables from '@/lib/services/core/tables'
import { backgroundOf, toFloorSetting, toOrderDetail, toTableCall, toTables } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { OdooError } from '@/lib/services/errors'
import { callKw } from '@/lib/services/odoo'
import { hourLabel, type ServiceAt } from '@/lib/domain/tablesKit'
import type { Table } from '@/lib/types'

// Lo que el comensal pidió desde su móvil: llega al salón por Odoo (addon projectapp_ops), nunca por otro canal.
export type CallKind = 'ordering' | 'assist' | 'bill'
export interface TableCall { tableId: number; kind: CallKind; since: string }

export async function listTableCalls(): Promise<TableCall[]> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await coreTables.listCalls(r)).map(toTableCall) }
  const rows = await callKw<{ id: number; waiter_call: CallKind; waiter_call_at: string | false }[]>('restaurant.table', 'search_read',
    [[['waiter_call', '!=', 'none'], ['active', '=', true]], ['waiter_call', 'waiter_call_at']])
  return rows.map((r) => ({ tableId: r.id, kind: r.waiter_call, since: r.waiter_call_at || '' }))
}

export async function clearTableCall(tableId: number): Promise<void> {
  if (onCore()) { await coreTables.setCall(tableId, 'none'); return }
  await callKw('restaurant.table', 'set_waiter_call', [[tableId], 'none'])
}

// ——— Pisos (engranaje del kit) ———
export interface FloorSetting { id: number; name: string; active: boolean; tableCount: number }
interface RawFloorSetting { id: number; name: string; active: boolean; table_ids: number[] }

export async function listAllFloors(configId: number): Promise<FloorSetting[]> {
  if (onCore()) return (await coreTables.listFloors(configId, true)).map(toFloorSetting)
  const rows = await callKw<RawFloorSetting[]>('restaurant.floor', 'search_read',
    [[['active', 'in', [true, false]], ['pos_config_ids', 'in', [configId]]], ['name', 'active', 'table_ids']], { order: 'sequence asc, id asc' })
  return rows.map((r) => ({ id: r.id, name: r.name, active: r.active, tableCount: r.table_ids.length }))
}

export async function setFloorActive(id: number, active: boolean): Promise<void> {
  if (onCore()) { await coreTables.patchFloor(id, { active }); return }
  await callKw('restaurant.floor', 'write', [[id], { active }])
}

// Mesas activas de un piso (también de pisos inactivos, que load_data no trae): para el editor del plano.
interface RawFloorTable { id: number; table_number: number; seats: number; position_h: number; position_v: number; width: number; height: number; shape: 'square' | 'round'; color: string | false }
export async function listFloorTables(floorId: number): Promise<Table[]> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); const floors = await coreTables.listFloors(r, true); return toTables(floors.filter((f) => f.id === floorId).map((f) => ({ ...f, active: true }))) }
  const rows = await callKw<RawFloorTable[]>('restaurant.table', 'search_read', [[['floor_id', '=', floorId], ['active', '=', true]], ['table_number', 'seats', 'position_h', 'position_v', 'width', 'height', 'shape', 'color']], { order: 'table_number asc' })
  return rows.map((r) => ({ id: r.id, number: r.table_number, floorId, seats: r.seats, x: r.position_h, y: r.position_v, width: r.width, height: r.height, shape: r.shape, color: r.color || null }))
}

// Fondo del plano: base64 sin cabecera data:, como lo guarda Odoo. null si no hay.
export async function getFloorBackground(floorId: number): Promise<string | null> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); const f = (await coreTables.listFloors(r, true)).find((x) => x.id === floorId); return f ? backgroundOf(f.id, f.revision, f.has_background) : null }
  const [f] = await callKw<{ id: number; floor_background_image: string | false }[]>('restaurant.floor', 'read', [[floorId], ['floor_background_image']])
  return f?.floor_background_image || null
}

// ——— Plano (wizard "Agregar plano" y "Editar plano") ———
export interface LayoutTable { id: number | null; number: number; seats: number; x: number; y: number; width: number; height: number }
// background: base64 para cambiarlo, null para quitarlo, undefined para no tocarlo.
export interface FloorInput { id: number | null; name: string; configId: number; background?: string | null }

export async function saveFloorLayout(floor: FloorInput, tables: LayoutTable[], removedIds: number[] = []): Promise<number> {
  if (onCore()) {
    // El asistente «Agregar plano» crea el piso y guarda sus mesas como un plano sencillo (sin paredes ni zonas).
    const floorId = floor.id ?? (await coreTables.createFloor(floor.configId, floor.name)).id
    const plan = await coreTables.readPlan(floorId)
    void removedIds
    await coreTables.savePlan(floorId, { ...plan, name: floor.name, tables: tables.map((t, i) => ({ id: t.id, key: t.id === null ? `n${i}` : `t${t.id}`, number: t.number, seats: t.seats, zone: '', x: t.x, y: t.y, width: t.width, height: t.height })),
      background: floor.background === undefined ? true : floor.background })
    return floorId
  }
  const values: Record<string, unknown> = { name: floor.name }
  if (floor.background !== undefined) values.floor_background_image = floor.background ?? false
  let floorId = floor.id
  if (floorId === null) floorId = await callKw<number>('restaurant.floor', 'create', [{ ...values, pos_config_ids: [[4, floor.configId]] }])
  else await callKw('restaurant.floor', 'write', [[floorId], values])
  const geometry = (t: LayoutTable) => ({ table_number: t.number, seats: t.seats, position_h: t.x, position_v: t.y, width: t.width, height: t.height, shape: 'square', active: true })
  const created = tables.filter((t) => t.id === null).map((t) => ({ ...geometry(t), floor_id: floorId }))
  if (created.length > 0) await callKw('restaurant.table', 'create', [created])
  for (const t of tables) if (t.id !== null) await callKw('restaurant.table', 'write', [[t.id], geometry(t)])
  // Una mesa con pedidos no se puede borrar: se archiva, y así no vuelve al plano.
  if (removedIds.length > 0) {
    try { await callKw('restaurant.table', 'unlink', [removedIds]) } catch { await callKw('restaurant.table', 'write', [removedIds, { active: false }]) }
  }
  return floorId
}

// ——— Cambiar mesa ———
// El destino debe estar libre en Odoo, no solo en esta tablet: otra tablet pudo abrir un pedido hace un segundo.
export async function moveOrder(orderId: number, toTableId: number): Promise<void> {
  if (onCore()) { await sales.patchOrder(orderId, { table_id: toTableId }); return }
  const busy = await callKw<number>('pos.order', 'search_count', [[['table_id', '=', toTableId], ['state', '=', 'draft'], ['id', '!=', orderId]]])
  if (busy > 0) throw new OdooError('La mesa ya tiene un pedido abierto.', 'waiter.table_busy')
  await callKw('pos.order', 'write', [[orderId], { table_id: toTableId }])
}

// ——— Detalle de mesa ———
// El mismo viaje que en Pedidos: esperando cocina, cocinándose, listo en el pase y ya en la mesa.
export type LineStatus = 'unsent' | 'waiting' | 'progress' | 'ready' | 'served'
export interface OrderDetailLine { id: number; uuid: string; productId: number; name: string; qty: number; unitPrice: number; total: number; note: string; additions: string[]; status: LineStatus }
export interface OrderDetail { id: number; tracking: string | null; reference: string; serviceAt: ServiceAt | null; customerName: string; dateOrder: string; total: number; sent: number; served: number; lines: OrderDetailLine[] }

interface RawDetailOrder { id: number; tracking_number: string | false; pos_reference: string; preset_id: [number, string] | false; floating_order_name: string | false; date_order: string; amount_total: number }
interface RawDetailLine { id: number; uuid: string; product_id: [number, string]; full_product_name: string; qty: number; price_unit: number; price_subtotal_incl: number; customer_note: string | false; attribute_value_ids: number[]; course_id: [number, string] | false; waiter_ready_date: string | false; served_date: string | false }
interface RawDetailCourse { id: number; fired: boolean; preparation_date: string | false; ready_date: string | false; served_date: string | false }

export async function getOrderDetail(orderId: number): Promise<OrderDetail> {
  if (onCore()) return toOrderDetail(await sales.getOrder(orderId))
  const [[order], lines, courses] = await Promise.all([
    callKw<RawDetailOrder[]>('pos.order', 'read', [[orderId], ['tracking_number', 'pos_reference', 'preset_id', 'floating_order_name', 'date_order', 'amount_total']]),
    callKw<RawDetailLine[]>('pos.order.line', 'search_read', [[['order_id', '=', orderId]], ['uuid', 'product_id', 'full_product_name', 'qty', 'price_unit', 'price_subtotal_incl', 'customer_note', 'attribute_value_ids', 'course_id', 'waiter_ready_date', 'served_date']], { order: 'id asc' }),
    callKw<RawDetailCourse[]>('restaurant.order.course', 'search_read', [[['order_id', '=', orderId]], ['fired', 'preparation_date', 'ready_date', 'served_date']]),
  ])
  const attrIds = [...new Set(lines.flatMap((l) => l.attribute_value_ids))]
  const [attrs, preset] = await Promise.all([
    attrIds.length > 0 ? callKw<{ id: number; name: string }[]>('product.template.attribute.value', 'read', [attrIds, ['name']]) : Promise.resolve([]),
    order.preset_id ? callKw<{ id: number; service_at: ServiceAt }[]>('pos.preset', 'read', [[order.preset_id[0]], ['service_at']]) : Promise.resolve([]),
  ])
  const attrName = new Map(attrs.map((a) => [a.id, a.name]))
  const fired = new Set(courses.filter((c) => c.fired).map((c) => c.id))
  const readyCourses = new Set(courses.filter((c) => c.fired && c.ready_date).map((c) => c.id))
  const served = new Set(courses.filter((c) => c.fired && c.served_date).map((c) => c.id))
  // La línea manda sobre el curso: el mesero sirve plato a plato.
  const statusOf = (l: RawDetailLine): LineStatus => {
    const course = l.course_id ? l.course_id[0] : null
    if (course === null || !fired.has(course)) return 'unsent'
    if (l.served_date || served.has(course)) return 'served'
    if (l.waiter_ready_date || readyCourses.has(course)) return 'ready'
    return courses.find((c) => c.id === course)?.preparation_date ? 'progress' : 'waiting'
  }
  const mapped: OrderDetailLine[] = lines.map((l) => ({
    id: l.id, uuid: l.uuid, productId: l.product_id[0], name: l.full_product_name, qty: l.qty, unitPrice: l.price_unit, total: l.price_subtotal_incl,
    note: l.customer_note || '', additions: l.attribute_value_ids.map((id) => attrName.get(id) ?? '').filter(Boolean),
    status: statusOf(l),
  }))
  return {
    id: order.id, tracking: order.tracking_number || null, reference: order.pos_reference, serviceAt: preset[0]?.service_at ?? null,
    customerName: order.floating_order_name || '', dateOrder: order.date_order, total: order.amount_total,
    sent: lines.filter((l) => l.course_id && fired.has(l.course_id[0])).length, served: mapped.filter((l) => l.status === 'served').length, lines: mapped,
  }
}

// ——— Reservas (addon projectapp_reservations) ———
// El POS solo lee: crear y editar reservas vive en la pantalla "7 – Reservation" de otro módulo.
export interface TableReservation {
  id: number; name: string; customerName: string; people: number; babyChair: boolean; state: string
  date: string; timeStart: number; timeEnd: number; label: string; timeLabel: string; tableId: number
}
export interface ReservationLine { id: number; productTemplateId: number; name: string; qty: number; unitPrice: number; total: number; note: string }
export interface ReservationDetail extends TableReservation { email: string; phone: string; notes: string; tableNumber: number; tableNumbers: number[]; amountTotal: number; lines: ReservationLine[] }

interface RawCard { id: number; name: string; customer_name: string; people: number; baby_chair: boolean; state: string; date: string; time_start: number; time_end: number }
const card = (r: RawCard, tableId: number): TableReservation => ({
  id: r.id, name: r.name, customerName: r.customer_name, people: r.people, babyChair: r.baby_chair, state: r.state,
  date: r.date, timeStart: r.time_start, timeEnd: r.time_end, label: hourLabel(r.time_start),
  timeLabel: `${hourLabel(r.time_start)} – ${hourLabel(r.time_end)}`, tableId,
})

// Próxima reserva confirmada de cada mesa (la que el plano pinta en tinta). El RPC devuelve las claves como texto.
export async function reservedAtByTable(tableIds: number[], date: string): Promise<Record<number, TableReservation | null>> {
  // Las reservas llegan al sistema propio en T3: ninguna mesa está apartada.
  if (onCore()) { void date; return Object.fromEntries(tableIds.map((id) => [id, null])) }
  if (tableIds.length === 0) return {}
  const raw = await callKw<Record<string, (RawCard & { table_id: number }) | false>>('restaurant.table', 'waiter_reserved_at', [tableIds, date])
  return Object.fromEntries(Object.entries(raw).map(([id, r]) => [Number(id), r ? card(r, Number(id)) : null]))
}

// Reservas vivas de una mesa, de la más próxima a la más lejana ("Lista de reservas" del kit).
export async function listTableReservations(tableId: number): Promise<TableReservation[]> {
  if (onCore()) { void tableId; return [] }
  const rows = await callKw<(RawCard & { table_id: [number, string] })[]>('waiter.reservation', 'search_read',
    [[['table_ids', 'in', [tableId]], ['state', 'in', ['confirmed', 'seated']]], ['name', 'customer_name', 'people', 'baby_chair', 'state', 'date', 'time_start', 'time_end', 'table_id']],
    { order: 'date asc, time_start asc, id asc' })
  return rows.map((r) => card(r, tableId)) // la mesa consultada, que en un grupo puede no ser la principal
}

interface RawDetail extends RawCard {
  customer_email: string; customer_phone: string; notes: string; amount_total: number
  table: { id: number; table_number: number }
  tables?: { id: number; table_number: number }[]
  lines: { id: number; product_tmpl_id: number; name: string; qty: number; price_unit: number; price_subtotal_incl: number; note: string }[]
}
// Detalle con el pre-pedido ("Detalle de reserva" del kit): lo arma el addon en waiter_detail().
export async function getReservationDetail(id: number): Promise<ReservationDetail> {
  if (onCore()) { void id; throw new Error('Las reservas llegan al sistema propio en la fase T3.') }
  const [raw] = await callKw<RawDetail[]>('waiter.reservation', 'waiter_detail', [[id]])
  return {
    ...card(raw, raw.table.id), email: raw.customer_email || '', phone: raw.customer_phone || '', notes: raw.notes || '',
    tableNumber: raw.table.table_number, tableNumbers: raw.tables?.length ? raw.tables.map((t) => t.table_number) : [raw.table.table_number], amountTotal: raw.amount_total || 0,
    lines: (raw.lines ?? []).map((l) => ({ id: l.id, productTemplateId: l.product_tmpl_id, name: l.name, qty: l.qty, unitPrice: l.price_unit, total: l.price_subtotal_incl, note: l.note || '' })),
  }
}
