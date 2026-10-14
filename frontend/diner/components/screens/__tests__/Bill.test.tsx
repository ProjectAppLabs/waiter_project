import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { Bill } from '@/components/screens/Bill'
import messages from '@/lib/i18n/messages/es.json'
import type { Bill as BillSummary, Entry, OrderStatus } from '@/lib/types'

const mockPush = jest.fn()
const mockAskBill = jest.fn()
let mockOrder: OrderStatus | null = null
let mockError: string | null = null
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ order: mockOrder, error: mockError, busy: false, askBill: mockAskBill }) }))

const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: 'Alex', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
const entry: Entry = { contexto: { restaurante: { slug: 'la-provincia', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: { numero: 14, token: '8H2KQ7' }, marca: brand }, carta: { restaurante: 'la-provincia', categorias: [] } }
const delivery: Entry = { ...entry, contexto: { ...entry.contexto, mesa: null } }
const summary = (total: number, mio: number): BillSummary => ({ ok: true, total, mio, porComensal: [], partes: 2, porParte: total / 2 })
const bill = (e: Entry = entry) => <Bill entry={e} rest="la-provincia" venue="centro" token={e.contexto.mesa ? '8H2KQ7' : null} id={null} />
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

beforeEach(() => { jest.clearAllMocks(); mockOrder = null; mockError = null })

// Falla si la pantalla no avisa al salón al abrir, no muestra el total en mono o no confirma que un mesero trae la cuenta.
it('asks for the bill on mount, shows the total and confirms the salon was told', async () => {
  mockAskBill.mockResolvedValue(summary(83700, 38900))
  wrap(bill())
  expect(mockAskBill).toHaveBeenCalledTimes(1)
  expect(await screen.findByText('$ 83.700')).toHaveClass('font-mono')
  expect(screen.getByRole('status')).toHaveTextContent('Un mesero trae la cuenta')
  expect(screen.getByRole('button', { name: 'Todo', pressed: true })).toBeInTheDocument()
})

// Falla si "Lo mío" o "Dividir" no muestran su monto, o si el modo activo no se marca más allá del color.
it('switches between all, mine and split amounts', async () => {
  mockAskBill.mockResolvedValue(summary(83700, 38900))
  wrap(bill())
  await screen.findByText('$ 83.700')
  fireEvent.click(screen.getByRole('button', { name: 'Lo mío' }))
  expect(screen.getByText('$ 38.900')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Lo mío', pressed: true })).toHaveClass('font-semibold')
  fireEvent.click(screen.getByRole('button', { name: 'Dividir' }))
  expect(screen.getByText('2 partes de')).toBeInTheDocument()
  expect(screen.getAllByText('$ 41.850')).toHaveLength(2)
})

// Falla si al cambiar el número de partes no se recalcula la cifra por parte, o si esa cifra no va en mono con el prefijo $.
it('recomputes the amount per part in mono when the split changes', async () => {
  mockAskBill.mockResolvedValue(summary(83700, 38900))
  wrap(bill())
  fireEvent.click(await screen.findByRole('button', { name: 'Dividir' }))
  fireEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(screen.getByText('3 partes de')).toBeInTheDocument()
  const figures = screen.getAllByText('$ 27.900')
  expect(figures).toHaveLength(2)
  expect(figures[1]).toHaveClass('font-mono')
  fireEvent.click(screen.getByRole('button', { name: 'Menos' }))
  expect(screen.getByText('2 partes de')).toBeInTheDocument()
})

// Falla si la cifra por parte se recalcula en el cliente en vez de usar la que el servidor ya redondeó para sus comensales.
it('prefers the per-part figure the server computed for its diners', async () => {
  mockAskBill.mockResolvedValue({ ...summary(83701, 0), porParte: 41850 })
  wrap(bill())
  fireEvent.click(await screen.findByRole('button', { name: 'Dividir' }))
  expect(screen.getAllByText('$ 41.850')).toHaveLength(2)
  expect(screen.queryByText('$ 41.851')).toBeNull()
})

// Falla si sin nada confirmado la pantalla inventa una cuenta, o si "Volver" no lleva al carrito cuando no hay pedido enviado.
it('says there is nothing to pay yet and goes back to the cart when no order was sent', async () => {
  mockAskBill.mockResolvedValue({ ...summary(0, 0), ok: false, partes: 1, porParte: 0 })
  wrap(bill())
  expect(await screen.findByText('Todavía no hay nada confirmado que cobrar.')).toBeInTheDocument()
  expect(screen.queryByRole('group')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Volver al pedido' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/pedido')
})

// Falla si la pasarela aparece habilitada antes de existir, pierde el tamaño de una acción que cobra, o "Volver" pierde el pedido en curso.
it('keeps phone payment disabled at money size and returns to the order status when there is one', async () => {
  mockOrder = { id: 'p1', sesion: 's1', estado: 'servido', total: 83700, impuestos: 0, intentos: 1 }
  mockAskBill.mockResolvedValue(summary(83700, 83700))
  wrap(bill())
  const pay = await screen.findByRole('button', { name: 'Pagar desde el celular · pronto' })
  expect(pay).toBeDisabled()
  expect(pay).toHaveClass('h-tap-money')
  fireEvent.click(screen.getByRole('button', { name: 'Volver al pedido' }))
  expect(mockPush).toHaveBeenCalledWith('/la-provincia/centro/t/8H2KQ7/estado/p1')
})

// Falla si el salón no fue avisado (ok: false con montos) y la pantalla lo calla o no deja volver a intentar.
it('warns when the salon was not notified and lets the diner retry', async () => {
  mockAskBill.mockResolvedValue({ ...summary(83700, 38900), ok: false })
  wrap(bill())
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos avisar al salón')
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText('$ 83.700')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' })) })
  expect(mockAskBill).toHaveBeenCalledTimes(2)
})

// Falla si en domicilio (sin mesa ni salón) la pantalla avisa de un salón que no existe.
it('does not warn about the salon on a delivery bill', async () => {
  mockAskBill.mockResolvedValue({ ...summary(83700, 83700), ok: false })
  wrap(bill(delivery))
  expect(await screen.findByText('$ 83.700')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Intentar de nuevo' })).toBeNull()
})

// Falla si la cuenta no llega (sin red, sesión caída) y la pantalla se queda en "Cargando…" sin decirlo ni dejar reintentar.
it('says the restaurant is not answering and offers to retry when the bill cannot be loaded', async () => {
  mockError = 'Sin conexión'
  mockAskBill.mockResolvedValue(null)
  wrap(bill())
  expect(await screen.findByText('El restaurante no responde. Tu pedido se conserva.')).toBeInTheDocument()
  expect(screen.queryByText('Cargando…')).toBeNull()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Intentar de nuevo' })) })
  expect(mockAskBill).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: 'Volver al pedido' })).toBeInTheDocument()
})
