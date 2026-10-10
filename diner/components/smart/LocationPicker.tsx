'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

import { flavorOverrides, HIDDEN_POIS, MAP_VARIANTS, mapPalette, type MapPalette, type MapVariant } from '@/lib/domain/mapTheme'

export interface Point { lat: number; lng: number }
const same = (a: Point, b: Point) => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6
// El mapa vectorial (Protomaps) que sirve el comensal; en producción, el recorte de Colombia.
const TILES = process.env.NEXT_PUBLIC_MAP_TILES || '/mapas/medellin.pmtiles'
const ASSETS = 'https://protomaps.github.io/basemaps-assets'
let protocolReady = false

// Los colores de la plantilla y la variante del sistema de diseño, leídos del lugar donde se dibuja el mapa.
function themeOf(element: HTMLElement): { variant: MapVariant; palette: MapPalette } {
  const css = getComputedStyle(element)
  const token = (name: string) => css.getPropertyValue(name).trim()
  const raw = element.closest('[data-ds-mapa]')?.getAttribute('data-ds-mapa') ?? 'marca'
  const variant = (MAP_VARIANTS as readonly string[]).includes(raw) ? raw as MapVariant : 'marca'
  return { variant, palette: mapPalette(variant, { fondo: token('--t-fondo'), superficie: token('--t-superficie'), tinta: token('--t-tinta'), acento: token('--t-acento') }) }
}

// Plan D: el mapa para ubicar la entrega, como en las apps de transporte. El pin queda fijo en el centro y lo que se
// mueve es el mapa: mientras se arrastra, el pin se levanta; al soltar, cae con un rebote y el centro es el punto de
// entrega. Mapa vectorial propio (MapLibre + Protomaps, datos de OpenStreetMap) con los colores de la marca, sin
// restaurantes de la competencia y con etiquetas legibles. Si el punto cambia desde afuera (GPS o una dirección
// escogida), el mapa vuela hasta él.
export function LocationPicker({ center, value, onChange, label = 'Mapa para ubicar la entrega' }: { center: Point; value: Point | null; onChange: (p: Point) => void; label?: string }) {
  const wrap = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const change = useRef(onChange)
  const [lifting, setLifting] = useState(false)
  const [drops, setDrops] = useState(0)
  const [failed, setFailed] = useState(false)
  const [palette, setPalette] = useState<{ variant: MapVariant; palette: MapPalette } | null>(null)
  // El punto más reciente: el mapa carga después y debe arrancar donde el GPS o la búsqueda ya dejaron el pin.
  const latest = useRef(value)
  useEffect(() => { change.current = onChange; latest.current = value }, [onChange, value])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        if (!wrap.current || !box.current) return
        const [maplibregl, { Protocol }, { layers, namedFlavor }] = await Promise.all([import('maplibre-gl'), import('pmtiles'), import('@protomaps/basemaps')])
        if (!alive || !wrap.current || !box.current || map.current) return
        if (!protocolReady) {
          // El trabajador lo copia scripts/mapas/copiar-trabajador.cjs al instalar (Next no lo publica solo).
          maplibregl.setWorkerUrl('/mapas/maplibre-gl-worker.mjs')
          maplibregl.addProtocol('pmtiles', new Protocol().tile)
          protocolReady = true
        }
        const theme = themeOf(wrap.current)
        setPalette(theme)
        const flavor = { ...namedFlavor(theme.palette.base), ...flavorOverrides(theme.palette) }
        const style = layers('protomaps', flavor as ReturnType<typeof namedFlavor>, { lang: 'es' }).map((layer) => (layer.id === 'pois' && 'filter' in layer && layer.filter
          ? { ...layer, filter: ['all', layer.filter, ['!', ['in', ['get', 'kind'], ['literal', HIDDEN_POIS]]]] } : layer))
        const start = latest.current ?? center
        const url = TILES.startsWith('http') ? TILES : `${window.location.origin}${TILES}`
        const m = new maplibregl.Map({
          container: box.current, center: [start.lng, start.lat], zoom: latest.current ? 17 : 16, maxZoom: 19, attributionControl: { compact: true },
          style: { version: 8, glyphs: `${ASSETS}/fonts/{fontstack}/{range}.pbf`, sprite: `${ASSETS}/sprites/v4/${theme.palette.base === 'dark' ? 'dark' : 'light'}`,
            sources: { protomaps: { type: 'vector', url: `pmtiles://${url}`, attribution: '© OpenStreetMap' } }, layers: style as never },
        })
        m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
        m.on('movestart', () => setLifting(true))
        m.on('moveend', () => {
          setLifting(false)
          setDrops((n) => n + 1)
          const c = m.getCenter()
          change.current({ lat: c.lat, lng: c.lng })
        })
        // Tocar un punto lleva el mapa hasta allá: el pin del centro queda encima.
        m.on('click', (e: MapMouseEvent) => m.easeTo({ center: e.lngLat }))
        m.on('error', () => undefined)
        // Cuántas calles, edificios y etiquetas quedaron dibujados: el verificador exige que el mapa no esté vacío.
        m.on('idle', () => { wrap.current?.setAttribute('data-mapa-dibujado', String(m.queryRenderedFeatures().length)) })
        map.current = m
        // Sin punto previo, el centro de partida ya es un punto de entrega: se anuncia para mostrar su dirección.
        if (!latest.current) change.current({ lat: start.lat, lng: start.lng })
      } catch {
        // Sin WebGL (o sin red para el mapa) el cliente sigue con su dirección escrita o su ubicación.
        if (alive) setFailed(true)
      }
    })()
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
    const target = { center: [value.lng, value.lat] as [number, number], zoom: Math.max(m.getZoom(), 17) }
    if (reduce) m.jumpTo(target)
    else m.flyTo({ ...target, duration: 800 })
  }, [value])

  const p = palette?.palette
  return (
    // La paleta queda en atributos para que el verificador de diseño mida su contraste (el mapa es un lienzo WebGL).
    <div ref={wrap} className="sm-map-wrap" data-mapa-estilo={palette?.variant} data-mapa-terreno={p?.earth} data-mapa-etiqueta={p?.label}
      data-mapa-pin={p?.pin} data-mapa-fondos={p ? [p.earth, p.park, p.water, p.buildings, p.minor, p.major].join(' ') : undefined}
      style={p ? { ['--sm-map-pin' as string]: p.pin, ['--sm-map-pin-ring' as string]: p.pinRing } : undefined}>
      <div ref={box} className="sm-map" role="application" aria-label={label} />
      {failed && <p className="sm-map-fallback" role="status">No pudimos mostrar el mapa. Escribe la dirección o usa tu ubicación.</p>}
      <span aria-hidden="true" className={`sm-map-pin${lifting ? ' is-lifting' : ''}`} key={drops}><span /></span>
      <span aria-hidden="true" className={`sm-map-pin-shadow${lifting ? ' is-lifting' : ''}`} />
    </div>
  )
}
