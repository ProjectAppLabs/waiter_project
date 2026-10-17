import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import LoginPage from '@/app/(waiter)/login/page'
import { here, leaveTo } from '@/lib/domain/tenant'
import { messages } from '@/lib/i18n/messages'
import { universalActivate, universalLogin, universalRequestCode, universalVerify2fa, type AccessDestination } from '@/lib/services/core/access'
import { CoreError } from '@/lib/services/core/http'
import { platformMe } from '@/lib/services/core/platform'
import { useAuthStore, type ActiveEmployee } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'
import type { AuthUser } from '@/lib/services/session'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/domain/tenant', () => ({ ...jest.requireActual('@/lib/domain/tenant'), here: jest.fn(), leaveTo: jest.fn() }))
jest.mock('@/lib/services/core/access', () => ({ universalLogin: jest.fn(), universalVerify2fa: jest.fn(), universalRequestCode: jest.fn(async () => ({ ok: true })), universalActivate: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ startMyShift: jest.fn(), endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))
jest.mock('@/lib/services/core/platform', () => ({ platformMe: jest.fn(), platformLogout: jest.fn() }))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><LoginPage /></NextIntlClientProvider>)
const person = (role: ActiveEmployee['role']): ActiveEmployee => ({ id: 2, name: 'Sofía', code: null, role, shift: null, userId: 5, checkIn: '', attendanceId: 1, sessionEnds: null })
const account = (role: AuthUser['role']): AuthUser => ({ uid: 5, name: 'Sofía', companyId: 1, role })
const pos = (slug: string, name: string, extra: Partial<AccessDestination> = {}): AccessDestination => ({ kind: 'pos', organization: { slug, name }, role: 'waiter', name: 'Sofía', pass: `pase-${slug}`, ...extra })
const ana = { id: '1', name: 'Ana', username: 'ana.projectapp', email: 'ana@projectapp.co', role: 'admin' as const }
const at = (host: string, protocol = 'http:') => jest.mocked(here).mockReturnValue({ protocol, host })

beforeEach(() => {
  replace.mockReset(); localStorage.clear(); sessionStorage.clear()
  jest.mocked(leaveTo).mockReset()
  jest.mocked(universalLogin).mockReset(); jest.mocked(universalActivate).mockReset(); jest.mocked(universalVerify2fa).mockReset()
  jest.mocked(universalRequestCode).mockClear()
  jest.mocked(platformMe).mockReset().mockRejectedValue(new Error('sin sesión'))
  at('localhost:3000')
  process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
  usePlatformStore.setState({ user: null, hydrated: false })
  useAuthStore.setState({ hydrate: async () => undefined, hydrated: true, user: null, employee: null, session: null, restaurant: null, restaurants: null })
})
afterEach(() => { window.history.pushState({}, '', '/login') })

async function signIn(who = 'sofia.mesera', password = 'secreta-123') {
  await userEvent.type(await screen.findByLabelText('Usuario o correo'), who)
  await userEvent.type(screen.getByLabelText('Contraseña'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
}

// Falla si el inicio vuelve a pedir la cuenta del terminal o un PIN, o si vuelve el atajo «Tengo un código»: la única
// salida es «¿Olvidaste tu contraseña?» (plan P).
it('un solo formulario: usuario o correo y contraseña, y solo «¿Olvidaste tu contraseña?»', async () => {
  wrap()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesión')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  expect(screen.queryByText(/PIN/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Tengo un código' })).toBeNull()
  expect(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument()
})

// Falla si con una sola cuenta el inicio universal no lleva a la persona, con su pase en el fragmento (que no viaja al
// servidor), al subdominio de su organización, o si no recuerda su usuario.
it.each([
  ['localhost:3000', 'http:', 'http://frisby.localhost:3000'],
  ['waiter.projectapp.co', 'https:', 'https://frisby.waiter.projectapp.co'],
])('desde %s va al subdominio de su organización con el pase', async (host, protocol, origin) => {
  at(host, protocol)
  jest.mocked(universalLogin).mockResolvedValue([pos('frisby', 'Frisby')])
  wrap()
  await signIn()
  await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(`${origin}/entrar#pase=pase-frisby&destino=pos`))
  expect(universalLogin).toHaveBeenCalledWith('sofia.mesera', 'secreta-123')
  expect(localStorage.getItem('waiter.email')).toBe('sofia.mesera')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
})

