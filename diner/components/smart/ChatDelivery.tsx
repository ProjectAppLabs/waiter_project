'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { formatCop } from '@/lib/domain/cart'
import { myCount } from '@/lib/domain/cartEvents'
import { getVenueLocation, quoteDelivery, type Coverage } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { Point } from './LocationPicker'

const LocationPicker = dynamic(() => import('./LocationPicker').then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="sm-map" aria-busy="true" /> })
const MEDELLIN: Point = { lat: 6.2442, lng: -75.5812 }

// Plan D: cuando el comensal habla de domicilio, el mesero le pide la ubicación ahí mismo en el chat: la suya (GPS) o,
// si es para otra persona, un punto en el mapa. Le dice qué sede se lo lleva y cuánto vale el envío, y deja la ubicación
// lista para cuando confirme el pedido.
export function ChatDelivery({ pedido, onLeave }: { pedido: string; onLeave: () => void }) {
  const { keys, entry, cart } = useDinerStore()
  const [mode, setMode] = useState<'choose' | 'map' | 'done'>('choose')
  const [point, setPoint] = useState<Point | null>(null), [center, setCenter] = useState<Point>(MEDELLIN)
  const [address, setAddress] = useState('')
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
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
      const result = await quoteDelivery(keys.rest, p.lat, p.lng)
      setCoverage(result); setMode('done')
      if (result.cobertura) useDinerStore.setState({ deliveryDraft: { lat: p.lat, lng: p.lng, direccion } })
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
  return (
    <div className="sm-chat-delivery">
      {mode === 'choose' && <div className="sm-chat-choices" aria-label="¿A dónde lo llevamos?">
        <button type="button" disabled={busy} onClick={share}>{busy ? 'Buscando tu ubicación…' : '📍 Compartir mi ubicación'}</button>
        <button type="button" disabled={busy} onClick={() => setMode('map')}>Es para otra persona</button>
      </div>}
      {mode === 'map' && <div className="sm-delivery">
        <LocationPicker center={center} value={point} onChange={setPoint} label="Mapa para marcar la entrega" />
        <p className="sm-note">Toca el mapa o arrastra el pin hasta la puerta de la entrega.</p>
        <label className="sm-field"><span>Dirección</span><input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Calle, número y barrio" /></label>
        <button type="button" className="sm-primary" disabled={busy || !point} onClick={() => point && void check(point, address.trim())}>{busy ? 'Revisando…' : 'Usar esta ubicación'}</button>
      </div>}
      {mode === 'done' && coverage && (coverage.cobertura ? <div className="sm-delivery-quote" role="status">
        <p><strong>¡Sí llegamos!</strong> Te lo lleva {coverage.sede.nombre} · {coverage.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km</p>
        <p>Envío: <strong>{formatCop(coverage.envio)}</strong>{coverage.minimo ? ` · Pedido mínimo ${formatCop(coverage.minimo)}` : ''}</p>
        <p className="sm-note">Guardé la ubicación: al confirmar tu pedido escoges «A domicilio» y ya estará marcada.</p>
        {items > 0
          ? <Link className="sm-chat-help" href={pedido} onClick={onLeave}>Ir a mi pedido →</Link>
          : <button type="button" className="sm-chat-help" onClick={onLeave}>Elegir mis platos →</button>}
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
