import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { getNotifyPrefs, setNotifyPrefs, listPosEmployees, getEmployeeProfile } from '@/lib/services/employees'
// Falla si las preferencias se guardan para otra cuenta o se pierden los valores del servidor.
it('lee y guarda las preferencias de la cuenta conectada', async () => {
 m.mockResolvedValue({ prefs: { kitchen_sound: true } })
 await expect(getNotifyPrefs(7)).resolves.toEqual({ kitchen_sound: true })
 await setNotifyPrefs(7, { kitchen_sound: false })
 expect(m).toHaveBeenLastCalledWith('me/notify-prefs', { method: 'PUT', body: { prefs: { kitchen_sound: false } } })
})
// Falla si la lista de empleados incluye a otra sede o a quien no ha activado su cuenta, o si pierde su rol y turno.
it('lista a las personas activas del restaurante', async () => {
 m.mockResolvedValue({ people: [
  { id: '4', name: 'Sofía', role: 'waiter', restaurant_ids: ['1'], shift: { from: 8, to: 16 }, status: 'active' },
  { id: '5', name: 'Mateo', role: 'waiter', restaurant_ids: ['2'], shift: null, status: 'active' },
  { id: '6', name: 'Nueva', role: 'cashier', restaurant_ids: ['1'], shift: null, status: 'pending' },
 ] })
 await expect(listPosEmployees(1)).resolves.toEqual([{ id: 4, name: 'Sofía', code: null, role: 'waiter', shift: { from: 8, to: 16 } }])
 expect(m).toHaveBeenCalledWith('team')
})
// Falla si el perfil muestra datos de otra persona o pierde el correo, el rol o el turno de la sesión.
it('lee el perfil de la persona conectada', async () => {
 m.mockResolvedValue({ account: { id: '7', name: 'Laura', email: 'laura@x.co', role: 'admin', shift: { from: 10, to: 18 } } })
 await expect(getEmployeeProfile(7)).resolves.toMatchObject({ name: 'Laura', email: 'laura@x.co', accessRole: 'admin', shift: { from: 10, to: 18 } })
 await expect(getEmployeeProfile(8)).rejects.toMatchObject({ code: 'forbidden' })
})
