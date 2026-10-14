import { hourLabel, type ServiceAt } from '@/lib/domain/tablesKit'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreRes from '@/lib/services/core/reservations'
import * as sales from '@/lib/services/core/sales'
import { backgroundOf, toFloorSetting, toOrderDetail, toTableCall, toTables } from '@/lib/services/core/salesBridge'
import * as coreTables from '@/lib/services/core/tables'
import type { Table } from '@/lib/types'

export type CallKind = 'ordering' | 'assist' | 'bill'
export interface TableCall { tableId: number; kind: CallKind; since: string }

export async function listTableCalls(): Promise<TableCall[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await coreTables.listCalls(r)).map(toTableCall)
}

export async function clearTableCall(tableId: number): Promise<void> {
  await coreTables.setCall(tableId, 'none')
  return
}

// ——— Pisos (engranaje del kit) ———
export interface FloorSetting { id: number; name: string; active: boolean; tableCount: number }

export async function listAllFloors(configId: number): Promise<FloorSetting[]> {
  return (await coreTables.listFloors(configId, true)).map(toFloorSetting)
}

export async function setFloorActive(id: number, active: boolean): Promise<void> {
  await coreTables.patchFloor(id, { active })
  return
}
export async function listFloorTables(floorId: number): Promise<Table[]> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const floors = await coreTables.listFloors(r, true)
  return toTables(floors.filter((f) => f.id === floorId).map((f) => ({ ...f, active: true })))
}

export async function getFloorBackground(floorId: number): Promise<string | null> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const f = (await coreTables.listFloors(r, true)).find((x) => x.id === floorId)
  return f ? backgroundOf(f.id, f.revision, f.has_background) : null
}

// ——— Plano (wizard "Agregar plano" y "Editar plano") ———
export interface LayoutTable { id: number | null; number: number; seats: number; x: number; y: number; width: number; height: number }
// background: base64 para cambiarlo, null para quitarlo, undefined para no tocarlo.
export interface FloorInput { id: number | null; name: string; configId: number; background?: string | null }

export async function saveFloorLayout(floor: FloorInput, tables: LayoutTable[], removedIds: number[] = []): Promise<number> {
  // El asistente «Agregar plano» crea el piso y guarda sus mesas como un plano sencillo (sin paredes ni zonas).
  const floorId = floor.id ?? (await coreTables.createFloor(floor.configId, floor.name)).id
  const plan = await coreTables.readPlan(floorId)
  void removedIds
  await coreTables.savePlan(floorId, {
    ...plan, name: floor.name, tables: tables.map((t, i) => ({ id: t.id, key: t.id === null ? `n${i}` : `t${t.id}`, number: t.number, seats: t.seats, zone: '', x: t.x, y: t.y, width: t.width, height: t.height })),
    background: floor.background === undefined ? true : floor.background
  })
  return floorId
}

export async function moveOrder(orderId: number, toTableId: number): Promise<void> {
  await sales.patchOrder(orderId, { table_id: toTableId })
  return
}

// ——— Detalle de mesa ———
// El mismo viaje que en Pedidos: esperando cocina, cocinándose, listo en el pase y ya en la mesa.
export type LineStatus = 'unsent' | 'waiting' | 'progress' | 'ready' | 'served'
export interface OrderDetailLine { id: number; uuid: string; productId: number; name: string; qty: number; unitPrice: number; total: number; note: string; additions: string[]; status: LineStatus }
export interface OrderDetail { id: number; tracking: string | null; reference: string; serviceAt: ServiceAt | null; customerName: string; dateOrder: string; total: number; sent: number; served: number; lines: OrderDetailLine[] }

export async function getOrderDetail(orderId: number): Promise<OrderDetail> {
  return toOrderDetail(await sales.getOrder(orderId))
}

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
  const r = currentRestaurantId()
  if (r === null) return {}
  const raw = await coreRes.timeline<{ tables: { id: number; reservations: RawCard[] }[] }>(r, date)
  return Object.fromEntries(tableIds.map((id) => {
    const t = raw.tables.find((x) => x.id === id)
    const next = t?.reservations.find((x) => x.state === 'confirmed')
    return [id, next ? card(next, id) : null]
  }))
}

// Reservas vivas de una mesa, de la más próxima a la más lejana ("Lista de reservas" del kit).
export async function listTableReservations(tableId: number): Promise<TableReservation[]> {
  return (await coreRes.byTable<RawCard>(tableId)).map((x) => card(x, tableId))
}

interface RawDetail extends RawCard {
  customer_email: string; customer_phone: string; notes: string; amount_total: number
  table: { id: number; table_number: number }
  tables?: { id: number; table_number: number }[]
  lines: { id: number; product_tmpl_id: number; name: string; qty: number; price_unit: number; price_subtotal_incl: number; note: string }[]
}
export async function getReservationDetail(id: number): Promise<ReservationDetail> {
  const raw = await coreRes.get<RawDetail & { table_id?: number; table_number?: number; table_numbers?: number[] }>(id)
  const table = raw.table ?? { id: raw.table_id ?? 0, table_number: raw.table_number ?? 0 }
  return {
    ...card(raw, table.id), email: raw.customer_email || '', phone: raw.customer_phone || '', notes: raw.notes || '', tableNumber: table.table_number, tableNumbers: raw.table_numbers?.length ? raw.table_numbers : [table.table_number], amountTotal: raw.amount_total || 0,
    lines: (raw.lines ?? []).map((l) => ({ id: l.id, productTemplateId: l.product_tmpl_id, name: l.name, qty: l.qty, unitPrice: l.price_unit, total: l.price_subtotal_incl, note: l.note || '' }))
  }
}
