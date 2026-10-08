'use client'

import { create } from 'zustand'

import { currentOrg } from '@/lib/domain/tenant'
import { uuid } from '@/lib/domain/uuid'
import { CoreError } from '@/lib/services/core/http'
import { captureCacheContext, isCurrentCacheContext } from '@/lib/offline/cache'
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
  | { kind: 'payment'; order: OrderRef; methodId: number; amount: number | 'balance'; received: number | null; reference: string; requestKey: string; expected?: number; cash?: boolean; payloadVersion?: 1 }
  | { kind: 'pay'; order: OrderRef; paidAt?: string }
  | { kind: 'cash_move'; shiftId: number; type: 'in' | 'out'; amount: number; reason: string; requestKey: string }
)
type NewEntry = OutboxEntry extends infer E ? E extends OutboxEntry ? Omit<E, 'id' | 'at'> : never : never
export interface FailedEntry { entry: OutboxEntry; error: string }
export interface PaymentReview { order: sales.CoreOrder; payment: sales.CorePayment | null; canConfirm: boolean }
// Plan V: cuando el servidor dice que la sesión venció, la cola espera a que alguien vuelva a entrar.
const sessionExpired = (e: unknown) => e instanceof CoreError && (e.status === 401 || e.code === 'unauthenticated')

const key = () => `waiter.outbox:${currentOrg() ?? '-'}`
interface Saved { entries: OutboxEntry[]; failed: FailedEntry[]; ids: Record<string, number> }
const cashMoveNeedsReview = (entry: OutboxEntry) => entry.kind === 'cash_move' && (typeof entry.requestKey !== 'string' || !entry.requestKey.trim())
const CASH_MOVE_REVIEW_MESSAGE = 'Revisa este movimiento en el historial de caja antes de volver a registrarlo: se guardó sin identificador y pudo haberse aplicado.'
const PAYMENT_REVIEW_MESSAGE = 'El pago pudo haberse aplicado. Consulta el pedido en el servidor y coteja el comprobante antes de confirmar; no vuelvas a cobrarlo a ciegas.'
const CLOSING_REVIEW_MESSAGE = 'El cierre espera la revisión del pago y del saldo del pedido.'
const refOf = (ref: OrderRef) => ('uuid' in ref ? ref.uuid : String(ref.id))
const paymentNeedsReview = (entry: OutboxEntry) => entry.kind === 'payment' && entry.amount === 'balance' && entry.payloadVersion !== 1
function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) ?? '{}') as Partial<Saved>
    const entries: OutboxEntry[] = []
    const failed = [...(raw.failed ?? [])]
    const blocked = new Set<string>()
    for (const entry of [...(raw.entries ?? []), ...failed.map((f) => f.entry)]) {
      if (paymentNeedsReview(entry) && entry.kind === 'payment') blocked.add(refOf(entry.order))
    }
    for (const { entry } of failed) if (entry.kind === 'payment') blocked.add(refOf(entry.order))
    for (const entry of raw.entries ?? []) {
      // No puede saberse si el servidor aceptó un POST antiguo cuya respuesta se perdió.
      if (cashMoveNeedsReview(entry)) failed.push({ entry, error: CASH_MOVE_REVIEW_MESSAGE })
      else if (paymentNeedsReview(entry)) failed.push({ entry, error: PAYMENT_REVIEW_MESSAGE })
      else if (entry.kind === 'pay' && blocked.has(refOf(entry.order))) failed.push({ entry, error: CLOSING_REVIEW_MESSAGE })
      else entries.push(entry)
    }
    return { entries, failed, ids: raw.ids ?? {} }
  } catch { return { entries: [], failed: [], ids: {} } }
}
function save(state: Saved, durable = false): void {
  try { localStorage.setItem(key(), JSON.stringify(state)) } catch {
    if (durable) throw new CoreError(409, 'payment_storage_unavailable', 'No se envió el pago: no se pudo guardar su importe de forma segura. Conserva esta pestaña y revisa el almacenamiento del equipo.')
    // La cola sigue en memoria, pero ningún pago se envía sin guardar antes su contenido exacto.
  }
}

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
  review: (id: string) => Promise<PaymentReview>
  confirmReview: (id: string) => Promise<PaymentReview>
  // El id del servidor de un pedido creado sin conexión, una vez sincronizado.
  serverId: (ref: OrderRef) => number | null
}

