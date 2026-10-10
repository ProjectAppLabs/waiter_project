'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { formatCop } from '@/lib/domain/cart'
import { myCount } from '@/lib/domain/cartEvents'
import { getVenueLocation, quoteDelivery, reverseAddress, type Coverage } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Point } from './LocationPicker'
import { Icon } from './SmartMenu'
import { usePinAddress } from './usePinAddress'
import { useVenueSwitch } from './VenueGuide'
import { zoneOf } from './zone'
import { AddressSearch, type FoundAddress } from './AddressSearch'

const LocationPicker = dynamic(() => import('./LocationPicker').then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="sm-map" aria-busy="true" /> })
const MEDELLIN: Point = { lat: 6.2442, lng: -75.5812 }

// Plan D: cuando el comensal habla de domicilio, el mesero le pide la ubicación ahí mismo en el chat: la suya (GPS) o,
// si es para otra persona, un punto en el mapa. Le dice qué sede se lo lleva y cuánto vale el envío, y deja la ubicación
// lista para cuando confirme el pedido.
export function ChatDelivery({ pedido, onLeave, onSend }: { pedido: string; onLeave: () => void; onSend?: (text: string) => void }) {
  const { keys, entry, cart } = useDinerStore()
  const [mode, setMode] = useState<'choose' | 'map' | 'done'>('choose')
  const [point, setPoint] = useState<Point | null>(null), [center, setCenter] = useState<Point>(MEDELLIN)
  const [address, setAddress] = useState('')
  const [coverage, setCoverage] = useState<Coverage | null>(null), [confirmed, setConfirmed] = useState('')
  const venues = useVenueSwitch()
  const [checked, setChecked] = useState<Point | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  // Como en la hoja del pedido: el pin llena la dirección y lo escrito lleva el mapa hasta allá.
  const typed = useRef(false), flying = useRef<Point | null>(null)
  const pin = usePinAddress(mode === 'map' ? keys?.rest : null, point)
  useEffect(() => { if (pin.address && !typed.current) setAddress(pin.address) }, [pin.address])
  useEffect(() => {
    if (mode !== 'map' || !keys) return
    getVenueLocation(keys.rest, keys.venue).then((v) => { if (v.latitud !== null && v.longitud !== null) setCenter({ lat: v.latitud, lng: v.longitud }) }).catch(() => undefined)
  }, [mode, keys])
  if (!keys || !entry?.domicilio?.enabled) return null
  if (entry.contexto?.mesa) return <p className="sm-chat-aviso-hasta">Estás pidiendo desde una mesa. Para domicilio, abre el menú desde el enlace del restaurante.</p>

  async function check(p: Point, direccion: string) {
    if (!keys) return
    setBusy(true); setError('')
    try {
      // Con el GPS no hay texto: se busca la dirección aproximada para confirmársela al cliente.
      const [result, text] = await Promise.all([quoteDelivery(keys.rest, p.lat, p.lng), direccion ? Promise.resolve(direccion) : reverseAddress(keys.rest, p.lat, p.lng).catch(() => '')])
      // La atiende otra sede: sin platos se pasa de una (con la ubicación puesta); con platos, se le ofrece ir.
      if (result.cobertura && result.sede.slug !== venues.venue && !venues.hasItems) {
        venues.go(result.sede.slug, result.sede.nombre, { lat: p.lat, lng: p.lng, direccion: text ?? '' })
        return
      }
      setCoverage(result); setConfirmed(text ?? ''); setChecked(p); setMode('done')
      if (result.cobertura && result.sede.slug === venues.venue) useDinerStore.setState({ deliveryDraft: { lat: p.lat, lng: p.lng, direccion: text ?? '' } })
    } catch (e) { setError(e instanceof Error ? e.message : 'No pudimos revisar la cobertura.') }
    finally { setBusy(false) }
  }
  function share() {
    if (!navigator.geolocation) { setError('Tu navegador no comparte la ubicación. Márcala en el mapa.'); setMode('map'); return }
    setBusy(true); setError('')
    navigator.geolocation.getCurrentPosition(
      (p) => void check({ lat: p.coords.latitude, lng: p.coords.longitude }, ''),
      () => { setBusy(false); setError('No pudimos obtener tu ubicación. Revisa el permiso o márcala en el mapa.'); setMode('map') },
      { enableHighAccuracy: true, timeout: 10_000 })
  }
  const items = myCount(cart)
  const moved = (p: Point) => {
    // El mapa repite el punto al terminar de moverse: si no cambió, no se pierde la cotización.
    if (point && Math.abs(point.lat - p.lat) < 1e-7 && Math.abs(point.lng - p.lng) < 1e-7) return
    const target = flying.current
    if (target && Math.abs(target.lat - p.lat) < 1e-4 && Math.abs(target.lng - p.lng) < 1e-4) flying.current = null
    else if (!target) typed.current = false
    setPoint(p)
  }
  function pickFound(found: FoundAddress) {
    typed.current = true
    setAddress(found.texto)
    flying.current = { lat: found.lat, lng: found.lng }
    setPoint(flying.current)
  }
  // Las categorías con platos, para seguir con el pedido de un toque.
  const categories = (entry.carta?.categorias ?? []).filter((c) => c.productos?.length).map((c) => c.nombre).slice(0, 4)
  return (
    <div className="sm-chat-delivery">
      {mode === 'choose' && <div className="sm-chat-choices" aria-label="¿A dónde lo llevamos?">
        <button type="button" disabled={busy} onClick={share}>{busy ? 'Buscando tu ubicación…' : '📍 Compartir mi ubicación'}</button>
        <button type="button" disabled={busy} onClick={() => setMode('map')}>Es para otra persona</button>
      </div>}
      {mode === 'map' && <div className="sm-delivery">
        <AddressSearch rest={keys.rest} value={address} enabled={!!entry.domicilio.buscador} onPick={pickFound}
          onType={(text) => { typed.current = true; setAddress(text) }} />
        <LocationPicker area={zoneOf(entry)} center={center} value={point} onChange={moved} label="Mapa para marcar la entrega" />
        <p className="sm-map-address" role="status"><Icon name="pin" /><span>{pin.loading ? 'Buscando la dirección…' : pin.address || 'Mueve el mapa hasta la puerta de la entrega.'}</span></p>
        <button type="button" className="sm-primary" disabled={busy || !point} onClick={() => point && void check(point, address.trim())}>{busy ? 'Revisando…' : 'Usar esta ubicación'}</button>
      </div>}
      {mode === 'done' && coverage?.cobertura && coverage.sede.slug !== venues.venue && <div className="sm-delivery-quote" role="status">
        <p>Esa dirección la atiende la sede <strong>{coverage.sede.nombre}</strong>. Te llevamos allá con tu pedido; revisamos que todo esté disponible en esa sede.</p>
        <button type="button" className="sm-chat-help" onClick={() => checked && venues.go(coverage.sede.slug, coverage.sede.nombre, { lat: checked.lat, lng: checked.lng, direccion: confirmed })}>Ir a la sede {coverage.sede.nombre} con mi pedido →</button>
      </div>}
      {mode === 'done' && coverage && (coverage.cobertura ? coverage.sede.slug === venues.venue && <div className="sm-delivery-quote" role="status">
        <p>✓ Te lo llevamos a <strong>{confirmed || 'la ubicación que marcaste'}</strong></p>
        <p>Te lo lleva {coverage.sede.nombre} · {coverage.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km · Envío <strong>{formatCop(coverage.envio)}</strong>{coverage.minimo ? ` · Pedido mínimo ${formatCop(coverage.minimo)}` : ''}</p>
        {items > 0 ? <>
          <p>¡Listo! Ya tienes platos en tu pedido. ¿Quieres agregar algo más o lo confirmamos?</p>
          <Link className="sm-chat-help" href={pedido} onClick={onLeave}>Ir a mi pedido →</Link>
        </> : <>
          <p><strong>¡Listo! Continuemos con tu pedido: ¿qué te gustaría ordenar?</strong></p>
          {onSend && categories.length > 0 && <div className="sm-chat-choices" aria-label="Categorías de la carta">{categories.map((c) => <button type="button" key={c} onClick={() => onSend(c)}>{c}</button>)}</div>}
          <button type="button" className="sm-text-button" onClick={onLeave}>Ver la carta completa</button>
        </>}
        <button type="button" className="sm-text-button" onClick={() => { setMode('choose'); setCoverage(null) }}>Cambiar la ubicación</button>
      </div> : <div className="sm-delivery-quote" role="status">
        <p>Esa ubicación queda fuera de nuestra zona de domicilios.</p>
        {coverage.recoger.length > 0 && <p>Puedes recogerlo en {coverage.recoger.map((r) => r.nombre).join(' o ')}.</p>}
        <button type="button" className="sm-text-button" onClick={() => { setMode('choose'); setCoverage(null) }}>Probar con otra ubicación</button>
      </div>)}
      {error && <p className="sm-error" role="alert">{error}</p>}
    </div>
  )
}
