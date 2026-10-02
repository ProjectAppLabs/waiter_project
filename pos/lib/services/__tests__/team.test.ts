import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { listPeople } from '@/lib/services/team'
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
