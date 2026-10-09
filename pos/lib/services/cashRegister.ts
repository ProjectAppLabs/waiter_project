import { uuid } from '@/lib/domain/uuid'
import { useOutboxStore } from '@/lib/offline/outbox'
import { CoreError } from '@/lib/services/core/http'
import * as sales from '@/lib/services/core/sales'
import { toClosingData, toPosSession, toRegisterConfig } from '@/lib/services/core/salesBridge'
import type { PosSession } from '@/lib/services/session'
import { useAuthStore } from '@/lib/stores/authStore'

export interface ClosingData {
  ordersCount: number; ordersTotal: number; expectedCash: number; openingCash: number; cashPayments: number
  cashMoves: { name: string; amount: number }[]; otherMethods: { id: number; name: string; amount: number; count: number }[]
  draftOrders: number; openingNotes: string
  refundsCash?: number
}
export interface CloseResult { successful: boolean; message: string }
export interface RegisterConfig { id: number; name: string }

export async function listConfigs(): Promise<RegisterConfig[]> {
  return (useAuthStore.getState().restaurants ?? []).map(toRegisterConfig)
}

export async function openRegister(configId: number, openingCash: number, notes: string): Promise<PosSession> {
  return toPosSession(await sales.createShift(configId, openingCash, notes))
}

export async function closingData(sessionId: number): Promise<ClosingData> {
  return toClosingData(await sales.shiftClosing(sessionId))
}

export async function closeRegister(sessionId: number, countedCash: number, notes: string): Promise<CloseResult> {
  // El servidor exige la nota si hay diferencia y rechaza cerrar con cuentas abiertas; aquí se traduce al resultado de siempre.
  try { await sales.closeShift(sessionId, countedCash, notes); return { successful: true, message: '' } }
  catch (e) { if (e instanceof CoreError) return { successful: false, message: e.message }; throw e }
}

// Plan V: sin conexión la entrada o salida de efectivo queda en la cola y cuenta en el arqueo provisional.
export async function cashInOut(sessionId: number, type: 'in' | 'out', amount: number, reason: string): Promise<void> {
  // La misma clave viaja desde el primer POST hasta el reintento, incluso si se perdió una respuesta exitosa.
  const requestKey = `cash-move-${uuid()}`
  try {
    await sales.cashMove(sessionId, type, amount, reason, requestKey)
  } catch (e) {
    if (!(e instanceof CoreError && e.code === 'unreachable')) throw e
    useOutboxStore.getState().enqueue({ kind: 'cash_move', shiftId: sessionId, type, amount, reason, requestKey, label: reason })
  }
}
