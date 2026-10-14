import { fireEvent, screen, within } from '@testing-library/react'

import { D3Menu } from '@/components/templates/families/D/D3Menu'
import { cartOf, line, menuProps, wrap } from '@/components/templates/families/D/__tests__/fixtures'

const mockStore = { entry: null, account: null, accountOrders: [], loadAccount: jest.fn() }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (sel?: (s: typeof mockStore) => unknown) => (sel ? sel(mockStore) : mockStore) }))

// Falla si la vitrina pierde el título, el conteo en mono acento, la rejilla de tarjetas con foto (o el placeholder «Foto del plato»),
// el precio en mono o la banda inferior.
it('paints the showcase grid with photos or the placeholder, prices in mono and the inventory band', () => {
  wrap(<D3Menu {...menuProps({ template: { ...menuProps().template, codigo: 'D3' } })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Salió del horno')
  expect(screen.getByText('5 piezas')).toHaveClass('font-t-mono', 'text-t-acento')
  const cards = screen.getAllByRole('article')
  expect(cards).toHaveLength(5)
  expect(within(cards[0]).getByRole('presentation')).toHaveAttribute('src', '/fotos/1/')
  expect(within(cards[1]).getByText('Foto del plato')).toBeInTheDocument()
  expect(within(cards[0]).getByText('9.000')).toHaveClass('font-t-mono')
  expect(screen.getByText('El inventario del POS actualiza estas cantidades cada minuto.')).toHaveClass('bg-t-acento-suave')
})

// Falla si la tarjeta no abre el plato, si el ＋ no agrega, o si la pieza agotada no queda al 55 % una sola vez (la tarjeta; la foto
// no se atenúa aparte, que la dejaba al 30 %) con la insignia y sin ＋.
it('opens from the card, adds from the plus and dims sold-out pieces once with the badge', () => {
  const p = menuProps()
  wrap(<D3Menu {...p} />)
  fireEvent.click(screen.getByText('Croissant'))
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Croissant' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
  const soldOut = screen.getByText('Cold brew').closest('article') as HTMLElement
  expect(soldOut).toHaveClass('opacity-55')
  expect(within(soldOut).getByRole('presentation').className).not.toMatch(/opacity/)
  expect(within(soldOut).getByTestId('sold-out-badge')).toBeInTheDocument()
  expect(within(soldOut).queryByRole('button', { name: /Agregar/ })).toBeNull()
})

// Falla si, sin barra propia en el marco, la carta pierde la barra oscura de Waiter cuando hay pedido (la página ya no la pinta) o
// la muestra vacía cuando no lo hay.
it('shows the dark order bar only once there is something ordered', () => {
  const empty = wrap(<D3Menu {...menuProps()} />)
  expect(screen.queryByRole('link', { name: 'Tu pedido' })).toBeNull()
  empty.unmount()
  wrap(<D3Menu {...menuProps({ cart: cartOf([line()]) })} />)
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveAttribute('href', '/tinto/centro/t/Z2XUVG/pedido')
  expect(bar).toHaveTextContent('2 ítems · 18.000')
  expect(bar).toHaveClass('sticky', 'bg-dark')
})

// Falla si el marco pierde la búsqueda y las pestañas de Waiter, o si el vacío por búsqueda no ofrece «Ver todos».
it('keeps Waiter search and tabs and clears an empty search', () => {
  const p = menuProps({ query: 'zzz' })
  wrap(<D3Menu {...p} />)
  expect(screen.getByRole('tablist', { name: 'Categorías' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Buscar un plato' })).toHaveValue('zzz')
  expect(screen.getByText('0 piezas')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
  fireEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
  expect(p.setQuery).toHaveBeenCalledWith('')
})
