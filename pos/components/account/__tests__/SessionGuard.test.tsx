import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { SessionGuard } from '@/components/account/SessionGuard'
import { readLogoutReason } from '@/lib/domain/sessionGuard'
import { messages } from '@/lib/i18n/messages'
import { useAuthStore, type ActiveEmployee } from '@/lib/stores/authStore'

const replace = jest.fn()
// Como en Next, el enrutador es el mismo objeto en cada render (si cambiara, el efecto reiniciaría la inactividad).
const router = { replace, push: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => router }))

const NOW = new Date('2026-10-04T15:00:00Z').getTime()
const MIN = 60_000
const employee = (sessionEnds: string | null): ActiveEmployee => ({ id: 7, name: 'Sofía', code: null, role: 'waiter', shift: null, userId: 1, checkIn: '', attendanceId: null, sessionEnds })
const logout = jest.fn(async () => { useAuthStore.setState({ employee: null }) })
const mount = (idle = true) => render(<NextIntlClientProvider locale="es" messages={messages}><SessionGuard idle={idle} /></NextIntlClientProvider>)
const tick = (ms: number) => act(() => { jest.advanceTimersByTime(ms) })

beforeEach(() => {
  jest.useFakeTimers({ now: NOW })
  jest.clearAllMocks()
  sessionStorage.clear()
  useAuthStore.setState({ employee: employee(null), logout })
})
afterEach(() => { jest.useRealTimers() })

// Falla si sin turno abierto se vigila la sesión o se cierra.
it('sin turno abierto no hace nada', () => {
  useAuthStore.setState({ employee: null })
  mount()
  tick(30 * MIN)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(logout).not.toHaveBeenCalled()
})

// Falla si a los cinco minutos de cerrarse por inactividad no se avisa, si «Seguir aquí» no lo quita, o si tocar la
// pantalla no reinicia la cuenta.
it('avisa antes de cerrar por inactividad y tocar la pantalla lo evita', async () => {
  mount()
  tick(10 * MIN)
  expect(screen.getByRole('status')).toHaveTextContent('Por inactividad, la sesión se cerrará en 5 min.')
  // Como en el navegador, tocar el botón dispara primero el pointerdown que cuenta como actividad.
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Seguir aquí' }))
  fireEvent.click(screen.getByRole('button', { name: 'Seguir aquí' }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  // El clic contó como actividad: pasan otros diez minutos sin cerrar.
  tick(10 * MIN)
  expect(logout).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: 'a' })
  tick(10 * MIN)
  expect(logout).not.toHaveBeenCalled()
})

// Falla si tras quince minutos sin tocarla no se cierra la sesión, no se recuerda el motivo o no se vuelve al inicio.
it('cierra por inactividad, guarda el motivo y vuelve al inicio', async () => {
  mount()
  tick(15 * MIN)
  await act(async () => { await Promise.resolve() })
  expect(logout).toHaveBeenCalledTimes(1)
  expect(readLogoutReason()).toBe('idle')
  expect(replace).toHaveBeenCalledWith('/login')
})

// Falla si una pantalla sin cierre por inactividad (cocina) se cierra sola.
it('la cocina no se cierra por inactividad', () => {
  mount(false)
  tick(60 * MIN)
  expect(logout).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

// Falla si el fin del turno no se avisa, si se puede aplazar como la inactividad, o si al terminar no se cierra con su
// motivo.
it('avisa el fin del turno sin aplazarlo y cierra al terminar', async () => {
  useAuthStore.setState({ employee: employee(new Date(NOW + 3 * MIN).toISOString()) })
  mount(false)
  expect(screen.getByRole('status')).toHaveTextContent('Tu turno termina: la sesión se cerrará en 3 min.')
  expect(screen.queryByRole('button', { name: 'Seguir aquí' })).not.toBeInTheDocument()
  tick(3 * MIN)
  await act(async () => { await Promise.resolve() })
  expect(logout).toHaveBeenCalledTimes(1)
  expect(readLogoutReason()).toBe('shift')
  expect(replace).toHaveBeenCalledWith('/login')
})

// Falla si un cierre que tarda se pide dos veces mientras el anterior no ha terminado.
it('no pide cerrar dos veces mientras el cierre está en curso', async () => {
  let finish!: () => void
  const slow = jest.fn(() => new Promise<void>((r) => { finish = r }))
  useAuthStore.setState({ employee: employee(new Date(NOW - MIN).toISOString()), logout: slow })
  mount(false)
  tick(60_000)
  expect(slow).toHaveBeenCalledTimes(1)
  await act(async () => { finish() })
  expect(replace).toHaveBeenCalledWith('/login')
})
