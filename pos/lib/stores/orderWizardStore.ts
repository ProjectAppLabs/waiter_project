'use client'

import { create } from 'zustand'

import { addLine, cartTotals, DEFAULT_INFO, orderNote, replaceLine, setLineQty, stepsFor, toKitPayload, type CartLine, type CustomerInfo, type TaxRate, type WizardStep } from '@/lib/domain/orderWizard'
import { uuid } from '@/lib/domain/uuid'
import { play } from '@/lib/audio/sounds'
import { printOfflineComanda, stationOf, tablePlace } from '@/lib/offline/comanda'
import { useOutboxStore } from '@/lib/offline/outbox'
import { CoreError } from '@/lib/services/core/http'
import { fireUnsentLines } from '@/lib/services/kitchen'
import { createKitOrder, type CreatedOrder } from '@/lib/services/orderCreate'
import { loadMenuExtras, loadTaxes, type MenuExtras } from '@/lib/services/productOptions'
import type { Catalog } from '@/lib/types'

export interface NoteLabels { babyChair: string; delivery: (address: string, phone: string) => string }

interface WizardState {
  requestUuid: string; info: CustomerInfo; tableId: number | null; lines: CartLine[]; stepIndex: number
  extras: MenuExtras | null; taxes: TaxRate[]; created: CreatedOrder | null; busy: boolean; error: string | null
  reset: (initial?: { tableId?: number | null }) => void
  setInfo: (patch: Partial<CustomerInfo>) => void
  setTable: (id: number | null) => void
  next: () => void
  back: () => void
  add: (line: CartLine) => void
  setQty: (lineUuid: string, qty: number) => void
  update: (lineUuid: string, patch: Pick<CartLine, 'qty' | 'note' | 'options'>) => void
  clear: () => void
  loadExtras: (catalog: Catalog) => Promise<void>
  createOrder: (sessionId: number, labels: NoteLabels) => Promise<CreatedOrder | null>
  fireKitchen: (orderId: number) => Promise<boolean>
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const EMPTY = { info: DEFAULT_INFO, tableId: null, lines: [] as CartLine[], stepIndex: 0, created: null, busy: false, error: null }

export const useOrderWizardStore = create<WizardState>((set, get) => ({
  ...EMPTY, requestUuid: uuid(), extras: null, taxes: [],
  reset: (initial) => set({ ...EMPTY, requestUuid: uuid(), tableId: initial?.tableId ?? null }),
  setInfo: (patch) => set((s) => ({ info: { ...s.info, ...patch }, stepIndex: patch.type && patch.type !== s.info.type ? 0 : s.stepIndex })),
  setTable: (id) => set({ tableId: id }),
  next: () => set((s) => ({ stepIndex: Math.min(s.stepIndex + 1, stepsFor(s.info.type).length - 1) })),
  back: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
  add: (line) => { play('tap'); set((s) => ({ lines: addLine(s.lines, line) })) },
  setQty: (u, q) => set((s) => ({ lines: setLineQty(s.lines, u, q) })),
  update: (u, patch) => set((s) => ({ lines: replaceLine(s.lines, u, patch) })),
  clear: () => set({ lines: [] }),
  // Adiciones, descripciones e impuestos se leen una vez por catálogo.
  loadExtras: async (catalog) => {
    try {
      const [extras, taxes] = await Promise.all([
        loadMenuExtras([...new Set(catalog.products.map((p) => p.templateId))]),
        loadTaxes([...new Set(catalog.products.flatMap((p) => p.taxIds))]),
      ])
      set({ extras, taxes })
    } catch (e) { set({ error: message(e) }) }
  },
  createOrder: async (sessionId, labels) => {
    if (get().busy) return null
    if (get().created) return get().created
    const { info, tableId, lines, requestUuid } = get()
    set({ busy: true, error: null })
    try {
      const { total, tax } = cartTotals(lines, get().taxes)
      const place = tablePlace(tableId)
      const label = info.name.trim() || (info.type === 'dineIn' && place.kind === 'table' ? `Mesa ${place.number}` : '')
      const created = await createKitOrder(toKitPayload({ uuid: requestUuid, tableId, info, note: orderNote(info, labels) }), lines, { total, tax, label })
      set({ created, busy: false })
      return created
    } catch (e) {
      play('error')
      set({ busy: false, error: message(e) })
      return null
    }
  },
  fireKitchen: async (orderId) => {
    set({ busy: true })
    // Plan U2: sin conexión el envío a cocina queda en la cola y, si este equipo imprime, la comanda sale impresa.
    const queue = () => {
      const { requestUuid, lines, info, tableId } = get()
      useOutboxStore.getState().enqueue({ kind: 'fire', order: orderId < 0 ? { uuid: requestUuid } : { id: orderId }, label: info.name.trim() })
      printOfflineComanda({
        number: info.name.trim() || '—', place: info.type === 'dineIn' ? tablePlace(tableId) : { kind: info.type === 'delivery' ? 'delivery' : 'takeout' },
        lines: lines.map((l) => ({ qty: l.qty, name: l.name, options: l.options.map((o) => o.name), note: l.note, station: stationOf(l.productId) })),
      })
      set({ busy: false, error: null })
      return true
    }
    if (orderId < 0) return queue()
    try { await fireUnsentLines(orderId); set({ busy: false, error: null }); return true } catch (e) {
      if (e instanceof CoreError && e.code === 'unreachable') return queue()
      set({ busy: false, error: message(e) }); return false
    }
  },
}))

export const currentStep = (s: Pick<WizardState, 'info' | 'stepIndex'>): WizardStep => stepsFor(s.info.type)[s.stepIndex]
