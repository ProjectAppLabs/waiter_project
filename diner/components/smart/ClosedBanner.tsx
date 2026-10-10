'use client'

import type { Entry } from '@/lib/types'

// Plan D: fuera del horario que definió el dueño, la carta se puede mirar pero no se confirman pedidos; se dice cuándo abre.
export function closedText(entry: Entry | null | undefined): string | null {
  const h = entry?.horario
  // Dentro del horario, pero sin caja abierta en el POS: la sede no está recibiendo pedidos.
  if ((!h || h.abierto) && entry?.pedidos === false) return 'En este momento no estamos recibiendo pedidos'
  if (!h || h.abierto) return null
  return h.abre ? `Cerrado ahora · abre ${h.abre.cuando} a las ${h.abre.hora}` : 'Cerrado ahora'
}

export function ClosedBanner({ entry }: { entry: Entry | null | undefined }) {
  const text = closedText(entry)
  if (!text) return null
  return <p className="sm-note sm-closed-banner" role="status"><strong>{text}</strong><span>Puedes mirar la carta; los pedidos se confirman cuando abramos.</span></p>
}
