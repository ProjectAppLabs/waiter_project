import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { CashClosingsView } from '@/components/business/CashClosingsView'
import { MovedToConsole } from '@/components/business/MovedToConsole'
import { ProfitabilityView } from '@/components/business/ProfitabilityView'
import { SummaryView } from '@/components/business/SummaryView'
import { cashClosings, cashSettings, orgSummary, profitability } from '@/lib/services/business'
import { useAuthStore } from '@/lib/stores/authStore'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/services/business', () => ({ orgSummary: jest.fn(), cashClosings: jest.fn(), cashSettings: jest.fn(), profitability: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn(), startMyShift: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))

const F = (sales: number) => ({ sales, orders: sales / 10, ticket: 10, guests: 4, tips: 1 })
const R = [{ id: 1, name: 'Poblado' }, { id: 2, name: 'Laureles' }]
beforeEach(() => jest.clearAllMocks())

// Falla si el resumen no pone las sedes lado a lado con su variación frente al periodo anterior, o si no dice cuando no
// hay con qué comparar.
it('el resumen compara cada restaurante con su periodo anterior', async () => {
  jest.mocked(orgSummary).mockResolvedValue({ currency: 'COP', dateFrom: '2026-10-01', dateTo: '2026-10-01', previousFrom: '2026-09-30', previousTo: '2026-09-30',
    restaurants: [{ configId: 1, name: 'Poblado', ...F(1200), previous: F(1000) }, { configId: 2, name: 'Laureles', ...F(500), previous: F(0) }],
    total: { ...F(1700), previous: F(1000) } })
  render(<SummaryView />)
  const poblado = await screen.findByRole('row', { name: /Poblado/ })
  expect(poblado).toHaveTextContent('$ 1.200')
  expect(poblado).toHaveTextContent('↑ 20 %')
  expect(screen.getByRole('row', { name: /Laureles/ })).toHaveTextContent('sin periodo anterior')
  expect(within(screen.getByLabelText('Total de la organización')).getByText('$ 1.700')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))
  await waitFor(() => expect(orgSummary).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), expect.any(String)))
})

// Falla si un cuadre fuera de tolerancia no se distingue, si el filtro no pide solo las diferencias, si el encargado
// puede cambiar la tolerancia o si ve otros restaurantes.
it('los cuadres de caja muestran la diferencia y respetan quién fija la tolerancia', async () => {
  jest.mocked(cashSettings).mockResolvedValue({ tolerance: 2000, currency: 'COP' })
  jest.mocked(cashClosings).mockResolvedValue([
    { sessionId: 9, name: 'POS/0009', configId: 1, configName: 'Poblado', closedAt: '2026-10-01T23:00:00Z', closedBy: { userId: 7, name: 'Laura Encargada' },
      expected: 100000, counted: 88000, difference: -12000, notes: 'Faltó un billete', overTolerance: true },
    { sessionId: 8, name: 'POS/0008', configId: 1, configName: 'Poblado', closedAt: '2026-09-30T23:00:00Z', closedBy: null, expected: 50000, counted: 50000, difference: 0, notes: '', overTolerance: false },
  ])
  const { unmount } = render(<CashClosingsView restaurants={R} canSetTolerance />)
  const row = await screen.findByRole('row', { name: /Faltó un billete/ })
  expect(row).toHaveTextContent('Laura Encargada')
  expect(row).toHaveTextContent('− $ 12.000')
  expect(screen.getByRole('row', { name: /POS\/0008/ })).toHaveTextContent('Cuadra')
  expect(cashClosings).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), [1, 2], false)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Solo con diferencia' }))
  await waitFor(() => expect(cashClosings).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), [1, 2], true))
  fireEvent.change(screen.getByLabelText('Tolerancia de diferencia ($)'), { target: { value: '5000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar tolerancia' }))
  await waitFor(() => expect(cashSettings).toHaveBeenLastCalledWith(5000))
  unmount()
  render(<CashClosingsView restaurants={[R[0]]} canSetTolerance={false} />)
  await screen.findByRole('row', { name: /Faltó un billete/ })
  expect(screen.queryByLabelText('Tolerancia de diferencia ($)')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Laureles' })).toBeNull()
  expect(cashClosings).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), [1], false)
})

// Falla si la rentabilidad no clasifica los platos, trata un plato sin costo como si tuviera margen, o deja al encargado
// pedir la organización entera.
it('la rentabilidad clasifica los platos y marca los que no tienen costo', async () => {
  const row = (templateId: number, name: string, menuClass: 'star' | 'dog' | null, cost: number | null) => ({ templateId, name, category: 'Platos', price: 30000, cost,
    margin: cost === null ? null : 30000 - cost, foodCostPct: cost === null ? null : (cost / 30000) * 100, units: 10, revenue: 300000, grossProfit: cost === null ? null : (30000 - cost) * 10, menuClass })
  jest.mocked(profitability).mockResolvedValue({ currency: 'COP', configId: null, dateFrom: '2026-10-01', dateTo: '2026-10-01', thresholds: { popularityUnits: 7, margin: 20000 },
    rows: [row(1, 'Hamburguesa', 'star', 9000), row(2, 'Ensalada triste', 'dog', 25000), row(3, 'Plato nuevo', null, null)] })
  const { unmount } = render(<ProfitabilityView restaurants={R} allowOrganization />)
  expect(await screen.findByRole('row', { name: /Hamburguesa/ })).toHaveTextContent('30 %')
  expect(screen.getByRole('row', { name: /Plato nuevo/ })).toHaveTextContent('Sin costo')
  expect(profitability).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), null)
  fireEvent.click(screen.getByRole('button', { name: /Perro/ }))
  expect(screen.queryByRole('row', { name: /Hamburguesa/ })).toBeNull()
  expect(screen.getByRole('row', { name: /Ensalada triste/ })).toBeInTheDocument()
  unmount()
  render(<ProfitabilityView restaurants={[R[1]]} allowOrganization={false} />)
  await screen.findByRole('row', { name: /Hamburguesa/ })
  expect(screen.queryByRole('button', { name: 'Toda la organización' })).toBeNull()
  expect(profitability).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 2)
})

// Falla si los enlaces viejos del POS (facturación, clientes, retorno) dejan al encargado en una pantalla del dueño o no
// llevan al dueño a su consola (plan Q).
it('los enlaces viejos llevan al dueño a la consola y al encargado a su inicio', () => {
  useAuthStore.setState({ user: { uid: 1, name: 'Dueña', companyId: 1, role: 'owner' }, employee: null, session: null })
  const { unmount } = render(<MovedToConsole to="/organizacion/facturacion" />)
  expect(replace).toHaveBeenLastCalledWith('/organizacion/facturacion')
  unmount()
  useAuthStore.setState({ user: { uid: 7, name: 'Laura', companyId: 1, role: 'admin' }, employee: { id: 4, name: 'Laura', code: null, role: 'admin', shift: null, userId: 7, checkIn: '', attendanceId: 1, token: 't', sessionEnds: null } })
  render(<MovedToConsole to="/organizacion/facturacion" />)
  expect(replace).toHaveBeenLastCalledWith('/dashboard')
})
