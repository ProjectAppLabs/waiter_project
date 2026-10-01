import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import LoginPage from '@/app/login/page'
import { messages } from '@/lib/i18n/messages'
import { OdooError } from '@/lib/services/errors'
import { ShiftDeniedError, useAuthStore, type ActiveEmployee } from '@/lib/stores/authStore'
import type { AuthUser } from '@/lib/services/session'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/services/activation', () => ({ requestCode: jest.fn(async () => undefined), activate: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ startMyShift: jest.fn(), endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><LoginPage /></NextIntlClientProvider>)
const person = (role: ActiveEmployee['role']): ActiveEmployee => ({ id: 2, name: 'Sofía', code: null, role, shift: null, userId: 5, checkIn: '', attendanceId: 1, token: 't', sessionEnds: null })
const account = (role: AuthUser['role']): AuthUser => ({ uid: 5, name: 'Sofía', companyId: 1, role })
// Simula a `login` del store: entra con la cuenta y deja a la persona y su caja como lo haría Odoo.
const signsInAs = (role: AuthUser['role'], extra: Record<string, unknown> = {}) => jest.fn(async () => {
  useAuthStore.setState({ user: account(role), employee: person(role), session: { id: 16, configId: 1, state: 'opened' }, ...extra })
})

beforeEach(() => {
  replace.mockReset(); localStorage.clear()
  useAuthStore.setState({ hydrate: async () => undefined, hydrated: true, user: null, employee: null, session: null, restaurant: null, restaurants: null })
})

async function signIn(who = 'sofia.mesera', password = 'secreta-123') {
  await userEvent.type(screen.getByLabelText('Usuario o correo'), who)
  await userEvent.type(screen.getByLabelText('Contraseña'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

// Falla si el inicio vuelve a pedir la cuenta del terminal o un PIN, o pierde los caminos de recuperar y de activar (plan P).
it('un solo formulario: usuario o correo y contraseña, con recuperar y código', async () => {
  wrap()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesión')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  expect(screen.queryByText(/PIN/)).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Tengo un código' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Recupera o activa tu cuenta')
  // Se pide el código con el usuario, no solo con un correo.
  await userEvent.type(screen.getByLabelText('Usuario o correo'), 'sofia.mesera')
  expect(screen.getByRole('button', { name: 'Enviar código' })).toBeEnabled()
})

// Falla si cada rol no llega a su sitio: el mesero a su inicio, el encargado al tablero, el dueño a su consola.
it.each([
  ['waiter', '/salon'],
  ['admin', '/dashboard'],
  ['owner', '/organizacion'],
] as const)('el rol %s entra y va a %s', async (role, path) => {
  useAuthStore.setState({ login: signsInAs(role) })
  wrap()
  await signIn()
  await waitFor(() => expect(replace).toHaveBeenCalledWith(path))
  expect(localStorage.getItem('waiter.email')).toBe('sofia.mesera')
})

// Falla si una persona fuera de su turno no ve el motivo y la ventana de su horario, o si entra de todos modos.
it('fuera del turno explica el horario y no entra', async () => {
  useAuthStore.setState({ login: jest.fn().mockRejectedValue(new ShiftDeniedError('outside_hours', '14:00–22:00')) })
  wrap()
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('Fuera de tu turno (14:00–22:00)')
  expect(replace).not.toHaveBeenCalled()
})

// Falla si el inicio llama «incorrectos» a lo que no lo es (un permiso, el horario que Odoo rechaza al autenticar) o si
// deja de decirlo cuando sí lo es.
it('dice el motivo real del rechazo', async () => {
  const login = jest.fn()
    .mockRejectedValueOnce(new OdooError('Mateo intentó entrar fuera de su turno (14:00–22:00).', 'odoo.exceptions.AccessDenied'))
    .mockRejectedValueOnce(new OdooError('Access Denied', 'odoo.exceptions.AccessDenied'))
  useAuthStore.setState({ login })
  wrap()
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('fuera de su turno (14:00–22:00)')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Usuario, correo o contraseña incorrectos'))
})

// Falla si el encargado de varios restaurantes no elige en cuál trabaja, o si al elegir no entra a ese restaurante.
it('el encargado de varios restaurantes elige uno y entra', async () => {
  const restaurants = [{ id: 1, name: 'Poblado' }, { id: 2, name: 'Laureles' }] as never
  const chooseRestaurant = jest.fn(async (r) => { useAuthStore.setState({ restaurant: r }) })
  useAuthStore.setState({ login: signsInAs('admin', { restaurants }), chooseRestaurant })
  wrap()
  await signIn('laura', 'secreta-123')
  await userEvent.click(await screen.findByRole('button', { name: /Laureles/ }))
  expect(chooseRestaurant).toHaveBeenCalledWith({ id: 2, name: 'Laureles' })
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
  expect(screen.queryByText('Ir a la consola de la organización')).toBeNull()
})
