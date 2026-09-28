import { DEFAULT_ROLE_POLICY } from '@/lib/domain/permissions'
import { callKw } from '@/lib/services/odoo'
import { loadPosData } from '@/lib/services/posData'

jest.mock('@/lib/services/odoo', () => ({ callKw: jest.fn(), inRestaurant: (d: unknown[]) => d, currentConfigId: () => null }))
const mockCallKw = callKw as jest.Mock

// Fixture copiado de la respuesta real de load_data (Odoo 19): many2one como enteros, impuestos y
// categorías en product.template, una plantilla "Tips" no disponible y una cerveza almacenable.
const RAW = {
  'product.product': [
    { id: 3, product_tmpl_id: 3, display_name: 'Hamburguesa Angus', lst_price: 36900 },
    { id: 6, product_tmpl_id: 6, display_name: 'Club Colombia', lst_price: 14000 },
    { id: 9, product_tmpl_id: 9, display_name: 'Tips', lst_price: 1 },
  ],
  'product.template': [
    { id: 3, name: 'Hamburguesa Angus', list_price: 36900, pos_categ_ids: [1], taxes_id: [55], available_in_pos: true, active: true, is_favorite: true, is_storable: false, image_128: false },
    { id: 6, name: 'Club Colombia', list_price: 14000, pos_categ_ids: [2], taxes_id: [55], available_in_pos: true, active: true, is_favorite: false, is_storable: true, image_128: false },
    { id: 9, name: 'Tips', list_price: 1, pos_categ_ids: [], taxes_id: [], available_in_pos: false, active: true, is_favorite: false, is_storable: false, image_128: false },
  ],
  'pos.category': [{ id: 1, name: 'Hamburguesas', sequence: 0 }],
  'restaurant.floor': [{ id: 2, name: 'Terraza', table_ids: [6], floor_background_image: false }],
  'restaurant.table': [{ id: 6, table_number: 5, floor_id: 2, seats: 4, active: true, position_h: 40, position_v: 190, width: 110, height: 110, shape: 'square', color: false }],
  'pos.payment.method': [{ id: 2, name: 'Tarjeta', type: 'bank' }, { id: 1, name: 'Efectivo', type: 'cash' }],
  'res.company': [{ id: 1, name: 'La Provincia' }], 'pos.config': [{ id: 1, name: 'Salón', alert_late_minutes: 18, alert_bill_minutes: 10, roi_hour_cost: 20000, roi_minutes_per_order: 11, roi_baseline_hours_per_100: 18.4, roi_monthly_cost: 2740000, roi_start_date: false, tip_product_id: 1 }],
}

beforeEach(() => {
  mockCallKw.mockReset()
  mockCallKw.mockImplementation(async (_m: string, method: string) => (method === 'waiter_role_policy' ? DEFAULT_ROLE_POLICY : method === 'load_data' ? RAW : [{ id: 6, qty_available: 0 }]))
})

// Falla si el producto deja de tomar impuestos, categorías o el favorito de su plantilla.
it('joins each product to its template for price, categories, taxes and favorite', async () => {
  const c = await loadPosData(1)
  expect(c.products[0]).toMatchObject({ id: 3, name: 'Hamburguesa Angus', price: 36900, categoryIds: [1], taxIds: [55], favorite: true })
})

// Falla si un consumible sin control de stock (qty 0 siempre) sale como agotado: la carta entera quedaría gris.
it('marks sold out only storable products without stock', async () => {
  const c = await loadPosData(1)
  expect(c.products.map((p) => [p.name, p.soldOut])).toEqual([['Hamburguesa Angus', false], ['Club Colombia', true]])
  expect(mockCallKw.mock.calls.filter((k) => k[1] === 'search_read')[0][2][0]).toEqual([['id', 'in', [6]]])
})

// Falla si el nombre del restaurante no llega a la barra lateral ("LA PROVINCIA" en el diseño).
it('reads the company name for the sidebar', async () => {
  const c = await loadPosData(1)
  expect(c.company.name).toBe('La Provincia')
})

// Falla si floor_id se lee como par [id, nombre] (llega como entero y el filtro por piso quedaría vacío) o si la
// geometría del plano (posición, tamaño, forma) no llega a la mesa: el salón la pintaría en rejilla en vez de en su sitio.
it('reads the table floor as a bare id with its plan geometry and keeps the cash method', async () => {
  const c = await loadPosData(1)
  expect(c.tables[0]).toEqual({ id: 6, number: 5, floorId: 2, seats: 4, x: 40, y: 190, width: 110, height: 110, shape: 'square', color: null })
  expect(c.floors[0]).toEqual({ id: 2, name: 'Terraza', tableIds: [6], hasBackground: false })
  expect(c.paymentMethods.find((m) => m.type === 'cash')?.name).toBe('Efectivo')
})

it('loads administration without reading or creating a cash session and normalizes relations', async () => {
  mockCallKw.mockImplementation(async (model: keyof typeof RAW, method: string, args: unknown[]) => {
    if (method === 'waiter_role_policy') return DEFAULT_ROLE_POLICY
    expect(method).toBe('search_read')
    const fields = args[1] as string[]
    if (fields.includes('qty_available')) return [{ id: 6, qty_available: 2 }]
    if (model === 'pos.config') return [{ ...RAW[model][0], company_id: [1, 'La Provincia'], payment_method_ids: [1, 2] }]
    if (model === 'product.product') return RAW[model].map((p) => ({ ...p, product_tmpl_id: [p.product_tmpl_id, p.display_name] }))
    if (model === 'restaurant.table') return RAW[model].map((t) => ({ ...t, floor_id: [t.floor_id, 'Terraza'] }))
    return RAW[model]
  })
  const data = await loadPosData(null)
  expect(data.tables[0].floorId).toBe(2)
  expect(data.products[0].templateId).toBe(3)
  expect(data.settings.configId).toBe(1)
  expect(mockCallKw.mock.calls.some(([model]) => model === 'pos.session')).toBe(false)
})
