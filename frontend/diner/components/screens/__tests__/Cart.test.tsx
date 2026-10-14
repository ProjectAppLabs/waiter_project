import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { Cart } from '@/components/screens/Cart'
import messages from '@/lib/i18n/messages/es.json'
import type { Cart as CartData, CartLine, Entry } from '@/lib/types'

const mockPush = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
const mockStore = { cart: null as CartData | null, busy: false, error: null as string | null, setQty: jest.fn(), remove: jest.fn(), confirm: jest.fn(), refreshCart: jest.fn(), ensureSession: jest.fn() }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => mockStore }))
// El contenedor se prueba con el genérico: la familia B registra su propio carrito bajo B (probado en families/B/__tests__).
jest.mock('@/components/templates/registry', () => ({ CART_LAYOUTS: {} }))

const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
const entry: Entry = { contexto: { restaurante: { slug: 'la-provincia', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: { numero: 14, token: '8H2KQ7' }, marca: brand }, carta: { restaurante: 'la-provincia', categorias: [] } }
const line = (over: Partial<CartLine>): CartLine => ({ id: 1, comensal: 'me', mio: true, producto_id: 3, nombre: 'Lomo a la parrilla', precio: 38900, cantidad: 2, nota: '', subtotal: 77800, ...over })
const cartOf = (lineas: CartLine[]): CartData => ({ sesion: 's', lineas, total: lineas.reduce((a, l) => a + l.subtotal, 0), mio: lineas.filter((l) => l.mio).reduce((a, l) => a + l.subtotal, 0), por_comensal: [] })
const tree = () => <NextIntlClientProvider locale="es" messages={messages}><Cart entry={entry} rest="la-provincia" venue="centro" token="8H2KQ7" id={null} /></NextIntlClientProvider>
const sendButton = () => screen.getByRole('button', { name: /Enviar a cocina · \$ 77\.800/ })

beforeEach(() => { jest.clearAllMocks(); mockStore.busy = false; mockStore.error = null })

// Falla si lo ajeno se puede editar, si "La mesa" no lo muestra bajo su título, o si los subtotales pierden la fuente mono.
it('renders my lines editable, the others read-only under La mesa, and both subtotals', () => {
  mockStore.cart = cartOf([line({ nota: 'sin cebolla' }), line({ id: 2, comensal: 'other', mio: false, producto_id: 4, nombre: 'Burrata italiana', precio: 32900, cantidad: 1, subtotal: 32900 })])
  render(tree())
  expect(screen.getByRole('heading', { name: 'Tu pedido' })).toHaveClass('t-title')
  expect(screen.getByText(/sin cebolla/)).toHaveClass('text-t-tinta-suave')
  expect(screen.queryByText('Burrata italiana')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'La mesa' }))
  expect(screen.getByText('Pedido por otros en la mesa').closest('section')).toHaveTextContent('Burrata italiana')
  expect(screen.getAllByRole('button', { name: 'Más' })).toHaveLength(1)
  expect(screen.getByText('$ 77.800')).toHaveClass('font-t-mono')
  expect(screen.getByText('$ 110.700')).toHaveClass('font-t-mono')
})

// Falla si "Enviar a cocina" no lleva al estado del pedido devuelto, si se puede tocar dos veces mientras envía, o si el montaje relee el carrito además de la página.
it('confirms and navigates to the order status with the returned id', async () => {
  mockStore.cart = cartOf([line({})])
  let finish!: (id: string) => void
  mockStore.confirm.mockReturnValue(new Promise<string>((resolve) => { finish = resolve }))
  render(tree())
  expect(mockStore.ensureSession).toHaveBeenCalledTimes(1)
  expect(mockStore.refreshCart).not.toHaveBeenCalled()
  fireEvent.click(sendButton())
  expect(await screen.findByRole('button', { name: 'Enviando…' })).toBeDisabled()
  finish('ord-9')
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/estado/ord-9'))
})

// Falla si el botón dice "Enviando…" cuando el store está ocupado por otra cosa (cambiar una cantidad, releer el carrito) y no por el envío.
it('keeps the money label while the store is busy with something other than sending', () => {
  mockStore.cart = cartOf([line({})])
  mockStore.busy = true
  render(tree())
  expect(sendButton()).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Enviando…' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Más' })).toBeDisabled()
})

