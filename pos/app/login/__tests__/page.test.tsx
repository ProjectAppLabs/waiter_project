import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import LoginPage from '@/app/login/page'
import { activate, requestCode } from '@/lib/services/activation'
import { messages } from '@/lib/i18n/messages'
import { CoreError } from '@/lib/services/core/http'
import { platformActivate, platformLogin, platformRequestCode, platformVerify2fa } from '@/lib/services/core/platform'
import { ShiftDeniedError, useAuthStore, type ActiveEmployee } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'
import type { AuthUser } from '@/lib/services/session'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/services/activation', () => ({ requestCode: jest.fn(async () => undefined), activate: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ startMyShift: jest.fn(), endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))
jest.mock('@/lib/services/core/platform', () => ({
  platformLogin: jest.fn(), platformMe: jest.fn(async () => { throw new Error('sin sesión') }), platformLogout: jest.fn(),
  platformRequestCode: jest.fn(async () => ({ ok: true })), platformActivate: jest.fn(), platformVerify2fa: jest.fn(),
}))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><LoginPage /></NextIntlClientProvider>)
const person = (role: ActiveEmployee['role']): ActiveEmployee => ({ id: 2, name: 'Sofía', code: null, role, shift: null, userId: 5, checkIn: '', attendanceId: 1, sessionEnds: null })
const account = (role: AuthUser['role']): AuthUser => ({ uid: 5, name: 'Sofía', companyId: 1, role })
// Simula a `login` del store: entra con la cuenta y deja a la persona y su caja como lo haría el servidor.
const signsInAs = (role: AuthUser['role'], extra: Record<string, unknown> = {}) => jest.fn(async () => {
  useAuthStore.setState({ user: account(role), employee: person(role), session: { id: 16, configId: 1, state: 'opened' }, ...extra })
})

const NO_ACCOUNT = () => new CoreError(401, 'invalid_credentials', 'El usuario o la contraseña no son correctos.')
const ana = { id: '1', name: 'Ana', username: 'ana.projectapp', email: 'ana@projectapp.co', role: 'admin' as const }

beforeEach(() => {
  replace.mockReset(); localStorage.clear(); jest.mocked(platformActivate).mockReset()
  jest.mocked(activate).mockClear(); jest.mocked(requestCode).mockClear(); jest.mocked(platformRequestCode).mockClear()
  // Por omisión el usuario no es de ProjectApp: el inicio único dice «incorrectos» como antes.
  jest.mocked(platformLogin).mockReset().mockRejectedValue(NO_ACCOUNT())
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  usePlatformStore.setState({ user: null, hydrated: false })
  useAuthStore.setState({ hydrate: async () => undefined, hydrated: true, user: null, employee: null, session: null, restaurant: null, restaurants: null })
})

