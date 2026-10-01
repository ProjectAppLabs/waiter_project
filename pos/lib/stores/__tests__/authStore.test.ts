import { endShift, findOpenAttendance, readEmployee, startMyShift } from '@/lib/services/employees'
import { currentUser, getOpenSession, login, logout } from '@/lib/services/session'
import { activeEmployeeId, ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { listRestaurants } from '@/lib/services/restaurants'

jest.mock('@/lib/services/employees', () => ({ endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn(), startMyShift: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))
jest.mock('@/lib/services/restaurants', () => ({ listRestaurants: jest.fn().mockResolvedValue([{ id: 1, name: 'Poblado' }]) }))

const SOFIA = { id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter' as const, shift: { from: 8, to: 16 }, userId: null }

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); useAuthStore.setState({ user: null, session: null, employee: null, restaurant: null, restaurants: null, hydrated: false }); jest.mocked(listRestaurants).mockResolvedValue([{ id: 1, name: 'Poblado' }] as never)
  jest.mocked(startMyShift).mockResolvedValue({ ok: true, employee: SOFIA, attendanceId: 9, token: 'tok-demo', sessionEnds: '2026-09-07T22:30:00Z', configIds: [1] }) })

// Falla si entrar con la cuenta propia no abre el turno en el mismo paso, pierde la asistencia o el fin de la sesión,
// o no deja al empleado firmando los pedidos (plan P: ya no hay PIN).
it('login opens the shift of the signed-in account and remembers the employee', async () => {
  ;(login as jest.Mock).mockResolvedValue({ uid: 5, name: 'Sofía', companyId: 1, role: 'waiter' })
  ;(findOpenAttendance as jest.Mock).mockResolvedValue({ id: 9, checkIn: '2026-09-07 12:00:00' })
  ;(getOpenSession as jest.Mock).mockResolvedValue({ id: 16, configId: 1, state: 'opened' })
  await useAuthStore.getState().login('sofia.mesera', 'secreta-123')
  expect(startMyShift).toHaveBeenCalledWith(1)
  expect(useAuthStore.getState().employee).toMatchObject({ id: 2, code: 'WT-0001', checkIn: '2026-09-07T12:00:00.000Z', attendanceId: 9, token: 'tok-demo', sessionEnds: '2026-09-07T22:30:00Z' })
  expect(JSON.parse(localStorage.getItem('waiter.employee') ?? '{}')).toMatchObject({ id: 2, sessionEnds: '2026-09-07T22:30:00Z' })
  expect(activeEmployeeId()).toBe(2)
})

// Falla si una persona fuera de su turno queda con la sesión de Odoo abierta o sin saber cuál es su horario.
it('login outside the shift closes the Odoo session and explains the window', async () => {
  ;(login as jest.Mock).mockResolvedValue({ uid: 5, name: 'Sofía', companyId: 1, role: 'waiter' })
  jest.mocked(startMyShift).mockResolvedValue({ ok: false, reason: 'outside_hours', window: '14:00–22:00' })
  const failure = useAuthStore.getState().login('sofia.mesera', 'secreta-123')
  await expect(failure).rejects.toBeInstanceOf(ShiftDeniedError)
  await expect(failure).rejects.toThrow('14:00–22:00')
  expect(logout).toHaveBeenCalled()
  expect(useAuthStore.getState().user).toBeNull()
  expect(useAuthStore.getState().employee).toBeNull()
})

// Falla si «Cerrar sesión» deja abierta la sesión de Odoo: la siguiente persona de la tablet entraría con la cuenta anterior.
it('logout ends the shift and the Odoo session', async () => {
  useAuthStore.setState({ user: { uid: 5, name: 'Sofía', companyId: 1, role: 'waiter' }, employee: { ...SOFIA, checkIn: '', attendanceId: 4, token: 'tok-demo', sessionEnds: null } })
  ;(endShift as jest.Mock).mockResolvedValue({ ok: true, attendanceId: 4, workedHours: 4 })
  await useAuthStore.getState().logout()
  expect(endShift).toHaveBeenCalledWith(2, 'tok-demo')
  expect(logout).toHaveBeenCalled()
  expect(useAuthStore.getState().user).toBeNull()
  expect(localStorage.getItem('waiter.employee')).toBeNull()
})

