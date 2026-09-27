'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { TextInput } from '@/components/ui/Field'
import { coordinatesFromMapsUrl, isGoogleMapsUrl, isShortMapsUrl, mapsUrlFor, placeIdFromMapsUrl, type Coordinates } from '@/lib/domain/mapsLink'

export type MapsStatus = 'empty' | 'resolving' | 'found' | 'invalid' | 'noPoint' | 'unreachable'

// Enlace de Google Maps del restaurante. Reemplaza los campos de latitud y longitud: quien administra pega el enlace
// que copia de Google Maps y aquí se sacan las coordenadas (los enlaces cortos los resuelve el servidor del POS).
// `onChange` entrega las coordenadas halladas (o null si el campo quedó vacío) y el estado, para que el formulario no
// guarde mientras se resuelve o si el enlace no sirve.
export function MapsLinkField({ initial, onChange }: { initial: Coordinates | null; onChange: (coordinates: Coordinates | null, status: MapsStatus) => void }) {
  const t = useTranslations('pos.settings.restaurant')
  const [link, setLink] = useState(initial ? mapsUrlFor(initial) : '')
  const [status, setStatus] = useState<MapsStatus>(initial ? 'found' : 'empty')
  const [found, setFound] = useState<Coordinates | null>(initial)
  // Nombre del lugar según Google Maps (solo cuando el servidor consultó su ficha): confirma que es el restaurante.
  const [place, setPlace] = useState<string | null>(null)
  const publish = useRef(onChange)
  useEffect(() => { publish.current = onChange })
  const request = useRef(0)

  function report(next: MapsStatus, coordinates: Coordinates | null, name: string | null = null) {
    setStatus(next); setFound(coordinates); setPlace(name); publish.current(coordinates, next)
  }

  async function read(value: string) {
    const ticket = ++request.current
    const text = value.trim()
    if (!text) { report('empty', null); return }
    if (!isGoogleMapsUrl(text)) { report('invalid', null); return }
    const direct = coordinatesFromMapsUrl(text)
    if (direct) { report('found', direct); return }
    if (!isShortMapsUrl(text) && !placeIdFromMapsUrl(text)) { report('noPoint', null); return }
    report('resolving', null)
    try {
      const response = await fetch(`/api/mapas/resolver?url=${encodeURIComponent(text)}`)
      const body = await response.json() as { lat?: number | null; lng?: number | null; name?: string | null }
      if (ticket !== request.current) return // llegó tarde: ya se pegó otro enlace
      if (!response.ok) { report('unreachable', null); return }
      if (typeof body.lat === 'number' && typeof body.lng === 'number') report('found', { lat: body.lat, lng: body.lng }, body.name ?? null)
      else report('noPoint', null)
    } catch {
      if (ticket === request.current) report('unreachable', null)
    }
  }

  const hint = status === 'found' && found
    ? <span className="flex flex-wrap items-center gap-x-2 text-free-ink"><Icon name="mapPin" size={16} />{place && <strong className="font-semibold">{place} ·</strong>}{t('mapsFound', { lat: found.lat.toFixed(5), lng: found.lng.toFixed(5) })}
        <a href={mapsUrlFor(found)} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">{t('mapsSee')}</a></span>
    : status === 'resolving' ? <span className="flex items-center gap-2 text-soft"><Icon name="loader" size={16} className="animate-spin" />{t('mapsResolving')}</span>
    : status === 'empty' ? t('mapsHelp')
    : <span role="alert" className="text-busy-ink">{t(status === 'invalid' ? 'mapsInvalid' : status === 'noPoint' ? 'mapsNoPoint' : 'mapsUnreachable')}</span>
  return (
    <TextInput label={t('mapsLink')} type="url" inputMode="url" placeholder={t('mapsPlaceholder')} value={link} hint={hint}
      onChange={(e) => { setLink(e.target.value); void read(e.target.value) }} />
  )
}
