import { fireEvent, screen, within } from '@testing-library/react'

import { B1Menu } from '@/components/templates/families/B/B1Menu'
import { angus, cartOf, clasica, entryOf, hamburguesas, menuProps, postres, tacos, wrap } from '@/components/templates/families/B/__tests__/fixtures'

// Falla si la rejilla no pinta la carta real: fotos donde las hay, placeholder «Foto del plato» donde no, agotado con insignia y sin ＋,
// y los atributos solo cuando existen (nada inventado para la Clásica).
it('paints the grid with photos, placeholder, sold-out and optional attributes', () => {
  const { container } = wrap(<B1Menu {...menuProps('B1')} />)
  const cards = screen.getAllByRole('article')
  expect(cards).toHaveLength(7)
  expect(container.querySelectorAll('img')).toHaveLength(6)
  expect(within(cards[0]).getByText('Foto del plato')).toBeInTheDocument()
  expect(screen.getByTestId('sold-out-badge')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Agregar: Club Colombia' })).toBeNull()
  expect(screen.getByText('Solo hoy')).toBeInTheDocument()
  expect(screen.getByText('2 tamaños · desde 32.000')).toBeInTheDocument()
  expect(screen.getByText('3 piezas · ●●○')).toHaveAttribute('aria-label', '3 piezas · ●●○ (Picante nivel 2 de 3)')
  expect(screen.getByText('4.7% alc. · 18 IBU · rubia')).toBeInTheDocument()
  const clasicaCard = cards.find((c) => within(c).queryByText('Hamburguesa Clásica'))!
  expect(within(clasicaCard).getByText('20.000')).toHaveClass('font-t-mono')
  expect(within(clasicaCard).queryByText(/piezas|tamaños|alc\./)).toBeNull()
})

// Falla si ＋ abre el plato en vez de agregarlo, si tocar la tarjeta no abre el plato, o si el ＋ pierde su área de toque de 44 px.
it('adds with ＋ (44 px) and opens the dish from the card', () => {
  const p = menuProps('B1')
  wrap(<B1Menu {...p} />)
  const add = screen.getByRole('button', { name: 'Agregar: Hamburguesa Clásica' })
  expect(add).toHaveClass('w-[44px]', 'h-[44px]')
  fireEvent.click(add)
  expect(p.onAdd).toHaveBeenCalledWith(clasica)
  expect(p.onOpen).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Tacos de carne'))
  expect(p.onOpen).toHaveBeenCalledWith(tacos)
})

// Falla si la barra oscura no dice «N ítems · total» con el total en mono y el enlace al pedido, o si con el carrito vacío inventa «0 ítems».
it('shows the frame order bar with the total and the link, and tells the truth when empty', () => {
  const p = menuProps('B1')
  const { unmount } = wrap(<B1Menu {...p} />)
  const bar = screen.getByTestId('frame-order-bar')
  expect(bar).toHaveTextContent('2 ítems · 76.160')
  expect(within(bar).getByText('76.160')).toHaveClass('font-t-mono')
  expect(within(bar).getByRole('link', { name: 'Ver pedido →' })).toHaveAttribute('href', p.orderBarHref)
  unmount()
  wrap(<B1Menu {...menuProps('B1', { cart: cartOf([]) })} />)
  expect(screen.getByTestId('frame-order-bar')).toHaveTextContent('Todavía no has agregado nada.')
  expect(screen.queryByRole('link', { name: 'Ver pedido →' })).toBeNull()
})

// Falla si las píldoras no son pestañas con nombre, si no avisan al contenedor, o si el buscador plegado no aparece y no busca.
it('exposes the category pills as tabs and folds the search behind a 44 px button', () => {
  const p = menuProps('B1')
  wrap(<B1Menu {...p} />)
  const tabs = within(screen.getByRole('tablist', { name: 'Categorías' })).getAllByRole('tab')
  expect(tabs.map((t) => t.textContent)).toEqual(['Todo', 'Hamburguesas', 'Bebidas', 'Platos', 'Para compartir'])
  fireEvent.click(screen.getByRole('tab', { name: 'Bebidas' }))
  expect(p.setCategory).toHaveBeenCalledWith(2)
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Buscar' }))
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar en la carta' }), { target: { value: 'taco' } })
  expect(p.setQuery).toHaveBeenCalledWith('taco')
})

// Falla si una categoría vacía habla de búsqueda, o si con búsqueda sin resultados no se ofrece «Ver todos».
it('tells the truth for empty states', () => {
  const p = menuProps('B1', { entry: entryOf([hamburguesas, postres]), category: 6 })
  wrap(<B1Menu {...p} />)
  expect(screen.getByRole('status')).toHaveTextContent('Esta categoría no tiene platos por ahora')
  fireEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
  expect(p.setCategory).toHaveBeenCalledWith(null)
  expect(p.setQuery).toHaveBeenCalledWith('')
  expect(angus.foto).toBeNull()
})
