import { serverTime } from '@/lib/domain/time'
import type { CompletedCourse, CourseSummary, KitchenTicket } from '@/lib/services/kitchen'

export type TicketMood = 'fresh' | 'normal' | 'attention' | 'late'
export type KitchenPhase = 'none' | 'cooking' | 'ready' | 'served'
export const ALL = 'all'
export const LATE = 'late'
export const LATE_MIN = 18
export const FRESH_MIN = 2

// Las horas de Odoo vienen en UTC sin zona ("2026-09-05 01:12:43").
export function elapsedSeconds(at: string, now: number): number {
  return Math.max(0, Math.floor((now - serverTime(at)) / 1000))
}

// "18:40" — minutos:segundos, como el cronómetro de la tarjeta del diseño.
export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function ticketMinutes(t: KitchenTicket, now: number): number {
  return Math.floor(elapsedSeconds(t.firedAt, now) / 60)
}

// Prioridad: demorado > atención (alguna nota: alergia, término) > recién entra > normal.
export function ticketMood(t: KitchenTicket, now: number): TicketMood {
  const min = ticketMinutes(t, now)
  if (min >= LATE_MIN) return 'late'
  if (t.note !== '' || t.lines.some((l) => l.note !== '')) return 'attention'
  if (min < FRESH_MIN) return 'fresh'
  return 'normal'
}

// Estaciones presentes en las comandas vivas, en orden de aparición.
export function stations(tickets: KitchenTicket[]): string[] {
  return [...new Set(tickets.flatMap((t) => t.lines.map((l) => l.station)).filter((s): s is string => s !== null))]
}

export function filterTickets(tickets: KitchenTicket[], tab: string, now: number): KitchenTicket[] {
  if (tab === ALL) return tickets
  if (tab === LATE) return tickets.filter((t) => ticketMood(t, now) === 'late')
  return tickets.filter((t) => t.lines.some((l) => l.station === tab))
}

export function countTickets(tickets: KitchenTicket[], now: number): Record<string, number> {
  const counts: Record<string, number> = { [ALL]: tickets.length, [LATE]: filterTickets(tickets, LATE, now).length }
  stations(tickets).forEach((s) => { counts[s] = filterTickets(tickets, s, now).length })
  return counts
}

export function averagePrepSeconds(done: CompletedCourse[]): number | null {
  if (done.length === 0) return null
  const total = done.reduce((acc, c) => acc + elapsedSeconds(c.firedAt, serverTime(c.readyAt)), 0)
  return Math.round(total / done.length)
}

// cooking si alguna comanda sigue en cocina; ready si todas están listas y alguna falta por entregar;
// served si todas se entregaron; none si nunca se envió nada.
export function kitchenPhase(courses: CourseSummary[]): KitchenPhase {
  if (courses.length === 0) return 'none'
  if (courses.some((c) => c.readyAt === null)) return 'cooking'
  if (courses.some((c) => c.servedAt === null)) return 'ready'
  return 'served'
}
