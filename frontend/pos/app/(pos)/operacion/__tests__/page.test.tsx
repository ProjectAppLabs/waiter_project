import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import OperacionPage from '@/app/(pos)/operacion/page'
import { messages } from '@/lib/i18n/messages'
import type { ShiftOrder } from '@/lib/services/ops'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOpsStore } from '@/lib/stores/opsStore'
import { useOrderStore } from '@/lib/stores/orderStore'

// El armazón y el botón de umbrales tienen sus propias pruebas.
jest.mock('@/components/kit/KitShell', () => ({ KitShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))
jest.mock('@/components/settings/AlertThresholdsButton', () => ({ AlertThresholdsButton: () => null }))

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const shiftOrder = (id: number, over: Partial<ShiftOrder>): ShiftOrder => ({ id, reference: `DI-0${id}`, tableId: null, tableNumber: null, waiter: 'Ana', origin: 'waiter', total: 30000, state: 'draft',
  kitchen: 'none', firedAt: null, startedAt: minutesAgo(30), ...over })
const orders = [
  shiftOrder(1, { tableId: 1, tableNumber: 5, kitchen: 'cooking', firedAt: minutesAgo(20) }),
  shiftOrder(2, { tableId: 2, tableNumber: 6, kitchen: 'cooking', firedAt: minutesAgo(2) }),
  shiftOrder(3, { tableId: 3, tableNumber: 7, state: 'paid', kitchen: 'served' }),
  shiftOrder(4, { origin: 'diner' }),
]
const refresh = jest.fn(async () => undefined)
const refreshShift = jest.fn(async () => undefined)
const refreshOpenOrders = jest.fn(async () => undefined)
const attendCall = jest.fn(async () => undefined)

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><OperacionPage /></NextIntlClientProvider>)
// La etiqueta del indicador va seguida de su valor; «En cocina» también es un estado de la tabla de pedidos.
const kpi = (label: string) => screen.getAllByText(label).find((e) => e.nextElementSibling?.classList.contains('text-2xl'))!.nextElementSibling!.textContent
const alertas = () => screen.getByRole('complementary', { name: 'Alertas' })
beforeEach(() => {
  jest.clearAllMocks()
  useAuthStore.setState({ session: { id: 7, configId: 4, state: 'opened' } })
  useCatalogStore.setState({ catalog: { settings: { alertLateMinutes: 15, alertBillMinutes: 10 }, tables: [{ id: 1, number: 5 }, { id: 2, number: 6 }, { id: 3, number: 7 }] } as never })
  useOrderStore.setState({ flags: { 2: { billing: true } } as never, calls: [{ tableId: 3, kind: 'assist', since: minutesAgo(1) }] as never, shift: { sales: 1250000 } as never,
    refreshShift, refreshOpenOrders, attendCall })
  useOpsStore.setState({ orders, autonomy: { autonomous: 1, total: 4 }, billingSince: { 2: Date.now() - 12 * 60_000 }, dismissed: {}, resolved: [], refresh })
})

// Falla si los indicadores cuentan pedidos pagados como activos, confunden lo que va a tiempo con lo demorado, no
// cuentan las cuentas pedidas o no muestran las ventas del turno.
it('los indicadores resumen el turno', () => {
  wrap()
  expect(kpi('Mesas activas')).toBe('2 / 3')
  expect(kpi('En cocina')).toBe('2')
  expect(kpi('Demorados')).toBe('1')
  expect(kpi('Por cobrar')).toBe('1')
  expect(kpi('Ventas del turno')).toBe('1.250.000')
  expect(screen.getByText('4 hoy · 1 autónomos')).toBeInTheDocument()
  expect(screen.getByText('3 cosas piden tu atención')).toBeInTheDocument()
})

