import { fireEvent, screen, within } from '@testing-library/react'

import { E2Menu } from '@/components/templates/families/E/E2Menu'
import { cartOf, entryOf, grifos, line, menuProps, wrap } from '@/components/templates/families/E/__tests__/fixtures'

jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ account: null }) }))

// Falla si la cabecera no lleva la marca en la voz de la plantilla con su lema (es la cabecera del marco: la página no pinta otra),
// si las fichas pierden ingredientes o chips de perfil, si una ficha sin etiquetas deja una fila de chips vacía bajo el nombre, o si
// el agotado atenúa la insignia.
it('renders the brand header and cards with ingredients and profile chips only when present', () => {
  wrap(<E2Menu {...menuProps('E2')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cervecería Norte')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('t-title')
  expect(screen.getByText('Doce grifos, seis clásicos')).toBeInTheDocument()
  const humo = screen.getByText('Humo de páramo').closest('li') as HTMLElement
  expect(within(humo).getByText('Mezcal, aguacate, limón, sal de gusano.')).toHaveClass('text-t-tinta-terciaria')
  expect(within(humo).getByText('Ahumado')).toHaveClass('rounded-t-chip')
  expect(within(humo).getByText('34.000')).toHaveClass('font-t-mono')
  const papas = screen.getByText('Papas rústicas').closest('li') as HTMLElement
  expect(within(papas).queryAllByText(/./).filter((el) => el.classList.contains('rounded-t-chip'))).toHaveLength(0)
  // Sin descripción ni chips la ficha es solo su primera línea (nombre · precio · ＋): ninguna banda vacía debajo.
  expect(papas.children).toHaveLength(1)
  expect(within(papas).getByRole('button', { name: 'Agregar: Papas rústicas' })).toHaveClass('h-[44px]')
  const sour = screen.getByText('Sour de maracuyá')
  expect(sour.closest('button')).toHaveClass('opacity-55')
  expect(sour.closest('li')).not.toHaveClass('opacity-55')
  const badge = screen.getByTestId('sold-out-badge')
  expect(badge).toHaveTextContent('Agotado')
  expect(badge.closest('.opacity-55')).toBeNull()
  expect(screen.getByText('Sour de maracuyá').closest('li')?.querySelector('img')).toBeNull()
})

// Falla si sin lema el subtítulo no cuenta los cócteles de la categoría activa.
it('falls back to the cocktail count when the brand has no motto', () => {
  const entry = entryOf([grifos])
  entry.contexto.marca = { ...entry.contexto.marca, lema: '' }
  wrap(<E2Menu {...menuProps('E2', { entry })} />)
  expect(screen.getByText('3 cócteles')).toBeInTheDocument()
})

// Falla si tocar la ficha no abre el plato, si el ＋ no agrega, o si la búsqueda y las categorías no están bajo la cabecera.
it('opens from the card, adds from the ＋ and exposes search and category tabs under the header', () => {
  const props = menuProps('E2')
  wrap(<E2Menu {...props} />)
  fireEvent.click(screen.getByText('Humo de páramo'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Golden Ale' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  expect(screen.queryByRole('button', { name: 'Agregar: Sour de maracuyá' })).toBeNull()
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar en la carta' }), { target: { value: 'humo' } })
  expect(props.setQuery).toHaveBeenCalledWith('humo')
  fireEvent.click(screen.getByRole('tab', { name: 'Cócteles' }))
  expect(props.setCategory).toHaveBeenCalledWith(2)
})

// Falla si la barra no dice la verdad con el carrito vacío o si con ítems no lleva al pedido con el total en mono.
it('shows the round bar with the total and the way to the order', () => {
  const { unmount } = wrap(<E2Menu {...menuProps('E2')} />)
  expect(screen.getByTestId('frame-order-bar')).toHaveTextContent('Todavía no has agregado nada.')
  expect(screen.queryByRole('link', { name: 'Ver pedido' })).toBeNull()
  unmount()
  wrap(<E2Menu {...menuProps('E2', { cart: cartOf([line({ id: 1, cantidad: 2, subtotal: 28000 }), line({ id: 2, producto_id: 4, nombre: 'Humo de páramo', precio: 34000, subtotal: 34000 })]) })} />)
  const bar = screen.getByTestId('frame-order-bar')
  expect(bar).toHaveTextContent('3 ítems · 62.000')
  expect(within(bar).getByText('62.000')).toHaveClass('font-t-mono')
  expect(screen.getByRole('link', { name: 'Ver pedido' })).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pedido')
})
