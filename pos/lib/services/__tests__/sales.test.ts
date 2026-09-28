import { callKw } from '@/lib/services/odoo'
import { listSales, listShifts, paymentsByMethod, salesSummary, topProducts } from '@/lib/services/sales'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const m = callKw as jest.Mock
beforeEach(() => m.mockReset())

// Una caja creada pero sin abrir (`opening_control`) llega de Odoo con `start_at: false`. El tipo decía `string`, la
// página de Ventas hacía `false.replace(...)` y toda Administración se caía («This page couldn't load») mientras
// existiera una caja en ese estado. Falla si ese `false` vuelve a pasar como fecha.
it('reads a shift that has not started yet as having no start date', async () => {
  m.mockResolvedValue([
    { id: 32, name: 'POS/00032', state: 'opening_control', start_at: false, stop_at: false, user_id: [2, 'Admin'], total_payments_amount: 0, order_count: 0 },
    { id: 31, name: 'POS/00031', state: 'closed', start_at: '2026-09-18 15:00:00', stop_at: '2026-09-18 23:00:00', user_id: false, total_payments_amount: 120000, order_count: 4 },
  ])
  const [pending, closed] = await listShifts()
  expect(pending.startAt).toBeNull()
  expect(closed).toMatchObject({ startAt: '2026-09-18 15:00:00', stopAt: '2026-09-18 23:00:00', user: '', total: 120000 })
})

// Falla si filtrar por fechas deja de cubrir días locales completos, si cada modelo deja de usar su propio campo de
// fecha (los pagos no tienen `date_order`; las líneas llegan al pedido por `order_id.`), si el filtro por turno cambia, o
// si los totales vuelven a depender de las filas que caben en la tabla.
it('filters by a shift or by whole local days, each model through its own date field', async () => {
  m.mockResolvedValue([])
  const range = { kind: 'range' as const, from: '2026-09-01', to: '2026-09-20' }
  await listSales(range, () => null)
  const [from, to] = [m.mock.calls[0][2][0][0], m.mock.calls[0][2][0][1]]
  expect([from[0], from[1], to[0], to[1]]).toEqual(['date_order', '>=', 'date_order', '<'])
  expect(new Date(to[2].replace(' ', 'T') + 'Z').getTime()).toBe(new Date('2026-09-21T00:00:00').getTime())
  expect(m.mock.calls[0][3]).toMatchObject({ limit: 200 })

  await paymentsByMethod(range)
  expect(m.mock.calls[1][2][0].map((c: unknown[]) => c[0])).toEqual(['payment_date', 'payment_date'])
  await topProducts(range)
  expect(m.mock.calls[2][2][0].map((c: unknown[]) => c[0])).toEqual(['order_id.date_order', 'order_id.date_order', 'order_id.state'])
  await listSales({ kind: 'shift', sessionId: 31 }, () => null)
  expect(m.mock.calls[3][2][0][0]).toEqual(['session_id', '=', 31])

  m.mockResolvedValue([{ waiter_origin: false, amount_total: 300000, __count: 900 }, { waiter_origin: 'qr', amount_total: 100000, __count: 100 }])
  expect(await salesSummary(range)).toEqual({ total: 400000, orders: 1000, autonomous: 100 })
})
