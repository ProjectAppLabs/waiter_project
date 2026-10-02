import { coreFetch } from '@/lib/services/core/http'
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
beforeEach(() => m.mockReset())
import { createDish, createIngredient, ensureKitUnits, listDishes, listIngredients, listRequests, recipeLines, requestIngredient } from '@/lib/services/pantry'
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: { getState: () => ({ restaurant: { id: 1 }, restaurants: [] }) } }))
// Falla si las porciones disponibles y el nivel del plato dejan de venir del inventario de la sede.
it('lista platos con receta y existencias', async () => {
 m.mockResolvedValue({ ingredients: [], dishes: [{ id: 2, name: 'Clásica', category_ids: [1], available_in_pos: true, has_recipe: true, servings: 30, level: 'high', price: 32000, has_image: true }] })
 expect((await listDishes())[0]).toMatchObject({ hasRecipe: true, servings: 30, level: 'high', hasImage: true })
 expect(m).toHaveBeenCalledWith('inventory?restaurant_id=1&dishes=1')
})
// Falla si el ingrediente pierde proveedor, unidad o umbrales.
it('lista ingredientes con umbrales y proveedor', async () => {
 m.mockResolvedValue({ ingredients: [{ id: 37, name: 'Queso', pantry_category: 'dairy', qty: 3, unit: { id: 16, name: 'kg' }, level: 'low', status: 'request', supplier: { id: 58, name: 'La Finca' }, min: 5, max: 20, has_image: false }] })
 expect((await listIngredients())[0]).toMatchObject({ category: 'dairy', qty: 3, uomName: 'kg', level: 'low', supplierId: 58, min: 5, max: 20 })
})
// Falla si la receta usa porciones de otra sede o pierde la unidad.
it('lee las porciones de la receta en la sede activa', async () => {
 m.mockResolvedValue({ recipe: { lines: [{ ingredient_id: 35, name: 'Carne', qty: 150, unit: { id: 15, name: 'g' } }] }, by_restaurant: [{ restaurant_id: 2, ingredients: [{ ingredient_id: 35, servings: 1 }] }, { restaurant_id: 1, ingredients: [{ ingredient_id: 35, servings: 80 }] }] })
 expect((await recipeLines(2))[0]).toMatchObject({ ingredientId: 35, qty: 150, uomName: 'g', servings: 80 })
})
// Falla si el alta no incluye receta y el impuesto del régimen vigente.
it('crea un plato con receta y régimen INC', async () => {
 m.mockResolvedValueOnce({ regime: 'inc', taxes: [{ id: 55, amount: 8 }] }).mockResolvedValueOnce({ product: { id: 50 } })
 await expect(createDish({ name: 'Bowl', categoryIds: [3], description: 'Salmón', price: 42900, recipe: [{ ingredientId: 39, qty: 180, uomId: 15 }] })).resolves.toBe(50)
 expect(m).toHaveBeenLastCalledWith('products', { method: 'POST', body: expect.objectContaining({ tax_ids: [55], recipe: { yield_qty: 1, lines: [{ ingredient_id: 39, qty: 180, unit_id: 15 }] } }) })
})
// Falla si el alta pierde el stock inicial de la sede o el proveedor.
it('crea ingrediente con existencias iniciales', async () => {
 m.mockResolvedValue({ product: { id: 60 } })
 await expect(createIngredient({ name: 'Tomate', category: 'produce', uomId: 16, stock: 4.2, supplierId: 58 })).resolves.toBe(60)
 expect(m).toHaveBeenCalledWith('products', { method: 'POST', body: expect.objectContaining({ supplier_id: 58, initial_stock: [{ restaurant_id: 1, qty: 4.2 }] }) })
})
// Falla si solicitar y listar compras pierde las líneas del ingrediente.
it('solicita y lista la compra', async () => {
 const request = { id: 90, state: 'draft', state_label: 'Borrador', supplier_name: 'Proveedor', date: '', lines: [{ id: 5, ingredient_id: 39, name: 'Salmón', qty: 7, unit_name: 'kg' }] }
 m.mockResolvedValueOnce({ request }).mockResolvedValueOnce({ requests: [request] })
 expect(await requestIngredient(39)).toMatchObject({ id: 90, supplierName: 'Proveedor' })
 expect((await listRequests())[0].lines).toEqual([{ id: 5, productId: 39, name: 'Salmón', qty: 7, uomName: 'kg' }])
})
// Falla si consultar unidades duplica las ya sembradas o pierde la unidad Rebanada.
it('usa las unidades existentes sin crearlas', async () => {
 m.mockResolvedValue({ units: [{ id: 1, name: 'Unidades' }, { id: 33, name: 'Rebanada' }] })
 expect(await ensureKitUnits()).toEqual([{ key: 'pieces', id: 1, uomName: 'Units' }, { key: 'slice', id: 33, uomName: 'Rebanada' }])
 expect(m.mock.calls).toEqual([['units']])
})
