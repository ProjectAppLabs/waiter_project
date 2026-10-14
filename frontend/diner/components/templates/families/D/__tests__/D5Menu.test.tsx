import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { D5Menu } from '@/components/templates/families/D/D5Menu'
import { cafe, cartOf, entryOf, horno, line, menuProps, vacia, wrap } from '@/components/templates/families/D/__tests__/fixtures'

const mockStore = { entry: null, account: null, accountOrders: [], loadAccount: jest.fn() }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (sel?: (s: typeof mockStore) => unknown) => (sel ? sel(mockStore) : mockStore) }))

// Falla si las franjas dejan de ser pestañas de ancho igual (rejilla de columnas iguales que salta de fila con 4+ categorías, nunca un
// scroll que recorte la última) navegables con flechas, si la fila pierde miniatura (o placeholder), descripción o precio en mono, o
// si la barra oscura no dice el estado del pedido ni lleva al pedido.
it('paints the time-slot tabs, the 84px rows with thumbnails and the dark order bar', async () => {
  const user = userEvent.setup()
  const p = menuProps({ template: { ...menuProps().template, codigo: 'D5' }, cart: cartOf([line()]), entry: entryOf([cafe, horno, vacia]) })
  wrap(<D5Menu {...p} />)
  const tablist = screen.getByRole('tablist', { name: 'Categorías' })
  expect(tablist).toHaveClass('grid', 'grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))]')
  expect(tablist.className).not.toMatch(/overflow-x/)
  const tabs = within(tablist).getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual(['Todo', 'Café', 'Del horno', 'Tardes'])
  expect(tabs[0]).toHaveClass('min-w-0', 'bg-t-acento')
  tabs[0].focus()
  await user.keyboard('{ArrowRight}')
  expect(p.setCategory).toHaveBeenCalledWith(1)
  const rows = screen.getAllByRole('article')
  expect(rows).toHaveLength(5)
  expect(within(rows[0]).getByRole('presentation')).toHaveAttribute('src', '/fotos/1/')
  expect(within(rows[0]).getByText('Espresso doble con leche')).toBeInTheDocument()
  expect(within(rows[0]).getByText('9.000')).toHaveClass('font-t-mono')
  expect(within(rows[1]).getByText('Foto del plato')).toBeInTheDocument()
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveAttribute('href', '/tinto/centro/t/Z2XUVG/pedido')
  expect(bar).toHaveTextContent('2 ítems · 18.000')
  expect(bar).toHaveTextContent('Ver pedido →')
  expect(bar).toHaveClass('bg-dark')
})

// Falla si la fila no abre el plato, si el ＋ no agrega, o si un plato agotado no queda al 50 % una sola vez (la fila; la foto no se
// atenúa aparte) con «Vuelve mañana» en lugar de la descripción, sin ＋ y sin una segunda insignia «Agotado» (el marco no la trae).
it('opens from the row, adds from the plus and says "Vuelve mañana" for sold-out dishes', () => {
  const p = menuProps()
  wrap(<D5Menu {...p} />)
  fireEvent.click(screen.getByText('Latte'))
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Latte' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  const soldOut = screen.getByText('Cold brew').closest('article') as HTMLElement
  expect(soldOut).toHaveClass('opacity-50')
  expect(within(soldOut).getByRole('presentation').className).not.toMatch(/opacity/)
  expect(within(soldOut).getByText('Vuelve mañana')).toHaveClass('text-busy-ink')
  expect(within(soldOut).queryByText('Doce horas en frío')).toBeNull()
  expect(within(soldOut).queryByTestId('sold-out-badge')).toBeNull()
  expect(within(soldOut).queryByRole('button', { name: /Agregar/ })).toBeNull()
})

// Falla si la banda pierde el buscador de Waiter, o si con el pedido vacío la barra deja de decirlo (0 ítems) y de pegarse abajo.
it('keeps the search in the band and the bar honest when the order is empty', () => {
  const p = menuProps()
  wrap(<D5Menu {...p} />)
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar un plato' }), { target: { value: 'cro' } })
  expect(p.setQuery).toHaveBeenCalledWith('cro')
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveTextContent('0 ítems · 0')
  expect(bar).toHaveClass('sticky')
})
