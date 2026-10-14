import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import HistorialPage from '@/app/(pos)/historial/page'
import { messages } from '@/lib/i18n/messages'
import type { KitLine, KitOrder } from '@/lib/domain/orderState'
import { useNetworkStore } from '@/lib/offline/network'
import { getKitOrderLines, listHistoryOrders } from '@/lib/services/ordersKit'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { toast } from '@/lib/stores/toastStore'

jest.mock('@/lib/services/ordersKit', () => ({ listHistoryOrders: jest.fn(), getKitOrderLines: jest.fn() }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
// El recibo imprimible pide los datos del emisor; sin red real esa petición marcaría el POS sin conexión.
jest.mock('@/lib/services/issuer', () => ({ useIssuer: () => null }))
// El modal de devolución tiene sus propias pruebas; aquí basta con que avise de una devolución hecha.
jest.mock('@/components/history/RefundModal', () => ({
  RefundModal: ({ number, onDone, onClose }: { number: string; onDone: (r: unknown) => void; onClose: () => void }) => (
    <div role="dialog" aria-label={`Devolver ${number}`}>
      <button type="button" onClick={() => onDone({ refund: { total: 15000 }, credit_note: { number: 'NC-0007' } })}>Confirmar con nota</button>
      <button type="button" onClick={() => onDone({ refund: { total: 8000 }, credit_note: null })}>Confirmar sin nota</button>
      <button type="button" onClick={onClose}>Cerrar</button>
    </div>
  ),
}))

const order = (id: number, over: Partial<KitOrder> = {}): KitOrder => ({ id, number: `DI00${id}`, type: 'dine_in', state: 'paid', tableId: 7, tableNumber: 12, customer: '', startedAt: '2026-10-04 15:00:00',
  total: 50000, tax: 4000, lines: [], courses: [], ...over })
const line = (id: number, name: string, total: number): KitLine => ({ id, uuid: `l${id}`, productId: id, name, qty: 2, unitPrice: total / 2, subtotal: total, total, note: '', courseId: null, readyAt: null, servedAt: null })
const orders = [order(1, { customer: 'Laura' }), order(2, { type: 'takeout', tableId: null, tableNumber: null, customer: 'Pedro', total: 20000, tax: 0 }), order(3, { type: 'delivery', customer: 'Marta' })]

function as(role: 'admin' | 'cashier' | 'waiter', rolePermissions?: unknown) {
  useAuthStore.setState({ user: { uid: 1, name: 'Persona', companyId: 1, role } as never, employee: { role } as never })
  useCatalogStore.setState({ catalog: { tables: [{ id: 7, number: 12 }], company: { name: 'Burger House' }, settings: { rolePermissions } } as never })
}
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><HistorialPage /></NextIntlClientProvider>)
const rows = () => screen.queryAllByRole('button', { name: /^Pedido# / }).map((b) => b.getAttribute('aria-label'))
const bill = () => screen.getByRole('complementary', { name: 'Información de la cuenta' })

beforeEach(() => {
  jest.clearAllMocks()
  useNetworkStore.setState({ online: true })
  jest.mocked(listHistoryOrders).mockResolvedValue(orders)
  jest.mocked(getKitOrderLines).mockResolvedValue([line(100, 'Hamburguesa', 46000)])
  as('admin')
})

// Falla si el historial se pide antes de tener la carta, o si el buscador y los chips por tipo no filtran (por número,
// cliente o tipo de pedido); también si sin resultados no se dice.
it('busca por número o cliente y filtra por tipo', async () => {
  useCatalogStore.setState({ catalog: null })
  const { rerender } = wrap()
  expect(listHistoryOrders).not.toHaveBeenCalled()
  as('admin')
  rerender(<NextIntlClientProvider locale="es" messages={messages}><HistorialPage /></NextIntlClientProvider>)
  await waitFor(() => expect(rows()).toEqual(['Pedido# DI001', 'Pedido# DI002', 'Pedido# DI003']))
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por número o cliente' }), { target: { value: 'pedro' } })
  expect(rows()).toEqual(['Pedido# DI002'])
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por número o cliente' }), { target: { value: '#di003' } })
  expect(rows()).toEqual(['Pedido# DI003'])
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por número o cliente' }), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Domicilio' }))
  expect(rows()).toEqual(['Pedido# DI003'])
  fireEvent.click(screen.getByRole('button', { name: 'Para llevar' }))
  expect(rows()).toEqual(['Pedido# DI002'])
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar por número o cliente' }), { target: { value: 'Laura' } })
  expect(rows()).toEqual([])
  expect(screen.getByText('Aún no hay pedidos pagados.')).toBeInTheDocument()
})

