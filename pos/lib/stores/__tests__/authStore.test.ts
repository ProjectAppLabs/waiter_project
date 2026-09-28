import { endShift, findOpenAttendance, readEmployee } from '@/lib/services/employees'
import { currentUser, getOpenSession } from '@/lib/services/session'
import { activeEmployeeId, useAuthStore } from '@/lib/stores/authStore'
import { listRestaurants } from '@/lib/services/restaurants'

jest.mock('@/lib/services/employees', () => ({ endShift: jest.fn(), findOpenAttendance: jest.fn(), readEmployee: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ currentUser: jest.fn(), getOpenSession: jest.fn(), login: jest.fn(), logout: jest.fn() }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))
jest.mock('@/lib/services/restaurants', () => ({ listRestaurants: jest.fn().mockResolvedValue([{ id: 1, name: 'Poblado' }]) }))

const SOFIA = { id: 2, name: 'Sofía Mesera', code: 'WT-0001', role: 'waiter' as const, shift: { from: 8, to: 16 }, userId: null }

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); useAuthStore.setState({ user: null, session: null, employee: null, restaurant: null, restaurants: null, hydrated: false }); jest.mocked(listRestaurants).mockResolvedValue([{ id: 1, name: 'Poblado' }] as never) })

// Falla si iniciar turno pierde la asistencia que abrió `waiter_check_pin`, no recuerda al empleado o no lo expone a los pedidos.
it('startShift keeps the attendance opened by the server and remembers the employee', async () => {
  ;(findOpenAttendance as jest.Mock).mockResolvedValue({ id: 9, checkIn: '2026-09-07 12:00:00' })
  await useAuthStore.getState().startShift(SOFIA, 9, 'tok-demo')
  expect(useAuthStore.getState().employee).toMatchObject({ id: 2, code: 'WT-0001', checkIn: '2026-09-07T12:00:00.000Z', attendanceId: 9, token: 'tok-demo' })
  expect(JSON.parse(localStorage.getItem('waiter.employee') ?? '{}')).toMatchObject({ id: 2 })
  expect(activeEmployeeId()).toBe(2)
})

// Falla si cerrar sesión no cierra el turno en el servidor (`waiter_end_shift`) o deja al empleado en el dispositivo.
it('endShift closes the shift on the server and clears the employee', async () => {
  useAuthStore.setState({ employee: { ...SOFIA, checkIn: '', attendanceId: 4, token: 'tok-demo' } })
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

// Falla si cambiar de restaurante deja iniciado el turno de un empleado del otro restaurante.
it('cambiar de restaurante suelta al empleado del anterior', async () => {
  ;(getOpenSession as jest.Mock).mockResolvedValue({ id: 30, configId: 2, state: 'opened' })
  useAuthStore.setState({ restaurant: { id: 1, name: 'Poblado' }, employee: { ...SOFIA, checkIn: '', attendanceId: 4, token: 'tok' } })
  await useAuthStore.getState().chooseRestaurant({ id: 2, name: 'Laureles' })
  expect(useAuthStore.getState().employee).toBeNull()
  expect(useAuthStore.getState().session).toEqual({ id: 30, configId: 2, state: 'opened' })
  expect(JSON.parse(localStorage.getItem('waiter.device-restaurant') ?? 'null')).toEqual({ id: 2, name: 'Laureles' })
})
