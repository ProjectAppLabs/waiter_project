'use client'

import { useEffect, useState } from 'react'
import { create } from 'zustand'

import type { KitLine, KitOrder } from '@/lib/domain/orderState'
import type { AccountRole } from '@/lib/domain/roles'
import { currentOrg } from '@/lib/domain/tenant'
import { useNetworkStore } from '@/lib/offline/network'

// Plan V: el modo de emergencia. Sin internet, a los 3 minutos (o antes, si la encargada lo activa) toda la operación
// pasa a la caja: es el único equipo que toma pedidos y cobra, así no hay dos colas que choquen.
export const EMERGENCY_AFTER_MS = 3 * 60_000

// Las acciones que la caja puede hacer sin servidor. Todo lo demás (devoluciones, canje de puntos, QR, factura,
// cierre de caja, inventario, reservas, configuración, cancelar platos enviados) espera a que vuelva la red.
export const EMERGENCY_ACTIONS = ['create_order', 'add_round', 'remove_unsent', 'fire', 'precheck', 'charge_cash_or_terminal', 'cash_move', 'provisional_count'] as const

// Las pantallas de la caja en emergencia: tomar pedidos, agregar rondas (también a los de emergencia, con id negativo),
// cobrar y la lista de pedidos de emergencia.
export const emergencyPath = (pathname: string) => /^\/((salon|pedidos)\/(nuevo|-?\d+\/agregar)|pago\/-?\d+|emergencia)(\/|$)/.test(pathname)

// Quién opera en emergencia: la caja (cajero, encargado o dueño). Los meseros no.
export const operatesInEmergency = (role: AccountRole | null | undefined) => role === 'cashier' || role === 'admin' || role === 'owner'

const MANUAL = 'waiter.emergency.manual'
const read = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string | null) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* sin almacenamiento */ } }

export function activateEmergency() { write(MANUAL, '1'); useNetworkStore.setState({}) }
export const manualEmergency = () => read(MANUAL) === '1'
export function clearEmergency() { write(MANUAL, null) }

export interface EmergencyState { offline: boolean; active: boolean; remainingMs: number }
export function emergencyState(online: boolean, since: number | null, now: number): EmergencyState {
  if (online || since === null) return { offline: false, active: false, remainingMs: EMERGENCY_AFTER_MS }
  const remainingMs = Math.max(0, EMERGENCY_AFTER_MS - (now - since))
  return { offline: true, active: remainingMs === 0 || manualEmergency(), remainingMs }
}

// El estado con un reloj por segundo mientras no hay red (para la cuenta regresiva).
export function useEmergency(): EmergencyState {
  const online = useNetworkStore((s) => s.online)
  const since = useNetworkStore((s) => s.since)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (online) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [online])
  return emergencyState(online, since, online ? Date.now() : now)
}
export const emergencyNow = () => { const { online, since } = useNetworkStore.getState(); return emergencyState(online, since, Date.now()).active }

// —— Pedidos de emergencia ——————————————————————————————————————————————————————————————————————————————
// Lo que la caja necesita para seguir trabajando con un pedido creado sin conexión: sus platos, su total calculado en
// el equipo y si ya se cobró. Se guarda en el equipo; al sincronizar recibe su id y su número del servidor.
export interface EmergencyLine { uuid: string; productId: number; name: string; qty: number; unitPrice: number; total: number; note: string; options: string[] }
export interface EmergencyOrder {
  uuid: string; localId: number; number: string; type: KitOrder['type']; tableId: number | null; tableNumber: number | null; customer: string
  createdAt: string; lines: EmergencyLine[]; total: number; tax: number; paid: boolean; fired: boolean
  serverId?: number; serverNumber?: string
}

const key = () => `waiter.emergency:${currentOrg() ?? '-'}`
const today = () => new Date().toLocaleDateString('en-CA')
interface Saved { orders: EmergencyOrder[]; seq: Record<string, number>; nextLocalId: number }
function load(): Saved {
  try { const raw = JSON.parse(read(key()) ?? '{}') as Partial<Saved>; return { orders: raw.orders ?? [], seq: raw.seq ?? {}, nextLocalId: raw.nextLocalId ?? -1 } }
  catch { return { orders: [], seq: {}, nextLocalId: -1 } }
}

interface EmergencyOrdersState extends Saved {
  loaded: boolean
  hydrate: () => void
  // Número provisional E-01, E-02… por equipo y por día, y un id negativo que no choca con los del servidor.
  register: (input: Omit<EmergencyOrder, 'localId' | 'number' | 'createdAt' | 'paid' | 'fired'>) => EmergencyOrder
  update: (uuid: string, patch: Partial<EmergencyOrder>) => void
  addLines: (uuid: string, lines: EmergencyLine[], extra: number) => void
  byLocalId: (id: number) => EmergencyOrder | null
  // Ya sincronizados y cobrados de días anteriores sobran.
  prune: () => void
}

export const useEmergencyOrders = create<EmergencyOrdersState>((set, get) => {
  const persist = () => { const { orders, seq, nextLocalId } = get(); write(key(), JSON.stringify({ orders, seq, nextLocalId })) }
  return {
    orders: [], seq: {}, nextLocalId: -1, loaded: false,
    hydrate: () => { if (!get().loaded) set({ ...load(), loaded: true }) },
    register: (input) => {
      get().hydrate()
      const day = today()
      const n = (get().seq[day] ?? 0) + 1
      const order: EmergencyOrder = { ...input, localId: get().nextLocalId, number: `E-${String(n).padStart(2, '0')}`, createdAt: new Date().toISOString(), paid: false, fired: false }
      set((s) => ({ orders: [...s.orders, order], seq: { ...s.seq, [day]: n }, nextLocalId: s.nextLocalId - 1 }))
      persist()
      return order
    },
    update: (uuid, patch) => { get().hydrate(); set((s) => ({ orders: s.orders.map((o) => (o.uuid === uuid ? { ...o, ...patch } : o)) })); persist() },
    addLines: (uuid, lines, extra) => {
      get().hydrate()
      set((s) => ({ orders: s.orders.map((o) => (o.uuid === uuid ? { ...o, lines: [...o.lines, ...lines], total: o.total + extra } : o)) }))
      persist()
    },
    byLocalId: (id) => { get().hydrate(); return get().orders.find((o) => o.localId === id) ?? null },
    prune: () => {
      get().hydrate()
      const day = today()
      set((s) => ({ orders: s.orders.filter((o) => !(o.serverId && o.paid && o.createdAt.slice(0, 10) < day)) }))
      persist()
    },
  }
})

// Como pedido del kit, para que Pedidos y el salón lo muestren con las pantallas de siempre mientras no tenga id del
// servidor (después aparece el del servidor).
export function emergencyKitOrder(o: EmergencyOrder): KitOrder {
  const lines: KitLine[] = o.lines.map((l, i) => ({ id: o.localId * 1000 - i, uuid: l.uuid, productId: l.productId, name: l.name, qty: l.qty, unitPrice: l.unitPrice,
    subtotal: l.total, total: l.total, note: l.note, courseId: o.fired ? o.localId : null, readyAt: null, servedAt: null, options: l.options }))
  return { id: o.localId, number: o.number, type: o.type, state: o.paid ? 'paid' : 'draft', tableId: o.tableId, tableNumber: o.tableNumber, customer: o.customer,
    startedAt: o.createdAt, total: o.total, tax: o.tax, lines, courses: o.fired ? [{ id: o.localId, fired: true, readyAt: null, servedAt: null }] : [], tracking: o.number }
}
