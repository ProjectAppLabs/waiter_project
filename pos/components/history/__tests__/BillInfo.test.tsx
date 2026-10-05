import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { BillInfo } from '@/components/history/BillInfo'
import type { KitLine, KitOrder } from '@/lib/domain/orderState'
import { messages } from '@/lib/i18n/messages'
import { printReceipt } from '@/lib/print/settings'

jest.mock('@/lib/print/settings', () => ({ ...jest.requireActual('@/lib/print/settings'), printReceipt: jest.fn() }))

const line = (over: Partial<KitLine>): KitLine => ({ id: 1, uuid: 'u1', productId: 9, name: 'Hamburguesa', qty: 2, unitPrice: 25000, subtotal: 50000, total: 50000, note: '', courseId: null, readyAt: null, servedAt: null, ...over })
const LINES = [line({}), line({ id: 2, uuid: 'u2', name: 'Limonada', qty: 1, unitPrice: 9520, subtotal: 9520, total: 9520 })]
const order = (over: Partial<KitOrder> = {}): KitOrder => ({ id: 7, number: 'DI-007', type: 'dine_in', state: 'paid', tableId: 3, tableNumber: 4, customer: 'Ana', startedAt: '2026-10-03 18:30:00', total: 59520, tax: 4520, lines: LINES, courses: [], ...over })
const mount = (o: KitOrder | null, onRefund?: () => void) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><BillInfo order={o} lines={o ? LINES : []} company="Burger House" onRefund={onRefund} /></NextIntlClientProvider>)
const bill = () => screen.getAllByRole('complementary', { name: 'Información de la cuenta' })[0]

beforeEach(() => jest.clearAllMocks())

// Falla si sin pedido elegido no se invita a tocar uno de la lista.
it('sin pedido invita a elegir uno', () => {
  mount(null)
  expect(bill()).toHaveTextContent('Selecciona una cuenta')
  expect(screen.queryByRole('button', { name: /Imprimir/ })).not.toBeInTheDocument()
})

// Falla si la cuenta no muestra mesa, cliente, número y tipo, las líneas con unitario y cantidad, o si el subtotal no
// descuenta los impuestos del total.
it('muestra cabecera, líneas y totales de la cuenta', () => {
  mount(order())
  const b = bill()
  expect(b).toHaveTextContent('Ana'); expect(b).toHaveTextContent('Pedido# DI-007 / En mesa')
  expect(within(b).getByText('4')).toBeInTheDocument()
  const items = within(b).getAllByRole('listitem')
  expect(items[0]).toHaveTextContent('Hamburguesa'); expect(items[0]).toHaveTextContent('$ 25.000'); expect(items[0]).toHaveTextContent('x 2'); expect(items[0]).toHaveTextContent('$ 50.000')
  expect(within(b).getByText('Subtotal').nextSibling).toHaveTextContent('$ 55.000')
  expect(within(b).getByText('Impuestos').nextSibling).toHaveTextContent('$ 4.520')
  expect(within(b).getByText('Total a pagar').nextSibling).toHaveTextContent('$ 59.520')
  expect(within(b).queryByText('Devuelto')).not.toBeInTheDocument()
})

// Falla si un pedido sin cliente ni mesa sale sin nombre o con una mesa vacía.
it('sin cliente ni mesa dice «Sin nombre» y no pinta la mesa', () => {
  mount(order({ customer: '', tableNumber: null, type: 'takeout' }))
  expect(bill()).toHaveTextContent('Sin nombre')
  expect(bill()).toHaveTextContent('Para llevar')
})

// Falla si «Imprimir» no imprime el recibo, o si el recibo imprimible no está en la página con las líneas del pedido.
it('imprime el recibo del pedido', () => {
  mount(order())
  fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }))
  expect(printReceipt).toHaveBeenCalledTimes(1)
  expect(screen.getByText('1 × Limonada')).toBeInTheDocument()
  expect(screen.getByText('Burger House')).toBeInTheDocument()
})

// Falla si «Devolver» no aparece cuando se puede, si no avisa al tocarlo, o si lo devuelto no se resta a la vista.
it('ofrece devolver mientras quede algo y muestra lo devuelto', () => {
  const onRefund = jest.fn()
  const { unmount } = mount(order({ refunded: 10000 }), onRefund)
  expect(within(bill()).getByText('Devuelto').nextSibling).toHaveTextContent('− $ 10.000')
  fireEvent.click(screen.getByRole('button', { name: 'Devolver' }))
  expect(onRefund).toHaveBeenCalled()
  unmount()
  mount(order({ refunded: 59520 }), onRefund)
  expect(screen.queryByRole('button', { name: 'Devolver' })).not.toBeInTheDocument()
})

// Falla si se ofrece devolver cuando quien muestra la cuenta no permite devoluciones.
it('sin permiso de devolver no ofrece el botón', () => {
  mount(order())
  expect(screen.queryByRole('button', { name: 'Devolver' })).not.toBeInTheDocument()
})
