'use client'

import { create } from 'zustand'

import { addProduct, createDraft, removeLine, setNote, setOrderNote, setQty } from '@/lib/domain/order'
import type { DraftOrder } from '@/lib/domain/order'
import type { LocalFlags } from '@/lib/domain/tableState'
import { play } from '@/lib/audio/sounds'
import { change, type SettlePlan } from '@/lib/domain/payment'
import { clearTableCall, listTableCalls, type TableCall } from '@/lib/services/tables'
import { addTip, closeOrder, setChange, getShiftSummary, listOpenOrders, payOrder, saveOrder } from '@/lib/services/orders'
import type { OpenOrder, SavedOrder, ShiftSummary } from '@/lib/services/orders'
import type { Product } from '@/lib/types'

interface OrderState {
  draft: DraftOrder | null
  saved: SavedOrder | null
  openOrders: OpenOrder[]
  calls: TableCall[]
  shift: ShiftSummary | null
  flags: Record<number, LocalFlags>
  busy: boolean
  error: string | null
  start: (sessionId: number, tableId: number, guests: number) => void
  add: (product: Product) => void
  changeQty: (lineUuid: string, qty: number) => void
  note: (lineUuid: string, note: string) => void
  orderNote: (note: string) => void
  remove: (lineUuid: string) => void
  save: () => Promise<void>
  receipt: ReceiptData | null
  settle: (plan: SettlePlan, ctx: SettleContext) => Promise<boolean>
  closeReceipt: () => void
  discard: () => void
  refreshOpenOrders: (sessionId: number) => Promise<void>
  // La lista del salón ya derivada de los pedidos del kit (useKitOrders), con las llamadas de mesa, sin volver a pedirla.
  adoptOpenOrders: (openOrders: OpenOrder[], calls: TableCall[]) => void
  attendCall: (tableId: number) => Promise<void>
  refreshShift: (sessionId: number) => Promise<void>
}

export interface ReceiptData {
  // `tableLabel` es el nombre que ve el cliente ("A8", "Terraza 8"); `tableNumber` se conserva para quien
  // solo tiene el número. El documento imprime la etiqueta cuando existe.
  company: string; tableNumber: number; tableLabel?: string; reference: string; at: number; lines: { uuid: string; name: string; qty: number; unitPrice: number; discount?: number; total?: number }[]
  subtotal: number; tax: number; tip: number; total: number; payments: { method: string; amount: number; reference: string }[]; change: number
}
// Lo que el cobro necesita saber además del plan: dónde está el pedido y con qué pintar el recibo.
export interface SettleContext {
  existing: { orderId: number; tableId: number } | null; tipProductId: number | null; tableNumber: number; tableLabel?: string; company: string
  lines: ReceiptData['lines']; methodName: (id: number) => string
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export const useOrderStore = create<OrderState>((set, get) => {
  const update = (fn: (d: DraftOrder) => DraftOrder) => {
    const d = get().draft
    if (d) set({ draft: fn(d) })
  }
  const persist = async (): Promise<SavedOrder | null> => {
    const d = get().draft
    if (!d) return null
    set({ busy: true, error: null })
    try {
      const saved = await saveOrder(d)
      set({ saved, draft: { ...d, serverId: saved.id }, busy: false })
      return saved
    } catch (e) {
      play('error')
      set({ busy: false, error: message(e) })
      return null
    }
  }

  return {
    draft: null, saved: null, openOrders: [], calls: [], shift: null, flags: {}, busy: false, error: null, receipt: null,
    start: (sessionId, tableId, guests) => set({ draft: createDraft({ sessionId, tableId, guests }), saved: null, error: null }),
    add: (p) => { play('tap'); update((d) => addProduct(d, p)) },
    changeQty: (u, q) => update((d) => setQty(d, u, q)),
    note: (u, n) => update((d) => setNote(d, u, n)),
    orderNote: (n) => update((d) => setOrderNote(d, n)),
    remove: (u) => update((d) => removeLine(d, u)),
    save: async () => { await persist() },
    settle: async (plan, ctx) => {
      let orderId = ctx.existing?.orderId ?? null
      let tableId = ctx.existing?.tableId ?? null
      if (orderId === null) {
        const saved = await persist()
        if (!saved) return false
        orderId = saved.id
        tableId = get().draft!.tableId
      }
      set({ busy: true, error: null })
      try {
        if (plan.tip > 0 && ctx.tipProductId) await addTip(orderId, ctx.tipProductId, plan.tip)
        for (const p of plan.payments) await payOrder(orderId, p.methodId, p.amount, p.received, p.reference)
        const ch = change(plan.payments)
        if (ch > 0) await setChange(orderId, ch)
        const closed = await closeOrder(orderId)
        play('cobro')
        const receipt: ReceiptData = { company: ctx.company, tableNumber: ctx.tableNumber, tableLabel: ctx.tableLabel, reference: closed.reference, at: Date.now(), lines: ctx.lines,
          subtotal: closed.total - closed.tax - plan.tip, tax: closed.tax, tip: plan.tip, total: closed.total,
          payments: plan.payments.map((p) => ({ method: ctx.methodName(p.methodId), amount: p.amount, reference: p.reference })), change: ch }
        set((s) => ({ draft: null, saved: null, busy: false, receipt, flags: { ...s.flags, [tableId!]: {} } }))
        return true
      } catch (e) {
        play('error')
        set({ busy: false, error: message(e) })
        return false
      }
    },
    closeReceipt: () => set({ receipt: null }),
    // La ronda del kit (/pedidos/[id]/agregar) usa el borrador como carrito y lo suelta al enviar o al cerrar.
    discard: () => set({ draft: null, saved: null, error: null }),
    // Sondeos periódicos: un corte de red no debe tumbar la vista ni dejar rechazos sin capturar. Se conserva lo último
    // conocido y se reintenta en el siguiente tick.
    refreshOpenOrders: async (sessionId) => {
      try {
        const [openOrders, calls] = await Promise.all([listOpenOrders(sessionId), listTableCalls().catch(() => [] as TableCall[])])
        set({ openOrders, calls })
      } catch (e) {
        console.warn('No se pudo refrescar el salón; se muestra lo último conocido.', e)
      }
    },
    adoptOpenOrders: (openOrders, calls) => set({ openOrders, calls }),
    attendCall: async (tableId) => { await clearTableCall(tableId); set((s) => ({ calls: s.calls.filter((c) => c.tableId !== tableId) })) },
    refreshShift: async (sessionId) => {
      try { set({ shift: await getShiftSummary(sessionId) }) } catch (e) { console.warn('No se pudo refrescar el turno.', e) }
    },
  }
})
