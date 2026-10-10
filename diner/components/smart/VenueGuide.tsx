'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { myCount } from '@/lib/domain/cartEvents'
import { carryTo, takeCarried, type CarriedLocation } from '@/lib/domain/venueRedirect'
import { addLine } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'

// Plan D: lleva al comensal a la sede que le llega, con su ubicación y con los platos que ya había escogido.
export function useVenueSwitch() {
  const router = useRouter()
  const { keys, cart } = useDinerStore()
  const hasItems = myCount(cart) > 0
  function go(slug: string, nombre: string, location: CarriedLocation, motivo?: string) {
    if (!keys) return
    const lines = (cart?.lineas ?? []).filter((l) => l.mio).map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, nota: l.nota, nombre: l.nombre }))
    carryTo(keys.rest, slug, location, motivo ?? `Te pasamos a la sede ${nombre}: es la que lleva domicilios a tu dirección.`, lines)
    router.push(`/${encodeURIComponent(keys.rest)}/${encodeURIComponent(slug)}/${lines.length ? 'pedido' : 'carta'}`)
  }
  return { hasItems, go, venue: keys?.venue ?? '' }
}

// Al llegar a la sede: la ubicación queda lista para el domicilio, los platos que traía se agregan aquí (cada uno se
// revisa: precio y disponibilidad de esta sede) y se explica por qué se cambió de sede y qué no se pudo pasar.
export function VenueGuide() {
  const { keys } = useDinerStore()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!keys) return
    const carried = takeCarried(keys.rest, keys.venue)
    if (!carried) return
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
      setNotice(`${carried.motivo}${moved}${missing.length ? ` No están disponibles aquí: ${missing.join(', ')}.` : ''}`)
    })()
  }, [keys])
  if (!notice) return null
  return <p className="sm-venue-notice" role="status"><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></p>
}
