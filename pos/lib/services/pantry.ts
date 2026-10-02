import { onCore } from '@/lib/domain/backend'
import * as coreCatalog from '@/lib/services/core/catalog'
import { photoUrl } from '@/lib/services/core/catalog'
import * as coreInventory from '@/lib/services/core/inventory'
import { currentRestaurantId, mapIngredientInput, toDish, toIngredient, toKitUnits, toRecipeLines, toRequest as toCoreRequest, toSupplier } from '@/lib/services/core/catalogBridge'
import { KIT_UNITS, type Dish, type Ingredient, type KitUnitKey, type PantryCategory, type RecipeLine } from '@/lib/domain/pantry'
import { callKw } from '@/lib/services/odoo'

// Inventario del kit sobre el addon `projectapp_pantry` (Odoo): los niveles, el estado, las raciones servibles y
// las solicitudes de compra los calcula y los guarda él. Aquí solo se llaman sus métodos y se traduce la forma.

const MODEL = 'product.template'
export const DISH_DOMAIN = [['is_ingredient', '=', false], ['available_in_pos', '=', true], ['pos_categ_ids', '!=', false]]
export const INGREDIENT_DOMAIN = [['is_ingredient', '=', true]]
const DISH_FIELDS = ['name', 'pos_categ_ids', 'available_in_pos', 'has_recipe', 'servings_available', 'pantry_level', 'list_price', 'image_128']
const INGREDIENT_FIELDS = ['name', 'pantry_category', 'qty_available', 'uom_id', 'pantry_level', 'pantry_status', 'pantry_supplier_id', 'pantry_min', 'pantry_max', 'image_128']

export interface KitUnit { key: KitUnitKey; id: number; uomName: string }
export interface Supplier { id: number; name: string; hasImage: boolean }
export interface RequestLineRow { id: number; productId: number; name: string; qty: number; uomName: string }
export interface PantryRequest { id: number; name: string; state: string; stateLabel: string; supplierName: string; date: string; lines: RequestLineRow[] }
export interface DishInput { name: string; categoryIds: number[]; description: string; price: number; recipe: { ingredientId: number; qty: number; uomId: number }[] }
export interface IngredientInput { name: string; category: PantryCategory; uomId: number; stock: number; image?: string; supplierId: number }

type Ref = [number, string] | false
interface RawDish { id: number; name: string; pos_categ_ids: number[]; available_in_pos: boolean; has_recipe: boolean; servings_available: number; pantry_level: string | false; list_price: number; image_128: string | false }
interface RawIngredient { id: number; name: string; pantry_category: string | false; qty_available: number; uom_id: [number, string]; pantry_level: string | false; pantry_status: string | false; pantry_supplier_id: Ref; pantry_min: number; pantry_max: number; image_128: string | false }
interface RawRecipeLine { id: number; product_tmpl_id: number; name: string; qty: number; uom_name: string; level: string | false; status: string | false; servings: number }
interface RawRequest { id: number; name: string; state: string; state_label: string; partner_name: string; date_order: string; lines: { id: number; product_tmpl_id: number; name: string; qty: number; uom_name: string }[] }

export const imageUrl = (id: number, size: 256 | 512 = 512) => (onCore() ? photoUrl(id, size === 256 ? 'card' : 'dish') : `/odoo/web/image/product.template/${id}/image_${size}`)

// Las seis unidades del kit: Odoo trae g, kg y Units; Manojo, Diente y Rebanada las crea el POS una sola vez.
export async function ensureKitUnits(): Promise<KitUnit[]> {
  if (onCore()) return toKitUnits(await coreCatalog.listUnits())
  const rows = await callKw<{ id: number; name: string }[]>('uom.uom', 'search_read', [[['name', 'in', KIT_UNITS.map((u) => u.uom)]], ['name']])
  const units: KitUnit[] = []
  for (const unit of KIT_UNITS) {
    const found = rows.find((r) => r.name === unit.uom)
    if (!found && ['liter','milliliter'].includes(unit.key)) throw new Error('Activa las unidades L y ml en Odoo para usar ingredientes líquidos.')
    const id = found ? found.id : await callKw<number>('uom.uom', 'create', [{ name: unit.uom, relative_factor: 1 }])
    units.push({ key: unit.key, id, uomName: unit.uom })
  }
  return units
}

