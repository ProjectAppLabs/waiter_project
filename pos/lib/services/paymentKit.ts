import * as coreLoyalty from '@/lib/services/core/loyalty'
import * as sales from '@/lib/services/core/sales'
import { toPayableOrder } from '@/lib/services/core/salesBridge'

// Modal "Payment" del kit: lectura del pedido a cobrar, socio con puntos y canje.
export interface PayableLine { uuid: string; name: string; qty: number; unitPrice: number; total: number; note: string; discount?: number; couponCode?: string }
export interface PayableOrder {
  id: number; reference: string; trackingNumber: string; presetId: number | null; presetName: string; customerName: string
  tableId: number | null; tableNumber: string; date: string; total: number; tax: number; paid: number; lines: PayableLine[]
}
export interface LoyaltyProgram { id: number; name: string; copPerPoint: number; rewardId: number | null; rewardProductId: number | null; minimumPoints?: number }
export interface Member { cardId: number; code: string; name: string; phone: string; points: number }

export async function readPayableOrder(orderId: number): Promise<PayableOrder> {
  return toPayableOrder(await sales.getOrder(orderId))
}

// Programa "Loyalty Cards" activo en el POS. Sin programa: la pantalla dice "Sin programa de puntos", no inventa.
export async function loadLoyaltyProgram(): Promise<LoyaltyProgram | null> {
  const p = await coreLoyalty.program()
  return p ? { id: p.id, name: p.name, copPerPoint: p.value_per_point, rewardId: p.id, minimumPoints: p.minimum_points, rewardProductId: null } : null
}

export async function lookupMember(code: string, programId: number): Promise<Member | null> {
  void programId
  try { const m = await coreLoyalty.member(code); return { cardId: m.card_id, code: m.code, name: m.name, phone: m.phone, points: m.points } } catch { return null }
}

export async function redeemPoints(orderId: number, member: Member, _program: LoyaltyProgram, _points: number, amount: number, _currentTotal: number): Promise<void> {
  const r = await coreLoyalty.redeem(orderId, member.cardId)
  if (Math.abs(r.amount - amount) > 0.01) throw new Error('El saldo disponible cambió. Cierra y vuelve a abrir el cobro para revisar el total.')
  return
}
