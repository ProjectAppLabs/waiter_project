import { fireEvent, screen, within } from '@testing-library/react'

import { E3Menu } from '@/components/templates/families/E/E3Menu'
import { cartOf, entryOf, grifos, line, menuProps, wrap } from '@/components/templates/families/E/__tests__/fixtures'

jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => ({ account: null }) }))

// Falla si con platos «solo hoy» la cabecera en acento no los cuenta en mono grande, si no van primero con su chip, si el subtítulo
// inventa una cantidad de promo, o si la nota aparece sin platos de hoy.
it('counts the today-only dishes in the accent header, lists them first and shows the note', () => {
  wrap(<E3Menu {...menuProps('E3')} />)
  const header = screen.getByRole('banner')
  expect(header).toHaveClass('bg-t-acento')
  expect(within(header).getByText('1')).toHaveClass('font-t-mono', 'text-[42px]')
  expect(within(header).getByText('plato solo hoy')).toBeInTheDocument()
  expect(within(header).getByText('Solo hoy · Cervecería Norte')).toHaveClass('uppercase')
  const items = screen.getAllByRole('listitem').filter((li) => li.closest('[role="tabpanel"]'))
  expect(items[0]).toHaveTextContent('Alitas BBQ')
  expect(within(items[0]).getByText('Solo hoy')).toBeInTheDocument()
  expect(within(items[0]).getByText('6 piezas · 28.000')).toBeInTheDocument()
  expect(within(items[0]).getByText('28.000', { selector: '.font-t-mono' })).toHaveClass('text-[#A9E0C0]')
  expect(screen.getByText(/Lo marcado «Solo hoy» es de hoy/)).toBeInTheDocument()
  expect(screen.getByText('Papas rústicas').closest('li')?.querySelectorAll('span')).not.toHaveLength(0)
})

// Falla si sin platos de hoy la cabecera inventa un reloj en vez de mostrar la marca, o si la nota y el filtro sobran.
it('shows the brand instead of a clock when nothing is today-only', () => {
  wrap(<E3Menu {...menuProps('E3', { entry: entryOf([grifos]) })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cervecería Norte')
  expect(screen.getByText('Doce grifos, seis clásicos')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Solo hoy' })).toBeNull()
  expect(screen.queryByText(/Lo marcado «Solo hoy»/)).toBeNull()
})

// Falla si el filtro «Solo hoy» (aria-pressed) no deja solo los platos de hoy, o si las categorías y la búsqueda no van sobre la lista.
it('filters to the today-only dishes with a pressed toggle and keeps search and tabs above the list', () => {
  const props = menuProps('E3')
  wrap(<E3Menu {...props} />)
  const toggle = screen.getByRole('button', { name: 'Solo hoy' })
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByText('Golden Ale')).toBeNull()
  expect(screen.getByText('Alitas BBQ')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ipa' } })
  expect(props.setQuery).toHaveBeenCalledWith('ipa')
  fireEvent.click(screen.getByRole('tab', { name: 'Grifos' }))
  expect(props.setCategory).toHaveBeenCalledWith(1)
})

// Falla si el ＋ no agrega, si tocar la tarjeta no abre, si el agotado ofrece ＋, o si el CTA no lleva al pedido con el total.
it('adds, opens and sends the CTA to the order with the total', () => {
  const props = menuProps('E3', { cart: cartOf([line({ id: 1, cantidad: 3, subtotal: 42000 })]) })
  wrap(<E3Menu {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Golden Ale' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  fireEvent.click(screen.getByText('IPA de la casa'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }))
  expect(screen.queryByRole('button', { name: 'Agregar: Sour de maracuyá' })).toBeNull()
  const cta = screen.getByRole('link', { name: /Ver pedido · \$ 42\.000/ })
  expect(cta).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pedido')
  // Radio 12 del marco del menú (radioBoton 8 es solo de carrito y pago) y 56 px.
  expect(cta).toHaveClass('bg-t-acento', 'rounded-[12px]', 'h-[56px]')
  expect(cta).not.toHaveClass('rounded-t-boton')
  // Agotado: contenido al 55 % una sola vez y la insignia fuera de la zona atenuada.
  const sour = screen.getByText('Sour de maracuyá')
  expect(sour.closest('button')).toHaveClass('opacity-55')
  expect(sour.closest('li')).not.toHaveClass('opacity-55')
  expect(screen.getByTestId('sold-out-badge').closest('.opacity-55')).toBeNull()
})

// Falla si con el carrito vacío el CTA no queda apagado.
it('disables the CTA while the cart is empty', () => {
  wrap(<E3Menu {...menuProps('E3')} />)
  expect(screen.getByRole('button', { name: 'Tu pedido' })).toBeDisabled()
})
