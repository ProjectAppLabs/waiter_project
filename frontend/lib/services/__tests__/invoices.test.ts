import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { invoiceOrder, listPaidOrders, listInvoices, orderLines } from '@/lib/services/invoices'
import { coreOrder, coreLine } from '@/lib/testFixtures/core'
jest.mock('@/lib/services/core/catalogBridge', () => ({ currentRestaurantId: () => 1 }))
// Falla si se pierden pagos mixtos o los filtros se aplican después de paginar.
it('conserva pagos y filtra la consulta antes de paginar', async () => {
 m.mockResolvedValue({ orders: [{ id: 12, number: 'P12', paid_at: '', total: 90000, tax: 0, tip: 0, table_id: null, customer_id: null, customer_name: '', document_id: null, payments: [{ method_id: 1, method: 'Efectivo', amount: 50000 }, { method_id: 2, method: 'Tarjeta', amount: 40000 }] }] })
 const [order] = await listPaidOrders(21, { offset: 20, query: 'P12', pendingOnly: true, paymentMethodId: 1 })
 expect(order).toMatchObject({ total: 90000, partnerId: null, invoiceId: null, payments: [{ methodId: 1, method: 'Efectivo', amount: 50000 }, { methodId: 2, method: 'Tarjeta', amount: 40000 }] })
 expect(m).toHaveBeenCalledWith('billing/orders?restaurant_id=1&offset=20&limit=21&q=P12&method_id=1&pending=true')
})
// Falla si el detalle pierde impuestos, descuentos o incluye líneas canceladas.
it('lee las líneas vigentes del pedido', async () => {
 m.mockResolvedValue({ order: coreOrder({ lines: [coreLine({ discount_pct: 10 }), coreLine({ id: 2, cancelled: true })] }) })
 await expect(orderLines(13)).resolves.toEqual([{ id: 1, name: 'Angus', qty: 2, unit: 36900, total: 73800, subtotal: 68000, discount: 10 }])
})
// Falla si emitir divide la operación o inventa identidad para consumidor final.
it.each([7, null])('emite un documento para el cliente %s', async (customer) => {
 m.mockResolvedValue({ document: { id: 9 } })
 await expect(invoiceOrder(12, customer)).resolves.toBe(9)
 expect(m.mock.calls).toEqual([['billing/orders/12/document', { method: 'POST', body: { customer_id: customer, request_key: expect.stringMatching(/^doc-12-/) } }]])
})
// Falla si la lista pierde las notas crédito o el estado del documento.
it('incluye las notas crédito', async () => {
 m.mockResolvedValue({ documents: [{ id: 3, number: 'NC3', issued_at: '2026-10-02', buyer: 'Eva', total: 12000, state: 'issued', kind: 'credit_note' }] })
 expect((await listInvoices())[0]).toMatchObject({ type: 'out_refund', state: 'posted', total: 12000 })
})
