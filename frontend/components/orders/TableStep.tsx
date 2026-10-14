'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import { Button } from '@/components/ui/Button'
import type { OpenOrder } from '@/lib/services/orders'
import type { Floor, Table } from '@/lib/types'
import { cn } from '@/lib/utils'

// Estados que el plano del kit distingue (Select Table.png): libre, ocupada, reservada y no seleccionable.
export type PlanState = 'available' | 'notAvailable' | 'reserved' | 'cantSelect'
const DOT: Record<PlanState, string> = { available: 'bg-surface border border-border', notAvailable: 'bg-progress', reserved: 'bg-ink', cantSelect: 'bg-muted border border-border' }
const LEGEND: PlanState[] = ['available', 'notAvailable', 'reserved', 'cantSelect']

export function planState(table: Table, orders: OpenOrder[]): PlanState {
  const order = orders.find((o) => o.tableId === table.id)
  if (!order) return 'available'
  return order.kitchen === 'served' ? 'reserved' : 'notAvailable'
}

interface Props {
  floors: Floor[]; tables: Table[]; orders: OpenOrder[]; selected: number | null
  onSelect: (id: number | null) => void; onContinue: () => void
}

// Paso 2 (solo En mesa): plano simple con leyenda, pestañas de piso y la barra "Mesa seleccionada … Continuar".
export function TableStep({ floors, tables, orders, selected, onSelect, onContinue }: Props) {
  const t = useTranslations('orders.create')
  const [floorId, setFloorId] = useState<number>(floors[0]?.id ?? 0)
  const visible = tables.filter((tb) => tb.floorId === floorId)
  const chosen = tables.find((tb) => tb.id === selected) ?? null
  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5 flex items-center justify-end gap-4 flex-wrap">
        <div className="h-12 px-4 rounded-lg bg-surface border border-border flex items-center gap-4">
          {LEGEND.map((s) => (
            <span key={s} className="flex items-center gap-2 text-[14px] text-soft"><span className={cn('w-2.5 h-2.5 rounded-full', DOT[s])} />{t(`legend.${s}`)}</span>
          ))}
        </div>
        <div role="tablist" aria-label={t('floor')} className="h-12 p-1 rounded-lg bg-muted flex items-center gap-1">
          {floors.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={f.id === floorId} onClick={() => setFloorId(f.id)}
              className={cn('h-10 px-4 rounded-md text-[15px] font-semibold', f.id === floorId ? 'bg-surface border border-border text-ink' : 'text-dim')}>{f.name}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-6">
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
          {visible.map((table) => {
            const state = planState(table, orders)
            const free = state === 'available'
            const isSelected = table.id === selected
            return (
              <li key={table.id}>
                <button type="button" disabled={!free} aria-pressed={isSelected} onClick={() => onSelect(isSelected ? null : table.id)}
                  className={cn('w-full h-[132px] rounded-lg border p-3 flex flex-col items-start gap-2 text-left disabled:cursor-not-allowed',
                    state === 'notAvailable' && 'bg-progress-soft border-progress text-progress-ink',
                    state === 'reserved' && 'bg-reserved border-reserved text-reserved-ink',
                    free && (isSelected ? 'bg-primary-soft border-primary ring-2 ring-primary' : 'bg-surface border-border text-ink'))}>
                  <span className="text-[15px] font-semibold">{t('tableLabel', { n: table.number })}</span>
                  <span className="text-[13px] opacity-70 flex items-center gap-1"><Icon name="users" size={14} />{table.seats}</span>
                  <span className="mt-auto">
                    {state === 'notAvailable' && <StatusPill tone="progress" icon="clock">{t('inProgress')}</StatusPill>}
                    {state === 'reserved' && <span className="text-[13px]">{t('legend.reserved')}</span>}
                    {free && isSelected && <span className="text-[13px] font-semibold text-primary">{t('legend.available')}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="shrink-0 px-6 pb-6 flex justify-center">
        {chosen ? (
          <div className="h-16 px-4 rounded-lg bg-ink text-surface flex items-center gap-3">
            <span className="text-[15px] font-semibold">{t('tableSelected')}</span>
            <span className="h-11 pl-4 pr-2 rounded-md bg-surface text-ink text-[15px] font-semibold flex items-center gap-2">
              {t('tableLabel', { n: chosen.number })}
              <button type="button" aria-label={t('clearTable')} onClick={() => onSelect(null)} className="w-8 h-8 grid place-items-center text-soft"><Icon name="close" size={18} /></button>
            </span>
            <Button variant="primary" className="rounded-md" onClick={onContinue}>{t('continue')}<Icon name="arrowRight" size={18} /></Button>
          </div>
        ) : (
          <p className="text-[15px] text-soft">{t('selectTableFirst')}</p>
        )}
      </div>
    </div>
  )
}
