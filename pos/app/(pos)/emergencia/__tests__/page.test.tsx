import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import EmergenciaPage from '@/app/(pos)/emergencia/page'
import { messages } from '@/lib/i18n/messages'
import { useEmergencyOrders, type EmergencyOrder } from '@/lib/offline/emergency'
import { useOutboxStore, type OutboxEntry } from '@/lib/offline/outbox'
import { printReceipt } from '@/lib/print/settings'
import { closingData } from '@/lib/services/cashRegister'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

jest.mock('@/lib/services/cashRegister', () => ({ closingData: jest.fn() }))
jest.mock('@/lib/print/settings', () => ({ printReceipt: jest.fn() }))
// El cobro, la ronda y el recibo tienen sus propias pruebas; aquí basta saber con qué se abren.
jest.mock('@/components/payment/PaymentModal', () => ({ PaymentModal: ({ orderId, onClose }: { orderId: number; onClose: () => void }) => <div role="dialog" aria-label={`Cobro ${orderId}`}><button onClick={onClose}>Cerrar cobro</button></div> }))
jest.mock('@/components/orders/AddRoundScreen', () => ({ AddRoundScreen: ({ orderId, returnTo, onDone }: { orderId: number; returnTo: string; onDone: () => void }) => <div role="dialog" aria-label={`Ronda ${orderId} ${returnTo}`}><button onClick={onDone}>Listo ronda</button></div> }))
jest.mock('@/components/pay/PrintableReceipt', () => ({ PrintableReceipt: ({ data }: { data: unknown }) => <pre data-testid="recibo">{JSON.stringify(data)}</pre> }))

const hoy = `${new Date().toLocaleDateString('en-CA')}T12:00:00`
const order = (localId: number, over: Partial<EmergencyOrder> = {}): EmergencyOrder => ({ uuid: `e${localId}`, localId, number: `E-${-localId}`, type: 'dine_in', tableId: 1, tableNumber: 4, customer: '',
  createdAt: hoy, lines: [{ uuid: `l${localId}`, productId: 1, name: 'Hamburguesa', qty: 2, unitPrice: 25000, total: 50000, note: '', options: [] }], total: 50000, tax: 4000, paid: false, fired: true, ...over })
const base: Record<string, unknown> = { at: '', attempts: 0 }
const entries = [
  { ...base, kind: 'payment', order: { uuid: 'e-1' }, methodId: 1, amount: 20000, received: 20000, reference: '', requestKey: 'k1', cash: true },
  { ...base, kind: 'payment', order: { uuid: 'e-2' }, methodId: 2, amount: 'balance', received: null, reference: '', requestKey: 'k2', expected: 15000, cash: false },
  { ...base, kind: 'cash_move', shiftId: 7, type: 'in', amount: 5000, reason: 'Sencillo' },
  { ...base, kind: 'cash_move', shiftId: 7, type: 'out', amount: 3000, reason: 'Hielo' },
  { ...base, kind: 'cash_move', shiftId: 6, type: 'in', amount: 99000, reason: 'Turno anterior' },
] as unknown as OutboxEntry[]

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><EmergenciaPage /></NextIntlClientProvider>)
const row = (label: string) => screen.getByText(label).parentElement!.textContent
// Espera a que llegue el esperado del servidor, para que la pantalla quede quieta antes de mirar.
const ready = () => waitFor(() => expect(row('Efectivo esperado al perder la red')).toContain('100.000'))
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(closingData).mockResolvedValue({ expectedCash: 100000 } as never)
  useAuthStore.setState({ session: { id: 7, configId: 4, state: 'opened' } })
  useCatalogStore.setState({ catalog: { company: { name: 'Burger House' } } as never })
  useOutboxStore.setState({ entries: [] })
  useEmergencyOrders.setState({ orders: [], loaded: true })
})

// Falla si un pedido viejo ya sincronizado sigue saliendo, si uno viejo sin sincronizar se pierde de la lista, si el
// orden no es del más nuevo al más viejo, o si se puede cobrar o agregar a un pedido cobrado o ya en el servidor.
it('lista los pedidos de emergencia con su estado y solo deja cobrar los abiertos sin sincronizar', async () => {
  useEmergencyOrders.setState({ orders: [
    order(-1, { createdAt: '2020-01-01T10:00:00Z', serverId: 50, serverNumber: 'DI-050' }),
    order(-2, { createdAt: '2020-01-01T11:00:00Z', tableNumber: null, customer: 'Ana' }),
    order(-3, { paid: true, tableNumber: null }),
    order(-4, { serverId: 51, serverNumber: 'DI-051' }),
    order(-5),
  ] })
  wrap()
  await ready()
  const items = within(screen.getByRole('region', { name: 'Pedidos' })).getAllByRole('listitem')
  expect(items.map((li) => li.querySelector('p')!.textContent)).toEqual(['E-5', 'E-4 → DI-051', 'E-3', 'E-2'])
  const [abierto, sincronizado, cobrado, viejo] = items
  expect(within(abierto).getByText('Sin cobrar')).toBeInTheDocument()
  expect(within(abierto).getByText('Mesa 4')).toBeInTheDocument()
  expect(within(abierto).getByRole('button', { name: /Cobrar/ })).toBeInTheDocument()
  expect(within(sincronizado).getByText('En el servidor')).toBeInTheDocument()
  expect(within(sincronizado).queryByRole('button', { name: /Cobrar/ })).toBeNull()
  expect(within(cobrado).getByText('Cobrado')).toBeInTheDocument()
  expect(within(cobrado).getByText('Para llevar')).toBeInTheDocument()
  expect(within(cobrado).queryByRole('button', { name: /Agregar/ })).toBeNull()
  expect(within(viejo).getByText('Ana')).toBeInTheDocument()
  expect(within(viejo).getByRole('button', { name: /Agregar/ })).toBeInTheDocument()
})

