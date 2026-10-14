import { fireEvent, screen, within } from '@testing-library/react'

import { E4Menu } from '@/components/templates/families/E/E4Menu'
import { cartOf, entryOf, line, menuProps, templateOf, wrap } from '@/components/templates/families/E/__tests__/fixtures'

import type { Bill } from '@/lib/types'

const mockStore = { account: null as { id: string; nombre: string; correo: string; verificada: boolean } | null, bill: null as Bill | null }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: () => mockStore }))
// Cuenta del salón como la usa el pago: cuatro comensales en la mesa, 30.500 por parte.
const bill: Bill = { ok: true, total: 122000, mio: 40000, porComensal: [], partes: 4, porParte: 30500 }

const table = cartOf([
  line({ id: 1, cantidad: 2, subtotal: 28000 }),
  line({ id: 2, producto_id: 6, nombre: 'Papas rústicas', precio: 12000, subtotal: 12000 }),
  line({ id: 3, comensal: 'c-2', mio: false, producto_id: 2, nombre: 'IPA de la casa', precio: 16000, cantidad: 3, subtotal: 48000 }),
  line({ id: 4, comensal: 'c-3', mio: false, producto_id: 4, nombre: 'Humo de páramo', precio: 34000, subtotal: 34000 }),
])

beforeEach(() => { mockStore.account = null; mockStore.bill = null })

// Falla si la cabecera no dice mesa y personas (comensales reales del carrito), si cada comensal no tiene su fila con avatar,
// resumen «2 Golden Ale · 1 Papas rústicas» e importe mono, o si sin cuenta pedida se inventa un reparto.
it('renders the shared bill: table, people, one row per diner with initials and the split note', () => {
  wrap(<E4Menu {...menuProps('E4', { template: templateOf('E4', 'claro'), cart: table })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mesa 6 · 3 personas')
  expect(screen.getByText('7 ítems en la mesa')).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByText('122.000')).toHaveClass('font-t-mono', 'text-[20px]')
  const rows = within(screen.getByRole('list', { name: 'Mesa 6 · 3 personas' })).getAllByRole('listitem')
  expect(rows).toHaveLength(3)
  expect(rows[0]).toHaveTextContent('2 Golden Ale · 1 Papas rústicas')
  expect(within(rows[0]).getByLabelText('Yo')).toHaveTextContent('Yo')
  expect(within(rows[0]).getByText('40.000')).toHaveClass('font-t-mono')
  expect(within(rows[1]).getByLabelText('Comensal 1')).toHaveClass('bg-kitchen')
  expect(within(rows[2]).getByLabelText('Comensal 2')).toHaveClass('bg-free')
  expect(rows[1]).toHaveClass('bg-t-superficie')
  expect(screen.queryByText(/se divide/)).toBeNull()
  expect(screen.queryByRole('link', { name: /Dividir en/ })).toBeNull()
})

// Falla si personas, «Dividir en N» y «X cada uno» no salen de la cuenta del servidor (bill.partes / bill.porParte, la misma que usa
// el pago) sino de un cálculo local que el pago no reconoce.
it('takes the split from the server bill, like the pay screen does', () => {
  mockStore.bill = bill
  wrap(<E4Menu {...menuProps('E4', { cart: table })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mesa 6 · 4 personas')
  expect(screen.getByText('La cuenta se divide en 4: 30.500 cada uno.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Dividir en 4' })).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pago')
})

// Falla si con una sola parte en la cuenta se ofrece «Dividir en 1» o una nota de reparto.
it('offers no split when the bill has a single part', () => {
  mockStore.bill = { ...bill, partes: 1, porParte: 122000 }
  wrap(<E4Menu {...menuProps('E4', { cart: table })} />)
  expect(screen.queryByRole('link', { name: /Dividir en/ })).toBeNull()
  expect(screen.queryByText(/se divide/)).toBeNull()
})

// Falla si el acento (el color de «Yo») se le cuela a otro comensal: los demás alternan solo cocina y libre.
it('never gives another diner my accent colour', () => {
  const four = cartOf([...table.lineas, line({ id: 5, comensal: 'c-4', mio: false, producto_id: 5, nombre: 'Alitas BBQ', precio: 28000, subtotal: 28000 }), line({ id: 6, comensal: 'c-5', mio: false, producto_id: 6, nombre: 'Papas rústicas', precio: 12000, subtotal: 12000 })])
  wrap(<E4Menu {...menuProps('E4', { cart: four })} />)
  expect(screen.getByLabelText('Yo')).toHaveClass('bg-t-acento')
  expect(screen.getByLabelText('Comensal 1')).toHaveClass('bg-kitchen')
  expect(screen.getByLabelText('Comensal 2')).toHaveClass('bg-free')
  expect(screen.getByLabelText('Comensal 3')).toHaveClass('bg-kitchen')
  expect(screen.getByLabelText('Comensal 3')).not.toHaveClass('bg-t-acento')
  expect(screen.getByLabelText('Comensal 4')).toHaveClass('bg-free')
})

// Falla si con cuenta ligada el avatar no lleva las iniciales del comensal.
it('uses the account initials for my avatar', () => {
  mockStore.account = { id: 'a', nombre: 'Camila Ruiz', correo: 'c@c.co', verificada: true }
  wrap(<E4Menu {...menuProps('E4', { cart: table })} />)
  expect(screen.getByLabelText('Yo')).toHaveTextContent('CR')
})

// Falla si con la mesa vacía se inventan personas o reparto, o si la carta completa no sigue disponible con ＋ y apertura.
it('says nobody ordered yet and still offers the whole menu with ＋ and open', () => {
  const props = menuProps('E4')
  wrap(<E4Menu {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Mesa 6')
  expect(screen.getByText('Nadie ha pedido todavía.')).toBeInTheDocument()
  expect(screen.queryByText(/se divide/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Pagar todo' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Agregar: Papas rústicas' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 6 }))
  fireEvent.click(screen.getByText('Alitas BBQ'))
  expect(props.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }))
  expect(screen.getByText('2 tamaños · desde 28.000')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Agregar: Sour de maracuyá' })).toBeNull()
  expect(screen.getByText('Sour de maracuyá').closest('button')).toHaveClass('opacity-55')
  expect(screen.getByTestId('sold-out-badge').closest('.opacity-55')).toBeNull()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ipa' } })
  expect(props.setQuery).toHaveBeenCalledWith('ipa')
  fireEvent.click(screen.getByRole('tab', { name: 'Para picar' }))
  expect(props.setCategory).toHaveBeenCalledWith(3)
})

// Falla si la barra no lleva «Pagar lo mío» / «Dividir en N» al pago y «Pagar todo · total» al pedido.
it('routes the bar actions to pay and to the order with the total', () => {
  mockStore.bill = bill
  wrap(<E4Menu {...menuProps('E4', { cart: table })} />)
  expect(screen.getByRole('link', { name: 'Pagar lo mío' })).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pago')
  expect(screen.getByRole('link', { name: 'Dividir en 4' })).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pago')
  const all = screen.getByRole('link', { name: /Pagar todo · \$ 122\.000/ })
  expect(all).toHaveAttribute('href', '/norte/centro/t/Z2XUVG/pedido')
  expect(within(all).getByText('122.000')).toHaveClass('font-t-mono')
})

// Falla si sin mesa (domicilio) la cabecera inventa un número.
it('handles a session without table', () => {
  wrap(<E4Menu {...menuProps('E4', { entry: entryOf(undefined, null) })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('La mesa')
})
