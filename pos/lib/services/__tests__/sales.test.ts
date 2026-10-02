import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { listSales, listShifts, paymentsByMethod, salesSummary, topProducts } from '@/lib/services/sales'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
// Falla si una caja abierta se muestra cerrada o pierde el cierre y sus importes.
it('lee los turnos abiertos y cerrados', async () => {
 m.mockResolvedValue({ shifts: [{ id: 1, state: 'open', opened_at: '2026-10-02T12:00:00Z', opened_by: null }, { id: 2, state: 'closed', opened_at: '2026-10-01T12:00:00Z', closed_at: '2026-10-01T23:00:00Z', opened_by: null, total: 120000, orders: 4 }] })
 const [open, closed] = await listShifts()
 expect(open.stopAt).toBeNull(); expect(closed).toMatchObject({ total: 120000, orders: 4, stopAt: '2026-10-01T23:00:00Z' })
})
// Falla si los informes cambian el alcance local o calculan los KPI con la página de resultados.
it('mantiene días y turno, con totales independientes de la tabla', async () => {
 const range = { kind: 'range' as const, from: '2026-09-01', to: '2026-09-20' }
 m.mockResolvedValue({ orders: [] }); await listSales(range, () => null); await listSales({ kind: 'shift', sessionId: 31 }, () => null)
 expect(m.mock.calls[0][0]).toBe('sales/orders?restaurant_id=1&from=2026-09-01&to=2026-09-20&limit=200')
 expect(m.mock.calls[1][0]).toBe('sales/orders?restaurant_id=1&shift_id=31&limit=200')
 m.mockResolvedValue({ total: 400000, orders: 1000, autonomous: 100, by_method: [{ method: 'Efectivo', amount: 400000 }], top_products: [{ product: 'Angus', qty: 4, amount: 400000 }] })
 await expect(salesSummary(range)).resolves.toEqual({ total: 400000, orders: 1000, autonomous: 100 })
 await expect(paymentsByMethod(range)).resolves.toEqual([{ method: 'Efectivo', amount: 400000 }])
 await expect(topProducts(range)).resolves.toEqual([{ product: 'Angus', qty: 4, amount: 400000 }])
})