// Falla si en desarrollo (o en una tableta por la IP) la organización por omisión deja de abrirse en la misma dirección.
it('la organización por omisión entra en la misma dirección en desarrollo', async () => {
  at('192.168.56.10:3000')
  jest.mocked(universalLogin).mockResolvedValue([pos('burger-house', 'Burger House')])
  wrap()
  await signIn()
  await waitFor(() => expect(leaveTo).toHaveBeenCalledWith('http://192.168.56.10:3000/entrar#pase=pase-burger-house&destino=pos'))
})

// Falla si con cuentas en varias organizaciones no deja elegir, si oculta por qué una no está disponible o si deja
// entrar a esa.
it('con varias organizaciones deja elegir y explica la que no está disponible', async () => {
  jest.mocked(universalLogin).mockResolvedValue([
    pos('arepa-bar', 'Arepa Bar', { role: 'admin' }),
    pos('suspendida', 'Suspendida', { pass: undefined, error: { code: 'organization_suspended', message: 'La cuenta de tu organización está suspendida.' } }),
    pos('zeta-grill', 'Zeta Grill', { role: 'owner' }),
    { kind: 'platform', role: 'operator', name: 'Sofía', pass: 'pase-consola' },
  ])
  wrap()
  await signIn()
  expect(await screen.findByRole('heading', { name: '¿A dónde quieres entrar?' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Arepa Bar.*Encargado/ })).toBeEnabled()
  expect(screen.getByRole('button', { name: /Consola de ProjectApp.*Operador/ })).toBeEnabled()
  expect(screen.getByRole('button', { name: /Suspendida.*está suspendida/ })).toBeDisabled()
  expect(leaveTo).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /Zeta Grill.*Dueño/ }))
  expect(leaveTo).toHaveBeenCalledWith('http://zeta-grill.localhost:3000/entrar#pase=pase-zeta-grill&destino=pos')
})

// Falla si quien llega desde el subdominio de su organización (o el enlace de su invitación) tiene que elegirla otra vez.
it('entra directo a la organización de donde venía', async () => {
  window.history.pushState({}, '', '/login?org=zeta-grill')
  jest.mocked(universalLogin).mockResolvedValue([pos('arepa-bar', 'Arepa Bar'), pos('zeta-grill', 'Zeta Grill')])
  wrap()
  await signIn()
  await waitFor(() => expect(leaveTo).toHaveBeenCalledWith('http://zeta-grill.localhost:3000/entrar#pase=pase-zeta-grill&destino=pos'))
})

// Falla si el inicio llama «incorrectos» a lo que no lo es (fuera de turno, demasiados intentos) o si deja de decirlo
// cuando sí lo es; en ningún caso debe salir de la dirección.
it('dice el motivo real del rechazo', async () => {
  jest.mocked(universalLogin)
    .mockResolvedValueOnce([pos('frisby', 'Frisby', { pass: undefined, error: { code: 'outside_hours', message: 'Estás fuera de tu horario de acceso. Tu turno es 14:00–22:00.', window: '14:00–22:00' } })])
    .mockRejectedValueOnce(new CoreError(401, 'invalid_credentials', 'El usuario o la contraseña no son correctos.'))
    .mockRejectedValueOnce(new CoreError(429, 'too_many_attempts', 'Demasiados intentos fallidos. Espera unos minutos y vuelve a intentar.'))
  wrap()
  await signIn()
  expect(await screen.findByRole('alert')).toHaveTextContent('Tu turno es 14:00–22:00')
  await userEvent.type(screen.getByLabelText('Contraseña'), 'otra-clave')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Usuario, correo o contraseña incorrectos'))
  await userEvent.type(screen.getByLabelText('Contraseña'), 'otra-clave')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Demasiados intentos'))
  expect(leaveTo).not.toHaveBeenCalled()
})

