import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SmartChat } from '../SmartChat'
import { addChatSelection, getChat, newChat, sendChat } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Entry } from '@/lib/types'

jest.mock('@/lib/services/api', () => ({ getChat: jest.fn(), newChat: jest.fn(), sendChat: jest.fn(), addChatSelection: jest.fn() }))
const initial = useDinerStore.getState()
const entry = { contexto: { marca: { nombre: 'Demo' } }, carta: { categorias: [{ productos: [
  { id: 7, nombre: 'Bowl', agotado: false },
] }] } } as Entry
const turn = { id: 'reply', mensaje: 'Quiero algo ligero', respuesta: 'Estas opciones pueden gustarte.',
  accion: 'recomendar', lineas: [{ producto: 7, cantidad: 1, nombre: 'Bowl' }] }

beforeEach(() => {
  jest.clearAllMocks()
  HTMLElement.prototype.scrollTo = jest.fn()
  HTMLElement.prototype.scrollBy = jest.fn()
  window.matchMedia = jest.fn().mockImplementation(query => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addListener: jest.fn(), removeListener: jest.fn(), addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn() }))
  useDinerStore.setState(initial, true)
  useDinerStore.setState({ ensureSession: jest.fn().mockResolvedValue({ id: 'session' }) })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
  jest.mocked(getChat).mockResolvedValue({ disponible: true, mensajes: [] })
})

// Falla si el chat no envía el mensaje, si la recomendación enlaza sin la mesa o si no se puede cerrar.
it('opens chat, sends a message and links recommendations to the current table', async () => {
  jest.mocked(sendChat).mockResolvedValue(turn as never)
  render(<SmartChat entry={entry} rest="demo" venue="salon" token="mesa8"/>)
  fireEvent.click(screen.getByRole('button', { name: /Mi mesero/ }))
  await waitFor(() => expect(screen.getByLabelText('Tu mensaje')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Tu mensaje'), { target: { value: turn.mensaje } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
  await screen.findAllByText(turn.respuesta)
  expect(sendChat).toHaveBeenCalledWith('session', expect.any(String), turn.mensaje)
  expect(await screen.findByRole('link', { name: /Bowl/ })).toHaveAttribute('href', '/demo/salon/t/mesa8/plato/7')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar conversación' }))
  expect(screen.getByRole('button', { name: /Mi mesero/ })).toHaveAttribute('aria-expanded', 'false')
})

// Falla si un envío fallido borra el texto o si el reintento usa otra referencia y duplica el mensaje.
it('keeps the same message reference on a failed send and allows retry', async () => {
  jest.mocked(sendChat).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(turn as never)
  render(<SmartChat entry={entry} rest="demo" venue="salon" token={null}/>)
  fireEvent.click(screen.getByRole('button', { name: /Mi mesero/ }))
  await waitFor(() => expect(screen.getByLabelText('Tu mensaje')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Tu mensaje'), { target: { value: turn.mensaje } })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Tu mensaje')).toHaveValue(turn.mensaje)
  fireEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }))
  await screen.findAllByText(turn.respuesta)
  expect(jest.mocked(sendChat).mock.calls[0][1]).toBe(jest.mocked(sendChat).mock.calls[1][1])
})

// Falla si el chat no disponible deja escribir o si la vista previa llama a la API del chat.
it('shows unavailable honestly and does not consume API in preview', async () => {
  jest.mocked(getChat).mockResolvedValue({ disponible: false, mensajes: [] })
  const view = render(<SmartChat entry={entry} rest="demo" venue="salon" token={null}/>)
  fireEvent.click(screen.getByRole('button', { name: /Mi mesero/ }))
  await screen.findByText(/todavía no está disponible/)
  expect(screen.getByLabelText('Tu mensaje')).toBeDisabled()
  expect(sendChat).not.toHaveBeenCalled()
  view.unmount()
  jest.clearAllMocks()
  useDinerStore.setState({ preview: {} as never })
  render(<SmartChat entry={entry} rest="demo" venue="salon" token={null}/>)
  fireEvent.click(screen.getByRole('button', { name: /Mi mesero/ }))
  expect(screen.getByText(/Abre el menú del restaurante/)).toBeInTheDocument()
  expect(getChat).not.toHaveBeenCalled()
})

// Falla si la recomendación se añade sin cantidad o nota, no actualiza el carrito o no queda marcada.
it('adds a recommendation with quantity and note, updates cart and marks it selected', async () => {
  jest.mocked(getChat).mockResolvedValue({ disponible: true, mensajes: [turn as never] })
  const cart = { lineas: [], mio: 45000 } as never
  jest.mocked(addChatSelection).mockResolvedValue({carrito: cart, selecciones: [{message_id: turn.id, product_id: 7, qty: 2}]})
  render(<SmartChat entry={entry} rest="demo" venue="salon" token="mesa8"/>)
  fireEvent.click(screen.getByRole('button', { name: 'Mi mesero' }))
  await screen.findAllByText(turn.respuesta)
  fireEvent.click(screen.getByLabelText('Más Bowl'))
  fireEvent.change(screen.getByLabelText('Indicaciones para Bowl'), {target: {value: 'Sin cebolla'}})
  fireEvent.click(screen.getByRole('button', {name: 'Añadir a mi pedido'}))
  await screen.findByText('✓ Añadido a tu pedido')
  expect(addChatSelection).toHaveBeenCalledWith('session', turn.id, 7, 2, 'Sin cebolla')
  expect(useDinerStore.getState().cart).toEqual(cart)
  expect(screen.queryByRole('button', {name: 'Añadir a mi pedido'})).not.toBeInTheDocument()
  expect(screen.getByRole('link', {name: /Ver mi pedido/})).toHaveAttribute('href', '/demo/salon/t/mesa8/pedido')
})

