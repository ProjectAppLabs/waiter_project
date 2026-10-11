'use client'

import { Icon } from '@/components/kit/Icon'
import { deliveryReceipt, mapsUrl, PAYMENT_LABEL } from '@/lib/domain/delivery'
import { formatCop } from '@/lib/domain/money'
import type { KitOrder } from '@/lib/domain/orderState'
import { usePrintStore } from '@/lib/stores/printStore'

// Insignia del domicilio en las tarjetas de caja y pedidos: el color propio lo distingue de un vistazo.
export function DeliveryBadge({ order }: { order: KitOrder }) {
  if (order.type !== 'delivery') return null
  const payment = order.delivery?.payment
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="inline-flex items-center gap-1 rounded-sm bg-delivery px-2 py-1 font-semibold text-white"><Icon name="delivery" size={14} />Domicilio</span>
      {payment && <span className="rounded-sm bg-delivery-soft px-2 py-1 font-semibold text-delivery-ink">{PAYMENT_LABEL[payment]}</span>}
    </div>
  )
}

// Plan D: en el detalle, todo lo que necesita quien despacha: a dónde, a quién, cuánto cobrar y el recibo impreso.
export function DeliveryPanel({ order }: { order: KitOrder }) {
  const printDelivery = usePrintStore((s) => s.printDelivery)
  const d = order.delivery
  if (order.type !== 'delivery' || !d) return null
  const paid = (order.paid ?? 0) >= order.total && order.total > 0
  const map = mapsUrl(d.lat, d.lng)
  const receipt = deliveryReceipt(order, paid)
  return (
    <section aria-label="Datos del domicilio" className="rounded-md border border-delivery bg-delivery-soft p-3 flex flex-col gap-2 text-[14px] text-ink">
      <p className="font-semibold text-delivery-ink inline-flex items-center gap-1.5"><Icon name="delivery" size={16} />Domicilio{d.distanceKm !== null ? ` · ${d.distanceKm.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km` : ''}</p>
      <p><span className="text-soft">Dirección: </span><strong>{d.address || '—'}</strong></p>
      {d.details && <p><span className="text-soft">Indicaciones: </span>{d.details}</p>}
      <p><span className="text-soft">Teléfono: </span><a className="font-semibold underline tabular" href={`tel:${d.phone || order.phone || ''}`}>{d.phone || order.phone || '—'}</a></p>
      <p><span className="text-soft">Envío: </span>$ {formatCop(d.fee)} · <span className="text-soft">Pago: </span>{paid ? 'Pagado' : PAYMENT_LABEL[d.payment]}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        {map && <a href={map} target="_blank" rel="noreferrer" className="h-9 px-3 rounded-sm border border-border bg-surface text-[14px] font-semibold inline-flex items-center gap-1.5"><Icon name="mapPin" size={16} />Abrir en Google Maps</a>}
        {receipt && <button type="button" onClick={() => printDelivery(receipt)} className="h-9 px-3 rounded-sm bg-delivery text-white text-[14px] font-semibold inline-flex items-center gap-1.5"><Icon name="printer" size={16} />Imprimir recibo de domicilio</button>}
      </div>
    </section>
  )
}
