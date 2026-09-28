import { invoiceOrder, listPaidOrders, listInvoices, orderLines } from '@/lib/services/invoices'
import { callKw } from '@/lib/services/odoo'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const m = callKw as jest.Mock
beforeEach(() => m.mockReset())

// Falla si el panel de la factura pierde el impuesto o la mesa del pedido, o si un pedido sin cliente llega con nombre.
it('maps paid orders with tax, table and customer', async () => {
  m.mockResolvedValueOnce([{ id: 12, pos_reference: 'Pedido 00012', date_order: '2026-09-06 14:00:00', amount_total: 87822, amount_tax: 14022, table_id: [5, 'Mesa 5'], partner_id: false, account_move: [3, 'INV/1'] }])
  m.mockResolvedValueOnce([])
  const [o] = await listPaidOrders()
  expect(o).toEqual({ id: 12, reference: 'Pedido 00012', date: '2026-09-06 14:00:00', total: 87822, tax: 14022, tableId: 5, partnerId: null, partnerName: '', invoiceId: 3, payments: [], tip: 0 })
})

// Falla si las líneas no traen el unitario y el total con impuesto que pinta "Detalle del pedido".
it('reads the order lines with unit price and total', async () => {
  m.mockResolvedValueOnce([{ id: 1, full_product_name: 'Hamburguesa Angus', qty: 2, price_unit: 36900, price_subtotal_incl: 73800, price_subtotal: 62016.81, discount: 10 }])
  await expect(orderLines(12)).resolves.toEqual([{ id: 1, name: 'Hamburguesa Angus', qty: 2, unit: 36900, total: 73800, subtotal: 62016.81, discount: 10 }])
  expect(m.mock.calls[0][2][0]).toEqual([['order_id', '=', 12]])
})

// Mezclar medios de pago no divide ni oculta la venta. El cambio en efectivo se descuenta del mismo medio.
it('preserves mixed payment amounts and applies query filters before pagination', async () => {
  m.mockResolvedValueOnce([{ id: 12, pos_reference: 'P12', date_order: '2026-09-06 14:00:00', amount_total: 90000, amount_tax: 0, table_id: false, partner_id: false, account_move: false }])
  m.mockResolvedValueOnce([
    { pos_order_id: [12, 'P12'], payment_method_id: [1, 'Efectivo'], amount: 60000 },
    { pos_order_id: [12, 'P12'], payment_method_id: [1, 'Efectivo'], amount: -10000 },
    { pos_order_id: [12, 'P12'], payment_method_id: [2, 'Tarjeta'], amount: 40000 },
  ])
  const [order] = await listPaidOrders(21, { offset: 20, query: 'P12', pendingOnly: true, paymentMethodId: 1 })
  expect(order.total).toBe(90000)
  expect(order.payments).toEqual([{ methodId: 1, method: 'Efectivo', amount: 50000 }, { methodId: 2, method: 'Tarjeta', amount: 40000 }])
  expect(m.mock.calls[0][2][0]).toEqual([['state', 'in', ['paid', 'done', 'invoiced']], ['account_move', '=', false], ['payment_ids.payment_method_id', '=', 1], '|', ['pos_reference', 'ilike', 'P12'], ['partner_id.name', 'ilike', 'P12']])
  expect(m.mock.calls[0][3]).toEqual({ limit: 21, offset: 20, order: 'id desc' })
  expect(m.mock.calls.every(([, action]) => action === 'search_read')).toBe(true)
})

it('delegates posting and retry to a single atomic server operation', async () => {
  m.mockResolvedValueOnce(9)
  await expect(invoiceOrder(12, 7)).resolves.toBe(9)
  expect(m).toHaveBeenCalledTimes(1)
  expect(m).toHaveBeenCalledWith('pos.order', 'waiter_account_invoice', [[12], 7, false])
})

it('includes credit notes and restricts accounting documents to the POS', async () => {
  m.mockResolvedValueOnce([{ id: 3, name: 'RINV/3', invoice_date: '2026-09-21', partner_id: [7, 'Eva'], amount_total: 12000, state: 'posted', payment_state: 'reversed', move_type: 'out_refund' }])
  const [invoice] = await listInvoices()
  expect(invoice.type).toBe('out_refund')
  expect(m.mock.calls[0][2][0]).toEqual([['move_type', 'in', ['out_invoice', 'out_refund']], ['pos_order_ids', '!=', false]])
})

it('sends consumer final explicitly without inventing a personal identity', async () => {
  m.mockResolvedValueOnce(10)
  await expect(invoiceOrder(12, null)).resolves.toBe(10)
  expect(m).toHaveBeenCalledWith('pos.order', 'waiter_account_invoice', [[12], false, true])
})
