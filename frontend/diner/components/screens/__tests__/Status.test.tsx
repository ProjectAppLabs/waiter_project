import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { Status } from '@/components/screens/Status'
import messages from '@/lib/i18n/messages/es.json'
import type { Entry, OrderStatus } from '@/lib/types'

const mockPush = jest.fn()
const mockRefreshOrder = jest.fn().mockResolvedValue(undefined)
const mockCall = jest.fn().mockResolvedValue(true)
let mockOrder: OrderStatus | null = null
let mockError: string | null = null
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ order: mockOrder, error: mockError, busy: false, refreshOrder: mockRefreshOrder, call: mockCall }) }))

const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
const entry: Entry = { contexto: { restaurante: { slug: 'la-provincia', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: { numero: 14, token: '8H2KQ7' }, marca: brand }, carta: { restaurante: 'la-provincia', categorias: [] } }
const base: OrderStatus = { id: 'p1', sesion: 's1', estado: 'en_cocina', total: 83700, impuestos: 0, intentos: 1 }
const status = (id: string | null = 'p1') => <Status entry={entry} rest="la-provincia" venue="centro" token="8H2KQ7" id={id} />
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

beforeEach(() => { jest.clearAllMocks(); mockOrder = null; mockError = null })
afterEach(() => { jest.useRealTimers() })

// Falla si la pantalla no pide el pedido por su id, muestra otro estado o pierde el total en mono.
it('fetches the order by id and shows its state and total', () => {
  mockOrder = { ...base, descuento: { porcentaje: 5, monto: 4391.1, aplicado: true } }
  wrap(status())
  expect(screen.getByText('Descuento de primera compra (5%): −$ 4.391')).toBeInTheDocument()
  expect(mockRefreshOrder).toHaveBeenCalledWith('p1')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('En cocina')
  expect(screen.getByText('Lo están preparando.')).toBeInTheDocument()
  expect(screen.getByText('$ 83.700')).toHaveClass('font-mono')
})

// Falla si los pasos se distinguen solo por color: el superado sin ✓, el actual sin aria-current o el pendiente marcado.
it('marks the steps with text, not only with color', () => {
  mockOrder = base
  wrap(status())
  const items = screen.getAllByRole('listitem')
  expect(screen.getByRole('list', { name: 'Avance del pedido' })).toBeInTheDocument()
  expect(items).toHaveLength(4)
  expect(items[0]).toHaveTextContent('✓ Recibido')
  expect(items[1]).toHaveAttribute('aria-current', 'step')
  expect(items[1]).toHaveTextContent(/^En cocina$/)
  expect(items[2]).toHaveTextContent(/^Listo para salir$/)
  expect(items[2].querySelector('span:last-child')).toHaveClass('text-soft')
})

// Falla si "Pedir algo más" no lleva a la carta con el token de la mesa.
it('offers to order more from the menu', () => {
  mockOrder = base
  wrap(status())
  fireEvent.click(screen.getByRole('button', { name: 'Pedir algo más' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/carta')
})

// Falla si "Llamar al mesero" no pasa por el store, no confirma que alguien viene, o "Pedir la cuenta" no lleva a la cuenta.
it('calls the waiter through the store, confirms it, and offers the bill', async () => {
  mockOrder = { ...base, estado: 'listo' }
  wrap(status())
  fireEvent.click(screen.getByRole('button', { name: 'Llamar al mesero' }))
  expect(mockCall).toHaveBeenCalledTimes(1)
  expect(await screen.findByRole('status')).toHaveTextContent('Listo, ya viene alguien.')
  fireEvent.click(screen.getByRole('button', { name: 'Pedir la cuenta' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/la-cuenta')
})

// Falla si un pedido fallido no explica que se conserva, pinta pasos que no existen, sigue sondeando o no ofrece reintentar desde el carrito.
it('explains a failed order, stops polling and offers to retry from the cart', () => {
  jest.useFakeTimers()
  mockOrder = { ...base, estado: 'fallido', detalle: 'timeout' }
  wrap(status())
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('No se pudo enviar')
  expect(screen.getByText('Tu pedido se conserva. Intenta enviarlo de nuevo.')).toBeInTheDocument()
  expect(screen.queryByRole('list')).toBeNull()
  act(() => { jest.advanceTimersByTime(16_000) })
  expect(mockRefreshOrder).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/pedido')
})

// Falla si el sondeo no repite cada 8 s mientras el pedido sigue en cocina, o si sigue sondeando ya servido.
it('polls every 8 seconds until the order is served', () => {
  jest.useFakeTimers()
  mockOrder = base
  const { rerender } = wrap(status())
  expect(mockRefreshOrder).toHaveBeenCalledTimes(1)
  act(() => { jest.advanceTimersByTime(16_000) })
  expect(mockRefreshOrder).toHaveBeenCalledTimes(3)
  mockOrder = { ...base, estado: 'servido' }
  rerender(<NextIntlClientProvider locale="es" messages={messages}>{status()}</NextIntlClientProvider>)
  act(() => { jest.advanceTimersByTime(16_000) })
  expect(mockRefreshOrder).toHaveBeenCalledTimes(3)
})

// Falla si el pedido que quedó en el store (otro id) se muestra como si fuera el de la URL.
it('shows loading instead of a stale order from the store', () => {
  mockOrder = { ...base, id: 'otro' }
  wrap(status())
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
})

// Falla si un pedido que no llega (404: otro celular, cookie vencida, sin red) deja "Cargando…" sin salida y sigue sondeando cada 8 s.
it('stops polling and offers to retry or go back when the order cannot be loaded', async () => {
  jest.useFakeTimers()
  mockOrder = { ...base, id: 'otro' }
  mockError = 'Error 404'
  wrap(status())
  // El fallback aparece solo cuando la propia petición terminó (no por un error viejo del store).
  await act(async () => { await Promise.resolve() })
  expect(screen.getByText('No encontramos ese pedido en este celular.')).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(16_000) })
  expect(mockRefreshOrder).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' }))
  expect(mockRefreshOrder).toHaveBeenLastCalledWith('p1')
  expect(mockRefreshOrder).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Volver al pedido' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/pedido')
})

// Falla si /estado sin id pide algo al servidor, ofrece reintentar lo que no existe o deja "Cargando…" fijo sin volver al pedido.
it('explains there is no order to show when the route has no id', () => {
  wrap(status(null))
  expect(mockRefreshOrder).not.toHaveBeenCalled()
  expect(screen.getByText('No encontramos ese pedido en este celular.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Volver al pedido' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/pedido')
})
