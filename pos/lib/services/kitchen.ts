import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreKitchen from '@/lib/services/core/kitchen'
import * as sales from '@/lib/services/core/sales'
import { toCompleted, toCourseSummaries, toKitchenTicket } from '@/lib/services/core/salesBridge'

export interface KitchenLine { id: number; name: string; qty: number; note: string; station: string | null; readyAt: string | null; servedAt: string | null }
export interface KitchenTicket { id: number; orderId: number; tableId: number; tracking: string; waiter: string; note: string; firedAt: string; preparationAt?: string | null; readyAt: string | null; lines: KitchenLine[] }
export interface CourseSummary { orderId: number; firedAt: string; readyAt: string | null; servedAt: string | null }
export interface CompletedCourse { firedAt: string; readyAt: string }

// Envía a cocina lo que aún no tiene curso. Devuelve el id del curso o null si no había nada nuevo.
export async function fireUnsentLines(orderId: number): Promise<number | null> {
  return (await sales.fireOrder(orderId)).course_id
}

// Comandas disparadas y aún no entregadas, con sus líneas y quién las pidió. Tres llamadas por sondeo.
export async function listKitchenTickets(sessionId: number, stationOf: (productId: number) => string | null): Promise<KitchenTicket[]> {
  void sessionId
  void stationOf
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await coreKitchen.listTickets(r)).tickets.map(toKitchenTicket)
}

// Para el tiempo medio del turno: cursos ya listos de la sesión (entregados o no).
export async function listCompletedCourses(sessionId: number): Promise<CompletedCourse[]> {
  void sessionId
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await coreKitchen.listTickets(r)).completed.map(toCompleted)
}

// Para el salón: en qué fase de cocina está cada pedido abierto.
export async function listCourseSummaries(sessionId: number): Promise<CourseSummary[]> {
  void sessionId
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return (await sales.listOrders(r, 'open')).flatMap(toCourseSummaries)
}

// "Listo todo": la comanda entera sale al pase, con cada uno de sus platos.
export async function markReady(courseId: number): Promise<void> {
  await coreKitchen.readyCourse(courseId)
  return
}

// "Listo" de un plato suelto: cocina saca de uno en uno y el mesero se lo lleva sin esperar al resto.
export async function markLineReady(lineIds: number[]): Promise<void> {
  if (lineIds.length) await coreKitchen.readyLines(lineIds)
  return
}

// "Entregar todo" del mesero: se lleva a la mesa lo que cocina ya sacó; lo que sigue en el fuego se queda.
export async function markServed(courseId: number): Promise<void> {
  await coreKitchen.serveCourse(courseId)
  return
}

export async function startPreparation(courseId: number): Promise<void> {
  await coreKitchen.startCourse(courseId)
  return
}
