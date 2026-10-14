import { fireEvent, screen, waitFor } from '@testing-library/react'

import { F3Menu } from '@/components/templates/families/F/F3Menu'
import { cartOf, line, menuProps, wrap } from '@/components/templates/families/F/__tests__/fixtures'

const mockCall = jest.fn()
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector?: (s: { call: () => Promise<boolean> }) => unknown) => (selector ? selector({ call: mockCall }) : { call: mockCall }) }))

beforeEach(() => mockCall.mockReset())

// Falla si la cabecera centrada pierde el antetítulo con sede y mesa, el título en la voz de la plantilla o la línea dorada en mono; o si con carrito vacío inventa piezas.
it('centres the header with the venue, the display title and the mono line', () => {
  wrap(<F3Menu {...menuProps('F3', { category: 1 })} />)
  expect(screen.getByText('Centro · Mesa 14')).toHaveClass('uppercase')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Rollos')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('t-title')
  expect(screen.getByText('3 platos')).toHaveClass('font-t-mono', 'text-t-acento')
  // Índice de categorías en versalitas (texto subrayado, no chips) para no cargar la cabecera del marco; sin pedido no hay barra.
  expect(screen.getByRole('tab', { name: 'Rollos', selected: true })).toHaveClass('uppercase', 'border-t-acento')
  expect(screen.getByRole('tab', { name: 'Todo' })).not.toHaveClass('rounded-t-chip')
  expect(screen.queryByRole('link', { name: 'Tu pedido' })).toBeNull()
})

// Falla si los platos ya pedidos no se resaltan como «en curso» (anillo dorado, superficie), si los agotados no se apagan, o si la línea dorada no suma el pedido.
it('highlights the dishes already in the order and dims the sold-out ones', () => {
  const cart = cartOf([line({ producto_id: 5, nombre: 'Set 24 piezas', cantidad: 1, subtotal: 96000 })])
  wrap(<F3Menu {...menuProps('F3', { category: 2, cart })} />)
  expect(screen.getByText('$ 96.000 · 24 piezas')).toHaveClass('text-t-acento')
  const set = screen.getByText('Set 24 piezas').closest('div.flex.items-center')
  expect(set).toHaveClass('bg-t-superficie')
  expect(screen.getByText('en tu pedido · ×1')).toHaveClass('text-t-acento')
  // Agotado: se atenúa una sola vez (el cuerpo al 55 %) y «Agotado» queda legible fuera, sin ＋.
  const anguila = screen.getByText('Anguila de río').closest('button')
  expect(anguila).toHaveClass('opacity-55')
  expect(anguila?.parentElement).not.toHaveClass('opacity-55')
  expect(screen.getByText('Agotado')).not.toHaveClass('opacity-55')
  expect(screen.queryByRole('button', { name: 'Agregar: Anguila de río' })).toBeNull()
  expect(screen.getByText('Sopa miso').closest('div.flex.items-center')).not.toHaveClass('bg-t-superficie')
  // La barra de pedido de la familia va en el pie, junto a «Llamar al itamae»: la página ya no pinta la suya.
  const bar = screen.getByRole('link', { name: 'Tu pedido' })
  expect(bar).toHaveTextContent('24 piezas · 96.000')
  expect(bar.parentElement).toHaveClass('sticky', 'bottom-0')
  expect(bar.parentElement).toContainElement(screen.getByRole('button', { name: 'Llamar al itamae' }))
})

// Falla si la fila no abre el plato, el ＋ no lo agrega, o si «Llamar al itamae» no llama al mesero y confirma.
it('opens, adds and calls the itamae', async () => {
  const props = menuProps('F3', { category: 1 })
  mockCall.mockResolvedValue(true)
  wrap(<F3Menu {...props} />)
  fireEvent.click(screen.getByText('California'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Veggie tempura' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }))
  expect(screen.getByText('Sin cambios ni sustituciones.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Llamar al itamae' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Listo, ya viene alguien.'))
  expect(mockCall).toHaveBeenCalledTimes(1)
})
