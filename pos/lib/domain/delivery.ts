import type { KitOrder } from '@/lib/domain/orderState'

// Plan D: un pedido a domicilio. Las coordenadas son la verdad para llegar; el texto y las indicaciones son para el
// domiciliario (torre, apartamento, portería).
export type DeliveryPayment = 'online' | 'cash' | 'card_on_delivery' | ''
export interface DeliveryInfo {
  address: string; details: string; phone: string; lat: number | null; lng: number | null
  fee: number; payment: DeliveryPayment; distanceKm: number | null
}

export const PAYMENT_LABEL: Record<DeliveryPayment, string> = {
  online: 'Pagado en línea', cash: 'Efectivo contra entrega', card_on_delivery: 'Datáfono contra entrega', '': 'Por definir',
}

export const isDelivery = (order: Pick<KitOrder, 'type'>) => order.type === 'delivery'

// El enlace que abre Google Maps en el celular del domiciliario, sin clave ni costo.
export const mapsUrl = (lat: number | null, lng: number | null) =>
  lat === null || lng === null ? null : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

// Lo que el recibo de domicilio necesita, ya listo para pintar.
export interface DeliveryReceipt {
  number: string; at: string; customer: string; phone: string; address: string; details: string
  lines: { qty: number; name: string; total: number; note: string }[]
  fee: number; total: number; payment: string; paid: boolean; map: string | null
}

export function deliveryReceipt(order: KitOrder, paid: boolean): DeliveryReceipt | null {
  const d = order.delivery
  if (!isDelivery(order) || !d) return null
  return {
    number: order.number, at: order.startedAt, customer: order.customer, phone: d.phone || order.phone || '', address: d.address, details: d.details,
    lines: order.lines.filter((l) => l.name !== 'Domicilio').map((l) => ({ qty: l.qty, name: l.name, total: l.total, note: l.note })),
    fee: d.fee, total: order.total, payment: PAYMENT_LABEL[d.payment], paid, map: mapsUrl(d.lat, d.lng),
  }
}
