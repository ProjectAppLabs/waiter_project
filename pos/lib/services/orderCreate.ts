import { onCore } from '@/lib/domain/backend'
import { PRESET_ID } from '@/lib/domain/orderWizard'
import * as sales from '@/lib/services/core/sales'
import { toCreatedOrder } from '@/lib/services/core/salesBridge'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { comboChildUuid, type CartLine, type KitOrderPayload } from '@/lib/domain/orderWizard'
import { callKw } from '@/lib/services/odoo'

// Creación del pedido del wizard: mismo sync_from_ui que lib/services/orders.ts, con preset, nombre libre, comensales,
// mesa cuando aplica, valores de atributo por línea y líneas hijas de combo enlazadas a su padre.
export interface CreatedOrder { id: number; reference: string; trackingNumber: string; total: number; tax: number }

interface RawOrder { id: number; pos_reference: string; tracking_number: string | false; amount_total: number; amount_tax: number }
interface RawLine { id: number; uuid: string }

async function linkComboChildren(orderId: number, lines: CartLine[]): Promise<void> {
  const pairs = lines.flatMap((l) => l.options.filter((o) => o.kind === 'combo').map((o) => ({ parent: l.uuid, child: comboChildUuid(l.uuid, o.id) })))
  if (pairs.length === 0) return
  const rows = await callKw<RawLine[]>('pos.order.line', 'search_read', [[['order_id', '=', orderId]], ['uuid']])
  const idOf = (uuid: string) => rows.find((r) => r.uuid === uuid)?.id
  for (const { parent, child } of pairs) {
    const parentId = idOf(parent)
    const childId = idOf(child)
    if (parentId && childId) await callKw('pos.order.line', 'write', [[childId], { combo_parent_id: parentId }])
  }
}

export async function createKitOrder(payload: KitOrderPayload, lines: CartLine[]): Promise<CreatedOrder> {
  if (onCore()) {
    const service = payload.preset_id === PRESET_ID.delivery ? 'delivery' : payload.preset_id === PRESET_ID.takeAway ? 'takeout' : 'dine_in'
    const order = await sales.createOrder({
      restaurant_id: currentRestaurantId() ?? 0, uuid: payload.uuid, service, table_id: payload.table_id || null, guests: payload.customer_count,
      customer_name: payload.floating_order_name, note: payload.general_customer_note, fire: false,
      lines: lines.map((l) => ({
        uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note,
        options: l.options.filter((o) => o.kind === 'attribute').map((o) => ({ group: 'attribute', name: o.name, price_extra: o.priceExtra })),
        children: l.options.filter((o) => o.kind === 'combo' && o.productId !== null).map((o) => ({ uuid: comboChildUuid(l.uuid, o.id), product_id: o.productId as number, qty: l.qty })),
      })),
    })
    return toCreatedOrder(order)
  }
  const result = await callKw<{ 'pos.order': { id: number }[] }>('pos.order', 'sync_from_ui', [[payload]])
  const id = result['pos.order'][0].id
  // sync_from_ui deja los totales en 0 por la API cruda; el recálculo respeta price_unit cuando attribute_value_ids está enlazado.
  await callKw<void>('pos.order', 'recompute_prices', [[id]])
  await linkComboChildren(id, lines)
  const [raw] = await callKw<RawOrder[]>('pos.order', 'read', [[id], ['pos_reference', 'tracking_number', 'amount_total', 'amount_tax']])
  return { id: raw.id, reference: raw.pos_reference, trackingNumber: raw.tracking_number || String(raw.id), total: raw.amount_total, tax: raw.amount_tax }
}