// Falla si el stepper no cambia la cantidad de mi línea, o si bajar de 1 deja cantidad 0 en vez de quitar la línea.
it('steps quantity and removes the line when it would drop below one', () => {
  mockStore.cart = cartOf([line({}), line({ id: 5, producto_id: 7, nombre: 'Papas rústicas', precio: 14900, cantidad: 1, subtotal: 14900 })])
  render(tree())
  fireEvent.click(screen.getAllByRole('button', { name: 'Más' })[0])
  expect(mockStore.setQty).toHaveBeenCalledWith(1, 3)
  fireEvent.click(screen.getAllByRole('button', { name: 'Menos' })[0])
  expect(mockStore.setQty).toHaveBeenCalledWith(1, 1)
  fireEvent.click(screen.getAllByRole('button', { name: 'Menos' })[1])
  expect(mockStore.remove).toHaveBeenCalledWith(5)
  expect(mockStore.setQty).not.toHaveBeenCalledWith(5, 0)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar: Lomo a la parrilla' }))
  expect(mockStore.remove).toHaveBeenCalledWith(1)
})

// Falla si un carrito vacío ofrece "Enviar a cocina", si "Ver la carta" no lleva a la carta de esta mesa, o si "Volver" pierde el token.
it('shows the empty state with a way back to the menu when nothing was added', () => {
  mockStore.cart = cartOf([])
  render(tree())
  expect(screen.getByText('Todavía no has agregado nada.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Enviar a cocina/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/carta')
  expect(screen.getByRole('link', { name: /Volver/ })).toHaveAttribute('href', '/la-provincia/centro/t/8H2KQ7')
})

// Falla si un carrito que no cargó se presenta como vacío, o si no ofrece reintentar la carga.
it('tells the truth when the cart could not be loaded and offers a retry', () => {
  mockStore.cart = null
  mockStore.error = 'Error 503'
  render(tree())
  expect(screen.getByText('No pudimos cargar tu pedido.')).toBeInTheDocument()
  expect(screen.queryByText('Todavía no has agregado nada.')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ver la carta' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(mockStore.refreshCart).toHaveBeenCalledTimes(1)
})

// Falla si la acción de dinero baja de los 64 px, pierde el acento de la plantilla, deja de estar pegada abajo o su cifra sale sin mono.
it('keeps the money action tall, branded, sticky and with a mono amount', () => {
  mockStore.cart = cartOf([line({})])
  render(tree())
  expect(sendButton()).toHaveClass('h-tap-money', 'bg-t-acento', 'text-t-acento-tinta')
  expect(sendButton().parentElement).toHaveClass('sticky', 'bottom-0')
  expect(within(sendButton()).getByText('77.800')).toHaveClass('font-t-mono', 'tabular')
})

// Falla si el carrito calla el descuento aplicado, si «Ir a pagar» no lleva al pago, o si «pagar en la mesa» no enlaza con pedir la cuenta.
it('shows the discount line, goes to pay and links paying at the table', () => {
  mockStore.cart = { ...cartOf([line({})]), descuento: { porcentaje: 5, monto: 3890, aplicable: true, aplicado: true } }
  render(tree())
  expect(screen.getByText('Descuento primera compra 5%')).toBeInTheDocument()
  expect(screen.getByText('−3.890')).toHaveClass('font-t-mono')
  fireEvent.click(screen.getByRole('button', { name: 'Ir a pagar' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/pago')
  expect(screen.getByRole('link', { name: 'o pagar en la mesa con el mesero' })).toHaveAttribute('href', '/la-provincia/centro/t/8H2KQ7/la-cuenta')
})

// Falla si un descuento aún no aplicado (sin cuenta) no invita a registrarse, o si la invitación no enlaza con el registro.
it('invites to sign up when the discount is available but not applied yet', () => {
  mockStore.cart = { ...cartOf([line({})]), descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } }
  render(tree())
  expect(screen.queryByText('Descuento primera compra 5%')).toBeNull()
  expect(screen.getByRole('link', { name: /Regístrate y ahorra 5%/ })).toHaveAttribute('href', '/la-provincia/centro/t/8H2KQ7/cuenta/registro')
})

// Falla si "La mesa" sin pedidos ajenos calla, si las flechas no cambian de pestaña, si "Quitar" no dice qué quita, o si no hay cómo seguir pidiendo.
it('names the others-empty state, switches tabs with the arrows and offers to add more', () => {
  mockStore.cart = cartOf([line({})])
  render(tree())
  fireEvent.click(screen.getByRole('tab', { name: 'La mesa' }))
  expect(screen.getByText('Nadie más ha pedido todavía.')).toBeInTheDocument()
  expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-table')
  fireEvent.keyDown(screen.getByRole('tab', { name: 'La mesa' }), { key: 'ArrowLeft' })
  expect(screen.getByRole('tab', { name: 'Lo mío' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('button', { name: 'Quitar: Lomo a la parrilla' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Agregar algo más' })).toHaveAttribute('href', '/la-provincia/centro/t/8H2KQ7/carta')
})
