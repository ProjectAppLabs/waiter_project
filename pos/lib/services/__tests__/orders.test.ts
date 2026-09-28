import { createDraft, addProduct } from '@/lib/domain/order'
import { callKw } from '@/lib/services/odoo'
import { payOrder, saveOrder } from '@/lib/services/orders'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const mockCallKw = callKw as jest.Mock
const angus = { id: 3, templateId: 2, name: 'Angus', price: 36900, categoryIds: [1], taxIds: [5], favorite: false, storable: false, soldOut: false, hasImage: false }
const read = { id: 13, pos_reference: '260-1-000009', state: 'draft', amount_total: 87822, amount_tax: 14022, amount_paid: 0 }

beforeEach(() => mockCallKw.mockReset())

// Falla si saveOrder olvida recompute_prices: Odoo deja el pedido en total 0 (verificado en el mapeo).
it('calls sync_from_ui, then recompute_prices, then reads the totals', async () => {
  mockCallKw
    .mockResolvedValueOnce({ 'pos.order': [{ id: 13 }] })
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce([read])
  const saved = await saveOrder(addProduct(createDraft({ sessionId: 1, tableId: 6 }), angus))
  expect(mockCallKw.mock.calls.map((c) => c[1])).toEqual(['sync_from_ui', 'recompute_prices', 'read'])
  expect(saved).toEqual({ id: 13, reference: '260-1-000009', state: 'draft', total: 87822, tax: 14022, paid: 0 })
})

// Falla si un reintento manda id:-1 y crea un pedido duplicado en vez de reusar el server id.
it('reuses the server id on a second save of the same draft', async () => {
  mockCallKw.mockResolvedValue([read])
  mockCallKw.mockResolvedValueOnce({ 'pos.order': [{ id: 13 }] }).mockResolvedValueOnce(undefined)
  const draft = { ...addProduct(createDraft({ sessionId: 1, tableId: 6 }), angus), serverId: 13 }
  await saveOrder(draft)
  expect(mockCallKw.mock.calls[0][2][0][0].id).toBe(13)
})

// Falla si payOrder deja de mandar pos_order_id dentro del dict (Odoo crea el pago huérfano).
it('registers the payment with the order id inside the payment dict', async () => {
  mockCallKw.mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ ...read, amount_paid: 87822 }])
  const paid = await payOrder(13, 1, 87822)
  expect(mockCallKw.mock.calls[0]).toEqual(['pos.order', 'add_payment', [[13], { pos_order_id: 13, payment_method_id: 1, amount: 87822 }]])
  expect(paid.paid).toBe(87822)
})

