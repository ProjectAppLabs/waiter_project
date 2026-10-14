import { fireEvent, screen, within } from '@testing-library/react'

import { F5Menu } from '@/components/templates/families/F/F5Menu'
import { cartOf, line, menuProps, wrap } from '@/components/templates/families/F/__tests__/fixtures'

// Falla si la tarjeta con foto pierde la franja 3x2, si la línea «por persona» se inventa sin la etiqueta «para N», o si la primera no queda seleccionada con borde de tinta.
it('paints the set cards with the photo strip, the per-person line only with «para N», and the selection outline', () => {
  wrap(<F5Menu {...menuProps('F5', { category: 2 })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Para compartir')
  expect(screen.getByText('Precio por persona calculado')).toBeInTheDocument()
  const sopa = screen.getByRole('article', { name: 'Sopa miso' })
  expect(sopa).toHaveClass('border-t-tinta')
  expect(within(sopa).getByRole('presentation')).toHaveClass('object-cover')
  expect(within(sopa).queryByText(/por persona/)).toBeNull()
  const set = screen.getByRole('article', { name: 'Set 24 piezas' })
  expect(within(set).getByText('32.000 por persona · para 3')).toHaveClass('font-t-mono', 'text-free-ink')
  expect(within(set).getByText('California, spicy tuna, dragón')).toHaveClass('text-soft')
  expect(set).toHaveClass('border-t-borde')
})

// Falla si tocar una tarjeta no la selecciona, si «Ver el plato» no abre, o si el CTA no añade el seleccionado con su nombre.
it('selects on tap, opens from the selected card and adds the selection from the footer', () => {
  const props = menuProps('F5', { category: 2 })
  wrap(<F5Menu {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Set 24 piezas/, pressed: false }))
  expect(screen.getByRole('article', { name: 'Set 24 piezas' })).toHaveClass('border-t-tinta')
  fireEvent.click(screen.getByRole('button', { name: 'Ver el plato →' }))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
  const add = screen.getByRole('button', { name: 'Añadir · Set 24 piezas' })
  // El verbo nunca se corta: «Añadir» en 16/700 y el nombre en una segunda línea recortable; el nombre completo va en el aria-label.
  expect(within(add).getByText('Añadir')).toHaveClass('font-bold')
  expect(within(add).getByText('Añadir')).not.toHaveClass('truncate')
  expect(within(add).getByText('Set 24 piezas')).toHaveClass('truncate')
  expect(add).toHaveClass('h-14', 'rounded-t-boton', 'bg-t-acento', 'text-t-acento-tinta')
  fireEvent.click(add)
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
})

// Falla si la barra de pedido de la familia no va pegada al pie junto a «Comparar» / «Añadir» cuando hay pedido.
it('sticks the family order bar above the footer when there is an order', () => {
  wrap(<F5Menu {...menuProps('F5', { category: 2, cart: cartOf([line({ producto_id: 5, nombre: 'Set 24 piezas', cantidad: 1, subtotal: 96000 })]) })} />)
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveTextContent('24 piezas · 96.000')
  expect(bar.parentElement).toHaveClass('sticky', 'bottom-0')
  expect(bar.parentElement).toContainElement(screen.getByRole('button', { name: 'Comparar' }))
})

// Falla si «Comparar» no ordena por precio por persona ni marca el mejor, o si un agotado seleccionado deja añadir.
it('compares by price per person and blocks adding a sold-out set', () => {
  wrap(<F5Menu {...menuProps('F5', { category: 2 })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Comparar', pressed: false }))
  const cards = screen.getAllByRole('article')
  expect(cards[0]).toHaveAccessibleName('Set 24 piezas')
  expect(within(cards[0]).getByText('Mejor precio por persona')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Anguila de río/, pressed: false }))
  expect(screen.queryByRole('button', { name: /Añadir/ })).toBeNull()
  expect(screen.getAllByText('Agotado').length).toBeGreaterThan(0)
})
