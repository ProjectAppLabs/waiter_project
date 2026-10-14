import { fireEvent, screen, within } from '@testing-library/react'

import { B5Menu } from '@/components/templates/families/B/B5Menu'
import { clasica, menuProps, wrap } from '@/components/templates/families/B/__tests__/fixtures'

// Falla si el acordeón no abre la primera sección con «N · cerrar» y cierra las demás con «N · abrir», si las filas llevan ＋ (el spec
// manda abrir el plato), o si tocar una fila no abre el plato.
it('folds the categories and opens a dish from its row without ＋', () => {
  const p = menuProps('B5')
  wrap(<B5Menu {...p} />)
  const first = screen.getByRole('button', { name: /Hamburguesas/ })
  expect(first).toHaveAttribute('aria-expanded', 'true')
  expect(first).toHaveTextContent('2 · cerrar')
  expect(screen.getByRole('button', { name: /Bebidas/ })).toHaveTextContent('2 · abrir')
  expect(screen.queryByText('Limonada de Coco')).toBeNull()
  expect(screen.queryAllByRole('button', { name: /Agregar/ })).toHaveLength(0)
  expect(screen.getByText('Doble carne, cheddar')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Hamburguesa Clásica/ }))
  expect(p.onOpen).toHaveBeenCalledWith(clasica)
  fireEvent.click(screen.getByRole('button', { name: /Bebidas/ }))
  expect(screen.getByRole('button', { name: /Bebidas/ })).toHaveAttribute('aria-expanded', 'true')
  const club = screen.getByRole('button', { name: /Club Colombia/ })
  expect(club).toHaveTextContent('Agotado')
  expect(club).toHaveTextContent('4.7% alc. · 18 IBU · rubia')
  fireEvent.click(first)
  expect(first).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Hamburguesa Clásica')).toBeNull()
})

// Falla si el buscador no filtra dejando abiertas solo las secciones con coincidencias, o si el botón ≡ no despliega las píldoras.
it('searches across sections and unfolds the category pills behind ≡', () => {
  const p = menuProps('B5', { query: 'taco' })
  wrap(<B5Menu {...p} />)
  expect(screen.getByRole('searchbox', { name: 'Buscar en la carta' })).toHaveValue('taco')
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1)
  expect(screen.getByRole('button', { name: /Platos/ })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText('Tacos de carne')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'tacos de' } })
  expect(p.setQuery).toHaveBeenCalledWith('tacos de')
  expect(screen.queryByRole('tablist')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar por categoría' }))
  fireEvent.click(within(screen.getByRole('tablist', { name: 'Categorías' })).getByRole('tab', { name: 'Bebidas' }))
  expect(p.setCategory).toHaveBeenCalledWith(2)
})

// Falla si la barra oscura de pedido no lleva el total en mono, o si con búsqueda sin resultados no lo dice.
it('shows the frame order bar and the empty search state', () => {
  const p = menuProps('B5', { query: 'zzz' })
  wrap(<B5Menu {...p} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
  const bar = screen.getByTestId('frame-order-bar')
  expect(bar).toHaveTextContent('2 ítems · 76.160')
  expect(within(bar).getByRole('link', { name: 'Ver pedido →' })).toHaveAttribute('href', p.orderBarHref)
})