// Falla si un error de red deja el historial cargando para siempre en vez de mostrar la lista vacía.
it('si el historial no carga, deja de mostrar el esqueleto', async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  jest.mocked(listHistoryOrders).mockRejectedValueOnce(new Error('sin red'))
  wrap()
  expect(await screen.findByText('Aún no hay pedidos pagados.')).toBeInTheDocument()
})

// Falla si al elegir un pedido la cuenta no trae sus platos, o si el subtotal no es el total menos impuestos.
it('elegir un pedido muestra su cuenta con subtotal, impuestos y total', async () => {
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Pedido# DI001' }))
  expect(screen.getByRole('button', { name: 'Pedido# DI001' })).toHaveAttribute('aria-pressed', 'true')
  await waitFor(() => expect(getKitOrderLines).toHaveBeenCalledWith(1))
  expect(await within(bill()).findByText('Hamburguesa')).toBeInTheDocument()
  expect(within(bill()).getByText('Laura')).toBeInTheDocument()
  expect(within(bill()).getByText('Subtotal').nextSibling).toHaveTextContent('$ 46.000')
  expect(within(bill()).getByText('Impuestos').nextSibling).toHaveTextContent('$ 4.000')
  expect(within(bill()).getByText('Total a pagar').nextSibling).toHaveTextContent('$ 50.000')
})

// Falla si un mesero o un cajero sin permiso pueden devolver dinero, si el encargado no puede, si el permiso dado por la
// configuración de roles no se respeta, o si se permite devolver sin conexión.
it('devolver es del encargado o de quien tenga el permiso, y solo con conexión', async () => {
  const canRefund = async () => {
    const view = wrap()
    fireEvent.click(await screen.findByRole('button', { name: 'Pedido# DI001' }))
    const has = within(bill()).queryByRole('button', { name: 'Devolver' }) !== null
    view.unmount()
    return has
  }
  as('waiter')
  expect(await canRefund()).toBe(false)
  as('cashier')
  expect(await canRefund()).toBe(false)
  as('cashier', { waiter: { views: [], actions: [] }, cashier: { views: [], actions: ['refund_orders'] }, admin: { views: [], actions: [] } })
  expect(await canRefund()).toBe(true)
  as('admin')
  expect(await canRefund()).toBe(true)
  useNetworkStore.setState({ online: false })
  expect(await canRefund()).toBe(false)
})

// Falla si tras una devolución no se avisa el monto devuelto y la nota crédito emitida, o si el historial no se relee
// para mostrar lo devuelto.
it('una devolución hecha avisa el monto y relee el historial', async () => {
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Pedido# DI001' }))
  fireEvent.click(within(bill()).getByRole('button', { name: 'Devolver' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Devolver DI001' })).getByRole('button', { name: 'Confirmar con nota' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(toast).toHaveBeenCalledWith({ title: 'Devolución de $ 15.000 registrada', body: 'Se emitió la nota crédito NC-0007.' })
  await waitFor(() => expect(listHistoryOrders).toHaveBeenCalledTimes(2))
  fireEvent.click(within(bill()).getByRole('button', { name: 'Devolver' }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar sin nota' }))
  expect(toast).toHaveBeenLastCalledWith({ title: 'Devolución de $ 8.000 registrada', body: 'El dinero sale del cuadre de esta caja.' })
  fireEvent.click(within(bill()).getByRole('button', { name: 'Devolver' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

// Falla si un pedido ya devuelto del todo ofrece devolver otra vez (se devolvería dos veces el mismo dinero).
it('un pedido devuelto del todo no ofrece devolver', async () => {
  jest.mocked(listHistoryOrders).mockResolvedValue([order(1, { refunded: 50000 })])
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Pedido# DI001' }))
  await within(bill()).findByText('Hamburguesa')
  expect(within(bill()).getByText('Devuelto').nextSibling).toHaveTextContent('− $ 50.000')
  expect(within(bill()).queryByRole('button', { name: 'Devolver' })).toBeNull()
})

// Falla si, al tocar un pedido y luego otro rápido, la respuesta tardía del primero pisa las líneas del segundo y la
// cuenta del pedido elegido queda sin platos (error real que encontró esta prueba; corregido el 2026-10-04).
it('las líneas que llegan tarde de otro pedido no borran la cuenta elegida', async () => {
  let first: (l: KitLine[]) => void = () => undefined
  jest.mocked(getKitOrderLines).mockImplementation((id: number) => id === 1 ? new Promise((r) => { first = r }) : Promise.resolve([line(200, 'Perro caliente', 16000)]))
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Pedido# DI001' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pedido# DI002' }))
  expect(await within(bill()).findByText('Perro caliente')).toBeInTheDocument()
  await act(async () => { first([line(100, 'Hamburguesa', 46000)]) })
  expect(within(bill()).getByText('Perro caliente')).toBeInTheDocument()
})
