import type { TableState, TableView } from '@/lib/domain/tableState'

export type TableTemplate = 'small' | 'largeH' | 'largeV'
export type KitTableState = 'available' | 'unavailable' | 'reserved'
export type FloorType = 'indoor' | 'outdoor'
export type OrderPrefix = 'DI' | 'TA' | 'DE'
export type ServiceAt = 'table' | 'counter' | 'delivery'
export interface Rect { x: number; y: number; width: number; height: number }
export interface Chairs { top: number; bottom: number; left: number; right: number }

export const GRID = 40
// Aire mínimo entre mesas: las sillas se dibujan fuera de la caja.
export const GAP = 24
export const PLAN_PADDING = 60
export const TEMPLATES: Record<TableTemplate, { width: number; height: number; seats: number }> = {
  small: { width: 120, height: 120, seats: 4 }, largeH: { width: 240, height: 120, seats: 6 }, largeV: { width: 120, height: 240, seats: 8 },
}
const CHAIRS: Record<TableTemplate, Chairs> = { small: { top: 1, bottom: 1, left: 1, right: 1 }, largeH: { top: 3, bottom: 3, left: 1, right: 1 }, largeV: { top: 1, bottom: 1, left: 3, right: 3 } }
const OUTDOOR_SUFFIX = ' · Exterior'

export function templateFor(t: { width: number; height: number }): TableTemplate {
  if (t.width > t.height * 1.3) return 'largeH'
  if (t.height > t.width * 1.3) return 'largeV'
  return 'small'
}
export const chairsFor = (template: TableTemplate): Chairs => CHAIRS[template]

export const snap = (v: number, grid = GRID): number => Math.max(0, Math.round(v / grid) * grid)
export const rotated = <T extends Rect>(t: T): T => ({ ...t, width: t.height, height: t.width })

export function overlaps(a: Rect, b: Rect, gap = GAP): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
}
export function canPlace<K>(rect: Rect, others: (Rect & { key: K })[], selfKey: K | null = null): boolean {
  return others.every((o) => (selfKey !== null && o.key === selfKey) || !overlaps(rect, o))
}

// El kit solo distingue disponible / no disponible / reservada. Una mesa con pedido abierto sigue siendo "no
// disponible" aunque tenga reserva: el naranja del pedido manda sobre la tinta de la reserva.
export const kitState = (state: TableState, reserved = false): KitTableState =>
  state !== 'free' ? 'unavailable' : reserved ? 'reserved' : 'available'

export function hourLabel(value: number): string {
  const total = Math.round((value || 0) * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

// Prefijo del kit por tipo de pedido (pos.preset.service_at). Sin preset, un pedido con mesa es "en mesa".
export const orderPrefix = (serviceAt: ServiceAt | null): OrderPrefix => (serviceAt === 'counter' ? 'TA' : serviceAt === 'delivery' ? 'DE' : 'DI')
export const orderCode = (prefix: OrderPrefix, tracking: string | null, id: number): string => `${prefix}${tracking ?? id}`

export const progressPercent = (served: number, sent: number): number => (sent === 0 ? 0 : Math.round((served / sent) * 100))

export function floorName(numberOrName: string, type: FloorType): string {
  const base = /^\d+$/.test(numberOrName.trim()) ? `Piso ${numberOrName.trim()}` : numberOrName.trim()
  return type === 'outdoor' ? base + OUTDOOR_SUFFIX : base
}
export function parseFloorName(name: string): { label: string; type: FloorType } {
  return name.endsWith(OUTDOOR_SUFFIX) ? { label: name.slice(0, -OUTDOOR_SUFFIX.length), type: 'outdoor' } : { label: name, type: 'indoor' }
}
export function floorNumber(name: string): number | null {
  const m = parseFloorName(name).label.match(/\d+/)
  return m ? Number(m[0]) : null
}
export const nextFloorNumber = (floors: { name: string }[]): number => Math.max(0, ...floors.map((f) => floorNumber(f.name) ?? 0)) + 1

export function layoutSummary(tables: Rect[]): { large: number; small: number; total: number } {
  const small = tables.filter((t) => templateFor(t) === 'small').length
  return { large: tables.length - small, small, total: tables.length }
}
export function planSize(tables: Rect[]): { width: number; height: number } {
  if (tables.length === 0) return { width: 0, height: 0 }
  return { width: Math.max(...tables.map((t) => t.x + t.width)) + PLAN_PADDING, height: Math.max(...tables.map((t) => t.y + t.height)) + PLAN_PADDING }
}

// restaurant.table solo guarda table_number: de "Mesa A12" se toma el 12 y se avisa que el nombre no se conserva.
export function parseTableName(name: string): { number: number | null; exact: boolean } {
  const trimmed = name.trim()
  if (/^\d+$/.test(trimmed)) return { number: Number(trimmed), exact: true }
  const m = trimmed.match(/\d+/)
  return { number: m ? Number(m[0]) : null, exact: false }
}

export function remainingByTemplate(views: TableView[]): { large: number; small: number } {
  const free = views.filter((v) => v.state === 'free')
  const small = free.filter((v) => templateFor(v.table) === 'small').length
  return { large: free.length - small, small }
}
