import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { addRound, cancelLines, listHistoryOrders, listKitOrders } from '@/lib/services/ordersKit'
import { coreOrder } from '@/lib/testFixtures/core'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
// Falla si Pedidos pierde el origen WhatsApp, teléfono o tipo de servicio.
it('conserva canal y cliente al listar pedidos', async () => {
 m.mockResolvedValue({ orders: [coreOrder({ service: 'takeout', channel: 'whatsapp', delivery_phone: '+573001234567' })] })
 expect((await listKitOrders(16, () => null))[0]).toMatchObject({ channel: 'whatsapp', phone: '+573001234567', type: 'takeout', state: 'draft' })
 expect(m).toHaveBeenCalledWith('orders?restaurant_id=1&state=open')
})
// Falla si el historial consulta pedidos abiertos o pierde la mesa del servidor.
it('consulta ventas con su mesa', async () => {
 m.mockResolvedValue({ orders: [coreOrder({ state: 'paid' })] })
 expect((await listHistoryOrders(() => null))[0]).toMatchObject({ tableNumber: 8, state: 'paid' })
 expect(m).toHaveBeenCalledWith('sales/orders?restaurant_id=1&limit=200')
})
// Falla si agregar ronda omite las notas o no envía el nuevo curso a cocina.
it('agrega las líneas y dispara el curso', async () => {
 const order = { order: coreOrder({ courses: [{ id: 115, index: 1, fired_at: '', preparation_at: null, ready_at: null, served_at: null }] }) }
 m.mockImplementation(async (path) => (String(path).startsWith('products') ? { products: [] } : order) as never)
 await expect(addRound(13, [{ uuid: 'u2', productId: 4, name: 'Papas', unitPrice: 8900, qty: 2, note: 'sin sal', taxIds: [55] }])).resolves.toBe(115)
 expect(m).toHaveBeenCalledWith('orders/13/lines', { method: 'POST', body: { lines: [{ uuid: 'u2', product_id: 4, qty: 2, note: 'sin sal' }], fire: true } })
})
// Falla si cancelar no delega la validación al servidor o envía una lista vacía.
it('cancela solo las líneas seleccionadas', async () => {
 m.mockResolvedValue({ order: coreOrder() }); await cancelLines(13, [229, 230]); await cancelLines(13, [])
 expect(m.mock.calls).toEqual([['orders/13/lines', { method: 'DELETE', body: { line_ids: [229, 230] } }]])
})
