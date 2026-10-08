import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { MenuStep } from '@/components/orders/MenuStep'
import { SummaryStep } from '@/components/orders/SummaryStep'
import { planState, TableStep } from '@/components/orders/TableStep'
import { messages } from '@/lib/i18n/messages'
import { cartTotals, DEFAULT_INFO, newLine, type CartLine, type TaxRate } from '@/lib/domain/orderWizard'
import type { OpenOrder } from '@/lib/services/orders'
import type { Category, Floor, Product, Table } from '@/lib/types'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const product = (over: Partial<Product>): Product => ({ id: 1, templateId: 1, name: 'Hamburguesa', price: 20000, categoryIds: [1], taxIds: [], favorite: false, storable: false, soldOut: false, hasImage: false, ...over })
const PRODUCTS = [product({ taxIds: [9] }), product({ id: 2, templateId: 2, name: 'Limonada', price: 6000, categoryIds: [2] }), product({ id: 3, templateId: 3, name: 'Malteada', price: 12000, categoryIds: [2], soldOut: true })]
const CATEGORIES: Category[] = [{ id: 1, name: 'Platos', sequence: 1, station: null }, { id: 2, name: 'Bebidas', sequence: 2, station: null }]
const INC: TaxRate = { id: 9, name: 'INC 8 %', amount: 8, amountType: 'percent', priceInclude: false }

function menu(lines: CartLine[] = [], over: Partial<React.ComponentProps<typeof MenuStep>> = {}) {
  const props = { products: PRODUCTS, categories: CATEGORIES, taxes: [INC], optionsOf: () => [], descriptionOf: () => '', lines, onAdd: jest.fn(), onUpdate: jest.fn(), onQty: jest.fn(), onReset: jest.fn(), onContinue: jest.fn(), ...over }
  wrap(<MenuStep {...props} />)
  return props
}
const card = (name: string) => screen.getByText(name, { selector: 'p' }).closest('li') as HTMLElement

// Falla si el buscador o los chips de categoría dejan de filtrar la carta, o si un plato agotado se puede agregar.
it('filtra por texto y por categoría, y no deja agregar lo agotado', () => {
  menu()
  fireEvent.change(screen.getByPlaceholderText('Buscar plato'), { target: { value: 'limo' } })
  expect(screen.getByText('Limonada')).toBeInTheDocument()
  expect(screen.queryByText('Hamburguesa')).toBeNull()
  fireEvent.change(screen.getByPlaceholderText('Buscar plato'), { target: { value: 'pizza' } })
  expect(screen.getByText('Ningún plato coincide con la búsqueda.')).toBeInTheDocument()
  fireEvent.change(screen.getByPlaceholderText('Buscar plato'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: /Bebidas/ }))
  expect(screen.queryByText('Hamburguesa')).toBeNull()
  expect(within(card('Malteada')).getByText('No disponible')).toBeInTheDocument()
  expect(within(card('Malteada')).getByRole('button', { name: 'Agregar' })).toBeDisabled()
})

// Falla si agregar un plato desde la carta no crea su línea con la cantidad y la nota del modal.
it('agrega un plato con su cantidad y su nota', async () => {
  const props = menu()
  await userEvent.click(within(card('Hamburguesa')).getByRole('button', { name: 'Agregar' }))
  await userEvent.type(screen.getByLabelText('Nota para cocina'), 'sin cebolla')
  await userEvent.click(screen.getByRole('button', { name: 'Más' }))
  await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }))
  expect(props.onAdd).toHaveBeenCalledWith(expect.objectContaining({ productId: 1, qty: 2, note: 'sin cebolla', unitPrice: 20000 }))
})

// Falla si editar, cambiar la cantidad o quitar una línea no llega al carrito, o si se vuelve a sumar el INC al precio final.
it('edita, cambia y quita líneas del detalle con los totales correctos', async () => {
  const line = { ...newLine(PRODUCTS[0], 1, '', []), uuid: 'l1' }
  const props = menu([line])
  const detail = screen.getByRole('region', { name: 'Detalle del pedido' })
  expect(within(detail).getByText('Total a pagar').nextSibling).toHaveTextContent('20.000')
  await userEvent.click(within(detail).getByRole('button', { name: 'Más' }))
  expect(props.onQty).toHaveBeenCalledWith('l1', 2)
  await userEvent.click(within(detail).getByRole('button', { name: 'Quitar' }))
  expect(props.onQty).toHaveBeenCalledWith('l1', 0)
  await userEvent.click(within(detail).getByRole('button', { name: 'Editar' }))
  await userEvent.type(screen.getByLabelText('Nota para cocina'), 'bien asada')
  await userEvent.click(screen.getByRole('button', { name: /Guardar|Agregar al carrito/ }))
  expect(props.onUpdate).toHaveBeenCalledWith('l1', expect.objectContaining({ note: 'bien asada', qty: 1 }))
})

