import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { RoiView } from '@/components/business/RoiView'
import { messages } from '@/lib/i18n/messages'
import { listPaidOrders, type PaidOrder } from '@/lib/services/roi'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { Catalog, Settings } from '@/lib/types'

jest.mock('@/lib/services/roi', () => ({ listPaidOrders: jest.fn() }))

const SETTINGS = { configId: 1, configName: 'Salón', waiterCanCharge: true, waiterCanEditInventory: false, alertLateMinutes: 18, alertBillMinutes: 10, roiHourCost: 20000, roiMinutesPerOrder: 30, roiBaselineHoursPer100: 18, roiMonthlyCost: 3000000, roiStartDate: null, tipProductId: null } as Settings
const setSettings = (over: Partial<Settings> = {}) => useCatalogStore.setState({ catalog: { settings: { ...SETTINGS, ...over } } as Catalog })
const order = (id: number, paidAt: string, origin: PaidOrder['origin']): PaidOrder => ({ id, total: 50000, origin, paidAt })
const mount = () => render(<NextIntlClientProvider locale="es" messages={messages}><RoiView /></NextIntlClientProvider>)

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2026, 9, 15, 12, 0, 0), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] })
  jest.clearAllMocks()
  setSettings()
})
afterEach(() => { jest.useRealTimers() })

// Falla si no se piden los pedidos de los tres últimos meses de una vez, si el ahorro del mes no sale solo de los
// pedidos que no tomó el mesero, o si el subtítulo no compara con «antes de ProjectApp» sin fecha de inicio.
it('calcula el retorno del mes con los pedidos autónomos', async () => {
  jest.mocked(listPaidOrders).mockResolvedValue([
    order(1, '2026-10-05 15:00:00', 'diner'), order(2, '2026-10-06 15:00:00', 'ai'), order(3, '2026-10-07 15:00:00', 'waiter'),
    order(4, '2026-09-10 15:00:00', 'diner'),
  ])
  mount()
  expect(screen.getByRole('status')).toHaveTextContent('…')
  expect(listPaidOrders).toHaveBeenCalledWith(expect.stringMatching(/^2026-08-0[1]|^2026-07-31/), expect.stringMatching(/^2026-11-01|^2026-10-31/))
  expect(await screen.findByText('Ahorro laboral estimado')).toBeInTheDocument()
  expect(screen.getByText('Octubre 2026 · comparado con antes de ProjectApp')).toBeInTheDocument()
  // Dos pedidos autónomos × 30 min = 1 hora × $ 20.000.
  expect(screen.getByText('$ 20.000')).toBeInTheDocument()
  expect(screen.getByText('1 horas de atención que ya no se pagan')).toBeInTheDocument()
  // Septiembre tuvo la mitad de ahorro: +100 %.
  expect(screen.getByText('100%')).toBeInTheDocument()
  expect(screen.getByText('Primer mes de uso')).toBeInTheDocument()
  expect(screen.getByText('Agosto')).toBeInTheDocument(); expect(screen.getByText('Septiembre')).toBeInTheDocument()
})

// Falla si cambiar de periodo no vuelve a pedir los pedidos de ese rango, o si con fecha de inicio no se compara con
// el periodo anterior.
it('cambia a semana y compara con la semana anterior', async () => {
  setSettings({ roiStartDate: '2026-05-01' })
  jest.mocked(listPaidOrders).mockResolvedValue([])
  mount()
  expect(await screen.findByText('5 meses de uso')).toBeInTheDocument()
  expect(screen.getByText('Octubre 2026 · comparado con Septiembre 2026')).toBeInTheDocument()
  expect(screen.getByText('5 meses de uso')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Mes' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Semana' }))
  expect(await screen.findByText('Semana del 12 de octubre · comparado con Semana del 5 de octubre')).toBeInTheDocument()
  expect(listPaidOrders).toHaveBeenCalledTimes(2)
  expect(listPaidOrders).toHaveBeenLastCalledWith(expect.stringMatching(/^2026-09-2[89]/), expect.stringMatching(/^2026-10-1[89]/))
})

// Falla si la respuesta de un periodo anterior se pinta como si fuera la del periodo elegido.
it('mientras llega el nuevo periodo muestra que carga', async () => {
  jest.mocked(listPaidOrders).mockResolvedValueOnce([])
  let resolve!: (o: PaidOrder[]) => void
  jest.mocked(listPaidOrders).mockReturnValueOnce(new Promise((r) => { resolve = r }))
  mount()
  await screen.findByText('Ahorro laboral estimado')
  fireEvent.click(screen.getByRole('button', { name: 'Año' }))
  expect(screen.getByRole('status')).toHaveTextContent('…')
  await act(async () => resolve([]))
  expect(screen.getByText('2026 · comparado con antes de ProjectApp')).toBeInTheDocument()
})

// Falla si sin carta cargada la pantalla intenta calcular con ajustes inexistentes.
it('sin carta no pinta nada', () => {
  useCatalogStore.setState({ catalog: null })
  jest.mocked(listPaidOrders).mockResolvedValue([])
  const { container } = mount()
  expect(container).toBeEmptyDOMElement()
})
