import { cartTotals, DEFAULT_INFO, newLine, toKitPayload } from '@/lib/domain/orderWizard'
import { coreFetch } from '@/lib/services/core/http'
import { createKitOrder } from '@/lib/services/orderCreate'
import { comboChildUuid } from '@/lib/services/productOptions'
import { coreOrder } from '@/lib/testFixtures/core'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
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

// Falla si un pedido creado sin conexión no queda como pedido de emergencia con número provisional, id negativo,
// hora real, el precio final sin duplicar impuestos y una nota que lo identifique en el servidor.
it('sin conexión registra el pedido de emergencia', async () => {
  const { useEmergencyOrders } = jest.requireActual('@/lib/offline/emergency') as typeof import('@/lib/offline/emergency')
  const { useOutboxStore } = jest.requireActual('@/lib/offline/outbox') as typeof import('@/lib/offline/outbox')
  const { CoreError } = jest.requireActual('@/lib/services/core/http') as typeof import('@/lib/services/core/http')
  localStorage.clear()
  useEmergencyOrders.setState({ orders: [], seq: {}, nextLocalId: -1, loaded: true })
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, loaded: true })
  jest.mocked(coreFetch).mockImplementation(async (path) => { if (String(path).startsWith('products')) return { products: [] } as never; throw new CoreError(0, 'unreachable', 'sin red') })
  const product = { id: 3, templateId: 3, name: 'Angus', price: 11900, categoryIds: [1], taxIds: [19], favorite: true, storable: false, soldOut: false, hasImage: true }
  const line = newLine(product, 1, '', [])
  const totals = cartTotals([line], [{ id: 19, name: 'IVA 19 %', amount: 19, amountType: 'percent', priceInclude: false }])
  const created = await createKitOrder(toKitPayload({ uuid: 'pedido-9', tableId: null, info: { ...DEFAULT_INFO, type: 'takeAway', name: 'Ana' }, note: '' }), [line], { ...totals, label: 'Ana' })
  expect(created).toMatchObject({ id: -1, trackingNumber: 'E-01', offline: true, total: 11900, tax: 1900 })
  const entry = useOutboxStore.getState().entries[0] as { body: { note: string; created_at: string } }
  expect(entry.body.note).toBe('Emergencia E-01')
  expect(Date.parse(entry.body.created_at)).not.toBeNaN()
  expect(useEmergencyOrders.getState().orders[0]).toMatchObject({ uuid: 'pedido-9', number: 'E-01', customer: 'Ana', total: 11900, tax: 1900,
    lines: [{ unitPrice: 11900, total: 11900 }] })
})

// Falla si la línea de emergencia conserva 3.015 aunque el total redondeado y el futuro pedido del servidor sean 3.03.
it('guarda los centavos de la unidad y de la línea igual que ventas', async () => {
  const { useEmergencyOrders } = jest.requireActual('@/lib/offline/emergency') as typeof import('@/lib/offline/emergency')
  const { useOutboxStore } = jest.requireActual('@/lib/offline/outbox') as typeof import('@/lib/offline/outbox')
  const { CoreError } = jest.requireActual('@/lib/services/core/http') as typeof import('@/lib/services/core/http')
  localStorage.clear()
  useEmergencyOrders.setState({ orders: [], seq: {}, nextLocalId: -1, loaded: true })
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, loaded: true })
  jest.mocked(coreFetch).mockImplementation(async (path) => { if (String(path).startsWith('products')) return { products: [] } as never; throw new CoreError(0, 'unreachable', 'sin red') })
  const line = newLine({ id: 4, templateId: 4, name: 'Porción', price: 1.005, categoryIds: [1], taxIds: [], favorite: false,
    storable: false, soldOut: false, hasImage: false }, 3, '', [])
  await createKitOrder(toKitPayload({ uuid: 'centavos-1', tableId: null, info: { ...DEFAULT_INFO, type: 'takeAway' }, note: '' }), [line],
    { ...cartTotals([line], []), label: '' })
  expect(useEmergencyOrders.getState().orders[0]).toMatchObject({ total: 3.03, lines: [{ uuid: line.uuid, qty: 3, unitPrice: 1.01, total: 3.03 }] })
})