// Falla si recuperar la contraseña no pide primero el usuario o el correo y envía el código, o si después no deja
// escribirlo con la nueva contraseña, reenviarlo o entrar con ella.
it('olvidé mi contraseña: pide el código por correo y luego cambia la contraseña y entra', async () => {
  jest.mocked(universalActivate).mockResolvedValue({ ok: true })
  jest.mocked(universalLogin).mockResolvedValue([pos('frisby', 'Frisby')])
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: '¿Olvidaste tu contraseña?' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Olvidaste tu contraseña?')
  expect(screen.queryByLabelText('Código de 6 dígitos')).toBeNull()
  await userEvent.type(screen.getByLabelText('Usuario o correo'), 'sofia.mesera')
  await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }))
  expect(universalRequestCode).toHaveBeenCalledWith('sofia.mesera')
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Escribe el código')
  expect(screen.getByText(/vence en 30 minutos/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Reenviar código' }))
  expect(await screen.findByText(/el anterior ya no sirve/)).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Código de 6 dígitos'), '123456')
  await userEvent.type(screen.getByLabelText('Nueva contraseña (mínimo 8)'), 'nueva-1234')
  await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'nueva-1234')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y entrar' }))
  await waitFor(() => expect(universalActivate).toHaveBeenCalledWith('sofia.mesera', '123456', 'nueva-1234'))
  expect(universalLogin).toHaveBeenCalledWith('sofia.mesera', 'nueva-1234')
  await waitFor(() => expect(leaveTo).toHaveBeenCalledWith('http://frisby.localhost:3000/entrar#pase=pase-frisby&destino=pos'))
})

