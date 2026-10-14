import { printFiredCourse } from '@/lib/print/autoComanda'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreKitchen from '@/lib/services/core/kitchen'
import * as sales from '@/lib/services/core/sales'
import { toCompleted, toCourseSummaries, toKitchenTicket } from '@/lib/services/core/salesBridge'

export interface KitchenLine { id: number; name: string; qty: number; note: string; station: string | null; options?: string[]; readyAt: string | null; servedAt: string | null }
export interface KitchenTicket { id: number; orderId: number; tableId: number; service?: 'dine_in' | 'takeout' | 'delivery'; tracking: string; waiter: string; note: string; firedAt: string; preparationAt?: string | null; readyAt: string | null; lines: KitchenLine[] }
export interface CourseSummary { orderId: number; firedAt: string; readyAt: string | null; servedAt: string | null }
export interface CompletedCourse { firedAt: string; readyAt: string }

// Envía a cocina lo que aún no tiene curso. Devuelve el id del curso o null si no había nada nuevo.
export async function fireUnsentLines(orderId: number): Promise<number | null> {
  const courseId = (await sales.fireOrder(orderId)).course_id
  void printFiredCourse(courseId)
  return courseId
}

// El tablero de cocina en una sola lectura: las comandas disparadas y aún no entregadas, con sus líneas y quién las
// pidió, y los cursos ya listos del turno (entregados o no) para el tiempo medio. Antes eran dos lecturas idénticas
// de `kitchen/tickets` por refresco, cada una con el turno completo.
export async function listKitchenBoard(sessionId: number, stationOf: (productId: number) => string | null): Promise<{ tickets: KitchenTicket[]; done: CompletedCourse[] }> {
  void sessionId
  void stationOf
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  const board = await coreKitchen.listTickets(r)
  return { tickets: board.tickets.map(toKitchenTicket), done: board.completed.map(toCompleted) }
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
