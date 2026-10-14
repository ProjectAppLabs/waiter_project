import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CustomerPanel } from '@/components/customers/CustomerPanel'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const customer = { id: 7, name: 'Eva Martínez', phone: '300 111 2222', email: 'eva@mail.com', vat: '1020', idTypeId: 3, street: '', city: 'Medellín', orders: 4, invoiced: 251000 }
const loyalty = { id: 1, points: 12400, pointsDisplay: '12.400 puntos', code: '011852950', program: 'Puntos Waiter', expires: null }

// Falla si el panel pierde los puntos y el código del socio, el historial o el total facturado del cliente.
it('shows the customer data, the loyalty points and the order history', () => {
  wrap(<CustomerPanel customer={customer} loyalty={loyalty} history={[{ id: 12, reference: 'P12', date: '2026-09-05 20:00:00', total: 87822, state: 'paid' }]} onEdit={jest.fn()} />)
  expect(screen.getByText('EM')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Puntos de fidelización' })).toHaveTextContent('12.400 puntos')
  expect(screen.getByText('011852950')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Historial de pedidos' })).toHaveTextContent('#12')
  expect(screen.getByText('$ 251.000')).toBeInTheDocument()
})

// Falla si un cliente sin tarjeta deja el bloque de puntos vacío en vez de decirlo.
it('says when the customer has no loyalty card and offers the empty state without customer', () => {
  const { rerender } = wrap(<CustomerPanel customer={customer} loyalty={null} history={[]} onEdit={jest.fn()} />)
  expect(screen.getByText('Sin tarjeta de fidelización')).toBeInTheDocument()
  rerender(<NextIntlClientProvider locale="es" messages={messages}><CustomerPanel customer={null} loyalty={undefined} history={[]} onEdit={jest.fn()} /></NextIntlClientProvider>)
  expect(screen.getByText('Elige un cliente')).toBeInTheDocument()
})
