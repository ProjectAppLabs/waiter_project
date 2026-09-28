import { callKw, currentConfigId } from '@/lib/services/odoo'

export interface StockRow { productId: number; templateId: number; name: string; qty: number }
interface RawStock { id: number; display_name: string; qty_available: number; product_tmpl_id: [number, string] }

// Plan O: el almacén del restaurante en uso (su punto de venta apunta a él); sin restaurante conocido, el primero.
export async function stockLocationId(): Promise<number> {
  const configId = currentConfigId()
  const [config] = configId !== null ? await callKw<{ warehouse_id: [number, string] | false }[]>('pos.config', 'read', [[configId], ['warehouse_id']]) : []
  const domain = config?.warehouse_id ? [['id', '=', config.warehouse_id[0]]] : []
  const [wh] = await callKw<{ lot_stock_id: [number, string] }[]>('stock.warehouse', 'search_read', [domain, ['lot_stock_id']], { limit: 1 })
  return wh.lot_stock_id[0]
}

// Solo los que controlan existencias: un consumible sin control tiene qty 0 siempre y no es "agotado".
export async function listStock(): Promise<StockRow[]> {
  // Existencias en el almacén del restaurante en uso (contexto `location`), no la suma de todos.
  const location = currentConfigId() !== null ? await stockLocationId() : null
  const rows = await callKw<RawStock[]>('product.product', 'search_read', [[['is_storable', '=', true], ['sale_ok', '=', true]], ['display_name', 'qty_available', 'product_tmpl_id']],
    { order: 'display_name asc', ...(location ? { context: { location } } : {}) })
  return rows.map((r) => ({ productId: r.id, templateId: r.product_tmpl_id[0], name: r.display_name, qty: r.qty_available }))
}

// Ajuste de inventario al estilo Odoo: se fija la cantidad contada en el quant y se aplica.
export async function setStock(productId: number, locationId: number, qty: number): Promise<void> {
  const found = await callKw<{ id: number }[]>('stock.quant', 'search_read', [[['product_id', '=', productId], ['location_id', '=', locationId]], ['id']], { limit: 1 })
  let quantId = found[0]?.id
  if (quantId) await callKw('stock.quant', 'write', [[quantId], { inventory_quantity: qty }])
  else quantId = await callKw<number>('stock.quant', 'create', [{ product_id: productId, location_id: locationId, inventory_quantity: qty }])
  await callKw('stock.quant', 'action_apply_inventory', [[quantId]])
}
