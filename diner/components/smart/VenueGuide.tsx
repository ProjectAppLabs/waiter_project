'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { myCount } from '@/lib/domain/cartEvents'
import { carryTo, takeCarried, type CarriedLocation } from '@/lib/domain/venueRedirect'
import { addLine } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'

// Tiempo para leer el aviso antes de pasar a la otra sede.
export const MOVE_DELAY = 1600

// Plan D: lleva al comensal a la sede que le llega, con su ubicación y con los platos que ya había escogido. Antes de
// irse se le dice qué pasa («guardamos tu dirección, te llevamos a…») para que el cambio de pantalla no lo sorprenda.
export function useVenueSwitch() {
  const router = useRouter()
  const { keys, cart } = useDinerStore()
  const hasItems = myCount(cart) > 0
  function go(slug: string, nombre: string, location: CarriedLocation, motivo?: string) {
    if (!keys) return
    const lines = (cart?.lineas ?? []).filter((l) => l.mio).map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, nota: l.nota, nombre: l.nombre }))
    const saved = location.direccion ? `: ${location.direccion}` : ''
    carryTo(keys.rest, slug, location, motivo ?? `Ya estás en la sede ${nombre}. Tu dirección quedó guardada${saved}.`, lines)
    useDinerStore.setState({ venueMove: { nombre, direccion: location.direccion } })
    const path = `/${encodeURIComponent(keys.rest)}/${encodeURIComponent(slug)}/${lines.length ? 'pedido' : 'carta'}`
    setTimeout(() => router.push(path), MOVE_DELAY)
  }
  return { hasItems, go, venue: keys?.venue ?? '' }
}

// La pantalla de paso: un diálogo modal para quedar encima del chat o de la confirmación del pedido.
function MoveNotice({ nombre, direccion }: { nombre: string; direccion: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) { try { element.showModal() } catch { element.setAttribute('open', '') } }
    return () => { try { element?.close() } catch { /* ya cerrado */ } }
  }, [])
  return (
    <dialog ref={dialog} className="sm-venue-move" aria-labelledby="sm-venue-move-title" onCancel={(e) => e.preventDefault()}>
      <span className="sm-venue-move-icon" aria-hidden="true">📍</span>
      <h2 id="sm-venue-move-title">Te llevamos a la sede {nombre}</h2>
      {direccion ? <p>Guardamos tu dirección: <strong>{direccion}</strong>.</p> : <p>Guardamos tu ubicación.</p>}
      <p>Es la sede que te queda más cerca y lleva domicilios hasta allá.</p>
      <span className="sm-venue-move-bar" role="progressbar" aria-label="Cambiando de sede"><span /></span>
    </dialog>
  )
}

// Al llegar a la sede: la ubicación queda lista para el domicilio, los platos que traía se agregan aquí (cada uno se
// revisa: precio y disponibilidad de esta sede), se reabre la confirmación si venía pagando y se explica qué pasó.
export function VenueGuide() {
  const { keys, entry, venueMove } = useDinerStore()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    // Se espera a que cargue la sede nueva: el aviso de paso sigue en pantalla mientras tanto.
    if (!keys || entry?.contexto?.sede?.slug !== keys.venue) return
    const carried = takeCarried(keys.rest, keys.venue)
    if (!carried) { if (useDinerStore.getState().venueMove) useDinerStore.setState({ venueMove: null }); return }
    useDinerStore.setState({ deliveryDraft: carried.location })
    void (async () => {
      const missing: string[] = []
      if (carried.lines.length) {
        const session = await useDinerStore.getState().ensureSession()
        for (const line of carried.lines) {
          try { if (session) useDinerStore.setState({ cart: await addLine(session.id, line.producto_id, line.cantidad, line.nota) }); else missing.push(line.nombre) }
          catch { missing.push(line.nombre) }
        }
      }
      const moved = carried.lines.length > missing.length ? ' Trajimos tu pedido.' : ''
      useDinerStore.setState({ venueMove: null, reopenDelivery: carried.lines.length > missing.length })
      setNotice(`${carried.motivo}${moved}${missing.length ? ` No están disponibles aquí: ${missing.join(', ')}.` : ''}`)
    })()
  }, [keys, entry])
  return <>
    {venueMove && <MoveNotice nombre={venueMove.nombre} direccion={venueMove.direccion} />}
    {notice && <p className="sm-venue-notice" role="status"><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></p>}
  </>
}