// Falla si un código malo no se dice en el paso del código o si se intenta entrar de todos modos.
it('un código malo se queda en el paso del código', async () => {
  jest.mocked(universalActivate).mockRejectedValue(new CoreError(400, 'invalid_code', 'El código no es válido.'))
  window.history.pushState({}, '', '/login?codigo=mateo.ruiz')
  wrap()
  await userEvent.type(await screen.findByLabelText('Código de 6 dígitos'), '000000')
  await userEvent.type(screen.getByLabelText('Nueva contraseña (mínimo 8)'), 'nueva-1234')
  await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'nueva-1234')
  await userEvent.click(screen.getByRole('button', { name: 'Guardar y entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Código inválido o vencido')
  expect(universalLogin).not.toHaveBeenCalled()
})

// Falla si el enlace del correo de invitación no abre directo «escribe el código» con el usuario de la persona.
it('el enlace de la invitación abre el paso del código con el usuario puesto', async () => {
  window.history.pushState({}, '', '/login?codigo=mateo.ruiz&org=frisby')
  wrap()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Escribe el código')
  expect(screen.getByText(/Bienvenido, mateo\.ruiz/)).toBeInTheDocument()
})

// Falla si una cuenta de ProjectApp con doble factor sale hacia la consola con solo la contraseña, si el paso del código
// no manda el desafío del servidor o si con el código correcto no va a la consola con su pase (plan Y3).
it('con doble factor pide el código de verificación antes de ir a la consola', async () => {
  at('waiter.projectapp.co', 'https:')
  jest.mocked(universalLogin).mockResolvedValue([{ kind: 'platform', role: 'admin', name: 'Ana', two_factor: true, challenge: 'desafio-1' }])
  jest.mocked(universalVerify2fa).mockRejectedValueOnce(new CoreError(400, 'invalid_code', 'Código incorrecto.')).mockResolvedValueOnce('pase-consola')
  wrap()
  await signIn('ana.projectapp', 'Plataforma-2026')
  expect(await screen.findByRole('heading', { name: 'Código de verificación' })).toBeInTheDocument()
  expect(leaveTo).not.toHaveBeenCalled()
  await userEvent.type(screen.getByLabelText('Código de verificación'), '111111')
  await userEvent.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/Código incorrecto/)
  await userEvent.clear(screen.getByLabelText('Código de verificación'))
  await userEvent.type(screen.getByLabelText('Código de verificación'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
  await waitFor(() => expect(leaveTo).toHaveBeenCalledWith('https://platform.waiter.projectapp.co/entrar#pase=pase-consola&destino=plataforma'))
  expect(universalVerify2fa).toHaveBeenLastCalledWith('desafio-1', '123456')
})

// Falla si con el desafío vencido o anulado (cinco códigos malos) el paso del código sigue pidiendo códigos que ya no
// pueden servir, en vez de volver a pedir la contraseña.
it('un desafío vencido vuelve a la contraseña con el aviso', async () => {
  jest.mocked(universalLogin).mockResolvedValue([{ kind: 'platform', role: 'admin', name: 'Ana', two_factor: true, challenge: 'desafio-2' }])
  jest.mocked(universalVerify2fa).mockRejectedValue(new CoreError(400, 'challenge_expired', 'Vencido.'))
  wrap()
  await signIn('ana.projectapp', 'Plataforma-2026')
  await userEvent.type(await screen.findByLabelText('Código de verificación'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Verificar y entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/se acabó/)
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
})

// Falla si en el subdominio de una organización (o en la consola, `platform.`) sin sesión se pinta otro formulario en vez
// de ir al inicio universal, si la consola se toma por una organización llamada «platform», o si se pierden el código de
// invitación, la organización de donde viene o por qué se cerró la sesión.
it.each([
  ['frisby.localhost:3000', '/login?codigo=ana', 'http://localhost:3000/login?codigo=ana&org=frisby&motivo=idle'],
  ['platform.waiter.projectapp.co', '/login', 'http://waiter.projectapp.co/login?motivo=idle'],
])('sin sesión en %s va al inicio universal', async (host, path, target) => {
  at(host)
  window.history.pushState({}, '', path)
  sessionStorage.setItem('waiter.logout-reason', 'idle')
  wrap()
  await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(target, { replace: true }))
  expect(screen.queryByLabelText('Contraseña')).toBeNull()
})

// Falla si cada rol, ya con su sesión en el subdominio (al volver de /entrar), no llega a su sitio: el mesero a su
// inicio, el encargado al tablero, el dueño a su consola.
it.each([
  ['waiter', '/salon'],
  ['admin', '/dashboard'],
  ['owner', '/organizacion'],
] as const)('con sesión, el rol %s va a %s', async (role, path) => {
  at('frisby.localhost:3000')
  useAuthStore.setState({ user: account(role), employee: person(role), session: { id: 16, configId: 1, state: 'opened' } })
  wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith(path))
  expect(leaveTo).not.toHaveBeenCalled()
})

// Falla si el encargado de varios restaurantes no elige en cuál trabaja, o si al elegir no entra a ese restaurante.
it('el encargado de varios restaurantes elige uno y entra', async () => {
  at('frisby.localhost:3000')
  const restaurants = [{ id: 1, name: 'Poblado' }, { id: 2, name: 'Laureles' }] as never
  const chooseRestaurant = jest.fn(async (r) => { useAuthStore.setState({ restaurant: r }) })
  useAuthStore.setState({ user: account('admin'), employee: person('admin'), session: null, restaurants, chooseRestaurant })
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: /Laureles/ }))
  expect(chooseRestaurant).toHaveBeenCalledWith({ id: 2, name: 'Laureles' })
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
})

// Falla si una persona de ProjectApp con su sesión viva no vuelve a su consola al abrir el inicio.
it('ProjectApp con sesión vuelve a su consola', async () => {
  jest.mocked(platformMe).mockResolvedValue({ user: ana } as never)
  wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/platform'))
})
