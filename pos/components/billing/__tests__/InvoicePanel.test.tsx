import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { InvoicePanel } from '@/components/billing/InvoicePanel'
import { reviewOrder } from '@/lib/services/invoices'
import { messages } from '@/lib/i18n/messages'

jest.mock('@/lib/services/invoices', () => ({ orderLines: jest.fn().mockResolvedValue([{ id: 1, name: 'Hamburguesa Angus', qty: 2, unit: 36900, total: 73800 }]), reviewOrder: jest.fn().mockResolvedValue({ company: 'Restaurante', journal: 'Ventas', currency: 'COP', tip: 0, issues: [], ready: true }), accountingDetail: jest.fn().mockResolvedValue({ ready: true, issues: [], company: 'Restaurante', journal: 'Ventas', date: '2026-09-21', origin: 'P12', currency: 'COP', companyCurrency: 'COP', untaxed: 73800, tax: 14022, total: 87822, residual: 0, tip: 0, debit: 87822, credit: 87822, original: '', lines: [], taxes: [] }), invoicePdfUrl: (id: number) => `/pdf/${id}` }))
jest.mock('@/lib/services/customers', () => ({ listCustomers: jest.fn().mockResolvedValue([{ id: 7, name: 'Eva Martínez', vat: '1020' }]) }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const order = { id: 12, reference: 'P12', date: '2026-09-05 20:00:00', total: 92000, tax: 14022, tableId: 5, partnerId: null, partnerName: '', invoiceId: null, payments: [] }

// Falla si el panel no pinta las líneas y los totales del pedido, o si emite la factura sin el cliente elegido.
it('shows the order lines and totals, issues the invoice for the chosen customer and offers the PDF', async () => {
  const onIssue = jest.fn().mockResolvedValue({ id: 3, name: 'INV/2026/00003' })
  wrap(<InvoicePanel selection={{ kind: 'order', order }} tableNumber={5} onIssue={onIssue} />)
  expect(await screen.findByText('Hamburguesa Angus')).toBeInTheDocument()
  expect(screen.getByText('$ 73.800')).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /Venta general/ })).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(await screen.findByRole('radio', { name: /Eva Martínez/ }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Crear factura contable/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /Crear factura contable/ }))
  await waitFor(() => expect(onIssue).toHaveBeenCalledWith(12, 7))
  expect(await screen.findByText('Factura contable INV/2026/00003 creada.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Ver PDF/ })).toHaveAttribute('href', '/pdf/3')
})

// Falla si una factura ya emitida pierde su estado, su total o el enlace al PDF.
it('shows an issued invoice with its state pills and the PDF link', async () => {
  wrap(<InvoicePanel selection={{ kind: 'invoice', invoice: { id: 3, name: 'INV/2026/00003', date: '2026-09-05', partner: 'Eva Martínez', total: 87822, state: 'posted', paymentState: 'paid' } }} tableNumber={null} onIssue={jest.fn()} />)
  expect(await screen.findByText('Asiento verificado')).toBeInTheDocument()
  expect(screen.getByText('Contabilizada')).toBeInTheDocument()
  expect(screen.getByText('Pagada')).toBeInTheDocument()
  expect(screen.getByText('$ 87.822')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Ver PDF/ })).toHaveAttribute('href', '/pdf/3')
})

// Falla si se puede crear la factura contable cuando la revisión contable reporta un problema de configuración.
it('blocks posting when accounting review detects a configuration issue', async () => {
  jest.mocked(reviewOrder).mockResolvedValueOnce({ company: 'Restaurante', journal: 'Ventas', currency: 'COP', tip: 9000, issues: ['Configura la propina en un pasivo.'], ready: false })
  const onIssue = jest.fn()
  wrap(<InvoicePanel selection={{ kind: 'order', order: { ...order, partnerId: 7 } }} tableNumber={5} onIssue={onIssue} />)
  expect(await screen.findByText('Configura la propina en un pasivo.')).toBeVisible()
  expect(screen.getByRole('button', { name: /Crear factura contable/ })).toBeDisabled()
  expect(onIssue).not.toHaveBeenCalled()
})

// Falla si una venta general exige un cliente con nombre o no se emite con cliente nulo.
it('accounts a general sale without looking up or creating a named customer', async () => {
  const onIssue = jest.fn().mockResolvedValue({ id: 4, name: 'INV/4' })
  wrap(<InvoicePanel selection={{ kind: 'order', order }} tableNumber={5} onIssue={onIssue} />)
  await waitFor(() => expect(screen.getByRole('button', { name: /Crear factura contable/ })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: /Crear factura contable/ }))
  await waitFor(() => expect(onIssue).toHaveBeenCalledWith(12, null))
})
