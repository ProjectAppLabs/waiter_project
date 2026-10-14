import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { EmergencyLock, OfflineBar } from '@/components/offline/OfflineBar'
import { messages } from '@/lib/i18n/messages'
import { clearEmergency } from '@/lib/offline/emergency'
import { useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore, type OutboxEntry } from '@/lib/offline/outbox'
import { endCacheSession, startCacheSession } from '@/lib/offline/cache'
import { CoreError, coreFetch } from '@/lib/services/core/http'
import type { CoreOrder } from '@/lib/services/core/sales'
import { useAuthStore } from '@/lib/stores/authStore'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn(() => new Promise(() => undefined)) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: jest.fn(), push: jest.fn(), replace: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

const as = (role: 'waiter' | 'cashier' | 'admin') => useAuthStore.setState({ user: { uid: 1, name: 'X', companyId: 1, role }, employee: { id: 1, name: 'X', code: null, role, shift: null, userId: 1, checkIn: '', attendanceId: null, sessionEnds: null } } as never)
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><OfflineBar /><EmergencyLock /></NextIntlClientProvider>)

beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear(); clearEmergency()
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  startCacheSession()
  jest.mocked(coreFetch).mockImplementation(() => new Promise(() => undefined))
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: true })
})

const reviewPayment: OutboxEntry = { id: 'pago-review', at: '2026-10-08T12:00:00Z', label: 'DI-041', kind: 'payment', order: { id: 41 },
  methodId: 2, amount: 'balance', received: 50000, reference: 'comprobante-41', requestKey: 'offline-identidad-0001' }
const reviewClosing: OutboxEntry = { id: 'cierre-review', at: '2026-10-08T12:00:00Z', label: 'DI-041', kind: 'pay', order: { id: 41 }, paidAt: '2026-10-08T11:59:00Z' }
const serverOrder = (): CoreOrder => ({ id: 41, number: 'DI-041', state: 'draft', total: 38900, paid: 38900,
  payments: [{ id: 1, method_id: 2, method: 'Efectivo', amount: 38900, received: 50000, reference: 'comprobante-41', request_key: 'offline-identidad-0001' }],
} as CoreOrder)
function openReview(entries = [reviewPayment, reviewClosing]) {
  as('cashier')
  useNetworkStore.setState({ online: true, since: null })
  useOutboxStore.setState({ failed: entries.map((entry) => ({ entry, error: 'Respuesta no confirmada' })) })
  wrap()
  fireEvent.click(screen.getByRole('button', { name: `Revisar (${entries.length})` }))
}

// Falla si la revisión oculta el importe desconocido, permite descartarlo a ciegas o confirmar el pago vuelve a cobrarlo.
it('consulta el servidor, confirma el pago y reanuda una sola vez el cierre original', async () => {
  jest.mocked(coreFetch).mockImplementation(async (path) => ({ order: { ...serverOrder(), ...(path === 'orders/41/pay' && { state: 'paid' }) } }) as never)
  openReview()
  expect(screen.getByText('Importe original no disponible')).toBeVisible()
  expect(screen.getByText('Referencia: comprobante-41', { exact: false })).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull()
  const paymentRow = screen.getAllByRole('listitem')[0]
  await act(async () => { fireEvent.click(within(paymentRow).getByRole('button', { name: 'Consultar pedido' })) })
  expect(within(paymentRow).getByLabelText('Pedido consultado en el servidor')).toHaveTextContent('Efectivo · $ 38.900 · comprobante-41')
  const confirm = within(paymentRow).getByRole('button', { name: 'Confirmar pago registrado' })
  await act(async () => { fireEvent.click(confirm); fireEvent.click(confirm) })
  expect(useOutboxStore.getState().failed.map((f) => f.entry.id)).toEqual(['cierre-review'])
  const closingRow = screen.getByRole('listitem')
  await act(async () => { fireEvent.click(within(closingRow).getByRole('button', { name: 'Consultar pedido' })) })
  await act(async () => { fireEvent.click(within(closingRow).getByRole('button', { name: 'Reanudar cierre' })) })
  expect(jest.mocked(coreFetch).mock.calls.filter(([path]) => path === 'orders/41/payments')).toHaveLength(0)
  expect(jest.mocked(coreFetch).mock.calls.filter(([path]) => path === 'orders/41/pay')).toEqual([
    ['orders/41/pay', { method: 'POST', body: { paid_at: '2026-10-08T11:59:00Z' } }],
  ])
  expect(jest.mocked(coreFetch).mock.calls.filter(([path]) => path === 'orders/41')).toHaveLength(4)
  for (const [, options] of jest.mocked(coreFetch).mock.calls.filter(([path]) => path === 'orders/41')) expect(options).toEqual({ offlineFallback: false })
  expect(useOutboxStore.getState().failed).toEqual([])
})

