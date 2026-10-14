import { averagePrepSeconds, countTickets, filterTickets, formatClock, kitchenPhase, stations, ticketMood } from '@/lib/domain/kitchen'
import type { KitchenTicket } from '@/lib/services/kitchen'

const NOW = Date.parse('2026-09-05T02:00:00Z')
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString().slice(0, 19).replace('T', ' ')
const line = (station: string | null, note = '') => ({ id: 1, name: 'Lomo', qty: 1, note, station, readyAt: null, servedAt: null })
const ticket = (id: number, minutesAgo: number, lines = [line('Parrilla')]): KitchenTicket =>
  ({ id, orderId: id, tableId: id, tracking: String(id), waiter: 'Sofía', note: '', firedAt: at(minutesAgo), readyAt: null, lines })

// Falla si el cronómetro muestra segundos sin cero a la izquierda o minutos mal divididos.
it('formats seconds as minutes:seconds like the design timer', () => {
  expect(formatClock(1120)).toBe('18:40')
  expect(formatClock(5)).toBe('0:05')
})

// Falla si una comanda de 18 min no se marca demorada, o si una nota no pide atención.
it('grades a ticket late at 18 min, attention with a note, fresh under 2 min', () => {
  expect(ticketMood(ticket(1, 18), NOW)).toBe('late')
  expect(ticketMood(ticket(2, 5, [line('Parrilla', 'sin queso · alergia')]), NOW)).toBe('attention')
  expect(ticketMood(ticket(3, 1), NOW)).toBe('fresh')
  expect(ticketMood(ticket(4, 5), NOW)).toBe('normal')
})

// Falla si la pestaña Demorados o la de una estación dejan pasar comandas que no son suyas.
it('filters tickets by late tab and by station', () => {
  const list = [ticket(1, 20), ticket(2, 3, [line('Barra')]), ticket(3, 3)]
  expect(filterTickets(list, 'late', NOW).map((t) => t.id)).toEqual([1])
  expect(filterTickets(list, 'Barra', NOW).map((t) => t.id)).toEqual([2])
  expect(filterTickets(list, 'all', NOW)).toHaveLength(3)
})

// Falla si las pestañas cuentan mal o inventan estaciones que no están en ninguna comanda viva.
it('counts tickets per tab from the stations actually present', () => {
  const list = [ticket(1, 20), ticket(2, 3, [line('Barra')]), ticket(3, 3, [line(null)])]
  expect(stations(list)).toEqual(['Parrilla', 'Barra'])
  expect(countTickets(list, NOW)).toEqual({ all: 3, late: 1, Parrilla: 1, Barra: 1 })
})

// Falla si el tiempo medio ignora un curso o divide por cero sin cursos.
it('averages preparation time over completed courses', () => {
  expect(averagePrepSeconds([])).toBeNull()
  expect(averagePrepSeconds([{ firedAt: at(20), readyAt: at(10) }, { firedAt: at(12), readyAt: at(8) }])).toBe(420)
})

// Falla si el salón muestra "servido" con una comanda todavía en cocina.
it('derives the kitchen phase of an order from its courses', () => {
  expect(kitchenPhase([])).toBe('none')
  expect(kitchenPhase([{ orderId: 1, firedAt: at(5), readyAt: at(1), servedAt: null }, { orderId: 1, firedAt: at(5), readyAt: null, servedAt: null }])).toBe('cooking')
  expect(kitchenPhase([{ orderId: 1, firedAt: at(5), readyAt: at(1), servedAt: null }])).toBe('ready')
  expect(kitchenPhase([{ orderId: 1, firedAt: at(5), readyAt: at(2), servedAt: at(1) }])).toBe('served')
})
