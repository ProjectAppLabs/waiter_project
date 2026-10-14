import { hasModule } from '@/lib/domain/modules'
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
  // Plan W: con el Salón apagado en el local el servidor responde 403 a sus pisos. Los módulos activos llegan en los
  // ajustes (la misma fuente con la que el POS oculta sus secciones): sin Salón no se piden y la carta abre sin salón.
  const settingsLoad = sales.getSettings(id)
  const floorsLoad = settingsLoad.then((s) => (hasModule(s.modules, 'salon') ? coreTables.listFloors(id) : []))
  const [menu, org, floors, methods, settings] = await Promise.all([coreCatalog.getMenu(id), corePos.getOrg(), floorsLoad, sales.listMethods(id), settingsLoad])
  const name = useAuthStore.getState().restaurants?.find((r) => r.id === id)?.name ?? org.name
  return toCatalog(menu, id, name, org.name, salonOf(floors, methods), toSettings(settings, id, name))
}