export const useOutboxStore = create<OutboxState>((set, get) => {
  const reviewing = new Set<string>()
  const persist = () => { const { entries, failed, ids } = get(); save({ entries, failed, ids }) }
  const resolve = (ref: OrderRef): number => {
    if ('id' in ref) return ref.id
    const id = get().ids[ref.uuid]
    if (id === undefined) throw new CoreError(409, 'missing_order', 'El pedido de esta operación no se pudo crear.')
    return id
  }
  const sameOrder = (entry: OutboxEntry, id: number) => entry.kind !== 'create_order' && entry.kind !== 'cash_move' && get().serverId(entry.order) === id
  async function review(id: string): Promise<PaymentReview> {
    const failed = get().failed.find((f) => f.entry.id === id)
    if (!failed || (failed.entry.kind !== 'payment' && failed.entry.kind !== 'pay')) {
      throw new CoreError(409, 'review_changed', 'Esta operación ya no está pendiente de revisión.')
    }
    const entry = failed.entry
    const context = captureCacheContext()
    const orderId = resolve(entry.order)
    const order = await sales.getOrder(orderId, { offlineFallback: false })
    if (!isCurrentCacheContext(context) || get().failed.find((f) => f.entry.id === id)?.entry !== entry || order.id !== orderId
      || ('uuid' in entry.order && order.uuid !== entry.order.uuid)) {
      throw new CoreError(409, 'review_changed', 'La sesión o el pedido cambió. Consulta de nuevo antes de confirmar.')
    }
    if (entry.kind === 'pay') {
      const unresolved = get().failed.some((f) => f.entry.kind === 'payment' && sameOrder(f.entry, orderId))
      return { order, payment: null, canConfirm: !unresolved && (order.state === 'paid' || (order.state === 'draft' && order.paid >= order.total)) }
    }
    const matches = (order.payments ?? []).filter((p) => p.request_key !== null && p.request_key === entry.requestKey.trim()
      && p.method_id === entry.methodId && p.reference === entry.reference.trim() && p.received === entry.received
      && (entry.amount === 'balance' || p.amount === entry.amount))
    const payment = matches.length === 1 ? matches[0] : null
    return { order, payment, canConfirm: payment !== null }
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
        if (paymentNeedsReview(entry)) throw new CoreError(409, 'payment_review_required', PAYMENT_REVIEW_MESSAGE)
        const id = resolve(entry.order)
        let amount = entry.amount
        if (amount === 'balance') {
          const order = await sales.getOrder(id, { offlineFallback: false })
          amount = Math.max(0, order.total - order.paid)
          if (amount === 0) return
        }
        const prepared = { ...entry, amount, reference: entry.reference.trim(), requestKey: entry.requestKey.trim() }
        const next = { entries: get().entries.map((e) => e.id === entry.id ? prepared : e), failed: get().failed, ids: get().ids }
        // El snapshot precede al POST; una respuesta perdida no permite cambiar el importe ni la clave al reintentar.
        save(next, true)
        set(next)
        await sales.addPayment(id, { method_id: prepared.methodId, amount, request_key: prepared.requestKey, ...(prepared.received !== null && { received: prepared.received }), ...(prepared.reference && { reference: prepared.reference }) })
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
      const entry = { ...input, ...(input.kind === 'payment' && { payloadVersion: 1 }), id: uuid(), at: new Date().toISOString() } as OutboxEntry
      set((s) => ({ entries: [...s.entries, entry] }))
      persist()
      return entry
    },
    sync: async () => {
      get().hydrate()
      if (get().syncing || get().needsLogin || get().entries.length === 0) return
      set({ syncing: true })
      // Pedidos cuya creación falló: lo que dependa de ellos falla con ellos, sin intentarlo.
      const broken = new Set(get().failed.filter((f) => f.entry.kind === 'payment').map((f) => refOf((f.entry as Extract<OutboxEntry, { kind: 'payment' }>).order)))
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
            set((s) => ({ entries: s.entries.slice(1), failed: [...s.failed, { entry: s.entries[0], error }] }))
          }
          persist()
        }
      } finally {
        set({ syncing: false })
        persist()
      }
    },
    discard: (id) => {
      // Una entrada de pago o cierre solo se resuelve contra el servidor; quitarla no prueba que el cobro no ocurrió.
      set((s) => ({ failed: s.failed.filter((f) => f.entry.id !== id || f.entry.kind === 'payment' || f.entry.kind === 'pay') }))
      persist()
    },
    review,
    confirmReview: async (id) => {
      if (reviewing.has(id) || get().syncing) throw new CoreError(409, 'review_busy', 'Espera a que termine la operación en curso.')
      reviewing.add(id)
      try {
        const context = captureCacheContext()
        // La confirmación nunca usa el resultado de una consulta anterior ni vuelve a enviar el pago.
        const result = await review(id)
        const current = get().failed.find((f) => f.entry.id === id)
        if (!isCurrentCacheContext(context) || !current) throw new CoreError(409, 'review_changed', 'La sesión o la operación cambió. Consulta de nuevo antes de confirmar.')
        if (!result.canConfirm) throw new CoreError(409, 'payment_unverified', 'No se pudo comprobar el pago o el saldo. Conserva la operación y coteja el comprobante real.')
        const entry = current.entry
        const entries = [...get().entries]
        if (entry.kind === 'pay' && result.order.state === 'draft') entries.push(entry)
        const failed = get().failed.filter((f) => f.entry.id !== id && !(result.order.state === 'paid' && f.entry.kind === 'pay' && sameOrder(f.entry, result.order.id)))
        const next = { entries, failed, ids: get().ids }
        save(next, true)
        set(next)
        return result
      } finally { reviewing.delete(id) }
    },
    serverId: (ref) => ('id' in ref ? ref.id : get().ids[ref.uuid] ?? null),
  }
})

export const newRequestKey = () => `offline-${uuid()}`