// Un proveedor nuevo desde el asistente de ingrediente: en el sistema propio nace sin proveedores y el asistente lo exige.
export async function createSupplier(name: string): Promise<Supplier> {
  if (onCore()) return toSupplier(await coreCatalog.createSupplier({ name }))
  const id = await callKw<number>('res.partner', 'create', [{ name, supplier_rank: 1 }])
  return { id, name, hasImage: false }
}

export async function listSuppliers(): Promise<Supplier[]> {
  if (onCore()) return (await coreCatalog.listSuppliers()).map(toSupplier)
  const rows = await callKw<{ id: number; name: string; image_128: string | false }[]>('res.partner', 'search_read', [[['supplier_rank', '>', 0]], ['name', 'image_128']], { order: 'name asc' })
  return rows.map((r) => ({ id: r.id, name: r.name, hasImage: Boolean(r.image_128) }))
}

// Platos de la carta del POS. `has_recipe`, `servings_available` y `pantry_level` son calculados del addon: se leen
// con search_read (no se pueden filtrar en el dominio porque no están almacenados).
export async function listDishes(): Promise<Dish[]> {
  if (onCore()) { const r = currentRestaurantId(); return r === null ? [] : ((await coreInventory.listInventory(r, true)).dishes ?? []).map(toDish) }
  const rows = await callKw<RawDish[]>(MODEL, 'search_read', [DISH_DOMAIN, DISH_FIELDS], { order: 'name asc' })
  return rows.map((r) => ({
    id: r.id, name: r.name, categoryIds: r.pos_categ_ids, hasImage: Boolean(r.image_128), price: r.list_price,
    availableInPos: r.available_in_pos, hasRecipe: r.has_recipe, servings: r.servings_available,
    level: (r.pantry_level || null) as Dish['level'],
  }))
}

export async function listIngredients(): Promise<Ingredient[]> {
  if (onCore()) { const r = currentRestaurantId(); return r === null ? [] : (await coreInventory.listInventory(r)).ingredients.map(toIngredient) }
  const rows = await callKw<RawIngredient[]>(MODEL, 'search_read', [INGREDIENT_DOMAIN, INGREDIENT_FIELDS], { order: 'name asc' })
  return rows.map((r) => ({
    id: r.id, name: r.name, category: (r.pantry_category || null) as PantryCategory | null, qty: r.qty_available,
    uomId: r.uom_id[0], uomName: r.uom_id[1], level: (r.pantry_level || null) as Ingredient['level'],
    status: (r.pantry_status || null) as Ingredient['status'], supplierId: r.pantry_supplier_id ? r.pantry_supplier_id[0] : null,
    supplierName: r.pantry_supplier_id ? r.pantry_supplier_id[1] : null, hasImage: Boolean(r.image_128),
    min: r.pantry_min, max: r.pantry_max,
  }))
}

// Receta del plato tal como la da el addon: cantidad por ración, nivel y estado de cada ingrediente.
export async function recipeLines(dishId: number): Promise<RecipeLine[]> {
  if (onCore()) return toRecipeLines(await coreCatalog.getRecipe(dishId), currentRestaurantId())
  const rows = await callKw<RawRecipeLine[]>(MODEL, 'recipe_lines', [[dishId]])
  return rows.map((r) => ({
    id: r.id, ingredientId: r.product_tmpl_id, name: r.name, qty: r.qty, uomName: r.uom_name,
    level: (r.level || null) as RecipeLine['level'], status: (r.status || null) as RecipeLine['status'], servings: r.servings,
  }))
}

const toRequest = (r: RawRequest): PantryRequest => ({
  id: r.id, name: r.name, state: r.state, stateLabel: r.state_label, supplierName: r.partner_name, date: r.date_order,
  lines: r.lines.map((l) => ({ id: l.id, productId: l.product_tmpl_id, name: l.name, qty: l.qty, uomName: l.uom_name })),
})

export async function listRequests(): Promise<PantryRequest[]> {
  if (onCore()) { const r = currentRestaurantId(); return r === null ? [] : (await coreInventory.listRequests(r)).map(toCoreRequest) }
  return (await callKw<RawRequest[]>(MODEL, 'waiter_request_list', [])).map(toRequest)
}

