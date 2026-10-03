import { fromTicket } from '@/lib/domain/comanda'
import { readPrintSettings } from '@/lib/print/settings'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as coreKitchen from '@/lib/services/core/kitchen'
import { toKitchenTicket } from '@/lib/services/core/salesBridge'
import { usePrintStore } from '@/lib/stores/printStore'

// Plan U3: si este equipo imprime comandas al enviar a cocina, imprime la ronda recién enviada con lo que cocina ve en
// su pantalla (el ticket del servidor: estación y opciones de cada plato). Nunca falla el envío: si no puede leer el
// ticket, no imprime.
export async function printFiredCourse(courseId: number | null): Promise<void> {
  if (courseId === null || !readPrintSettings().autoComanda) return
  const restaurantId = currentRestaurantId()
  if (!restaurantId) return
  try {
    const ticket = (await coreKitchen.listTickets(restaurantId)).tickets.find((t) => t.id === courseId)
    if (ticket) usePrintStore.getState().printComanda(fromTicket(toKitchenTicket(ticket)), { auto: true })
  } catch { /* sin ticket no hay comanda: el pedido ya llegó a cocina */ }
}
