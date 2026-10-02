import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { getOpenSession } from '@/lib/services/session'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
// Falla si se inventa una caja cuando el servidor no tiene ninguna abierta.
it('devuelve null sin caja abierta', async () => {
 m.mockResolvedValue({ shift: null }); await expect(getOpenSession()).resolves.toBeNull()
 expect(m).toHaveBeenCalledWith('shifts/open?restaurant_id=1')
})
// Falla si consultar una caja crea otra o pierde la sede.
it('recupera la caja existente sin abrir otra', async () => {
 m.mockResolvedValue({ shift: { id: 4, restaurant_id: 2, state: 'open' } })
 await expect(getOpenSession(2)).resolves.toEqual({ id: 4, configId: 2, state: 'opened' })
 expect(m.mock.calls).toEqual([['shifts/open?restaurant_id=2']])
})
