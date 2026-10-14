import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { Dish } from '@/components/screens/Dish'
import messages from '@/lib/i18n/messages/es.json'
import type { Dish as MenuItem, Entry } from '@/lib/types'

const mockAdd = jest.fn()
const mockState = { error: null as string | null }
jest.mock('@/lib/stores/dinerStore', () => {
  const useDinerStore = () => ({ add: mockAdd })
  useDinerStore.getState = () => mockState
  return { useDinerStore }
})

const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: '', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
// lomo va marcado 'ia' pero sin foto; ajiaco con foto real; bandeja con foto generada: solo la última lleva la nota legal.
const lomo: MenuItem = { id: 3, nombre: 'Lomo al trapo', precio: 38900, agotado: false, categorias: [2], descripcion: 'Con papas criollas', fotoOrigen: 'ia' }
const ajiaco: MenuItem = { id: 4, nombre: 'Ajiaco', precio: 29000, agotado: true, categorias: [2], foto: '/fotos/4/?v=1', fotoOrigen: 'real' }
const bandeja: MenuItem = { id: 5, nombre: 'Bandeja paisa', precio: 32000, agotado: false, categorias: [2], foto: '/fotos/5/?v=1', fotoOrigen: 'ia' }
const entry: Entry = { contexto: { restaurante: { slug: 'prov', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: null, marca: brand }, carta: { restaurante: 'prov', categorias: [{ id: 2, nombre: 'Fuertes', productos: [lomo, ajiaco, bandeja] }] } }
const wrap = (id: string | null) => render(<NextIntlClientProvider locale="es" messages={messages}><Dish entry={entry} rest="prov" venue="centro" token={null} id={id} /></NextIntlClientProvider>)
const NOTE = 'Imágenes de referencia: la porción servida puede variar.'

beforeEach(() => { mockAdd.mockReset().mockResolvedValue(undefined); mockState.error = null })

// Falla si la cantidad no sube, si la nota no llega al store, si el total del botón no se recalcula, o si al agregar no se confirma con un camino de vuelta a la carta.
it('adds two units with a note, confirms and offers the way back', async () => {
  const user = userEvent.setup()
  wrap('3')
  await user.click(screen.getByRole('button', { name: 'Más' }))
  await user.type(screen.getByRole('textbox', { name: 'Nota para la cocina' }), 'sin cebolla')
  await user.click(screen.getByRole('button', { name: 'Agregar · 77.800' }))
  expect(mockAdd).toHaveBeenCalledWith(3, 2, 'sin cebolla')
  expect(await screen.findByText('Agregado a tu pedido')).toHaveAttribute('role', 'status')
  expect(screen.getByRole('link', { name: 'Volver a la carta' })).toHaveAttribute('href', '/prov/centro/carta')
  expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull()
})

// Falla si un segundo toque mientras se agrega vuelve a enviar la línea, o si mientras tanto el botón solo se atenúa sin decir "Agregando…".
it('says Agregando… and blocks a second tap while the add is in flight', async () => {
  let release = () => {}
  mockAdd.mockReturnValue(new Promise<void>((resolve) => { release = resolve }))
  const user = userEvent.setup()
  wrap('3')
  await user.click(screen.getByRole('button', { name: 'Agregar · 38.900' }))
  const button = await screen.findByRole('button', { name: 'Agregando…' })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  await user.click(button)
  expect(mockAdd).toHaveBeenCalledTimes(1)
  release()
  expect(await screen.findByText('Agregado a tu pedido')).toBeInTheDocument()
})

// Falla si se dice "Agregado" aunque el store haya guardado un error, o si el botón no vuelve a quedar disponible para reintentar.
it('does not confirm when the store reports an error', async () => {
  mockState.error = 'Sin conexión'
  const user = userEvent.setup()
  wrap('3')
  await user.click(screen.getByRole('button', { name: 'Agregar · 38.900' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar · 38.900' })).toBeEnabled())
  expect(mockAdd).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})

// Falla si cambiar la cantidad tras agregar no vuelve a ofrecer "Agregar" con el nuevo total ni retira la confirmación anterior.
it('offers to add again after changing the quantity', async () => {
  const user = userEvent.setup()
  wrap('3')
  await user.click(screen.getByRole('button', { name: 'Agregar · 38.900' }))
  await screen.findByRole('link', { name: 'Volver a la carta' })
  await user.click(screen.getByRole('button', { name: 'Más' }))
  expect(screen.getByRole('button', { name: 'Agregar · 77.800' })).toBeEnabled()
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})

// Falla si un plato agotado se puede agregar o si la acción principal no dice "Agotado".
it('disables the main action for a sold-out dish', () => {
  wrap('4')
  expect(screen.getByRole('button', { name: 'Agotado' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: /Agregar/ })).toBeNull()
  expect(mockAdd).not.toHaveBeenCalled()
})

// Falla si la cantidad baja de 1.
it('keeps the quantity at one', async () => {
  const user = userEvent.setup()
  wrap('3')
  expect(screen.getByRole('button', { name: 'Menos' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Menos' }))
  expect(screen.getByRole('button', { name: 'Agregar · 38.900' })).toBeEnabled()
})

// Falla si el precio (unitario o total del botón) deja de ir en mono.
it('shows unit and total prices in mono', () => {
  wrap('3')
  const prices = screen.getAllByText('38.900')
  expect(prices).toHaveLength(2)
  expect(prices[0]).toHaveClass('font-mono')
  expect(prices[1]).toHaveClass('font-mono')
})

// Falla si la nota pierde su etiqueta visible o si el placeholder vuelve a hacer de etiqueta.
it('labels the kitchen note visibly with the examples as placeholder', () => {
  wrap('3')
  expect(screen.getByLabelText('Nota para la cocina')).toHaveAttribute('placeholder', 'sin cebolla, término medio…')
  expect(screen.getByText('Nota para la cocina').tagName).toBe('SPAN')
})

// Falla si un id que no está en la carta habla de la mesa en vez del plato, o si el "Volver" no es el mismo enlace a la carta que arriba.
it('says the dish is gone with a link back to the menu', () => {
  wrap('99')
  expect(screen.getByText('Este plato ya no está en la carta')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Volver' })).toHaveAttribute('href', '/prov/centro/carta')
})

// Falla si bajo una foto generada con IA no va la nota de imagen de referencia, o si la nota queda antes de la foto.
it('notes under a generated photo that it is a reference image', () => {
  wrap('5')
  const photo = screen.getByRole('img', { name: 'Bandeja paisa' })
  expect(photo.compareDocumentPosition(screen.getByText(NOTE)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

// Falla si la nota aparece con una foto real, o en un plato marcado 'ia' que no tiene foto que aclarar.
it('keeps quiet for a real photo and for a marked dish without photo', () => {
  const { unmount } = wrap('4')
  expect(screen.getByRole('img', { name: 'Ajiaco' })).toBeInTheDocument()
  expect(screen.queryByText(NOTE)).toBeNull()
  unmount()
  wrap('3')
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.queryByText(NOTE)).toBeNull()
})
