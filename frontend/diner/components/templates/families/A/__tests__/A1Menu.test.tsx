import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { A1Menu } from '@/components/templates/families/A/A1Menu'
import { cartOf, dimmedAncestors, entradas, entryOf, fuertes, menuProps, postres, wrap } from '@/components/templates/families/A/__tests__/fixtures'

// Falla si la cabecera pierde la marca centrada con «lema · Mesa N» (la única cabecera: la página no pinta la suya sobre este layout), si la
// marca se repite, si las secciones no llevan su rótulo en versalitas, si un plato con descripción no la pinta entera (el marco es editorial:
// sin fotos) o si el precio deja la fuente mono.
it('paints the editorial header once, the sections and the dishes without photos', () => {
  wrap(<A1Menu {...menuProps('A1')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('La Provincia')
  expect(screen.getAllByRole('banner')).toHaveLength(1)
  expect(screen.getAllByText('La Provincia')).toHaveLength(1)
  expect(screen.getByText('Cocina de barrio · Mesa 14')).toHaveClass('uppercase')
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Entradas', 'Fuertes', 'Postres'])
  expect(screen.getByText('Tomate confitado, pesto de albahaca, focaccia de la casa.')).toBeInTheDocument()
  expect(screen.queryByRole('img')).toBeNull()
  expect(screen.getByText('10.000')).toHaveClass('font-t-mono')
  expect(screen.getByText('Burrata italiana')).toHaveClass('font-t-display')
})

// Falla si tocar la fila no abre el plato, si el ＋ no agrega, si el agotado conserva el ＋ o pierde la insignia y el 55 %.
it('opens the dish from the row, adds from the ＋ and dims the sold-out one', () => {
  const props = menuProps('A1')
  wrap(<A1Menu {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /^Burrata italiana/ }))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Cordero de Boyacá' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  const soldOut = screen.getByText('Ajiaco').closest('article') as HTMLElement
  expect(dimmedAncestors(screen.getByText('Ajiaco'))).toBe(1)
  expect(dimmedAncestors(within(soldOut).getByText('40.000'))).toBe(1)
  const badge = within(soldOut).getByTestId('sold-out-badge')
  expect(badge).toHaveTextContent('Agotado')
  expect(dimmedAncestors(badge)).toBe(0)
  expect(screen.queryByRole('button', { name: 'Agregar: Ajiaco' })).toBeNull()
})

// Falla si el índice de categorías no filtra las secciones, si la búsqueda plegada no aparece al tocar «Buscar» o si la barra de pedido
// pierde el total y el conteo con el enlace al pedido.
it('filters by the versal index and the folded search, and keeps the order bar with count and total', async () => {
  const user = userEvent.setup()
  const props = menuProps('A1', { category: 2, cart: cartOf([{ id: 1, comensal: 'me', mio: true, producto_id: 1, nombre: 'x', precio: 100, cantidad: 3, nota: '', subtotal: 105441 }]) })
  wrap(<A1Menu {...props} />)
  expect(screen.getByRole('tab', { name: 'Fuertes', selected: true })).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Fuertes'])
  await user.click(screen.getByRole('tab', { name: 'Postres' }))
  expect(props.setCategory).toHaveBeenCalledWith(3)
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
  await user.type(screen.getByRole('searchbox', { name: 'Buscar un plato' }), 'aj')
  expect(props.setQuery).toHaveBeenLastCalledWith('j')
  expect(screen.getByRole('link', { name: 'Ver · 3' })).toHaveAttribute('href', '/prov/centro/t/Z2XUVG/pedido')
  expect(screen.getByText(/105\.441/)).toBeInTheDocument()
  // Una sola barra de pedido: la del marco (la página no superpone su OrderBar sobre un layout registrado).
  expect(screen.getAllByRole('link')).toHaveLength(1)
})

// Falla si una búsqueda sin coincidencias no lo dice o si una carta vacía habla de búsqueda.
it('tells the truth when nothing matches or the menu is empty', () => {
  const { unmount } = wrap(<A1Menu {...menuProps('A1', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
  unmount()
  wrap(<A1Menu {...menuProps('A1', { entry: entryOf([]) })} />)
  expect(screen.getByRole('status')).toHaveTextContent('La carta está vacía por ahora')
  expect(screen.queryByRole('button', { name: 'Ver todos' })).toBeNull()
  expect([entradas, fuertes, postres]).toHaveLength(3)
})
