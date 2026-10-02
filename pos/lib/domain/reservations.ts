// Reglas puras de las reservas del kit (7 – Reservation). El servidor manda: solapes, franjas y estados
// los calcula el servidor. Aquí solo va lo que necesita pintar la grilla y validar el paso 1.

export const SLOT_HOURS = 0.5
export const RESERVATION_STATES = ['confirmed', 'seated', 'no_show', 'cancelled'] as const
export type ReservationState = (typeof RESERVATION_STATES)[number]
export const ACTIVE_STATES: ReservationState[] = ['confirmed', 'seated']

// `closed`: media hora fuera del horario de reservas; solo llega en la línea de tiempo, que necesita columnas seguidas.
// `soon`: aún no pasó, pero ya no cumple la antelación mínima del horario de reservas: tampoco se puede elegir.
export interface Slot { time: number; label: string; past: boolean; closed?: boolean; soon?: boolean }
export const slotTaken = (s: Slot) => s.past || !!s.soon
export interface ReservationCard {
  id: number; name: string; customerName: string; people: number; babyChair: boolean; state: ReservationState
  date: string; timeStart: number; timeEnd: number; label: string; timeLabel: string
  // `tableId` es la mesa principal (ahí va el pre-pedido); `tableNumbers` son todas las que aparta, la principal primero.
  tableId: number; tableNumber: number; tableNumbers: number[]; tableIds: number[]; floorId: number; floorName: string
  depositState: DepositState // 'pending' = tiene anticipo sin pagar: el tablero de Inicio lo avisa
  prepMinutes: string // margen con que se aparta la mesa; hace falta para recalcular qué mesas están libres al editarla
}
export interface TimelineTable { id: number; tableNumber: number; name: string; seats: number; floorId: number; reservations: ReservationCard[] }

/** Hora decimal (10.5) al reloj del kit ("10:30"). */
export const hourLabel = (hour: number): string => {
  const h = Math.floor(hour)
  return `${String(h).padStart(2, '0')}:${String(Math.round((hour - h) * 60)).padStart(2, '0')}`
}

/** Columna y ancho de una tarjeta en la grilla mesa × hora: el ancho es la duración, como en el kit. */
export function cardPlacement(card: { timeStart: number; timeEnd: number }, slots: Slot[]): { index: number; span: number } | null {
  if (slots.length === 0) return null
  const first = slots[0].time
  const index = Math.round((card.timeStart - first) / SLOT_HOURS)
  if (index < 0 || index >= slots.length) return null
  const span = Math.max(1, Math.min(Math.round((card.timeEnd - card.timeStart) / SLOT_HOURS), slots.length - index))
  return { index, span }
}

// Reservas que quedan fuera de la vista al desplazar la línea de tiempo en horizontal, para los «globitos» de los bordes
// (como la flecha que en un videojuego señala algo fuera de pantalla). `view` es el tramo visible de la zona de horas,
// en píxeles desde la primera franja. Una reserva de grupo aparece en la fila de cada mesa: se cuenta una vez.
// `nearest` es la más cercana al borde —a la que lleva el globito— y `x` dónde empieza.
export interface OffscreenSide { count: number; nearest: ReservationCard; x: number }
export function offscreenReservations(tables: TimelineTable[], slots: Slot[], view: { start: number; end: number }, slotWidth: number, margin = 24): { left: OffscreenSide | null; right: OffscreenSide | null } {
  const seen = new Map<number, { card: ReservationCard; from: number; to: number }>()
  for (const table of tables) for (const card of table.reservations) {
    const place = cardPlacement(card, slots)
    if (place && !seen.has(card.id)) seen.set(card.id, { card, from: place.index * slotWidth, to: (place.index + place.span) * slotWidth })
  }
  const all = [...seen.values()]
  const before = all.filter((r) => r.to <= view.start + margin).sort((a, b) => b.to - a.to)
  const after = all.filter((r) => r.from >= view.end - margin).sort((a, b) => a.from - b.from)
  const side = (rows: typeof all): OffscreenSide | null => (rows.length ? { count: rows.length, nearest: rows[0].card, x: rows[0].from } : null)
  return { left: side(before), right: side(after) }
}

