import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { PaymentModal } from '@/components/payment/PaymentModal'
import { messages } from '@/lib/i18n/messages'
import { loadLoyaltyProgram, readPayableOrder } from '@/lib/services/paymentKit'
import { useNetworkStore } from '@/lib/offline/network'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOrderStore } from '@/lib/stores/orderStore'
import type { Catalog } from '@/lib/types'

jest.mock('@/lib/services/paymentKit', () => ({ readPayableOrder: jest.fn(), loadLoyaltyProgram: jest.fn(), lookupMember: jest.fn(), redeemPoints: jest.fn() }))

const order = { id: 40, reference: '260-1-40', trackingNumber: '40', presetId: 1, presetName: 'Dine In', customerName: 'Zahir', tableId: 9, tableNumber: 'A8',
  date: '2026-09-07 12:24:00', total: 100000, tax: 15966, paid: 0, lines: [{ uuid: 'l1', name: 'Hamburguesa Angus', qty: 2, unitPrice: 36900, total: 100000, note: '' }] }
const catalog = { company: { name: 'Aurora' }, settings: { tipProductId: null }, products: [], categories: [], floors: [], tables: [],
  paymentMethods: [{ id: 1, name: 'Efectivo', type: 'cash' }, { id: 2, name: 'Tarjeta', type: 'bank' }] } as unknown as Catalog

beforeEach(() => {
  jest.clearAllMocks()
  ;(readPayableOrder as jest.Mock).mockResolvedValue(order)
  ;(loadLoyaltyProgram as jest.Mock).mockResolvedValue(null)
  useCatalogStore.setState({ catalog, status: 'ready' })
  // Una lectura sin simular deja la app «sin conexión»: cada prueba empieza con red.
  useNetworkStore.setState({ online: true })
  useOrderStore.setState({ busy: false, error: null, settle: jest.fn().mockResolvedValue(true) as never })
})

const show = (onPaid = jest.fn()) => {
  render(<NextIntlClientProvider locale="es" messages={messages}><PaymentModal orderId={40} onClose={jest.fn()} onPaid={onPaid} /></NextIntlClientProvider>)
  return onPaid
}

// Falla si el efectivo no registra el pago real en el servidor o si el éxito deja de mostrar el cambio.
it('pays cash through orderStore.settle and shows the change', async () => {
  show()
  await userEvent.click(await screen.findByRole('button', { name: '100.000' }))
  await userEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }))
  const settle = useOrderStore.getState().settle as jest.Mock
  expect(settle.mock.calls[0][0]).toEqual({ tip: 0, payments: [{ methodId: 1, type: 'cash', amount: 100000, received: 100000, reference: '' }] })
  expect(settle.mock.calls[0][1]).toMatchObject({ existing: { orderId: 40, tableId: 9 } })
  expect(await screen.findByText('¡Pago exitoso!')).toBeInTheDocument()
  expect(screen.getByText('Efectivo')).toBeInTheDocument()
})

// Falla si sin programa de fidelización la pantalla inventa puntos en vez de decir que no hay programa.
it('says there is no points programme when el servidor has none', async () => {
  show()
  expect(await screen.findByPlaceholderText('Sin programa de puntos')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Buscar' })).toBeDisabled()
})

// Falla si la pantalla de éxito vuelve a quedarse sin el documento en el DOM: la hoja de impresión solo deja
// visible `.receipt`, así que sin él "Imprimir cuenta" sacaba una hoja en blanco desde Pedidos.
it('mounts the printable cuenta de cobro after charging', async () => {
  const receipt = { company: 'Aurora', tableNumber: 8, reference: 'TA423', at: Date.now(), lines: [],
    subtotal: 84034, tax: 15966, tip: 0, total: 100000, payments: [{ method: 'Efectivo', amount: 100000, reference: '' }], change: 0 }
  useOrderStore.setState({ settle: jest.fn().mockResolvedValue(true) as never, receipt: receipt as never })
  show()
  await userEvent.click(await screen.findByRole('button', { name: '100.000' }))
  await userEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }))
  expect(await screen.findByText('¡Pago exitoso!')).toBeInTheDocument()
  expect(await screen.findByLabelText('Cuenta de cobro')).toBeInTheDocument()
})

// Falla si el documento vuelve a llevar solo el id interno de la mesa en vez del nombre que ve el cliente.
it('sends the table label the customer sees, not just the internal id', async () => {
  show()
  await userEvent.click(await screen.findByRole('button', { name: '100.000' }))
  await userEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }))
  const settle = useOrderStore.getState().settle as jest.Mock
  expect(settle.mock.calls[0][1]).toMatchObject({ tableLabel: 'A8' })
})

