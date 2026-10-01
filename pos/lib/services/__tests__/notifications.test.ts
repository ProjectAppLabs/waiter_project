import { listNotifications, markAllRead, markRead, requestIngredient } from '@/lib/services/notifications'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const rpc = callKw as jest.Mock

beforeEach(() => rpc.mockReset())

// Falla si las notificaciones no salen de waiter.notification con los falsos de Odoo normalizados a null.
it('reads waiter.notification newest first and normalizes the Odoo falses', async () => {
  rpc.mockResolvedValueOnce([
    { id: 4, kind: 'inventory', title: 'Stock bajo', body: 'Salmón: quedan 1 kg', res_model: 'product.product', res_id: 7, action: 'request_ingredient', action_done: false, read: false, create_date: '2026-09-06 10:00:00' },
    { id: 3, kind: 'system', title: 'Aviso', body: false, res_model: false, res_id: false, action: false, action_done: false, read: true, create_date: '2026-09-06 09:00:00' },
  ])
  const items = await listNotifications()
  expect(rpc.mock.calls[0].slice(0, 2)).toEqual(['waiter.notification', 'search_read'])
  expect(rpc.mock.calls[0][3]).toMatchObject({ order: 'create_date desc, id desc' })
  expect(items[0]).toMatchObject({ id: 4, kind: 'inventory', resId: 7, action: 'request_ingredient' })
  expect(items[1]).toMatchObject({ body: '', resModel: null, resId: null, action: null, read: true })
})

// Falla si el encargado (que por regla ve los avisos de todos) recibe también los dirigidos a otra persona (plan P).
it('pide solo los avisos propios y los generales', async () => {
  rpc.mockResolvedValueOnce([])
  await listNotifications(7)
  expect(rpc.mock.calls[0][2][0]).toEqual(['|', ['user_id', '=', false], ['user_id', '=', 7]])
})

// Falla si marcar como leídas se resuelve en el dispositivo en vez de en el servidor.
it('marks read on the server', async () => {
  rpc.mockResolvedValue(true)
  await markAllRead()
  expect(rpc).toHaveBeenCalledWith('waiter.notification', 'waiter_mark_all_read', [])
  await markRead([4, 5])
  expect(rpc).toHaveBeenLastCalledWith('waiter.notification', 'waiter_mark_read', [[4, 5]])
})

// Falla si "Solicitar ingredientes" deja de crear la compra en el servidor o pierde el proveedor devuelto.
it('requestIngredient asks the server for the draft purchase', async () => {
  rpc.mockResolvedValueOnce({ purchase_id: 77, name: 'P00012', partner_id: 12, partner_name: 'Pesquera', product_qty: 19 })
  expect(await requestIngredient(7)).toEqual({ purchaseId: 77, name: 'P00012', partnerName: 'Pesquera', qty: 19 })
  expect(rpc).toHaveBeenCalledWith('waiter.notification', 'waiter_request_ingredient', [7, null])
})
