import type { DepositState, ReservationCard, ReservationState, Slot, TimelineTable } from '@/lib/domain/reservations'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreRes from '@/lib/services/core/reservations'

interface RawCard {
  id: number; name: string; customer_name: string; people: number; baby_chair: boolean; state: ReservationState
  date: string; time_start: number; time_end: number; label: string; time_label: string
  table_id: number; table_number: number; table_numbers?: number[]; table_ids?: number[]; prep_minutes?: string; deposit_state?: DepositState; floor_id: number; floor_name: string
}
interface RawTable { id: number; table_number: number; name: string; seats: number; floor_id: number; floor_name: string; shape: string }
interface RawTimeline { date: string; slots: Slot[]; floors: { id: number; name: string }[]; tables: (RawTable & { reservations: RawCard[] })[] }
interface RawLine { id: number; product_id: number; product_tmpl_id: number; name: string; qty: number; price_unit: number; price_subtotal_incl: number; note: string }
interface RawDetail extends RawCard {
  customer_email: string; customer_phone: string; notes: string; amount_total: number; lines: RawLine[]
  deposit_amount: number; deposit_state: DepositState; deposit_reference: string; deposit_paid_at: string; pay_token: string; pay_url: string; restaurant_name: string
}

export interface AvailableTable extends Omit<RawTable, 'table_number' | 'floor_id' | 'floor_name'> {
  tableNumber: number; floorId: number; floorName: string
  status: 'available' | 'reserved' | 'unavailable'; available: boolean; reservedAt: string | false
}
export interface ReservationLine { id: number; productId: number; productTmplId: number; name: string; qty: number; priceUnit: number; total: number; note: string }
export interface ReservationDetail extends ReservationCard {
  customerEmail: string; customerPhone: string; notes: string; amountTotal: number; lines: ReservationLine[]
  depositAmount: number; depositState: DepositState; depositReference: string; depositPaidAt: string; payToken: string; payUrl: string; restaurantName: string
}
export interface Timeline { date: string; slots: Slot[]; floors: { id: number; name: string }[]; tables: TimelineTable[] }
export interface NewReservation {
  customerName: string; customerEmail: string; customerPhone: string; people: number; babyChair: boolean
  notes: string; date: string; timeStart: number; tableIds: number[]; configId: number; prepMinutes: string; depositAmount: number
}
export interface PreorderLine { productId: number; qty: number; note?: string }

const card = (r: RawCard): ReservationCard => ({
  id: r.id, name: r.name, customerName: r.customer_name, people: r.people, babyChair: r.baby_chair, state: r.state,
  date: r.date, timeStart: r.time_start, timeEnd: r.time_end, label: r.label, timeLabel: r.time_label,
  tableId: r.table_id, tableNumber: r.table_number, tableNumbers: r.table_numbers?.length ? r.table_numbers : [r.table_number],
  tableIds: r.table_ids?.length ? r.table_ids : [r.table_id], prepMinutes: r.prep_minutes ?? '30', depositState: r.deposit_state ?? 'none', floorId: r.floor_id, floorName: r.floor_name,
})

const detail = (r: RawDetail): ReservationDetail => ({
  ...card(r), customerEmail: r.customer_email, customerPhone: r.customer_phone, notes: r.notes, amountTotal: r.amount_total,
  depositAmount: r.deposit_amount ?? 0, depositState: r.deposit_state ?? 'none', depositReference: r.deposit_reference ?? '', depositPaidAt: r.deposit_paid_at ?? '', payToken: r.pay_token ?? '', payUrl: r.pay_url ?? '', restaurantName: r.restaurant_name ?? '',
  lines: r.lines.map((l) => ({ id: l.id, productId: l.product_id, productTmplId: l.product_tmpl_id, name: l.name, qty: l.qty, priceUnit: l.price_unit, total: l.price_subtotal_incl, note: l.note })),
})

export async function getTimeline(configId: number, date: string, floorId?: number | null): Promise<Timeline> {
  const raw = await coreRes.timeline<RawTimeline>(configId, date, floorId)
  return { date: raw.date, slots: raw.slots, floors: raw.floors, tables: raw.tables.map((t) => ({ id: t.id, tableNumber: t.table_number, name: t.name, seats: t.seats, floorId: t.floor_id, reservations: t.reservations.map(card) })) }
}

