import type { Cart } from '@/lib/types'

// Cuando algo entra al pedido (desde la carta, el plato, un combo o el mesero virtual), la pantalla lo celebra con el
// papelito que cae al carrito. El store solo avisa; la animación vive en la interfaz.
export const CART_ADDED = 'waiter:carrito-agregado'
export function announceAdd() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CART_ADDED))
}
// Lo que el comensal ve en su carrito: solo sus líneas.
export const myCount = (cart: Cart | null | undefined) => (cart?.lineas ?? []).filter((l) => l.mio).reduce((n, l) => n + l.cantidad, 0)
