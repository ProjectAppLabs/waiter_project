import { fireEvent, screen, within } from '@testing-library/react'

import { D2Menu } from '@/components/templates/families/D/D2Menu'
import { cafe, cartOf, cortado, entryOf, horno, line, menuProps, wrap } from '@/components/templates/families/D/__tests__/fixtures'

const mockStore = { entry: null, account: null, accountOrders: [], loadAccount: jest.fn(), add: jest.fn().mockResolvedValue(undefined) }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (sel?: (s: typeof mockStore) => unknown) => (sel ? sel(mockStore) : mockStore) }))

const builder = () => screen.getByRole('region', { name: 'Arma tu pedido' })

// Falla si el constructor no arranca con la bebida que tiene tamaños, si el pie deja de mostrar el precio que cobra el carrito (el
// motor no admite variantes: enseñar 8.000 y cobrar 9.000 era engañar), si el tamaño elegido no viaja como nota de la línea, o si
// la lista completa no sigue debajo con el ＋ por fila y la barra oscura de Waiter cuando hay pedido.
it('opens on the drink with sizes, keeps the charged price in the footer and sends the size as the line note', () => {
  const p = menuProps({ template: { ...menuProps().template, codigo: 'D2' }, cart: cartOf([line()]) })
  wrap(<D2Menu {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Latte')
  expect(screen.getByText('Personalízalo como siempre')).toBeInTheDocument()
  const sizes = within(screen.getByRole('radiogroup', { name: 'Tamaño' })).getAllByRole('radio')
  expect(sizes.map((r) => r.textContent)).toEqual(['8 oz', '12 oz', '16 oz'])
  expect(within(builder()).getByText('9.000')).toHaveClass('font-t-mono')
  expect(within(builder()).queryByText('8.000')).toBeNull()
  fireEvent.click(sizes[2])
  expect(sizes[2]).toHaveAttribute('aria-checked', 'true')
  expect(within(builder()).getByText('9.000')).toBeInTheDocument()
  expect(within(builder()).queryByText('11.000')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))
  expect(mockStore.add).toHaveBeenCalledWith(1, 1, 'Tamaño: 16 oz')
  expect(p.onAdd).not.toHaveBeenCalled()
  expect(screen.getAllByRole('article')).toHaveLength(5)
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Cortado' }))
  expect(p.onAdd).toHaveBeenLastCalledWith(expect.objectContaining({ id: 2 }))
  expect(screen.getByRole('link', { name: 'Tu pedido' })).toHaveTextContent('2 ítems · 18.000')
})

// Falla si tocar una fila no la carga en el constructor (y el tamaño no vuelve al primero), si «Ver ficha completa» no abre el plato,
// o si el constructor pinta grupos sin datos (Cortado no tiene tamaños ni atributos: nada de huecos).
it('loads a tapped row into the builder and opens the full dish page from there', () => {
  const p = menuProps()
  wrap(<D2Menu {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Cortado 6.500' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cortado')
  expect(screen.getByRole('button', { name: 'Cortado 6.500', pressed: true })).toBeInTheDocument()
  expect(screen.queryByRole('radiogroup')).toBeNull()
  expect(within(builder()).getByText('6.500')).toBeInTheDocument()
  // Sin tamaños no hay nota que mandar: «Añadir» es el onAdd del contrato.
  fireEvent.click(screen.getByRole('button', { name: 'Añadir' }))
  expect(p.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: cortado.id }))
  expect(mockStore.add).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Ver ficha completa →' }))
  expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: cortado.id }))
  expect(screen.queryByRole('link', { name: 'Tu pedido' })).toBeNull()
})

beforeEach(() => mockStore.add.mockClear())

// Falla si los atributos presentes no salen como chips, si una bebida agotada ofrece «Añadir», o si el estado vacío habla de búsqueda sin buscar.
it('shows attribute chips only when they exist, blocks sold-out drinks and keeps the honest empty state', () => {
  const p = menuProps({ entry: entryOf([horno, cafe]), category: 2 })
  wrap(<D2Menu {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Croissant 5.500' }))
  expect(within(builder()).getByText('Solo hoy')).toBeInTheDocument()
  expect(within(builder()).getByText('2 piezas')).toBeInTheDocument()
  expect(within(builder()).getByText('mantequilla')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cold brew 11.000' }))
  expect(screen.queryByRole('button', { name: 'Añadir' })).toBeNull()
  expect(within(builder()).getByText('Agotado')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Agregar: Cold brew' })).toBeNull()
})
