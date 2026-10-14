import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { getRestaurantInfo, saveRestaurantInfo } from '@/lib/services/restaurantInfo'
// Falla si el margen de acceso se pierde o se guarda negativo o con decimales.
it('lee y normaliza el margen de acceso del restaurante', async () => {
 m.mockResolvedValue({ restaurants: [{ id: '2', name: 'Laureles', street: '', city: '', phone: '', latitude: '', longitude: '', access_margin_minutes: 30 }] })
 const info = await getRestaurantInfo(2)
 expect(info.accessMargin).toBe(30)
 m.mockResolvedValue({ restaurant: {} })
 await saveRestaurantInfo({ ...info, accessMargin: 14.6 })
 expect(m).toHaveBeenLastCalledWith('restaurants/2', { method: 'PATCH', body: expect.objectContaining({ access_margin_minutes: 15 }) })
 await saveRestaurantInfo({ ...info, accessMargin: -5 })
 expect(m).toHaveBeenLastCalledWith('restaurants/2', { method: 'PATCH', body: expect.objectContaining({ access_margin_minutes: 0 }) })
})
