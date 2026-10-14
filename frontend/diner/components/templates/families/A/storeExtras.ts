'use client'

import { itemCount } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'

// Familia A · lo que los marcos piden y las props del contrato 4 no traen: la carta (fotos de las líneas del carrito y sugerencia de
// postre), el conteo de platos en el pago y «Pedir sumiller» (llamar al mesero). Un solo módulo para que los tests lo simulen de una vez.
export const useEntry = () => useDinerStore((s) => s.entry)
export const useCartCount = () => useDinerStore((s) => itemCount(s.cart))
export const useCallWaiter = () => useDinerStore((s) => s.call)
