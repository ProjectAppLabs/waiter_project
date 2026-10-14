import { barFill, barTone, countByState, deriveTableViews, elapsedMinutes, formatElapsed, matchesSearch } from '@/lib/domain/tableState'

const geo = { x: 0, y: 0, width: 110, height: 110, shape: 'square' as const, color: null }
const tables = [{ id: 1, number: 1, floorId: 1, seats: 4, ...geo }, { id: 2, number: 2, floorId: 1, seats: 2, ...geo }, { id: 3, number: 3, floorId: 1, seats: 2, ...geo }]
const order = { id: 9, tableId: 2, total: 74200, tax: 11851, state: 'draft' as const, lineCount: 2, startedAt: '2026-09-04 20:00:00', waiter: 'Alejandra', kitchen: 'none' as const, tracking: null }

// Falla si una mesa sin pedido abierto deja de mostrarse libre.
it('marks tables without an open order as free with zero total', () => {
  const [t1] = deriveTableViews(tables, [order], {})
  expect(t1).toEqual({ notices: [], table: tables[0], state: 'free', total: 0, tax: 0, orderId: null, startedAt: null, waiter: null, callSince: null })
})

// Falla si el monto, el mesero o la hora de inicio del pedido no llegan a la celda de la mesa.
it('marks a table with an open order as occupied carrying total, waiter and start', () => {
  const t2 = deriveTableViews(tables, [order], {})[1]
  expect(t2).toMatchObject({ state: 'occupied', total: 74200, orderId: 9, waiter: 'Alejandra', startedAt: '2026-09-04 20:00:00' })
})

// Falla si "asistencia" pierde contra "en cocina": la mesa que llama al mesero debe verse siempre.
it('assist flag wins over the kitchen phase on the same table', () => {
  const t2 = deriveTableViews(tables, [{ ...order, kitchen: 'cooking' }], { 2: { assist: true } })[1]
  expect(t2.state).toBe('assist')
})

// Falla si el salón no pinta "en cocina" con un curso disparado, "listo" cuando cocina ya lo dejó en el pase
// —la mesa a la que el mesero tiene que ir ya— o "servido" cuando todo se entregó.
it('derives kitchen, ready and served states from the order kitchen phase', () => {
  const cooking = deriveTableViews(tables, [{ ...order, kitchen: 'cooking' }], {})[1]
  const ready = deriveTableViews(tables, [{ ...order, kitchen: 'ready' }], {})[1]
  const served = deriveTableViews(tables, [{ ...order, kitchen: 'served' }], {})[1]
  expect([cooking.state, ready.state, served.state]).toEqual(['kitchen', 'ready', 'served'])
})

// Falla si la leyenda cuenta mal (la cuenta es lo que el gerente mira de reojo).
it('counts views by state including zero for unused states', () => {
  const counts = countByState(deriveTableViews(tables, [order], { 3: { closed: true } }))
  expect(counts).toMatchObject({ free: 1, occupied: 1, closed: 1, kitchen: 0, assist: 0 })
})

// Falla si date_order se interpreta en hora local: el servidor lo manda en UTC y la mesa mostraría 5 horas de más.
it('measures elapsed minutes from an el servidor UTC timestamp', () => {
  expect(elapsedMinutes('2026-09-04 20:00:00', Date.parse('2026-09-04T21:14:00Z'))).toBe(74)
  expect(formatElapsed(74)).toBe('1:14')
  expect(formatElapsed(34)).toBe('0:34')
})

// Falla si la barra cambia de tono fuera de los 12 y 18 minutos del sistema de diseño.
it('fills the 22-minute bar and changes tone at 12 and 18 minutes', () => {
  expect(barFill(11)).toBe(50)
  expect(barFill(30)).toBe(100)
  expect([barTone(5), barTone(12), barTone(18)]).toEqual(['ok', 'warn', 'late'])
})

// Falla si buscar "3" no encuentra la mesa 3, si "#9" no encuentra el pedido 9, o si el vacío filtra algo.
it('matches tables by number, order id or waiter', () => {
  const view = deriveTableViews(tables, [order], {})[1]
  expect([matchesSearch(view, '2'), matchesSearch(view, '#9'), matchesSearch(view, 'ale'), matchesSearch(view, '7'), matchesSearch(view, '')]).toEqual([true, true, true, false, true])
})

// Falla si lo que el comensal pide desde su móvil (pidiendo, mesero, cuenta) no cambia el estado de la mesa.
it('derives ordering, assist and billing from the diner calls that live in el servidor', () => {
  const calls = [{ tableId: 1, kind: 'ordering' as const, since: '2026-09-04 20:00:00' }, { tableId: 2, kind: 'assist' as const, since: '2026-09-04 20:01:00' }, { tableId: 3, kind: 'bill' as const, since: '' }]
  const views = deriveTableViews(tables, [order, { ...order, id: 10, tableId: 3 }], {}, calls)
  expect(views.map((v) => v.state)).toEqual(['ordering', 'assist', 'billing'])
  expect(views[1].callSince).toBe('2026-09-04 20:01:00')
})

// Falla si se pierde alguno de los avisos simultáneos de la mesa.
it('keeps the ready, unsent and customer-call notices together on the same table', () => {
  const v = deriveTableViews(tables, [{ ...order, kitchen: 'ready', unsent: true }], {}, [{ tableId: 2, kind: 'assist', since: '2026-09-22 00:00:00' }])[1]
  expect(v.state).toBe('assist')
  expect(v.notices).toEqual(['ready', 'unsent', 'assist'])
})

// Falla si se oculta una solicitud de cuenta sin pedido abierto.
it('shows a bill request even when the table has no open order', () => {
  const v = deriveTableViews(tables, [], {}, [{ tableId: 2, kind: 'bill', since: '' }])[1]
  expect(v.state).toBe('billing')
  expect(v.notices).toEqual(['bill'])
})
