import {
  canCharge, cartTotals, countByStatus, customerName, filterHistory, greetingFor, lineGroup, matchesOrderSearch, orderNumber,
  orderStatus, orderTypeOf, progressPercent, readyToServe, sortOrders, type KitCourse, type KitLine, type KitOrder,
} from '@/lib/domain/orderState'

const course = (id: number, patch: Partial<KitCourse> = {}): KitCourse => ({ id, fired: true, preparationAt: '2026-09-08 10:00:00', readyAt: null, servedAt: null, ...patch })
const line = (id: number, courseId: number | null): KitLine => ({ id, uuid: `u${id}`, productId: 3, name: 'Angus', qty: 1, unitPrice: 36900, subtotal: 36900, total: 43911, note: '', courseId, readyAt: null, servedAt: null })
const order = (patch: Partial<KitOrder> = {}): KitOrder => ({
  id: 7, number: 'DI007', type: 'dine_in', state: 'draft', tableId: 4, tableNumber: 3, customer: 'Eva', startedAt: '2026-09-06 20:00:00', total: 0, tax: 0, lines: [], courses: [], ...patch,
})

// Falla si el tipo no sale del preset del servidor o si un pedido viejo sin preset y con mesa deja de ser "en mesa".
it('derives the order type from the preset and falls back to the table', () => {
  expect(orderTypeOf('table', true)).toBe('dine_in')
  expect(orderTypeOf('counter', false)).toBe('takeout')
  expect(orderTypeOf('delivery', false)).toBe('delivery')
  expect(orderTypeOf(null, true)).toBe('dine_in')
  expect(orderTypeOf(null, false)).toBe('takeout')
})

// Falla si el número pierde el prefijo del kit (DI/TA/DE) o las tres cifras.
it('builds DI001-style numbers and picks the customer name', () => {
  expect(orderNumber('dine_in', '7')).toBe('DI007')
  expect(orderNumber('takeout', 112)).toBe('TA112')
  expect(orderNumber('delivery', 'x')).toBe('DE000')
  expect(customerName('Eva', [5, 'Cliente el servidor'])).toBe('Eva')
  expect(customerName(false, [5, 'Cliente el servidor'])).toBe('Cliente el servidor')
  expect(customerName('  ', false)).toBe('')
})

// Falla si una línea sin curso no queda "esperando cocina" o si el % no es servidas / enviadas.
it('groups lines by kitchen state and computes the progress percent', () => {
  const o = order({ courses: [course(1, { servedAt: 'x' }), course(2), course(3, { fired: false })], lines: [line(1, 1), line(2, 2), line(3, 3), line(4, null)] })
  expect(lineGroup(o, o.lines[0])).toBe('served')
  expect(lineGroup(o, o.lines[1])).toBe('in_progress')
  expect(lineGroup(o, o.lines[2])).toBe('waiting')
  expect(lineGroup(o, o.lines[3])).toBe('waiting')
  expect(progressPercent(o)).toBe(50)
  expect(progressPercent(order({ lines: [line(1, null)] }))).toBe(0)
})

// Falla si un plato que cocina dejó en el pase no queda "listo": es el aviso de que hay que ir por él.
it('marks a fired course as ready once the kitchen says so, and served when the waiter takes it', () => {
  const o = order({ courses: [course(1, { readyAt: 'r' })], lines: [line(1, 1)] })
  expect(lineGroup(o, o.lines[0])).toBe('ready')
  const taken = order({ courses: [course(1, { readyAt: 'r' })], lines: [{ ...line(1, 1), servedAt: 's' }] })
  expect(lineGroup(taken, taken.lines[0])).toBe('served')
})

// Falla si la lista de trabajo del mesero no ordena por lo que lleva más esperando o cuela platos que no están listos.
it('lists the dishes waiting on the pass, the oldest first', () => {
  const a = order({ id: 1, number: 'DI001', tableNumber: 3, courses: [course(1, { readyAt: '2026-09-06 20:10:00' })], lines: [line(1, 1)] })
  const b = order({ id: 2, number: 'DI002', tableNumber: 5, courses: [course(2, { readyAt: '2026-09-06 20:02:00' }), course(3)], lines: [line(2, 2), line(3, 3)] })
  expect(readyToServe([a, b]).map((d) => [d.orderNumber, d.lineId, d.tableNumber])).toEqual([['DI002', 2, 5], ['DI001', 1, 3]])
  expect(readyToServe([order({ courses: [course(1)], lines: [line(1, 1)] })])).toEqual([])
})

