'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import type { Floor, Table } from '@/lib/types'

// Panel "Table Available" del kit: piso en desplegable, cabecera Número de mesa / Capacidad y filas "A1 — 2 personas".
export function TablesAvailable({ floors, tables, busyTableIds }: { floors: Floor[]; tables: Table[]; busyTableIds: Set<number> }) {
  const t = useTranslations('dashboard')
  const [floorId, setFloorId] = useState<number | null>(null)
  const active = floors.find((f) => f.id === floorId) ?? floors[0] ?? null
  const free = tables.filter((x) => x.floorId === active?.id && !busyTableIds.has(x.id)).sort((a, b) => a.number - b.number)
  return (
    <section aria-label={t('tables.title')} className="bg-surface border border-border rounded-lg flex flex-col min-h-0 min-w-0">
      <header className="px-4 h-16 flex items-center justify-between border-b border-border shrink-0">
        <h2 className="min-w-0 truncate text-[16px] font-semibold text-ink">{t('tables.title')}</h2>
        <label className="relative h-10 rounded-md border border-border bg-surface inline-flex items-center pl-3 pr-8 text-[15px] font-semibold text-ink">
          <select aria-label={t('tables.floor')} value={active?.id ?? ''} onChange={(e) => setFloorId(Number(e.target.value))} className="appearance-none bg-transparent outline-none pr-1">
            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <Icon name="chevronDown" size={18} className="absolute right-2 pointer-events-none text-soft" />
        </label>
      </header>
      <div className="px-4 h-10 flex items-center justify-between text-[13px] text-soft border-b border-border shrink-0"><span>{t('tables.number')}</span><span>{t('tables.capacity')}</span></div>
      <ul className="flex-1 min-h-0 overflow-y-auto px-4 py-1">
        {free.map((x) => (
          <li key={x.id} className="h-11 flex items-center justify-between text-[15px]">
            <span className="font-semibold text-ink">{x.number}</span>
            <span className="text-soft"><b className="text-ink font-semibold">{x.seats}</b> {t('tables.persons')}</span>
          </li>
        ))}
        {free.length === 0 && <li className="py-6 text-center text-[14px] text-soft">{t('tables.empty')}</li>}
      </ul>
    </section>
  )
}
