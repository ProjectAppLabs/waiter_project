import { fireEvent, screen, within } from '@testing-library/react'

import { E1Menu } from '@/components/templates/families/E/E1Menu'
import { cartOf, categories, entryOf, grifos, line, menuProps, wrap } from '@/components/templates/families/E/__tests__/fixtures'

jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ account: null }) }))

// Falla si la cabecera no cuenta los grifos, si el rótulo «ABV · IBU» aparece sin datos, si la línea técnica inventa valores, o si el
// barril vacío no se atenúa con su nota en vez del ABV.
it('lists the taps with the count, the mono ABV/IBU line only when present and the empty keg dimmed', () => {
  wrap(<E1Menu {...menuProps('E1')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('6 grifos')
  expect(screen.getByText('ABV · IBU')).toHaveClass('font-t-mono')
  expect(screen.getByText('4.8% · 22 IBU')).toHaveClass('font-t-mono')
  expect(screen.getByText('6.5% · 64 IBU')).toBeInTheDocument()
  expect(screen.getByText('barril vacío')).toBeInTheDocument()
  expect(screen.getByText('Sour de maracuyá').closest('li')).toHaveClass('opacity-45')
  // El separador de fila es el tenue del marco (borde al 60 %), no el de la cabecera.
  expect(screen.getByText('Golden Ale').closest('li')).toHaveClass('border-t-borde/60')
  expect(screen.queryByText('4.2%')).toBeNull()
  // Sin abv/ibu: la fila no deja hueco (el cóctel muestra sus etiquetas; las papas nada).
  expect(screen.getByText('Ahumado · Fuerte')).toBeInTheDocument()
  expect(screen.getByText('Papas rústicas').closest('button')?.querySelectorAll('span')).toHaveLength(4)
  expect(screen.getAllByRole('listitem').filter((li) => li.querySelector('img'))).toHaveLength(0)
})

// Falla si el rótulo ABV · IBU se pinta para una carta sin cervezas.
it('omits the ABV · IBU label when no dish carries abv or ibu', () => {
  wrap(<E1Menu {...menuProps('E1', { entry: entryOf([{ ...grifos, productos: [{ id: 9, nombre: 'Agua', precio: 3000, agotado: false, categorias: [1] }] }]) })} />)
  expect(screen.queryByText('ABV · IBU')).toBeNull()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('1 grifo')
})

// Falla si el ＋ no agrega, si tocar la fila no abre el plato, si el agotado ofrece ＋, o si el toque baja de 44 px.
it('adds from the ＋ (44 px), opens the dish from the row and hides the ＋ on the empty keg', () => {
  const props = menuProps('E1')
  wrap(<E1Menu {...props} />)
  const add = screen.getByRole('button', { name: 'Agregar: IPA de la casa' })
  expect(add).toHaveClass('w-[44px]', 'h-[44px]')
  fireEvent.click(add)
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  fireEvent.click(screen.getByText('Golden Ale'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  expect(screen.queryByRole('button', { name: 'Agregar: Sour de maracuyá' })).toBeNull()
})

// Falla si la fila «Filtrar:» no lista las etiquetas únicas de la carta como filtros excluyentes (aria-pressed), si no filtra, o si
// vuelve a ser una fila de chips con borde en vez de la línea de texto de 13 px del marco.
it('filters by the menu tags from the Filtrar row and by category', () => {
  const props = menuProps('E1')
  wrap(<E1Menu {...props} />)
  const row = screen.getByTestId('filter-row')
  expect(row).toHaveClass('text-[13px]', 'bg-t-superficie')
  const tags = within(screen.getByRole('group', { name: 'Filtrar por etiqueta' })).getAllByRole('button')
  expect(tags.map((b) => b.textContent)).toEqual(['ligera', 'lupulada', 'Ahumado', 'Fuerte'])
  for (const b of tags) { expect(b).toHaveClass('h-[44px]', 'text-[13px]'); expect(b.className).not.toMatch(/border|rounded-t-chip/) }
  // Las pestañas de Waiter viven en la fila con la voz de texto (sin chip ni borde) que impone el tablist.
  const tablist = within(row).getByRole('tablist')
  expect(tablist).toHaveClass('[&>button]:border-0', '[&>button]:bg-transparent', '[&>button]:text-[13px]', '[&>button[aria-selected=true]]:text-t-acento')
  expect(within(tablist).getAllByRole('tab').map((b) => b.textContent)).toEqual(['Todo', 'Grifos', 'Cócteles', 'Para picar'])
  fireEvent.click(screen.getByRole('button', { name: 'ligera' }))
  expect(screen.getByRole('button', { name: 'ligera' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 grifos')
  expect(screen.queryByText('IPA de la casa')).toBeNull()
  fireEvent.click(screen.getByRole('tab', { name: 'Cócteles' }))
  expect(props.setCategory).toHaveBeenCalledWith(2)
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  expect(screen.getByRole('searchbox', { name: 'Buscar en la carta' })).toBeInTheDocument()
})

// Falla si el título no lleva el nombre de la categoría activa con su conteo.
it('names the active category with its count', () => {
  wrap(<E1Menu {...menuProps('E1', { category: 3 })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Para picar · 2')
})

// Falla si «Pedir ronda» no lleva al pedido con el total en mono, si con el carrito vacío no queda apagado, o si «Armar flight»
// aparece sin una categoría de flights.
it('sends the order bar to the cart with the total and disables it while the cart is empty', () => {
  const { unmount } = wrap(<E1Menu {...menuProps('E1')} />)
  expect(screen.getByRole('button', { name: 'Pedir ronda' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Armar flight' })).toBeNull()
  unmount()
  const props = menuProps('E1', { cart: cartOf([line({ id: 1, cantidad: 2, subtotal: 28000 })]), entry: entryOf([...categories, { id: 7, nombre: 'Flights', productos: [] }]) })
  wrap(<E1Menu {...props} />)
  const link = screen.getByRole('link', { name: /Pedir ronda · \$ 28\.000/ })
  expect(link).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pedido')
  expect(within(link).getByText('28.000')).toHaveClass('font-t-mono')
  fireEvent.click(screen.getByRole('button', { name: 'Armar flight' }))
  expect(props.setCategory).toHaveBeenCalledWith(7)
})

// Falla si sin etiquetas ni categorías que elegir la fila «Filtrar:» sigue ahí (el spec la omite) o si el buscador de Waiter se pierde.
it('omits the Filtrar row without tags or categories and keeps the search under the header', () => {
  const props = menuProps('E1', { entry: entryOf([{ ...grifos, productos: [{ id: 9, nombre: 'Agua', precio: 3000, agotado: false, categorias: [1] }] }]) })
  wrap(<E1Menu {...props} />)
  expect(screen.queryByTestId('filter-row')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Buscar' })).toBeNull()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar en la carta' }), { target: { value: 'ag' } })
  expect(props.setQuery).toHaveBeenCalledWith('ag')
})

// Falla si una búsqueda sin resultados no lo dice y no ofrece volver a todo.
it('shows an honest empty state for a search without matches', () => {
  const props = menuProps('E1', { query: 'zzz' })
  wrap(<E1Menu {...props} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
  fireEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
  expect(props.setQuery).toHaveBeenCalledWith('')
  expect(props.setCategory).toHaveBeenCalledWith(null)
})
