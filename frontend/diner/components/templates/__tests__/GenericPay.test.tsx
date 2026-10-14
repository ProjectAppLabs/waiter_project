import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { GenericPay } from '@/components/templates/generic/GenericPay'
import type { PayLayoutProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'
import type { Bill } from '@/lib/types'

const bill: Bill = { ok: false, total: 97812, mio: 97812, porComensal: [], partes: 1, porParte: 97812, descuento: { porcentaje: 5, monto: 4680, aplicable: true, aplicado: true } }
const base = (): PayLayoutProps => ({
  bill, template: DEFAULT_TEMPLATE, methods: ['tarjeta', 'pse', 'nequi', 'efectivo'], onPay: jest.fn(), state: 'idle', demo: true, goBack: jest.fn(),
  result: null, order: { id: 'p1', sesion: 's', estado: 'en_cocina', total: 97812, impuestos: 0, intentos: 1 }, merchant: 'La Provincia S.A.S.', table: 14, account: null,
  onRetry: jest.fn(), onPayAtTable: jest.fn(), onSignup: jest.fn(), goMenu: jest.fn(),
})
const wrap = (props: PayLayoutProps) => render(<NextIntlClientProvider locale="es" messages={messages}><GenericPay {...props} /></NextIntlClientProvider>)

// Falla si los métodos no son píldoras excluyentes, si el formulario de tarjeta envía el número (onPay solo recibe el método), o si el total no va en mono.
it('offers the methods as pills, keeps the card number local and pays with the method only', () => {
  const props = base()
  wrap(props)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pagar')
  expect(screen.getAllByRole('radio')).toHaveLength(4)
  expect(screen.getByRole('radio', { name: 'Tarjeta', checked: true })).toBeInTheDocument()
  const number = screen.getByPlaceholderText('4242 4242 4242 4242')
  fireEvent.change(number, { target: { value: '4111111111111111xx' } })
  expect(number).toHaveValue('4111 1111 1111 1111')
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 97.812' }))
  expect(props.onPay).toHaveBeenCalledWith('tarjeta')
  expect(props.onPay).toHaveBeenCalledTimes(1)
  expect(JSON.stringify((props.onPay as jest.Mock).mock.calls)).not.toContain('4111')
  fireEvent.click(screen.getByRole('radio', { name: 'PSE' }))
  expect(screen.queryByPlaceholderText('4242 4242 4242 4242')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Pagar $ 97.812' }))
  expect(props.onPay).toHaveBeenLastCalledWith('pse')
})

// Falla si efectivo intenta cobrar por el celular en vez de mandar al mesero, o si sin cuenta no se ofrece el 5 %.
it('sends cash to the table and invites to identify for the discount', () => {
  const props = base()
  props.bill = { ...bill, descuento: { porcentaje: 5, monto: 0, aplicable: false, aplicado: false, registrado: false } }
  wrap(props)
  fireEvent.click(screen.getByRole('button', { name: /Identifícate y ahorra 5%/ }))
  expect(props.onSignup).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('radio', { name: 'Efectivo' }))
  fireEvent.click(screen.getByRole('button', { name: 'Que el mesero cobre en la mesa' }))
  expect(props.onPayAtTable).toHaveBeenCalledTimes(1)
  expect(props.onPay).not.toHaveBeenCalled()
})

// Falla si «Autorizando» deja un spinner solo: debe decir qué pasa, mostrar comercio y monto, y la insignia de demo.
it('never leaves the authorizing spinner alone', () => {
  wrap({ ...base(), state: 'authorizing' })
  expect(screen.getByRole('status', { name: 'Autorizando con tu banco' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Autorizando con tu banco')
  expect(screen.getByText('La Provincia S.A.S.')).toBeInTheDocument()
  expect(screen.getByText('$ 97.812')).toHaveClass('font-t-mono')
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar/ })).toBeNull()
})

// Falla si «Pagado» pierde la cabecera verde, el ahorro, la insignia de demo o el estado del pedido; o si no ofrece volver a la carta.
it('confirms the payment with the green header, the saving, the demo badge and the order state', () => {
  const props = { ...base(), state: 'paid' as const, result: { estado: 'aprobado' as const, referencia: 'DEMO-127', demo: true, metodo: 'tarjeta' as const, monto: 97812 }, account: { id: 'a1', nombre: 'Camila', correo: 'c@c.co', verificada: true } }
  wrap(props)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Listo, quedó pagado')
  expect(screen.getByRole('banner')).toHaveClass('bg-free')
  expect(screen.getByText('Ahorraste').nextSibling).toHaveTextContent('$ 4.680')
  expect(screen.getByText(/DEMO-127/)).toBeInTheDocument()
  expect(screen.getByText('Demo · sin cobro real')).toBeInTheDocument()
  expect(screen.getByText('En cocina')).toBeInTheDocument()
  expect(screen.getByText(/la próxima vez pagas en dos toques/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la carta' }))
  expect(props.goMenu).toHaveBeenCalledTimes(1)
})

// Falla si «Rechazada» no dice que no hubo cobro y que el pedido sigue, o si las tres salidas no llevan a donde dicen.
it('explains a declined payment and offers the three ways out', () => {
  const props = { ...base(), state: 'declined' as const }
  wrap(props)
  expect(screen.getByRole('alert')).toHaveTextContent('Tu banco no autorizó el pago')
  expect(screen.getByRole('alert')).toHaveTextContent('No se hizo ningún cobro. Tu pedido sigue guardado.')
  fireEvent.click(screen.getByRole('button', { name: /Intentar con otra tarjeta/ }))
  fireEvent.click(screen.getByRole('button', { name: /Pagar con PSE o Nequi/ }))
  expect(props.onRetry).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: /Que el mesero cobre en la mesa/ }))
  expect(props.onPayAtTable).toHaveBeenCalledTimes(1)
})

// Falla si con nada confirmado ni en el carrito se ofrece pagar cero.
it('says there is nothing to pay yet when the total is zero', () => {
  const props = { ...base(), bill: { ...bill, total: 0 } }
  wrap(props)
  expect(screen.getByText('Todavía no hay nada que pagar.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Pagar \$/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Ver la carta' }))
  expect(props.goMenu).toHaveBeenCalledTimes(1)
})
