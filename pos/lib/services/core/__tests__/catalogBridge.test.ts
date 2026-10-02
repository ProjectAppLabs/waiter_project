import { toCatalog, toKitUnits, toMasterCatalog, toRecipeDetail, toRecipeLines } from '@/lib/services/core/catalogBridge'
import type { CoreMenu, CoreRecipe, CoreRestaurantsCatalog } from '@/lib/services/core/catalog'

const recipe: CoreRecipe = {
  recipe: { yield_qty: 1, cost: 3200, missing_costs: [], lines: [{ ingredient_id: 7, name: 'Pan', qty: 1, unit: { id: 3, name: 'Unidades' } }, { ingredient_id: 8, name: 'Carne', qty: 150, unit: { id: 1, name: 'g' } }] },
  by_restaurant: [
    { restaurant_id: 1, servings: 20, limiting: ['Carne'], ingredients: [{ ingredient_id: 7, name: 'Pan', per_serving: 1, stock: 50, pending: 0, free: 50, servings: 50 }, { ingredient_id: 8, name: 'Carne', per_serving: 150, stock: 3000, pending: 0, free: 3000, servings: 20 }] },
    { restaurant_id: 2, servings: 0, limiting: ['Pan'], ingredients: [{ ingredient_id: 7, name: 'Pan', per_serving: 1, stock: 0, pending: 0, free: 0, servings: 0 }, { ingredient_id: 8, name: 'Carne', per_serving: 150, stock: 3000, pending: 0, free: 3000, servings: 20 }] },
  ],
}

// Falla si la receta del sistema propio no se lee para el restaurante con el que se trabaja: porciones y faltantes son
// por sede, y «Unidades» debe seguir llamándose como el kit lo reconoce.
test('la receta se traduce con las porciones de la sede elegida', () => {
  const d = toRecipeDetail(5, recipe, 2)
  expect(d.servings).toBe(0); expect(d.limiting).toEqual(['Pan']); expect(d.cost).toBe(3200); expect(d.bom_id).toBe(5)
  expect(d.lines).toEqual([{ ingredientId: 7, qty: 1, uomId: 3 }, { ingredientId: 8, qty: 150, uomId: 1 }])
  const lines = toRecipeLines(recipe, 1)
  expect(lines.map((l) => [l.name, l.uomName, l.servings])).toEqual([['Pan', 'Units', 50], ['Carne', 'g', 20]])
})

// Falla si un restaurante sin receta no se muestra como «sin receta» en vez de romper la pantalla.
test('sin receta no hay líneas ni lote', () => {
  const d = toRecipeDetail(5, { recipe: null, by_restaurant: [] }, 1)
  expect(d.bom_id).toBeNull(); expect(d.lines).toEqual([]); expect(d.servings).toBe(0)
})

// Falla si la carta del POS no respeta el precio final por sede, si los platos fuera de la carta se cuelan, o si el
// restaurante no queda como configuración activa con los permisos por omisión.
test('la carta del sistema propio toma la forma del catálogo del POS', () => {
  const menu: CoreMenu = {
    categories: [{ id: 1, name: 'Hamburguesas', sequence: 1, station: 'Parrilla' }, { id: 2, name: 'Bebidas', sequence: 2, station: '' }],
    taxes: [{ id: 1, name: 'INC 8%', amount: 8, included: true }],
    products: [
      { id: 10, name: 'Clásica', kind: 'dish', category_ids: [1], tax_ids: [1], price: 20000, restaurant_price: 22000, final_price: 22000, favorite: true, available_in_pos: true, sold_out: false, has_image: true, image_version: '1', image_origin: 'real', description: '', diner_attributes: {}, preparation_minutes: null },
      { id: 11, name: 'Secreta', kind: 'dish', category_ids: [1], tax_ids: [], price: 1, favorite: false, available_in_pos: false, has_image: false, image_version: '', image_origin: null, description: '', diner_attributes: {}, preparation_minutes: null },
    ],
  }
  const c = toCatalog(menu, 2, 'Frisby Laureles', 'Frisby')
  expect(c.products.map((p) => [p.id, p.price])).toEqual([[10, 22000]])
  expect(c.categories[1].station).toBeNull()
  expect(c.settings.configId).toBe(2); expect(c.settings.configName).toBe('Frisby Laureles'); expect(c.settings.rolePermissions).toBeDefined()
  expect(c.floors).toEqual([]); expect(c.paymentMethods).toEqual([])
})

// Falla si los precios y las excepciones por sede del catálogo maestro no se cruzan con los restaurantes pedidos.
test('el catálogo por restaurantes trae precios y platos cerrados por sede', () => {
  const raw: CoreRestaurantsCatalog = { dishes: [{ id: 10, name: 'Clásica', category: 'Hamburguesas', price: 20000 }], prices: { '2': { '10': 22000 } }, unavailable: { '1': [10] } }
  const m = toMasterCatalog(raw, [1, 2])
  expect(m.dishes[0].unavailableIn).toEqual([1])
  expect(m.prices).toEqual({ 1: {}, 2: { 10: 22000 } })
})

// Falla si las unidades del sistema propio no se reconocen como las del kit (o si una ajena se cuela en el selector).
test('solo las unidades del kit entran al selector', () => {
  const units = toKitUnits([{ id: 1, name: 'g', root: 'weight', factor: 1 }, { id: 2, name: 'Unidades', root: 'count', factor: 1 }, { id: 3, name: 'Caja', root: 'count', factor: 12 }])
  expect(units).toEqual([{ key: 'gram', id: 1, uomName: 'g' }, { key: 'pieces', id: 2, uomName: 'Units' }])
})
