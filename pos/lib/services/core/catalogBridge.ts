import { parseDinerAttributes, type DinerAttributes } from '@/lib/domain/dinerAttributes'
import { KIT_UNITS, type Dish, type Ingredient, type RecipeLine } from '@/lib/domain/pantry'
import type { AdminCategory, AdminProduct, Tax } from '@/lib/services/catalogAdmin'
import type { CatalogOverview } from '@/lib/services/catalogOverview'
import type { KitUnit, PantryRequest, Supplier } from '@/lib/services/pantry'
import type { InventoryDetail, RecipeDetail } from '@/lib/services/restaurantInventory'
import type { MasterCatalog } from '@/lib/services/masterCatalog'
import type { Catalog } from '@/lib/types'
import { DEFAULT_ROLE_POLICY } from '@/lib/domain/permissions'
import { useAuthStore } from '@/lib/stores/authStore'
import type { CoreCategory, CoreDish, CoreIngredient, CoreMenu, CoreOverview, CoreRecipe, CoreRestaurantsCatalog, CoreSupplier, CoreTax, CoreUnit } from '@/lib/services/core/catalog'
import type { CoreRequest, CoreStockDetail, CoreStockDish, CoreStockIngredient } from '@/lib/services/core/inventory'

// Plan T1: traduce el catálogo y el inventario del sistema propio a las formas que ya usan Inventario, Consola → Catálogo y
// el POS. Los ids del sistema propio son los del producto: plantilla y variante son lo mismo.

// El restaurante con el que se trabaja: el elegido en el dispositivo o, en la consola, el primero de la organización.
export function currentRestaurantId(): number | null {
  const { restaurant, restaurants } = useAuthStore.getState()
  return restaurant?.id ?? restaurants?.[0]?.id ?? null
}

// Las unidades del kit se reconocen por su nombre; «Unidades» es el nombre en español de lo que Odoo llamaba «Units».
const UNIT_NAMES: Record<string, string> = { Unidades: 'Units' }
export const toKitUnits = (units: CoreUnit[]): KitUnit[] => units.flatMap((u) => {
  const name = UNIT_NAMES[u.name] ?? u.name
  const kit = KIT_UNITS.find((k) => k.uom === name)
  return kit ? [{ key: kit.key, id: u.id, uomName: name }] : []
})
export const toSupplier = (s: CoreSupplier): Supplier => ({ id: s.id, name: s.name, hasImage: false })
export const toAdminCategory = (c: CoreCategory): AdminCategory => ({ id: c.id, name: c.name, sequence: c.sequence, station: c.station || null })
export const toTax = (t: CoreTax): Tax => ({ id: t.id, name: t.name, amount: t.amount })

