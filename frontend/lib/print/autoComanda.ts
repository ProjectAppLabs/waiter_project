import { fromTicket } from '@/lib/domain/comanda'
import { readPrintSettings } from '@/lib/print/settings'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreKitchen from '@/lib/services/core/kitchen'
import { toKitchenTicket } from '@/lib/services/core/salesBridge'
import { usePrintStore } from '@/lib/stores/printStore'

// Las rondas ya impresas en esta pestaña: el cobro y el envío explícito pueden llegar a la misma.
const printed = new Set<number>()

// Plan U3: si este equipo imprime comandas al enviar a cocina, imprime la ronda recién enviada con lo que cocina ve en
// su pantalla (el ticket del servidor: estación y opciones de cada plato). Con `courseId` null y un pedido, imprime la
// última ronda de ese pedido aún no impresa: cobrar un pedido también lo envía a cocina. Nunca falla el envío: si no
// puede leer el ticket, no imprime.
export async function printFiredCourse(courseId: number | null, orderId?: number): Promise<void> {
  if ((courseId === null && orderId === undefined) || !readPrintSettings().autoComanda) return
  const restaurantId = currentRestaurantId()
  if (!restaurantId) return
  try {
    const tickets = (await coreKitchen.listTickets(restaurantId)).tickets
    const ticket = courseId !== null
      ? tickets.find((t) => t.id === courseId)
      : tickets.filter((t) => t.order_id === orderId && !printed.has(t.id)).sort((a, b) => b.fired_at.localeCompare(a.fired_at))[0]
    if (!ticket || printed.has(ticket.id)) return
    printed.add(ticket.id)
    usePrintStore.getState().printComanda(fromTicket(toKitchenTicket(ticket)), { auto: true })
  } catch { /* sin ticket no hay comanda: el pedido ya llegó a cocina */ }
}
