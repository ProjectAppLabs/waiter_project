import { callKw } from '@/lib/services/odoo'
import { createDish, createIngredient, ensureKitUnits, listDishes, listIngredients, listRequests, recipeLines, requestIngredient } from '@/lib/services/pantry'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const m = callKw as jest.Mock
beforeEach(() => m.mockReset())

// Falla si el plato no se lee del addon con sus raciones servibles y su nivel, o si se pide un campo almacenado que no existe.
it('lists the menu dishes with the pantry fields of the addon', async () => {
  m.mockResolvedValueOnce([{ id: 2, name: 'Hamburguesa Clásica', pos_categ_ids: [1], available_in_pos: true, has_recipe: true, servings_available: 30, pantry_level: 'high', list_price: 32000, image_128: 'x' },
    { id: 8, name: 'Pizza margarita', pos_categ_ids: [3], available_in_pos: true, has_recipe: false, servings_available: 0, pantry_level: false, list_price: 38900, image_128: false }])
  const [burger, pizza] = await listDishes()
  expect(m.mock.calls[0][2][1]).toEqual(expect.arrayContaining(['has_recipe', 'servings_available', 'pantry_level']))
  expect(burger).toMatchObject({ hasRecipe: true, servings: 30, level: 'high', hasImage: true })
  expect(pizza).toMatchObject({ hasRecipe: false, level: null, hasImage: false })
})

// Falla si el ingrediente pierde el nivel, el estado, el proveedor o los umbrales que calcula el addon.
it('lists ingredients with level, status, supplier and thresholds', async () => {
  m.mockResolvedValueOnce([{ id: 37, name: 'Queso cheddar', pantry_category: 'dairy', qty_available: 3, uom_id: [16, 'kg'], pantry_level: 'low', pantry_status: 'request', pantry_supplier_id: [58, 'Distribuidora La Finca'], pantry_min: 5, pantry_max: 20, image_128: false }])
  const [cheese] = await listIngredients()
  expect(m.mock.calls[0][2][0]).toEqual([['is_ingredient', '=', true]])
  expect(cheese).toMatchObject({ category: 'dairy', qty: 3, uomName: 'kg', level: 'low', status: 'request', supplierId: 58, supplierName: 'Distribuidora La Finca', min: 5, max: 20 })
})

// Falla si la receta no se pide con recipe_lines() sobre el plato o si se pierde el nivel de cada ingrediente.
it('reads the recipe of a dish through recipe_lines', async () => {
  m.mockResolvedValueOnce([{ id: 21, product_tmpl_id: 35, name: 'Carne de res Angus', qty: 150, uom_name: 'g', level: 'medium', status: 'normal', servings: 80 }])
  const [line] = await recipeLines(2)
  expect(m.mock.calls[0].slice(0, 3)).toEqual(['product.template', 'recipe_lines', [[2]]])
  expect(line).toEqual({ id: 21, ingredientId: 35, name: 'Carne de res Angus', qty: 150, uomName: 'g', level: 'medium', status: 'normal', servings: 80 })
})

// Falla si el alta del plato no llega al addon como vals + receta con el id de la plantilla del ingrediente.
it('creates a dish with its recipe through waiter_create_dish', async () => {
  m.mockResolvedValueOnce({ id: 50 })
  await expect(createDish({ name: 'Bowl', categoryIds: [3], description: 'Con salmón', price: 42900, recipe: [{ ingredientId: 39, qty: 180, uomId: 15 }] })).resolves.toBe(50)
  expect(m.mock.calls[0].slice(0, 3)).toEqual(['product.template', 'waiter_create_dish', [
    { name: 'Bowl', list_price: 42900, pos_categ_ids: [[6, 0, [3]]], description_sale: 'Con salmón' },
    [{ product_tmpl_id: 39, qty: 180, uom_id: 15 }]]])
})

// Falla si el alta del ingrediente no manda la categoría del kit, el stock inicial y el proveedor al addon.
it('creates an ingredient with its initial stock and supplier', async () => {
  m.mockResolvedValueOnce({ id: 60 })
  await expect(createIngredient({ name: 'Tomate chonto', category: 'produce', uomId: 16, stock: 4.2, supplierId: 58 })).resolves.toBe(60)
  expect(m.mock.calls[0].slice(0, 3)).toEqual(['product.template', 'waiter_create_ingredient', [{ name: 'Tomate chonto', pantry_category: 'produce', uom_id: 16 }, 4.2, 58]])
})

// Falla si la solicitud no llama al addon con el id del ingrediente, o si la lista no traduce la orden de compra.
it('requests an ingredient and reads back the request list', async () => {
  const raw = { id: 90, name: 'P00012', state: 'draft', state_label: 'RFQ', partner_name: 'Carnes y Mares del Valle', date_order: '2026-09-07 01:00:00', lines: [{ id: 5, product_tmpl_id: 39, name: 'Salmón fresco', qty: 7, uom_name: 'kg' }] }
  m.mockResolvedValueOnce(raw).mockResolvedValueOnce([raw])
  expect(await requestIngredient(39)).toMatchObject({ id: 90, stateLabel: 'RFQ', supplierName: 'Carnes y Mares del Valle' })
  expect(m.mock.calls[0].slice(0, 3)).toEqual(['product.template', 'waiter_request_ingredient', [39]])
  const [request] = await listRequests()
  expect(request.lines).toEqual([{ id: 5, productId: 39, name: 'Salmón fresco', qty: 7, uomName: 'kg' }])
})

// Falla si las unidades del kit que Odoo no trae (Manojo, Diente, Rebanada) se duplican al volver a entrar.
it('creates only the kit units that Odoo is missing', async () => {
  m.mockResolvedValueOnce([{ id: 15, name: 'g' }, { id: 16, name: 'kg' }, { id: 19, name: 'L' }, { id: 20, name: 'ml' }, { id: 1, name: 'Units' }, { id: 31, name: 'Manojo' }, { id: 32, name: 'Diente' }])
    .mockResolvedValueOnce(33)
  const units = await ensureKitUnits()
  expect(m.mock.calls[1].slice(0, 3)).toEqual(['uom.uom', 'create', [{ name: 'Rebanada', relative_factor: 1 }]])
  expect(units.map((u) => u.key)).toEqual(['bunch', 'clove', 'gram', 'kilogram', 'liter', 'milliliter', 'pieces', 'slice'])
  expect(units.find((u) => u.key === 'slice')).toEqual({ key: 'slice', id: 33, uomName: 'Rebanada' })
})
