import { fireEvent, screen, within } from '@testing-library/react'

import { FamilyBPay } from '@/components/templates/families/B/FamilyBPay'
import { templateOf, wrap } from '@/components/templates/families/B/__tests__/fixtures'
import type { PayLayoutProps } from '@/components/templates/types'
import type { Bill } from '@/lib/types'

const bill: Bill = { ok: true, total: 97812, mio: 24000, porComensal: [], partes: 4, porParte: 24453, descuento: { porcentaje: 5, monto: 4680, aplicable: true, aplicado: true } }
const props = (codigo: string, over: Partial<PayLayoutProps> = {}): PayLayoutProps => ({
  bill, template: templateOf(codigo), methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 97812, impuestos: 0, intentos: 1 }, merchant: 'Burger House', table: 9, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(), ...over,
})

// Falla si la base B1 pierde las píldoras excluyentes, si el número de tarjeta sale del componente, si efectivo no manda al mesero,
// o si falta la insignia «Demo · sin cobro real».
it('B1: method pills, local card form, demo badge and pays with the method and server-calculated split', () => {
  const p = props('B1')
  wrap(<FamilyBPay {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pagar')
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toBeInTheDocument()
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  fireEvent.change(number, { target: { value: '4111111111111111xx' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  expect(screen.getByRole('switch', { name: 'Guardar para la próxima visita' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  expect(screen.getByText('Mesa 9')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 97.812' }))
  expect(p.onPay).toHaveBeenCalledWith('tarjeta', 'all')
  expect(JSON.stringify((p.onPay as jest.Mock).mock.calls)).not.toContain('4111')
  fireEvent.click(screen.getByRole('radio', { name: 'PSE' }))
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(p.onPayAtTable).toHaveBeenCalledTimes(1)
  // Dos salidas al pedido: la flecha de la cabecera y el enlace bajo el CTA.
  const backs = screen.getAllByRole('button', { name: 'Volver al pedido' })
  expect(backs).toHaveLength(2)
  fireEvent.click(backs[1])
  expect(p.goBack).toHaveBeenCalledTimes(1)
})

// Falla si sin cuenta y con el 5 % disponible no se invita a identificarse.
it('invites to identify for the discount when there is no account', () => {
  const p = props('B5', { bill: { ...bill, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } } })
  wrap(<FamilyBPay {...p} />)
  fireEvent.click(screen.getByRole('button', { name: /Identifícate y ahorra 5%/ }))
  expect(p.onSignup).toHaveBeenCalledTimes(1)
})

// Falla si B2 no presenta el método activo como tarjeta seleccionada con «Usar otra forma de pago →» que despliega las demás.
it('B2: the active method as a selected card and the others behind a row', () => {
  const p = props('B2')
  wrap(<FamilyBPay {...p} />)
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  expect(screen.getByRole('radio', { name: 'Tarjeta crédito o débito', checked: true })).toHaveClass('border-t-acento')
  fireEvent.click(screen.getByRole('button', { name: /Usar otra forma de pago/ }))
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  fireEvent.click(screen.getByRole('radio', { name: 'Nequi · con QR' }))
  expect(screen.getAllByRole('radio')).toHaveLength(1)
  expect(screen.getByText(/notificación en tu app de Nequi/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 97.812' }))
  expect(p.onPay).toHaveBeenCalledWith('nequi', 'all')
})

// Falla si B3 no ofrece dividir con los montos reales de la cuenta (lo mío, por parte, todo) o si el CTA no sigue la parte elegida.
it('B3: split options from the real bill drive the CTA amount', () => {
  const p = props('B3')
  wrap(<FamilyBPay {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Cómo dividen?')
  const group = screen.getByRole('radiogroup', { name: 'Cómo dividir la cuenta' })
  expect(within(group).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pagar lo mío24.000', 'Dividir en 424.453', 'Pagar todo97.812'])
  expect(within(group).getByRole('radio', { name: /Pagar todo/, checked: true })).toBeInTheDocument()
  fireEvent.click(within(group).getByRole('radio', { name: /Pagar lo mío/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 24.000' }))
  expect(p.onPay).toHaveBeenCalledWith('tarjeta', 'mine')
})

// Falla si con una sola parte B3 ofrece «Dividir en 1».
it('B3: no split option for a single diner', () => {
  wrap(<FamilyBPay {...props('B3', { bill: { ...bill, partes: 1, porParte: 97812 } })} />)
  expect(screen.queryByRole('radio', { name: /Dividir en/ })).toBeNull()
})

// Falla si B4 pierde la banda crema con el monto de 28 px, las filas de método de 62 px, el CTA con radio 8 o pinta el formulario de tarjeta.
it('B4: cream total band, tall method rows and no card form', () => {
  const p = props('B4')
  wrap(<FamilyBPay {...p} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-t-acento')
  expect(within(screen.getByRole('banner')).getByText('$ 97.812')).toHaveClass('text-[28px]', 'font-t-mono')
  const rows = screen.getAllByRole('radio')
  expect(rows.map((r) => r.textContent)).toEqual(['Tarjeta crédito o débito', 'PSE · desde tu banco', 'Nequi · con QR', 'Efectivo en la caja'])
  expect(rows[0]).toHaveClass('h-[62px]', 'border-t-acento')
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  expect(screen.getByRole('button', { name: 'Pagar $ 97.812' })).toHaveClass('rounded-[8px]', 'h-[64px]')
  // El aviso «Tokenizado» va sobre la superficie de la plantilla: una caja clara fija (bg-muted) dejaba la tinta suave de la pizarra ilegible.
  const tokenized = screen.getByTestId('tokenized')
  expect(tokenized).toHaveClass('bg-t-superficie')
  expect(tokenized).not.toHaveClass('bg-muted')
  expect(within(tokenized).getByText(/Tokenizado/)).toHaveClass('text-t-tinta-suave')
})

// Falla si «Autorizando» deja el spinner solo, si «Pagado» pierde la cabecera verde / el ahorro / la insignia, si «Rechazada» no ofrece
// las tres salidas, o si con total cero se ofrece pagar.
it('paints authorizing, paid, declined and nothing-to-pay', () => {
  const a = wrap(<FamilyBPay {...props('B1', { state: 'authorizing' })} />)
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toBeInTheDocument()
  expect(screen.getByText('Burger House')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  a.unmount()
  const paid = props('B2', { state: 'paid', result: { estado: 'aprobado', referencia: 'DEMO-9', demo: true, metodo: 'tarjeta', monto: 97812 }, account: { id: 'a', nombre: 'Camila', correo: 'c@c.co', verificada: true } })
  const b = wrap(<FamilyBPay {...paid} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 4.680')
  expect(screen.getByText(/DEMO-9/)).toBeInTheDocument()
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(paid.goMenu).toHaveBeenCalledTimes(1)
  b.unmount()
  const declined = props('B3', { state: 'declined' })
  const c = wrap(<FamilyBPay {...declined} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tu banco no autorizó el pago')
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre en la mesa/ }))
  expect(declined.onRetry).toHaveBeenCalledTimes(1)
  expect(declined.onPayAtTable).toHaveBeenCalledTimes(1)
  c.unmount()
  wrap(<FamilyBPay {...props('B4', { bill: { ...bill, total: 0 } })} />)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
})
