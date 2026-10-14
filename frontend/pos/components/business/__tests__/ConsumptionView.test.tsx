import { render, screen } from '@testing-library/react'

import { ConsumptionView } from '@/components/business/ConsumptionView'
import { consumption } from '@/lib/services/core/business'

jest.mock('@/lib/services/core/business', () => ({ consumption: jest.fn(), listRecharges: jest.fn(async () => []), requestRecharge: jest.fn() }))

// Falla si el dueño no ve cuántos locales se le cobran y a qué precio, lo que se cobra por uso, el total estimado o el
// consumo medido por local.
it('muestra la cuenta estimada y el uso del mes', async () => {
  const period = new Date().toISOString().slice(0, 7)
  jest.mocked(consumption).mockResolvedValue({ period, currency: 'COP', locals_active: 2, price_per_local: 150000, estimated_total: 312000,
    lines: [{ concept: 'Mensualidad por local', module: 'nucleo', unit: 'local', quantity: 2, unit_price: 150000, total: 300000 },
      { concept: 'Asistente en el menú', module: 'asistente_menu', unit: 'mensaje_ia', quantity: 120, unit_price: 100, total: 12000 }],
    usage: [{ module: 'asistente_menu', module_name: 'Asistente en el menú', unit: 'mensaje_ia', unit_name: 'Mensajes', quantity: 120, restaurant_id: 7, restaurant_name: 'Poblado' }] })
  render(<ConsumptionView />)
  const bill = await screen.findByRole('table', { name: 'Cuenta estimada' })
  expect(bill.textContent?.replace(/\s/g, ' ')).toContain('Mensualidad por local2$ 150.000$ 300.000')
  expect(screen.getByText(/2 locales activos a/)).toBeInTheDocument()
  expect(screen.getByText('Total estimado').parentElement?.textContent?.replace(/\s/g, ' ')).toContain('$ 312.000')
  expect(screen.getByRole('table', { name: 'Uso del mes' })).toHaveTextContent('Asistente en el menúMensajesPoblado120')
})

// Falla si el dueño no ve lo incluido, lo usado, su saldo de recargas y el excedente, si no puede pedir una recarga con
// un paquete, o si se le promete el saldo antes de que ProjectApp registre el pago.
it('incluido, recargas y pedir una recarga', async () => {
  const { NextIntlClientProvider } = jest.requireActual('next-intl') as typeof import('next-intl')
  const { messages } = jest.requireActual('@/lib/i18n/messages') as typeof import('@/lib/i18n/messages')
  const { fireEvent, waitFor, within } = jest.requireActual('@testing-library/react') as typeof import('@testing-library/react')
  const business = jest.requireMock('@/lib/services/core/business') as { requestRecharge: jest.Mock; listRecharges: jest.Mock }
  const period = new Date().toISOString().slice(0, 7)
  jest.mocked(consumption).mockResolvedValue({ period, currency: 'COP', locals_active: 1, price_per_local: 150000, estimated_total: 200000, account_credit: 12000, usage: [],
    lines: [{ concept: 'Mensualidad por local', module: 'nucleo', unit: 'local', quantity: 1, unit_price: 150000, total: 150000 }, { concept: 'Ajuste por prorrateo · Laureles (12 de 31 días)', module: 'nucleo', unit: 'local', quantity: 1, unit_price: 0, total: -8000 }],
    quotas: [{ module: 'asistente_whatsapp', module_name: 'Asistente de WhatsApp', unit: 'pedido_asistente', unit_name: 'Pedidos', included: 100, used: 130, credits: 20, overage: 10, on_exhausted: 'cobrar' }],
    recharge_packs: [{ key: 'pedidos_100', name: '100 pedidos', module: 'asistente_whatsapp', unit: 'pedido_asistente', quantity: 100, price: 50000 }] })
  business.requestRecharge.mockResolvedValue({ charge: { id: 9, amount: 50000, state: 'pending' } })
  business.listRecharges.mockResolvedValueOnce([]).mockResolvedValue([{ id: 9, pack: 'pedidos_100', name: '100 pedidos', quantity: 100, price: 50000, state: 'pending', created_at: '', paid_at: null }])
  render(<NextIntlClientProvider locale="es" messages={messages}><ConsumptionView /></NextIntlClientProvider>)
  expect(await screen.findByRole('table', { name: 'Incluido y recargas' })).toHaveTextContent('Asistente de WhatsApp · Pedidos1001302010')
  expect(screen.getByRole('table', { name: 'Cuenta estimada' }).textContent?.replace(/\s/g, ' ')).toContain('− $ 8.000')
  expect(screen.getByText(/de saldo a favor/).textContent?.replace(/\s/g, ' ')).toContain('$ 12.000')
  fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Recargar' })).getByRole('button', { name: /100 pedidos/ }))
  await waitFor(() => expect(business.requestRecharge).toHaveBeenCalledWith('pedidos_100'))
  expect(await screen.findByRole('status')).toHaveTextContent('El saldo se suma cuando ProjectApp registre el pago')
  expect(await screen.findByRole('list', { name: 'Tus recargas' })).toHaveTextContent('Pendiente de pago')
})
