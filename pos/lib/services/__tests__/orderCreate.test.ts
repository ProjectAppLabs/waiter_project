import { DEFAULT_INFO, newLine, toKitPayload } from '@/lib/domain/orderWizard'
import { coreFetch } from '@/lib/services/core/http'
import { createKitOrder } from '@/lib/services/orderCreate'
import { comboChildUuid } from '@/lib/services/productOptions'
import { coreOrder } from '@/lib/testFixtures/core'

jest.mock('@/lib/services/core/http', () => ({ coreFetch: jest.fn() }))
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 2 }))
// Falla si el asistente pierde atributos, no arma los componentes del combo desde la carta o cambia sus identidades.
it('envía opciones y componentes del combo', async () => {
  const combo = { id: 3, kind: 'dish', diner_attributes: { combo: [{ producto: 18, cantidad: 1 }] } }
  jest.mocked(coreFetch).mockImplementation(async (path) => (String(path).startsWith('products') ? { products: [combo] } : { order: coreOrder() }) as never)
  const product = { id: 3, templateId: 3, name: 'Angus', price: 36900, categoryIds: [1], taxIds: [55], favorite: true, storable: false, soldOut: false, hasImage: true }
  const line = newLine(product, 2, 'sin cebolla', [
    { id: 2, name: 'BBQ', priceExtra: 2000, kind: 'attribute', groupId: 1, productId: null, taxIds: [] },
  ])
  await createKitOrder(toKitPayload({ uuid: 'pedido-1', tableId: 9, info: { ...DEFAULT_INFO, name: ' Ana ' }, note: 'Silla de bebé' }), [line])
  expect(coreFetch).toHaveBeenCalledWith('orders', { method: 'POST', body: expect.objectContaining({ restaurant_id: 2, uuid: 'pedido-1', table_id: 9, customer_name: 'Ana', note: 'Silla de bebé', fire: false,
    lines: [{ uuid: line.uuid, product_id: 3, qty: 2, note: 'sin cebolla', options: [{ group: 'attribute', name: 'BBQ', price_extra: 2000 }], children: [{ uuid: comboChildUuid(line.uuid, 18), product_id: 18, qty: 2 }] }],
  }) })
})
