import { serverTime } from '@/lib/domain/time'
import type { PaidOrder } from '@/lib/services/roi'
import type { Settings } from '@/lib/types'

export type Period = 'week' | 'month' | 'year'
export interface Range { start: Date; end: Date; label: string; days: number }
export interface RoiMetrics {
  total: number; autonomous: number; autonomousRevenue: number; hoursSaved: number; laborSaving: number; hoursPer100: number
  aiSales: number; cost: number; net: number; roi: number
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Rango del periodo que termina "back" periodos antes del actual (0 = el actual). Semanas de lunes a domingo.
export function periodRange(period: Period, now: Date, back = 0): Range {
  if (period === 'year') {
    const y = now.getFullYear() - back
    return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y), days: 365 }
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    return { start, end, label: `${cap(MONTHS[start.getMonth()])} ${start.getFullYear()}`, days: Math.round((end.getTime() - start.getTime()) / 86_400_000) }
  }
  const day = (now.getDay() + 6) % 7
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - back * 7)
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
  return { start, end, label: `Semana del ${start.getDate()} de ${MONTHS[start.getMonth()]}`, days: 7 }
}

export function toServerDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function inRange(o: PaidOrder, r: Range): boolean {
  const t = serverTime(o.paidAt)
  return t >= r.start.getTime() && t < r.end.getTime()
}

// Todo sale de conteos reales + supuestos configurables. Ventas IA y errores: 0 hasta que existan datos.
export function metrics(orders: PaidOrder[], s: Settings, days: number): RoiMetrics {
  const total = orders.length
  const auto = orders.filter((o) => o.origin !== 'waiter')
  const hoursSaved = (auto.length * s.roiMinutesPerOrder) / 60
  const laborSaving = hoursSaved * s.roiHourCost
  const hoursPer100 = total === 0 ? s.roiBaselineHoursPer100 : Math.max(0, ((s.roiBaselineHoursPer100 / 100) * total - hoursSaved) / total) * 100
  const cost = (s.roiMonthlyCost * days) / 30
  const aiSales = 0
  const net = laborSaving + aiSales - cost
  return { total, autonomous: auto.length, autonomousRevenue: auto.reduce((a, o) => a + o.total, 0), hoursSaved, laborSaving, hoursPer100, aiSales, cost, net, roi: cost > 0 ? (laborSaving + aiSales) / cost : 0 }
}

export function monthsOfUse(startDate: string | null, now: Date): number {
  if (!startDate) return 0
  // La fecha llega como AAAA-MM-DD: se lee como fecha local. `new Date('2026-05-01')` la toma en UTC y, al oeste de
  // Greenwich (Colombia), cae en el 30 de abril: un mes de más.
  const [year, month] = startDate.slice(0, 10).split('-').map(Number)
  if (!year || !month) return 0
  return Math.max(0, (now.getFullYear() - year) * 12 + now.getMonth() - (month - 1))
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}
