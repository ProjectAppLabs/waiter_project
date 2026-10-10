'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

import { Icon } from './SmartMenu'
import { formatCop } from '@/lib/domain/cart'
import { getVenueLocation, savedAddresses, setDelivery } from '@/lib/services/api'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { DeliveryMethod, DeliveryQuote, SavedAddress } from '@/lib/types'
import type { Point } from './LocationPicker'
import { usePinAddress } from './usePinAddress'
import { AddressAutocomplete, type PickedAddress } from './AddressAutocomplete'

// El mapa usa `window`: se carga solo en el navegador.
const LocationPicker = dynamic(() => import('./LocationPicker').then((m) => m.LocationPicker), { ssr: false, loading: () => <div className="sm-map" aria-busy="true" /> })

export const METHOD_LABEL: Record<DeliveryMethod, string> = { online: 'Pagar ahora en línea', cash: 'Efectivo al recibir', card_on_delivery: 'Datáfono al recibir' }
const MEDELLIN: Point = { lat: 6.2442, lng: -75.5812 }
const phoneOk = (v: string) => /^(\+?57)?3\d{9}$/.test(v.replace(/[\s-]/g, ''))

// Plan D: «¿A dónde te lo llevamos?». La ubicación sale del GPS, de una dirección guardada, de la búsqueda o del pin
// en el mapa; el texto y las indicaciones son para el domiciliario. Sin autorización no se guarda nada en el perfil.
export function DeliverySheet({ onReady, disabled = false }: { onReady: (quote: DeliveryQuote | null, method: DeliveryMethod | null) => void; disabled?: boolean }) {
  const { keys, session, account, preview, entry, deliveryDraft } = useDinerStore()
  const [center, setCenter] = useState<Point | null>(null)
  // Si ya compartió la ubicación en el chat, el pin y la dirección arrancan ahí.
  const [point, setPoint] = useState<Point | null>(deliveryDraft ? { lat: deliveryDraft.lat, lng: deliveryDraft.lng } : null)
  const [address, setAddress] = useState(deliveryDraft?.direccion ?? ''), [details, setDetails] = useState('')
  const [name, setName] = useState(account?.nombre ?? ''), [phone, setPhone] = useState(account?.celular ?? '')
  const [save, setSave] = useState(false), [consent, setConsent] = useState(false), [label, setLabel] = useState('Casa')
  const [saved, setSaved] = useState<SavedAddress[]>([]), [addressId, setAddressId] = useState<number | undefined>()
  const searchable = entry?.domicilio?.buscador ?? false
  // La dirección va en las dos direcciones: el pin llena el texto, y lo escrito mueve el mapa. Mientras el cliente
  // tenga su propio texto, el pin no se lo cambia; si vuelve a mover el mapa a mano, manda el pin.
  const typed = useRef(!!deliveryDraft?.direccion), flying = useRef<Point | null>(null)
  const pin = usePinAddress(keys?.rest, point)
  useEffect(() => { if (pin.address && !typed.current) setAddress(pin.address) }, [pin.address])
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

  const moved = (p: Point) => {
    // El mapa repite el punto al terminar de moverse: si no cambió, no se pierde la cotización.
    if (point && Math.abs(point.lat - p.lat) < 1e-7 && Math.abs(point.lng - p.lng) < 1e-7) return
    const target = flying.current
    if (target && Math.abs(target.lat - p.lat) < 1e-4 && Math.abs(target.lng - p.lng) < 1e-4) flying.current = null
    else if (!target) typed.current = false
    setPoint(p); setQuote(null); setAddressId(undefined)
  }
  const goTo = (p: Point) => { flying.current = p; setPoint(p); setQuote(null); setAddressId(undefined) }
  function locate() {
    if (!navigator.geolocation) { setError('Tu navegador no comparte la ubicación. Ubícala en el mapa.'); return }
    setLocating(true); setError('')
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); typed.current = false; goTo({ lat: p.coords.latitude, lng: p.coords.longitude }) },
      () => { setLocating(false); setError('No pudimos obtener tu ubicación. Revisa el permiso o ubícala en el mapa.') },
      { enableHighAccuracy: true, timeout: 10_000 })
  }
  // Escoger una sugerencia lleva el mapa hasta allá; el cliente ajusta moviendo el mapa.
  const [placeId, setPlaceId] = useState('')
  function pickSuggestion(found: PickedAddress) {
    typed.current = true
    setPlaceId(found.place_id ?? '')
    setAddress([found.titulo, found.detalle].filter(Boolean).join(', '))
    goTo({ lat: found.lat, lng: found.lng })
  }
  function pickSaved(a: SavedAddress) { typed.current = true; goTo({ lat: a.lat, lng: a.lng }); setAddress(a.direccion); setDetails(a.indicaciones); setAddressId(a.id) }
  const ready = !!point && address.trim().length >= 3 && name.trim().length >= 2 && phoneOk(phone) && (!save || consent)
  async function calculate() {
    if (!session || !point || !ready) return
    setBusy(true); setError('')
    try {
      const r = await setDelivery(session.id, { lat: point.lat, lng: point.lng, direccion: address.trim(), indicaciones: details.trim(), telefono: phone.trim(), nombre: name.trim(),
        etiqueta: save ? label.trim() || 'Casa' : undefined, direccion_id: addressId, guardar: save, acepta_datos: consent, ...(placeId ? { place_id: placeId } : {}) })
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
        <button type="button" key={a.id} aria-pressed={addressId === a.id} disabled={off} onClick={() => pickSaved(a)}>{a.etiqueta || 'Dirección'} · {a.direccion}</button>))}</div>}
      <AddressAutocomplete rest={keys?.rest} value={address} enabled={searchable} disabled={off} onPick={pickSuggestion}
        placeholder={searchable ? 'Escribe la dirección o mueve el mapa' : 'Calle, número y barrio'}
        onType={(text) => { typed.current = true; setAddress(text); setQuote(null) }} />
      {center && <LocationPicker center={center} value={point} onChange={moved} />}
      <p className="sm-map-address" role="status"><Icon name="pin" /><span>{pin.loading ? 'Buscando la dirección…' : pin.address || 'Mueve el mapa hasta la puerta de la entrega.'}</span></p>
      <label className="sm-field"><span>Indicaciones (opcional)</span><input value={details} disabled={off} onChange={(e) => { setDetails(e.target.value); setQuote(null) }} maxLength={200} placeholder="Torre, apartamento, portería…" /></label>
      <div className="sm-delivery-pair">
        <label className="sm-field"><span>¿A nombre de quién?</span><input value={name} disabled={off} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" /></label>
        <label className="sm-field"><span>Celular</span><input value={phone} disabled={off} onChange={(e) => { setPhone(e.target.value); setQuote(null) }} inputMode="tel" autoComplete="tel" placeholder="300 123 4567" /></label>
      </div>
      <label className="sm-check"><input type="checkbox" checked={save} disabled={off} onChange={(e) => setSave(e.target.checked)} /><span>Guardar esta dirección para la próxima</span></label>
      {save && <>
        <label className="sm-field"><span>Nombre de la dirección</span><input value={label} disabled={off} onChange={(e) => setLabel(e.target.value)} maxLength={30} placeholder="Casa, Oficina…" /></label>
        <label className="sm-check"><input type="checkbox" checked={consent} disabled={off} onChange={(e) => setConsent(e.target.checked)} /><span>Autorizo al restaurante a guardar mis datos (nombre, celular y direcciones) para atender mis pedidos, según la <a href={keys ? `/${encodeURIComponent(keys.rest)}/privacidad` : '#'} target="_blank" rel="noreferrer">política de datos</a> (Ley 1581 de 2012). Puedo retirar la autorización cuando quiera.</span></label>
      </>}
      {phone && !phoneOk(phone) && <p className="sm-error" role="alert">Escribe un celular colombiano de 10 dígitos.</p>}
      <button type="button" className="sm-primary" disabled={off || !ready} onClick={() => void calculate()}>{busy ? 'Calculando…' : quote ? 'Recalcular envío' : 'Calcular envío'}</button>
      {error && <p className="sm-error" role="alert">{error}</p>}
      {quote && <div className="sm-delivery-quote" role="status">
        <p>✓ Te lo llevamos a <strong>{quote.direccion}</strong>{quote.indicaciones ? ` (${quote.indicaciones})` : ''}</p>
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
