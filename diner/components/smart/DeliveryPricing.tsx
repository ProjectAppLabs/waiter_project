'use client'

import { useEffect } from 'react'

import { deliveryMode, deliveryPricesText, pricedEntry } from '@/lib/domain/deliveryPricing'
import { useDinerStore } from '@/lib/stores/dinerStore'

// Plan D: mientras el cliente pide a domicilio y la sede tiene recargo, la carta muestra los precios para domicilio; si
// vuelve a recoger o a una mesa, los de siempre. El servidor cobra lo mismo (recargo al peso en el carrito y el pedido).
export function useDeliveryPricing() {
  const entry = useDinerStore((s) => s.entry)
  const draft = useDinerStore((s) => s.deliveryDraft)
  const cart = useDinerStore((s) => s.cart)
  useEffect(() => {
    if (!entry) return
    const percent = !entry.contexto?.mesa && deliveryMode(draft, cart) ? entry.domicilio?.recargo ?? 0 : 0
    if ((entry.preciosDomicilio ?? 0) === percent) return
    useDinerStore.setState({ entry: pricedEntry(entry, percent) })
  }, [entry, draft, cart])
}

export function DeliveryPricesNote() {
  const text = deliveryPricesText(useDinerStore((s) => s.entry))
  if (!text) return null
  return <p className="sm-note sm-delivery-prices" role="status">🛵 {text}</p>
}
