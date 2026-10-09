'use client'

import { ExportMenu } from '@/components/kit/ExportMenu'
import { serverDate } from '@/lib/domain/time'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { CloseRegisterModal } from '@/components/cash/CloseRegisterModal'
import { RegisterCard } from '@/components/cash/RegisterCard'
import { Card } from '@/components/kit/Card'
import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { KpiValueSkeleton, ListSkeleton } from '@/components/kit/Skeleton'
import { StatusPill } from '@/components/kit/StatusPill'
import { KitTable, type KitColumn } from '@/components/ui/KitTable'
import { KpiTile } from '@/components/ui/KpiTile'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCop } from '@/lib/domain/money'
import { can, effectiveRole } from '@/lib/domain/roles'
import { cashInOut, closeRegister, closingData, type ClosingData } from '@/lib/services/cashRegister'
import { SALES_LIST_LIMIT, listSales, listShifts, paymentsByMethod, salesByWaiter, salesSummary, topProducts, type SalesSummary, type MethodTotal, type ProductTotal, type SaleRow, type ShiftRow, type WaiterTotal } from '@/lib/services/sales'
import { SALES_PERIODS, rangeFor, validRange, type DayRange, type SalesPeriod, type SalesScope } from '@/lib/domain/salesPeriod'
import { useAuthStore } from '@/lib/stores/authStore'
import { cn } from '@/lib/utils'
import { useCatalogStore } from '@/lib/stores/catalogStore'

interface Data { key: string; summary: SalesSummary; sales: SaleRow[]; methods: MethodTotal[]; waiters: WaiterTotal[]; top: ProductTotal[] }
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
const time = (at: string | null) => !at ? '—' : serverDate(at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false })
const day = (at: string | null) => !at ? null : serverDate(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })

