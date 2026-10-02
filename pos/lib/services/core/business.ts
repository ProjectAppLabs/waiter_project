import { coreFetch } from '@/lib/services/core/http'

const q = (p: Record<string, string | number | boolean | null | undefined>) => Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')

export interface CoreCompany { name: string; legal_name: string; tax_id: string; tax_id_dv: string; fiscal_regime: string; fiscal_responsibilities: string[]; address: string; city: string; phone: string; email: string }
export interface CoreBrand { name: string; color: string; font: string; radius: string; tagline: string; greeting: string; waiter_name: string; welcome: string; has_logo: boolean; version: string }
export interface CoreBillingOrder { id: number; number: string; paid_at: string; total: number; tax: number; tip: number; table_id: number | null; customer_id: number | null; customer_name: string; document_id: number | null; payments: { method_id: number; method: string; amount: number }[] }
export interface CoreDocumentRow { id: number; number: string; issued_at: string | null; buyer: string; total: number; state: string; kind: string }

export const summary = <T>(from: string, to: string) => coreFetch<T>(`reports/summary?${q({ from, to })}`)
export const profitability = <T>(from: string, to: string, restaurantId: number | null) => coreFetch<T>(`reports/profitability?${q({ from, to, restaurant_id: restaurantId })}`)
export const company = () => coreFetch<{ company: CoreCompany }>('company').then((r) => r.company)
export const saveCompany = (patch: Partial<CoreCompany>) => coreFetch<{ company: CoreCompany }>('company', { method: 'PATCH', body: patch }).then((r) => r.company)
export const brand = () => coreFetch<{ brand: CoreBrand }>('brand').then((r) => r.brand)
export const saveBrand = (patch: Record<string, unknown>) => coreFetch<{ brand: CoreBrand }>('brand', { method: 'PATCH', body: patch }).then((r) => r.brand)
export const billingOrders = (p: { restaurant_id?: number | null; offset?: number; limit?: number; q?: string; method_id?: number | null; pending?: boolean }) =>
  coreFetch<{ orders: CoreBillingOrder[] }>(`billing/orders?${q(p)}`).then((r) => r.orders)
export const review = <T>(orderId: number, customerId: number | null) => coreFetch<T>(`billing/orders/${orderId}/review?${q({ customer_id: customerId })}`)
export const emit = (orderId: number, customerId: number | null, requestKey: string) =>
  coreFetch<{ document: { id: number } }>(`billing/orders/${orderId}/document`, { method: 'POST', body: { customer_id: customerId, request_key: requestKey } }).then((r) => r.document)
export const documents = (p: { offset?: number; limit?: number; q?: string }) => coreFetch<{ documents: CoreDocumentRow[] }>(`documents?${q(p)}`).then((r) => r.documents)
export const document = (id: number) => coreFetch<{ document: CoreDocumentRow }>(`documents/${id}`).then((r) => r.document)
export const documentDetail = <T>(id: number) => coreFetch<T>(`documents/${id}/detail`)
export const billingSettings = <T>() => coreFetch<T>('billing/settings')
export const saveBillingSettings = <T>(patch: Record<string, unknown>) => coreFetch<T>('billing/settings', { method: 'PATCH', body: patch })

// Contrato M: el estado de la suscripción de Waiter que ve el dueño (cuentas de cobro de ProjectApp).
export interface Subscription { plan: string; monthly_price: number; next_due: string | null; overdue: number; suspend_on?: string | null; charges: { id: number; period: string; amount: number; due_date: string; state: string }[] }
export const subscription = () => coreFetch<Subscription>('subscription')
