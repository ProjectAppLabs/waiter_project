import { fireEvent, screen, within } from '@testing-library/react'

import { A2Menu } from '@/components/templates/families/A/A2Menu'
import { dimmedAncestors, entryOf, fuertes, menuProps, postres, wrap } from '@/components/templates/families/A/__tests__/fixtures'

// Falla si la categoría no se lee como el menú (antetítulo, nombre del primer producto en serif, precio «por persona» en mono), si los pasos
// no van numerados 01, 02… con los demás productos, o si «Reservar el menú» no agrega el producto-menú.
it('maps the category to a tasting menu and reserves it with the single action', () => {
  const props = menuProps('A2', { category: 2 })
  wrap(<A2Menu {...props} />)
  expect(screen.getByText('Fuertes', { selector: 'p' })).toHaveClass('uppercase')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cordero de Boyacá')
  expect(screen.getByText(/30\.000 por persona/)).toHaveClass('font-t-mono')
  const steps = screen.getByRole('list', { name: 'Pasos del menú' })
  expect(steps).toHaveTextContent('01')
  expect(steps).toHaveTextContent('Ajiaco')
  fireEvent.click(screen.getByRole('button', { name: 'Reservar el menú' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  fireEvent.click(screen.getByRole('button', { name: /Ajiaco/ }))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 4 }))
})

// Falla si un paso agotado no va al 55 %, si sin categoría no se toma la primera, si las otras categorías no se ofrecen como pestañas
// (sin «Todo»: un menú a la vez) o si la línea de pedido no lleva el total.
it('dims sold-out steps, defaults to the first category and offers the others as tabs', () => {
  const props = menuProps('A2')
  wrap(<A2Menu {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Burrata italiana')
  expect(screen.queryByRole('tab', { name: 'Todo' })).toBeNull()
  expect(screen.getByRole('tab', { name: 'Entradas', selected: true })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Postres' }))
  expect(props.setCategory).toHaveBeenCalledWith(3)
  expect(screen.getByRole('link', { name: /Tu pedido · 2 platos · \$ 65\.800/ })).toHaveAttribute('href', '/prov/centro/t/Z2XUVG/pedido')
  const { unmount } = wrap(<A2Menu {...menuProps('A2', { category: 3, entry: entryOf([postres, fuertes]) })} />)
  expect(dimmedAncestors(screen.getByText('Brownie'))).toBe(1)
  expect(dimmedAncestors(within(screen.getByText('Brownie').closest('li') as HTMLElement).getByTestId('sold-out-badge'))).toBe(0)
  unmount()
})

// Falla si un menú agotado deja reservar, o si con una categoría vacía se rompe en vez de decirlo.
it('disables the reservation for a sold-out menu and survives an empty category', () => {
  const soldOut = { ...fuertes, productos: [{ ...fuertes.productos[1] }, fuertes.productos[0]] }
  wrap(<A2Menu {...menuProps('A2', { entry: entryOf([soldOut]) })} />)
  expect(screen.getByRole('button', { name: 'Menú agotado por hoy' })).toBeDisabled()
  wrap(<A2Menu {...menuProps('A2', { entry: entryOf([{ id: 9, nombre: 'Vacía', productos: [] }]) })} />)
  expect(screen.getByRole('status')).toHaveTextContent('La carta está vacía por ahora')
})
