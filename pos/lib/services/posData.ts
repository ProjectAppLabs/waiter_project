import { onCore } from '@/lib/domain/backend'
import * as coreCatalog from '@/lib/services/core/catalog'
import * as corePos from '@/lib/services/core/pos'
import { currentRestaurantId, toCatalog } from '@/lib/services/core/catalogBridge'
import { useAuthStore } from '@/lib/stores/authStore'
import { rolePolicy } from '@/lib/services/rolePermissions'
import { callKw } from '@/lib/services/odoo'
import type { Catalog, Category, Floor, PaymentMethod, Product, Settings, Table } from '@/lib/types'

// Formas REALES de load_data (capturadas contra Odoo 19, no supuestas): los many2one llegan
// como enteros pelados, y precio/categorías/impuestos viven en product.template.
interface RawProduct { id: number; product_tmpl_id: number; display_name: string; lst_price: number }
interface RawTemplate { id: number; name: string; list_price: number; pos_categ_ids: number[]; taxes_id: number[]; available_in_pos: boolean; active: boolean; is_favorite: boolean; is_storable: boolean; image_128: string | false }
interface RawCategory { id: number; name: string; sequence: number; kitchen_station: string | false }
interface RawFloor { id: number; name: string; table_ids: number[]; floor_background_image: string | false }
interface RawTable { id: number; table_number: number; floor_id: number; seats: number; active: boolean; position_h: number; position_v: number; width: number; height: number; shape: 'square' | 'round'; color: string | false }
interface RawMethod { id: number; name: string; type: PaymentMethod['type'] }
interface RawCompany { id: number; name: string }
interface RawConfig { id: number; name: string; waiter_can_charge: boolean; waiter_can_edit_inventory: boolean; alert_late_minutes: number; alert_bill_minutes: number; roi_hour_cost: number; roi_minutes_per_order: number; roi_baseline_hours_per_100: number; roi_monthly_cost: number; roi_start_date: string | false; tip_product_id: number | false }
interface RawLoad {
  'product.product': RawProduct[]; 'product.template': RawTemplate[]; 'pos.category': RawCategory[]
  'restaurant.floor': RawFloor[]; 'restaurant.table': RawTable[]; 'pos.payment.method': RawMethod[]; 'res.company': RawCompany[]; 'pos.config': RawConfig[]
}

// "Agotado" solo aplica a productos almacenables: un consumible sin control de stock tiene qty 0 siempre.
async function soldOutIds(products: Product[]): Promise<Set<number>> {
  const ids = products.filter((p) => p.storable).map((p) => p.id)
  if (ids.length === 0) return new Set()
  const rows = await callKw<{ id: number; qty_available: number }[]>('product.product', 'search_read', [[['id', 'in', ids]], ['qty_available']])
  return new Set(rows.filter((r) => r.qty_available <= 0).map((r) => r.id))
}

export async function loadPosData(sessionId: number | null, restaurantId: number | null = null): Promise<Catalog> {
  // Plan T: la carta del sistema propio para su restaurante (sin salón ni caja hasta T2).
  if (onCore()) {
    const id = restaurantId ?? currentRestaurantId()
    if (id === null) throw new Error('Elige un restaurante.')
    const [menu, org] = await Promise.all([coreCatalog.getMenu(id), corePos.getOrg()])
    const name = useAuthStore.getState().restaurants?.find((r) => r.id === id)?.name ?? org.name
    return toCatalog(menu, id, name, org.name)
  }
  // Todos los modelos, como lo hace el propio cliente de Odoo: los cargadores se leen entre sí
  // desde data[...] y una lista parcial rompe con KeyError en cada actualización.
  const raw = sessionId === null ? await loadAdministrationData(restaurantId) : await callKw<RawLoad>('pos.session', 'load_data', [[sessionId], []])

  const templates = new Map(raw['product.template'].filter((t) => t.available_in_pos && t.active).map((t) => [t.id, t]))
  const base: Product[] = raw['product.product'].flatMap((p) => {
    const t = templates.get(p.product_tmpl_id)
    return t ? [{ id: p.id, templateId: t.id, name: t.name, price: t.list_price, categoryIds: t.pos_categ_ids, taxIds: t.taxes_id,
      favorite: Boolean(t.is_favorite), storable: Boolean(t.is_storable), soldOut: false, hasImage: Boolean(t.image_128) }] : []
  })
  const configId = raw['pos.config'][0]?.id ?? null
  const [out, closedHere, localPrices] = await Promise.all([soldOutIds(base), unavailableHere(configId), restaurantPrices(configId, base.map((p) => p.id))])
  const products = base.map((p) => ({ ...p, price: localPrices[String(p.id)] ?? p.price, soldOut: out.has(p.id) || closedHere.has(p.templateId) }))
  const categories: Category[] = raw['pos.category'].map(({ id, name, sequence, kitchen_station }) => ({ id, name, sequence, station: kitchen_station || null }))
  // load_data manda el fondo del plano en base64: aquí solo interesa si existe; la imagen se pide por /web/image.
  const floors: Floor[] = raw['restaurant.floor'].map(({ id, name, table_ids, floor_background_image }) => ({ id, name, tableIds: table_ids, hasBackground: Boolean(floor_background_image) }))
  const tables: Table[] = raw['restaurant.table'].filter((t) => t.active)
    .map((t) => ({ id: t.id, number: t.table_number, floorId: t.floor_id, seats: t.seats, x: t.position_h, y: t.position_v, width: t.width, height: t.height, shape: t.shape, color: t.color || null }))
  const paymentMethods: PaymentMethod[] = raw['pos.payment.method'].map(({ id, name, type }) => ({ id, name, type }))
  const company = { name: raw['res.company'][0]?.name ?? '' }
  const c = raw['pos.config'][0]
  const settings: Settings = { configId: c.id, configName: c.name, waiterCanCharge: c.waiter_can_charge !== false, waiterCanEditInventory: c.waiter_can_edit_inventory === true, alertLateMinutes: c.alert_late_minutes, alertBillMinutes: c.alert_bill_minutes,
    roiHourCost: c.roi_hour_cost, roiMinutesPerOrder: c.roi_minutes_per_order, roiBaselineHoursPer100: c.roi_baseline_hours_per_100,
    roiMonthlyCost: c.roi_monthly_cost, roiStartDate: c.roi_start_date || null, tipProductId: c.tip_product_id || null }
  settings.rolePermissions = await rolePolicy(c.id)
  settings.waiterCanCharge = settings.rolePermissions.waiter.actions.includes('charge_orders')
  settings.waiterCanEditInventory = settings.rolePermissions.waiter.actions.includes('edit_inventory')
  return { company, settings, products, categories, floors, tables, paymentMethods }
}

