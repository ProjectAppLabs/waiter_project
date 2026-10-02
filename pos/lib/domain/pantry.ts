
export type PantryCategory = 'produce' | 'meat' | 'seafood' | 'dairy' | 'dry'
export type StockLevel = 'empty' | 'low' | 'medium' | 'high'
export type IngredientStatus = 'request' | 'normal' | 'good'
export type DishStatusFilter = 'all' | 'available' | 'unavailable'
export type LevelFilter = 'all' | StockLevel

// Las cinco categorías de `pantry_category` con el emoji que el kit pone delante del nombre.
export const PANTRY_CATEGORIES: { key: PantryCategory; emoji: string }[] = [
  { key: 'produce', emoji: '🥦' }, { key: 'meat', emoji: '🥩' }, { key: 'seafood', emoji: '🐟' },
  { key: 'dairy', emoji: '🧀' }, { key: 'dry', emoji: '🍚' },
]
export const categoryEmoji = (category: PantryCategory | null): string =>
  PANTRY_CATEGORIES.find((c) => c.key === category)?.emoji ?? '🧺'

// Orden del panel "Stock Level" del kit: Bajo, Medio, Alto, Vacío (detrás de "Todos").
export const STOCK_LEVELS: StockLevel[] = ['low', 'medium', 'high', 'empty']
// Barritas del indicador de nivel: tres para Alto, dos para Medio, una para Bajo, ninguna para Vacío.
export const LEVEL_BARS: Record<StockLevel, number> = { empty: 0, low: 1, medium: 2, high: 3 }

export interface RecipeLine {
  id: number; ingredientId: number; name: string; qty: number; uomName: string
  level: StockLevel | null; status: IngredientStatus | null; servings: number
}
export interface Dish {
  id: number; name: string; categoryIds: number[]; hasImage: boolean; price: number
  availableInPos: boolean; hasRecipe: boolean; servings: number; level: StockLevel | null
}
export interface Ingredient {
  id: number; name: string; category: PantryCategory | null; qty: number; uomId: number; uomName: string
  level: StockLevel | null; status: IngredientStatus | null; supplierId: number | null; supplierName: string | null
  hasImage: boolean; min: number; max: number
}

// Badge "Disponible" del kit: el plato está en la carta del POS y, si tiene receta, todavía alcanza para una ración.
export const dishAvailable = (d: Pick<Dish, 'availableInPos' | 'hasRecipe' | 'servings'>): boolean =>
  d.availableInPos && (!d.hasRecipe || d.servings > 0)

// Raciones del pie de la tarjeta: null en los platos sin receta, donde el kit no muestra número sino "Sin receta".
export const dishServings = (d: Pick<Dish, 'hasRecipe' | 'servings'>): number | null => (d.hasRecipe ? d.servings : null)

const qtyFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 })
export const formatQty = (qty: number): string => qtyFormat.format(qty)
export const formatStock = (qty: number, uomName: string): string => `${formatQty(qty)} ${unitLabel(uomName)}`

export const KIT_UNITS = [
  { key: 'bunch', uom: 'Manojo' }, { key: 'clove', uom: 'Diente' }, { key: 'gram', uom: 'g' },
  { key: 'kilogram', uom: 'kg' }, { key: 'liter', uom: 'L' }, { key: 'milliliter', uom: 'ml' }, { key: 'pieces', uom: 'Units' }, { key: 'slice', uom: 'Rebanada' },
] as const
export type KitUnitKey = (typeof KIT_UNITS)[number]['key']
export const kitUnitKey = (uomName: string): KitUnitKey | null => KIT_UNITS.find((u) => u.uom === uomName)?.key ?? null
export const unitLabel = (uomName: string): string => (uomName === 'Units' ? 'Unidades' : uomName)

const matches = (name: string, query: string) => name.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))

export interface DishFilters { status: DishStatusFilter; level: LevelFilter; categoryId: number | null; query: string }
export const EMPTY_DISH_FILTERS: DishFilters = { status: 'all', level: 'all', categoryId: null, query: '' }

export function filterDishes(rows: Dish[], f: DishFilters): Dish[] {
  return rows.filter((d) =>
    (f.status === 'all' || (f.status === 'available') === dishAvailable(d))
    && (f.level === 'all' || d.level === f.level)
    && (f.categoryId === null || d.categoryIds.includes(f.categoryId))
    && matches(d.name, f.query))
}

export interface IngredientFilters { level: LevelFilter; category: PantryCategory | null; query: string }
export const EMPTY_INGREDIENT_FILTERS: IngredientFilters = { level: 'all', category: null, query: '' }

export function filterIngredients(rows: Ingredient[], f: IngredientFilters): Ingredient[] {
  return rows.filter((i) =>
    (f.level === 'all' || i.level === f.level)
    && (f.category === null || i.category === f.category)
    && matches(i.name, f.query))
}

// Conteos de los chips del panel "Filter": `all` es el total y cada clave la cuenta de su grupo (0 si nadie cae ahí).
export function groupCounts<T>(rows: T[], keys: readonly string[], pick: (row: T) => string | null): Record<string, number> {
  const counts: Record<string, number> = { all: rows.length }
  for (const key of keys) counts[key] = 0
  for (const row of rows) {
    const key = pick(row)
    if (key !== null && key in counts) counts[key] += 1
  }
  return counts
}