// Falla si la falta de prueba o saldo pendiente habilita la confirmación y borra una operación que aún necesita cotejo.
it.each(['sin prueba', 'saldo pendiente'])('conserva revisión: %s', async (kind) => {
  jest.mocked(coreFetch).mockResolvedValue({ order: { ...serverOrder(), ...(kind === 'sin prueba' ? { payments: [] } : { total: 43900 }) } } as never)
  openReview(kind === 'sin prueba' ? [reviewPayment] : [reviewClosing])
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Consultar pedido' })) })
  expect(screen.getByText('No hay prueba suficiente para resolver esta operación o queda saldo pendiente. Conserva el registro y coteja el comprobante real.')).toBeVisible()
  expect(screen.queryByRole('button', { name: /Confirmar pago|Reanudar cierre/ })).toBeNull()
  expect(useOutboxStore.getState().failed).toHaveLength(1)
})

// Falla si una consulta fallida se presenta como ausencia de pago o permite confirmar usando un resultado anterior.
it('muestra el fallo de consulta y conserva el registro sin confirmación', async () => {
  jest.mocked(coreFetch).mockRejectedValue(new CoreError(0, 'unreachable', 'No se pudo conectar con el servidor.'))
  openReview([reviewPayment])
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Consultar pedido' })) })
  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor.')
  expect(screen.queryByRole('button', { name: 'Confirmar pago registrado' })).toBeNull()
  expect(useOutboxStore.getState().failed).toHaveLength(1)
})

// Falla si una respuesta anterior al cambio de cuenta ofrece confirmar un cobro desde la sesión siguiente.
it('ignora la consulta tardía al cambiar de sesión y bloquea doble consulta', async () => {
  let complete!: (result: unknown) => void
  jest.mocked(coreFetch).mockImplementation((path) => path === 'orders/41' ? new Promise((resolve) => { complete = resolve }) : new Promise(() => undefined))
  openReview([reviewPayment])
  const consult = screen.getByRole('button', { name: 'Consultar pedido' })
  act(() => { fireEvent.click(consult); fireEvent.click(consult) })
  expect(screen.getByRole('button', { name: 'Consultando…' })).toBeDisabled()
  expect(jest.mocked(coreFetch).mock.calls.filter(([path]) => path === 'orders/41')).toHaveLength(1)
  act(() => { endCacheSession(); startCacheSession(); useAuthStore.setState({ user: { ...useAuthStore.getState().user!, uid: 2 } }) })
  await act(async () => { complete({ order: serverOrder() }) })
  expect(screen.queryByRole('button', { name: 'Confirmar pago registrado' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Consultar pedido' })).toBeEnabled()
  expect(useOutboxStore.getState().failed).toHaveLength(1)
})
afterEach(() => jest.useRealTimers())

// Falla si sin red no se ve la cuenta regresiva de 3 minutos hacia la caja, si no corre, si al cumplirse el mesero no
// queda bloqueado con el aviso de ir a la caja, o si la caja también queda bloqueada.
it('cuenta regresiva y bloqueo del mesero', () => {
  as('waiter')
  useNetworkStore.setState({ online: false, since: Date.now() })
  wrap()
  expect(screen.getByRole('status')).toHaveTextContent('Sin conexión · en 3:00 la operación pasa a la caja')
  act(() => { jest.advanceTimersByTime(61_000) })
  expect(screen.getByRole('status')).toHaveTextContent('en 1:59')
  expect(screen.queryByRole('alertdialog')).toBeNull()
  act(() => { jest.advanceTimersByTime(120_000) })
  expect(screen.getByRole('status')).toHaveTextContent('Modo emergencia · la operación está en la caja')
  expect(screen.getByRole('alertdialog', { name: 'Modo emergencia' })).toHaveTextContent('los pedidos y los cobros se hacen en la caja')
})

// Falla si la encargada no puede pasar la operación a la caja antes de tiempo, o si en emergencia la caja no ve el
// acceso a los pedidos de emergencia o queda bloqueada.
it('la encargada adelanta la emergencia y la caja sigue operando', () => {
  as('admin')
  useNetworkStore.setState({ online: false, since: Date.now() })
  wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Pasar a la caja ahora' }))
  act(() => { jest.advanceTimersByTime(1000) })
  expect(screen.getByRole('status')).toHaveTextContent('Modo emergencia')
  expect(screen.getByRole('link', { name: 'Pedidos de emergencia' })).toHaveAttribute('href', '/emergencia')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

// Falla si con la sesión vencida el aviso no pide iniciar sesión para enviar lo pendiente.
it('pide iniciar sesión si la cola espera la sesión', () => {
  as('cashier')
  useNetworkStore.setState({ online: true, since: null })
  useOutboxStore.setState({ needsLogin: true, entries: [{ id: '1', at: '', label: 'x', kind: 'fire', order: { id: 1 } }] })
  wrap()
  expect(screen.getByRole('status')).toHaveTextContent('La sesión venció · inicia sesión para enviar 1 operación')
  expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login')
})
