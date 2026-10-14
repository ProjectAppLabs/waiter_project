import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
// Responde la carta (para los combos) y el pedido.
const respond = (order: unknown) => m.mockImplementation(async (path) => (String(path).startsWith('products') ? { products: [] } : order) as never)
import { createDraft, addProduct } from '@/lib/domain/order'
import { payOrder, saveOrder } from '@/lib/services/orders'
import { coreOrder } from '@/lib/testFixtures/core'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
const angus = { id: 3, templateId: 3, name: 'Angus', price: 36900, categoryIds: [1], taxIds: [5], favorite: false, storable: false, soldOut: false, hasImage: false }
// Falla si el pedido usa totales del dispositivo o pierde la sede y la mesa.
it('guarda y devuelve los totales calculados por el servidor', async () => {
 respond({ order: coreOrder() })
 const saved = await saveOrder(addProduct(createDraft({ sessionId: 1, tableId: 6 }), angus))
 expect(saved).toMatchObject({ id: 13, total: 73800, tax: 5800, paid: 20000 })
 expect(m).toHaveBeenCalledWith('orders', { method: 'POST', body: expect.objectContaining({ restaurant_id: 1, table_id: 6, fire: false, lines: [expect.objectContaining({ product_id: 3, qty: 1 })] }) })
})
// Falla si un reintento cambia el UUID y duplica el pedido.
it('conserva la identidad al guardar de nuevo', async () => {
 respond({ order: coreOrder() })
 const draft = { ...addProduct(createDraft({ sessionId: 1, tableId: 6 }), angus), serverId: 13 }
 await saveOrder(draft); await saveOrder(draft)
 expect(m.mock.calls.filter(([path]) => path === 'orders').map(([, o]) => (o?.body as { uuid: string }).uuid)).toEqual([draft.uuid, draft.uuid])
})
// Falla si el pago pierde el pedido, el efectivo recibido o su clave de idempotencia.
it('registra el pago contra el pedido', async () => {
 m.mockResolvedValue({ order: coreOrder({ paid: 73800 }) })
 await expect(payOrder(13, 1, 73800, 80000)).resolves.toMatchObject({ paid: 73800 })
 expect(m).toHaveBeenCalledWith('orders/13/payments', { method: 'POST', body: expect.objectContaining({ method_id: 1, amount: 73800, received: 80000, request_key: expect.stringMatching(/^pay-13-/) }) })
})
