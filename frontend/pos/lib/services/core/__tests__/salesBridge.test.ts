import { toClosingData, toKitOrder, toOpenOrder, toOrderDetail, toShiftOrder } from '@/lib/services/core/salesBridge'
import type { CoreOrder } from '@/lib/services/core/sales'

const line = (over: Partial<CoreOrder['lines'][number]>): CoreOrder['lines'][number] => ({
  id: 1, uuid: 'l1', product_id: 10, name: 'Clásica', qty: 1, unit_price: 20000, subtotal: 18519, total: 20000, note: '', options: [], parent_id: null, discount_pct: 0,
  course_id: null, ready_at: null, served_at: null, cancelled: false, ...over,
})
const order: CoreOrder = {
  id: 5, uuid: 'o5', number: 'DI-007', tracking: 7, service: 'dine_in', state: 'draft', origin: 'waiter', channel: 'pos', table_id: 3, table_number: 4, guests: 2, baby_chair: false,
  customer_name: '', delivery_address: '', delivery_phone: '', note: 'sin cebolla', billing: false, created_at: '2026-10-02T01:00:00Z', paid_at: null, waiter: { id: 9, name: 'Sofía' },
  subtotal: 37037, tax: 2963, tip: 0, total: 40000, paid: 0, change: 0,
  lines: [line({ id: 1, course_id: 1, ready_at: '2026-10-02T01:05:00Z' }), line({ id: 2, uuid: 'l2', course_id: 1, options: [{ group: 'attribute', name: 'Extra queso', price_extra: 2000 }] }), line({ id: 3, uuid: 'l3' }), line({ id: 4, uuid: 'l4', cancelled: true })],
  courses: [{ id: 1, index: 1, fired_at: '2026-10-02T01:01:00Z', preparation_at: '2026-10-02T01:02:00Z', ready_at: null, served_at: null }],
  payments: [],
}

// Falla si un pedido del sistema propio pierde su número, su mesa, sus cursos o deja pasar las líneas canceladas.
test('el pedido toma la forma del kit', () => {
  const k = toKitOrder(order)
  expect([k.number, k.type, k.state, k.tableNumber, k.waiter, k.tracking]).toEqual(['DI-007', 'dine_in', 'draft', 4, 'Sofía', '7'])
  expect(k.lines.map((l) => l.id)).toEqual([1, 2, 3])
  expect(k.courses[0]).toMatchObject({ id: 1, fired: true, readyAt: null })
})

// Falla si el salón no ve que hay un plato listo por entregar o que quedan líneas sin enviar a cocina.
test('la fila del salón sabe que hay algo listo y algo sin enviar', () => {
  const o = toOpenOrder(order)
  expect(o).toMatchObject({ tableId: 3, kitchen: 'ready', unsent: true, lineCount: 3 })
  expect(toOpenOrder({ ...order, table_id: null })).toBeNull()
})

// Falla si el detalle de mesa confunde los estados: el plato listo manda sobre su curso, el curso iniciado da «en
// preparación» y una línea sin curso está «sin enviar».
test('el detalle de mesa deriva el estado de cada línea', () => {
  const d = toOrderDetail(order)
  expect(d.lines.map((l) => l.status)).toEqual(['ready', 'progress', 'unsent'])
  expect(d.lines[1].additions).toEqual(['Extra queso'])
  expect([d.sent, d.served, d.serviceAt]).toEqual([2, 0, 'table'])
})

// Falla si Operación no sabe desde cuándo espera cocina o pierde el origen del pedido.
test('la fila de operación trae la hora del curso pendiente', () => {
  const s = toShiftOrder({ ...order, origin: 'diner' })
  expect(s).toMatchObject({ origin: 'diner', kitchen: 'cooking', firedAt: '2026-10-02T01:01:00Z', tableNumber: 4 })
})

// Falla si las salidas de efectivo no restan en el resumen de cierre o se pierden las cuentas abiertas.
test('el cierre de caja traduce movimientos y cuentas abiertas', () => {
  const c = toClosingData({ orders_count: 3, orders_total: 120000, opening_cash: 200000, cash_payments: 80000, cash_moves: [{ kind: 'in', amount: 10000, reason: 'Cambio' }, { kind: 'out', amount: 5000, reason: 'Hielo' }],
    expected_cash: 285000, other_methods: [{ id: 2, name: 'Datáfono', amount: 40000, count: 1 }], draft_orders: 1, opening_notes: 'Turno mañana' })
  expect(c.cashMoves).toEqual([{ name: 'Cambio', amount: 10000 }, { name: 'Hielo', amount: -5000 }])
  expect([c.expectedCash, c.draftOrders, c.otherMethods[0].name]).toEqual([285000, 1, 'Datáfono'])
})
