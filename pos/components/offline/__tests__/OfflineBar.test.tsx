import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { EmergencyLock, OfflineBar } from '@/components/offline/OfflineBar'
import { messages } from '@/lib/i18n/messages'
import { clearEmergency } from '@/lib/offline/emergency'
import { useNetworkStore } from '@/lib/offline/network'
import { useOutboxStore } from '@/lib/offline/outbox'
import { useAuthStore } from '@/lib/stores/authStore'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn(() => new Promise(() => undefined)) }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ prefetch: jest.fn(), push: jest.fn(), replace: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

const as = (role: 'waiter' | 'cashier' | 'admin') => useAuthStore.setState({ user: { uid: 1, name: 'X', companyId: 1, role }, employee: { id: 1, name: 'X', code: null, role, shift: null, userId: 1, checkIn: '', attendanceId: null, sessionEnds: null } } as never)
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><OfflineBar /><EmergencyLock /></NextIntlClientProvider>)

beforeEach(() => {
  jest.useFakeTimers(); localStorage.clear(); clearEmergency()
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: true })
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
