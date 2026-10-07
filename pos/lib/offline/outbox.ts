'use client'

import { create } from 'zustand'

import { currentOrg } from '@/lib/domain/tenant'
import { uuid } from '@/lib/domain/uuid'
import { CoreError } from '@/lib/services/core/http'
import { useEmergencyOrders } from '@/lib/offline/emergency'
import * as sales from '@/lib/services/core/sales'

// Plan U2: la cola de salida del modo sin conexión. Cada operación que no pudo llegar al servidor se guarda en orden,
// en el navegador, con los identificadores que la hacen segura de repetir (el `uuid` del pedido y de cada línea, la
// `request_key` de cada pago y movimiento de caja). Al volver la red se envían una por una; si una respuesta se perdió, repetirla no duplica
// nada en el servidor.
export type OrderRef = { uuid: string } | { id: number }
interface Base { id: string; at: string; label: string }
export type OutboxEntry = Base & (
  | { kind: 'create_order'; uuid: string; body: sales.OrderInput }
  | { kind: 'add_lines'; order: OrderRef; lines: sales.LineInput[]; fire: boolean }
  | { kind: 'fire'; order: OrderRef }
  // `amount: 'balance'`: lo que falte por pagar según el servidor al sincronizar (el total sin conexión es una cuenta
  // del equipo; el del servidor manda).
  // `expected` y `cash`: lo que el equipo calculó y si fue efectivo, para el arqueo provisional (plan V).
  | { kind: 'payment'; order: OrderRef; methodId: number; amount: number | 'balance'; received: number | null; reference: string; requestKey: string; expected?: number; cash?: boolean }
  | { kind: 'pay'; order: OrderRef; paidAt?: string }
  | { kind: 'cash_move'; shiftId: number; type: 'in' | 'out'; amount: number; reason: string; requestKey: string }
)
type NewEntry = OutboxEntry extends infer E ? E extends OutboxEntry ? Omit<E, 'id' | 'at'> : never : never
export interface FailedEntry { entry: OutboxEntry; error: string }
// Plan V: cuando el servidor dice que la sesión venció, la cola espera a que alguien vuelva a entrar.
const sessionExpired = (e: unknown) => e instanceof CoreError && (e.status === 401 || e.code === 'unauthenticated')

const key = () => `waiter.outbox:${currentOrg() ?? '-'}`
interface Saved { entries: OutboxEntry[]; failed: FailedEntry[]; ids: Record<string, number> }
const cashMoveNeedsReview = (entry: OutboxEntry) => entry.kind === 'cash_move' && (typeof entry.requestKey !== 'string' || !entry.requestKey.trim())
const CASH_MOVE_REVIEW_MESSAGE = 'Revisa este movimiento en el historial de caja antes de volver a registrarlo: se guardó sin identificador y pudo haberse aplicado.'
function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) ?? '{}') as Partial<Saved>
    const entries: OutboxEntry[] = []
    const failed = [...(raw.failed ?? [])]
    for (const entry of raw.entries ?? []) {
      // No puede saberse si el servidor aceptó un POST antiguo cuya respuesta se perdió.
      if (cashMoveNeedsReview(entry)) failed.push({ entry, error: CASH_MOVE_REVIEW_MESSAGE })
      else entries.push(entry)
    }
    return { entries, failed, ids: raw.ids ?? {} }
  } catch { return { entries: [], failed: [], ids: {} } }
}
function save(state: Saved): void {
  try { localStorage.setItem(key(), JSON.stringify(state)) } catch { /* sin almacenamiento: la cola vive mientras la pestaña */ }
}

const refOf = (ref: OrderRef) => ('uuid' in ref ? ref.uuid : String(ref.id))
const unreachable = (e: unknown) => e instanceof CoreError && e.code === 'unreachable'

interface OutboxState extends Saved {
  syncing: boolean
  needsLogin: boolean
  resumeAfterLogin: () => void
  loaded: boolean
  hydrate: () => void
  enqueue: (entry: NewEntry) => OutboxEntry
  // Envía en orden. Para en el primer «sin red»; un rechazo del servidor pasa a `failed` con lo que dependía de él.
  sync: () => Promise<void>
  discard: (id: string) => void
  // El id del servidor de un pedido creado sin conexión, una vez sincronizado.
  serverId: (ref: OrderRef) => number | null
}