// Cuánto antes de la hora reservada se aparta la mesa. Es tiempo para prepararla, no porque el comensal
// esté ya en el local: fuera de esa ventana la mesa se usa con normalidad.
export const PREP_CHOICES = ['0', '15', '30', '60', '120'] as const
export type PrepMinutes = (typeof PREP_CHOICES)[number]

export interface ReservationDraft {
  customerName: string; customerEmail: string; customerPhone: string
  people: number; babyChair: boolean; notes: string
  // Mesas elegidas, en el orden en que se tocaron: la primera es la principal. Un grupo grande junta varias.
  date: string | null; timeStart: number | null; tableIds: number[]; prepMinutes: PrepMinutes
  // Costo de la reserva (anticipo). Viene activo: lo normal es cobrarlo; quitarlo es la excepción y se hace a propósito.
  depositEnabled: boolean; depositAmount: number | null
}

export const emptyDraft = (): ReservationDraft => ({
  customerName: '', customerEmail: '', customerPhone: '', people: 2, babyChair: false, notes: '',
  date: null, timeStart: null, tableIds: [], prepMinutes: '30', depositEnabled: true, depositAmount: null,
})

export const toggleTable = (ids: number[], id: number): number[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
export const seatsOf = (tables: { id: number; seats: number }[], ids: number[]): number => tables.filter((t) => ids.includes(t.id)).reduce((sum, t) => sum + t.seats, 0)
// Puestos que faltan para sentar al grupo con las mesas elegidas (0 = ya caben).
export const missingSeats = (tables: { id: number; seats: number }[], ids: number[], people: number): number => Math.max(0, people - seatsOf(tables, ids))
// «4» · «4 y 7» · «4, 7 y 9»
export const tablesLabel = (numbers: (number | string)[]): string => (numbers.length < 2 ? String(numbers[0] ?? '—') : `${numbers.slice(0, -1).join(', ')} y ${numbers[numbers.length - 1]}`)

// "20:00" con 30 minutos de margen → "19:30": la hora desde la que el plano deja de ofrecer la mesa.
export function holdLabel(timeStart: number, prep: PrepMinutes): string {
  const hold = Math.max(0, timeStart - Number(prep) / 60)
  const total = Math.round(hold * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** El paso 1 pide nombre, personas y cuándo. El correo, si se escribe, debe parecer un correo. */
export function infoStepReady(draft: ReservationDraft): boolean {
  const emailOk = draft.customerEmail.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.customerEmail.trim())
  return draft.customerName.trim().length > 0 && draft.people > 0 && draft.date !== null && draft.timeStart !== null && emailOk
}

/** Días del mes para el calendario del modal, alineados a lunes y con los huecos del principio. */
export function monthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(year, month + 1, 0).getDate()
  return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
}

export const isoDate = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

export type DepositState = 'none' | 'pending' | 'paid'
export const MAX_DEPOSIT = 50_000_000
/** Lo que se envía al servidor: 0 si la reserva no tiene costo. */
export const depositOf = (draft: Pick<ReservationDraft, 'depositEnabled' | 'depositAmount'>): number => (draft.depositEnabled ? draft.depositAmount ?? 0 : 0)
/** El resumen deja crear la reserva si el costo está quitado a propósito o tiene un valor válido. Nunca un costo activo en cero. */
export function depositReady(draft: Pick<ReservationDraft, 'depositEnabled' | 'depositAmount'>): boolean {
  if (!draft.depositEnabled) return true
  const amount = draft.depositAmount
  return amount !== null && Number.isFinite(amount) && amount > 0 && amount <= MAX_DEPOSIT
}
/** Mensaje listo para WhatsApp o correo. */
export function depositMessage(r: { customerName: string; date: string; label: string; people: number; amount: number }, restaurant: string, link: string, format: (n: number) => string): string {
  const day = new Date(`${r.date}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  return `Hola ${r.customerName.split(' ')[0]}, tu reserva en ${restaurant} para ${r.people} ${r.people === 1 ? 'persona' : 'personas'} el ${day} a las ${r.label} está apartada. Para confirmarla, paga el anticipo de ${format(r.amount)} aquí: ${link}`
}
/** wa.me necesita el número con indicativo y sin signos. Un celular colombiano de 10 dígitos recibe el 57. */
export function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  return digits.length >= 11 && digits.length <= 15 ? digits : null
}
