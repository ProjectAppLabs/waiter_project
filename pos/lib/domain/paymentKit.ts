import type { PaymentMethod } from '@/lib/types'

// Modal "Payment" del kit: efectivo con teclado y montos rápidos, tarjeta con temporizador, QR simulado y puntos de socio.
export type PayKind = 'cash' | 'card' | 'qr'
export const PAY_KINDS: PayKind[] = ['cash', 'card', 'qr']
// Billetes colombianos habituales (el kit muestra $20 $50 $100 $200).
export const QUICK_AMOUNTS = [10_000, 20_000, 50_000, 100_000]
export const CARD_TIMEOUT_MS = 25 * 60_000
export const QR_CHECK_MS = 2_000
const MAX_DIGITS = 9

// El display del efectivo es texto: sin ceros a la izquierda y con tope de nueve cifras.
export function appendDigit(text: string, digit: string): string {
  if (!/^\d$/.test(digit)) return text
  const next = (text === '0' ? '' : text) + digit
  return next.length > MAX_DIGITS ? text : next.replace(/^0+(?=\d)/, '')
}
export const backspace = (text: string) => text.slice(0, -1)
export const amountOf = (text: string) => Number(text || 0)

export const cashChange = (received: number, due: number) => Math.max(0, received - due)
export const canPayCash = (received: number, due: number) => due > 0 && received >= due

// "00h 24m 54s" del kit.
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(s / 3600))}h ${pad(Math.floor((s % 3600) / 60))}m ${pad(s % 60)}s`
}

export function methodFor(kind: PayKind, methods: PaymentMethod[]): PaymentMethod | null {
  const isQr = (m: PaymentMethod) => /\bqr\b/i.test(m.name)
  if (kind === 'cash') return methods.find((m) => m.type === 'cash') ?? null
  if (kind === 'qr') return methods.find((m) => m.type === 'bank' && isQr(m)) ?? null
  return methods.find((m) => m.type === 'bank' && !isQr(m)) ?? null
}

// Puntos del socio: el descuento nunca supera lo que falta por pagar y solo consume los puntos que hacen falta.
export interface PointsRate { copPerPoint: number }
export function pointsDiscount(points: number, rate: PointsRate, due: number): number {
  if (rate.copPerPoint <= 0 || points <= 0 || due <= 0) return 0
  return Math.round(Math.min(Math.floor(points), Math.floor(due / rate.copPerPoint)) * rate.copPerPoint * 100) / 100
}
export function pointsToRedeem(discount: number, rate: PointsRate): number {
  return rate.copPerPoint > 0 ? Math.ceil(discount / rate.copPerPoint) : 0
}
