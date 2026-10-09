import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { SalesView } from '@/components/business/SalesView'
import { messages } from '@/lib/i18n/messages'
import { closeRegister, closingData } from '@/lib/services/cashRegister'
import { downloadExport } from '@/lib/services/core/exports'
import { salesSummary as summaryRequest } from '@/lib/services/core/sales'
import { listShifts } from '@/lib/services/sales'

const auth = { session: null as { id: number; configId: number } | null, refreshSession: jest.fn(), user: { role: 'admin' } }
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: (select?: (s: unknown) => unknown) => (select ? select(auth) : auth) }))
// La carta es estable entre renders, como en la tienda real: un objeto nuevo en cada render rehacía las consultas sin fin.
const catalog = { tables: [{ id: 5, number: 12 }], settings: { configId: 3 } }
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog }) }))
jest.mock('@/lib/services/cashRegister', () => ({ cashInOut: jest.fn(), closeRegister: jest.fn(), closingData: jest.fn() }))
jest.mock('@/lib/services/business', () => ({ cashSettings: jest.fn().mockResolvedValue({ tolerance: 0, currency: 'COP' }) }))
jest.mock('@/lib/services/core/exports', () => ({ downloadExport: jest.fn(async (kind: string) => `${kind}.csv`) }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
// El resumen del periodo es el de verdad (lib/services/sales) sobre el cliente HTTP `sales/summary`, que se simula: así se
// cuenta cuántas veces lo pide la pantalla.
const SUMMARY = {
  total: 300000, orders: 4, autonomous: 1, by_method: [{ method: 'Efectivo', amount: 200000 }, { method: 'Tarjeta', amount: 100000 }],
  by_waiter: [{ waiter: 'Sofía', amount: 300000, orders: 4 }], top_products: [{ product: 'Hamburguesa', qty: 9, amount: 180000 }],
}
jest.mock('@/lib/services/core/sales', () => ({ salesSummary: jest.fn() }))
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 3 }))
jest.mock('@/lib/services/sales', () => ({
  ...jest.requireActual('@/lib/services/sales'),
  listShifts: jest.fn(),
  listSales: jest.fn(async () => [{ id: 81, reference: 'DI-081', paidAt: '2026-10-04 15:30:00', tableNumber: 12, waiter: 'Sofía', origin: 'waiter', total: 120000 }]),
}))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><SalesView /></NextIntlClientProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  auth.session = null
  jest.mocked(summaryRequest).mockResolvedValue(SUMMARY)
  jest.mocked(listShifts).mockResolvedValue([{ id: 7, name: 'Turno mañana', state: 'closed', startAt: '2026-10-03T13:00:00Z', stopAt: '2026-10-03T22:00:00Z', user: 'Carlos', total: 0, orders: 0 }])
})

// Falla si tras un cierre de caja rechazado por el servidor el encargado vuelve a ver «Forzar cierre», que anunciaba
// «Caja cerrada. El turno queda contabilizado en el servidor.» sin llamarlo y dejaba el turno abierto.
it('un cierre rechazado muestra el motivo del servidor sin ofrecer forzarlo', async () => {
  auth.session = { id: 7, configId: 3 }
  jest.mocked(closingData).mockResolvedValue({ ordersCount: 1, ordersTotal: 10000, expectedCash: 10000, openingCash: 0, cashPayments: 10000, cashMoves: [], otherMethods: [], draftOrders: 0, openingNotes: '' })
  jest.mocked(closeRegister).mockResolvedValue({ successful: false, message: 'Escribe por qué no cuadra la caja.' })
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Cerrar caja' }))
  const dialog = await screen.findByRole('dialog', { name: 'Cerrar caja' })
  fireEvent.change(within(dialog).getByLabelText(/Efectivo contado/), { target: { value: '10000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar caja' }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Escribe por qué no cuadra la caja.')
  expect(within(dialog).queryByRole('button', { name: /Forzar cierre/ })).toBeNull()
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
  await waitFor(() => expect(summaryRequest).toHaveBeenLastCalledWith(3, expect.objectContaining({ from: expect.any(String) })))
  const yesterday = jest.mocked(summaryRequest).mock.calls.at(-1)![1] as { from: string; to: string }
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

// Falla si Ventas vuelve a pedir el mismo resumen una vez por tarjeta: con «Este mes» eran 4 consultas iguales a
// `sales/summary` (indicadores, métodos, meseros y más vendidos), y las tarjetas podían mezclar respuestas distintas.
it('con «Este mes» pide el resumen del periodo una sola vez', async () => {
  wrap()
  await screen.findByText('Efectivo')
  jest.mocked(summaryRequest).mockClear()
  jest.mocked(summaryRequest).mockResolvedValueOnce({ ...SUMMARY, total: 900000, orders: 9, by_waiter: [{ waiter: 'Mateo', amount: 900000, orders: 9 }] })
  fireEvent.click(screen.getByRole('button', { name: 'Este mes' }))
  expect((await screen.findAllByText('$ 900.000'))[0]).toBeInTheDocument()
  expect(await screen.findByText('Mateo')).toBeInTheDocument()
  expect(summaryRequest).toHaveBeenCalledTimes(1)
})
