import { currentConfigId, inRestaurant } from '@/lib/services/odoo'
import { useAuthStore } from '@/lib/stores/authStore'

afterEach(() => useAuthStore.setState({ session: null, restaurant: null }))

// Falla si las lecturas del POS dejan de limitarse al restaurante en uso (el dueño ve toda la empresa) o si, sin caja
// abierta, no se usa el restaurante del dispositivo (plan O).
it('filtra por el restaurante de la caja o, sin caja, por el del dispositivo', () => {
  expect(currentConfigId()).toBeNull()
  expect(inRestaurant([['state', '=', 'paid']])).toEqual([['state', '=', 'paid']])
  useAuthStore.setState({ restaurant: { id: 2, name: 'Laureles' } })
  expect(inRestaurant([['state', '=', 'paid']])).toEqual([['state', '=', 'paid'], ['config_id', '=', 2]])
  useAuthStore.setState({ session: { id: 9, configId: 3, state: 'opened' } })
  expect(currentConfigId()).toBe(3)
  expect(inRestaurant([], 'config_ids')).toEqual([['config_ids', '=', 3]])
})
