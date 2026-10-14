import { fireEvent, screen } from '@testing-library/react'

import { FamilyAPay } from '@/components/templates/families/A/FamilyAPay'
import { templateOf, wrap } from '@/components/templates/families/A/__tests__/fixtures'
import type { PayLayoutProps } from '@/components/templates/types'
import type { Bill } from '@/lib/types'

jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector: (s: { cart: { lineas: { cantidad: number }[] }; entry: null; call: () => Promise<boolean> }) => unknown) => selector({ cart: { lineas: [{ cantidad: 2 }] }, entry: null, call: jest.fn() }) }))

const bill: Bill = { ok: false, total: 105945, mio: 105945, porComensal: [], partes: 1, porParte: 105945, descuento: { porcentaje: 5, monto: 5045, aplicable: true, aplicado: true } }
const base = (codigo: string, over: Partial<PayLayoutProps> = {}): PayLayoutProps => ({
  bill, template: templateOf(codigo, codigo === 'A2' ? 'oscuro' : 'claro'), methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 105945, impuestos: 0, intentos: 1 }, merchant: 'La Provincia S.A.S.', table: 14, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(), ...over,
})

// Falla si el pago base (A1) pierde «TOTAL A PAGAR» + monto mono 38, las píldoras de método, el número de tarjeta local, la nota de
// tokenización, la insignia de demo o el CTA en serif «Pagar $ X» (onPay con el método).
it('A1 paints the centered total, the methods, the card form, the tokenized note and pays with the method', () => {
  const p = base('A1')
  wrap(<FamilyAPay {...p} />)
  expect(screen.getByText('Total a pagar')).toHaveClass('uppercase')
  expect(screen.getByText('$ 105.945')).toHaveClass('text-[38px]')
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toBeInTheDocument()
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  fireEvent.change(number, { target: { value: '4111111111111111' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  expect(screen.getByText('Tokenizado por la pasarela. Waiter no ve tu tarjeta.')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  const pay = screen.getByRole('button', { name: 'Pagar $ 105.945' })
  expect(pay).toHaveClass('font-t-display', 'h-[60px]', 'rounded-t-boton')
  fireEvent.click(pay)
  expect(p.onPay).toHaveBeenCalledWith('tarjeta')
  fireEvent.click(screen.getByRole('button', { name: 'Volver al pedido' }))
  expect(p.goBack).toHaveBeenCalledTimes(1)
})

// Falla si, sin cuenta y con el descuento aún aplicable, el pago no ofrece identificarse (onSignup).
it('offers the signup hook while the discount is still applicable', () => {
  const p = base('A1', { bill: { ...bill, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } } })
  wrap(<FamilyAPay {...p} />)
  fireEvent.click(screen.getByRole('button', { name: 'Identifícate y ahorra 5% en tu primera compra →' }))
  expect(p.onSignup).toHaveBeenCalledTimes(1)
})

// Falla si A3/A5 no usan la cabecera «Confirmar y pagar · N platos · mesa X» con la caja resumen (Productos / Descuento / Total) y la nota de
// factura sin caja, o si el CTA de A5 no va en serif y el de A3 sí.
it('A3 and A5 use the confirm header with the summary box and the invoice note', () => {
  const { unmount } = wrap(<FamilyAPay {...base('A3')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confirmar y pagar')
  expect(screen.getByText('2 platos · mesa 14')).toBeInTheDocument()
  expect(screen.getByText('Productos').nextSibling).toHaveTextContent('110.990')
  expect(screen.getByText('Descuento 5%').nextSibling).toHaveTextContent('−5.045')
  expect(screen.getByText('Enviaremos la factura electrónica a tu correo al confirmar el pago.')).toBeInTheDocument()
  expect(screen.queryByText(/Tokenizado/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Pagar $ 105.945' })).not.toHaveClass('font-t-display')
  expect(screen.getByRole('button', { name: 'Pagar $ 105.945' })).toHaveClass('h-[60px]')
  unmount()
  wrap(<FamilyAPay {...base('A5', { table: null })} />)
  expect(screen.getByText('2 platos')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pagar $ 105.945' })).toHaveClass('font-t-display')
})

// Falla si el CTA de pago vuelve a la altura del carrito: el spec de pago pide 60 px en A1–A4 y 64 en A5 (el carrito es 56/60).
it.each([['A1', 'h-[60px]'], ['A2', 'h-[60px]'], ['A3', 'h-[60px]'], ['A4', 'h-[60px]'], ['A5', 'h-16']])('%s pays with a %s CTA', (code, height) => {
  wrap(<FamilyAPay {...base(code)} />)
  const pay = screen.getByRole('button', { name: 'Pagar $ 105.945' })
  expect(pay).toHaveClass(height)
  expect(pay.className).not.toMatch(/\bh-14\b|h-\[56px\]/)
})

// Falla si «Efectivo» no cambia el CTA por «Que el mesero cobre en la mesa», o si «Autorizando» no muestra comercio, referencia y monto con la insignia.
it('switches to pay-at-table for cash and shows the authorizing card', () => {
  const p = base('A2')
  const { unmount } = wrap(<FamilyAPay {...p} />)
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(p.onPayAtTable).toHaveBeenCalledTimes(1)
  unmount()
  wrap(<FamilyAPay {...base('A2', { state: 'authorizing' })} />)
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toHaveClass('animate-spin')
  expect(screen.getByText('La Provincia S.A.S.')).toBeInTheDocument()
  expect(screen.getByText('#14')).toHaveClass('font-t-mono')
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
})

// Falla si «Pagado» pierde la cabecera verde, el ahorro, la referencia, la insignia o la vuelta a la carta; o si «Rechazada» no ofrece las tres salidas.
it('confirms the payment and explains a declined one with its ways out', () => {
  const paid = base('A4', { state: 'paid', result: { estado: 'aprobado', referencia: 'DEMO-127', demo: true, metodo: 'tarjeta', monto: 105945 }, account: { id: 'a', nombre: 'Camila', correo: 'c@c.co', verificada: true } })
  const { unmount } = wrap(<FamilyAPay {...paid} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 5.045')
  expect(screen.getByText(/DEMO-127/)).toBeInTheDocument()
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(paid.goMenu).toHaveBeenCalledTimes(1)
  unmount()
  const declined = base('A4', { state: 'declined' })
  const { container } = wrap(<FamilyAPay {...declined} />)
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('Tu banco no autorizó el pago')
  // La caja de rechazo va con los tokens de ocupado de Waiter, sin hex en duro (heredados del genérico).
  expect(alert).toHaveClass('bg-busy-soft', 'border-busy/30')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-busy-ink')
  expect(container.innerHTML).not.toMatch(/\[#[0-9A-Fa-f]{6}\]/)
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  fireEvent.click(screen.getByRole('button', { name: /Pagar con PSE o Nequi/ }))
  expect(declined.onRetry).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre en la mesa/ }))
  expect(declined.onPayAtTable).toHaveBeenCalledTimes(1)
})

// Falla si con total cero se ofrece pagar.
it('says there is nothing to pay when the total is zero', () => {
  const p = base('A1', { bill: { ...bill, total: 0 } })
  wrap(<FamilyAPay {...p} />)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
})
