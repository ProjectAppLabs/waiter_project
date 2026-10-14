import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { loyaltyCard } from '@/lib/services/customers'
// Falla si el panel pierde la tarjeta, su programa o su saldo.
it('lee la tarjeta del cliente solicitado', async () => {
 m.mockResolvedValue({ card: { id: 4, points: 12400, code: '01185295', program: 'Puntos Waiter', expires: null } })
 await expect(loyaltyCard(7)).resolves.toMatchObject({ id: 4, points: 12400, code: '01185295', program: 'Puntos Waiter', expires: null })
 expect(m).toHaveBeenCalledWith('customers/7/card')
})
// Falla si un cliente sin tarjeta rompe el panel.
it('devuelve null sin tarjeta', async () => {
 m.mockResolvedValue({ card: null }); await expect(loyaltyCard(7)).resolves.toBeNull()
})