// Falla si vuelve a ser imposible repartir un cobro en importes libres. El reparto en partes iguales no
// sirve cuando el cliente dice "cárgame 40.000 a la tarjeta y el resto en efectivo"; era lo único que el
// cobro viejo desde Mesas hacía y esta pantalla no.
it('splits a payment into arbitrary amounts, not just equal parts', async () => {
  show()
  await userEvent.type(await screen.findByLabelText('Importe de este pago'), '40000')
  await userEvent.click(screen.getByRole('tab', { name: /Tarjeta/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Aprobado' }))

  // Queda pendiente el resto: la pantalla no puede dar el cobro por terminado.
  expect(useOrderStore.getState().settle).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('tab', { name: 'Efectivo' }))
  await userEvent.click(await screen.findByRole('button', { name: '100.000' }))
  await userEvent.click(screen.getByRole('button', { name: 'Pagar ahora' }))

  const settle = useOrderStore.getState().settle as jest.Mock
  expect(settle.mock.calls[0][0].payments.map((p: { amount: number }) => p.amount)).toEqual([40000, 60000])
})

// Falla si con dos datáfonos la pantalla cobra siempre por el primero: el cajero no podría cuadrar cada
// terminal al cierre.
it('lets the cashier choose between two methods of the same kind', async () => {
  useCatalogStore.setState({ catalog: { ...catalog, paymentMethods: [
    { id: 1, name: 'Efectivo', type: 'cash' }, { id: 2, name: 'Datáfono Bancolombia', type: 'bank' }, { id: 3, name: 'Datáfono Davivienda', type: 'bank' },
  ] } as unknown as Catalog, status: 'ready' })
  show()
  await userEvent.click(await screen.findByRole('tab', { name: /Tarjeta/ }))
  await userEvent.selectOptions(screen.getByLabelText('Método de pago'), '3')
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Aprobado' }))
  const settle = useOrderStore.getState().settle as jest.Mock
  expect(settle.mock.calls[0][0].payments[0].methodId).toBe(3)
})

// Cobertura trasladada del panel provisional de Mesas (components/pay/PayPanel), que se retira: la propina
// sugerida sube el total y el datáfono conserva el voucher que tecleó el cajero.
// Falla si la propina sugerida o el comprobante se pierden al cobrar.
it('applies the suggested tip and keeps the terminal voucher', async () => {
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'Más opciones' }))
  await userEvent.click(screen.getByRole('button', { name: /10 %/ }))
  await userEvent.click(screen.getByRole('tab', { name: /Tarjeta/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }))
  await userEvent.type(await screen.findByLabelText(/Voucher/), 'A1B2')
  await userEvent.click(screen.getByRole('button', { name: 'Aprobado' }))
  const settle = useOrderStore.getState().settle as jest.Mock
  expect(settle.mock.calls[0][0]).toEqual({ tip: 10000, payments: [{ methodId: 2, type: 'bank', amount: 110000, received: 110000, reference: 'A1B2' }] })
})

// Falla si "cuenta de cliente" (pay_later) vuelve a ofrecerse como forma de cobro: no cobra nada.
it('never offers pay later as a way to charge', async () => {
  useCatalogStore.setState({ catalog: { ...catalog, paymentMethods: [
    { id: 1, name: 'Efectivo', type: 'cash' }, { id: 9, name: 'Cuenta de cliente', type: 'pay_later' },
  ] } as unknown as Catalog, status: 'ready' })
  show()
  await userEvent.click(await screen.findByRole('tab', { name: /Tarjeta/ }))
  expect(screen.queryByText('Cuenta de cliente')).not.toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent(/método/i)
})

// Falla si sin conexión la caja ve el cobro normal (QR, puntos, propina) que no puede completarse, en vez del cobro
// sin conexión por el saldo del pedido.
it('sin conexión ofrece el cobro sin conexión por el saldo', async () => {
  useNetworkStore.setState({ online: false })
  ;(readPayableOrder as jest.Mock).mockResolvedValue({ ...order, paid: 20000 })
  render(<NextIntlClientProvider locale="es" messages={messages}><PaymentModal orderId={40} onClose={jest.fn()} onPaid={jest.fn()} /></NextIntlClientProvider>)
  expect(await screen.findByRole('dialog', { name: 'Cobrar sin conexión' })).toHaveTextContent('80.000')
  expect(screen.queryByRole('tab', { name: 'Código QR' })).toBeNull()
})
