import { onCore } from '@/lib/domain/backend'
import { CoreError } from '@/lib/services/core/http'
import * as sales from '@/lib/services/core/sales'
import { toClosingData, toPosSession, toRegisterConfig } from '@/lib/services/core/salesBridge'
import { useAuthStore } from '@/lib/stores/authStore'
import { callKw } from '@/lib/services/odoo'
import type { PosSession } from '@/lib/services/session'

export interface ClosingData {
  ordersCount: number; ordersTotal: number; expectedCash: number; openingCash: number; cashPayments: number
  cashMoves: { name: string; amount: number }[]; otherMethods: { id: number; name: string; amount: number; count: number }[]
  draftOrders: number; openingNotes: string
}
export interface CloseResult { successful: boolean; message: string }
export interface RegisterConfig { id: number; name: string }

interface RawClosing {
  orders_details: { quantity: number; amount: number }
  default_cash_details: { name: string; amount: number; opening: number; payment_amount: number; moves: { name: string; amount: number }[] } | false
  non_cash_payment_methods: { id: number; name: string; amount: number; number: number }[]
  opening_notes: string | false
}

export async function listConfigs(): Promise<RegisterConfig[]> {
  if (onCore()) return (useAuthStore.getState().restaurants ?? []).map(toRegisterConfig)
  return callKw<RegisterConfig[]>('pos.config', 'search_read', [[], ['name']], { order: 'id asc' })
}

// Abrir caja: sesión nueva + efectivo inicial y notas (set_opening_control la deja en 'opened').
export async function openRegister(configId: number, openingCash: number, notes: string): Promise<PosSession> {
  if (onCore()) return toPosSession(await sales.createShift(configId, openingCash, notes))
  const id = await callKw<number>('pos.session', 'create', [{ config_id: configId }])
  await callKw('pos.session', 'set_opening_control', [[id], openingCash, notes])
  return { id, configId, state: 'opened' }
}

export async function closingData(sessionId: number): Promise<ClosingData> {
  if (onCore()) return toClosingData(await sales.shiftClosing(sessionId))
  const [raw, drafts] = await Promise.all([
    callKw<RawClosing>('pos.session', 'get_closing_control_data', [[sessionId]]),
    callKw<number>('pos.order', 'search_count', [[['session_id', '=', sessionId], ['state', '=', 'draft']]]),
  ])
  const cash = raw.default_cash_details || { amount: 0, opening: 0, payment_amount: 0, moves: [] }
  return {
    ordersCount: raw.orders_details.quantity, ordersTotal: raw.orders_details.amount, expectedCash: cash.amount, openingCash: cash.opening,
    cashPayments: cash.payment_amount, cashMoves: cash.moves, otherMethods: raw.non_cash_payment_methods.map((m) => ({ id: m.id, name: m.name, amount: m.amount, count: m.number })),
    draftOrders: drafts, openingNotes: raw.opening_notes || '',
  }
}

// Cerrar caja: efectivo contado, notas y validación. Odoo contabiliza la diferencia (pérdida/ganancia de caja).
export async function closeRegister(sessionId: number, countedCash: number, notes: string): Promise<CloseResult> {
  if (onCore()) {
    // El servidor exige la nota si hay diferencia y rechaza cerrar con cuentas abiertas; aquí se traduce al resultado de siempre.
    try { await sales.closeShift(sessionId, countedCash, notes); return { successful: true, message: '' } }
    catch (e) { if (e instanceof CoreError) return { successful: false, message: e.message }; throw e }
  }
  const posted = await callKw<{ successful: boolean; message?: string }>('pos.session', 'post_closing_cash_details', [[sessionId], countedCash])
  if (!posted.successful) return { successful: false, message: posted.message ?? '' }
  await callKw('pos.session', 'update_closing_control_state_session', [[sessionId], notes])
  const closed = await callKw<{ successful: boolean; message?: string }>('pos.session', 'close_session_from_ui', [[sessionId]])
  return { successful: closed.successful, message: closed.message ?? '' }
}

export async function cashInOut(sessionId: number, type: 'in' | 'out', amount: number, reason: string): Promise<void> {
  if (onCore()) { await sales.cashMove(sessionId, type, amount, reason); return }
  // Odoo usa extras.translatedType en el mensaje contable; sin él falla con KeyError.
  await callKw('pos.session', 'try_cash_in_out', [[sessionId], type, amount, reason, false, { translatedType: type === 'in' ? 'Entrada' : 'Salida' }])
}

// Forzar el cierre cuando Odoo detecta un descuadre: usa su propio asistente (pos.close.session.wizard), que
// contabiliza la diferencia. Solo el administrador puede llamarlo desde la app.
export async function forceCloseRegister(sessionId: number): Promise<CloseResult> {
  // En el sistema propio no hay descuadre contable que forzar: cerrar es cerrar.
  if (onCore()) return { successful: true, message: '' }
  const action = await callKw<{ res_model?: string; res_id?: number }>('pos.session', 'action_pos_session_validate', [[sessionId]])
  if (!action || action.res_model !== 'pos.close.session.wizard' || !action.res_id) return { successful: true, message: '' }
  await callKw('pos.close.session.wizard', 'close_session', [[action.res_id]], { context: { active_ids: [sessionId], active_model: 'pos.session' } })
  return { successful: true, message: '' }
}
