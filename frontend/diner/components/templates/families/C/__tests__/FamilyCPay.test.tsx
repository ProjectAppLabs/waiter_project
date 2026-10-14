import { fireEvent, screen } from '@testing-library/react'

import { FamilyCPay } from '@/components/templates/families/C/FamilyCPay'
import { templateC, wrap } from '@/components/templates/families/C/__tests__/fixtures'
import type { PayLayoutProps } from '@/components/templates/types'
import type { Bill } from '@/lib/types'

const bill: Bill = { ok: false, total: 91865, mio: 91865, porComensal: [], partes: 1, porParte: 91865, descuento: { porcentaje: 5, monto: 4835, aplicable: true, aplicado: true } }
const props = (codigo: string, over: Partial<PayLayoutProps> = {}): PayLayoutProps => ({
  bill, template: templateC(codigo), methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 91865, impuestos: 0, intentos: 1 }, merchant: 'El Fogón S.A.S.', table: 9, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(), ...over,
})

// Falla si la base de la familia pierde la banda de total en mono, las filas de método excluyentes con sus textos largos, el formulario
// maquetado (el número no sale del componente), la insignia de demo o el CTA «Pagar $ …».
it('base skin: total band, method rows, local card form, demo badge and the money CTA', () => {
  const p = props('C1')
  wrap(<FamilyCPay {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Total')
  expect(screen.getByText('$ 91.865')).toHaveClass('font-t-mono')
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  expect(screen.getByRole('radio', { name: /Tarjeta crédito o débito/, checked: true })).toBeInTheDocument()
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  fireEvent.change(number, { target: { value: '4111111111111111xx' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  expect(screen.getByText('Tokenizado por la pasarela. Waiter no ve tu tarjeta.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 91.865' }))
  expect(p.onPay).toHaveBeenCalledWith('tarjeta')
  expect(JSON.stringify((p.onPay as jest.Mock).mock.calls)).not.toContain('4111')
  fireEvent.click(screen.getByRole('radio', { name: 'PSE · desde tu banco' }))
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 91.865' }))
  expect(p.onPay).toHaveBeenLastCalledWith('pse')
})

// Falla si C3 no cambia a chips de método con el formulario debajo, si vuelve a pintar una cabecera «Pagar · total» que el marco no
// tiene (el total solo va en el CTA; el título queda para el lector de pantalla), si efectivo no manda al mesero, o si sin cuenta no
// invita al 5 %.
it('C3 skin: method chips over the card form, no visible header, cash goes to the table and the signup hook shows without account', () => {
  const p = props('C3', { bill: { ...bill, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } } })
  wrap(<FamilyCPay {...p} />)
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toHaveClass('rounded-t-chip')
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only')
  expect(screen.getAllByText(/91\.865/)).toHaveLength(2)
  expect(screen.getByRole('button', { name: 'Pagar $ 91.865' })).toHaveClass('h-16', 'rounded-[8px]')
  expect(screen.getByRole('switch', { name: 'Guardar para la próxima visita' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(screen.getByRole('button', { name: /Identifícate y ahorra 5%/ }))
  expect(p.onSignup).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(p.onPayAtTable).toHaveBeenCalledTimes(1)
  expect(p.onPay).not.toHaveBeenCalled()
})

// Falla si «Autorizando» deja el spinner solo, si «Pagado» pierde la cabecera verde, el ahorro o el estado del pedido, o si «Rechazada»
// no ofrece las tres salidas.
it('paints the three outcome states in the family skin', () => {
  wrap(<FamilyCPay {...props('C4', { state: 'authorizing' })} />)
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toBeInTheDocument()
  expect(screen.getByText('El Fogón S.A.S.')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()

  const paid = props('C5', { state: 'paid', result: { estado: 'aprobado', referencia: 'DEMO-9', demo: true, metodo: 'tarjeta', monto: 91865 } })
  wrap(<FamilyCPay {...paid} />)
  expect(screen.getByRole('heading', { name: 'Listo, quedó pagado' }).parentElement).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 4.835')
  expect(screen.getByText(/DEMO-9/)).toBeInTheDocument()
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(paid.goMenu).toHaveBeenCalledTimes(1)

  const declined = props('C2', { state: 'declined' })
  wrap(<FamilyCPay {...declined} />)
  expect(screen.getByRole('alert')).toHaveTextContent('No se hizo ningún cobro. Tu pedido sigue guardado.')
  expect(screen.getByRole('alert')).toHaveClass('bg-busy-soft', 'border-busy/25')
  expect(screen.getByRole('heading', { level: 1, name: 'Tu banco no autorizó el pago' })).toHaveClass('text-busy-ink')
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre en la mesa/ }))
  expect(declined.onRetry).toHaveBeenCalledTimes(1)
  expect(declined.onPayAtTable).toHaveBeenCalledTimes(1)
})

// Falla si con nada que pagar se ofrece pagar cero.
it('says there is nothing to pay when the total is zero', () => {
  const p = props('C1', { bill: { ...bill, total: 0 } })
  wrap(<FamilyCPay {...p} />)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(p.goMenu).toHaveBeenCalledTimes(1)
})