const FLOORS: Floor[] = [{ id: 1, name: 'Salón', tableIds: [1, 2, 3], hasBackground: false }, { id: 2, name: 'Terraza', tableIds: [4], hasBackground: false }]
const table = (id: number, number: number, floorId: number): Table => ({ id, number, floorId, seats: 4, x: 0, y: 0, width: 1, height: 1, shape: 'square', color: null })
const TABLES = [table(1, 1, 1), table(2, 2, 1), table(3, 3, 1), table(4, 10, 2)]
const order = (tableId: number, kitchen: OpenOrder['kitchen']): OpenOrder => ({ id: tableId * 10, tableId, total: 0, tax: 0, state: 'draft', lineCount: 1, startedAt: '', waiter: 'Sofía', kitchen, tracking: null })

// Falla si una mesa ocupada o servida se puede elegir, o si una mesa servida no se muestra como reservada.
it('el estado de cada mesa sale de sus pedidos abiertos', () => {
  const orders = [order(2, 'cooking'), order(3, 'served')]
  expect(planState(TABLES[0], orders)).toBe('available')
  expect(planState(TABLES[1], orders)).toBe('notAvailable')
  expect(planState(TABLES[2], orders)).toBe('reserved')
})

// Falla si el plano no deja elegir, cambiar de piso y quitar la mesa, o si «Continuar» aparece sin mesa elegida.
it('elige una mesa libre por piso y continúa', () => {
  const onSelect = jest.fn(), onContinue = jest.fn()
  const { rerender } = wrap(<TableStep floors={FLOORS} tables={TABLES} orders={[order(2, 'served')]} selected={null} onSelect={onSelect} onContinue={onContinue} />)
  expect(screen.getByText('Elige una mesa para continuar.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Mesa 2/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /Mesa 1/ }))
  expect(onSelect).toHaveBeenCalledWith(1)
  fireEvent.click(screen.getByRole('tab', { name: 'Terraza' }))
  expect(screen.queryByRole('button', { name: /Mesa 1\b/ })).toBeNull()
  expect(screen.getByRole('button', { name: /Mesa 10/ })).toBeInTheDocument()
  rerender(<NextIntlClientProvider locale="es" messages={messages}><TableStep floors={FLOORS} tables={TABLES} orders={[]} selected={4} onSelect={onSelect} onContinue={onContinue} /></NextIntlClientProvider>)
  expect(screen.getByText('Mesa seleccionada:')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(onContinue).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Quitar mesa' }))
  expect(onSelect).toHaveBeenLastCalledWith(null)
})

// Falla si el resumen no muestra la mesa, las notas y adiciones, los totales con impuesto, o si deja confirmar un pedido
// vacío o dos veces mientras se crea; también si un domicilio no muestra dirección y teléfono.
it('el resumen muestra lo que se va a crear y protege la confirmación', () => {
  const lines = [{ ...newLine(PRODUCTS[0], 2, 'sin cebolla', []), uuid: 'a' }]
  const totals = cartTotals(lines, [INC])
  const onConfirm = jest.fn()
  const { rerender } = wrap(<SummaryStep info={DEFAULT_INFO} tableNumber={7} lines={lines} totals={totals} busy={false} error={null} onConfirm={onConfirm} />)
  expect(screen.getByText('Mesa 7')).toBeInTheDocument()
  expect(screen.getByText(/sin cebolla/)).toBeInTheDocument()
  expect(screen.getByText('x2')).toBeInTheDocument()
  expect(screen.getByText('Total a pagar').nextSibling).toHaveTextContent('40.000')
  fireEvent.click(screen.getByRole('button', { name: 'Crear pedido y enviar a cocina' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  const again = (props: Partial<React.ComponentProps<typeof SummaryStep>>) => rerender(<NextIntlClientProvider locale="es" messages={messages}><SummaryStep info={DEFAULT_INFO} tableNumber={7} lines={lines} totals={totals} busy={false} error={null} onConfirm={onConfirm} {...props} /></NextIntlClientProvider>)
  again({ busy: true })
  expect(screen.getByRole('button', { name: 'Creando pedido…' })).toBeDisabled()
  again({ lines: [], error: 'No se pudo crear el pedido.' })
  expect(screen.getByRole('button', { name: 'Crear pedido y enviar a cocina' })).toBeDisabled()
  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo crear el pedido.')
  again({ info: { ...DEFAULT_INFO, type: 'delivery', name: 'Ana', address: 'Calle 10 # 5-20', phone: '3001234567' } })
  expect(screen.getByText('Calle 10 # 5-20')).toBeInTheDocument()
  expect(screen.getByText('3001234567')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeInTheDocument()
  expect(screen.queryByText('Mesa 7')).toBeNull()
})
