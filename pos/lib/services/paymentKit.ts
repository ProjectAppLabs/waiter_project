import { onCore } from '@/lib/domain/backend'
import * as sales from '@/lib/services/core/sales'
import { toPayableOrder } from '@/lib/services/core/salesBridge'
import { callKw } from '@/lib/services/odoo'

// Modal "Payment" del kit: lectura del pedido a cobrar, socio con puntos (loyalty + pos_loyalty) y canje.
export interface PayableLine { uuid: string; name: string; qty: number; unitPrice: number; total: number; note: string; discount?: number; couponCode?: string }
export interface PayableOrder {
  id: number; reference: string; trackingNumber: string; presetId: number | null; presetName: string; customerName: string
  tableId: number | null; tableNumber: string; date: string; total: number; tax: number; paid: number; lines: PayableLine[]
}
export interface LoyaltyProgram { id: number; name: string; copPerPoint: number; rewardId: number | null; rewardProductId: number | null; minimumPoints?: number }
export interface Member { cardId: number; code: string; name: string; phone: string; points: number }

interface RawOrder { id: number; pos_reference: string; tracking_number: string | false; preset_id: [number, string] | false; floating_order_name: string | false; table_id: [number, string] | false; date_order: string; amount_total: number; amount_tax: number; amount_paid: number }
interface RawLine { uuid: string; full_product_name: string; qty: number; price_unit: number; price_subtotal_incl: number; customer_note: string | false; combo_parent_id: [number, string] | false; discount?: number; waiter_coupon_code?: string | false }
interface RawProgram { id: number; name: string }
interface RawReward { id: number; discount: number; required_points: number; discount_line_product_id: [number, string] | false }
interface RawCard { id: number; code: string; points: number; partner_id: [number, string] | false }
interface RawPartner { id: number; name: string; phone: string | false }

export async function readPayableOrder(orderId: number): Promise<PayableOrder> {
  if (onCore()) return toPayableOrder(await sales.getOrder(orderId))
  const [[raw], lines] = await Promise.all([
    callKw<RawOrder[]>('pos.order', 'read', [[orderId], ['pos_reference', 'tracking_number', 'preset_id', 'floating_order_name', 'table_id', 'date_order', 'amount_total', 'amount_tax', 'amount_paid']]),
    callKw<RawLine[]>('pos.order.line', 'search_read', [[['order_id', '=', orderId]], ['uuid', 'full_product_name', 'qty', 'price_unit', 'price_subtotal_incl', 'customer_note', 'combo_parent_id', 'discount', 'waiter_coupon_code']]),
  ])
  return {
    id: raw.id, reference: raw.pos_reference, trackingNumber: raw.tracking_number || String(raw.id), presetId: raw.preset_id ? raw.preset_id[0] : null,
    presetName: raw.preset_id ? raw.preset_id[1] : '', customerName: raw.floating_order_name || '', tableId: raw.table_id ? raw.table_id[0] : null,
    tableNumber: raw.table_id ? raw.table_id[1] : '', date: raw.date_order, total: raw.amount_total, tax: raw.amount_tax, paid: raw.amount_paid,
    lines: lines.map((l) => ({ uuid: l.uuid, name: l.full_product_name, qty: l.qty, unitPrice: l.price_unit, total: l.price_subtotal_incl, note: l.customer_note || '', discount: l.discount || 0, couponCode: l.waiter_coupon_code || '' })),
  }
}

// Programa "Loyalty Cards" activo en el POS. Sin programa: la pantalla dice "Sin programa de puntos", no inventa.
export async function loadLoyaltyProgram(): Promise<LoyaltyProgram | null> {
  // Los puntos llegan al sistema propio en T3: sin programa, la pantalla lo dice.
  if (onCore()) return null
  const programs = await callKw<RawProgram[]>('loyalty.program', 'search_read', [[['program_type', '=', 'loyalty'], ['active', '=', true], ['pos_ok', '=', true]], ['name']], { limit: 1 })
  if (programs.length === 0) return null
  const rewards = await callKw<RawReward[]>('loyalty.reward', 'search_read',
    [[['program_id', '=', programs[0].id], ['reward_type', '=', 'discount'], ['discount_mode', '=', 'per_point']], ['discount', 'discount_line_product_id', 'required_points']], { limit: 1 })
  const reward = rewards[0]
  return { id: programs[0].id, name: programs[0].name, copPerPoint: reward?.discount ?? 0, rewardId: reward?.id ?? null, minimumPoints: reward?.required_points ?? 0, rewardProductId: reward?.discount_line_product_id ? reward.discount_line_product_id[0] : null }
}

export async function lookupMember(code: string, programId: number): Promise<Member | null> {
  if (onCore()) { void code; void programId; return null }
  const cards = await callKw<RawCard[]>('loyalty.card', 'search_read', [[['code', '=', code.trim()], ['program_id', '=', programId]], ['code', 'points', 'partner_id']], { limit: 1 })
  const card = cards[0]
  if (!card) return null
  const partner = card.partner_id ? (await callKw<RawPartner[]>('res.partner', 'read', [[card.partner_id[0]], ['name', 'phone']]))[0] : null
  return { cardId: card.id, code: card.code, name: partner?.name ?? '', phone: partner?.phone || '', points: card.points }
}

// Odoo validates current balance, program, minimum and order state under a lock.
// Draft rewards reserve points; the paid-order hook records the actual debit.
export async function redeemPoints(orderId: number, member: Member, _program: LoyaltyProgram, _points: number, amount: number, _currentTotal: number): Promise<void> {
  if (onCore()) throw new Error('Los puntos llegan al sistema propio en la fase T3.')
  void _program; void _points; void _currentTotal
  const result = await callKw<{amount:number;points:number}>('pos.order', 'waiter_redeem_points', [[orderId], member.cardId])
  if (Math.abs(result.amount - amount) > 0.01) throw new Error('El saldo disponible cambió. Cierra y vuelve a abrir el cobro para revisar el total.')
}
