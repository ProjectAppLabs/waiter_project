import { getRestaurantInfo, saveRestaurantInfo } from '@/lib/services/restaurantInfo'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn() }))
const rpc = callKw as jest.Mock

// Falla si el margen de acceso al turno no se lee del local (30 por defecto) o se guarda negativo o con decimales (plan P).
it('lee y guarda el margen de acceso al turno del local', async () => {
  rpc.mockResolvedValueOnce([{ id: 2, name: 'Laureles', waiter_street: false, waiter_city: false, waiter_phone: false, waiter_latitude: false, waiter_longitude: false }])
  const info = await getRestaurantInfo(2)
  expect(info.accessMargin).toBe(30)
  rpc.mockResolvedValueOnce(true)
  await saveRestaurantInfo({ ...info, accessMargin: 14.6 })
  expect(rpc).toHaveBeenLastCalledWith('pos.config', 'write', [[2], expect.objectContaining({ waiter_access_margin_minutes: 15 })])
  await saveRestaurantInfo({ ...info, accessMargin: -5 })
  expect(rpc).toHaveBeenLastCalledWith('pos.config', 'write', [[2], expect.objectContaining({ waiter_access_margin_minutes: 0 })])
})
