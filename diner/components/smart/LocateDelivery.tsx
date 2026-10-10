'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import { getLocateLink, sendLocateLink } from '@/lib/services/api'
import type { Point } from './LocationPicker'
import './smart-tokens.css'
import './smart-checkout.css'
import './smart-forms.css'

const LocationPicker = dynamic(() => import('./LocationPicker').then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="sm-map" aria-busy="true" /> })
const MEDELLIN: Point = { lat: 6.2442, lng: -75.5812 }

// Plan D: una página sencilla, sin el menú: el pin, la dirección y las indicaciones. El enlace vence a los 30 minutos y
// sirve solo para la conversación de WhatsApp que lo pidió.
export function LocateDelivery({ token }: { token: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'sent'>(token ? 'loading' : 'invalid')
  const [name, setName] = useState('')
  const [center, setCenter] = useState<Point>(MEDELLIN)
  const [point, setPoint] = useState<Point | null>(null)
  const [address, setAddress] = useState(''), [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [covered, setCovered] = useState<boolean | null>(null)
  useEffect(() => {
    if (!token) return
    let alive = true
    getLocateLink(token).then((r) => {
      if (!alive) return
      setName(r.nombre ?? '')
      if (typeof r.lat === 'number' && typeof r.lng === 'number') setCenter({ lat: r.lat, lng: r.lng })
      setState('ready')
    }).catch(() => { if (alive) setState('invalid') })
    return () => { alive = false }
  }, [token])
  function locate() {
    navigator.geolocation?.getCurrentPosition((p) => setPoint({ lat: p.coords.latitude, lng: p.coords.longitude }), () => setError('No pudimos obtener tu ubicación. Marca el punto en el mapa.'), { enableHighAccuracy: true, timeout: 10_000 })
  }
  async function send() {
    if (!point) return
    setBusy(true); setError('')
    try { const r = await sendLocateLink(token, { lat: point.lat, lng: point.lng, direccion: address.trim(), indicaciones: details.trim() }); setCovered(r.cobertura ?? null); setState('sent') }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos enviar la ubicación.') }
    finally { setBusy(false) }
  }
  return (
    <main className="smart-menu sm-locate">
      <div className="sm-page">
        <h1>Ubica la entrega</h1>
        {name && <p className="sm-note">{name}</p>}
        {state === 'loading' && <p role="status">Cargando…</p>}
        {state === 'invalid' && <p role="alert" className="sm-error">Este enlace ya no sirve. Pídele uno nuevo al restaurante por WhatsApp.</p>}
        {state === 'sent' && <p role="status">¡Listo! {covered === false ? 'Esa dirección queda fuera de nuestra zona; te escribimos por WhatsApp con otras opciones.' : 'Ya puedes volver a WhatsApp: allá te confirmamos el envío.'}</p>}
        {state === 'ready' && <section className="sm-delivery" aria-label="Ubicación de la entrega">
          <button type="button" className="sm-secondary" onClick={locate}>Usar mi ubicación actual</button>
          <LocationPicker center={center} value={point} onChange={setPoint} />
          <p className="sm-note">Toca el mapa o arrastra el pin hasta la puerta de la entrega.</p>
          <label className="sm-field"><span>Dirección</span><input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="Calle, número y barrio" /></label>
          <label className="sm-field"><span>Indicaciones (opcional)</span><input value={details} onChange={(e) => setDetails(e.target.value)} maxLength={200} placeholder="Torre, apartamento, portería…" /></label>
          <button type="button" className="sm-primary" disabled={busy || !point || address.trim().length < 3} onClick={() => void send()}>{busy ? 'Enviando…' : 'Enviar ubicación'}</button>
          {error && <p className="sm-error" role="alert">{error}</p>}
        </section>}
      </div>
    </main>
  )
}
