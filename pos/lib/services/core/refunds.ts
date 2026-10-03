import { coreFetch } from '@/lib/services/core/http'
import type { CoreOrder } from '@/lib/services/core/sales'

// Plan U1: devoluciones de pedidos cobrados (contrato en docs/planes/2026-10-03-plan-U-pos-faltantes.md).
export interface RefundableLine { line_id: number; name: string; qty: number; refundable_qty: number; unit_amount: number; refundable_amount: number }
export interface RefundableMethod { method_id: number; name: string; type: 'cash' | 'bank' | 'pay_later'; paid: number; refundable: number }
export interface CoreRefund {
  id: number; order_id: number; order_number: string; restaurant_id: number; restaurant_name: string; shift_id: number; total: number; tip: number; reason: string; restock: boolean; request_key: string; created_at: string
  account: { id: number; name: string } | null
  lines: { line_id: number; product_id: number; name: string; qty: number; amount: number; subtotal: number; tax: number }[]
  payments: { method_id: number; amount: number; name: string; type: 'cash' | 'bank' | 'pay_later' }[]
}
export interface Refundable {
  lines: RefundableLine[]; tip: number; methods: RefundableMethod[]; refunds: CoreRefund[]; credit_note: boolean
}
export interface RefundInput {
  lines: { line_id: number; qty: number }[]; tip: number; payments: { method_id: number; amount: number }[]; reason: string; restock: boolean; request_key: string
}
export interface RefundResult { refund: CoreRefund; order: CoreOrder; credit_note: { id: number; number: string; state: string } | null }

// El servidor llama `payments` a lo devolvible por método.
export const refundable = async (orderId: number): Promise<Refundable> => {
  const r = await coreFetch<Omit<Refundable, 'methods'> & { payments: RefundableMethod[] }>(`orders/${orderId}/refundable`)
  return { lines: r.lines, tip: r.tip, methods: r.payments, refunds: r.refunds, credit_note: r.credit_note }
}
export const createRefund = (orderId: number, input: RefundInput) => coreFetch<RefundResult>(`orders/${orderId}/refunds`, { method: 'POST', body: input })
export const listRefunds = (p: { restaurant_id?: number; from?: string; to?: string }) =>
  coreFetch<{ refunds: CoreRefund[] }>(`refunds?${new URLSearchParams(Object.entries(p).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, String(v)]))}`).then((r) => r.refunds)
