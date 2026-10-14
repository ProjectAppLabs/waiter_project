import { hourLabel } from '@/lib/domain/reservations'

// Horario de reservas, al estilo cal.com: cada día de la semana tiene cero o más franjas (cero = cerrado) y una fecha
// especial reemplaza por completo al día que le tocaría. Las horas van en horas decimales (12.5 = 12:30), en medias
// horas. El servidor  valida lo mismo: aquí se valida para avisar antes.
export { hourLabel }
export type Range = [number, number]
export type DayKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' // 0 = lunes … 6 = domingo
export interface DateOverride { date: string; ranges: Range[]; note: string }
// Reglas de antelación. `minNotice`: minutos mínimos entre ahora y la hora reservada. `maxDays`: hasta cuántos días
// hacia adelante se reserva. 0 = sin límite. El servidor las hace cumplir; aquí solo se editan y se anticipan.
export interface BookingRules { minNotice: number; maxDays: number }
export interface Schedule { weekly: Record<DayKey, Range[]>; overrides: DateOverride[]; rules: BookingRules }
export const NOTICE_CHOICES = [0, 30, 60, 120, 180, 360, 720, 1440, 2880] as const
export const WINDOW_CHOICES = [0, 7, 15, 30, 60, 90, 180, 365] as const

// 90 → «1 h 30 min»; 1440 → «1 día».
export function noticeLabel(minutes: number): string {
  const days = Math.floor(minutes / 1440), hours = Math.floor((minutes % 1440) / 60), mins = minutes % 60
  return [days ? `${days} ${days === 1 ? 'día' : 'días'}` : '', hours ? `${hours} h` : '', mins ? `${mins} min` : ''].filter(Boolean).join(' ')
}
// Último día que se puede reservar según la ventana, o null si no hay límite. Fechas ISO, que se comparan como texto.
export function lastBookableDay(rules: BookingRules, today: string): string | null {
  if (!rules.maxDays) return null
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() + rules.maxDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DAY_KEYS: DayKey[] = ['0', '1', '2', '3', '4', '5', '6']
export const MAX_RANGES_PER_DAY = 4
export const MAX_NOTE = 80
const LUNCH: Range = [12, 15]

// 00:00 … 24:00 cada media hora, para los selectores de inicio y fin.
export const TIME_OPTIONS: number[] = Array.from({ length: 49 }, (_, i) => i / 2)

export const dayKeyOf = (iso: string): DayKey => String((new Date(`${iso}T00:00:00`).getDay() + 6) % 7) as DayKey

export function rangesFor(schedule: Schedule, iso: string): Range[] {
  return schedule.overrides.find((o) => o.date === iso)?.ranges ?? schedule.weekly[dayKeyOf(iso)]
}
export const isClosedOn = (schedule: Schedule, iso: string) => rangesFor(schedule, iso).length === 0

export type RangeError = 'order' | 'overlap' | 'tooMany'
// Primer problema de las franjas de un día, o null. `order`: una franja termina antes de empezar.
export function rangesError(ranges: Range[]): RangeError | null {
  if (ranges.length > MAX_RANGES_PER_DAY) return 'tooMany'
  if (ranges.some(([a, b]) => a >= b)) return 'order'
  return ranges.some(([a], i) => i > 0 && a < ranges[i - 1][1]) ? 'overlap' : null
}

// Franja nueva sugerida: almuerzo si el día está vacío; si no, una hora después del último cierre, hasta tres horas.
// null cuando ya no cabe otra (día lleno o cierre muy tarde).
export function suggestRange(ranges: Range[]): Range | null {
  if (ranges.length >= MAX_RANGES_PER_DAY) return null
  if (!ranges.length) return LUNCH
  const start = ranges[ranges.length - 1][1] + 1
  return start >= 24 ? null : [start, Math.min(24, start + 3)]
}

const copyRanges = (ranges: Range[]): Range[] => ranges.map(([a, b]) => [a, b])

export function setDay(schedule: Schedule, day: DayKey, ranges: Range[]): Schedule {
  return { ...schedule, weekly: { ...schedule.weekly, [day]: ranges } }
}
export function copyDay(schedule: Schedule, from: DayKey, to: DayKey[]): Schedule {
  return { ...schedule, weekly: { ...schedule.weekly, ...Object.fromEntries(to.map((d) => [d, copyRanges(schedule.weekly[from])])) } }
}
// Una fecha especial por día: guardar otra vez la misma fecha la reemplaza. Quedan ordenadas.
export function upsertOverride(schedule: Schedule, override: DateOverride): Schedule {
  const rest = schedule.overrides.filter((o) => o.date !== override.date)
  return { ...schedule, overrides: [...rest, override].sort((a, b) => (a.date < b.date ? -1 : 1)) }
}
export const removeOverride = (schedule: Schedule, date: string): Schedule => ({ ...schedule, overrides: schedule.overrides.filter((o) => o.date !== date) })

// Qué impide guardar: el primer día de la semana o fecha especial con franjas imposibles.
export function scheduleError(schedule: Schedule): { where: DayKey | string; error: RangeError } | null {
  for (const day of DAY_KEYS) { const error = rangesError(schedule.weekly[day]); if (error) return { where: day, error } }
  for (const o of schedule.overrides) { const error = rangesError(o.ranges); if (error) return { where: o.date, error } }
  return null
}

export const sameSchedule = (a: Schedule, b: Schedule) => JSON.stringify(a) === JSON.stringify(b)

// Tramo que dibuja la vista previa de la semana: de la primera apertura al último cierre, con una hora de aire.
export function weekSpan(schedule: Schedule): [number, number] {
  const all = DAY_KEYS.flatMap((d) => schedule.weekly[d])
  if (!all.length) return [8, 22]
  return [Math.max(0, Math.floor(Math.min(...all.map((r) => r[0]))) - 1), Math.min(24, Math.ceil(Math.max(...all.map((r) => r[1]))) + 1)]
}

export const totalHours = (ranges: Range[]) => ranges.reduce((sum, [a, b]) => sum + (b - a), 0)
