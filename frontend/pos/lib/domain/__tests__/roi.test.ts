import { metrics, monthsOfUse, pctChange, periodRange } from '@/lib/domain/roi'
import type { PaidOrder } from '@/lib/services/roi'

const SETTINGS = { configId: 1, configName: 'Salón', waiterCanCharge: true, waiterCanEditInventory: false, alertLateMinutes: 18, alertBillMinutes: 10, roiHourCost: 20000, roiMinutesPerOrder: 12, roiBaselineHoursPer100: 18.4, roiMonthlyCost: 3000000, roiStartDate: '2026-05-01', tipProductId: 1 }
const order = (id: number, origin: PaidOrder['origin'], total = 50000): PaidOrder => ({ id, total, origin, paidAt: '2026-09-05 01:00:00' })

// Falla si el ROI cuenta pedidos de mesero como autónomos o si el coste no se prorratea al periodo.
it('computes savings, cost, net value and the north-star metric from counts and assumptions', () => {
  const orders = [order(1, 'diner'), order(2, 'diner'), order(3, 'ai'), order(4, 'waiter'), order(5, 'waiter')]
  const m = metrics(orders, SETTINGS, 30)
  expect(m).toMatchObject({ total: 5, autonomous: 3, autonomousRevenue: 150000, hoursSaved: 0.6, laborSaving: 12000, cost: 3000000 })
  expect(m.hoursPer100).toBeCloseTo(6.4, 5)
  expect(m.net).toBe(-2988000)
})

// Falla si sin pedidos la métrica norte deja de ser la línea base o divide por cero.
it('falls back to the baseline hours without orders', () => {
  expect(metrics([], SETTINGS, 7).hoursPer100).toBe(18.4)
  expect(metrics([], { ...SETTINGS, roiMonthlyCost: 0 }, 7).roi).toBe(0)
})

// Falla si el mes anterior se calcula mal en enero o la semana no empieza en lunes.
it('builds month and week ranges going back in time', () => {
  const now = new Date(2026, 0, 15)
  expect(periodRange('month', now, 1).label).toBe('Diciembre 2025')
  expect(periodRange('week', new Date(2026, 8, 5), 0).start.getDay()).toBe(1)
  expect(periodRange('year', now, 2).label).toBe('2024')
})

// Falla si los meses de uso o el porcentaje de cambio salen mal (ambos se muestran como etiqueta).
it('derives months of use and percent change', () => {
  expect(monthsOfUse('2026-05-01', new Date(2026, 8, 5))).toBe(4)
  expect(pctChange(122, 100)).toBe(22)
  expect(pctChange(5, 0)).toBeNull()
})