// Falla si sin pedidos no se dice que no hay, o si «Nuevo pedido» no lleva al asistente que funciona sin red.
it('sin pedidos lo dice y ofrece crear uno', async () => {
  wrap()
  await ready()
  expect(screen.getByText('Aún no hay pedidos de emergencia.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Nuevo pedido/ })).toHaveAttribute('href', '/pedidos/nuevo')
})

// Falla si cobrar o agregar ronda no se abren sobre el pedido local correcto (id negativo, sin red no hay dirección
// /pago/<id>), si la ronda no vuelve a esta pantalla, o si no se cierran al terminar.
it('cobra y agrega ronda al pedido local en la misma pantalla', async () => {
  useEmergencyOrders.setState({ orders: [order(-2)] })
  wrap()
  await ready()
  fireEvent.click(screen.getByRole('button', { name: /Cobrar/ }))
  expect(screen.getByRole('dialog', { name: 'Cobro -2' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar cobro' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Agregar/ }))
  expect(screen.getByRole('dialog', { name: 'Ronda -2 /emergencia' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Listo ronda' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

// Falla si el arqueo provisional no parte del efectivo esperado por el servidor, si suma los cobros con datáfono al
// efectivo, si cuenta movimientos de caja de otro turno o si resta mal las salidas.
it('el arqueo provisional suma lo hecho sin red sobre el efectivo esperado', async () => {
  useOutboxStore.setState({ entries })
  wrap()
  await waitFor(() => expect(row('Efectivo esperado al perder la red')).toContain('100.000'))
  expect(closingData).toHaveBeenCalledWith(7)
  expect(row('Cobros en efectivo sin conexión')).toContain('20.000')
  expect(row('Cobros con datáfono sin conexión')).toContain('15.000')
  expect(row('Entradas de efectivo')).toContain('5.000')
  expect(row('Salidas de efectivo')).toMatch(/-\s?3\.000/)
  expect(row('Efectivo esperado ahora')).toContain('122.000')
})

// Falla si, sin respuesta del servidor (lo normal sin red), el arqueo se rompe en vez de partir de cero, o si sin caja
// abierta se pide el cierre al servidor.
it('sin el esperado del servidor parte de cero y sin caja no lo pide', async () => {
  jest.mocked(closingData).mockRejectedValue(new Error('sin red'))
  useOutboxStore.setState({ entries: entries.slice(0, 1) })
  const { unmount } = wrap()
  await waitFor(() => expect(closingData).toHaveBeenCalled())
  expect(row('Efectivo esperado ahora')).toContain('20.000')
  unmount()
  jest.clearAllMocks()
  useAuthStore.setState({ session: null })
  wrap()
  expect(closingData).not.toHaveBeenCalled()
})

// Falla si la precuenta no lleva el nombre del local, la mesa, el número provisional y el total con su impuesto
// separado, o si no se manda a imprimir.
it('imprime la precuenta del pedido', async () => {
  useEmergencyOrders.setState({ orders: [order(-2)] })
  wrap()
  await ready()
  fireEvent.click(screen.getByRole('button', { name: /Precuenta/ }))
  const data = JSON.parse(screen.getByTestId('recibo').textContent!)
  expect(data).toMatchObject({ company: 'Burger House', tableNumber: 4, reference: 'E-2', subtotal: 46000, tax: 4000, total: 50000, tip: 0, payments: [] })
  expect(data.lines).toEqual([{ uuid: 'l-2', name: 'Hamburguesa', qty: 2, unitPrice: 25000, total: 50000 }])
  await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.queryByTestId('recibo')).toBeNull())
})

// Falla si «Imprimir arqueo» no deja la hoja del arqueo en el documento con el efectivo esperado, o no imprime.
it('imprime el arqueo provisional', async () => {
  useOutboxStore.setState({ entries })
  const { container } = wrap()
  await waitFor(() => expect(row('Efectivo esperado ahora')).toContain('122.000'))
  fireEvent.click(screen.getByRole('button', { name: /Imprimir arqueo/ }))
  const hoja = container.querySelector('.receipt')!
  expect(hoja.textContent).toContain('Burger House')
  expect(hoja.textContent).toContain('ARQUEO PROVISIONAL')
  expect(hoja.textContent).toContain('Efectivo esperado ahora: $ 122.000')
  await waitFor(() => expect(printReceipt).toHaveBeenCalledTimes(1))
})
