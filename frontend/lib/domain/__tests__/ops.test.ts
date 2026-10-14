import { deriveAlerts, filterOrders, orderStatus } from '@/lib/domain/ops'
import type { ShiftOrder } from '@/lib/services/ops'

const NOW = Date.parse('2026-09-05T02:00:00Z')
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString().slice(0, 19).replace('T', ' ')
const order = (id: number, extra: Partial<ShiftOrder>): ShiftOrder =>
  ({ id, reference: `#${id}`, tableId: id, tableNumber: id, waiter: 'Sofía', origin: 'waiter', total: 1000, state: 'draft', kitchen: 'none', firedAt: null, startedAt: at(30), ...extra })

// Falla si un pedido con comanda de 18 min no se marca demorado, o si un pagado sigue mostrando cocina.
it('grades an order late after the threshold and paid regardless of kitchen', () => {
  expect(orderStatus(order(1, { kitchen: 'cooking', firedAt: at(19) }), NOW, 18)).toEqual({ status: 'late', minutes: 19 })
  expect(orderStatus(order(2, { kitchen: 'cooking', firedAt: at(5) }), NOW, 18).status).toBe('cooking')
  expect(orderStatus(order(3, { state: 'paid', kitchen: 'cooking', firedAt: at(40) }), NOW, 18).status).toBe('paid')
})

// Falla si la pantalla inventa alertas cuando todo va bien, o si no ordena la más vieja primero.
it('raises only exceptions, oldest first', () => {
  const orders = [order(1, { kitchen: 'cooking', firedAt: at(20) }), order(2, { kitchen: 'cooking', firedAt: at(3) }), order(3, { kitchen: 'served' })]
  const alerts = deriveAlerts(orders, { 3: { billing: true } }, { 3: NOW - 15 * 60_000 }, NOW, { late: 18, bill: 10 })
  expect(alerts.map((a) => a.id)).toEqual(['late-1', 'bill-3'])
  expect(alerts[1]).toMatchObject({ kind: 'payment', orderId: 3, tableNumber: 3, severity: 'warn' })
  expect(deriveAlerts([order(2, { kitchen: 'cooking', firedAt: at(3) })], {}, {}, NOW, { late: 18, bill: 10 })).toEqual([])
})

// Falla si el segmento Cocina deja pasar pedidos pagados o el de Pagos muestra los que aún se cocinan.
it('filters the shift table by segment', () => {
  const orders = [order(1, { kitchen: 'cooking', firedAt: at(2) }), order(2, { kitchen: 'served' }), order(3, { state: 'paid' })]
  expect(filterOrders(orders, 'kitchen', NOW, 18).map((o) => o.id)).toEqual([1])
  expect(filterOrders(orders, 'payments', NOW, 18).map((o) => o.id)).toEqual([2])
  expect(filterOrders(orders, 'all', NOW, 18)).toHaveLength(3)
})


// Falla si la llamada del comensal no aparece como alerta de mesa con su número y su tiempo.
it('raises a table alert for a diner calling the waiter', () => {
  const calls = [{ tableId: 11, kind: 'assist' as const, since: at(1) }]
  const [alert] = deriveAlerts([], {}, {}, NOW, { late: 18, bill: 10 }, calls, () => 11)
  expect(alert).toMatchObject({ id: 'assist-11', kind: 'table', tableNumber: 11, severity: 'busy', seconds: 60 })
})
