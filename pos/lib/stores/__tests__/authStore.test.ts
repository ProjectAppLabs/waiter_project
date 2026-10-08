import * as core from '@/lib/services/core/pos'
import { CoreError, coreFetch } from '@/lib/services/core/http'
import { recall, remember } from '@/lib/offline/cache'
import { enterSupport } from '@/lib/services/core/support'
import { openRegister } from '@/lib/services/cashRegister'
import { getOpenSession, logout } from '@/lib/services/session'
import { activeEmployeeId, ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { useBusStore } from '@/lib/stores/busStore'

jest.mock('@/lib/services/core/pos', () => ({ login: jest.fn(), me: jest.fn() }))
jest.mock('@/lib/services/session', () => ({ getOpenSession: jest.fn(), logout: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/services/cashRegister', () => ({ openRegister: jest.fn() }))
jest.mock('@/lib/services/core/support', () => ({ enterSupport: jest.fn() }))
const result: core.LoginResult = { account: { id: '2', name: 'Sofía', username: 'sofia', email: null, role: 'waiter', restaurant_ids: ['1'], shift: { from: 8, to: 16 } }, attendance_id: '9', session_ends: '2026-10-02T22:30:00Z', restaurants: [{ id: '1', name: 'Poblado' }] }
const nextResult: core.LoginResult = { ...result, account: { ...result.account, id: '3', name: 'Mateo', username: 'mateo' }, attendance_id: '10' }
const originalFetch = global.fetch
function deferred<T>() {
 let resolve!: (value: T) => void
 let reject!: (error: Error) => void
 const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
 return { promise, resolve, reject }
}
beforeEach(() => {
 localStorage.clear(); jest.resetAllMocks()
 process.env.NEXT_PUBLIC_DEFAULT_ORG = 'burger-house'
 useAuthStore.setState({ user: null, session: null, employee: null, restaurant: null, restaurants: null, modules: null, restaurantModules: null, support: null, hydrated: false })
 jest.mocked(core.login).mockResolvedValue(result); jest.mocked(core.me).mockResolvedValue(result)
 jest.mocked(getOpenSession).mockResolvedValue({ id: 16, configId: 1, state: 'opened' })
 jest.mocked(logout).mockResolvedValue(undefined)
 jest.mocked(enterSupport).mockResolvedValue(result)
})
afterEach(() => { jest.restoreAllMocks(); global.fetch = originalFetch })
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
it('hidrata la cuenta desde el servidor', async () => {
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

// Falla si cambiar rápido de sede aplica la respuesta anterior o quita la caja actual mientras llega la elegida.
it('conserva la caja hasta resolver la última sede elegida', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 const first = deferred<Awaited<ReturnType<typeof getOpenSession>>>()
 const last = deferred<Awaited<ReturnType<typeof getOpenSession>>>()
 jest.mocked(getOpenSession).mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise)
 const previous = useAuthStore.getState().chooseRestaurant({ id: 2, name: 'Laureles' })
 const latest = useAuthStore.getState().chooseRestaurant({ id: 3, name: 'Centro' })
 first.resolve({ id: 20, configId: 2, state: 'opened' })
 await previous
 expect(useAuthStore.getState()).toMatchObject({ restaurant: { id: 1 }, session: { id: 16 } })
 last.resolve({ id: 30, configId: 3, state: 'opened' })
 await latest
 expect(useAuthStore.getState()).toMatchObject({ restaurant: { id: 3 }, session: { id: 30 } })
})

// Falla si la espera del cierre remoto mantiene la identidad, la caja o la conexión vivas en el dispositivo.
it('sale localmente antes de que el servidor termine de cerrar la sesión', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 remember('auth/me', JSON.stringify(result))
 const remote = deferred<void>()
 jest.mocked(logout).mockReturnValueOnce(remote.promise)
 const stop = jest.spyOn(useBusStore.getState(), 'stop')
 const closing = useAuthStore.getState().logout()
 expect(useAuthStore.getState()).toMatchObject({ hydrated: true, user: null, employee: null, session: null, restaurant: null, restaurants: null, modules: null, support: null })
 expect(recall('auth/me')).toBeNull()
 expect(stop).toHaveBeenCalledTimes(1)
 remote.resolve()
 await closing
})

// Falla si la recarga offline revive una identidad anterior tras una salida cuyo cierre remoto falló, o pierde la cola.
it('la sesión offline sigue vigente hasta salir y no se restaura si falla el logout', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 remember('auth/me', JSON.stringify(result))
 localStorage.setItem('waiter.outbox:burger-house', '{"entries":[{"id":"pedido-pendiente"}]}')
 global.fetch = jest.fn().mockRejectedValue(new TypeError('Sin red'))
 jest.mocked(core.me).mockImplementation(() => coreFetch<core.LoginResult>('auth/me'))
 await useAuthStore.getState().hydrate()
 expect(activeEmployeeId()).toBe(2)
 jest.mocked(logout).mockRejectedValueOnce(new TypeError('Sin red'))
 await useAuthStore.getState().logout()
 useAuthStore.setState({ hydrated: false })
 await useAuthStore.getState().hydrate()
 expect(useAuthStore.getState()).toMatchObject({ hydrated: true, user: null, employee: null, session: null })
 expect(recall('auth/me')).toBeNull()
 expect(localStorage.getItem('waiter.outbox:burger-house')).toBe('{"entries":[{"id":"pedido-pendiente"}]}')
 expect(core.me).toHaveBeenCalledTimes(1)
})

// Falla si auth/me termina después de salir y vuelve a restaurar a la persona, su asistencia o su caja.
it('una hidratación pendiente no reactiva la sesión después de salir', async () => {
 const remote = deferred<core.LoginResult>()
 jest.mocked(core.me).mockReturnValueOnce(remote.promise)
 const hydration = useAuthStore.getState().hydrate()
 await useAuthStore.getState().logout()
 remote.resolve(result)
 await hydration
 expect(useAuthStore.getState()).toMatchObject({ user: null, employee: null, session: null, restaurants: null })
 expect(getOpenSession).not.toHaveBeenCalled()
})

// Falla si la consulta de caja de una hidratación antigua completa después de salir y devuelve la identidad al POS.
it('no restaura una hidratación cuya caja terminó después del logout', async () => {
 const remote = deferred<Awaited<ReturnType<typeof getOpenSession>>>()
 jest.mocked(getOpenSession).mockReturnValueOnce(remote.promise)
 const hydration = useAuthStore.getState().hydrate()
 await Promise.resolve()
 expect(getOpenSession).toHaveBeenCalledWith(1)
 await useAuthStore.getState().logout()
 remote.resolve({ id: 16, configId: 1, state: 'opened' })
 await hydration
 expect(useAuthStore.getState()).toMatchObject({ user: null, employee: null, session: null, restaurants: null })
})

// Falla si un inicio de sesión o acceso de soporte pendiente vuelve a entrar después de que la persona salió.
it.each(['login', 'enterSupport'] as const)('descarta %s cuando su respuesta llega después de salir', async (action) => {
 const remote = deferred<core.LoginResult>()
 if (action === 'login') jest.mocked(core.login).mockReturnValueOnce(remote.promise)
 else jest.mocked(enterSupport).mockReturnValueOnce(remote.promise)
 const access = action === 'login' ? useAuthStore.getState().login('sofia', 'secreta-123') : useAuthStore.getState().enterSupport('token')
 await useAuthStore.getState().logout()
 remote.resolve(result)
 await access
 await useAuthStore.getState().hydrate()
 expect(useAuthStore.getState()).toMatchObject({ user: null, employee: null, session: null, restaurants: null })
 expect(getOpenSession).not.toHaveBeenCalled()
 expect(core.me).not.toHaveBeenCalled()
})

// Falla si una respuesta de actualización pendiente deja una caja o una persona activas después de salir.
it.each(['refreshSession', 'chooseRestaurant', 'openRegister', 'renewShift'] as const)('descarta %s pendiente después de salir', async (action) => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 const box = deferred<Awaited<ReturnType<typeof getOpenSession>>>()
 const person = deferred<core.LoginResult>()
 jest.mocked(getOpenSession).mockReturnValueOnce(box.promise)
 jest.mocked(openRegister).mockReturnValueOnce(box.promise as ReturnType<typeof openRegister>)
 jest.mocked(core.me).mockReturnValueOnce(person.promise)
 const state = useAuthStore.getState()
 const pending = action === 'chooseRestaurant' ? state.chooseRestaurant({ id: 2, name: 'Laureles' })
   : action === 'openRegister' ? state.openRegister(1, 0, '') : state[action]()
 await state.logout()
 box.resolve({ id: 30, configId: 1, state: 'opened' })
 person.resolve(result)
 await pending
 expect(useAuthStore.getState()).toMatchObject({ user: null, employee: null, session: null, restaurant: null })
})

// Falla si una hidratación antigua que falla borra la cuenta nueva que ya entró.
it('un error de la hidratación anterior no borra un acceso más reciente', async () => {
 const remote = deferred<core.LoginResult>()
 jest.mocked(core.me).mockReturnValueOnce(remote.promise)
 const hydration = useAuthStore.getState().hydrate()
 jest.mocked(core.login).mockResolvedValueOnce(nextResult)
 await useAuthStore.getState().login('mateo', 'secreta-123')
 remote.reject(new CoreError(401, 'unauthenticated', 'Inicia sesión'))
 await hydration
 expect(activeEmployeeId()).toBe(3)
 expect(useAuthStore.getState().user?.name).toBe('Mateo')
})

// Falla si cambiar de cuenta conserva lecturas personales anteriores o pierde operaciones pendientes del restaurante.
it('cambiar de cuenta en la misma organización invalida las lecturas anteriores y conserva la cola', async () => {
 await useAuthStore.getState().login('sofia', 'secreta-123')
 remember('auth/me', JSON.stringify(result))
 remember('notifications', '{"notifications":[{"id":7}]}')
 localStorage.setItem('waiter.outbox:burger-house', '{"entries":[{"id":"pedido-pendiente"}]}')
 jest.mocked(core.login).mockResolvedValueOnce(nextResult)
 await useAuthStore.getState().login('mateo', 'secreta-123')
 expect(activeEmployeeId()).toBe(3)
 expect(recall('auth/me')).toBeNull()
 expect(recall('notifications')).toBeNull()
 expect(localStorage.getItem('waiter.outbox:burger-house')).toBe('{"entries":[{"id":"pedido-pendiente"}]}')
})
