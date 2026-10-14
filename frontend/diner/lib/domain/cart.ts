import type { Cart, CartLine } from '@/lib/types'

export function mine(cart: Cart): CartLine[] {
  return cart.lineas.filter((l) => l.mio)
}
export function others(cart: Cart): CartLine[] {
  return cart.lineas.filter((l) => !l.mio)
}
export function itemCount(cart: Cart | null): number {
  return cart ? cart.lineas.reduce((a, l) => a + l.cantidad, 0) : 0
}
// "Recomendado para ti": favoritos primero; sin favoritos, los primeros de la carta. Nunca agotados.
export function recommended<T extends { agotado: boolean; favorito?: boolean }>(dishes: T[], n = 4): T[] {
  const live = dishes.filter((d) => !d.agotado)
  const fav = live.filter((d) => d.favorito)
  return [...fav, ...live.filter((d) => !d.favorito)].slice(0, n)
}
export const formatCop = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(Math.round(n))