export const toDish = (d: CoreStockDish): Dish => ({
  id: d.id, name: d.name, categoryIds: d.category_ids, hasImage: d.has_image, price: d.price, availableInPos: d.available_in_pos,
  hasRecipe: d.has_recipe, servings: d.servings ?? 0, level: d.level,
})
export const toIngredient = (i: CoreStockIngredient): Ingredient => ({
  id: i.id, name: i.name, category: i.pantry_category, qty: i.qty, uomId: i.unit.id, uomName: UNIT_NAMES[i.unit.name] ?? i.unit.name, level: i.level, status: i.status,
  supplierId: i.supplier?.id ?? null, supplierName: i.supplier?.name ?? null, hasImage: i.has_image, min: i.min, max: i.max,
})
export const toAdminProduct = (d: CoreDish): AdminProduct => ({
  variantId: d.id, id: d.id, name: d.name, price: d.price, categoryIds: d.category_ids, taxIds: d.tax_ids, available: d.available_in_pos, storable: false,
  favorite: d.favorite, description: d.description, hasImage: d.has_image, dinerAttributes: parseDinerAttributes(JSON.stringify(d.diner_attributes ?? {})) as DinerAttributes,
})
export const toRequest = (r: CoreRequest): PantryRequest => ({
  id: r.id, name: `Solicitud ${r.id}`, state: r.state, stateLabel: r.state_label, supplierName: r.supplier_name, date: r.date,
  lines: r.lines.map((l) => ({ id: l.id, productId: l.ingredient_id, name: l.name, qty: l.qty, uomName: l.unit_name })),
})
export const toRecipeLines = (r: CoreRecipe, restaurantId: number | null): RecipeLine[] => {
  const here = r.by_restaurant.find((b) => b.restaurant_id === restaurantId) ?? r.by_restaurant[0]
  return (r.recipe?.lines ?? []).map((l, i) => ({ id: i + 1, ingredientId: l.ingredient_id, name: l.name, qty: l.qty, uomName: UNIT_NAMES[l.unit.name] ?? l.unit.name, level: null, status: null,
    servings: here?.ingredients.find((x) => x.ingredient_id === l.ingredient_id)?.servings ?? 0 }))
}
export const toRecipeDetail = (id: number, r: CoreRecipe, restaurantId: number | null): RecipeDetail => {
  const here = r.by_restaurant.find((b) => b.restaurant_id === restaurantId) ?? r.by_restaurant[0]
  const units = new Map((r.recipe?.lines ?? []).map((l) => [l.ingredient_id, l.unit]))
  return {
    id, name: '', bom_id: r.recipe ? id : null, yield: r.recipe?.yield_qty ?? 1, lines: (r.recipe?.lines ?? []).map((l) => ({ ingredientId: l.ingredient_id, qty: l.qty, uomId: l.unit.id })),
    servings: here?.servings ?? 0, cost: r.recipe?.cost ?? 0, limiting: here?.limiting ?? [],
    ingredients: (here?.ingredients ?? []).map((x) => ({ id: x.ingredient_id, name: x.name, qty: x.per_serving, uom_id: units.get(x.ingredient_id)?.id ?? 0, uom: units.get(x.ingredient_id)?.name ?? '',
      stock: x.stock, pending: x.pending, free: x.free, servings: x.servings, cost: 0 })),
  }
}
export const toInventoryDetail = (d: CoreStockDetail): InventoryDetail => ({
  stock: d.stock, pending: d.pending, cost: d.cost, min: d.min, max: d.max, uom: UNIT_NAMES[d.unit] ?? d.unit,
  history: d.history.map((h) => ({ id: h.id, date: h.date, qty: h.qty, reason: h.reason, kind: h.kind, employee: h.account_name })),
})
export const toOverview = (o: CoreOverview): CatalogOverview => ({
  currency: 'COP',
  dishes: o.dishes.map((d) => ({ templateId: d.id, name: d.name, categories: d.categories, categoryIds: d.category_ids, listPrice: d.price, availableInPos: d.available_in_pos,
    hasImage: d.has_image, hasRecipe: d.has_recipe, ingredientsCount: d.ingredients_count, recipeCost: d.recipe_cost, missingCosts: d.missing_costs ?? [] })),
  ingredients: o.ingredients.map((i) => ({ templateId: i.id, name: i.name, uom: UNIT_NAMES[i.unit] ?? i.unit, cost: i.cost, usedIn: i.used_in })),
})
export const toMasterCatalog = (c: CoreRestaurantsCatalog, restaurantIds: number[]): MasterCatalog => ({
  dishes: c.dishes.map((d) => ({ templateId: d.id, variantId: d.id, name: d.name, category: d.category, basePrice: d.price,
    unavailableIn: restaurantIds.filter((r) => (c.unavailable[String(r)] ?? []).includes(d.id)) })),
  prices: Object.fromEntries(restaurantIds.map((r) => [r, Object.fromEntries(Object.entries(c.prices[String(r)] ?? {}).map(([k, v]) => [Number(k), v]))])),
})

// La carta del POS para un restaurante del sistema propio. Sin salón ni caja todavía (T2): pisos, mesas y métodos vacíos,
// y los ajustes del restaurante con sus valores por omisión.
export const toCatalog = (menu: CoreMenu, restaurantId: number, restaurantName: string, companyName: string): Catalog => ({
  company: { name: companyName },
  settings: { rolePermissions: DEFAULT_ROLE_POLICY, configId: restaurantId, configName: restaurantName, waiterCanCharge: true, waiterCanEditInventory: false,
    alertLateMinutes: 15, alertBillMinutes: 10, roiHourCost: 0, roiMinutesPerOrder: 0, roiBaselineHoursPer100: 0, roiMonthlyCost: 0, roiStartDate: null, tipProductId: null },
  products: menu.products.filter((p) => p.available_in_pos).map((p) => ({ id: p.id, templateId: p.id, name: p.name, price: p.final_price ?? p.restaurant_price ?? p.price, categoryIds: p.category_ids,
    taxIds: p.tax_ids, favorite: p.favorite, storable: false, soldOut: p.sold_out ?? false, hasImage: p.has_image })),
  categories: menu.categories.map((c) => ({ id: c.id, name: c.name, sequence: c.sequence, station: c.station || null })),
  floors: [], tables: [], paymentMethods: [],
})

export const mapIngredientInput = (i: { name: string; category: string; uomId: number; supplierId: number; image?: string }) => ({
  name: i.name, kind: 'ingredient' as const, unit_id: i.uomId, pantry_category: i.category, supplier_id: i.supplierId || null, ...(i.image !== undefined && { image: i.image }),
})
export const mapProductInput = (p: { name: string; price: number; categoryIds: number[]; taxIds: number[]; available: boolean; favorite: boolean; description: string; dinerAttributes?: unknown; image?: string }) => ({
  name: p.name, kind: 'dish' as const, price: p.price, category_ids: p.categoryIds, tax_ids: p.taxIds, available_in_pos: p.available, favorite: p.favorite, description: p.description,
  diner_attributes: p.dinerAttributes ?? {}, ...(p.image !== undefined && { image: p.image }),
})

export const isIngredient = (p: CoreDish | CoreIngredient): p is CoreIngredient => p.kind === 'ingredient'
