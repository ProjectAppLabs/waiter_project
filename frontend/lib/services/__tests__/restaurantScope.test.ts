import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { useAuthStore } from '@/lib/stores/authStore'
import { adminCall } from '@/lib/services/core/admin'
import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ coreFetch: jest.fn() }))
beforeEach(() => { jest.clearAllMocks(); useAuthStore.setState({ restaurant: null, restaurants: null, session: null }) })
// Falla si se pierde la prioridad de la caja, el dispositivo y la primera sede disponible.
it('resuelve el restaurante de trabajo', () => {
 expect(currentRestaurantId()).toBeNull()
 useAuthStore.setState({ restaurants: [{ id: 1, name: 'Primero' }] as never })
 expect(currentRestaurantId()).toBe(1)
 useAuthStore.setState({ restaurant: { id: 2, name: 'Laureles' } })
 expect(currentRestaurantId()).toBe(2)
 useAuthStore.setState({ session: { id: 9, configId: 3, state: 'opened' } })
 expect(currentRestaurantId()).toBe(3)
})
// Falla si la administración deja de enviar la sede seleccionada en su petición.
it('envía la sede a la administración del menú', async () => {
 useAuthStore.setState({ restaurant: { id: 2, name: 'Laureles' } })
 await adminCall('menu_settings', { action: 'get' })
 expect(coreFetch).toHaveBeenCalledWith('admin/menu_settings', { method: 'POST', body: { action: 'get', restaurant_id: 2 } })
})
