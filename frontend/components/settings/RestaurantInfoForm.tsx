'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { MapsLinkField, type MapsStatus } from '@/components/settings/MapsLinkField'
import { SaveBar, useSaveState } from '@/components/settings/SettingsForms'
import { TextInput } from '@/components/ui/Field'
import type { Coordinates } from '@/lib/domain/mapsLink'
import { saveRestaurantInfo, type RestaurantInfo } from '@/lib/services/restaurantInfo'

// El servidor guarda la ubicación como número y rechaza el texto con 400; sin ubicación manda null. RestaurantInfo
// todavía declara latitud y longitud como texto, aunque el servidor las entrega y las recibe como números.
const located = (point: Coordinates | null) =>
  ({ latitude: point ? point.lat : null, longitude: point ? point.lng : null }) as unknown as Pick<RestaurantInfo, 'latitude' | 'longitude'>

// Plan O: el «Restaurante» de Configuración edita el local (nombre, dirección, teléfono, ubicación) y no la empresa: la
// razón social y el NIT son de la organización y se editan en su consola.
export function RestaurantInfoForm({ initial }: { initial: RestaurantInfo }) {
  const t = useTranslations('pos.settings.restaurant')
  const [r, setR] = useState(initial)
  const [state, save] = useSaveState()
  const [maps, setMaps] = useState<MapsStatus>('empty')
  const [start] = useState(() => { const lat = Number(initial.latitude), lng = Number(initial.longitude); return initial.latitude && initial.longitude && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null })
  const [point, setPoint] = useState<Coordinates | null>(start)
  const field = (key: 'name' | 'phone' | 'street' | 'city', label: string) => <TextInput key={key} label={label} value={r[key]} onChange={(e) => setR((v) => ({ ...v, [key]: e.target.value }))} />
  const mapsBlocks = maps === 'resolving' || maps === 'invalid' || maps === 'noPoint' || maps === 'unreachable'
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <p className="text-sm text-soft">Los datos de este local. La razón social, el NIT y los impuestos son de la organización y los edita el dueño en su consola.</p>
      <div className="grid grid-cols-2 gap-4">{field('name', t('name'))}{field('phone', t('phone'))}{field('street', t('street'))}{field('city', t('city'))}</div>
      <p className="text-sm text-soft">{t('addressHint')}</p>
      <MapsLinkField initial={start} onChange={(found, status) => { setMaps(status); if (status === 'found' || status === 'empty') setPoint(found) }} />
      <TextInput label="Margen de acceso al turno (minutos)" type="number" min={0} max={240} step={5} value={r.accessMargin}
        onChange={(e) => setR((v) => ({ ...v, accessMargin: Number(e.target.value) }))}
        hint="Meseros y cajeros de este local pueden entrar desde estos minutos antes de su turno y hasta estos minutos después. Encargado y dueño entran a cualquier hora." />
      <SaveBar state={state} onSave={() => save(() => saveRestaurantInfo({ ...r, ...located(point) }))} disabled={!r.name.trim() || mapsBlocks || !Number.isFinite(r.accessMargin) || r.accessMargin < 0} />
    </div>
  )
}
