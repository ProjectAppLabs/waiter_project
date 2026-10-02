import {
  LEVEL_BARS, PANTRY_CATEGORIES, STOCK_LEVELS, categoryEmoji, dishAvailable, dishServings, filterDishes,
  filterIngredients, formatQty, formatStock, groupCounts, kitUnitKey, unitLabel, type Dish, type Ingredient,
} from '@/lib/domain/pantry'

const ingredient = (over: Partial<Ingredient> = {}): Ingredient => ({
  id: 1, name: 'Lechuga romana', category: 'produce', qty: 1.5, uomId: 16, uomName: 'kg', level: 'low', status: 'request',
  supplierId: 3, supplierName: 'Distribuidora La Finca', hasImage: false, min: 5, max: 20, ...over,
})
const dish = (over: Partial<Dish> = {}): Dish => ({
  id: 1, name: 'Hamburguesa Clásica', categoryIds: [1], hasImage: true, price: 32000, availableInPos: true,
  hasRecipe: true, servings: 30, level: 'high', ...over,
})

// Falla si el indicador de nivel deja de traducir cada nivel del servidor a sus barritas (Alto 3, Medio 2, Bajo 1, Vacío 0).
it('formats a stock level as the kit bars, in the panel order', () => {
  expect(STOCK_LEVELS.map((l) => LEVEL_BARS[l])).toEqual([1, 2, 3, 0])
  expect(STOCK_LEVELS).toEqual(['low', 'medium', 'high', 'empty'])
})

// Falla si el stock no se muestra en español con su unidad ("1,5 kg"), o si "Units" del servidor no se dice "Unidades".
it('formats the stock with its unit', () => {
  expect(formatStock(1.5, 'kg')).toBe('1,5 kg')
  expect(formatStock(900, 'g')).toBe('900 g')
  expect(formatStock(84, 'Units')).toBe('84 Unidades')
  expect(formatQty(0.25)).toBe('0,25')
  expect(formatStock(0.005, 'kg')).toBe('0,005 kg')
  expect(unitLabel('Manojo')).toBe('Manojo')
})

// Falla si las unidades del kit no se reconocen por el nombre que tienen en uom.uom.
it('recognises the kit units by their el servidor name', () => {
  expect([kitUnitKey('kg'), kitUnitKey('Units'), kitUnitKey('Manojo'), kitUnitKey('L')]).toEqual(['kilogram', 'pieces', 'bunch', 'liter'])
})

// Falla si un plato agotado sigue "Disponible", o si uno sin receta pierde el "Sin receta" del kit.
it('marks a dish available when it is on the menu and its recipe is not exhausted', () => {
  expect(dishAvailable(dish())).toBe(true)
  expect(dishAvailable(dish({ servings: 0 }))).toBe(false)
  expect(dishAvailable(dish({ availableInPos: false }))).toBe(false)
  expect(dishAvailable(dish({ hasRecipe: false, servings: 0 }))).toBe(true)
  expect(dishServings(dish({ hasRecipe: false, servings: 0 }))).toBeNull()
  expect(dishServings(dish())).toBe(30)
})

// Falla si los conteos de los chips del panel "Filter" no agrupan por nivel y categoría, con "Todos" como total.
it('groups the filter counts by level and by category', () => {
  const rows = [ingredient(), ingredient({ id: 2, level: 'high', category: 'meat' }), ingredient({ id: 3, level: 'high', category: null })]
  expect(groupCounts(rows, STOCK_LEVELS, (r) => r.level)).toEqual({ all: 3, low: 1, medium: 0, high: 2, empty: 0 })
  const byCategory = groupCounts(rows, PANTRY_CATEGORIES.map((c) => c.key), (r) => r.category)
  expect(byCategory).toEqual({ all: 3, produce: 1, meat: 1, seafood: 0, dairy: 0, dry: 0 })
  expect(categoryEmoji('seafood')).toBe('🐟')
})

// Falla si los filtros del menú (estado, nivel, categoría, búsqueda) dejan pasar un plato que no cumple.
it('filters dishes by status, level, category and query', () => {
  const rows = [dish(), dish({ id: 2, name: 'Bowl de salmón', categoryIds: [3], level: 'medium', servings: 5 }), dish({ id: 3, name: 'Tacos de carne', servings: 0, level: 'empty' })]
  expect(filterDishes(rows, { status: 'available', level: 'all', categoryId: null, query: '' }).map((d) => d.id)).toEqual([1, 2])
  expect(filterDishes(rows, { status: 'all', level: 'medium', categoryId: null, query: '' }).map((d) => d.id)).toEqual([2])
  expect(filterDishes(rows, { status: 'all', level: 'all', categoryId: 3, query: '' }).map((d) => d.id)).toEqual([2])
  expect(filterDishes(rows, { status: 'all', level: 'all', categoryId: null, query: 'ta' }).map((d) => d.id)).toEqual([3])
})

// Falla si los filtros de ingredientes (nivel, categoría, búsqueda) dejan pasar un ingrediente que no cumple.
it('filters ingredients by level, category and query', () => {
  const rows = [ingredient(), ingredient({ id: 2, name: 'Salmón fresco', category: 'seafood', level: 'high' })]
  expect(filterIngredients(rows, { level: 'low', category: null, query: '' }).map((i) => i.id)).toEqual([1])
  expect(filterIngredients(rows, { level: 'all', category: 'seafood', query: '' }).map((i) => i.id)).toEqual([2])
  expect(filterIngredients(rows, { level: 'all', category: null, query: 'salm' }).map((i) => i.id)).toEqual([2])
})
