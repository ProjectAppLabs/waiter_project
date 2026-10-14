import { fireEvent, screen, within } from '@testing-library/react'

import { B2Menu } from '@/components/templates/families/B/B2Menu'
import { angus, menuProps, tacos, wrap } from '@/components/templates/families/B/__tests__/fixtures'

// Falla si el ranking no va favoritos primero y sin agotados, si inventa «312 pedidos» (solo «Favorito de la casa» o la categoría),
// o si el CTA no pide el primero del ranking.
it('ranks favourites first without sold-out dishes and orders the top one from the CTA', () => {
  const p = menuProps('B2')
  wrap(<B2Menu {...p} />)
  const rows = within(screen.getByRole('list', { name: 'Los más pedidos' })).getAllByRole('listitem')
  expect(rows).toHaveLength(5)
  expect(rows[0]).toHaveTextContent(/^1FotoHamburguesa AngusFavorito de la casa30\.000$/)
  expect(rows[1]).toHaveTextContent('Picada para compartir')
  expect(rows[2]).toHaveTextContent(/Hamburguesa ClásicaHamburguesas20\.000$/)
  expect(screen.queryByText('Club Colombia')).toBeNull()
  expect(screen.queryByText(/pedidos este mes/)).toBeNull()
  expect(within(rows[0]).getByText('Foto')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pedir el más pedido: Hamburguesa Angus' }))
  expect(p.onAdd).toHaveBeenCalledWith(angus)
  fireEvent.click(within(rows[1]).getByRole('button'))
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 12 }))
})

// Falla si «Ver la carta completa · N platos» no despliega toda la carta con buscador, píldoras, agotado y ＋, o si ocultarla no limpia el filtro.
it('unfolds the whole menu with search, pills and ＋, and folds it back clean', () => {
  const p = menuProps('B2')
  wrap(<B2Menu {...p} />)
  const toggle = screen.getByRole('button', { name: /Ver la carta completa · 7 platos/ })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(toggle)
  const full = screen.getByRole('region', { name: 'Carta completa' })
  expect(within(full).getByRole('searchbox', { name: 'Buscar en la carta' })).toBeInTheDocument()
  expect(within(full).getByRole('tablist', { name: 'Categorías' })).toBeInTheDocument()
  expect(within(full).getByText('Club Colombia')).toBeInTheDocument()
  expect(within(full).getByTestId('sold-out-badge')).toBeInTheDocument()
  fireEvent.click(within(full).getByRole('button', { name: 'Agregar: Tacos de carne' }))
  expect(p.onAdd).toHaveBeenCalledWith(tacos)
  fireEvent.click(within(full).getByRole('tab', { name: 'Platos' }))
  expect(p.setCategory).toHaveBeenCalledWith(3)
  fireEvent.click(screen.getByRole('button', { name: /Ocultar la carta completa/ }))
  expect(screen.queryByRole('region', { name: 'Carta completa' })).toBeNull()
  expect(p.setQuery).toHaveBeenCalledWith('')
  expect(p.setCategory).toHaveBeenLastCalledWith(null)
})

// Falla si una búsqueda activa no mantiene la carta completa abierta o no dice que nada coincide.
it('keeps the full menu open while searching and reports no matches', () => {
  wrap(<B2Menu {...menuProps('B2', { query: 'zzz' })} />)
  expect(screen.getByRole('button', { name: /Ocultar la carta completa/ })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