export const useOutboxStore = create<OutboxState>((set, get) => {
  const persist = () => { const { entries, failed, ids } = get(); save({ entries, failed, ids }) }
  const resolve = (ref: OrderRef): number => {
    if ('id' in ref) return ref.id
    const id = get().ids[ref.uuid]
    if (id === undefined) throw new CoreError(409, 'missing_order', 'El pedido de esta operación no se pudo crear.')
    return id
  }
  async function run(entry: OutboxEntry): Promise<void> {
    switch (entry.kind) {
      case 'create_order': {
        const order = await sales.createOrder(entry.body)
        set((s) => ({ ids: { ...s.ids, [entry.uuid]: order.id } }))
        useEmergencyOrders.getState().update(entry.uuid, { serverId: order.id, serverNumber: order.number })
        return
      }
      case 'add_lines': await sales.addLines(resolve(entry.order), entry.lines, entry.fire); return
      case 'fire': await sales.fireOrder(resolve(entry.order)); return
      case 'payment': {
        const id = resolve(entry.order)
        let amount = entry.amount
        if (amount === 'balance') {
          const order = await sales.getOrder(id)
          amount = Math.max(0, order.total - order.paid)
          if (amount === 0) return
        }
        await sales.addPayment(id, { method_id: entry.methodId, amount, request_key: entry.requestKey, ...(entry.received !== null && { received: entry.received }), ...(entry.reference && { reference: entry.reference }) })
        return
      }
      case 'pay': await sales.payOrder(resolve(entry.order), entry.paidAt); return
      case 'cash_move': {
        // También protege las entradas antiguas que ya estaban cargadas cuando se actualizó la aplicación.
        if (cashMoveNeedsReview(entry)) throw new CoreError(409, 'cash_move_review_required', CASH_MOVE_REVIEW_MESSAGE)
        await sales.cashMove(entry.shiftId, entry.type, entry.amount, entry.reason, entry.requestKey)
        return
      }
    }
  }
  return {
    entries: [], failed: [], ids: {}, syncing: false, needsLogin: false, loaded: false,
    resumeAfterLogin: () => { if (get().needsLogin) { set({ needsLogin: false }); void get().sync() } },
    hydrate: () => { if (!get().loaded) { set({ ...load(), loaded: true }); persist() } },
    enqueue: (input) => {
      get().hydrate()
      const entry = { ...input, id: uuid(), at: new Date().toISOString() } as OutboxEntry
      set((s) => ({ entries: [...s.entries, entry] }))
      persist()
      return entry
    },
    sync: async () => {
      get().hydrate()
      if (get().syncing || get().needsLogin || get().entries.length === 0) return
      set({ syncing: true })
      // Pedidos cuya creación falló: lo que dependa de ellos falla con ellos, sin intentarlo.
      const broken = new Set<string>()
      try {
        while (get().entries.length > 0) {
          const entry = get().entries[0]
          // Los movimientos de una caja son independientes; un rechazo no cancela los siguientes.
          const ref = entry.kind === 'create_order' ? entry.uuid : entry.kind === 'cash_move' ? null : refOf(entry.order)
          try {
            if (ref !== null && broken.has(ref)) throw new CoreError(409, 'depends_on_failed', 'No se envió porque falló una operación anterior de este pedido.')
            await run(entry)
            set((s) => ({ entries: s.entries.slice(1) }))
          } catch (e) {
            if (unreachable(e)) break
            if (sessionExpired(e)) { set({ needsLogin: true }); break }
            if (ref !== null) broken.add(ref)
            const error = e instanceof Error ? e.message : String(e)
            set((s) => ({ entries: s.entries.slice(1), failed: [...s.failed, { entry, error }] }))
          }
          persist()
        }
      } finally {
        set({ syncing: false })
        persist()
      }
    },
    discard: (id) => { set((s) => ({ failed: s.failed.filter((f) => f.entry.id !== id) })); persist() },
    serverId: (ref) => ('id' in ref ? ref.id : get().ids[ref.uuid] ?? null),
  }
})

export const newRequestKey = () => `offline-${uuid()}`
