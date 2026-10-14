// Periodos del módulo de Ventas. Un rango son días locales inclusivos (ISO); el turno es el filtro de siempre, útil para
// cuadrar la caja. «Esta semana» va de lunes a hoy y «este mes» del 1 a hoy: son periodos en curso, no ventanas móviles.
export type SalesPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'custom' | 'shift'
export const SALES_PERIODS: SalesPeriod[] = ['today', 'yesterday', 'week', 'month', 'lastMonth', 'custom', 'shift']
export interface DayRange { from: string; to: string }
export type SalesScope = { kind: 'shift'; sessionId: number } | ({ kind: 'range' } & DayRange)

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const at = (day: string) => new Date(`${day}T00:00:00`)
const shift = (day: string, days: number) => { const d = at(day); d.setDate(d.getDate() + days); return iso(d) }

export function rangeFor(period: Exclude<SalesPeriod, 'custom' | 'shift'>, today: string): DayRange {
  const d = at(today)
  switch (period) {
    case 'today': return { from: today, to: today }
    case 'yesterday': return { from: shift(today, -1), to: shift(today, -1) }
    case 'week': return { from: shift(today, -((d.getDay() + 6) % 7)), to: today }
    case 'month': return { from: iso(new Date(d.getFullYear(), d.getMonth(), 1)), to: today }
    case 'lastMonth': return { from: iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)), to: iso(new Date(d.getFullYear(), d.getMonth(), 0)) }
  }
}

export const MAX_RANGE_DAYS = 366
export function validRange(r: DayRange): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.from) || !/^\d{4}-\d{2}-\d{2}$/.test(r.to) || r.from > r.to) return false
  return Math.round((at(r.to).getTime() - at(r.from).getTime()) / 86_400_000) < MAX_RANGE_DAYS
}

export function utcBounds(r: DayRange): [string, string] {
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')
  return [fmt(at(r.from)), fmt(at(shift(r.to, 1)))]
}
