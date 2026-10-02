'use client'

import { create } from 'zustand'

import { addLine, replaceLine, setLineQty, type CartLine, type TaxRate } from '@/lib/domain/orderWizard'
import { depositOf, emptyDraft, type ReservationDraft, type Slot } from '@/lib/domain/reservations'
import { play } from '@/lib/audio/sounds'
import { loadMenuExtras, loadTaxes, type MenuExtras } from '@/lib/services/productOptions'
import {
  createReservation, getAvailableTables, getSlots, getTimeline, setReservationState,
  type AvailableTable, type ReservationDetail, type Timeline,
} from '@/lib/services/reservations'
import type { Catalog } from '@/lib/types'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
export const todayIso = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface ReservationsState {
  date: string; floorId: number | null
  timeline: Timeline | null; loading: boolean; error: string | null
  // Qué grilla se pidió o se tiene («config|fecha|piso»): evita pedir dos veces la misma.
  loadingKey: string | null; loadedKey: string | null
  // Wizard
  open: boolean; stepIndex: number; draft: ReservationDraft
  slots: Slot[]; tables: AvailableTable[]; lines: CartLine[]
  extras: MenuExtras | null; taxes: TaxRate[]; busy: boolean
  setDate: (date: string) => void
  setFloor: (id: number | null) => void
  // `force`: recargar aunque ya esté (tras crear una reserva o cambiar su estado).
  load: (configId: number, force?: boolean) => Promise<void>
  // Al salir de Reservas: la próxima visita vuelve a pedir la grilla (otro terminal pudo crear o cambiar reservas).
  forget: () => void
  loadExtras: (catalog: Catalog) => Promise<void>
  openWizard: () => void
  closeWizard: () => void
  setDraft: (patch: Partial<ReservationDraft>) => void
  next: () => void
  back: () => void
  loadSlots: (configId: number, date: string) => Promise<void>
  loadTables: (configId: number) => Promise<void>
  add: (line: CartLine) => void
  setQty: (uuid: string, qty: number) => void
  update: (uuid: string, patch: Pick<CartLine, 'qty' | 'note' | 'options'>) => void
  clear: () => void
  create: (configId: number) => Promise<ReservationDetail | null>
  changeState: (id: number, state: 'seated' | 'no_show' | 'cancelled', configId: number) => Promise<void>
}

// Reservas del kit (7 – Reservation): la grilla del día y el asistente de cuatro pasos. El servidor
// El servidor decide franjas, mesas libres y solapes; aquí solo se orquesta la pantalla.
// Número de la petición de grilla más reciente. Solo esa puede instalar su respuesta: una más vieja que llega tarde (se
// cambió de fecha o se salió de la página) se descarta. Sin esto, volver a una fecha ya cargada mientras la otra aún
// llegaba dejaba la grilla de la otra fecha, y una respuesta tardía deshacía el `forget` de la salida.
let generation = 0

export const useReservationsStore = create<ReservationsState>((set, get) => ({
  date: todayIso(), floorId: null, timeline: null, loading: false, error: null, loadingKey: null, loadedKey: null,
  open: false, stepIndex: 0, draft: emptyDraft(), slots: [], tables: [], lines: [], extras: null, taxes: [], busy: false,

  setDate: (date) => set({ date }),
  setFloor: (floorId) => set({ floorId }),
  forget: () => { generation++; set({ loadedKey: null, loadingKey: null, loading: false }) },
  load: async (configId, force = false) => {
    const { date, floorId } = get()
    const key = `${configId}|${date}|${floorId ?? ''}`
    // La misma grilla ya pedida o ya cargada no se vuelve a pedir: el efecto de la página se dispara también cuando
    // `load` fija el piso por defecto, y el modo desarrollo de React ejecuta cada efecto dos veces.
    if (!force && (get().loadingKey === key || get().loadedKey === key)) return
    const mine = ++generation
    // Lo cargado deja de valer en cuanto se pide otra cosa: si se vuelve a la selección anterior, se pide de nuevo.
    set({ loading: true, error: null, loadingKey: key, loadedKey: null })
    try {
      const timeline = await getTimeline(configId, date, floorId)
      if (mine !== generation) return
      // Sin piso elegido se pidieron todos: se muestra el primero filtrando aquí, sin volver a pedirlo. Antes se
      // fijaba el piso y ese cambio disparaba una segunda petición, en serie: Reservas tardaba el doble en pintar.
      const floor = floorId ?? timeline.floors[0]?.id ?? null
      const shown = floorId === null ? { ...timeline, tables: timeline.tables.filter((t) => t.floorId === floor) } : timeline
      set({ timeline: shown, loading: false, floorId: floor, loadingKey: null, loadedKey: `${configId}|${date}|${floor ?? ''}` })
    } catch (e) { if (mine === generation) set({ loading: false, error: message(e), loadingKey: null }) }
  },
  loadExtras: async (catalog) => {
    try {
      const [extras, taxes] = await Promise.all([
        loadMenuExtras([...new Set(catalog.products.map((p) => p.templateId))] as number[]),
        loadTaxes([...new Set(catalog.products.flatMap((p) => p.taxIds))] as number[]),
      ])
      set({ extras, taxes })
    } catch (e) { set({ error: message(e) }) }
  },

  openWizard: () => set({ open: true, stepIndex: 0, draft: { ...emptyDraft(), date: get().date }, lines: [], tables: [] }),
  closeWizard: () => set({ open: false }),
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  next: () => set((s) => ({ stepIndex: Math.min(s.stepIndex + 1, 3) })),
  back: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),

  loadSlots: async (configId, date) => {
    try { set({ slots: await getSlots(configId, date) }) } catch (e) { set({ error: message(e) }) }
  },
  loadTables: async (configId) => {
    const { draft } = get()
    if (!draft.date || draft.timeStart === null) return
    set({ busy: true })
    try { set({ tables: await getAvailableTables(configId, draft.date, draft.timeStart, draft.people, draft.prepMinutes), busy: false }) }
    catch (e) { set({ busy: false, error: message(e) }) }
  },

  add: (line) => { play('tap'); set((s) => ({ lines: addLine(s.lines, line) })) },
  setQty: (uuid, qty) => set((s) => ({ lines: setLineQty(s.lines, uuid, qty) })),
  update: (uuid, patch) => set((s) => ({ lines: replaceLine(s.lines, uuid, patch) })),
  clear: () => set({ lines: [] }),

  create: async (configId) => {
    const { draft, lines } = get()
    if (!draft.date || draft.timeStart === null || draft.tableIds.length === 0) return null
    set({ busy: true, error: null })
    try {
      const created = await createReservation({
        customerName: draft.customerName.trim(), customerEmail: draft.customerEmail.trim(), customerPhone: draft.customerPhone.trim(),
        people: draft.people, babyChair: draft.babyChair, notes: draft.notes.trim(),
        date: draft.date, timeStart: draft.timeStart, tableIds: draft.tableIds, configId, prepMinutes: draft.prepMinutes, depositAmount: depositOf(draft),
      }, lines.map((l) => ({ productId: l.productId, qty: l.qty, note: l.note })))
      set({ busy: false, open: false, date: draft.date })
      await get().load(configId, true)
      return created
    } catch (e) {
      play('error')
      set({ busy: false, error: message(e) })
      return null
    }
  },
  changeState: async (id, state, configId) => {
    try { await setReservationState(id, state); await get().load(configId, true) }
    catch (e) { set({ error: message(e) }) }
  },
}))
