import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { Menu } from '@/components/screens/Menu'
import messages from '@/lib/i18n/messages/es.json'
import type { Category, Entry } from '@/lib/types'

const mockPush = jest.fn()
const mockAdd = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ add: mockAdd }) }))
// El contenedor se prueba con el genérico: la familia B registra su propio menú bajo B1 (probado en families/B/__tests__).
jest.mock('@/components/templates/registry', () => ({ MENU_LAYOUTS: {} }))

const brand = { nombre: 'La Provincia', lema: '', logo: null, saludo: '', mesero: '', bienvenida: '', color: '#7A2E2A', colorTexto: '#FFFFFF', colorSuave: '#F6EBEA', fuente: 'Instrument Serif', radio: 14 }
const dish = (id: number, nombre: string, categorias: number[], agotado = false) => ({ id, nombre, precio: 10000 * id, agotado, categorias })
const entradas = { id: 1, nombre: 'Entradas', productos: [dish(1, 'Ají de la casa', [1]), dish(2, 'Empanadas', [1])] }
const fuertes = { id: 2, nombre: 'Fuertes', productos: [dish(3, 'Lomo al trapo', [2]), dish(4, 'Ajiaco', [2], true)] }
const postres: Category = { id: 3, nombre: 'Postres', productos: [] }
const entryOf = (categorias: Category[], imagenesDeReferencia?: boolean): Entry => ({ contexto: { restaurante: { slug: 'prov', nombre: 'La Provincia' }, sede: { slug: 'centro', nombre: 'Centro' }, mesa: null, marca: brand }, carta: { restaurante: 'prov', categorias, imagenesDeReferencia } })
const wrap = (categorias: Category[] = [entradas, fuertes], imagenesDeReferencia?: boolean) => render(<NextIntlClientProvider locale="es" messages={messages}><Menu entry={entryOf(categorias, imagenesDeReferencia)} rest="prov" venue="centro" token={null} id={null} /></NextIntlClientProvider>)
const NOTE = 'Imágenes de referencia: la porción servida puede variar.'

beforeEach(() => { mockPush.mockClear(); mockAdd.mockClear() })

// Falla si la búsqueda distingue acentos o mayúsculas, o si no aparece el estado vacío cuando nada coincide.
it('filters dishes by name ignoring accents and case', async () => {
  const user = userEvent.setup()
  wrap()
  expect(screen.getAllByRole('article')).toHaveLength(4)
  await user.type(screen.getByRole('searchbox', { name: 'Buscar un plato' }), 'AJI')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.getByText('Ají de la casa')).toBeInTheDocument()
  expect(screen.getByText('Ajiaco')).toBeInTheDocument()
  await user.type(screen.getByRole('searchbox'), 'zz')
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})

// Falla si la pestaña no filtra por categoría, si no se combina con la búsqueda, o si "Todo" no vuelve a la carta completa.
it('filters by category tab and combines it with the search', async () => {
  const user = userEvent.setup()
  wrap()
  await user.click(screen.getByRole('tab', { name: 'Fuertes' }))
  expect(screen.getByRole('tab', { name: 'Fuertes', selected: true })).toBeInTheDocument()
  expect(screen.getAllByRole('article')).toHaveLength(2)
  expect(screen.queryByText('Empanadas')).toBeNull()
  await user.type(screen.getByRole('searchbox'), 'aji')
  expect(screen.getAllByRole('article')).toHaveLength(1)
  expect(screen.queryByText('Ají de la casa')).toBeNull()
  await user.click(screen.getByRole('tab', { name: 'Todo' }))
  expect(screen.getAllByRole('article')).toHaveLength(2)
})

// Falla si los chips no se exponen como un grupo de pestañas con nombre, si el panel no se enlaza con la pestaña activa, o si las flechas no mueven la selección (con vuelta al inicio).
it('exposes the categories as a named tablist navigable with the arrow keys', async () => {
  const user = userEvent.setup()
  wrap()
  expect(screen.getByRole('tablist', { name: 'Categorías' })).toContainElement(screen.getByRole('tab', { name: 'Todo', selected: true }))
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  screen.getByRole('tab', { name: 'Todo' }).focus()
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Entradas', selected: true })).toHaveFocus()
  expect(screen.getByRole('tabpanel', { name: 'Entradas' })).toHaveTextContent('Empanadas')
  await user.keyboard('{ArrowLeft}{ArrowLeft}')
  expect(screen.getByRole('tab', { name: 'Fuertes', selected: true })).toHaveFocus()
})

// Falla si una categoría vacía dice "nada coincide con tu búsqueda" sin que el comensal haya buscado, o si no ofrece volver a Todo.
it('tells the truth for an empty category and offers the whole menu', async () => {
  const user = userEvent.setup()
  wrap([entradas, fuertes, postres])
  await user.click(screen.getByRole('tab', { name: 'Postres' }))
  expect(screen.getByRole('status')).toHaveTextContent('Esta categoría no tiene platos por ahora')
  await user.click(screen.getByRole('button', { name: 'Ver todos' }))
  expect(screen.getByRole('tab', { name: 'Todo', selected: true })).toBeInTheDocument()
  expect(screen.getAllByRole('article')).toHaveLength(4)
})

// Falla si una carta sin platos habla de búsqueda o de categoría, o si ofrece "Ver todos" cuando no hay nada que limpiar.
it('says the menu is empty when there are no dishes at all', () => {
  wrap([])
  expect(screen.getByRole('status')).toHaveTextContent('La carta está vacía por ahora')
  expect(screen.queryByRole('button', { name: 'Ver todos' })).toBeNull()
})

// Falla si "Ver todos" no limpia la búsqueda que dejó la carta vacía.
it('clears the search from the empty state', async () => {
  const user = userEvent.setup()
  wrap()
  await user.type(screen.getByRole('searchbox'), 'zz')
  await user.click(screen.getByRole('button', { name: 'Ver todos' }))
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getAllByRole('article')).toHaveLength(4)
})

// Falla si tocar la tarjeta no abre el plato.
it('opens the dish from the card', async () => {
  const user = userEvent.setup()
  wrap()
  await user.click(screen.getByText('Lomo al trapo'))
  expect(mockPush).toHaveBeenCalledWith('/prov/centro/plato/3')
})

// Falla si el ＋ de la tarjeta no agrega una unidad sin nota por el store.
it('adds one unit without note from the card', async () => {
  const user = userEvent.setup()
  wrap()
  await user.click(screen.getByRole('button', { name: 'Agregar: Empanadas' }))
  expect(mockAdd).toHaveBeenCalledWith(2, 1, '')
})

// Falla si una carta con fotos generadas con IA no avisa que son de referencia, si el aviso no va entre las categorías y la rejilla, o si se pierde al filtrar.
it('says the photos are reference images between the categories and the grid when the menu flags it', async () => {
  const user = userEvent.setup()
  wrap([entradas, fuertes], true)
  const note = screen.getByText(NOTE)
  expect(screen.getByRole('tablist').compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getByRole('tabpanel')).not.toContainElement(note)
  await user.click(screen.getByRole('tab', { name: 'Fuertes' }))
  expect(screen.getByText(NOTE)).toBeInTheDocument()
})

// Falla si el aviso de imágenes de referencia aparece en una carta que no lo pide.
it('does not mention reference images when the menu does not flag it', () => {
  wrap()
  expect(screen.queryByText(NOTE)).toBeNull()
})
