import * as coreCatalog from '@/lib/services/core/catalog'
import { currentRestaurantId, toCatalog } from '@/lib/services/core/catalogBridge'
import * as corePos from '@/lib/services/core/pos'
import * as sales from '@/lib/services/core/sales'
import { salonOf, toSettings } from '@/lib/services/core/salesBridge'
import * as coreTables from '@/lib/services/core/tables'
import { useAuthStore } from '@/lib/stores/authStore'
import type { Catalog } from '@/lib/types'

export async function loadPosData(sessionId: number | null, restaurantId: number | null = null): Promise<Catalog> {
  // Carta, salón, pagos y ajustes del restaurante en el sistema propio.
  const id = restaurantId ?? currentRestaurantId()
  if (id === null) throw new Error('Elige un restaurante.')
  const [menu, org, floors, methods, settings] = await Promise.all([coreCatalog.getMenu(id), corePos.getOrg(), coreTables.listFloors(id), sales.listMethods(id), sales.getSettings(id)])
  const name = useAuthStore.getState().restaurants?.find((r) => r.id === id)?.name ?? org.name
  return toCatalog(menu, id, name, org.name, salonOf(floors, methods), toSettings(settings, id, name))
}
