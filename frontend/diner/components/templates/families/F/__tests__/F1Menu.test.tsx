import { fireEvent, screen, within } from '@testing-library/react'

import { F1Menu } from '@/components/templates/families/F/F1Menu'
import { cartOf, line, menuProps, wrap } from '@/components/templates/families/F/__tests__/fixtures'

// Falla si las filas no llevan miniatura 1x1 (o el placeholder sin foto), el «N piezas» en mono, el chip de picante / etiqueta solo cuando hay dato, o si el agotado pierde su insignia.
it('renders the rows with photo, pieces and the optional chips only when the data exists', () => {
  wrap(<F1Menu {...menuProps('F1')} />)
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(6)
  const california = within(rows[0])
  expect(california.getByRole('presentation')).toHaveAttribute('src', 'http://x/california.jpg')
  expect(california.getByText('8 piezas')).toHaveClass('font-t-mono')
  expect(california.getByText('28.000')).toHaveClass('font-t-mono')
  expect(california.queryByText(/picante/)).toBeNull()
  expect(within(rows[1]).getByText('picante 2')).toHaveClass('bg-busy-soft')
  const veggie = within(rows[2])
  expect(veggie.getByText('vegano')).toHaveClass('bg-free-soft')
  expect(veggie.getByText('Foto del plato')).toBeInTheDocument()
  expect(veggie.queryByRole('presentation')).toBeNull()
  const sopa = within(rows[3])
  expect(sopa.queryByText(/piezas/)).toBeNull()
  const anguila = within(rows[5])
  expect(anguila.getByRole('presentation')).toHaveClass('opacity-55')
  expect(anguila.getByTestId('sold-out-badge')).toBeInTheDocument()
  expect(anguila.queryByRole('button', { name: /Agregar/ })).toBeNull()
  // Una sola vez: la insignia sobre la foto; el precio sigue a la derecha sin repetir «Agotado».
  expect(anguila.getAllByText('Agotado')).toHaveLength(1)
  expect(anguila.getByText('42.000')).toBeInTheDocument()
})

// Falla si el chip vuelve a caer bajo el nombre (el marco lo pone a la derecha en la misma línea): la fila no envuelve y el nombre se recorta antes que el chip.
it('keeps the chip on the same line as the name', () => {
  wrap(<F1Menu {...menuProps('F1')} />)
  const name = screen.getByText('Spicy tuna')
  const chip = screen.getByText('picante 2')
  expect(name.parentElement).toBe(chip.parentElement)
  expect(name.parentElement).toHaveClass('flex', 'items-center')
  expect(name.parentElement).not.toHaveClass('flex-wrap')
  expect(name).toHaveClass('truncate')
  expect(chip).toHaveClass('shrink-0')
  expect(screen.queryByText('picante 0')).toBeNull()
})

// Falla si la fila no abre el plato, si el ＋ no agrega exactamente ese plato, o si las pestañas no son rectangulares con la activa en el acento.
it('opens from the row, adds from the plus and paints the tabs in the accent', () => {
  const props = menuProps('F1')
  wrap(<F1Menu {...props} />)
  fireEvent.click(screen.getByText('Spicy tuna'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: California' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  expect(props.onAdd).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('tab', { name: 'Todo', selected: true })).toHaveClass('bg-t-acento', 'rounded-[8px]')
  expect(screen.getByRole('tab', { name: 'Rollos' })).toHaveClass('border-t-borde')
  fireEvent.click(screen.getByRole('tab', { name: 'Rollos' }))
  expect(props.setCategory).toHaveBeenCalledWith(1)
})

// Falla si la barra del marco no suma piezas × cantidad con el total en mono y el enlace al pedido, o si aparece con el carrito vacío.
it('shows the dark order bar with the pieces sum and hides it when the cart is empty', () => {
  const props = menuProps('F1', { cart: cartOf([line({ producto_id: 1, cantidad: 2, subtotal: 56000 }), line({ id: 2, producto_id: 4, nombre: 'Sopa miso', precio: 9000, cantidad: 1, subtotal: 9000 })]) })
  const { unmount } = wrap(<F1Menu {...props} />)
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveAttribute('href', '/kaiseki/centro/t/T0K3N/pedido')
  expect(bar).toHaveClass('bg-dark')
  // Una sola barra, pegada al pie como en el marco (la página ya no pinta la suya sobre este layout).
  expect(screen.getAllByRole('link', { name: /pedido/i })).toHaveLength(1)
  expect(bar.parentElement).toHaveClass('sticky', 'bottom-0')
  expect(bar).toHaveTextContent('16 piezas · 65.000')
  expect(bar).toHaveTextContent('Ver pedido →')
  expect(within(bar).getByText('65.000')).toHaveClass('font-t-mono')
  unmount()
  wrap(<F1Menu {...menuProps('F1', { cart: cartOf([]) })} />)
  expect(screen.queryByRole('link', { name: 'Tu pedido' })).toBeNull()
})

// Falla si sin piezas en la carta la barra inventa un conteo en vez de decir ítems.
it('counts items when no line has pieces', () => {
  wrap(<F1Menu {...menuProps('F1', { cart: cartOf([line({ producto_id: 4, nombre: 'Sopa miso', cantidad: 3, subtotal: 27000 })]) })} />)
  expect(screen.getByRole('link', { name: 'Tu pedido' })).toHaveTextContent('3 ítems · 27.000')
})

// Falla si la lupa no despliega el buscador de Waiter o si la búsqueda no filtra por el contenedor.
it('folds the search behind the magnifier and forwards the query', () => {
  const props = menuProps('F1', { query: 'sopa' })
  wrap(<F1Menu {...props} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  expect(screen.queryByRole('searchbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Buscar un plato', pressed: false }))
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cal' } })
  expect(props.setQuery).toHaveBeenCalledWith('cal')
})