// "Request Ingredients": el addon crea la solicitud de compra al proveedor del ingrediente y no la duplica.
// Sin proveedor lanza un UserError que la pantalla muestra tal cual.
export async function requestIngredient(ingredientId: number): Promise<PantryRequest> {
  if (onCore()) { const r = currentRestaurantId(); if (r === null) throw new Error('Elige un restaurante.'); return toCoreRequest(await coreInventory.requestIngredient(r, ingredientId)) }
  return toRequest(await callKw<RawRequest>(MODEL, 'waiter_request_ingredient', [ingredientId]))
}

export async function createDish(d: DishInput): Promise<number> {
  if (onCore()) {
    // El plato nace con el impuesto del régimen vigente de la organización (INC o IVA); con régimen mixto o sin impuesto, ninguno.
    const { taxes, regime } = await coreCatalog.listTaxes()
    const taxIds = regime === 'inc' || regime === 'iva' ? taxes.filter((t) => t.amount === (regime === 'inc' ? 8 : 19)).map((t) => t.id).slice(0, 1) : []
    const created = await coreCatalog.createProduct({ name: d.name, kind: 'dish', category_ids: d.categoryIds, price: d.price, tax_ids: taxIds, description: d.description,
      ...(d.recipe.length && { recipe: { yield_qty: 1, lines: d.recipe.map((l) => ({ ingredient_id: l.ingredientId, qty: l.qty, unit_id: l.uomId })) } }) })
    return created.id
  }
  const vals = { name: d.name, list_price: d.price, pos_categ_ids: [[6, 0, d.categoryIds]], description_sale: d.description || false }
  const recipe = d.recipe.map((l) => ({ product_tmpl_id: l.ingredientId, qty: l.qty, uom_id: l.uomId }))
  const created = await callKw<{ id: number }>(MODEL, 'waiter_create_dish', [vals, recipe])
  return created.id
}

const ingredientValues = (i: IngredientInput) => ({ name: i.name, pantry_category: i.category, uom_id: i.uomId, ...(i.image !== undefined ? { image_1920: i.image } : {}) })

export async function createIngredient(i: IngredientInput): Promise<number> {
  if (onCore()) {
    const r = currentRestaurantId()
    const created = await coreCatalog.createProduct({ ...mapIngredientInput(i), initial_stock: r !== null && i.stock > 0 ? [{ restaurant_id: r, qty: i.stock }] : [] })
    return created.id
  }
  const created = await callKw<{ id: number }>(MODEL, 'waiter_create_ingredient', [ingredientValues(i), i.stock, i.supplierId])
  return created.id
}

// Odoo no deja cambiar la unidad de un producto que ya tiene movimientos: solo se escribe si cambió.
export async function updateIngredient(current: Ingredient, i: IngredientInput): Promise<void> {
  if (onCore()) {
    await coreCatalog.updateProduct(current.id, mapIngredientInput(i))
    const r = currentRestaurantId()
    // Las existencias se fijan con un conteo, que exige el valor actual: nadie pisa lo que otro acaba de registrar.
    if (r !== null && i.stock !== current.qty) await coreInventory.moveStock(current.id, { restaurant_id: r, kind: 'count', qty: i.stock, reason: 'Ajuste al editar el ingrediente', request_key: `edit-${current.id}-${Date.now()}`, expected_stock: current.qty })
    return
  }
  const { uom_id, ...rest } = ingredientValues(i)
  await callKw(MODEL, 'write', [[current.id], uom_id === current.uomId ? rest : { ...rest, uom_id }])
  if (i.supplierId !== current.supplierId) {
    const found = await callKw<{ id: number }[]>('product.supplierinfo', 'search_read', [[['product_tmpl_id', '=', current.id]], ['id']], { limit: 1 })
    if (found[0]) await callKw('product.supplierinfo', 'write', [[found[0].id], { partner_id: i.supplierId }])
    else await callKw('product.supplierinfo', 'create', [{ product_tmpl_id: current.id, partner_id: i.supplierId, min_qty: 0, price: 0 }])
  }
  if (i.stock !== current.qty) await callKw(MODEL, 'waiter_set_stock', [[current.id], i.stock])
}

// "Eliminar" del kit = archivar en Odoo: el historial de movimientos y las recetas se conservan.
export async function archiveIngredient(id: number): Promise<void> {
  if (onCore()) { await coreCatalog.archiveProduct(id); return }
  await callKw(MODEL, 'write', [[id], { active: false }])
}
