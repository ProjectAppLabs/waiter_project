import { type CartLine, type KitOrderPayload } from '@/lib/domain/orderWizard'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import * as sales from '@/lib/services/core/sales'
import { toCreatedOrder } from '@/lib/services/core/salesBridge'
import { withComboChildren } from '@/lib/services/productOptions'

export interface CreatedOrder { id: number; reference: string; trackingNumber: string; total: number; tax: number }

export async function createKitOrder(payload: KitOrderPayload, lines: CartLine[]): Promise<CreatedOrder> {
  const service = payload.type === 'delivery' ? 'delivery' : payload.type === 'takeAway' ? 'takeout' : 'dine_in'
  const order = await sales.createOrder({
    restaurant_id: currentRestaurantId() ?? 0, uuid: payload.uuid, service, table_id: payload.tableId || null, guests: payload.people,
    customer_name: payload.name, note: payload.note, fire: false,
    lines: await withComboChildren(lines.map((l) => ({
      uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note,
      options: l.options.filter((o) => o.kind === 'attribute').map((o) => ({ group: 'attribute', name: o.name, price_extra: o.priceExtra })),
    }))),
  })
  return toCreatedOrder(order)
}
