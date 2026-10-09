import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { invitePerson, listPeople } from '@/lib/services/team'
// Falla si una invitación pendiente se muestra activa o se pierde el horario de la persona.
it('respeta el estado de acceso que devuelve el servidor', async () => {
 m.mockResolvedValue({ people: [
 { id: '1', name: 'Dueña', username: 'admin', email: '', role: 'owner', restaurant_ids: [], shift: null, status: 'active' },
 { id: '9', name: 'Nueva', username: 'nueva', email: 'nueva@x.co', role: 'waiter', restaurant_ids: ['1'], shift: { from: 14, to: 22 }, status: 'pending' },
 ] })
 const [admin, nueva] = await listPeople()
 expect(admin).toMatchObject({ username: 'admin', status: 'active' })
 expect(nueva).toMatchObject({ username: 'nueva', status: 'pending', configIds: [1], shift: { from: 14, to: 22 } })
})
// Falla si la invitación vuelve a mandar los restaurantes como texto: el servidor la rechaza con «Indica una lista de
// restaurantes.» y desde Equipo no se puede dar de alta a meseros, cajeros ni encargados.
it('invita con los restaurantes como números', async () => {
 m.mockResolvedValue({ person: { id: '9', name: 'Mateo Ruiz', username: 'mateo.ruiz', email: 'mateo@x.co', role: 'waiter', restaurant_ids: [2], shift: { from: 14, to: 22.5 }, status: 'pending' }, invite_sent: true })
 const result = await invitePerson({ name: 'Mateo Ruiz', username: 'mateo.ruiz', email: 'mateo@x.co', role: 'waiter', configIds: [2], shiftStart: 14, shiftEnd: 22.5, hourlyRate: null })
 expect(m).toHaveBeenCalledWith('team', { method: 'POST', body: expect.objectContaining({ role: 'waiter', restaurant_ids: [2] }) })
 expect(result).toEqual({ employee_id: 9, user_id: 9, invite_sent: true })
})
