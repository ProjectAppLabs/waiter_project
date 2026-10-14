import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { listNotifications, markAllRead, markRead, requestIngredient } from '@/lib/services/notifications'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
// Falla si los avisos pierden su acción, lectura o fecha.
it('lee los avisos de la sesión propia', async () => {
 m.mockResolvedValue({ notifications: [{ id: '4', kind: 'inventory', title: 'Stock bajo', body: 'Salmón', action: 'request_ingredient', action_done: false, read: false, created_at: '2026-10-02T12:00:00Z' }] })
 expect((await listNotifications(7))[0]).toMatchObject({ id: 4, action: 'request_ingredient', read: false, at: '2026-10-02T12:00:00Z' })
 expect(m).toHaveBeenCalledWith('notifications?limit=50')
})
// Falla si marcar como leído solo cambia el dispositivo.
it('marca los avisos en el servidor', async () => {
 m.mockResolvedValue({ ok: true }); await markAllRead(); await markRead([4, 5])
 expect(m.mock.calls).toEqual([['notifications/read_all', { method: 'POST' }], ['notifications/4/read', { method: 'POST' }], ['notifications/5/read', { method: 'POST' }]])
})
// Falla si solicitar ingredientes usa otra sede o pierde la cantidad solicitada.
it('solicita el ingrediente en la sede activa', async () => {
 m.mockResolvedValue({ request: { id: 9, supplier_name: 'Proveedor', lines: [{ ingredient_id: 7, qty: 4 }] } })
 await expect(requestIngredient(7)).resolves.toMatchObject({ purchaseId: 9, partnerName: 'Proveedor', qty: 4 })
 expect(m).toHaveBeenCalledWith('inventory/requests', { method: 'POST', body: { restaurant_id: 1, ingredient_id: 7, qty: undefined } })
})
