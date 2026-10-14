import { fireEvent, screen, within } from '@testing-library/react'

import { FamilyEPay } from '@/components/templates/families/E/FamilyEPay'
import { templateOf, wrap } from '@/components/templates/families/E/__tests__/fixtures'
import type { PayLayoutProps } from '@/components/templates/types'
import type { Bill } from '@/lib/types'

const bill: Bill = { ok: true, total: 63000, mio: 24000, porComensal: [], partes: 4, porParte: 15750, descuento: { porcentaje: 5, monto: 3000, aplicable: true, aplicado: true } }
const base = (codigo: string, over: Partial<PayLayoutProps> = {}): PayLayoutProps => ({
  bill, template: templateOf(codigo, codigo === 'E4' ? 'claro' : 'oscuro'), methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 63000, impuestos: 0, intentos: 1 }, merchant: 'Cervecería Norte S.A.S.', table: 6, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(), ...over,
})

// Falla si E1 pierde «¿Cómo dividen?» con las tres opciones reales (lo mío, en N, todo), si el CTA no cobra la parte elegida, si
// onPay lleva algo más que el método, o si pinta el formulario de tarjeta, la nota de tokenización o la línea de mesa que su marco no tiene.
it('E1: offers the split options with real amounts and pays the chosen part with the method and server-calculated split', () => {
  const props = base('E1')
  wrap(<FamilyEPay {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Cómo dividen?')
  expect(screen.getByText('$ 63.000')).toHaveClass('font-t-mono', 'text-[19px]')
  const split = screen.getByRole('radiogroup', { name: 'Cómo dividir la cuenta' })
  expect(within(split).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Pagar lo mío24.000', 'Dividir en 415.750', 'Pagar todo63.000'])
  expect(within(split).getByRole('radio', { name: /Pagar todo/, checked: true })).toHaveClass('border-t-acento')
  fireEvent.click(within(split).getByRole('radio', { name: /Dividir en 4/ }))
  expect(screen.getByRole('button', { name: 'Pagar $ 15.750' })).toBeInTheDocument()
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  expect(screen.queryByText(/Tokenizado por la pasarela/)).toBeNull()
  expect(screen.queryByText('Mesa 6')).toBeNull()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 15.750' }))
  expect(props.onPay).toHaveBeenCalledWith('tarjeta', 'parts')
  expect(props.onPay).toHaveBeenCalledTimes(1)
})

// Falla si el método elegido no va como tarjeta con check, si «Usar otra forma de pago →» no despliega el resto, o si efectivo no
// manda al mesero.
it('E1: shows the chosen method as a checked card, unfolds the others and sends cash to the table', () => {
  const props = base('E1')
  wrap(<FamilyEPay {...props} />)
  const methods = screen.getByRole('radiogroup', { name: 'Formas de pago' })
  expect(within(methods).getAllByRole('radio')).toHaveLength(1)
  expect(within(methods).getByRole('radio', { name: /Tarjeta crédito o débito/, checked: true })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Usar otra forma de pago' }))
  expect(within(methods).getAllByRole('radio')).toHaveLength(4)
  fireEvent.click(within(methods).getByRole('radio', { name: /Efectivo/ }))
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(props.onPayAtTable).toHaveBeenCalledTimes(1)
  expect(props.onPay).not.toHaveBeenCalled()
})

// Falla si sin más de una parte se ofrece «Dividir en 1», si sin cuenta no se invita al 5 %, o si E4 pinta formulario o nota.
it('hides the split-in-N option for a single part and invites to identify for the discount', () => {
  const props = base('E4', { bill: { ...bill, partes: 1, porParte: 63000, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } } })
  wrap(<FamilyEPay {...props} />)
  expect(screen.queryByRole('radio', { name: /Dividir en/ })).toBeNull()
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  expect(screen.queryByText(/Tokenizado por la pasarela/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: /Identifícate y ahorra 5%/ }))
  expect(props.onSignup).toHaveBeenCalledTimes(1)
})

// Falla si E2 pierde «Pagar» en la voz serif con el monto 22 o la nota corta de tokenización, o si pinta el formulario que su marco no tiene.
it('E2: pays with the serif header and the short tokenized note', () => {
  wrap(<FamilyEPay {...base('E2')} />)
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pagar')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('t-title', 'text-[21px]')
  expect(screen.getByText('$ 63.000')).toHaveClass('text-[22px]')
  expect(screen.queryByRole('radiogroup', { name: 'Cómo dividir la cuenta' })).toBeNull()
  expect(screen.getByText('Tokenizado por la pasarela. Waiter no ve tu tarjeta.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pagar $ 63.000' })).toHaveClass('h-[60px]')
})

// Falla si E3 pierde la cabecera en acento con el monto 28, los métodos como filas largas sin formulario, o el CTA de 64 px.
it('E3: accent header, method rows without a card form and the 64 px CTA', () => {
  const props = base('E3')
  wrap(<FamilyEPay {...props} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-t-acento')
  expect(screen.getByText('$ 63.000')).toHaveClass('text-[28px]')
  expect(screen.getByRole('radio', { name: 'Tarjeta crédito o débito', checked: true })).toHaveClass('h-[62px]')
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  expect(screen.queryByText(/Tokenizado por la pasarela/)).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'PSE · desde tu banco' }))
  const cta = screen.getByRole('button', { name: 'Pagar $ 63.000' })
  expect(cta).toHaveClass('h-[64px]')
  fireEvent.click(cta)
  expect(props.onPay).toHaveBeenCalledWith('pse', 'all')
})

