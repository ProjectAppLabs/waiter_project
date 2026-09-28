import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { OrderWizard } from '@/components/orders/OrderWizard'
import { DEFAULT_ROLE_POLICY } from '@/lib/domain/permissions'
import { callKw } from '@/lib/services/odoo'
import { useOrderWizardStore } from '@/lib/stores/orderWizardStore'
import ordersMessages from '@/lib/i18n/messages/modules/orders.json'

const messages = { orders: ordersMessages }

const mockPush = jest.fn()
const mockCreate = jest.fn()
const mockFire = jest.fn()
const mockAuth = { user: { role: 'admin' }, employee: { role: 'waiter', token: 'test' }, session: { id: 1 } }
const mockCatalog = { tables: [{ id: 8, number: 8, floorId: 2 }], floors: [{ id: 2, name: 'Terraza' }], products: [], settings: { configId: 1, rolePermissions: DEFAULT_ROLE_POLICY } }
const mockOrders = { openOrders: [], refreshOpenOrders: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: Object.assign((select: (state: typeof mockAuth) => unknown) => select(mockAuth), { getState: () => mockAuth }) }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (state: { catalog: typeof mockCatalog }) => unknown) => select({ catalog: mockCatalog }) }))
jest.mock('@/lib/stores/orderStore', () => ({ useOrderStore: () => mockOrders }))
jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))
jest.mock('@/lib/hooks/useOrderLocations', () => ({ useOrderLocations: () => new Map([[8, { floor: 'Terraza', zone: 'Ventanal', zoneStatus: 'ready' }]]) }))
jest.mock('@/components/orders/SummaryStep', () => ({ SummaryStep: ({ onConfirm }: { onConfirm: () => void }) => <button onClick={onConfirm}>Confirmar prueba</button> }))
jest.mock('@/components/orders/MenuStep', () => ({ MenuStep: () => null }))
jest.mock('@/components/orders/TableStep', () => ({ TableStep: () => null }))
jest.mock('@/components/payment/PaymentModal', () => ({ PaymentModal: () => <div role="dialog" aria-label="Cobrar pedido" /> }))

beforeEach(() => {
  jest.clearAllMocks()
  mockAuth.employee.role = 'waiter'
  useOrderWizardStore.getState().reset()
  useOrderWizardStore.setState({ createOrder: mockCreate, fireKitchen: mockFire, loadExtras: jest.fn() })
  mockCreate.mockResolvedValue({ id: 40, trackingNumber: '40' })
  mockFire.mockResolvedValue(true)
  ;(callKw as jest.Mock).mockResolvedValue({ require_payment_roles: [] })
})

it.each(['/salon', '/pedidos'] as const)('returns to %s after confirming and sending to kitchen', async (returnTo) => {
  render(<NextIntlClientProvider locale="es" messages={messages}><OrderWizard presetTableId={8} returnTo={returnTo} /></NextIntlClientProvider>)
  act(() => useOrderWizardStore.setState({ stepIndex: 3 }))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar prueba' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith(returnTo))
  expect(mockCreate).toHaveBeenCalledTimes(1)
  expect(mockFire).toHaveBeenCalledWith(40)
})

it('leaves an unpaid takeaway for the cashier and returns the waiter to Mesas', async () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><OrderWizard presetTableId={null} returnTo="/salon" /></NextIntlClientProvider>)
  act(() => {
    useOrderWizardStore.getState().setInfo({ type: 'takeAway' })
    useOrderWizardStore.setState({ stepIndex: 2 })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar prueba' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/salon'))
  expect(mockFire).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: 'Cobrar pedido' })).not.toBeInTheDocument()
})


it('requires an explicit takeaway or delivery choice and never offers dine-in without a table', () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><OrderWizard presetTableId={null} withoutTable /></NextIntlClientProvider>)
  expect(screen.queryByRole('radio', { name: 'En mesa' })).not.toBeInTheDocument()
  expect(screen.getByRole('radio', { name: 'Para llevar' })).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('radio', { name: 'Domicilio' })).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('radio', { name: 'Para llevar' }))
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()
  expect(useOrderWizardStore.getState().tableId).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'Domicilio' }))
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
})

it('keeps the selected table, floor and zone visible throughout a dine-in order', () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><OrderWizard presetTableId={8} /></NextIntlClientProvider>)
  expect(screen.getByLabelText('Ubicación del pedido')).toHaveTextContent('Mesa 8')
  expect(screen.getByLabelText('Ubicación del pedido')).toHaveTextContent('Terraza')
  expect(screen.getByLabelText('Ubicación del pedido')).toHaveTextContent('Ventanal')
  expect(screen.queryByRole('radio', { name: 'Para llevar' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByLabelText('Ubicación del pedido')).toHaveTextContent('Mesa 8')
})
