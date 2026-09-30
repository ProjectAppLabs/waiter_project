import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import LoginPage from '@/app/login/page'
import { messages } from '@/lib/i18n/messages'
import { checkPin, listPosEmployees } from '@/lib/services/employees'
import { OdooError } from '@/lib/services/errors'
import { useAuthStore } from '@/lib/stores/authStore'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
jest.mock('@/lib/services/activation', () => ({ requestCode: jest.fn(async () => undefined), activate: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ listPosEmployees: jest.fn(), checkPin: jest.fn(), forgotPin: jest.fn(async () => true), endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))

const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><LoginPage /></NextIntlClientProvider>)
const demo = { id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter' as const, shift: { from: 12, to: 22 } }
const admin = { id: 1, name: 'Administrator', code: 'WT-0002', role: 'admin' as const, shift: null }
const hydrateAs = (user: boolean) => { useAuthStore.setState({ hydrated: true, user: user ? { uid: 2, name: 'Admin', companyId: 1, role: 'admin' } : null, session: user ? { id: 16, configId: 1, state: 'opened' } : null, employee: null }) }

beforeEach(() => { push.mockReset(); localStorage.clear(); useAuthStore.setState({ hydrate: async () => undefined }); (listPosEmployees as jest.Mock).mockResolvedValue([demo, admin]) })

// Falla si sin sesión de Odoo el terminal no pide correo y contraseña o pierde el camino del código.
it('without an Odoo session asks the terminal for email and password', async () => {
  hydrateAs(false)
  wrap()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicio de terminal')
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' }))
  expect(screen.getByText('Tengo un código')).toBeInTheDocument()
})

// Falla si con sesión el selector no lista a los empleados con su turno, o si un PIN equivocado entra.
it('with a session lists the employees with today shift and rejects a wrong PIN', async () => {
  hydrateAs(true)
  wrap()
  ;(checkPin as jest.Mock).mockResolvedValue({ ok: false, reason: 'wrong', attemptsLeft: 3 })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Empleado' })).toHaveTextContent('Sofía Mesera'))
  await userEvent.click(screen.getByRole('button', { name: 'Empleado' }))
  const option = screen.getByRole('option', { name: /Sofía Mesera/ })
  expect(option).toHaveTextContent('12:00 p. m. – 10:00 p. m.')
  await userEvent.click(option)
  for (const d of '111111') await userEvent.click(screen.getByRole('button', { name: d }))
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar turno' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Te quedan 3 intentos')
  expect(push).not.toHaveBeenCalled()
})

// Falla si el PIN correcto no inicia el turno (empleado activo) ni lleva al salón.
it('a correct PIN starts the shift and enters the POS', async () => {
  hydrateAs(true)
  ;(checkPin as jest.Mock).mockResolvedValue({ ok: true, attendanceId: 9, token: 'tok-demo', employee: { ...demo, userId: null } })
  useAuthStore.setState({ startShift: async (e, id, token) => { useAuthStore.setState({ employee: { ...e, checkIn: '', attendanceId: id, token } }) } })
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: 'Empleado' }))
  await userEvent.click(screen.getByRole('option', { name: /Sofía Mesera/ }))
  await act(async () => { for (const d of '123456') window.dispatchEvent(new KeyboardEvent('keydown', { key: d })) })
  await userEvent.click(screen.getByRole('button', { name: 'Iniciar turno' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/salon'))
  expect(useAuthStore.getState().employee?.id).toBe(2)
})

// Falla si "¿Olvidaste tu PIN?" no pide el correo ni muestra "Revisa tu correo" con Reenviar y Volver.
it('forgot PIN asks for the email and then shows the check-your-email screen', async () => {
  hydrateAs(true)
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: '¿Olvidaste tu PIN?' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('¿Olvidaste tu PIN?')
  await userEvent.type(screen.getByLabelText('Correo'), 'mesero@x.co')
  await userEvent.click(screen.getByRole('button', { name: 'Solicitar PIN' }))
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Revisa tu correo')
  expect(screen.getByText('mesero@x.co')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reenviar' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Volver a iniciar sesión' }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicio de empleado')
})

// Falla si el terminal vuelve a llamar «credenciales incorrectas» a lo que no lo es: con un turno caducado
// en la sesión de Odoo el POS decía eso con la contraseña correcta, y se buscaba el problema donde no estaba.
it('tells the real reason when the failure is not a wrong credential', async () => {
  hydrateAs(false)
  const login = jest.fn()
    .mockRejectedValueOnce(new OdooError('Inicia sesión con el PIN de tu empleado para continuar.', 'odoo.exceptions.AccessError'))
    .mockRejectedValueOnce(new OdooError('Wrong login/password', 'odoo.exceptions.AccessDenied'))
  useAuthStore.setState({ login })
  wrap()
  await userEvent.type(screen.getByLabelText('Correo'), 'admin')
  await userEvent.type(screen.getByLabelText('Contraseña'), 'admin')
  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Inicia sesión con el PIN de tu empleado para continuar.')

  await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos'))
})

// Falla si el dueño, con el dispositivo ya en un restaurante, no ve en qué restaurante está ni puede cambiarlo o ir a su
// consola desde la pantalla del PIN (antes solo se llegaba desde el selector de restaurante).
it('en la pantalla del PIN el dueño ve el restaurante, puede cambiarlo y entra a su consola', async () => {
  const owner = { id: 9, name: 'Dueña', code: null, role: 'owner' as const, shift: null }
  ;(listPosEmployees as jest.Mock).mockResolvedValue([demo, owner])
  const chooseRestaurant = jest.fn(async () => undefined)
  useAuthStore.setState({ hydrated: true, user: { uid: 2, name: 'Admin', companyId: 1, role: 'owner' }, session: null, employee: null, chooseRestaurant,
    restaurant: { id: 2, name: 'Laureles' }, restaurants: [{ id: 1, name: 'Poblado' }, { id: 2, name: 'Laureles' }] as never })
  wrap()
  expect(await screen.findByText('Este dispositivo: Laureles')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar de restaurante' }))
  expect(chooseRestaurant).toHaveBeenCalledWith(null)
  await userEvent.click(screen.getByRole('button', { name: 'Ir a la consola de la organización' }))
  expect(await screen.findByText('Consola de la organización: marca tu PIN de dueño.')).toBeInTheDocument()
  await waitFor(() => expect(listPosEmployees).toHaveBeenLastCalledWith(null))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Empleado' })).toHaveTextContent('Dueña'))
})
