'use client'

import { useEffect, useRef } from 'react'
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface Point { lat: number; lng: number }

// Plan D: el mapa para ubicar la entrega. Teselas de OpenStreetMap (gratis, sin clave). El pin se arrastra o se mueve
// tocando el mapa; las coordenadas son lo que usa el domiciliario.
export function LocationPicker({ center, value, onChange, label = 'Mapa para ubicar la entrega' }: { center: Point; value: Point | null; onChange: (p: Point) => void; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const pin = useRef<Marker | null>(null)
  const change = useRef(onChange)
  useEffect(() => { change.current = onChange }, [onChange])

  useEffect(() => {
    let alive = true
    // Leaflet usa `window`: se carga solo en el navegador.
    void import('leaflet').then((L) => {
      if (!alive || !box.current || map.current) return
      const start = value ?? center
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 17 : 15)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m)
      const icon = L.divIcon({ className: 'sm-map-pin', html: '<span></span>', iconSize: [32, 40], iconAnchor: [16, 40] })
      const marker = L.marker([start.lat, start.lng], { draggable: true, icon, keyboard: true, title: 'Lugar de entrega' }).addTo(m)
      marker.on('dragend', () => { const p = marker.getLatLng(); change.current({ lat: p.lat, lng: p.lng }) })
      m.on('click', (e: LeafletMouseEvent) => { marker.setLatLng(e.latlng); change.current({ lat: e.latlng.lat, lng: e.latlng.lng }) })
      map.current = m
      pin.current = marker
    })
    return () => { alive = false; map.current?.remove(); map.current = null; pin.current = null }
    // El mapa se crea una vez; los cambios de valor se aplican abajo sin rehacerlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!value || !map.current || !pin.current) return
    const current = pin.current.getLatLng()
    if (Math.abs(current.lat - value.lat) < 1e-7 && Math.abs(current.lng - value.lng) < 1e-7) return
    pin.current.setLatLng([value.lat, value.lng])
    map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 17))
  }, [value])

  return <div ref={box} className="sm-map" role="application" aria-label={label} />
}
