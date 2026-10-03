'use client'

import { create } from 'zustand'

import { currentOrg } from '@/lib/domain/tenant'
import { uuid } from '@/lib/domain/uuid'
import { CoreError } from '@/lib/services/core/http'
import * as sales from '@/lib/services/core/sales'

// Plan U2: la cola de salida del modo sin conexión. Cada operación que no pudo llegar al servidor se guarda en orden,
// en el navegador, con los identificadores que la hacen segura de repetir (el `uuid` del pedido y de cada línea, la
// `request_key` de cada pago). Al volver la red se envían una por una; si una respuesta se perdió, repetirla no duplica
// nada en el servidor.
export type OrderRef = { uuid: string } | { id: number }
interface Base { id: string; at: string; label: string }
export type OutboxEntry = Base & (
  | { kind: 'create_order'; uuid: string; body: sales.OrderInput }
  | { kind: 'add_lines'; order: OrderRef; lines: sales.LineInput[]; fire: boolean }
  | { kind: 'fire'; order: OrderRef }
  // `amount: 'balance'`: lo que falte por pagar según el servidor al sincronizar (el total sin conexión es una cuenta
  // del equipo; el del servidor manda).
  | { kind: 'payment'; order: OrderRef; methodId: number; amount: number | 'balance'; received: number | null; reference: string; requestKey: string }
  | { kind: 'pay'; order: OrderRef }
)
type NewEntry = OutboxEntry extends infer E ? E extends OutboxEntry ? Omit<E, 'id' | 'at'> : never : never
export interface FailedEntry { entry: OutboxEntry; error: string }

const key = () => `waiter.outbox:${currentOrg() ?? '-'}`
interface Saved { entries: OutboxEntry[]; failed: FailedEntry[]; ids: Record<string, number> }
function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) ?? '{}') as Partial<Saved>
    return { entries: raw.entries ?? [], failed: raw.failed ?? [], ids: raw.ids ?? {} }
  } catch { return { entries: [], failed: [], ids: {} } }
}
function save(state: Saved): void {
  try { localStorage.setItem(key(), JSON.stringify(state)) } catch { /* sin almacenamiento: la cola vive mientras la pestaña */ }
}

const refOf = (ref: OrderRef) => ('uuid' in ref ? ref.uuid : String(ref.id))
const unreachable = (e: unknown) => e instanceof CoreError && e.code === 'unreachable'

interface OutboxState extends Saved {
  syncing: boolean
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
      case 'pay': await sales.payOrder(resolve(entry.order)); return
    }
  }
  return {
    entries: [], failed: [], ids: {}, syncing: false, loaded: false,
    hydrate: () => { if (!get().loaded) set({ ...load(), loaded: true }) },
    enqueue: (input) => {
      get().hydrate()
      const entry = { ...input, id: uuid(), at: new Date().toISOString() } as OutboxEntry
      set((s) => ({ entries: [...s.entries, entry] }))
      persist()
      return entry
    },
    sync: async () => {
      get().hydrate()
      if (get().syncing || get().entries.length === 0) return
      set({ syncing: true })
      // Pedidos cuya creación falló: lo que dependa de ellos falla con ellos, sin intentarlo.
      const broken = new Set<string>()
      try {
        while (get().entries.length > 0) {
          const entry = get().entries[0]
          const ref = entry.kind === 'create_order' ? entry.uuid : refOf(entry.order)
          try {
            if (broken.has(ref)) throw new CoreError(409, 'depends_on_failed', 'No se envió porque falló una operación anterior de este pedido.')
            await run(entry)
            set((s) => ({ entries: s.entries.slice(1) }))
          } catch (e) {
            if (unreachable(e)) break
            broken.add(ref)
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
