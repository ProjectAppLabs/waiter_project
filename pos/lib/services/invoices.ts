import { currentOrg } from '@/lib/domain/tenant'
import { uuid } from '@/lib/domain/uuid'
import * as coreBusiness from '@/lib/services/core/business'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as sales from '@/lib/services/core/sales'

export interface InvoicePayment { methodId: number; method: string; amount: number }
export interface InvoiceableOrder { id: number; reference: string; date: string; total: number; tax: number; tableId: number | null; partnerId: number | null; partnerName: string; invoiceId: number | null; payments: InvoicePayment[]; tip?: number }
export interface Invoice { id: number; name: string; date: string; partner: string; total: number; state: string; paymentState: string; type?: string }
export interface OrderLine { id: number; name: string; qty: number; unit: number; total: number; subtotal: number; discount: number }

export interface BillingQuery { offset?: number; query?: string; paymentMethodId?: number | null; pendingOnly?: boolean }

// Los filtros actúan en la consulta, antes de paginar. Nunca cambian documentos ni obligaciones fiscales.
export async function listPaidOrders(limit = 60, filters: BillingQuery = {}): Promise<InvoiceableOrder[]> {
  return (await coreBusiness.billingOrders({ restaurant_id: currentRestaurantId(), offset: filters.offset, limit, q: filters.query, method_id: filters.paymentMethodId, pending: filters.pendingOnly })).map((o) => ({ id: o.id, reference: o.number, date: o.paid_at, total: o.total, tax: o.tax, tip: o.tip, tableId: o.table_id, partnerId: o.customer_id, partnerName: o.customer_name, invoiceId: o.document_id, payments: o.payments.map((p) => ({ methodId: p.method_id, method: p.method, amount: p.amount })) }))
}

// Líneas del pedido para el panel "Información de la factura" (precio unitario × cantidad, total con impuesto).
export async function orderLines(orderId: number): Promise<OrderLine[]> {
  return (await sales.getOrder(orderId)).lines.filter((l) => !l.cancelled).map((l) => ({ id: l.id, name: l.name, qty: l.qty, unit: l.unit_price, total: l.total, subtotal: l.subtotal, discount: l.discount_pct }))
}

export interface BillingReview { company: string; journal: string; currency: string; tip: number; issues: string[]; ready: boolean }
export interface AccountingDetail {
  ready: boolean; issues: string[]; company: string; journal: string; date: string; origin: string
  currency: string; companyCurrency: string; untaxed: number; tax: number; total: number; residual: number
  tip: number; debit: number; credit: number; original: string
  lines: { id: number; account: string; label: string; debit: number; credit: number }[]
  taxes: { id: number; name: string; amount: number }[]
}

export function reviewOrder(orderId: number, partnerId: number | null): Promise<BillingReview> {
  return coreBusiness.review<BillingReview>(orderId, partnerId)
}

export function invoiceOrder(orderId: number, partnerId: number | null): Promise<number> {
  // Plan T4: en el sistema propio se emite el documento de venta ante el proveedor de factura electrónica.
  return coreBusiness.emit(orderId, partnerId, `doc-${orderId}-${uuid()}`).then((d) => d.id)
}

export function accountingDetail(invoiceId: number): Promise<AccountingDetail> {
  return coreBusiness.documentDetail<RawCoreDetail>(invoiceId).then(camelDetail)
}

export async function listInvoices(limit = 60, filters: Pick<BillingQuery, 'offset' | 'query'> = {}): Promise<Invoice[]> {
  return (await coreBusiness.documents({ offset: filters.offset, limit, q: filters.query })).map(toDocument)
}

export async function getInvoice(id: number): Promise<Invoice | null> {
  try { return toDocument(await coreBusiness.document(id)) } catch { return null }
}

export function invoicePdfUrl(invoiceId: number): string {
  return `/experience/api/pos/v1/documents/${invoiceId}/pdf?org=${currentOrg()}`
}

export interface BillingSettings {
  company: string; journal: string; currency: string; tipProduct: string
  tipAccountId: number | null; tipAccount: string; accounts: { id: number; name: string }[]
}
export function billingSettings(configId: number): Promise<BillingSettings> {
  void configId
  return coreBusiness.billingSettings<RawCoreSettings>().then(toBillingSettings)
}
export function setTipAccount(configId: number, accountId: number): Promise<BillingSettings> {
  void configId
  void accountId
  return coreBusiness.billingSettings<RawCoreSettings>().then(toBillingSettings)
}

// Plan T4: el documento de venta del sistema propio en la forma que pintan Facturación y su detalle.
const STATE: Record<string, string> = { issued: 'posted', pending: 'draft', contingency: 'draft', rejected: 'cancel' }
function toDocument(d: coreBusiness.CoreDocumentRow): Invoice {
  return { id: d.id, name: d.number, date: d.issued_at ?? '', partner: d.buyer, total: d.total, state: STATE[d.state] ?? d.state, paymentState: d.state === 'issued' ? 'paid' : 'not_paid', type: d.kind === 'credit_note' ? 'out_refund' : 'out_invoice' }
}
type RawCoreDetail = Omit<AccountingDetail, 'companyCurrency'> & { company_currency: string }
const camelDetail = (d: RawCoreDetail): AccountingDetail => ({ ...d, companyCurrency: d.company_currency })
interface RawCoreSettings { company: string; journal: string; currency: string; tip_label: string; send_email: boolean; default_kind: string }
const toBillingSettings = (r: RawCoreSettings): BillingSettings => ({ company: r.company, journal: r.journal, currency: r.currency, tipProduct: r.tip_label, tipAccountId: null, tipAccount: 'Propina recibida para terceros (no gravada)', accounts: [] })
