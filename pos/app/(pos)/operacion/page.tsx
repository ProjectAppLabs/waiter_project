'use client'

import Link from 'next/link'
import { AlertThresholdsButton } from '@/components/settings/AlertThresholdsButton'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Shell } from '@/components/layout/Shell'
import { Topbar } from '@/components/layout/Topbar'
import { useOperationSubnav } from '@/components/layout/useOperationSubnav'
import { AlertCard } from '@/components/ops/AlertCard'
import { ShiftTable } from '@/components/ops/ShiftTable'
import { KpiCard } from '@/components/ui/KpiCard'
import { Segmented } from '@/components/ui/Segmented'
import { formatCop } from '@/lib/domain/money'
import { deriveAlerts, filterOrders, matchesFilter, orderStatus, type Filter } from '@/lib/domain/ops'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useOpsStore } from '@/lib/stores/opsStore'
import { useOrderStore } from '@/lib/stores/orderStore'

const POLL_MS = 10_000
const FILTERS: Filter[] = ['all', 'tables', 'kitchen', 'payments']

export default function OperacionPage() {
  const t = useTranslations('pos.ops')
  const subnav = useOperationSubnav('live')
  const session = useAuthStore((s) => s.session)
  const catalog = useCatalogStore((s) => s.catalog)
  const { flags, calls, shift, refreshShift, refreshOpenOrders, attendCall } = useOrderStore()
  const { orders, autonomy, billingSince, dismissed, resolved, refresh, resolve } = useOpsStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [now, setNow] = useState(() => Date.now())
  const tableNumberOf = useMemo(() => (id: number) => catalog?.tables.find((tb) => tb.id === id)?.number ?? null, [catalog])

  useEffect(() => {
    if (!session || !catalog) return
    const run = () => { void refresh(session.id, tableNumberOf); void refreshShift(session.id); void refreshOpenOrders(session.id) }
    run()
    const id = setInterval(() => { setNow(Date.now()); run() }, POLL_MS)
    return () => clearInterval(id)
  }, [session, catalog, tableNumberOf, refresh, refreshShift, refreshOpenOrders])

  if (!catalog) return null
  const late = catalog.settings.alertLateMinutes
  const alerts = deriveAlerts(orders, flags, billingSince, now, { late, bill: catalog.settings.alertBillMinutes }, calls, tableNumberOf).filter((a) => !dismissed[a.id])
  const visibleAlerts = alerts.filter((a) => matchesFilter(a.kind, filter))
  const open = orders.filter((o) => orderStatus(o, now, late).status !== 'paid')
  const cooking = open.filter((o) => ['cooking', 'late'].includes(orderStatus(o, now, late).status))
  const lateCount = open.filter((o) => orderStatus(o, now, late).status === 'late').length
  const toCharge = Object.values(flags).filter((f) => f.billing).length
  const activeTables = new Set(open.filter((o) => o.tableId !== null).map((o) => o.tableId)).size
  const badge = alerts.length ? { operation: { count: alerts.length, tone: 'brand' as const } } : {}
  const time = (at: number) => new Date(at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <Shell mode="sidebar" active="operation" badges={badge} autonomy={autonomy} subnav={subnav}>
      <Topbar
        left={<><span className="text-[22px] font-bold">{t('title')}</span>
          <span className={`inline-flex items-center gap-[7px] h-8 px-[11px] rounded-full text-sm font-medium ${alerts.length ? 'bg-busy-soft text-busy-ink' : 'bg-free-soft text-free-ink'}`}>
            <span className={`w-[7px] h-[7px] rounded-full ${alerts.length ? 'bg-busy' : 'bg-free'}`} />{t('attention', { n: alerts.length })}</span></>}
        right={<><Segmented label={t('title')} options={FILTERS.map((f) => ({ value: f, label: t(`filters.${f}`) }))} value={filter} onChange={setFilter} />
          <Link href="/salon" className="h-tap px-[18px] rounded-[10px] bg-brand-500 text-white grid place-items-center text-base font-bold">{t('goSalon')}</Link></>}
      />
      {/* Desde lg, la disposición de siempre: el turno y el panel de alertas de 400 px lado a lado. Por debajo (tableta
          vertical, celular) ese panel dejaba la tabla en 377 px o en 2 px y recortaba Total y Estado: pasa debajo. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-visible">
        <section className="flex-1 min-w-0 p-6 px-7 flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard label={t('kpi.activeTables')} value={`${activeTables} / ${catalog.tables.length}`} />
            <KpiCard label={t('kpi.cooking')} value={cooking.length} />
            <KpiCard label={t('kpi.late')} value={lateCount} tone={lateCount ? 'busy' : 'neutral'} />
            <KpiCard label={t('kpi.toCharge')} value={toCharge} />
            <KpiCard label={t('kpi.sales')} value={formatCop(shift?.sales ?? 0)} />
          </div>
          <div className="flex-1 min-h-0 rounded-[18px] bg-surface border border-border flex flex-col overflow-hidden">
            <div className="px-[22px] py-[18px] border-b border-border flex items-center justify-between">
              <span className="text-[19px] font-bold">{t('orders')}</span>
              <span className="text-[15px] text-soft">{t('ordersMeta', { total: autonomy?.total ?? orders.length, autonomous: autonomy?.autonomous ?? 0 })}</span>
            </div>
            <ShiftTable orders={filterOrders(orders, filter, now, late)} now={now} lateMinutes={late} emptyText={t('quiet')} />
          </div>
        </section>
        <aside aria-label={t('alerts')} className="w-full lg:w-panel-lg shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-surface flex flex-col">
          <div className="px-[22px] py-[18px] border-b border-border flex items-center justify-between">
            <span className="text-[19px] font-bold">{t('alerts')}</span><span className="text-sm text-ink-3">{t('alertsMeta')}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 px-[18px] flex flex-col gap-3">
            {visibleAlerts.length === 0 && <p className="text-[15px] text-soft">{t('quiet')}</p>}
            {visibleAlerts.map((a) => <AlertCard key={a.id} alert={a} late={late} queue={cooking.length} onResolve={(al, text) => resolve(al.id, text, Date.now())}
              onAttend={(al) => { if (al.tableId !== null) void attendCall(al.tableId); resolve(al.id, t('attended', { table: al.tableNumber ?? '—' }), Date.now()) }} />)}
            <div className="rounded-[14px] border border-border bg-canvas p-4 flex flex-col gap-1.5">
              <span className="text-[13px] tracking-[0.1em] uppercase text-ink-3 font-medium">{t('resolved')}</span>
              <span className="text-[15px] leading-relaxed text-soft">{resolved.length ? resolved.map((r) => t('resolvedItem', { text: r.text, time: time(r.at) })).join(' · ') : t('resolvedNone')}</span>
            </div>
          </div>
          <div className="px-[22px] py-4 border-t border-border bg-canvas flex items-center justify-between">
            <span className="text-[15px] text-soft">{t('thresholds')}</span>
            <AlertThresholdsButton label={t('configure')} />
          </div>
        </aside>
      </div>
    </Shell>
  )
}
