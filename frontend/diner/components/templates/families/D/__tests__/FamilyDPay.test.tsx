import { fireEvent, screen } from '@testing-library/react'

import { FamilyDPay } from '@/components/templates/families/D/FamilyDPay'
import { bill, payProps, templateOf, wrap } from '@/components/templates/families/D/__tests__/fixtures'

// Falla si la piel de familia (D3/D5) pierde los chips de método en acento, el interruptor «Guardar», la insignia de demo, o si el
// número de la tarjeta sale del componente (onPay solo recibe el método).
it('pays with the family skin: method chips, save switch, and only the method leaves the component', () => {
  const p = payProps()
  wrap(<FamilyDPay {...p} />)
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toHaveClass('bg-t-acento')
  expect(screen.getByRole('switch', { name: 'Guardar para la próxima visita' })).toHaveAttribute('aria-checked', 'true')
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  fireEvent.change(number, { target: { value: '4111111111111111' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  expect(screen.getByText('Mesa 14')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 15.675' }))
  expect(p.onPay).toHaveBeenCalledWith('tarjeta')
  expect(JSON.stringify((p.onPay as jest.Mock).mock.calls)).not.toContain('4111')
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(p.onPayAtTable).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Volver al pedido' }))
  expect(p.goBack).toHaveBeenCalledTimes(1)
})

// Falla si la pizarra (D1) pierde «Total a pagar» con el monto a 38 px en mono, el aviso corto de tokenización o el botón crema en serif.
it('renders the D1 slate skin with the centred total and the serif cream button', () => {
  const p = payProps({ template: templateOf('D1') })
  wrap(<FamilyDPay {...p} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Total a pagar')
  expect(screen.getByText('$ 15.675')).toHaveClass('font-t-mono', 'text-[38px]')
  expect(screen.getByText('Tokenizado por la pasarela. Waiter no ve tu tarjeta.')).toBeInTheDocument()
  expect(screen.queryByRole('switch')).toBeNull()
  const pay = screen.getByRole('button', { name: 'Pagar $ 15.675' })
  expect(pay).toHaveClass('font-t-display', 'h-[64px]', 'rounded-[8px]')
  fireEvent.click(pay)
  expect(p.onPay).toHaveBeenCalledWith('tarjeta')
})

// Falla si D2/D4 pierden la cabecera «Pagar» + monto mono 22 con los métodos como segmentos (tinta en D2, acento en D4).
it('renders the D2/D4 skin with the header amount and equal segments in ink or accent', () => {
  const d2 = wrap(<FamilyDPay {...payProps({ template: templateOf('D2') })} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pagar')
  expect(screen.getByText('$ 15.675')).toHaveClass('text-[22px]')
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toHaveClass('flex-1', 'bg-t-tinta')
  expect(screen.getByRole('button', { name: 'Pagar $ 15.675' })).toHaveClass('bg-t-tinta')
  d2.unmount()
  wrap(<FamilyDPay {...payProps({ template: templateOf('D4') })} />)
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toHaveClass('bg-t-acento')
  fireEvent.click(screen.getByRole('radio', { name: 'PSE' }))
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  expect(screen.getByText(/portal de tu banco/)).toBeInTheDocument()
})

// Falla si «Autorizando» deja el spinner solo, si «Pagado» pierde la cabecera verde / ahorro / insignia / estado del pedido, o si
// «Rechazada» no ofrece las tres salidas; y si sin cuenta no se invita al 5 %.
it('covers authorizing, paid, declined and the signup hook', () => {
  const auth = wrap(<FamilyDPay {...payProps({ state: 'authorizing' })} />)
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toBeInTheDocument()
  expect(screen.getByText('Tinto y Nube S.A.S.')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  auth.unmount()
  const paid = payProps({ state: 'paid', template: templateOf('D1'), result: { estado: 'aprobado', referencia: 'DEMO-1', demo: true, metodo: 'tarjeta', monto: 15675 } })
  const paidView = wrap(<FamilyDPay {...paid} />)
  expect(screen.getByRole('banner')).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 825')
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(paid.goMenu).toHaveBeenCalledTimes(1)
  paidView.unmount()
  const declined = payProps({ state: 'declined' })
  const declinedView = wrap(<FamilyDPay {...declined} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Tu banco no autorizó el pago')
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre/ }))
  expect(declined.onRetry).toHaveBeenCalledTimes(1)
  expect(declined.onPayAtTable).toHaveBeenCalledTimes(1)
  declinedView.unmount()
  const hook = payProps({ bill: { ...bill, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } } })
  wrap(<FamilyDPay {...hook} />)
  fireEvent.click(screen.getByRole('button', { name: /Identifícate y ahorra 5%/ }))
  expect(hook.onSignup).toHaveBeenCalledTimes(1)
})

// Falla si con total cero se ofrece pagar.
it('says there is nothing to pay when the total is zero', () => {
  const p = payProps({ bill: { ...bill, total: 0 } })
  wrap(<FamilyDPay {...p} />)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
})
