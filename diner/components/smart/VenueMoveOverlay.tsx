'use client'

import { useEffect, useRef } from 'react'

import { useDinerStore } from '@/lib/stores/dinerStore'

// Plan D: la pantalla de paso a otra sede. Vive en los proveedores de la app (no dentro de la carta) para seguir en
// pantalla mientras la sede nueva carga, sin el parpadeo de «Preparando tu mesa…». Es un diálogo modal para quedar
// encima del chat o de la confirmación del pedido; usa los colores de la plantilla de la marca.
export function VenueMoveOverlay() {
  const move = useDinerStore((s) => s.venueMove)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (!move || !element) return
    if (!element.open) { try { element.showModal() } catch { element.setAttribute('open', '') } }
    return () => { try { element.close() } catch { /* ya cerrado */ } }
  }, [move])
  if (!move) return null
  return (
    <dialog ref={dialog} className="venue-move" style={move.colores as React.CSSProperties | undefined}
      aria-labelledby="venue-move-title" onCancel={(e) => e.preventDefault()}>
      <span className="venue-move-icon" aria-hidden="true">📍</span>
      <h2 id="venue-move-title">Te transferimos a la sede {move.nombre}</h2>
      {move.direccion ? <p>Guardamos tu dirección: <strong>{move.direccion}</strong>.</p> : <p>Guardamos tu ubicación.</p>}
      <p>Es la sede que lleva domicilios hasta esa dirección.</p>
      <span className="venue-move-bar" role="progressbar" aria-label="Cambiando de sede"><span /></span>
    </dialog>
  )
}
