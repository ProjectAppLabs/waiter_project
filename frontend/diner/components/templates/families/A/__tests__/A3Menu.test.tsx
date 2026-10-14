import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { A3Menu } from '@/components/templates/families/A/A3Menu'
import { dimmedAncestors, menuProps, wrap } from '@/components/templates/families/A/__tests__/fixtures'

const mockCall = jest.fn()
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector: (s: { call: () => Promise<boolean>; cart: null; entry: null }) => unknown) => selector({ call: mockCall, cart: null, entry: null }) }))

beforeEach(() => { mockCall.mockReset() })

// Falla si las píldoras no llevan el conteo de la categoría (la activa rellena), si los grupos no llevan su rótulo en versalitas, si la fila
// pierde la segunda línea (descripción o atributos) o el precio mono, o si el ＋ / la fila no llaman onAdd / onOpen.
it('paints counted pills, grouped rows with a secondary line and wires the row and the ＋', () => {
  const props = menuProps('A3')
  wrap(<A3Menu {...props} />)
  expect(screen.getByRole('tab', { name: 'Todo', selected: true })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Entradas 2' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Vinos 0' })).toBeInTheDocument()
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Entradas', 'Fuertes', 'Postres'])
  expect(screen.getByText('Curada en casa, aguacate, cítricos del Huila.')).toBeInTheDocument()
  expect(screen.getByText('Ocho horas a baja temperatura.')).toBeInTheDocument()
  expect(screen.getByText('2 piezas · vegetariano')).toBeInTheDocument()
  expect(screen.getByText('Contiene: huevo, lácteos')).toBeInTheDocument()
  expect(screen.getByText('20.000')).toHaveClass('font-t-mono')
  fireEvent.click(screen.getByRole('button', { name: /^Tartar de trucha/ }))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Tartar de trucha' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  expect(screen.queryByRole('button', { name: 'Agregar: Ajiaco' })).toBeNull()
  expect(dimmedAncestors(screen.getByText('Ajiaco'))).toBe(1)
  expect(dimmedAncestors(within(screen.getByText('Ajiaco').closest('li') as HTMLElement).getByTestId('sold-out-badge'))).toBe(0)
})

// Falla si la fila de píldoras pierde sus 18 px de aire, si los botones del pie dejan el radio 10 del marco o si el pie y la línea de pedido
// no van en un solo bloque pegado (dos «sticky» se encimarían al recorrer la carta).
it('keeps the frame sizes: 18 px pill row, radius-10 footer buttons in one sticky block with the order line', () => {
  wrap(<A3Menu {...menuProps('A3')} />)
  expect(screen.getByRole('tablist')).toHaveClass('py-[18px]')
  const sommelier = screen.getByRole('button', { name: 'Pedir sumiller' })
  expect(sommelier).toHaveClass('h-12', 'rounded-[10px]')
  expect(screen.getByRole('button', { name: 'Filtrar' })).toHaveClass('rounded-[10px]')
  const line = screen.getByRole('link', { name: /Tu pedido/ })
  expect(line).not.toHaveClass('sticky')
  const sticky = line.parentElement as HTMLElement
  expect(sticky).toHaveClass('sticky')
  expect(sticky).toContainElement(sommelier)
  expect(document.querySelectorAll('.sticky')).toHaveLength(1)
})

// Falla si «Filtrar» no abre la búsqueda de Waiter (y no la cierra limpiando), si «Pedir sumiller» no llama al mesero y lo confirma, o si la
// línea de pedido no enlaza al carrito con el total.
it('opens the search from Filtrar, calls the waiter from Pedir sumiller and links the order line', async () => {
  const user = userEvent.setup()
  mockCall.mockResolvedValue(true)
  const props = menuProps('A3')
  wrap(<A3Menu {...props} />)
  expect(screen.queryByRole('searchbox')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Filtrar', pressed: false }))
  await user.type(screen.getByRole('searchbox', { name: 'Buscar un plato' }), 'c')
  expect(props.setQuery).toHaveBeenLastCalledWith('c')
  await user.click(screen.getByRole('button', { name: 'Cerrar filtro', pressed: true }))
  expect(props.setQuery).toHaveBeenLastCalledWith('')
  await user.click(screen.getByRole('button', { name: 'Pedir sumiller' }))
  expect(mockCall).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Listo, ya viene alguien.'))
  expect(screen.getByRole('link', { name: /Tu pedido · 2 platos · \$ 65\.800/ })).toHaveAttribute('href', '/prov/centro/t/Z2XUVG/pedido')
})

// Falla si la categoría activa no reduce la lista a su grupo o si el vacío de búsqueda no se dice.
it('shows only the active category and an honest empty search', () => {
  wrap(<A3Menu {...menuProps('A3', { category: 3 })} />)
  expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Postres'])
  wrap(<A3Menu {...menuProps('A3', { query: 'zzz' })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Nada coincide con tu búsqueda')
})
