import type { Cart, Dish, Entry } from '@/lib/types'

// Plan D: el recargo de domicilio que define el dueño (por ejemplo, para ofrecer envío gratis). El precio con recargo se
// redondea al peso, igual que en el servidor, y se muestra desde que el cliente está pidiendo a domicilio: la ley pide
// informar el precio total antes de pagar.
export const markedPrice = (price: number, percent: number) => (percent ? Math.round((price * (100 + percent)) / 100) : price)

function markDish(dish: Dish, percent: number): Dish {
  const a = dish.atributos
  return {
    ...dish, precio: markedPrice(dish.precio, percent),
    ...(a ? { atributos: { ...a, ...(a.precioAntes ? { precioAntes: markedPrice(a.precioAntes, percent) } : {}),
      ...(a.tamanos ? { tamanos: a.tamanos.map((t) => ({ ...t, precio: markedPrice(t.precio, percent) })) } : {}) } } : {}),
  }
}

// La carta con los precios para domicilio; guarda la original en `base` para volver a ella.
export function pricedEntry(entry: Entry, percent: number): Entry {
  const base = entry.base ?? entry
  if (!percent) return base
  return { ...base, base, preciosDomicilio: percent,
    carta: { ...base.carta, categorias: base.carta.categorias.map((c) => ({ ...c, productos: c.productos.map((d) => markDish(d, percent)) })) } }
}

// Si el cliente está pidiendo a domicilio: ya dio su ubicación en esta visita o su pedido ya tiene la entrega puesta.
export const deliveryMode = (draft: unknown, cart: Cart | null | undefined) => !!draft || !!cart?.domicilio

export function deliveryPricesText(entry: Entry | null | undefined): string | null {
  const percent = entry?.preciosDomicilio
  if (!percent) return null
  return entry?.domicilio?.cobro === 'free'
    ? `Domicilio gratis: el envío va incluido en estos precios (+${percent} %).`
    : `Precios para domicilio (+${percent} %).`
}

// «Envío gratis desde $ 60.000 · te faltan $ 12.000» mientras no se alcance; null si no aplica o ya se alcanzó.
export function freeFromText(freeFrom: number | null | undefined, food: number, format: (n: number) => string): string | null {
  if (!freeFrom || food >= freeFrom) return null
  return `Envío gratis desde ${format(freeFrom)} en platos · te faltan ${format(freeFrom - food)}`
}
