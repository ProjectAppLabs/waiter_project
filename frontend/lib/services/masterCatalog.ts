import * as coreCatalog from '@/lib/services/core/catalog'
import { toMasterCatalog } from '@/lib/services/core/catalogBridge'

// Plan O: el catálogo maestro de la organización con lo propio de cada restaurante (precio local y agotado).
export interface MasterDish { templateId: number; variantId: number; name: string; category: string; basePrice: number; unavailableIn: number[] }
export interface MasterCatalog { dishes: MasterDish[]; prices: Record<number, Record<number, number>> }

export async function loadMasterCatalog(restaurantIds: number[]): Promise<MasterCatalog> {
  return toMasterCatalog(await coreCatalog.restaurantsCatalog(), restaurantIds)
}

export const setDishAvailability = (templateId: number, configId: number, available: boolean) => coreCatalog.setRestaurantProduct(configId, templateId, { unavailable: !available })

// `price` null vuelve al precio de la organización. Devuelve el precio resultante en ese restaurante.
export const setDishPrice = (configId: number, templateId: number, price: number | null) => coreCatalog.setRestaurantProduct(configId, templateId, { price }).then(async () => price ?? (await coreCatalog.restaurantsCatalog()).dishes.find((d) => d.id === templateId)?.price ?? 0)

// Los platos de `templateIds` agotados en el restaurante `configId`.
export async function closedDishes(templateIds: number[], configId: number): Promise<Set<number>> {
  return new Set(((await coreCatalog.restaurantsCatalog()).unavailable[String(configId)] ?? []).filter((id) => templateIds.includes(id)))
}
