'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface Point { lat: number; lng: number }
const same = (a: Point, b: Point) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6

// Plan D: el mapa para ubicar la entrega, como en las apps de transporte. El pin queda fijo en el centro y lo que se
// mueve es el mapa: mientras se arrastra, el pin se levanta; al soltar, cae con un rebote y el centro es el punto de
// entrega. Teselas de OpenStreetMap (gratis, sin clave). Si el punto cambia desde afuera (GPS o una dirección
// escrita), el mapa vuela hasta él.
export function LocationPicker({ center, value, onChange, label = 'Mapa para ubicar la entrega' }: { center: Point; value: Point | null; onChange: (p: Point) => void; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const change = useRef(onChange)
  const [lifting, setLifting] = useState(false)
  const [drops, setDrops] = useState(0)
  // El punto más reciente: Leaflet carga después y debe arrancar donde el GPS o la búsqueda ya dejaron el pin.
  const latest = useRef(value)
  useEffect(() => { change.current = onChange; latest.current = value }, [onChange, value])

  useEffect(() => {
    let alive = true
    // Leaflet usa `window`: se carga solo en el navegador.
    void import('leaflet').then((L) => {
      if (!alive || !box.current || map.current) return
      const start = latest.current ?? center
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], latest.current ? 17 : 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
      m.on('movestart', () => setLifting(true))
      m.on('moveend', () => {
        setLifting(false)
        setDrops((n) => n + 1)
        const c = m.getCenter()
        change.current({ lat: c.lat, lng: c.lng })
      })
      // Tocar un punto lleva el mapa hasta allá: el pin del centro queda encima.
      m.on('click', (e) => m.panTo(e.latlng))
      map.current = m
      // Sin punto previo, el centro de partida ya es un punto de entrega: se anuncia para mostrar su dirección.
      if (!latest.current) change.current({ lat: start.lat, lng: start.lng })
    })
    return () => { alive = false; map.current?.remove(); map.current = null }
    // El mapa se crea una vez; los cambios de valor se aplican abajo sin rehacerlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current
    if (!value || !m) return
    const c = m.getCenter()
    if (same({ lat: c.lat, lng: c.lng }, value)) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) m.setView([value.lat, value.lng], Math.max(m.getZoom(), 17))
    else m.flyTo([value.lat, value.lng], Math.max(m.getZoom(), 17), { duration: .8 })
  }, [value])

  return (
    <div className="sm-map-wrap">
      <div ref={box} className="sm-map" role="application" aria-label={label} />
      <span aria-hidden="true" className={`sm-map-pin${lifting ? ' is-lifting' : ''}`} key={drops}><span /></span>
      <span aria-hidden="true" className={`sm-map-pin-shadow${lifting ? ' is-lifting' : ''}`} />
    </div>
  )
}
