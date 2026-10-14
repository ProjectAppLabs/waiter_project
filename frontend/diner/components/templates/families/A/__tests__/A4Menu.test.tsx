import { fireEvent, screen, within } from '@testing-library/react'

import { A4Menu } from '@/components/templates/families/A/A4Menu'
import { dimmedAncestors, entryOf, entradas, fuertes, menuProps, wrap } from '@/components/templates/families/A/__tests__/fixtures'

// jsdom no implementa scrollIntoView (la ficha se desplaza al elegir una fila).
beforeAll(() => { Element.prototype.scrollIntoView = jest.fn() })

// Falla si la ficha no muestra el primer plato con su foto 3:2, nombre en serif, descripción, precio mono 22 y «Añadir» (onAdd), o si el
// resto de la carta no queda debajo como filas compactas con su ＋.
it('shows the first dish as the hero card and the rest of the menu as compact rows', () => {
  const props = menuProps('A4')
  wrap(<A4Menu {...props} />)
  const hero = screen.getByRole('article', { name: 'Burrata italiana' })
  expect(within(hero).getByRole('presentation')).toHaveAttribute('src', '/api/v1/f/1.jpg')
  expect(within(hero).getByRole('heading', { level: 1 })).toHaveClass('t-title')
  expect(within(hero).getByText('Tomate confitado, pesto de albahaca, focaccia de la casa.')).toBeInTheDocument()
  expect(within(hero).getByText('10.000')).toHaveClass('font-t-mono')
  fireEvent.click(within(hero).getByRole('button', { name: 'Añadir' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  fireEvent.click(within(hero).getByRole('heading', { level: 1 }))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Más de la carta')
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Tartar de trucha' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
})

// Falla si tocar una fila no la convierte en la ficha, si los chips de atributos no salen solo cuando existen, si el placeholder no dice
// «Foto del plato» sin foto, o si un plato agotado deja «Añadir» activo.
it('promotes a row to the hero card, paints attribute chips only when present and handles sold-out', () => {
  const props = menuProps('A4')
  wrap(<A4Menu {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ver ficha: Cordero de Boyacá' }))
  const hero = screen.getByRole('article', { name: 'Cordero de Boyacá' })
  expect(within(hero).getByText('Sin gluten')).toBeInTheDocument()
  expect(within(hero).getByText('3 piezas')).toBeInTheDocument()
  expect(within(hero).getByText('Picante ●●')).toBeInTheDocument()
  expect(within(hero).getByText('Solo hoy')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Ver ficha: Tartar de trucha' }))
  const plain = screen.getByRole('article', { name: 'Tartar de trucha' })
  expect(within(plain).getByText('Foto del plato')).toBeInTheDocument()
  expect(within(plain).queryByText('Sin gluten')).toBeNull()
  // En la lista compacta el agotado atenúa una sola vez (texto; la miniatura se atenúa sola) y la insignia queda entera.
  const row = screen.getByRole('button', { name: 'Ver ficha: Ajiaco' }).closest('li') as HTMLElement
  expect(dimmedAncestors(within(row).getByText('Ajiaco'))).toBe(1)
  expect(dimmedAncestors(within(row).getByRole('presentation'))).toBe(1)
  expect(dimmedAncestors(within(row).getByTestId('sold-out-badge'))).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Ver ficha: Ajiaco' }))
  const sold = screen.getByRole('article', { name: 'Ajiaco' })
  expect(within(sold).getAllByRole('presentation')[0]).toHaveClass('opacity-55')
  expect(dimmedAncestors(within(sold).getAllByRole('presentation')[0])).toBe(1)
  expect(within(sold).getByRole('button', { name: 'Agotado' })).toBeDisabled()
})

// Falla si la categoría o la búsqueda no reducen ficha y lista, o si el vacío no se dice.
it('respects the category and search filters', () => {
  wrap(<A4Menu {...menuProps('A4', { category: 1, entry: entryOf([entradas, fuertes]) })} />)
  expect(screen.getByRole('article', { name: 'Burrata italiana' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Ver ficha: Cordero/ })).toBeNull()
  wrap(<A4Menu {...menuProps('A4', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
