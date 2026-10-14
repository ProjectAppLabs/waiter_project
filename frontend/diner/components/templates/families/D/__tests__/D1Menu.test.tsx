import { fireEvent, screen, within } from '@testing-library/react'

import { D1Menu } from '@/components/templates/families/D/D1Menu'
import { cafe, cartOf, coldBrew, entryOf, horno, line, menuProps, vacia, wrap } from '@/components/templates/families/D/__tests__/fixtures'

const mockStore = { entry: null, account: null, accountOrders: [], loadAccount: jest.fn() }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (sel?: (s: typeof mockStore) => unknown) => (sel ? sel(mockStore) : mockStore) }))

// Falla si la pizarra pierde la marca en la cabecera, la mesa en versalitas, las etiquetas de categoría, el precio en mono o si un
// plato en dos categorías sale dos veces en «Todo».
it('paints the board: brand, table, category labels and one dotted row per dish with mono price', () => {
  wrap(<D1Menu {...menuProps()} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tinto y Nube')
  expect(screen.getByText('Mesa 14')).toHaveClass('uppercase')
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Café', 'Del horno'])
  expect(screen.getAllByRole('article')).toHaveLength(5)
  expect(screen.getAllByText('Cold brew')).toHaveLength(1)
  expect(screen.getByText('9.000')).toHaveClass('font-t-mono')
  expect(screen.queryByText('Foto del plato')).toBeNull()
})

// Falla si tocar la fila no abre el plato, si el ＋ no agrega, o si un plato agotado ofrece ＋ en vez de la insignia.
it('opens the dish from the row, adds from the ring and marks sold-out rows', () => {
  const p = menuProps()
  wrap(<D1Menu {...p} />)
  fireEvent.click(screen.getByText('Latte'))
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Cortado' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  const soldOut = screen.getByText('Cold brew').closest('article') as HTMLElement
  expect(soldOut).toHaveClass('opacity-55')
  expect(within(soldOut).getByTestId('sold-out-badge')).toHaveTextContent('Agotado')
  expect(screen.queryByRole('button', { name: `Agregar: ${coldBrew.nombre}` })).toBeNull()
})

// Falla si la búsqueda y las pestañas de Waiter no están, si el filtro por categoría no reduce las secciones, o si el vacío miente.
it('keeps Waiter search and tabs and tells the truth when a category is empty', () => {
  const p = menuProps({ entry: entryOf([cafe, horno, vacia]), category: 3 })
  wrap(<D1Menu {...p} />)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar un plato' }), { target: { value: 'lat' } })
  expect(p.setQuery).toHaveBeenCalledWith('lat')
  expect(screen.getByRole('tab', { name: 'Tardes', selected: true })).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Esta categoría no tiene platos por ahora')
  fireEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
  expect(p.setCategory).toHaveBeenCalledWith(null)
})

// Falla si el botón crema del pie no lleva al pedido, no muestra el total cuando ya hay algo pedido, o deja de pegarse abajo con
// ítems (es la barra de pedido del marco: la página ya no pinta la suya sobre este layout).
it('sends the cream button to the order bar, shows the total once there are items and stays stuck to the bottom', () => {
  const first = wrap(<D1Menu {...menuProps()} />)
  expect(screen.getByRole('link', { name: 'Pedir en la barra' })).toHaveAttribute('href', '/tinto/centro/t/Z2XUVG/pedido')
  first.unmount()
  wrap(<D1Menu {...menuProps({ cart: cartOf([line()]) })} />)
  const cta = screen.getByRole('link', { name: 'Pedir en la barra · $ 18.000' })
  expect(cta.parentElement).toHaveClass('sticky', 'bottom-0')
})

// Falla si una marca con logo pierde el logo en la cabecera de la pizarra (la página ya no pinta su BrandHeader aquí).
it('paints the brand logo in the board header when the brand has one', () => {
  wrap(<D1Menu {...menuProps({ entry: entryOf(undefined, { marca: { ...entryOf().contexto.marca, logo: '/logo.png' } }) })} />)
  expect(screen.getByRole('img', { name: 'Tinto y Nube' })).toHaveAttribute('src', '/logo.png')
  expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
})
