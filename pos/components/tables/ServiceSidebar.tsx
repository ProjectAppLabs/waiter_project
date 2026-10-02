'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { Select } from '@/components/ui/Select'
import { lineGroup, orderDate, type KitOrder } from '@/lib/domain/orderState'
import type { OrderLocation } from '@/lib/domain/orderLocation'
import type { TableCall } from '@/lib/services/tables'
import type { Table } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  orders: KitOrder[]; calls: TableCall[]; tables: Table[]; visibleTableIds: number[]
  locations: Map<number, OrderLocation>; loaded: boolean
  onOpenTable: (tableId: number) => void
}

// Una tarjeta por id de mesa, aunque tenga varias rondas, llamadas y platos listos a la vez.
// La entrega se confirma en el detalle, nunca desde el resumen del salón.
export function ServiceSidebar({ orders, calls, tables, visibleTableIds, locations, loaded, onOpenTable }: Props) {
  const t = useTranslations('tables.service')
  const [scope, setScope] = useState('visible')
  const [filter, setFilter] = useState<'all' | 'ready' | 'pending' | 'calls'>('all')
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer) }, [])
  const included = useMemo(() => new Set(scope === 'all' ? tables.map((table) => table.id) : visibleTableIds), [scope, tables, visibleTableIds])
  const tasks = tables.filter((table) => included.has(table.id)).map((table) => {
    const tableOrders = orders.filter((order) => order.tableId === table.id)
    const ready = tableOrders.flatMap((order) => order.lines.filter((line) => lineGroup(order, line) === 'ready').map((line) => ({ ...line, since: line.readyAt ?? order.courses.find((course) => course.id === line.courseId)?.readyAt ?? order.startedAt })))
    const pending = tableOrders.flatMap((order) => order.lines.filter((line) => !order.courses.some((course) => course.id === line.courseId && course.fired)).map((line) => ({ ...line, since: order.startedAt })))
    const call = calls.find((entry) => entry.tableId === table.id)
    const since = (ready.length ? ready.map((line) => line.since) : call?.since ? [call.since] : pending.map((line) => line.since)).sort()[0] ?? ''
    return { table, ready, pending, call, since }
  }).filter((task) => task.ready.length || task.pending.length || task.call)
    .sort((a, b) => Number(b.ready.length > 0) - Number(a.ready.length > 0) || a.since.localeCompare(b.since))
  const counts = { ready: tasks.filter((task) => task.ready.length).length, pending: tasks.filter((task) => task.pending.length).length, calls: tasks.filter((task) => task.call).length }
  const visible = tasks.filter((task) => filter === 'all' || (filter === 'calls' ? task.call : task[filter].length))
  const waiting = (since: string) => {
    const at = orderDate(since).getTime()
    return Number.isFinite(at) ? t('minutes', { count: Math.max(0, Math.floor((now - at) / 60_000)) }) : t('timeUnknown')
  }
  return (
    <aside id="salon-service" aria-label={t('title')} className="w-[248px] xl:w-[280px] shrink-0 m-3 ml-0 rounded-lg border border-border bg-surface/40 flex flex-col min-h-0">
      <header className="p-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-ink">{t('title')}</h2>
        <p className="text-xs text-soft mt-1">{t('subtitle')}</p>
        <label className="block mt-3"><span className="sr-only">{t('scope')}</span><Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="visible">{t('visible')}</option><option value="all">{t('all')}</option></Select></label>
        <div className="mt-3 grid grid-cols-3 gap-1" aria-label={t('taskFilters')}>
          {(['ready', 'pending', 'calls'] as const).map((key) => <button key={key} type="button" aria-label={`${t(key)}: ${counts[key]}`} aria-pressed={filter === key} title={t(key)} onClick={() => setFilter(filter === key ? 'all' : key)} className={cn('min-h-11 rounded-md border flex flex-col items-center justify-center gap-1 py-2 text-xs', filter === key ? 'bg-primary-soft border-primary/40 text-primary' : 'border-border bg-surface/60 text-soft')}>
            <span className="flex items-center gap-1"><Icon name={key === 'ready' ? 'chef' : key === 'pending' ? 'cart' : 'bell'} size={15} /><b>{counts[key]}</b></span>{t(`short.${key}`)}
          </button>)}
        </div>
        <p className="mt-2 text-xs text-soft">{t('openHint')}</p>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {!loaded ? <p role="status" className="text-sm text-soft">{t('loading')}</p> : visible.length === 0 ? <div className="py-6 px-1 text-center"><Icon name="checks" size={26} className="mx-auto text-soft" /><p className="mt-3 text-sm font-semibold text-ink">{filter === 'all' ? t('empty') : t('emptyFilter')}</p><p className="mt-1 text-xs text-soft">{t('emptyHint')}</p></div> :
          <ul className="space-y-2">{visible.map(({ table, ready, pending, call, since }) => {
            const location = locations.get(table.id)
            const items = [...ready, ...pending]
            return <li key={table.id}>
              <button type="button" onClick={() => onOpenTable(table.id)} className="w-full cursor-pointer text-left rounded-lg border border-border bg-surface/80 p-3 hover:border-primary/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-primary">
                <span className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-ink">{t('table', { number: table.number })}</span><span className="w-7 h-7 shrink-0 rounded-md bg-primary text-white inline-flex items-center justify-center"><Icon name="expand" size={16} /></span></span>
                <span className="block mt-0.5 text-xs text-soft break-words">{[location?.floor, location?.zone].filter(Boolean).join(' · ') || t('locationLoading')}</span>
                <span className="mt-2 flex flex-col gap-1 text-xs font-medium">
                  {ready.length > 0 && <span className="text-success-ink flex items-center gap-1"><Icon name="chef" size={14} />{t('toDeliver', { count: ready.reduce((sum, line) => sum + line.qty, 0) })}</span>}
                  {pending.length > 0 && <span className="text-progress-ink flex items-center gap-1"><Icon name="cart" size={14} />{t('pending')}</span>}
                  {call && <span className="text-info-ink flex items-center gap-1"><Icon name="bell" size={14} />{t(`kind.${call.kind}`)}</span>}
                </span>
                {items.length > 0 && <span className="block mt-2 text-xs leading-relaxed text-soft">{items.slice(0, 2).map((line) => <span key={line.id} className="block truncate">{line.qty} × {line.name}</span>)}{items.length > 2 && <span className="block">{t('moreItems', { count: items.length - 2 })}</span>}</span>}
                <span className="mt-2 flex items-center gap-1 text-xs text-dim"><Icon name="clock" size={13} />{waiting(since)}</span>
              </button>
            </li>
          })}</ul>}
      </div>
    </aside>
  )
}
