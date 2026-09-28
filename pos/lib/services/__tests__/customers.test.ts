import { loyaltyCard } from '@/lib/services/customers'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const m = callKw as jest.Mock

// Falla si el panel del cliente muestra puntos de otra tarjeta o pierde el programa y el código del socio.
it('reads the loyalty card of the partner with the most points', async () => {
  m.mockResolvedValueOnce([{ id: 4, points: 12400, points_display: '12.400 puntos', code: '011852950', program_id: [2, 'Puntos Waiter'], expiration_date: false }])
  await expect(loyaltyCard(7)).resolves.toEqual({ id: 4, points: 12400, pointsDisplay: '12.400 puntos', code: '011852950', program: 'Puntos Waiter', expires: null })
  expect(m.mock.calls[0][2][0]).toEqual([['partner_id', '=', 7]])
  expect(m.mock.calls[0][3]).toMatchObject({ order: 'points desc', limit: 1 })
})

// Falla si un cliente sin tarjeta rompe el panel en vez de mostrar "sin tarjeta".
it('returns null when the partner has no card', async () => {
  m.mockResolvedValueOnce([])
  await expect(loyaltyCard(7)).resolves.toBeNull()
})