async function signIn(who = 'sofia.mesera', password = 'secreta-123') {
  await userEvent.type(screen.getByLabelText('Usuario o correo'), who)
  await userEvent.type(screen.getByLabelText('Contraseña'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

// Falla si el inicio vuelve a pedir la cuenta del terminal o un PIN, o si vuelve el atajo «Tengo un código»: la única
// salida es «¿Olvidaste tu contraseña?» (plan P).
it('un solo formulario: usuario o correo y contraseña, y solo «¿Olvidaste tu contraseña?»', () => {
  wrap()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesión')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  expect(screen.queryByText(/PIN/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Tengo un código' })).toBeNull()
  expect(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument()
})

// Falla si recuperar la contraseña no pide primero el usuario o el correo y envía el código, o si después no deja
// escribirlo con la nueva contraseña, reenviarlo o entrar con ella.
it('olvidé mi contraseña: pide el código por correo y luego cambia la contraseña', async () => {
  const login = jest.fn(async () => undefined)
  useAuthStore.setState({ login })
  ;(activate as jest.Mock).mockResolvedValue(true)
  wrap()
  await userEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Olvidaste tu contraseña?')
  expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull()
  await userEvent.type(screen.getByLabelText('Usuario o correo'), 'sofia.mesera')
  await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  expect(requestCode).toHaveBeenCalledWith('sofia.mesera')
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Escribe el código')
  expect(screen.getByText(/vence en 30 minutos/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))
  expect(await screen.findByText(/el anterior ya no sirve/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123456')
  await userEvent.type(screen.getByLabelText('Nueva contraseña (mínimo 8)'), 'nueva-1234')
  await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'nueva-1234')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y entrar' }))
  await waitFor(() => expect(activate).toHaveBeenCalledWith('sofia.mesera', '123456', 'nueva-1234'))
  expect(login).toHaveBeenCalledWith('sofia.mesera', 'nueva-1234')
})

// Falla si el enlace del correo de invitación no abre directo «escribe el código» con el usuario de la persona.
it('el enlace de la invitación abre el paso del código con el usuario puesto', () => {
  window.history.pushState({}, '', '/login?codigo=mateo.ruiz')
  try {
    wrap()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Escribe el código')
    expect(screen.getByText(/Bienvenido, mateo\.ruiz/)).toBeInTheDocument()
  } finally { window.history.pushState({}, '', '/login') }
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

// Falla si el inicio llama «incorrectos» a lo que no lo es (un permiso, el horario que el servidor rechaza al autenticar) o si
// deja de decirlo cuando sí lo es.
it('dice el motivo real del rechazo', async () => {
  const login = jest.fn()
    .mockRejectedValueOnce(new CoreError(403, 'outside_hours', 'Mateo intentó entrar fuera de su turno (14:00–22:00).'))
    .mockRejectedValueOnce(new CoreError(403, 'invalid_credentials', 'Access Denied'))
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

// Falla si una persona de ProjectApp necesita otra pantalla para entrar: con un usuario que no es del restaurante, el
// inicio prueba la cuenta de ProjectApp y la lleva a su consola.
it('la persona de ProjectApp entra por el mismo inicio y va a su consola', async () => {
  useAuthStore.setState({ login: jest.fn(async () => { throw NO_ACCOUNT() }) })
  jest.mocked(platformLogin).mockResolvedValue({ user: ana } as never)
  wrap()
  await signIn('ana.projectapp', 'Plataforma-2026')
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/plataforma'))
  expect(platformLogin).toHaveBeenCalledWith('ana.projectapp', 'Plataforma-2026')
})

// Falla si un rechazo real del restaurante (fuera de turno, cuenta suspendida) se tapa probando la cuenta de ProjectApp,
// o si una contraseña mala en los dos lados no dice «incorrectos».
it('solo prueba ProjectApp cuando el usuario no existe en el restaurante', async () => {
  useAuthStore.setState({ login: jest.fn(async () => { throw new ShiftDeniedError('outside_hours', '08:00–16:00') }) })
  wrap()
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('08:00–16:00')
  expect(platformLogin).not.toHaveBeenCalled()
  useAuthStore.setState({ login: jest.fn(async () => { throw NO_ACCOUNT() }) })
  jest.mocked(platformLogin).mockRejectedValue(NO_ACCOUNT())
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(platformLogin).toHaveBeenCalled())
  expect(await screen.findByRole('alert')).toHaveTextContent(/incorrectos/)
  expect(replace).not.toHaveBeenCalledWith('/plataforma')
})

// Falla si en la dirección de ProjectApp (sin organización) el inicio intenta entrar a un restaurante, o si el código
// de invitación de ProjectApp no se acepta en el inicio único.
it('sin organización entra directo como ProjectApp y acepta su código', async () => {
  delete process.env.NEXT_PUBLIC_DEFAULT_ORG
  const orgLogin = jest.fn()
  useAuthStore.setState({ login: orgLogin })
  jest.mocked(platformLogin).mockResolvedValue({ user: ana } as never)
  jest.mocked(platformActivate).mockResolvedValue({ ok: true })
  wrap()
  await userEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }))
  await userEvent.type(screen.getByLabelText('Usuario o correo'), 'ana.projectapp')
  await userEvent.click(screen.getByRole('button', { name: /Enviar código/ }))
  expect(platformRequestCode).toHaveBeenCalledWith('ana.projectapp')
  expect(requestCode).not.toHaveBeenCalledWith('ana.projectapp')
  await userEvent.type(await screen.findByLabelText(/Código/), '123456')
  await userEvent.type(screen.getByLabelText(/Nueva contraseña/), 'Nueva-clave-2026')
  await userEvent.type(screen.getByLabelText(/Repite|Confirma/), 'Nueva-clave-2026')
  await userEvent.click(screen.getByRole('button', { name: /Guardar|Activar/ }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/plataforma'))
  expect(platformActivate).toHaveBeenCalledWith('ana.projectapp', '123456', 'Nueva-clave-2026')
  expect(activate).not.toHaveBeenCalled()
  expect(orgLogin).not.toHaveBeenCalled()
})

// Falla si una cuenta de ProjectApp con doble factor entra con solo la contraseña, si el paso del código no manda el
// desafío del servidor, o si un desafío vencido deja a la persona atascada en vez de volver a la contraseña (plan Y3).
it('con doble factor pide el código de verificación antes de abrir la consola', async () => {
  useAuthStore.setState({ login: jest.fn(async () => { throw NO_ACCOUNT() }) })
  jest.mocked(platformLogin).mockResolvedValue({ two_factor: true, challenge: 'desafio-1' } as never)
  jest.mocked(platformVerify2fa).mockReset().mockRejectedValueOnce(new CoreError(400, 'invalid_code', 'Código incorrecto.')).mockResolvedValueOnce({ user: ana } as never)
  wrap()
  await signIn('ana.projectapp', 'Plataforma-2026')
  expect(await screen.findByRole('heading', { name: 'Código de verificación' })).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalledWith('/plataforma')
  await userEvent.type(screen.getByLabelText('Código de verificación'), '111111')
  await userEvent.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Código incorrecto/)
  await userEvent.clear(screen.getByLabelText('Código de verificación'))
  await userEvent.type(screen.getByLabelText('Código de verificación'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/plataforma'))
  expect(platformVerify2fa).toHaveBeenLastCalledWith('desafio-1', '123456')
})

// Falla si con el desafío vencido o anulado (cinco códigos malos) el paso del código sigue pidiendo códigos que ya no
// pueden servir, en vez de volver a pedir la contraseña.
it('un desafío vencido vuelve a la contraseña con el aviso', async () => {
  useAuthStore.setState({ login: jest.fn(async () => { throw NO_ACCOUNT() }) })
  jest.mocked(platformLogin).mockResolvedValue({ two_factor: true, challenge: 'desafio-2' } as never)
  jest.mocked(platformVerify2fa).mockReset().mockRejectedValue(new CoreError(400, 'challenge_expired', 'Vencido.'))
  wrap()
  await signIn('ana.projectapp', 'Plataforma-2026')
  await userEvent.type(await screen.findByLabelText('Código de verificación'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/se acabó/)
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
})
