import * as core from '@/lib/services/core/pos'
import { CoreError } from '@/lib/services/core/http'
import { getOpenSession, logout } from '@/lib/services/session'
import { activeEmployeeId, ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'

jest.mock('@/lib/services/core/pos', () => ({ login: jest.fn(), me: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ getOpenSession: jest.fn(), logout: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))
const result: core.LoginResult = { account: { id: '2', name: 'Sofía', username: 'sofia', email: null, role: 'waiter', restaurant_ids: ['1'], shift: { from: 8, to: 16 } }, attendance_id: '9', session_ends: '2026-10-02T22:30:00Z', restaurants: [{ id: '1', name: 'Poblado' }] }
beforeEach(() => {
 localStorage.clear(); jest.clearAllMocks()
 useAuthStore.setState({ user: null, session: null, employee: null, restaurant: null, restaurants: null, hydrated: false })
 jest.mocked(core.login).mockResolvedValue(result); jest.mocked(core.me).mockResolvedValue(result)
 jest.mocked(getOpenSession).mockResolvedValue({ id: 16, configId: 1, state: 'opened' })
})
// Falla si entrar pierde la asistencia, el fin del turno o la persona que firma los pedidos.
it('inicia sesión y recupera la caja de la persona', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 expect(core.login).toHaveBeenCalledWith('sofia', 'secreta-123')
 expect(useAuthStore.getState().employee).toMatchObject({ id: 2, attendanceId: 9, sessionEnds: result.session_ends })
 expect(getOpenSession).toHaveBeenCalledWith(1); expect(activeEmployeeId()).toBe(2)
 expect(localStorage.getItem('waiter.employee')).toBeNull()
})
// Falla si una persona fuera de horario queda autenticada o no conoce su ventana de acceso.
it('explica el rechazo por horario', async () => {
 jest.mocked(core.login).mockRejectedValue(new CoreError(403, 'outside_hours', 'Fuera de horario', { window: '14:00–22:00' }))
 const failure = useAuthStore.getState().login('sofia', 'secreta-123')
 await expect(failure).rejects.toBeInstanceOf(ShiftDeniedError)
 await expect(failure).rejects.toThrow('14:00–22:00')
 expect(useAuthStore.getState().user).toBeNull(); expect(useAuthStore.getState().employee).toBeNull()
})
// Falla si cerrar sesión conserva la cuenta anterior en el dispositivo o no llama al servidor.
it('cierra sesión y limpia la identidad local', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 await useAuthStore.getState().logout()
 expect(logout).toHaveBeenCalled(); expect(activeEmployeeId()).toBeNull(); expect(useAuthStore.getState().user).toBeNull()
})
// Falla si una recarga confía en una identidad guardada en vez de consultar la cookie propia.
it('hidrata la cuenta desdel servidor', async () => {
 await useAuthStore.getState().hydrate()
 expect(core.me).toHaveBeenCalled()
 expect(useAuthStore.getState()).toMatchObject({ hydrated: true, employee: { id: 2, attendanceId: 9 }, session: { id: 16 } })
})
// Falla si la sesión vencida deja datos de la persona anterior visibles.
it('limpia la sesión al fallar la hidratación', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 jest.mocked(core.me).mockRejectedValue(new CoreError(401, 'unauthenticated', 'Inicia sesión'))
 await useAuthStore.getState().hydrate()
 expect(useAuthStore.getState()).toMatchObject({ hydrated: true, user: null, employee: null, session: null })
})
// Falla si con varias sedes se escoge una sin preguntar o se pierde la elección del dispositivo.
it('recuerda la sede elegida y consulta su caja', async () => {
 jest.mocked(core.me).mockResolvedValue({ ...result, restaurants: [...result.restaurants, { id: '2', name: 'Laureles' }] })
 await useAuthStore.getState().hydrate()
 expect(useAuthStore.getState().restaurant).toBeNull(); expect(getOpenSession).not.toHaveBeenCalled()
 localStorage.setItem('waiter.device-restaurant', JSON.stringify({ id: 2, name: 'Laureles' }))
 await useAuthStore.getState().hydrate()
 expect(useAuthStore.getState().restaurant).toEqual({ id: 2, name: 'Laureles' }); expect(getOpenSession).toHaveBeenLastCalledWith(2)
})
// Falla si cambiar de sede pierde el turno de la misma persona.
it('cambia de restaurante conservando a la persona', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 jest.mocked(getOpenSession).mockResolvedValue({ id: 30, configId: 2, state: 'opened' })
 await useAuthStore.getState().chooseRestaurant({ id: 2, name: 'Laureles' })
 expect(activeEmployeeId()).toBe(2); expect(useAuthStore.getState().session?.id).toBe(30)
})