// Falla si las tarjetas de una categoría no van en carrusel, si «Otro» envía algo o si una opción no se envía.
it('groups same-category cards horizontally and lets Other focus free text', async () => {
  const menu = { ...entry, carta: { categorias: [{id: 1, nombre: 'Bebidas', productos: [
    {id: 7, nombre: 'Limonada', precio: 12000, categorias: [1]}, {id: 8, nombre: 'Jugo', precio: 10000, categorias: [1]},
  ]}] } } as Entry
  const question = {id: 'question', mensaje: 'Tengo sed', respuesta: '¿Qué tipo de bebida prefieres?', accion: 'preguntar', lineas: [], opciones: ['Frutal', 'Cremosa']}
  const recommendation = {...turn, lineas: [{producto: 7, cantidad: 1, nombre: 'Limonada'}, {producto: 8, cantidad: 1, nombre: 'Jugo'}]}
  jest.mocked(getChat).mockResolvedValue({disponible: true, mensajes: [recommendation as never, question as never]})
  render(<SmartChat entry={menu} rest="demo" venue="salon" token={null}/>)
  fireEvent.click(screen.getByRole('button', {name: 'Mi mesero'}))
  await screen.findByRole('button', {name: 'Frutal'})
  expect(screen.getByLabelText('Opciones de Bebidas')).toHaveClass('sm-chat-carousel')
  fireEvent.click(screen.getByRole('button', {name: 'Otro · Escribir mi respuesta'}))
  expect(screen.getByLabelText('Tu mensaje')).toHaveFocus()
  expect(sendChat).not.toHaveBeenCalled()
  jest.mocked(sendChat).mockResolvedValue(recommendation as never)
  fireEvent.click(screen.getByRole('button', {name: 'Frutal'}))
  await waitFor(() => expect(sendChat).toHaveBeenCalledWith('session', expect.any(String), 'Frutal'))
})

// Falla si «Nueva conversación» toca el carrito o deja mensajes de la conversación anterior.
it('starts a fresh conversation without changing the cart', async () => {
  const cart = {lineas: [], mio: 45000} as never
  useDinerStore.setState({cart})
  jest.mocked(getChat).mockResolvedValue({disponible: true, mensajes: [turn as never]})
  jest.mocked(newChat).mockResolvedValue({disponible: true, mensajes: []})
  render(<SmartChat entry={entry} rest="demo" venue="salon" token={null}/>)
  fireEvent.click(screen.getByRole('button', {name: 'Mi mesero'}))
  await screen.findAllByText(turn.respuesta)
  fireEvent.click(screen.getByRole('button', {name: 'Nueva conversación'}))
  await waitFor(() => expect(screen.queryAllByText(turn.respuesta)).toHaveLength(0))
  expect(newChat).toHaveBeenCalledWith('session')
  expect(useDinerStore.getState().cart).toBe(cart)
  expect(screen.getByLabelText('Tu mensaje')).toHaveValue('')
  expect(screen.getByText('¿Qué se te antoja hoy?')).toBeInTheDocument()
})

// Falla si un aviso de la escalera del asistente no se ve como mensaje marcado del mesero o no dice hasta cuándo dura.
it('muestra los avisos del asistente como mensajes suyos', async () => {
  const aviso = { id: 'aviso', mensaje: 'cuéntame un chiste', respuesta: 'Por ahora te ayudo solo con el menú.', accion: 'preguntar', lineas: [], opciones: ['Ver el menú'],
    aviso: { tipo: 'restringido', hasta: '2026-10-09T23:30:00Z' } }
  jest.mocked(getChat).mockResolvedValue({ disponible: true, mensajes: [aviso as never] })
  render(<SmartChat entry={entry} rest="demo" venue="salon" token={null}/>)
  fireEvent.click(screen.getByRole('button', { name: /Mi mesero/ }))
  const texto = await screen.findByText(/solo puedes usar los botones/)
  expect(texto.closest('.sm-chat-bubble')).toHaveAttribute('data-aviso', 'restringido')
  expect(screen.getByRole('button', { name: 'Ver el menú' })).toBeInTheDocument()
})

// Falla si el encabezado del chat pierde el acceso al pedido, cuenta platos ajenos o el cierre deja de funcionar.
it('lleva al pedido desde el encabezado con el número de platos propios', async () => {
  useDinerStore.setState({ cart: { lineas: [{ mio: true, cantidad: 2 }, { mio: false, cantidad: 4 }] } as never })
  render(<SmartChat entry={entry} rest="demo" venue="salon" token="mesa8"/>)
  fireEvent.click(screen.getByRole('button', { name: /Mi mesero/ }))
  const carrito = screen.getByRole('link', { name: 'Mi pedido, 2 platos' })
  expect(carrito).toHaveAttribute('href', '/demo/salon/t/mesa8/pedido')
  expect(carrito).toHaveAttribute('data-cart-target')
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar conversación' }))
  expect(screen.getByRole('button', { name: /Mi mesero/ })).toHaveAttribute('aria-expanded', 'false')
})
