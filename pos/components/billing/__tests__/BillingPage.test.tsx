import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { BillingView as FacturacionPage } from '@/components/business/BillingView'
import { messages } from '@/lib/i18n/messages'
import { invoiceOrder, listInvoices, listPaidOrders } from '@/lib/services/invoices'

jest.mock('@/lib/services/invoices', () => ({ listPaidOrders: jest.fn(), listInvoices: jest.fn(), invoiceOrder: jest.fn() }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog: { tables: [], paymentMethods: [{ id: 1, name: 'Efectivo' }, { id: 2, name: 'Tarjeta' }] } }) }))
const mount = () => render(<NextIntlClientProvider locale="es" messages={messages}><FacturacionPage /></NextIntlClientProvider>)
const order = { id: 12, reference: 'P12', date: '2026-09-14 04:27:00', total: 90000, tax: 0, tableId: null, partnerId: null, partnerName: '', invoiceId: null,
  payments: [{ methodId: 1, method: 'Efectivo', amount: 50000 }, { methodId: 2, method: 'Tarjeta', amount: 40000 }] }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(listPaidOrders).mockResolvedValue([order]); jest.mocked(listInvoices).mockResolvedValue([]) })

// Falla si la venta no muestra todos sus medios de pago y total, o si filtrar emite o cambia un documento.
it('shows complete sales and filters only the query, without issuing or changing a document', async () => {
  mount()
  expect(await screen.findByRole('button', { name: 'Revisar venta P12' })).toBeVisible()
  expect(screen.getByText('Efectivo + Tarjeta')).toBeVisible()
  expect(screen.getByText('$ 90.000')).toBeVisible()
  fireEvent.change(screen.getByRole('combobox', { name: 'Medio de pago' }), { target: { value: '1' } })
  await waitFor(() => expect(listPaidOrders).toHaveBeenLastCalledWith(21, { offset: 0, query: '', pendingOnly: true, paymentMethodId: 1 }))
  expect(invoiceOrder).not.toHaveBeenCalled()
})

// Falla si con más de una página de ventas no se ofrece «Siguiente» o no se pide el siguiente lote.
it('offers pagination beyond the first batch instead of silently dropping older sales', async () => {
  jest.mocked(listPaidOrders).mockResolvedValue(Array.from({ length: 21 }, (_, i) => ({ ...order, id: i, reference: `P${i}` })))
  mount()
  await screen.findByRole('button', { name: 'Revisar venta P0' })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(listPaidOrders).toHaveBeenLastCalledWith(21, expect.objectContaining({ offset: 20 })))
})

// Falla si un error al cargar se muestra como lista vacía, como si todo estuviera facturado.
it('shows a load failure instead of claiming every sale has been invoiced', async () => {
  jest.mocked(listPaidOrders).mockRejectedValue(new Error('offline'))
  mount()
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los documentos')
  expect(screen.queryByText('No hay resultados en esta consulta')).not.toBeInTheDocument()
})
