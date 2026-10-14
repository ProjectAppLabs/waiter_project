import { fireEvent, screen, within } from '@testing-library/react'

import { C5Menu } from '@/components/templates/families/C/C5Menu'
import { cartOf, line, menuProps, wrap } from '@/components/templates/families/C/__tests__/fixtures'

// Falla si el resumen no muestra el total en mono, las filas «{n}×», la nota y el total de línea; si el upsell repite lo que ya está
// en el pedido o sale de otra categoría; o si «Pagar» no enlaza con el pedido.
it('shows the order summary with mono figures, the extras upsell without repeats and the pay link', () => {
  const p = menuProps('C5', { cart: cartOf([line({ nota: 'sin cebolla' }), line({ id: 2, producto_id: 9, nombre: 'Papas', precio: 6900, cantidad: 1, subtotal: 6900 })]) })
  wrap(<C5Menu {...p} />)
  expect(screen.getByText('72.700')).toHaveClass('font-t-mono')
  expect(screen.getByText('2×')).toHaveClass('font-t-mono')
  expect(screen.getByText('sin cebolla')).toBeInTheDocument()
  expect(screen.getByText('65.800')).toHaveClass('font-t-mono')
  const upsell = screen.getByRole('region', { name: 'Antes de pagar' })
  expect(within(upsell).getByRole('button', { name: 'Agregar: Salsa extra' })).toHaveTextContent('+2.000')
  expect(within(upsell).queryByRole('button', { name: 'Agregar: Papas' })).toBeNull()
  fireEvent.click(within(upsell).getByRole('button', { name: 'Agregar: Salsa extra' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }))
  expect(screen.getByRole('link', { name: 'Pagar' })).toHaveAttribute('href', '/fogon/centro/t/Z2XUVG/pedido')
  expect(screen.queryByRole('searchbox')).toBeNull()
})

// Falla si «Seguir pidiendo» no abre la carta (aria-expanded) con buscador, pestañas y rejilla; si el ＋ de la rejilla no agrega; o si
// tocar la tarjeta no abre la ficha.
it('opens the menu grid behind «Seguir pidiendo» with search, tabs, add and open', () => {
  const p = menuProps('C5', { cart: cartOf([line({})]) })
  wrap(<C5Menu {...p} />)
  const toggle = screen.getByRole('button', { name: 'Seguir pidiendo' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(toggle.parentElement).toHaveClass('sticky', 'bottom-0')
  expect(screen.getByRole('searchbox', { name: 'Buscar un plato' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Bebidas' })).toBeInTheDocument()
  expect(screen.getAllByRole('article')).toHaveLength(7)
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Limonada' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
  fireEvent.click(screen.getByText('Doble carne + papas'))
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  expect(screen.getByTestId('sold-out-badge')).toBeInTheDocument()
})

// Falla si con el pedido vacío la carta no se abre sola, o si el pie no queda pegado abajo sin barra de Waiter que esquivar.
it('opens the menu by itself when the order is empty and keeps the foot at the bottom', () => {
  wrap(<C5Menu {...menuProps('C5')} />)
  expect(screen.getByText('Todavía no has agregado nada. Elige de la carta.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Seguir pidiendo' })).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getAllByRole('article').length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: 'Seguir pidiendo' }).parentElement).toHaveClass('bottom-0')
})
