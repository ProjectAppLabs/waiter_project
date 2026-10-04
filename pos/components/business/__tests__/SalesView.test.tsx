import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { SalesView } from '@/components/business/SalesView'
import { messages } from '@/lib/i18n/messages'
import { downloadExport } from '@/lib/services/core/exports'
import { listShifts, salesSummary } from '@/lib/services/sales'

const auth = { session: null, refreshSession: jest.fn(), user: { role: 'admin' } }
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: (select?: (s: unknown) => unknown) => (select ? select(auth) : auth) }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog: { tables: [{ id: 5, number: 12 }], settings: { configId: 3 } } }) }))
jest.mock('@/lib/services/cashRegister', () => ({ cashInOut: jest.fn(), closeRegister: jest.fn(), closingData: jest.fn(), forceCloseRegister: jest.fn() }))
jest.mock('@/lib/services/core/exports', () => ({ downloadExport: jest.fn(async (kind: string) => `${kind}.csv`) }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
jest.mock('@/lib/services/sales', () => ({
  SALES_LIST_LIMIT: 200,
  listShifts: jest.fn(),
  salesSummary: jest.fn(async () => ({ total: 300000, orders: 4, autonomous: 1 })),
  listSales: jest.fn(async () => [{ id: 81, reference: 'DI-081', paidAt: '2026-10-04 15:30:00', tableNumber: 12, waiter: 'Sofía', origin: 'waiter', total: 120000 }]),
  paymentsByMethod: jest.fn(async () => [{ method: 'Efectivo', amount: 200000 }, { method: 'Tarjeta', amount: 100000 }]),
  salesByWaiter: jest.fn(async () => [{ waiter: 'Sofía', amount: 300000, orders: 4 }]),
  topProducts: jest.fn(async () => [{ product: 'Hamburguesa', qty: 9, amount: 180000 }]),
}))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><SalesView /></NextIntlClientProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listShifts).mockResolvedValue([{ id: 7, name: 'Turno mañana', state: 'closed', startAt: '2026-10-03T13:00:00Z', stopAt: '2026-10-03T22:00:00Z', user: 'Carlos', total: 0, orders: 0 }])
})

// Falla si los indicadores (ventas, pedidos, ticket promedio, autónomos) no salen del resumen del periodo, o si las
// tarjetas por método, por mesero, más vendidos y la tabla de pedidos no muestran lo que llegó.
it('muestra los indicadores y el detalle del periodo', async () => {
  wrap()
  const sales = (await screen.findAllByText('$ 300.000'))[0]
  expect(sales).toBeInTheDocument()
  expect(screen.getByText('$ 75.000')).toBeInTheDocument()
  expect(screen.getByText('25%')).toBeInTheDocument()
  expect(screen.getByText('Efectivo')).toBeInTheDocument()
  expect(screen.getByText('Hamburguesa')).toBeInTheDocument()
  expect(screen.getByRole('row', { name: /#81/ })).toHaveTextContent('Mesa 12')
})

// Falla si cambiar el periodo no vuelve a consultar con ese rango, o si un rango imposible consulta o deja exportar.
it('el periodo manda la consulta y un rango inválido no exporta', async () => {
  wrap()
  await screen.findByText('Efectivo')
  fireEvent.click(screen.getByRole('button', { name: 'Ayer' }))
  await waitFor(() => expect(salesSummary).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'range' })))
  const yesterday = jest.mocked(salesSummary).mock.calls.at(-1)![0] as { from: string; to: string }
  expect(yesterday.from).toBe(yesterday.to)
  fireEvent.click(screen.getByRole('button', { name: 'Rango' }))
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2020-01-01' } })
  expect(screen.getByRole('status')).toHaveTextContent('Elige un rango válido')
  expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeDisabled()
})

// Falla si por turno el CSV no toma las fechas del turno elegido y el local del POS (plan Y1), o si exporta pagos
// cuando se pidió ventas.
it('exporta ventas y pagos del turno con sus fechas y el local', async () => {
  wrap()
  await screen.findByText('Efectivo')
  fireEvent.click(screen.getByRole('button', { name: 'Por turno' }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Exportar CSV/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }))
  fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Pagos' }))
  await waitFor(() => expect(downloadExport).toHaveBeenCalledWith('pagos', { from: '2026-10-03', to: '2026-10-03', restaurant_id: 3 }))
})
