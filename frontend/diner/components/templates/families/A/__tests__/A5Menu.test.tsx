import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { A5Menu } from '@/components/templates/families/A/A5Menu'
import { dimmedAncestors, menuProps, wrap } from '@/components/templates/families/A/__tests__/fixtures'

// Falla si la portada no lista las secciones en tarjetas con «N platos» en mono, si tocar una no la abre (setCategory), o si sin nada pedido
// se dibuja una barra de pedido vacía.
it('paints the section index with counts and opens a section on tap', () => {
  const props = menuProps('A5', { cart: null })
  wrap(<A5Menu {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('La carta')
  expect(screen.getByText('Toca una sección para abrirla')).toBeInTheDocument()
  expect(screen.getAllByRole('tab')).toHaveLength(4)
  expect(screen.getByRole('tab', { name: /Entradas 2 platos/ })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: /Vinos 0 platos/ })).toBeInTheDocument()
  expect(screen.getAllByText('2 platos')[0]).toHaveClass('font-t-mono')
  fireEvent.click(screen.getByRole('tab', { name: /Fuertes/ }))
  expect(props.setCategory).toHaveBeenCalledWith(2)
  expect(screen.queryByRole('link', { name: /Tu pedido/ })).toBeNull()
  expect(screen.queryByRole('article')).toBeNull()
})

// Falla si la sección abierta no pliega la portada a «← La carta» + la tarjeta activa en tinta (bloque tarjetaSeccionActiva: fondo #1A1815,
// nombre en el color del fondo y conteo en dorado = acento; NO el acento de fondo, que en A5 es dorado), si la lista editorial no lleva los
// platos con ＋ y agotado (atenuado una vez, insignia entera), o si volver no limpia la categoría.
it('folds the index to the active card in ink with the golden count and lists the section editorially', () => {
  const props = menuProps('A5', { category: 2 })
  wrap(<A5Menu {...props} />)
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  const active = screen.getByRole('tab', { name: /Fuertes/, selected: true })
  expect(active).toHaveClass('bg-t-tinta')
  expect(active).not.toHaveClass('bg-t-acento')
  expect(within(active).getByText('Fuertes')).toHaveClass('text-t-fondo')
  expect(within(active).getByText('2 platos')).toHaveClass('text-t-acento', 'font-t-mono')
  expect(screen.getAllByRole('article')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Cordero de Boyacá' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  expect(dimmedAncestors(screen.getByText('Ajiaco'))).toBe(1)
  expect(dimmedAncestors(screen.getByTestId('sold-out-badge'))).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: /^Cordero de Boyacá/ }))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  fireEvent.click(screen.getByRole('button', { name: /La carta/ }))
  expect(props.setCategory).toHaveBeenCalledWith(null)
  expect(screen.getByRole('link', { name: /Tu pedido · 2 platos · \$ 65\.800/ })).toBeInTheDocument()
})

// Falla si la búsqueda plegada no lista coincidencias de toda la carta con su rótulo de sección, o si el vacío no se dice.
it('searches across the whole menu from the folded search', async () => {
  const user = userEvent.setup()
  const props = menuProps('A5')
  const { unmount } = wrap(<A5Menu {...props} />)
  await user.click(screen.getByRole('button', { name: 'Buscar' }))
  await user.type(screen.getByRole('searchbox'), 't')
  expect(props.setQuery).toHaveBeenLastCalledWith('t')
  unmount()
  wrap(<A5Menu {...menuProps('A5', { query: 'ta' })} />)
  expect(screen.queryByRole('tablist')).toBeNull()
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Entradas', 'Postres'])
  expect(screen.getAllByRole('article')).toHaveLength(3)
  wrap(<A5Menu {...menuProps('A5', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
