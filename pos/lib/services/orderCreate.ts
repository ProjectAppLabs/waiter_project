import { type CartLine, type KitOrderPayload } from '@/lib/domain/orderWizard'
import { useOutboxStore } from '@/lib/offline/outbox'
import { currentRestaurantId } from '@/lib/services/core/catalogBridge'
import { CoreError } from '@/lib/services/core/http'
import * as sales from '@/lib/services/core/sales'
import { toCreatedOrder } from '@/lib/services/core/salesBridge'
import { withComboChildren } from '@/lib/services/productOptions'

// `offline`: guardado en la cola de salida (plan U2); `id` es provisional y negativo hasta sincronizar.
export interface CreatedOrder { id: number; reference: string; trackingNumber: string; total: number; tax: number; offline?: boolean }

export async function kitOrderInput(payload: KitOrderPayload, lines: CartLine[]): Promise<sales.OrderInput> {
  const service = payload.type === 'delivery' ? 'delivery' : payload.type === 'takeAway' ? 'takeout' : 'dine_in'
  return {
    restaurant_id: currentRestaurantId() ?? 0, uuid: payload.uuid, service, table_id: payload.tableId || null, guests: payload.people,
    customer_name: payload.name, note: payload.note, fire: false,
    lines: await withComboChildren(lines.map((l) => ({
      uuid: l.uuid, product_id: l.productId, qty: l.qty, note: l.note,
      options: l.options.filter((o) => o.kind === 'attribute').map((o) => ({ group: 'attribute', name: o.name, price_extra: o.priceExtra })),
    }))),
  }
}

let provisional = 0
// Sin conexión, con `offline` (los totales que calcula el carrito), el pedido queda en la cola de salida y se devuelve
// con un id provisional. Sin `offline`, el error sube como siempre.
export async function createKitOrder(payload: KitOrderPayload, lines: CartLine[], offline?: { total: number; tax: number; label: string }): Promise<CreatedOrder> {
  const input = await kitOrderInput(payload, lines)
  try {
    return toCreatedOrder(await sales.createOrder(input))
  } catch (e) {
    if (!offline || !(e instanceof CoreError && e.code === 'unreachable')) throw e
    useOutboxStore.getState().enqueue({ kind: 'create_order', uuid: payload.uuid, body: input, label: offline.label })
    return { id: -(++provisional), reference: '', trackingNumber: '', total: offline.total, tax: offline.tax, offline: true }
  }
}