// Plan O: el precio de cada plato en este restaurante (su lista de precios; sin precio local, el de la organización).
async function restaurantPrices(configId: number | null, productIds: number[]): Promise<Record<string, number>> {
  if (configId === null || productIds.length === 0) return {}
  try { return await callKw<Record<string, number>>('pos.config', 'waiter_catalog_prices', [[configId], productIds]) } catch { return {} }
}

// Plan O: los platos que este restaurante marcó como agotados (`waiter_unavailable_config_ids`); el catálogo sigue siendo
// de la organización. Con un addon anterior al plan O el campo no existe y no hay ninguno.
async function unavailableHere(configId: number | null): Promise<Set<number>> {
  if (configId === null) return new Set()
  try {
    const rows = await callKw<{ id: number }[]>('product.template', 'search_read', [[['waiter_unavailable_config_ids', 'in', [configId]]], ['id']])
    return new Set(rows.map((r) => r.id))
  } catch { return new Set() }
}

// Administración lee los modelos directamente: no crea ni reutiliza una sesión de caja.
async function loadAdministrationData(restaurantId: number | null): Promise<RawLoad> {
  const read = async <T>(model: string, domain: unknown[], fields: string[]): Promise<T[]> => {
    const rows = await callKw<Record<string, unknown>[]>(model, 'search_read', [domain, fields], { order: 'id asc' })
    return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) =>
      [key, Array.isArray(value) && value.length === 2 && typeof value[1] === 'string' ? value[0] : value]))) as T[]
  }
  // El punto de venta del restaurante del dispositivo; sin elegir, el primero visible (una sola sede, como antes).
  const configs = await read<RawConfig & { company_id: number; payment_method_ids: number[] }>('pos.config', restaurantId ? [['id', '=', restaurantId]] : [],
    ['name', 'company_id', 'payment_method_ids', 'waiter_can_charge', 'waiter_can_edit_inventory', 'alert_late_minutes', 'alert_bill_minutes', 'roi_hour_cost', 'roi_minutes_per_order', 'roi_baseline_hours_per_100', 'roi_monthly_cost', 'roi_start_date', 'tip_product_id'])
  const config = configs[0]
  if (!config) throw new Error('No hay un punto de venta configurado para este restaurante.')
  const [products, templates, categories, floors, tables, methods, companies] = await Promise.all([
    read<RawProduct>('product.product', [['available_in_pos', '=', true]], ['product_tmpl_id', 'display_name', 'lst_price']),
    read<RawTemplate>('product.template', [['available_in_pos', '=', true]], ['name', 'list_price', 'pos_categ_ids', 'taxes_id', 'available_in_pos', 'active', 'is_favorite', 'is_storable', 'image_128']),
    read<RawCategory>('pos.category', [], ['name', 'sequence', 'kitchen_station']),
    read<RawFloor>('restaurant.floor', [['pos_config_ids', 'in', [config.id]]], ['name', 'table_ids', 'floor_background_image']),
    read<RawTable>('restaurant.table', [['floor_id.pos_config_ids', 'in', [config.id]]], ['table_number', 'floor_id', 'seats', 'active', 'position_h', 'position_v', 'width', 'height', 'shape', 'color']),
    read<RawMethod>('pos.payment.method', [['id', 'in', config.payment_method_ids]], ['name', 'type']),
    read<RawCompany>('res.company', [['id', '=', config.company_id]], ['name']),
  ])
  return { 'product.product': products, 'product.template': templates, 'pos.category': categories, 'restaurant.floor': floors,
    'restaurant.table': tables, 'pos.payment.method': methods, 'res.company': companies, 'pos.config': [config] }
}
