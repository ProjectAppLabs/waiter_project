import { fireEvent, screen } from '@testing-library/react'

import { FamilyFPay } from '@/components/templates/families/F/FamilyFPay'
import { cartOf, entryOf, line, templateOf, wrap } from '@/components/templates/families/F/__tests__/fixtures'
import type { PayLayoutProps } from '@/components/templates/types'
import type { Bill } from '@/lib/types'

const mockStore = { entry: entryOf(), cart: cartOf([line({}), line({ id: 2, comensal: 'x', mio: false, producto_id: 4, nombre: 'Sopa miso', precio: 9000, cantidad: 1, subtotal: 9000 })]) }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector?: (s: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore) }))

const bill: Bill = { ok: true, total: 61750, mio: 52750, porComensal: [], partes: 2, porParte: 30875, descuento: { porcentaje: 5, monto: 3250, aplicable: true, aplicado: true } }
const base = (codigo: string, over: Partial<PayLayoutProps> = {}): PayLayoutProps => ({
  bill, template: templateOf(codigo), methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 61750, impuestos: 0, intentos: 1 }, merchant: 'Kaiseki S.A.S.', table: 14, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(), ...over,
})

// Falla si la base pierde «Confirmar y pagar» con «N piezas · Mesa X», la caja Productos / Descuento / Total, la nota de factura, los métodos o el CTA en el acento con el número de tarjeta fuera de onPay.
it('F1: confirm header with pieces and table, summary box, invoice note and the accent CTA', () => {
  const props = base('F1')
  wrap(<FamilyFPay {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Confirmar y pagar')
  expect(screen.getByText('16 piezas · Mesa 14')).toBeInTheDocument()
  expect(screen.getByText('Productos').nextSibling).toHaveTextContent('65.000')
  expect(screen.getByText('Descuento 5%').nextSibling).toHaveTextContent('−3.250')
  expect(screen.getByText('Total').nextSibling).toHaveTextContent('$ 61.750')
  expect(screen.getByText(/Enviaremos la factura electrónica/)).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  fireEvent.change(number, { target: { value: '4111111111111111' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  const pay = screen.getByRole('button', { name: 'Pagar $ 61.750' })
  expect(pay).toHaveClass('bg-t-acento')
  fireEvent.click(pay)
  expect(props.onPay).toHaveBeenCalledWith('tarjeta', 'all')
  expect(JSON.stringify((props.onPay as jest.Mock).mock.calls)).not.toContain('4111')
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(props.onPayAtTable).toHaveBeenCalledTimes(1)
})

// Falla si F3 pierde «Total a pagar» en versalitas con el monto en mono 38, la nota de tokenización o el CTA de contorno dorado.
it('F3: dark total header, tokenized note and outline CTA', () => {
  wrap(<FamilyFPay {...base('F3')} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Total a pagar')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('uppercase')
  expect(screen.getByText('$ 61.750', { selector: 'p' })).toHaveClass('font-t-mono', 'text-[38px]')
  expect(screen.getByText('Tokenizado por la pasarela. Waiter no ve tu tarjeta.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Pagar $ 61.750' })).toHaveClass('border-t-acento', 'text-t-acento')
  expect(screen.queryByText('Confirmar y pagar')).toBeNull()
})

// Falla si F4 no abre con las píldoras de método (la activa en el acento), el interruptor de guardar y la nota sobre gris cálido.
it('F4: method pills first, save switch and the tokenized note', () => {
  const props = base('F4')
  wrap(<FamilyFPay {...props} />)
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toHaveClass('bg-t-acento')
  expect(screen.getByRole('switch', { name: 'Guardar para la próxima visita' })).toHaveAttribute('aria-checked', 'true')
  expect(screen.getByText('Tokenizado por la pasarela. Waiter no ve tu tarjeta.').parentElement).toHaveClass('bg-muted')
  fireEvent.click(screen.getByRole('radio', { name: 'PSE' }))
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 61.750' }))
  expect(props.onPay).toHaveBeenLastCalledWith('pse', 'all')
})

// Falla si F5 no ofrece Pagar lo mío / Dividir en N / Pagar todo con sus montos, si la elegida no cambia el CTA, o si se ofrece dividir con un solo comensal.
it('F5: split options drive the amount of the CTA', () => {
  const props = base('F5')
  const { unmount } = wrap(<FamilyFPay {...props} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Cómo dividen?')
  expect(screen.getByRole('radio', { name: 'Pagar todo 61.750', checked: true })).toHaveClass('border-t-acento')
  fireEvent.click(screen.getByRole('radio', { name: 'Dividir en 2 30.875' }))
  expect(screen.getByRole('button', { name: 'Pagar $ 30.875' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('radio', { name: 'Pagar lo mío 52.750' }))
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 52.750' }))
  expect(props.onPay).toHaveBeenCalledWith('tarjeta', 'mine')
  unmount()
  wrap(<FamilyFPay {...base('F5', { bill: { ...bill, mio: bill.total, partes: 1, porParte: bill.total } })} />)
  expect(screen.getAllByRole('radio', { name: /Pagar|Dividir/ })).toHaveLength(1)
})

// Falla si «Autorizando» deja el spinner solo, si «Pagado» pierde la cabecera verde, el ahorro y la demo, o si «Rechazada» no ofrece las tres salidas.
it('renders the authorizing, paid and declined states with the demo badge', () => {
  const r1 = wrap(<FamilyFPay {...base('F2', { state: 'authorizing' })} />)
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toBeInTheDocument()
  expect(screen.getByText('Kaiseki S.A.S.')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  r1.unmount()
  const paid = base('F2', { state: 'paid', result: { estado: 'aprobado', referencia: 'DEMO-1', demo: true, metodo: 'tarjeta', monto: 61750 }, account: { id: 'a', nombre: 'Camila', correo: 'c@c.co', verificada: true } })
  const r2 = wrap(<FamilyFPay {...paid} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 3.250')
  expect(screen.getByText(/DEMO-1/)).toBeInTheDocument()
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(paid.goMenu).toHaveBeenCalledTimes(1)
  r2.unmount()
  const declined = base('F2', { state: 'declined' })
  wrap(<FamilyFPay {...declined} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tu banco no autorizó el pago')
  // Estado rechazado con los semánticos de Waiter (busy), sin hex en duro.
  expect(screen.getByRole('alert')).toHaveClass('bg-busy-soft', 'border-busy/30')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-busy-ink')
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  expect(declined.onRetry).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre en la mesa/ }))
  expect(declined.onPayAtTable).toHaveBeenCalledTimes(1)
})

// Falla si con total cero se ofrece pagar, o si sin cuenta no se invita al 5 %.
it('says there is nothing to pay at zero and hooks the signup when the discount is available', () => {
  const zero = base('F1', { bill: { ...bill, total: 0 } })
  const r = wrap(<FamilyFPay {...zero} />)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
  r.unmount()
  const props = base('F1', { bill: { ...bill, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } } })
  wrap(<FamilyFPay {...props} />)
  fireEvent.click(screen.getByRole('button', { name: /Identifícate y ahorra 5%/ }))
  expect(props.onSignup).toHaveBeenCalledTimes(1)
})
