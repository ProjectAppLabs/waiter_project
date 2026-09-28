import { readPayableOrder } from '@/lib/services/paymentKit'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const mockCallKw = callKw as jest.Mock

// Falla si el cajero no puede leer para cobrar un pedido que no se compuso en su dispositivo: es lo normal,
// porque lo toma el mesero en Mesas o el propio comensal. Cobertura heredada de `getOrderLines`, que servía
// al cobro desde Mesas y se retiró con él.
it('reads an order that was composed on another device, with its lines and what is already paid', async () => {
  mockCallKw
    .mockResolvedValueOnce([{ id: 13, pos_reference: 'Order 13', tracking_number: '13', preset_id: [1, 'Dine In'],
      floating_order_name: 'Zahir', table_id: [9, 'A8'], date_order: '2026-09-23 01:00:00',
      amount_total: 87822, amount_tax: 0, amount_paid: 20000 }])
    .mockResolvedValueOnce([{ uuid: 'l1', full_product_name: 'Hamburguesa Angus', qty: 2, price_unit: 36900,
      price_subtotal_incl: 73800, customer_note: false, combo_parent_id: false, discount: 0 }])
  const order = await readPayableOrder(13)
  expect(mockCallKw.mock.calls[1][2][0]).toEqual([['order_id', '=', 13]])
  expect(order).toMatchObject({ id: 13, customerName: 'Zahir', tableNumber: 'A8', total: 87822, paid: 20000 })
  expect(order.lines).toEqual([{ uuid: 'l1', name: 'Hamburguesa Angus', qty: 2, unitPrice: 36900, total: 73800, note: '', discount: 0, couponCode: '' }])
})