// Falla si "esperando pago" no gana a lo demás, si un pedido pagado no es "completado" o si listo/servido se confunden.
it('derives the kit status from courses, state and the billing flag', () => {
  expect(orderStatus(order({ state: 'paid' }), true)).toBe('completed')
  expect(orderStatus(order({ courses: [course(1, { servedAt: 'x' })], lines: [line(1, 1)] }), true)).toBe('waiting_payment')
  expect(orderStatus(order({ courses: [course(1, { servedAt: 'x' })], lines: [line(1, 1)] }), false)).toBe('served')
  expect(orderStatus(order({ courses: [course(1, { readyAt: 'x' })], lines: [line(1, 1)] }), false)).toBe('ready')
  // Basta un plato en el pase para que el pedido reclame al mesero, aunque el resto siga en cocina.
  expect(orderStatus(order({ courses: [course(1, { readyAt: 'x' }), course(2)], lines: [line(1, 1), line(2, 2)] }), false)).toBe('ready')
  expect(orderStatus(order({ lines: [line(1, null)] }), false)).toBe('pending_send')
})

// Falla si "Cobrar" se habilita con líneas sin servir o con un pedido vacío.
it('allows charging only when every line is served', () => {
  expect(canCharge(order({ courses: [course(1, { servedAt: 'x' })], lines: [line(1, 1)] }))).toBe(true)
  expect(canCharge(order({ courses: [course(1, { servedAt: 'x' })], lines: [line(1, 1), line(2, null)] }))).toBe(false)
  expect(canCharge(order())).toBe(false)
})

// Falla si el buscador ignora el número con almohadilla o el nombre del cliente, o si los conteos por chip no cuadran.
it('searches by number or customer and counts orders per status chip', () => {
  const served = order({ id: 2, number: 'TA002', customer: 'Noa', courses: [course(1, { servedAt: 'x' })], lines: [line(1, 1)] })
  expect(matchesOrderSearch(served, '#002')).toBe(true)
  expect(matchesOrderSearch(served, 'noa')).toBe(true)
  expect(matchesOrderSearch(served, 'eva')).toBe(false)
  const counts = countByStatus([order(), served], (o) => orderStatus(o, false))
  expect(counts).toEqual({ all: 2, pending_send: 1, in_progress: 0, ready: 0, served: 1, waiting_payment: 0, completed: 0 })
})

// Falla si "más reciente" no pone primero el último pedido o si ordenar por tipo mezcla en mesa con para llevar.
it('sorts by latest, oldest and type; filters history by type', () => {
  const a = order({ id: 1, type: 'takeout', startedAt: '2026-09-06 20:00:00' })
  const b = order({ id: 2, type: 'dine_in', startedAt: '2026-09-06 21:00:00' })
  const c = order({ id: 3, type: 'delivery', startedAt: '2026-09-06 19:00:00' })
  expect(sortOrders([a, b, c], 'latest').map((o) => o.id)).toEqual([2, 1, 3])
  expect(sortOrders([a, b, c], 'oldest').map((o) => o.id)).toEqual([3, 1, 2])
  expect(sortOrders([a, b, c], 'type').map((o) => o.id)).toEqual([2, 1, 3])
  expect(filterHistory([a, b, c], 'takeout').map((o) => o.id)).toEqual([1])
})

// Falla si la ronda vuelve a sumar el IVA al precio final o pierde la base de un impuesto incluido.
it('descompone los precios finales de la ronda y conserva el saludo por hora', () => {
  const taxes = [{ id: 55, amount: 19, priceInclude: false }, { id: 9, amount: 19, priceInclude: true }]
  expect(cartTotals([{ unitPrice: 43911, qty: 2, taxIds: [55] }], taxes)).toEqual({ subtotal: 73800, tax: 14022, total: 87822 })
  expect(cartTotals([{ unitPrice: 11900, qty: 1, taxIds: [9] }], taxes)).toEqual({ subtotal: 10000, tax: 1900, total: 11900 })
  expect(greetingFor(9)).toBe('morning')
  expect(greetingFor(15)).toBe('afternoon')
  expect(greetingFor(21)).toBe('evening')
})

// Falla si se impide cancelar antes de preparar o se permite después.
it('allows cancellation after receipt until preparation starts', () => {
  const o = order({ courses: [course(1, { preparationAt: null })], lines: [line(1, 1)] })
  expect(lineGroup(o, o.lines[0])).toBe('waiting')
  o.courses[0].preparationAt = '2026-09-08 10:01:00'
  expect(lineGroup(o, o.lines[0])).toBe('in_progress')
})

// Falla si guardar un pedido se confunde con enviarlo a cocina.
it('distinguishes a saved order from an actual kitchen dispatch', () => {
  expect(orderStatus(order(), false)).toBe('pending_send')
  expect(orderStatus(order({ courses: [course(1, { fired: false })], lines: [line(1, 1)] }), false)).toBe('pending_send')
  expect(orderStatus(order({ courses: [course(1, { preparationAt: null })], lines: [line(1, 1)] }), false)).toBe('in_progress')
})