// Ventas con la estructura del Dashboard del kit (KPIs con icono, tarjetas) y la caja arriba. Se filtra por periodo —hoy,
// ayer, esta semana, este mes, el mes pasado o un rango— o por turno, que es el filtro para cuadrar la caja. El detalle
// del día vive aquí; Inicio muestra la visión general.
export function SalesView() {
  const t = useTranslations('cash.sales')
  const catalog = useCatalogStore((s) => s.catalog)
  const { session, refreshSession, user } = useAuthStore()
  // El dueño cierra caja como el encargado del restaurante que está operando.
  const role = effectiveRole(user?.role, null)
  const [closing, setClosing] = useState<ClosingData | null>(null)
  const [expectedCash, setExpectedCash] = useState<number | null>(null)
  const [shifts, setShifts] = useState<ShiftRow[]>([])
  const [shiftId, setShiftId] = useState<number | null>(null)
  const [period, setPeriod] = useState<SalesPeriod>('today')
  const [custom, setCustom] = useState<DayRange>(() => ({ from: todayIso(), to: todayIso() }))
  const [data, setData] = useState<Data | null>(null)
  const tableNumberOf = useMemo(() => (id: number) => catalog?.tables.find((tb) => tb.id === id)?.number ?? null, [catalog])

  useEffect(() => { void listShifts().then((rows) => { setShifts(rows); if (rows[0]) setShiftId((id) => id ?? rows[0].id) }) }, [])
  useEffect(() => { if (session) void closingData(session.id).then((d) => setExpectedCash(d.expectedCash)) }, [session])
  // El alcance de la consulta; null mientras no se pueda consultar (rango a medio escribir, o «por turno» sin turnos).
  const scope = useMemo<SalesScope | null>(() => {
    if (period === 'shift') return shiftId === null ? null : { kind: 'shift', sessionId: shiftId }
    const range = period === 'custom' ? custom : rangeFor(period, todayIso())
    return validRange(range) ? { kind: 'range', ...range } : null
  }, [period, shiftId, custom])
  const scopeKey = scope ? JSON.stringify(scope) : ''
  // Plan Y1: el periodo de la pantalla (o el del turno elegido) para exportar ventas y pagos al detalle.
  const exportParams = useMemo(() => {
    if (!scope) return null
    const restaurant_id = catalog?.settings.configId ?? null
    if (scope.kind === 'range') return { from: scope.from, to: scope.to, restaurant_id }
    const shift = shifts.find((sh) => sh.id === scope.sessionId)
    if (!shift) return null
    const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA') : todayIso())
    return { from: day(shift.startAt), to: day(shift.stopAt), restaurant_id }
  }, [scope, shifts, catalog])
  useEffect(() => {
    if (!scope) return
    let alive = true
    void Promise.all([salesSummary(scope), listSales(scope, tableNumberOf), paymentsByMethod(scope), salesByWaiter(scope), topProducts(scope)])
      .then(([summary, sales, methods, waiters, top]) => { if (alive) setData({ key: scopeKey, summary, sales, methods, waiters, top }) })
    return () => { alive = false }
  }, [scopeKey, tableNumberOf]) // eslint-disable-line react-hooks/exhaustive-deps -- `scope` cambia de identidad en cada render; su contenido es `scopeKey`

  const current = scope && data?.key === scopeKey ? data : null
  const total = current?.summary.total ?? 0
  const orderCount = current?.summary.orders ?? 0
  const autonomous = current?.summary.autonomous ?? 0
  // Mientras llega el periodo pedido: esqueletos, no «$ 0» ni «sin datos», que parecerían ciertos.
  const pending = scope !== null && current === null
  const rangeText = scope?.kind === 'range' ? (scope.from === scope.to ? dayLabel(scope.from) : `${dayLabel(scope.from)} – ${dayLabel(scope.to)}`) : ''
  const maxMethod = Math.max(...(current?.methods.map((m) => m.amount) ?? [1]), 1)
  const openShift = session ? shifts.find((s) => s.id === session.id) : undefined
  const oneDay = scope?.kind === 'range' && scope.from === scope.to
  const columns: KitColumn<SaleRow>[] = [
    { key: 'ref', header: t('cols.order'), width: '110px', render: (s) => <span className="font-semibold">#{s.id}</span> },
    // En un solo día basta la hora; en un rango o un turno que cruza la medianoche hace falta también la fecha.
    { key: 'time', header: t('cols.time'), width: oneDay ? '90px' : '150px', render: (s) => <span className="tabular">{oneDay ? time(s.paidAt) : `${day(s.paidAt)} · ${time(s.paidAt)}`}</span> },
    { key: 'table', header: t('cols.table'), width: '120px', render: (s) => (s.tableNumber !== null ? t('table', { n: s.tableNumber }) : t('delivery')) },
    { key: 'waiter', header: t('cols.waiter'), render: (s) => s.waiter },
    { key: 'origin', header: t('cols.origin'), width: '140px', render: (s) => <StatusPill tone={s.origin === 'waiter' ? 'neutral' : 'info'}>{s.origin === 'waiter' ? t('origin.waiter') : t('origin.auto')}</StatusPill> },
    { key: 'total', header: t('cols.total'), width: '140px', align: 'right', render: (s) => <span className="font-semibold tabular">$ {formatCop(s.total)}</span> },
  ]
  const list = (rows: { key: string; label: string; meta?: string; amount: number }[]) => pending ? <ListSkeleton rows={4} /> : (
    <div className="p-5 flex flex-col gap-3">
      {rows.length === 0 && <p className="text-[14px] text-soft">{t('none')}</p>}
      {rows.map((r) => <div key={r.key} className="flex items-center justify-between gap-3 text-[15px]"><span className="min-w-0 truncate">{r.label}{r.meta && <span className="text-soft"> · {r.meta}</span>}</span><span className="font-semibold tabular shrink-0">{formatCop(r.amount)}</span></div>)}
    </div>
  )
  return (
    <>
      <PageHeader title={t('title')} actions={<ExportMenu options={[{ kind: 'ventas', label: 'Ventas al detalle' }, { kind: 'pagos', label: 'Pagos' }]} params={exportParams} />} />
      {/* Filtro de periodo: fichas para lo habitual, fechas para un rango y el turno para cuadrar la caja. */}
      <div role="group" aria-label={t('period.label')} className="shrink-0 px-5 pb-4 flex flex-wrap items-center gap-2">
        {SALES_PERIODS.map((p) => (
          <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)}
            className={cn('h-11 px-4 rounded-full border text-[15px] font-semibold', period === p ? 'bg-primary border-primary text-primary-ink' : 'bg-surface border-border text-soft hover:text-ink')}>{t(`period.${p}`)}</button>
        ))}
        {period === 'custom' && (
          <span className="flex items-center gap-2 ml-2">
            <input type="date" aria-label={t('period.from')} value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-ink" />
            <span aria-hidden className="text-dim">–</span>
            <input type="date" aria-label={t('period.to')} value={custom.to} min={custom.from || undefined} max={todayIso()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-11 rounded-md border border-border bg-surface px-3 text-[15px] text-ink" />
          </span>
        )}
        {period === 'shift' && (
          <label className="ml-2 h-11 px-4 rounded-md border border-border bg-surface flex items-center gap-2 text-[15px] font-semibold text-ink">
            <span className="text-soft font-normal">{t('shift')}:</span>
            <select aria-label={t('shift')} value={shiftId ?? ''} onChange={(e) => setShiftId(Number(e.target.value))} className="bg-transparent outline-none max-w-[320px]">
              {shifts.map((s) => <option key={s.id} value={s.id}>{day(s.startAt) ? t('shiftLabel', { name: s.name, date: day(s.startAt) ?? '' }) : t('shiftNotStarted', { name: s.name })} · {s.state === 'closed' ? t('shiftClosed') : t('shiftOpen')}</option>)}
            </select>
            <Icon name="chevronDown" size={18} className="text-soft" />
          </label>
        )}
        <span role="status" className="ml-auto text-[14px] text-soft">{!scope ? t('period.invalid') : rangeText}</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 flex flex-col gap-4">
        {session && can.closeRegister(role) && <RegisterCard openSince={time(openShift?.startAt ?? null)} expectedCash={expectedCash}
          onClose={() => void closingData(session.id).then(setClosing)} onMove={async (type, amount, reason) => { await cashInOut(session.id, type, amount, reason); setExpectedCash((await closingData(session.id)).expectedCash) }} />}
        <div className="grid grid-cols-4 gap-4">
          <KpiTile label={t('kpi.sales')} icon="wallet" value={pending ? <KpiValueSkeleton /> : `$ ${formatCop(total)}`} />
          <KpiTile label={t('kpi.orders')} icon="receipt" value={pending ? <KpiValueSkeleton /> : orderCount} />
          <KpiTile label={t('kpi.avg')} icon="sales" value={pending ? <KpiValueSkeleton /> : `$ ${formatCop(orderCount ? total / orderCount : 0)}`} />
          <KpiTile label={t('kpi.autonomous')} icon="tablet" tone="primary" value={pending ? <KpiValueSkeleton /> : `${orderCount ? Math.round((autonomous / orderCount) * 100) : 0}%`} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Card title={t('byMethod')}>
            {pending ? <ListSkeleton rows={3} /> : <div className="p-5 flex flex-col gap-3">
              {(current?.methods ?? []).length === 0 && <p className="text-[14px] text-soft">{t('none')}</p>}
              {(current?.methods ?? []).map((m) => (
                <div key={m.method} className="flex flex-col gap-1.5 text-[15px]">
                  <div className="flex justify-between"><span>{m.method}</span><span className="font-semibold tabular">{formatCop(m.amount)}</span></div>
                  <div className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.max(3, (m.amount / maxMethod) * 100)}%` }} aria-hidden /></div>
                </div>
              ))}
            </div>}
          </Card>
          <Card title={t('byWaiter')}>{list((current?.waiters ?? []).map((w) => ({ key: w.waiter, label: w.waiter, meta: `${w.orders} ${t('cols.orders')}`, amount: w.amount })))}</Card>
          <Card title={t('top')}>{list((current?.top ?? []).map((p) => ({ key: p.product, label: p.product, meta: `× ${p.qty}`, amount: p.amount })))}</Card>
        </div>
        <Card title={orderCount > SALES_LIST_LIMIT ? t('ordersLimited', { shown: SALES_LIST_LIMIT, total: orderCount }) : t('orders')} className="shrink-0">
          {pending ? <ListSkeleton rows={6} /> : <KitTable columns={columns} rows={current?.sales ?? []} rowKey={(s) => s.id} empty={<KitEmptyState icon="receipt" title={t('empty')} body={t('emptyBody')} />} />}
        </Card>
      </div>
      {closing && session && <CloseRegisterModal data={closing} onClose={() => setClosing(null)}
        onConfirm={async (counted, notes) => { const r = await closeRegister(session.id, counted, notes); if (r.successful) setTimeout(() => void refreshSession(), 1500); return r }} />}
    </>
  )
}
