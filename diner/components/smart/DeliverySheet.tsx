'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

import { Icon } from './SmartMenu'
import { formatCop } from '@/lib/domain/cart'
import { ApiError, getVenueLocation, savedAddresses, searchAddress, setDelivery } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { DeliveryMethod, DeliveryQuote, SavedAddress } from '@/lib/types'
import type { Point } from './LocationPicker'

// El mapa usa `window`: se carga solo en el navegador.
const LocationPicker = dynamic(() => import('./LocationPicker').then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="sm-map" aria-busy="true" /> })

export const METHOD_LABEL: Record<DeliveryMethod, string> = { online: 'Pagar ahora en línea', cash: 'Efectivo al recibir', card_on_delivery: 'Datáfono al recibir' }
const MEDELLIN: Point = { lat: 6.2442, lng: -75.5812 }
const phoneOk = (v: string) => /^(\+?57)?3\d{9}$/.test(v.replace(/[\s-]/g, ''))

// Plan D: «¿A dónde te lo llevamos?». La ubicación sale del GPS, de una dirección guardada, de la búsqueda o del pin
// en el mapa; el texto y las indicaciones son para el domiciliario. Sin autorización no se guarda nada en el perfil.
export function DeliverySheet({ onReady, disabled = false }: { onReady: (quote: DeliveryQuote | null, method: DeliveryMethod | null) => void; disabled?: boolean }) {
  const { keys, session, account, preview } = useDinerStore()
  const [center, setCenter] = useState<Point | null>(null)
  const [point, setPoint] = useState<Point | null>(null)
  const [address, setAddress] = useState(''), [details, setDetails] = useState('')
  const [name, setName] = useState(account?.nombre ?? ''), [phone, setPhone] = useState(account?.celular ?? '')
  const [save, setSave] = useState(false), [consent, setConsent] = useState(false), [label, setLabel] = useState('Casa')
  const [saved, setSaved] = useState<SavedAddress[]>([]), [addressId, setAddressId] = useState<number | undefined>()
  const [query, setQuery] = useState(''), [results, setResults] = useState<{ texto: string; lat: number; lng: number }[]>([])
  const [searchable, setSearchable] = useState(true)
  const [quote, setQuote] = useState<DeliveryQuote | null>(null), [method, setMethod] = useState<DeliveryMethod | null>(null)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!keys) return
    let alive = true
    getVenueLocation(keys.rest, keys.venue).then((v) => { if (alive) setCenter(v.latitud !== null && v.longitud !== null ? { lat: v.latitud, lng: v.longitud } : MEDELLIN) }).catch(() => { if (alive) setCenter(MEDELLIN) })
    if (account) savedAddresses(keys.rest).then((list) => { if (alive) setSaved(list) }).catch(() => undefined)
    return () => { alive = false }
  }, [keys, account])
  useEffect(() => { onReady(quote, method) }, [quote, method, onReady])

  const moved = (p: Point) => { setPoint(p); setQuote(null); setAddressId(undefined) }
  function locate() {
    if (!navigator.geolocation) { setError('Tu navegador no comparte la ubicación. Ubícala en el mapa.'); return }
    setLocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); moved({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { setLocating(false); setError('No pudimos obtener tu ubicación. Revisa el permiso o ubícala en el mapa.') },
      { enableHighAccuracy: true, timeout: 10_000 })
  }
  async function search() {
    if (!keys || query.trim().length < 4) return
    setBusy(true); setError('')
    try { const found = await searchAddress(keys.rest, query.trim()); setResults(found); if (!found.length) setError('No encontramos esa dirección. Prueba con el barrio o ubícala en el mapa.') }
    catch (e) { if (e instanceof ApiError && e.status === 503) setSearchable(false); else setError(e instanceof Error ? e.message : 'No pudimos buscar la dirección.') }
    finally { setBusy(false) }
  }
  function useSaved(a: SavedAddress) { setPoint({ lat: a.lat, lng: a.lng }); setAddress(a.direccion); setDetails(a.indicaciones); setAddressId(a.id); setQuote(null) }
  const ready = !!point && address.trim().length >= 3 && name.trim().length >= 2 && phoneOk(phone) && (!save || consent)
  async function calculate() {
    if (!session || !point || !ready) return
    setBusy(true); setError('')
    try {
      const r = await setDelivery(session.id, { lat: point.lat, lng: point.lng, direccion: address.trim(), indicaciones: details.trim(), telefono: phone.trim(), nombre: name.trim(),
        etiqueta: save ? label.trim() || 'Casa' : undefined, direccion_id: addressId, guardar: save, acepta_datos: consent })
      useDinerStore.setState({ cart: r.carrito })
      setQuote(r.domicilio)
      setMethod(r.domicilio.metodos.length === 1 ? r.domicilio.metodos[0] : null)
    } catch (e) { setQuote(null); setError(e instanceof Error ? e.message : 'No pudimos calcular el domicilio.') }
    finally { setBusy(false) }
  }
  const off = disabled || busy || !!preview
  return (
    <section className="sm-delivery" aria-label="Datos del domicilio">
      <h3>¿A dónde te lo llevamos?</h3>
      <div className="sm-delivery-actions">
        <button type="button" className="sm-secondary" disabled={off || locating} onClick={locate}><Icon name="pin" />{locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación actual'}</button>
      </div>
      {saved.length > 0 && <div className="sm-chat-choices" aria-label="Tus direcciones">{saved.map((a) => (
        <button type="button" key={a.id} aria-pressed={addressId === a.id} disabled={off} onClick={() => useSaved(a)}>{a.etiqueta || 'Dirección'} · {a.direccion}</button>))}</div>}
      {searchable && <form className="sm-delivery-search" onSubmit={(e) => { e.preventDefault(); void search() }}>
        <label className="sm-field"><span>O busca la dirección</span><input value={query} disabled={off} onChange={(e) => setQuery(e.target.value)} placeholder="Ej.: Calle 10 # 43-12, El Poblado" maxLength={160} /></label>
        <button type="submit" className="sm-secondary" disabled={off || query.trim().length < 4}>Buscar</button>
      </form>}
      {results.length > 0 && <ul className="sm-delivery-results" aria-label="Direcciones encontradas">{results.map((r, i) => (
        <li key={i}><button type="button" disabled={off} onClick={() => { moved({ lat: r.lat, lng: r.lng }); setAddress(r.texto); setResults([]) }}>{r.texto}</button></li>))}</ul>}
      {center && <LocationPicker center={center} value={point} onChange={moved} />}
      <p className="sm-note">{point ? 'Mueve el pin si hace falta: es el punto exacto de la entrega.' : 'Toca el mapa para marcar el punto de entrega.'}</p>
      <label className="sm-field"><span>Dirección</span><input value={address} disabled={off} onChange={(e) => { setAddress(e.target.value); setQuote(null) }} maxLength={200} placeholder="Calle, número y barrio" /></label>
      <label className="sm-field"><span>Indicaciones (opcional)</span><input value={details} disabled={off} onChange={(e) => { setDetails(e.target.value); setQuote(null) }} maxLength={200} placeholder="Torre, apartamento, portería…" /></label>
      <div className="sm-delivery-pair">
        <label className="sm-field"><span>¿A nombre de quién?</span><input value={name} disabled={off} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" /></label>
        <label className="sm-field"><span>Celular</span><input value={phone} disabled={off} onChange={(e) => { setPhone(e.target.value); setQuote(null) }} inputMode="tel" autoComplete="tel" placeholder="300 123 4567" /></label>
      </div>
      <label className="sm-check"><input type="checkbox" checked={save} disabled={off} onChange={(e) => setSave(e.target.checked)} /><span>Guardar esta dirección para la próxima</span></label>
      {save && <>
        <label className="sm-field"><span>Nombre de la dirección</span><input value={label} disabled={off} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="Casa, Oficina…" /></label>
        <label className="sm-check"><input type="checkbox" checked={consent} disabled={off} onChange={(e) => setConsent(e.target.checked)} /><span>Autorizo al restaurante a guardar mis datos (nombre, celular y direcciones) para atender mis pedidos, según la Ley 1581 de 2012. Puedo retirar la autorización cuando quiera.</span></label>
      </>}
      {phone && !phoneOk(phone) && <p className="sm-error" role="alert">Escribe un celular colombiano de 10 dígitos.</p>}
      <button type="button" className="sm-primary" disabled={off || !ready} onClick={() => void calculate()}>{busy ? 'Calculando…' : quote ? 'Recalcular envío' : 'Calcular envío'}</button>
      {error && <p className="sm-error" role="alert">{error}</p>}
      {quote && <div className="sm-delivery-quote" role="status">
        <p><strong>Te lo lleva {quote.sede.nombre}</strong> · {quote.distancia_km.toLocaleString('es-CO', { maximumFractionDigits: 1 })} km</p>
        <p>Envío: <strong>{formatCop(quote.envio)}</strong>{quote.minimo ? ` · Pedido mínimo ${formatCop(quote.minimo)}` : ''}</p>
        {quote.nota && <p className="sm-note">{quote.nota}</p>}
        {quote.sugerida && <p className="sm-note">La sede {quote.sugerida.nombre} te queda más cerca. Puedes pedir desde su menú para un envío más rápido.</p>}
        <fieldset className="sm-delivery-methods"><legend>¿Cómo quieres pagar?</legend>
          {quote.metodos.map((m) => <label key={m} className="sm-check"><input type="radio" name="metodo" checked={method === m} disabled={disabled} onChange={() => setMethod(m)} /><span>{METHOD_LABEL[m]}</span></label>)}
        </fieldset>
      </div>}
    </section>
  )
}
