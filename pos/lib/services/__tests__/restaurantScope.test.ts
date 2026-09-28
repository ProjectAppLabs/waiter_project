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

// Falla si las pasarelas de administración del addon dejan de recibir el restaurante en uso (con varios, el addon
// rechaza la operación ambigua) o si se le añade a otras rutas.
it('manda el restaurante en uso a las pasarelas /waiter/admin', async () => {
  const { http, jsonRpc } = jest.requireActual<typeof import('@/lib/services/odoo')>('@/lib/services/odoo')
  const post = jest.spyOn(http, 'post').mockResolvedValue({ data: { jsonrpc: '2.0', id: 1, result: { ok: true } } })
  useAuthStore.setState({ restaurant: { id: 2, name: 'Laureles' } })
  await jsonRpc('/waiter/admin/menu_settings', { action: 'get' })
  expect(post.mock.calls[0][1]).toMatchObject({ params: { action: 'get', config_id: 2 } })
  await jsonRpc('/web/session/get_session_info', {})
  expect(post.mock.calls[1][1]).toMatchObject({ params: {} })
  expect((post.mock.calls[1][1] as { params: Record<string, unknown> }).params).not.toHaveProperty('config_id')
  post.mockRestore()
})