// Falla si un plato demorado, una cuenta pedida hace rato o una llamada del comensal no salen como alerta, o si el
// filtro de cocina deja pasar alertas de mesas o de pagos.
it('muestra solo las excepciones y las filtra', () => {
  wrap()
  expect(within(alertas()).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Pedido demorado', 'Cuenta sin cobrar', 'Mesa pide mesero'])
  fireEvent.click(screen.getByRole('tab', { name: 'Cocina' }))
  expect(within(alertas()).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Pedido demorado'])
  fireEvent.click(screen.getByRole('tab', { name: 'Pagos' }))
  expect(within(alertas()).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Cuenta sin cobrar'])
  fireEvent.click(screen.getByRole('tab', { name: 'Mesas' }))
  expect(within(alertas()).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Mesa pide mesero'])
})

// Falla si «Voy yo» no atiende la llamada de esa mesa en el servidor, si la alerta no desaparece o si no queda en
// «Resueltas hoy».
it('atender una llamada la quita y la deja resuelta', () => {
  wrap()
  fireEvent.click(within(screen.getByRole('article', { name: 'Mesa pide mesero' })).getByRole('button', { name: 'Voy yo' }))
  expect(attendCall).toHaveBeenCalledWith(3)
  expect(screen.queryByRole('article', { name: 'Mesa pide mesero' })).toBeNull()
  expect(within(alertas()).getByText(/Mesa 7 atendida \(\d\d:\d\d\)/)).toBeInTheDocument()
  expect(screen.getByText('2 cosas piden tu atención')).toBeInTheDocument()
})

// Falla si ofrecer cortesía por un pedido demorado llama al mesero (no hay llamada que atender) o no lo deja resuelto.
it('ofrecer cortesía resuelve la demora sin atender llamadas', () => {
  wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Ofrecer cortesía' }))
  expect(attendCall).not.toHaveBeenCalled()
  expect(within(alertas()).getByText(/Cortesía ofrecida en mesa 5/)).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: 'Pedido demorado' })).toBeNull()
})

// Falla si sin excepciones la pantalla no se ve tranquila.
it('sin excepciones la pantalla está tranquila', () => {
  useOrderStore.setState({ flags: {}, calls: [] })
  useOpsStore.setState({ orders: [orders[1]] })
  wrap()
  expect(screen.getByText('Todo tranquilo')).toBeInTheDocument()
  expect(within(alertas()).getByText('Nada está mal. La pantalla está tranquila.')).toBeInTheDocument()
  expect(screen.getByText('Nada resuelto todavía')).toBeInTheDocument()
})

// Falla si la pantalla no lee pedidos, turno y cuentas al abrir y cada 10 s del turno abierto, o si sigue leyendo al
// salir (fugas del sondeo) o sin caja abierta.
it('sondea el turno cada 10 segundos solo con caja abierta', () => {
  jest.useFakeTimers()
  try {
    const { unmount } = wrap()
    expect(refresh).toHaveBeenCalledWith(7, expect.any(Function))
    expect((jest.mocked(refresh).mock.calls[0] as unknown as [number, (n: number) => number])[1](2)).toBe(6)
    expect(refreshShift).toHaveBeenCalledWith(7)
    expect(refreshOpenOrders).toHaveBeenCalledWith(7)
    act(() => { jest.advanceTimersByTime(10_000) })
    expect(refresh).toHaveBeenCalledTimes(2)
    unmount()
    act(() => { jest.advanceTimersByTime(30_000) })
    expect(refresh).toHaveBeenCalledTimes(2)
    jest.clearAllMocks()
    useAuthStore.setState({ session: null })
    wrap()
    act(() => { jest.advanceTimersByTime(10_000) })
    expect(refresh).not.toHaveBeenCalled()
  } finally { jest.useRealTimers() }
})

// Falla si la pantalla se pinta sin la carta (no hay umbrales ni mesas con que calcular).
it('sin la carta no pinta nada', () => {
  useCatalogStore.setState({ catalog: null })
  const { container } = wrap()
  expect(container).toBeEmptyDOMElement()
  expect(refresh).not.toHaveBeenCalled()
})