// Falla si cerrar sesión no cierra el turno en el servidor (`waiter_end_shift`) o deja al empleado en el dispositivo.
it('endShift closes the shift on the server and clears the employee', async () => {
  useAuthStore.setState({ employee: { ...SOFIA, checkIn: '', attendanceId: 4, token: 'tok-demo', sessionEnds: null } })
  ;(endShift as jest.Mock).mockResolvedValue({ ok: true, attendanceId: 4, workedHours: 4.25 })
  await useAuthStore.getState().endShift()
  expect(endShift).toHaveBeenCalledWith(2, 'tok-demo')
  expect(useAuthStore.getState().employee).toBeNull()
  expect(localStorage.getItem('waiter.employee')).toBeNull()
})

// Falla si hidratar con sesión de Odoo no recupera al empleado guardado en el dispositivo.
it('hydrate restores the stored employee with its open attendance', async () => {
  localStorage.setItem('waiter.employee', JSON.stringify({ id: 2, checkIn: '2026-09-07T10:00:00.000Z', token: 'tok-demo' }))
  ;(currentUser as jest.Mock).mockResolvedValue({ uid: 2, name: 'Admin', companyId: 1, role: 'admin' })
  ;(getOpenSession as jest.Mock).mockResolvedValue({ id: 16, configId: 1, state: 'opened' })
  ;(readEmployee as jest.Mock).mockResolvedValue({ id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter', shift: null })
  ;(findOpenAttendance as jest.Mock).mockResolvedValue({ id: 9, checkIn: '2026-09-07 12:00:00' })
  await useAuthStore.getState().hydrate()
  expect(useAuthStore.getState().employee).toMatchObject({ id: 2, name: 'Sofía Mesera', checkIn: '2026-09-07T12:00:00.000Z', attendanceId: 9, token: 'tok-demo' })
  expect(useAuthStore.getState().hydrated).toBe(true)
})

// Falla si con varios restaurantes el dispositivo no recuerda el suyo, si con uno solo no lo elige, o si la caja que
// muestra no es la de su restaurante (plan O).
it('elige el restaurante del dispositivo y busca su caja', async () => {
  ;(currentUser as jest.Mock).mockResolvedValue({ uid: 2, name: 'Dueña', companyId: 1, role: 'owner' })
  ;(getOpenSession as jest.Mock).mockResolvedValue(null)
  jest.mocked(listRestaurants).mockResolvedValue([{ id: 1, name: 'Poblado' }, { id: 2, name: 'Laureles' }] as never)
  await useAuthStore.getState().hydrate()
  expect(useAuthStore.getState().restaurant).toBeNull()
  expect(getOpenSession).toHaveBeenLastCalledWith(null)
  localStorage.setItem('waiter.device-restaurant', JSON.stringify({ id: 2, name: 'Laureles' }))
  await useAuthStore.getState().hydrate()
  expect(useAuthStore.getState().restaurant).toEqual({ id: 2, name: 'Laureles' })
  expect(getOpenSession).toHaveBeenLastCalledWith(2)
  localStorage.clear()
  jest.mocked(listRestaurants).mockResolvedValue([{ id: 1, name: 'Poblado' }] as never)
  await useAuthStore.getState().hydrate()
  expect(useAuthStore.getState().restaurant).toEqual({ id: 1, name: 'Poblado' })
})

// Falla si el encargado que cambia de restaurante pierde su turno: es la misma persona con su propia cuenta (plan P).
it('cambiar de restaurante conserva el turno y busca la caja del nuevo', async () => {
  ;(getOpenSession as jest.Mock).mockResolvedValue({ id: 30, configId: 2, state: 'opened' })
  useAuthStore.setState({ restaurant: { id: 1, name: 'Poblado' }, employee: { ...SOFIA, role: 'admin', checkIn: '', attendanceId: 4, token: 'tok', sessionEnds: null } })
  await useAuthStore.getState().chooseRestaurant({ id: 2, name: 'Laureles' })
  expect(useAuthStore.getState().employee).toMatchObject({ id: 2 })
  expect(useAuthStore.getState().session).toEqual({ id: 30, configId: 2, state: 'opened' })
  expect(JSON.parse(localStorage.getItem('waiter.device-restaurant') ?? 'null')).toEqual({ id: 2, name: 'Laureles' })
})
