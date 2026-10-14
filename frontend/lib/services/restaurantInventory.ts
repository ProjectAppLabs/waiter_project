import * as coreCatalog from '@/lib/services/core/catalog'
import { currentRestaurantId, toInventoryDetail, toRecipeDetail } from '@/lib/services/core/catalogBridge'
import * as coreInventory from '@/lib/services/core/inventory'
import { useAuthStore } from '@/lib/stores/authStore'
export interface RecipeEntry { ingredientId: number; qty: number; uomId: number }
export interface RecipeDetail { id: number; name: string; bom_id: number | null; yield: number; lines: RecipeEntry[]; servings: number; cost: number; limiting: string[]; ingredients: { id: number; name: string; qty: number; uom_id: number; uom: string; stock: number; pending: number; free: number; servings: number; cost: number }[] }
export interface InventoryDetail { stock: number; pending: number; cost: number; min: number; max: number; uom: string; history: { id: number; date: string; qty: number; reason: string; kind: string; employee: string }[] }
export const getRecipe = (id: number) => coreCatalog.getRecipe(id).then((r) => toRecipeDetail(id, r, currentRestaurantId()))
export const updateRecipe = (id: number, lines: RecipeEntry[], yieldQty: number, bomId: number | null) => coreCatalog.putRecipe(id, yieldQty, lines.map((l) => ({ ingredient_id: l.ingredientId, qty: l.qty, unit_id: l.uomId }))).then((r) => toRecipeDetail(id, r, currentRestaurantId()))
export const getInventory = (id: number) => coreInventory.stockDetail(id, currentRestaurantId() ?? 0).then(toInventoryDetail)
export const moveInventory = (id: number, kind: string, qty: number, reason: string, key: string, expected: number) => coreInventory.moveStock(id, { restaurant_id: currentRestaurantId() ?? 0, kind: kind as 'receipt' | 'waste' | 'count', qty, reason, request_key: key, ...(kind === 'count' && { expected_stock: expected }) }).then(() => getInventory(id))
// En el sistema propio el costo solo lo manda el dueño: el encargado guarda mínimo y máximo sin tocarlo.
export const inventorySettings = (id: number, cost: number, min: number, max: number) => coreInventory.stockSettings(id, { restaurant_id: currentRestaurantId() ?? 0, min, max, ...(useAuthStore.getState().user?.role === 'owner' && { cost }) }).then(toInventoryDetail)