export const getSlots = (configId: number, date: string): Promise<Slot[]> => (coreRes.slots<Slot[]>(configId, date))

// `excludeId`: la reserva que se está editando; sus propias mesas no le cuentan como ocupadas.
export async function getAvailableTables(configId: number, date: string, timeStart: number, people: number, prepMinutes: string = '30', excludeId: number | null = null): Promise<AvailableTable[]> {
  type Row = RawTable & { status: AvailableTable['status']; available: boolean; reserved_at: string | false }
  const raw = await coreRes.tables<Row[]>(configId, date, timeStart, people, prepMinutes, excludeId)
  return raw.map((t) => ({ id: t.id, tableNumber: t.table_number, name: t.name, seats: t.seats, floorId: t.floor_id, floorName: t.floor_name, shape: t.shape, status: t.status, available: t.available, reservedAt: t.reserved_at }))
}

// Cambia las mesas de una reserva confirmada; la primera queda como principal y el pre-pedido la sigue.
export async function setReservationTables(id: number, tableIds: number[]): Promise<ReservationDetail> {
  return detail(await coreRes.setTables<RawDetail>(id, tableIds))
}

export async function createReservation(input: NewReservation, lines: PreorderLine[]): Promise<ReservationDetail> {
  const vals = {
    customer_name: input.customerName, customer_email: input.customerEmail || false, customer_phone: input.customerPhone || false,
    people: input.people, baby_chair: input.babyChair, notes: input.notes || false,
    date: input.date, time_start: input.timeStart, table_ids: input.tableIds, config_id: input.configId,
    prep_minutes: input.prepMinutes, deposit_amount: input.depositAmount,
  }
  const preorder = lines.map((l) => ({ product_id: l.productId, qty: l.qty, note: l.note ?? '' }))
  const { config_id, ...rest } = vals
  return detail(await coreRes.create<RawDetail>({ ...rest, restaurant_id: config_id, customer_email: input.customerEmail, customer_phone: input.customerPhone, notes: input.notes, lines: preorder }))
}

export async function getReservation(id: number): Promise<ReservationDetail | null> {
  try { return detail(await coreRes.get<RawDetail>(id)) } catch { return null }
}

/** Reservas activas de una mesa, para el modal "Lista de reservas" del plano. */
export async function listByTable(tableId: number): Promise<ReservationCard[]> {
  return (await coreRes.byTable<RawDetail>(tableId)).map(card)
}

/** Cambia o quita (0) el costo de una reserva cuyo anticipo aún no se ha pagado. */
export const setDeposit = async (id: number, amount: number): Promise<ReservationDetail> => detail(await coreRes.setDeposit<RawDetail>(id, amount))
/** El cliente pagó por fuera del enlace (efectivo, transferencia): se registra a mano. */
export const markDepositPaid = async (id: number, reference?: string): Promise<ReservationDetail> => detail(await coreRes.depositPaid<RawDetail>(id, reference ?? ''))

const ACTIONS = { seated: 'action_seated', no_show: 'action_no_show', cancelled: 'action_cancel' } as const
const CORE_ACTIONS = { seated: 'seat', no_show: 'no-show', cancelled: 'cancel' } as const
export const setReservationState = (id: number, state: keyof typeof ACTIONS): Promise<boolean> => (coreRes.transition(id, CORE_ACTIONS[state]).then(() => true))

/** Próxima reserva por mesa del día: la usa el plano para pintar "Reservada · 17:00". */
export async function reservedAtByTable(date: string): Promise<Record<string, { label: string } | false>> {
  // En el sistema propio, la próxima reserva de cada mesa sale de la línea de tiempo del día.
  const r = currentRestaurantId()
  if (r === null) return {}
  const raw = await coreRes.timeline<RawTimeline>(r, date)
  return Object.fromEntries(raw.tables.map((t) => {
    const next = t.reservations.find((x) => x.state === 'confirmed')
    return [String(t.id), next ? { label: next.label } : false]
  }))
}
