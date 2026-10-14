import { type Dish, type Ingredient, type KitUnitKey, type PantryCategory, type RecipeLine } from '@/lib/domain/pantry'
import * as coreCatalog from '@/lib/services/core/catalog'
import { photoUrl } from '@/lib/services/core/catalog'
import { currentRestaurantId, mapIngredientInput, toRequest as toCoreRequest, toDish, toIngredient, toKitUnits, toRecipeLines, toSupplier } from '@/lib/services/core/catalogBridge'
import * as coreInventory from '@/lib/services/core/inventory'

export interface KitUnit { key: KitUnitKey; id: number; uomName: string }
export interface Supplier { id: number; name: string; hasImage: boolean }
export interface RequestLineRow { id: number; productId: number; name: string; qty: number; uomName: string }
export interface PantryRequest { id: number; name: string; state: string; stateLabel: string; supplierName: string; date: string; lines: RequestLineRow[] }
export interface DishInput { name: string; categoryIds: number[]; description: string; price: number; recipe: { ingredientId: number; qty: number; uomId: number }[] }
export interface IngredientInput { name: string; category: PantryCategory; uomId: number; stock: number; image?: string; supplierId: number }

export const imageUrl = (id: number, size: 256 | 512 = 512) => (photoUrl(id, size === 256 ? 'card' : 'dish'))

export async function ensureKitUnits(): Promise<KitUnit[]> {
  return toKitUnits(await coreCatalog.listUnits())
}

// Un proveedor nuevo desde el asistente de ingrediente: en el sistema propio nace sin proveedores y el asistente lo exige.
export async function createSupplier(name: string): Promise<Supplier> {
  return toSupplier(await coreCatalog.createSupplier({ name }))
}

export async function listSuppliers(): Promise<Supplier[]> {
  return (await coreCatalog.listSuppliers()).map(toSupplier)
}

export async function listDishes(): Promise<Dish[]> {
  const r = currentRestaurantId()
  return r === null ? [] : ((await coreInventory.listInventory(r, true)).dishes ?? []).map(toDish)
}

export async function listIngredients(): Promise<Ingredient[]> {
  const r = currentRestaurantId()
  return r === null ? [] : (await coreInventory.listInventory(r)).ingredients.map(toIngredient)
}

export async function recipeLines(dishId: number): Promise<RecipeLine[]> {
  return toRecipeLines(await coreCatalog.getRecipe(dishId), currentRestaurantId())
}

export async function listRequests(): Promise<PantryRequest[]> {
  const r = currentRestaurantId()
  return r === null ? [] : (await coreInventory.listRequests(r)).map(toCoreRequest)
}

export async function requestIngredient(ingredientId: number): Promise<PantryRequest> {
  const r = currentRestaurantId()
  if (r === null) throw new Error('Elige un restaurante.')
  return toCoreRequest(await coreInventory.requestIngredient(r, ingredientId))
}

export async function createDish(d: DishInput): Promise<number> {
  // El plato nace con el impuesto del régimen vigente de la organización (INC o IVA); con régimen mixto o sin impuesto, ninguno.
  const { taxes, regime } = await coreCatalog.listTaxes()
  const taxIds = regime === 'inc' || regime === 'iva' ? taxes.filter((t) => t.amount === (regime === 'inc' ? 8 : 19)).map((t) => t.id).slice(0, 1) : []
  const created = await coreCatalog.createProduct({
    name: d.name, kind: 'dish', category_ids: d.categoryIds, price: d.price, tax_ids: taxIds, description: d.description,
    ...(d.recipe.length && { recipe: { yield_qty: 1, lines: d.recipe.map((l) => ({ ingredient_id: l.ingredientId, qty: l.qty, unit_id: l.uomId })) } })
  })
  return created.id
}

export async function createIngredient(i: IngredientInput): Promise<number> {
  const r = currentRestaurantId()
  const created = await coreCatalog.createProduct({ ...mapIngredientInput(i), initial_stock: r !== null && i.stock > 0 ? [{ restaurant_id: r, qty: i.stock }] : [] })
  return created.id
}

export async function updateIngredient(current: Ingredient, i: IngredientInput): Promise<void> {
  await coreCatalog.updateProduct(current.id, mapIngredientInput(i))
  const r = currentRestaurantId()
  // Las existencias se fijan con un conteo, que exige el valor actual: nadie pisa lo que otro acaba de registrar.
  if (r !== null && i.stock !== current.qty) await coreInventory.moveStock(current.id, { restaurant_id: r, kind: 'count', qty: i.stock, reason: 'Ajuste al editar el ingrediente', request_key: `edit-${current.id}-${Date.now()}`, expected_stock: current.qty })
  return
}

export async function archiveIngredient(id: number): Promise<void> {
  await coreCatalog.archiveProduct(id)
  return
}
