import { callKw } from '@/lib/services/odoo'

// Plan O: el catálogo maestro de la organización con lo propio de cada restaurante (precio local y agotado).
export interface MasterDish { templateId: number; variantId: number; name: string; category: string; basePrice: number; unavailableIn: number[] }
export interface MasterCatalog { dishes: MasterDish[]; prices: Record<number, Record<number, number>> }
type RawTemplate = { id: number; name: string; list_price: number; pos_categ_ids: number[]; waiter_unavailable_config_ids: number[]; product_variant_id: [number, string] | false }

export async function loadMasterCatalog(restaurantIds: number[]): Promise<MasterCatalog> {
  const [templates, categories] = await Promise.all([
    callKw<RawTemplate[]>('product.template', 'search_read', [[['available_in_pos', '=', true], ['sale_ok', '=', true]], ['name', 'list_price', 'pos_categ_ids', 'waiter_unavailable_config_ids', 'product_variant_id']], { order: 'name asc' }),
    callKw<{ id: number; name: string }[]>('pos.category', 'search_read', [[], ['name']]),
  ])
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))
  const dishes = templates.filter((t) => t.product_variant_id).map((t) => ({ templateId: t.id, variantId: (t.product_variant_id as [number, string])[0], name: t.name,
    category: categoryName.get(t.pos_categ_ids[0]) ?? '', basePrice: t.list_price, unavailableIn: t.waiter_unavailable_config_ids ?? [] }))
  const variants = dishes.map((d) => d.variantId)
  const perRestaurant = await Promise.all(restaurantIds.map((id) => callKw<Record<string, number>>('pos.config', 'waiter_catalog_prices', [[id], variants]).catch(() => ({}))))
  // prices[restaurante][variante]
  const prices = Object.fromEntries(restaurantIds.map((id, i) => [id, Object.fromEntries(Object.entries(perRestaurant[i]).map(([k, v]) => [Number(k), v]))]))
  return { dishes, prices }
}

export const setDishAvailability = (templateId: number, configId: number, available: boolean) =>
  callKw<boolean>('product.template', 'waiter_set_availability', [[templateId], configId, available])

// `price` null vuelve al precio de la organización. Devuelve el precio resultante en ese restaurante.
export const setDishPrice = (configId: number, templateId: number, price: number | null) =>
  callKw<number>('pos.config', 'waiter_set_catalog_price', [[configId], templateId, price ?? false])

// Los platos de `templateIds` agotados en el restaurante `configId`.
export async function closedDishes(templateIds: number[], configId: number): Promise<Set<number>> {
  const rows = await callKw<{ id: number }[]>('product.template', 'search_read', [[['id', 'in', templateIds], ['waiter_unavailable_config_ids', 'in', [configId]]], ['id']])
  return new Set(rows.map((r) => r.id))
}
