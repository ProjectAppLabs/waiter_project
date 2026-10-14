'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Select } from '@/components/ui/Select'
import { parseFloorName, type FloorType } from '@/lib/domain/tablesKit'
import type { Floor } from '@/lib/types'
import { cn } from '@/lib/utils'

// Leyenda del kit: punto vacío (disponible), naranja (no disponible), tinta (reservada).
export function TableLegend() {
  const t = useTranslations('tables.legend')
  return (
    <ul className="flex items-center gap-4 text-[14px] text-soft" aria-label={t('available')}>
      <li className="flex items-center gap-1.5"><span aria-hidden className="w-2 h-2 rounded-full bg-primary" />{t('available')}</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="w-2 h-2 rounded-full bg-progress" />{t('unavailable')}</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="w-2 h-2 rounded-full bg-success" />{t('ready')}</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="w-2 h-2 rounded-full bg-reserved" />{t('reserved')}</li>
    </ul>
  )
}

// Un control de ancho acotado para cualquier cantidad de pisos. El menú nativo permite
// desplazarse, escribir el nombre y elegir con teclado sin crear otra barra de navegación.
export function FloorSwitcher({ floors, activeId, onChange, compact = false, stacked = false }: { floors: Pick<Floor, 'id' | 'name'>[]; activeId: number | null; onChange: (id: number) => void; compact?: boolean; stacked?: boolean }) {
  const t = useTranslations('tables')
  const label = (f: Pick<Floor, 'name'>) => parseFloorName(f.name).label
  if (floors.length === 0) return null
  if (floors.length === 1) return (
    <div className={cn("flex gap-2 min-w-0 text-[14px]", stacked ? "flex-col" : "items-center")}>
      <span className="text-soft shrink-0">{t('currentFloor')}</span>
      <span className="font-semibold text-ink break-words">{label(floors[0])}</span>
    </div>
  )
  const active = floors.find((f) => f.id === activeId)
  return (
    <label className={cn("flex gap-2 min-w-0 max-w-full", stacked ? "flex-col w-full" : "items-center")}>
      <span className="shrink-0 text-[13px] font-medium text-soft">{t('floorLabel')}</span>
      <span className={cn('relative min-w-0 max-w-full', stacked ? 'w-full' : compact ? 'w-[180px]' : 'w-[240px]')}>
        <Select aria-label={t('changeFloor')} title={active ? label(active) : t('chooseFloor')} value={active?.id ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
          {!active && <option value="" disabled>{t('chooseFloor')}</option>}
          {floors.map((f) => <option key={f.id} value={f.id}>{label(f)}</option>)}
        </Select>
      </span>
    </label>
  )
}

// Información del piso dentro del lateral; el detalle despliega las mesas libres por tamaño.
export function FloorInfoChip({ type, remaining }: { type: FloorType; remaining: { large: number; small: number } }) {
  const t = useTranslations('tables.floorInfo')
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-md border border-border bg-surface text-[14px] overflow-hidden">
      <button type="button" aria-expanded={open} aria-label={t('toggle')} onClick={() => setOpen((v) => !v)} className="min-h-12 w-full px-3.5 py-3 text-left flex items-center justify-between gap-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2">
        <span className="flex flex-col gap-1"><span className="font-semibold text-ink">{t('label')}</span>
        <span className="text-soft">{t('type')} <strong className="text-ink font-medium">{t(type)}</strong></span></span>
        <Icon name="chevronDown" size={18} className={cn("shrink-0 text-soft transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </button>
      {open && (
        <dl className="border-t border-border px-3.5 py-3 grid grid-cols-[1fr_auto] gap-x-2 gap-y-2 text-[13px] text-soft">
          <dt>{t('remainingLarge')}</dt><dd className="font-semibold text-ink text-right">{remaining.large}</dd>
          <dt>{t('remainingSmall')}</dt><dd className="font-semibold text-ink text-right">{remaining.small}</dd>
        </dl>
      )}
    </div>
  )
}

// Barra flotante del kit (Table Selected.png). Es donde empieza el trabajo con una mesa concreta, así que
// aquí está "Crear pedido": la mesa ya está elegida. "Info de reserva" solo si la mesa tiene alguna; un
// botón que siempre abre una lista vacía no es un botón, es ruido.
export function SelectedTableBar({ name, hasReservation, onClear, onReservations, onDetail, onNewOrder, mayCreate = true }: {
  mayCreate?: boolean; name: string; hasReservation: boolean; onClear: () => void; onReservations: () => void; onDetail: () => void; onNewOrder: () => void
}) {
  const t = useTranslations('tables')
  return (
    <div role="toolbar" aria-label={t('selected.label')} className="absolute left-1/2 -translate-x-1/2 bottom-8 z-20 w-max max-w-[calc(100%_-_24px)] min-h-14 py-1.5 pl-4 pr-1.5 rounded-md bg-overlay text-[#F7F7F7] shadow-xl flex flex-wrap justify-center items-center gap-3">
      <span className="text-[15px] font-semibold">{t('selected.label')}</span>
      <span className="h-11 pl-3 pr-1.5 rounded-sm bg-[#F7F7F7] text-[#0F172A] flex items-center gap-1 text-[15px] font-semibold">
        {t('table', { name })}
        <button type="button" onClick={onClear} aria-label={t('selected.clear')} className="w-8 h-8 grid place-items-center rounded-sm hover:bg-black/10"><Icon name="close" size={18} /></button>
      </span>
      <span aria-hidden className="w-px h-6 bg-[#51525C]" />
      {hasReservation && (
        <button type="button" onClick={onReservations} className="h-11 px-3.5 rounded-sm bg-[#F7F7F7] text-[#0F172A] flex items-center gap-2 text-[15px] font-semibold"><Icon name="reservations" size={20} />{t('selected.reservation')}</button>
      )}
      <button type="button" onClick={onDetail} className="h-11 px-3.5 rounded-sm bg-[#F7F7F7] text-[#0F172A] flex items-center gap-2 text-[15px] font-semibold"><Icon name="tables" size={20} />{t('selected.detail')}</button>
      {mayCreate && <button type="button" onClick={onNewOrder} className="h-11 px-3.5 rounded-sm bg-primary text-primary-ink flex items-center gap-2 text-[15px] font-semibold"><Icon name="plus" size={20} />{t('createOrder')}</button>}
    </div>
  )
}
