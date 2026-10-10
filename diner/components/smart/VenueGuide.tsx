'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { myCount } from '@/lib/domain/cartEvents'
import { alreadyAsked, carryTo, markAsked, takeCarried, type CarriedLocation } from '@/lib/domain/venueRedirect'
import { quoteDelivery } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'

// Plan D: lleva al comensal a la sede que le queda bien. Si ya tiene platos en esta sede, no se le borra el pedido:
// se le avisa y él decide.
export function useVenueSwitch() {
  const router = useRouter()
  const { keys, cart } = useDinerStore()
  const hasItems = myCount(cart) > 0
  function go(slug: string, nombre: string, location: CarriedLocation, motivo?: string) {
    if (!keys) return
    carryTo(keys.rest, slug, location, motivo ?? `Te pasamos a la sede ${nombre}: es la que lleva domicilios a tu dirección.`)
    router.push(`/${encodeURIComponent(keys.rest)}/${encodeURIComponent(slug)}/carta`)
  }
  return { hasItems, go, venue: keys?.venue ?? '' }
}

// Al llegar: el aviso de por qué se cambió de sede y la ubicación lista para el domicilio. Al entrar sin mesa (una vez
// por pestaña): se pide la ubicación y, si otra sede le queda más cerca y le llega, se le lleva allá.
export function VenueGuide() {
  const { keys, entry, preview } = useDinerStore()
  const { hasItems, go } = useVenueSwitch()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (!keys) return
    const carried = takeCarried(keys.rest, keys.venue)
    if (carried) {
      useDinerStore.setState({ deliveryDraft: carried.location })
      void Promise.resolve().then(() => setNotice(carried.motivo))
    }
  }, [keys])
  useEffect(() => {
    if (!keys || !entry || preview || entry.contexto?.mesa || !entry.domicilio || alreadyAsked(keys.rest) || !navigator.geolocation) return
    markAsked(keys.rest)
    navigator.geolocation.getCurrentPosition(async (p) => {
      const point = { lat: p.coords.latitude, lng: p.coords.longitude }
      try {
        const q = await quoteDelivery(keys.rest, point.lat, point.lng)
        if (!q.cobertura) return
        const location = { ...point, direccion: '' }
        if (q.sede.slug === keys.venue) { useDinerStore.setState({ deliveryDraft: location }); return }
        if (!hasItems) go(q.sede.slug, q.sede.nombre, location, `Te mostramos la sede ${q.sede.nombre}, la más cercana a ti.`)
        else setNotice(`La sede ${q.sede.nombre} te queda más cerca. Si quieres domicilio, pídelo desde su menú.`)
      } catch { /* sin ubicación se sigue en esta sede */ }
    }, () => undefined, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 })
    // Se pide una sola vez al cargar la sede.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, entry, preview])
  if (!notice) return null
  return <p className="sm-venue-notice" role="status"><span>{notice}</span><button type="button" aria-label="Cerrar aviso" onClick={() => setNotice('')}>×</button></p>
}
