import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { AddRoundScreen } from '@/components/orders/AddRoundScreen'
import { messages } from '@/lib/i18n/messages'
import type { KitOrder } from '@/lib/domain/orderState'
import { addRound, listTaxes } from '@/lib/services/ordersKit'
import { useOrderStore } from '@/lib/stores/orderStore'
import { toast } from '@/lib/stores/toastStore'
import type { Product } from '@/lib/types'

const push = jest.fn()
const product = (id: number, name: string, price: number, categoryIds = [1]): Product => ({ id, templateId: id, name, price, categoryIds, taxIds: [], favorite: false, storable: false, soldOut: false, hasImage: false })
const catalog = {
  products: [product(1, 'Hamburguesa', 20000), product(2, 'Limonada', 6000, [2]), product(3, 'Propina', 0, [])],
  categories: [{ id: 1, name: 'Platos', sequence: 1, station: null }, { id: 2, name: 'Bebidas', sequence: 2, station: null }],
}
const order = { id: 40, number: 'DI-040', type: 'dineIn', state: 'draft', tableId: 8, tableNumber: 8, customer: 'Ana', startedAt: '2026-10-04T15:00:00Z', total: 0, tax: 0, lines: [], courses: [] } as unknown as KitOrder
let kit = { orders: [order], loaded: true }
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ session: { id: 1 } }) }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog }) }))
jest.mock('@/lib/hooks/useKitOrders', () => ({ useKitOrders: () => kit }))
jest.mock('@/lib/services/ordersKit', () => ({ addRound: jest.fn(), listTaxes: jest.fn(async () => []) }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
jest.mock('@/lib/audio/sounds', () => ({ play: jest.fn() }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  kit = { orders: [order], loaded: true }
  catalog.products = [product(1, 'Hamburguesa', 20000), product(2, 'Limonada', 6000, [2]), product(3, 'Propina', 0, [])]
  jest.mocked(listTaxes).mockResolvedValue([])
  useOrderStore.getState().discard()
})

// Falla si Nueva ronda muestra 14.161 al agregar un plato cuyo precio final ya contiene el IVA excluido del 19 %.
it('muestra la base, el IVA y el precio final sin volver a gravarlo', async () => {
  catalog.products = [{ ...product(4, 'Plato gravado', 11900), taxIds: [19] }]
  jest.mocked(listTaxes).mockResolvedValue([{ id: 19, amount: 19, priceInclude: false }])
  wrap(<AddRoundScreen orderId={40} returnTo="/pedidos" />)
  const add = within(screen.getByRole('article', { name: 'Plato gravado' })).getByRole('button')
  await waitFor(() => expect(add).toBeEnabled())
  fireEvent.click(add)
  const cart = screen.getByRole('complementary', { name: 'Nueva ronda' })
  await waitFor(() => expect(within(cart).getByText('Subtotal').nextSibling).toHaveTextContent('$ 10.000'))
  expect(within(cart).getByText('Impuestos').nextSibling).toHaveTextContent('$ 1.900')
  expect(within(cart).getByText('Total a pagar').nextSibling).toHaveTextContent('$ 11.900')
})

// Falla si la ronda no se arma con lo que se toca en la carta (sumar, cambiar cantidad, quitar), si se envía al pedido
// equivocado o sin sus líneas, o si al enviar no vuelve a la pantalla de origen. También si un producto sin categoría
// (la propina) aparece en la carta.
it('arma la ronda, la envía al pedido y vuelve', async () => {
  jest.mocked(addRound).mockResolvedValue(41)
  wrap(<AddRoundScreen orderId={40} returnTo="/salon" />)
  const cart = screen.getByRole('complementary', { name: 'Nueva ronda' })
  expect(within(cart).getByText('Aún no hay platos en la ronda.')).toBeInTheDocument()
  expect(screen.queryByRole('article', { name: 'Propina' })).toBeNull()
  await waitFor(() => expect(within(screen.getByRole('article', { name: 'Hamburguesa' })).getByRole('button')).toBeEnabled())
  fireEvent.click(within(screen.getByRole('article', { name: 'Hamburguesa' })).getByRole('button'))
  fireEvent.click(within(screen.getByRole('article', { name: 'Limonada' })).getByRole('button'))
  fireEvent.click(within(cart).getByRole('button', { name: 'Más Hamburguesa' }))
  fireEvent.click(within(cart).getByRole('button', { name: 'Quitar Limonada' }))
  expect(within(cart).getByRole('listitem', { name: 'Hamburguesa' })).toHaveTextContent('40.000')
  expect(within(cart).queryByRole('listitem', { name: 'Limonada' })).toBeNull()
  fireEvent.click(within(cart).getByRole('button', { name: 'Guardar y enviar a cocina' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/salon'))
  expect(addRound).toHaveBeenCalledWith(40, [expect.objectContaining({ productId: 1, qty: 2 })], { number: 'DI-040', tableId: 8 })
  expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '¡Listo! El pedido #DI-040 va a cocina.' }))
})

// Falla si un error al enviar la ronda se pierde (sin aviso) o si igual se sale de la pantalla y se bota lo armado.
it('si el envío falla, avisa y no pierde la ronda', async () => {
  jest.mocked(addRound).mockRejectedValue(new Error('El pedido ya se cobró.'))
  wrap(<AddRoundScreen orderId={40} returnTo="/pedidos" />)
  await waitFor(() => expect(within(screen.getByRole('article', { name: 'Hamburguesa' })).getByRole('button')).toBeEnabled())
  fireEvent.click(within(screen.getByRole('article', { name: 'Hamburguesa' })).getByRole('button'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar y enviar a cocina' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'El pedido ya se cobró.', tone: 'danger' })))
  expect(push).not.toHaveBeenCalled()
  expect(screen.getByRole('listitem', { name: 'Hamburguesa' })).toBeInTheDocument()
})

// Falla si en emergencia (con `onDone`) la pantalla navega en vez de avisar, o si un pedido que no existe deja la
// carta abierta para enviar a ciegas.
it('en emergencia avisa al cerrar y explica si el pedido no existe', () => {
  const onDone = jest.fn()
  const { unmount } = wrap(<AddRoundScreen orderId={40} returnTo="/pedidos" onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(onDone).toHaveBeenCalled()
  expect(push).not.toHaveBeenCalled()
  unmount()
  kit = { orders: [], loaded: true }
  wrap(<AddRoundScreen orderId={99} returnTo="/pedidos" />)
  expect(screen.getByText('No se encontró el pedido.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Guardar y enviar a cocina' })).toBeNull()
})
