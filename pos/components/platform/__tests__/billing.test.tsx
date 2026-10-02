import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { messages } from '@/lib/i18n/messages'

import { ChargesView } from '@/components/platform/ChargesView'
import { MetricsView } from '@/components/platform/MetricsView'
import { billingRules, listCharges, payCharge, platformMetrics, type Charge } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

const render = (ui: React.ReactElement) => rtlRender(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/plataforma' }))
jest.mock('@/lib/services/core/platform', () => ({
  ...jest.requireActual('@/lib/services/core/platform'),
  platformMetrics: jest.fn(), listCharges: jest.fn(), payCharge: jest.fn().mockResolvedValue({}), voidCharge: jest.fn(), billingRules: jest.fn(), saveBillingRules: jest.fn(),
}))
const charge = (over: Partial<Charge> = {}): Charge => ({ id: 1, organization: { slug: 'frisby', name: 'Frisby' }, period: '2026-09', amount: 299000, due_date: '2026-09-15', state: 'overdue',
  paid_at: null, method: null, reference: '', notes: '', created_at: '2026-09-01T06:00:00Z', ...over })
beforeEach(() => {
  jest.clearAllMocks()
  usePlatformStore.setState({ user: { id: 'u1', name: 'Ana', username: 'ana', email: 'ana@projectapp.co', role: 'admin' }, hydrated: true })
  jest.mocked(billingRules).mockResolvedValue({ billing_day: 5, grace_days: 10, suspend_after_days: 15, reminder_days: 3 })
})

// Falla si las métricas no muestran el ingreso mensual de ProjectApp ni, por cliente, sus ventas y lo que debe (contrato M).
it('muestra el MRR y las ventas y la mora de cada cliente', async () => {
  jest.mocked(platformMetrics).mockResolvedValue({ totals: { organizations: 2, active: 1, trial: 1, suspended: 0, mrr: 898000, sales: 1500000, orders: 40, restaurants: 3 },
    organizations: [{ slug: 'frisby', name: 'Frisby', status: 'active', plan: 'pro', monthly_price: 599000, restaurants: 2, restaurants_limit: 2, accounts_active: 5, sales: 1500000, orders: 40, ticket: 37500, last_order_at: '2026-10-01T20:00:00Z', last_login_at: null, overdue_amount: 299000 }] })
  render(<MetricsView />)
  expect(await screen.findByText('$ 898.000')).toBeInTheDocument()
  const row = screen.getByRole('row', { name: /Frisby/ })
  expect(row).toHaveTextContent('$ 1.500.000'); expect(row).toHaveTextContent('$ 299.000'); expect(row).toHaveTextContent('2 / 2')
})

// Falla si una cuenta vencida no se puede pagar desde la lista o si el pago no viaja con su medio y su referencia.
it('registra el pago de una cuenta vencida con medio y referencia', async () => {
  jest.mocked(listCharges).mockResolvedValue({ charges: [charge(), charge({ id: 2, period: '2026-08', due_date: '2026-08-15', state: 'paid', paid_at: '2026-08-10T15:00:00Z', method: 'nequi', reference: 'N-1' })], summary: { pending: 0, overdue: 299000, paid_this_month: 0 } })
  render(<ChargesView />)
  const row = await screen.findByRole('row', { name: /2026-09/ })
  expect(row).toHaveTextContent('Vencida')
  expect(within(screen.getByRole('row', { name: /2026-08/ })).queryByRole('button', { name: 'Registrar pago' })).toBeNull()
  fireEvent.click(within(row).getByRole('button', { name: 'Registrar pago' }))
  const dialog = await screen.findByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Medio de pago'), { target: { value: 'nequi' } })
  fireEvent.change(within(dialog).getByLabelText('Referencia'), { target: { value: 'N-778' } })
  fireEvent.click(screen.getByRole('button', { name: /Registrar .*299\.000/ }))
  await waitFor(() => expect(payCharge).toHaveBeenCalledWith(1, { method: 'nequi', reference: 'N-778', notes: '' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Pago de Frisby (2026-09) registrado.')
})

// Falla si un operador ve las reglas de cobro o puede anular cuentas: eso es solo de quien administra.
it('el operador no ve las reglas ni anula', async () => {
  usePlatformStore.setState({ user: { id: 'u2', name: 'Op', username: 'op', email: 'op@projectapp.co', role: 'operator' }, hydrated: true })
  jest.mocked(listCharges).mockResolvedValue({ charges: [charge()], summary: { pending: 0, overdue: 299000, paid_this_month: 0 } })
  render(<ChargesView />)
  await screen.findByRole('row', { name: /2026-09/ })
  expect(screen.queryByRole('region', { name: 'Reglas de cobro' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Más acciones del cobro/ })).toBeNull()
})
