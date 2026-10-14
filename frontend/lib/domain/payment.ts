import type { PaymentMethod } from '@/lib/types'

export interface Payment { methodId: number; type: PaymentMethod['type']; amount: number; received: number; reference: string }
export interface SettlePlan { tip: number; payments: Payment[] }

export const TIP_PCT = 10

export function suggestedTip(total: number, pct = TIP_PCT): number {
  return Math.round((total * pct) / 100)
}

// Partes iguales que suman exactamente el total: la diferencia por redondeo va a la última.
export function splitEqual(total: number, parts: number): number[] {
  const n = Math.max(1, Math.floor(parts))
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base))
}

export function paid(payments: Payment[]): number {
  return payments.reduce((a, p) => a + p.amount, 0)
}

export function remaining(total: number, payments: Payment[]): number {
  return Math.max(0, total - paid(payments))
}

// Solo el efectivo da cambio: en datáfono se cobra exacto.
export function change(payments: Payment[]): number {
  return payments.filter((p) => p.type === 'cash').reduce((a, p) => a + Math.max(0, p.received - p.amount), 0)
}

export function canSettle(total: number, payments: Payment[]): boolean {
  return payments.length > 0 && remaining(total, payments) === 0 && payments.every((p) => p.amount > 0 && (p.type !== 'cash' || p.received >= p.amount))
}
