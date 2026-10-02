import { onCore } from '@/lib/domain/backend'
import * as coreKitchen from '@/lib/services/core/kitchen'
import * as sales from '@/lib/services/core/sales'
import { toCompleted, toCourseSummaries, toKitchenTicket } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { useAuthStore } from '@/lib/stores/authStore'
import { callKw } from '@/lib/services/odoo'

// La comanda es un restaurant.order.course de Odoo (ADR 2026-09-05). Este archivo es el único
// que conoce los métodos del addon projectapp_kitchen.
export interface KitchenLine { id: number; name: string; qty: number; note: string; station: string | null; readyAt: string | null; servedAt: string | null }
export interface KitchenTicket { id: number; orderId: number; tableId: number; tracking: string; waiter: string; note: string; firedAt: string; preparationAt?: string | null; readyAt: string | null; lines: KitchenLine[] }
export interface CourseSummary { orderId: number; firedAt: string; readyAt: string | null; servedAt: string | null }
export interface CompletedCourse { firedAt: string; readyAt: string }

interface RawCourse { id: number; order_id: [number, string]; fired_date: string; preparation_date: string | false; ready_date: string | false; served_date: string | false }
interface RawKitchenLine { id: number; course_id: [number, string] | false; full_product_name: string; qty: number; customer_note: string | false; product_id: [number, string]; waiter_ready_date: string | false; served_date: string | false }
interface RawKitchenOrder { id: number; table_id: [number, string] | false; user_id: [number, string] | false; tracking_number: string | false; general_customer_note: string | false }

const COURSE = 'restaurant.order.course'
const inSession = (sessionId: number) => [['order_id.session_id', '=', sessionId], ['order_id.state', 'in', ['draft', 'paid', 'done', 'invoiced']]]

// Envía a cocina lo que aún no tiene curso. Devuelve el id del curso o null si no había nada nuevo.
export async function fireUnsentLines(orderId: number): Promise<number | null> {
  if (onCore()) return (await sales.fireOrder(orderId)).course_id
  const lines = await callKw<{ id: number }[]>('pos.order.line', 'search_read', [[['order_id', '=', orderId], ['course_id', '=', false]], ['id']])
  if (lines.length === 0) return null
  const employee = useAuthStore.getState().employee
  if (!employee?.token) throw new Error('Inicia sesión con tu PIN para enviar a cocina.')
  const id = await callKw<number | false>(COURSE, 'kitchen_fire', [orderId, lines.map((l) => l.id), employee.id, employee.token])
  return id || null
}

// Comandas disparadas y aún no entregadas, con sus líneas y quién las pidió. Tres llamadas por sondeo.
export async function listKitchenTickets(sessionId: number, stationOf: (productId: number) => string | null): Promise<KitchenTicket[]> {
  if (onCore()) { void sessionId; void stationOf; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await coreKitchen.listTickets(r)).tickets.map(toKitchenTicket) }
  const courses = await callKw<RawCourse[]>(COURSE, 'search_read',
    [[['fired', '=', true], ['served_date', '=', false], ...inSession(sessionId)], ['order_id', 'fired_date', 'preparation_date', 'ready_date', 'served_date']])
  if (courses.length === 0) return []
  const orderIds = [...new Set(courses.map((c) => c.order_id[0]))]
  const [lines, orders] = await Promise.all([
    callKw<RawKitchenLine[]>('pos.order.line', 'search_read', [[['course_id', 'in', courses.map((c) => c.id)]], ['course_id', 'full_product_name', 'qty', 'customer_note', 'product_id', 'waiter_ready_date', 'served_date']]),
    callKw<RawKitchenOrder[]>('pos.order', 'read', [orderIds, ['table_id', 'user_id', 'tracking_number', 'general_customer_note']]),
  ])
  return courses.map((c) => {
    const order = orders.find((o) => o.id === c.order_id[0])!
    return {
      id: c.id, orderId: c.order_id[0], tableId: order.table_id ? order.table_id[0] : 0,
      tracking: order.tracking_number || String(order.id), waiter: order.user_id ? order.user_id[1] : '', note: order.general_customer_note || '',
      firedAt: c.fired_date, preparationAt: c.preparation_date || null, readyAt: c.ready_date || null,
      lines: lines.filter((l) => l.course_id && l.course_id[0] === c.id)
        .map((l) => ({ id: l.id, name: l.full_product_name, qty: l.qty, note: l.customer_note || '', station: stationOf(l.product_id[0]), readyAt: l.waiter_ready_date || null, servedAt: l.served_date || null })),
    }
  })
}

// Para el tiempo medio del turno: cursos ya listos de la sesión (entregados o no).
export async function listCompletedCourses(sessionId: number): Promise<CompletedCourse[]> {
  if (onCore()) { void sessionId; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await coreKitchen.listTickets(r)).completed.map(toCompleted) }
  const rows = await callKw<RawCourse[]>(COURSE, 'search_read',
    [[['fired', '=', true], ['ready_date', '!=', false], ['order_id.session_id', '=', sessionId]], ['fired_date', 'preparation_date', 'ready_date']])
  return rows.map((r) => ({ firedAt: r.fired_date, readyAt: r.ready_date as string }))
}

// Para el salón: en qué fase de cocina está cada pedido abierto.
export async function listCourseSummaries(sessionId: number): Promise<CourseSummary[]> {
  if (onCore()) { void sessionId; const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return (await sales.listOrders(r, 'open')).flatMap(toCourseSummaries) }
  const rows = await callKw<RawCourse[]>(COURSE, 'search_read', [[['fired', '=', true], ...inSession(sessionId)], ['order_id', 'fired_date', 'preparation_date', 'ready_date', 'served_date']])
  return rows.map((r) => ({ orderId: r.order_id[0], firedAt: r.fired_date, readyAt: r.ready_date || null, servedAt: r.served_date || null }))
}

// "Listo todo": la comanda entera sale al pase, con cada uno de sus platos.
export async function markReady(courseId: number): Promise<void> {
  if (onCore()) { await coreKitchen.readyCourse(courseId); return }
  await callKw(COURSE, 'action_kitchen_ready', [[courseId]])
}

// "Listo" de un plato suelto: cocina saca de uno en uno y el mesero se lo lleva sin esperar al resto.
export async function markLineReady(lineIds: number[]): Promise<void> {
  if (onCore()) { if (lineIds.length) await coreKitchen.readyLines(lineIds); return }
  if (lineIds.length === 0) return
  await callKw('pos.order.line', 'action_kitchen_line_ready', [lineIds])
}

// "Entregar todo" del mesero: se lleva a la mesa lo que cocina ya sacó; lo que sigue en el fuego se queda.
export async function markServed(courseId: number): Promise<void> {
  if (onCore()) { await coreKitchen.serveCourse(courseId); return }
  await callKw(COURSE, 'action_kitchen_served', [[courseId]])
}

export async function startPreparation(courseId: number): Promise<void> {
  if (onCore()) { await coreKitchen.startCourse(courseId); return }
  await callKw(COURSE, 'action_kitchen_start', [[courseId]])
}
