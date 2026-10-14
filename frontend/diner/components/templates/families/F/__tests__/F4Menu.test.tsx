import { fireEvent, screen, within } from '@testing-library/react'

import { F4Menu } from '@/components/templates/families/F/F4Menu'
import { cartOf, entryOf, line, menuProps, wrap } from '@/components/templates/families/F/__tests__/fixtures'

// Falla si la escala de picante no llena tantas barras como atributos.picante (de cuatro), si se pinta sin dato, o si «Contiene:» falta o se inventa.
it('paints the spicy scale and the allergens only when the data exists', () => {
  wrap(<F4Menu {...menuProps('F4', { category: 1 })} />)
  const rows = screen.getAllByRole('listitem')
  const tuna = within(rows[1])
  const scale = tuna.getByLabelText('Picante 2/3')
  expect(scale.querySelectorAll('.bg-t-acento')).toHaveLength(2)
  expect(scale.querySelectorAll('.bg-t-borde')).toHaveLength(2)
  expect(tuna.getByText('Contiene: pescado, soya')).toBeInTheDocument()
  expect(within(rows[0]).queryByLabelText(/Picante/)).toBeNull()
  expect(within(rows[2]).queryByText(/Contiene/)).toBeNull()
  expect(within(rows[0]).queryByRole('presentation')).toBeNull()
})

// Falla si picante 0 pinta la escala vacía: 0 es «sin picante», se omite como cuando falta el atributo (F1 tampoco pone chip).
it('omits the spicy scale when picante is 0', () => {
  const mild = entryOf([{ id: 1, nombre: 'Platos', productos: [{ id: 9, nombre: 'Arroz', precio: 12000, agotado: false, categorias: [1], atributos: { picante: 0 } }] }])
  wrap(<F4Menu {...menuProps('F4', { entry: mild })} />)
  expect(screen.queryByText('Picante')).toBeNull()
  expect(screen.queryByLabelText(/Picante/)).toBeNull()
})

// Falla si las píldoras no salen de los alérgenos y etiquetas de la carta, si el filtro borra el plato en vez de atenuarlo y explicar, o si la activa no va en verde.
it('builds the filter pills from the menu and dims the clashing dishes with a reason', () => {
  const props = menuProps('F4')
  wrap(<F4Menu {...props} />)
  const filters = screen.getByRole('region', { name: 'Filtra la carta' })
  expect(within(filters).getAllByRole('button').map((b) => b.textContent)).toEqual(['Sin soya', 'Sin pescado', 'Vegano'])
  const soy = within(filters).getByRole('button', { name: 'Sin soya', pressed: false })
  fireEvent.click(soy)
  expect(within(filters).getByRole('button', { name: 'Sin soya ✓', pressed: true })).toHaveClass('bg-free-soft')
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(6)
  expect(rows[0]).toHaveClass('opacity-45')
  expect(within(rows[0]).getByText('Contiene soya · oculto por tu filtro')).toHaveClass('text-busy-ink')
  expect(within(rows[0]).queryByRole('button', { name: /Agregar/ })).toBeNull()
  expect(rows[2]).not.toHaveClass('opacity-45')
  fireEvent.click(within(filters).getByRole('button', { name: 'Vegano' }))
  expect(within(rows[3]).getByText('No es vegano · oculto por tu filtro')).toBeInTheDocument()
  expect(rows[2]).not.toHaveClass('opacity-45')
})

// Falla si sin alérgenos ni etiquetas se pinta un bloque de filtros vacío, o si se pierde la nota fija del pie.
it('omits the filter block when the menu has nothing to filter by and keeps the footer note', () => {
  const plain = entryOf([{ id: 1, nombre: 'Platos', productos: [{ id: 9, nombre: 'Arroz', precio: 12000, agotado: false, categorias: [1] }] }])
  wrap(<F4Menu {...menuProps('F4', { entry: plain })} />)
  expect(screen.queryByRole('region', { name: 'Filtra la carta' })).toBeNull()
  expect(screen.getByText(/El filtro no borra el plato/)).toBeInTheDocument()
})

// Falla si la fila no abre el plato, el ＋ no lo agrega, o si el agotado ofrece ＋.
it('opens from the row and adds from the plus, never for a sold-out dish', () => {
  const props = menuProps('F4', { category: 2 })
  wrap(<F4Menu {...props} />)
  fireEvent.click(screen.getByText('Sopa miso'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Set 24 piezas' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
  expect(screen.queryByRole('button', { name: 'Agregar: Anguila de río' })).toBeNull()
  // Agotado: el cuerpo se atenúa una sola vez y «Agotado» queda legible a la derecha, fuera de lo atenuado.
  const anguila = screen.getByText('Anguila de río').closest('li')
  expect(anguila).not.toHaveClass('opacity-55')
  expect(screen.getByText('Anguila de río').closest('button')).toHaveClass('opacity-55')
  expect(within(anguila as HTMLElement).getByText('Agotado')).toHaveClass('text-busy-ink')
  expect(within(anguila as HTMLElement).getAllByText('Agotado')).toHaveLength(1)
})

// Falla si la barra de pedido de la familia no acompaña a la nota del pie cuando hay pedido (la página ya no pinta la suya).
it('sticks the order bar above the footer note when there is an order', () => {
  wrap(<F4Menu {...menuProps('F4', { cart: cartOf([line({})]) })} />)
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveTextContent('16 piezas · 56.000')
  expect(bar.parentElement).toHaveClass('sticky', 'bottom-0')
  expect(bar.parentElement).toHaveTextContent(/El filtro no borra el plato/)
})
