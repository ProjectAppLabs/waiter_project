import { fireEvent, screen } from '@testing-library/react'

import { C3Menu } from '@/components/templates/families/C/C3Menu'
import { cartOf, line, menuProps, wrap } from '@/components/templates/families/C/__tests__/fixtures'

// Falla si el paso no es la categoría de Waiter (1 de 3 en «Todo»), si el precio 0 no dice «incluido» y el resto «+precio», si el
// agotado se puede elegir, o si «Siguiente» no pasa a la siguiente categoría por setCategory.
it('walks the categories as steps with included / extra prices and a disabled sold-out option', () => {
  const p = menuProps('C3')
  wrap(<C3Menu {...p} />)
  expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Elige Combos' })).toHaveClass('t-title')
  expect(screen.getAllByRole('tab')).toHaveLength(3)
  expect(screen.getByRole('button', { name: /Burger \+ papas/ })).toHaveTextContent('+32.900')
  expect(screen.getByRole('button', { name: /Quesadilla/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: /Quesadilla/ })).toHaveTextContent('agotado')
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  expect(p.setCategory).toHaveBeenCalledWith(2)
  wrap(<C3Menu {...menuProps('C3', { category: 2 })} />)
  expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Agua de Jamaica/ })).toHaveTextContent('incluido')
})

// Falla si elegir no marca aria-pressed ni suma en «Va en», si el segundo toque no abre la ficha, o si el último paso no dice «Añadir»
// y agrega cada opción elegida.
it('accumulates the running price, opens the chosen option on a second tap and adds everything on the last step', () => {
  const p = menuProps('C3', { category: 3 })
  wrap(<C3Menu {...p} />)
  expect(screen.getByText('Paso 3 de 3')).toBeInTheDocument()
  const add = screen.getByRole('button', { name: 'Añadir' })
  expect(add).toBeDisabled()
  const papas = screen.getByRole('button', { name: /Papas/ })
  fireEvent.click(papas)
  expect(papas).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('6.900')).toHaveClass('font-t-mono')
  fireEvent.click(papas)
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }))
  fireEvent.click(add)
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }))
  expect(p.setCategory).toHaveBeenCalledWith(1)
})

// Falla si los segmentos de progreso no saltan de paso, si la búsqueda no filtra las opciones del paso, o si el pie vuelve a levantarse
// para esquivar una barra de Waiter que la página ya no pinta sobre este layout.
it('jumps steps from the progress segments, filters options with the search and keeps the foot at the bottom', () => {
  const p = menuProps('C3', { query: 'doble', cart: cartOf([line({})]) })
  wrap(<C3Menu {...p} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Paso 2: Bebidas' }))
  expect(p.setCategory).toHaveBeenCalledWith(2)
  expect(screen.getByRole('button', { name: /Doble carne/ })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Burger/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Siguiente' }).parentElement).toHaveClass('sticky', 'bottom-0')
  expect(screen.getByRole('button', { name: 'Siguiente' }).parentElement).not.toHaveClass('bottom-[92px]')
})
