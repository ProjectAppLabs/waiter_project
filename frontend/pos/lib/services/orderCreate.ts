import { lineSubtotal, lineUnitPrice, type CartLine, type KitOrderPayload } from '@/lib/domain/orderWizard'
import { tablePlace } from '@/lib/offline/comanda'
import { useEmergencyOrders } from '@/lib/offline/emergency'
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

// Sin conexión, con `offline` (los totales que calcula el carrito), el pedido queda en la cola de salida y en los
// pedidos de emergencia del equipo (plan V): número provisional E-nn, id negativo, hora real. Sin `offline`, el error
// sube como siempre.
export async function createKitOrder(payload: KitOrderPayload, lines: CartLine[], offline?: { total: number; tax: number; label: string }): Promise<CreatedOrder> {
  const input = await kitOrderInput(payload, lines)
  try {
    return toCreatedOrder(await sales.createOrder(input))
  } catch (e) {
    if (!offline || !(e instanceof CoreError && e.code === 'unreachable')) throw e
    const place = tablePlace(payload.tableId)
    const order = useEmergencyOrders.getState().register({
      uuid: payload.uuid, type: input.service, tableId: payload.tableId || null, tableNumber: place.kind === 'table' ? place.number : null,
      customer: payload.name, total: offline.total, tax: offline.tax,
      lines: lines.map((l) => ({ uuid: l.uuid, productId: l.productId, name: l.name, qty: l.qty, note: l.note, options: l.options.map((o) => o.name),
        unitPrice: lineUnitPrice(l), total: lineSubtotal(l) })),
    })
    // La nota lleva el número provisional: así, ya en el servidor, el pedido se reconoce en Historial.
    const body = { ...input, created_at: order.createdAt, note: [`Emergencia ${order.number}`, input.note].filter(Boolean).join(' · ') }
    useOutboxStore.getState().enqueue({ kind: 'create_order', uuid: payload.uuid, body, label: `${order.number} ${offline.label}`.trim() })
    return { id: order.localId, reference: order.number, trackingNumber: order.number, total: offline.total, tax: offline.tax, offline: true }
  }
}