// Falla si E5 pierde «Confirmar y pagar» con la mesa, la caja resumen con productos / descuento / total, el formulario en mono o la
// nota de factura; si vuelve a pintar píldoras de método (el spec las excluye), o si el número de tarjeta sale del componente.
it('E5: confirm header, summary box, mono card form and invoice note', () => {
  const props = base('E5')
  wrap(<FamilyEPay {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confirmar y pagar')
  expect(screen.getByText('Mesa 6')).toBeInTheDocument()
  expect(screen.getByText('Productos').nextSibling).toHaveTextContent('66.000')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('−3.000')
  expect(screen.getByText('Total').nextSibling).toHaveTextContent('63.000')
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  expect(number).toHaveClass('font-t-mono')
  fireEvent.change(number, { target: { value: '4111111111111111xx' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  expect(screen.getByText('Enviaremos la factura electrónica a tu correo al confirmar el pago.')).toBeInTheDocument()
  expect(screen.queryByText(/Tokenizado por la pasarela/)).toBeNull()
  expect(screen.queryByRole('radiogroup', { name: 'Formas de pago' })).toBeNull()
  expect(screen.queryByRole('radio')).toBeNull()
  const cta = screen.getByRole('button', { name: 'Pagar $ 63.000' })
  expect(cta).toHaveClass('h-[64px]')
  fireEvent.click(cta)
  expect(props.onPay).toHaveBeenCalledWith('tarjeta', 'all')
  expect(JSON.stringify((props.onPay as jest.Mock).mock.calls)).not.toContain('4111')
})

// Falla si «Autorizando» deja un spinner solo, «Pagado» pierde la cabecera verde / el ahorro / la demo, o «Rechazada» no ofrece las tres salidas.
it('renders the authorizing, paid and declined states with the demo badge', () => {
  const r1 = wrap(<FamilyEPay {...base('E1', { state: 'authorizing' })} />)
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toBeInTheDocument()
  expect(screen.getByText('Cervecería Norte S.A.S.')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  r1.unmount()
  const paid = base('E1', { state: 'paid', result: { estado: 'aprobado', referencia: 'DEMO-6', demo: true, metodo: 'tarjeta', monto: 63000 }, account: { id: 'a', nombre: 'Camila', correo: 'c@c.co', verificada: true } })
  const r2 = wrap(<FamilyEPay {...paid} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 3.000')
  expect(screen.getByText(/DEMO-6/)).toBeInTheDocument()
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(paid.goMenu).toHaveBeenCalledTimes(1)
  r2.unmount()
  const declined = base('E1', { state: 'declined' })
  wrap(<FamilyEPay {...declined} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tu banco no autorizó el pago')
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  fireEvent.click(screen.getByRole('button', { name: /Pagar con PSE o Nequi/ }))
  expect(declined.onRetry).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre en la mesa/ }))
  expect(declined.onPayAtTable).toHaveBeenCalledTimes(1)
})

// Falla si con nada que pagar se ofrece cobrar cero.
it('says there is nothing to pay when the total is zero', () => {
  const props = base('E3', { bill: { ...bill, total: 0 } })
  wrap(<FamilyEPay {...props} />)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(props.goMenu).toHaveBeenCalledTimes(1)
})
