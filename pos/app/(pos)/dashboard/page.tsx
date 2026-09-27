'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { AttentionFeed } from '@/components/dashboard/AttentionFeed'
import { DishStatsCard } from '@/components/dashboard/DishStatsCard'
import { ForecastCard } from '@/components/dashboard/ForecastCard'
import { KpiTile } from '@/components/dashboard/KpiTile'
import { LiveClock } from '@/components/dashboard/LiveClock'
import { PatternCard } from '@/components/dashboard/PatternCard'
import { TablesAvailable } from '@/components/dashboard/TablesAvailable'
import { attentionItems, dishStats, forecastNextMonth, generalKpis, peakHours, weekdayAverages, type PeriodKpi, type SalesHistory } from '@/lib/domain/insights'
import { formatCop } from '@/lib/domain/money'
import { greetingFor, readyToServe } from '@/lib/domain/orderState'
import type { Ingredient } from '@/lib/domain/pantry'
import { tablesLabel, type ReservationCard } from '@/lib/domain/reservations'
import { useIdentity } from '@/lib/hooks/useIdentity'
import { useKitOrders } from '@/lib/hooks/useKitOrders'
import { getSalesHistory } from '@/lib/services/insights'
import { listIngredients } from '@/lib/services/pantry'
import { getTimeline } from '@/lib/services/reservations'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

const REFRESH_MS = 60_000
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// Inicio es la vista general, no la operación del momento: los pedidos (En progreso, Esperando pago, Listos para servir)
// viven en Pedidos, y las ventas del día o del turno, con sus filtros, en Administración → Ventas. Aquí se ve cómo van la
// semana y el mes, qué hay que atender, cuándo se vende, qué platos se piden más y menos, y cuánto se espera vender el mes
// que viene. Las cifras de ventas solo las ven administradores y cajeros; un mesero ve lo operativo.
export default function DashboardPage() {
  const t = useTranslations('dashboard')
  // Se saluda a quien marcó su PIN, no a la credencial con la que se abrió la tablet.
  const { firstName, role } = useIdentity()
  const catalog = useCatalogStore((s) => s.catalog)
  // Con la caja cerrada el Dashboard sigue vivo (informes, reservas, inventario); el saludo invita a abrirla (el botón
  // está en la barra superior).
  const registerClosed = useAuthStore((s) => !s.session)
  const { orders } = useKitOrders()
  const [reservations, setReservations] = useState<ReservationCard[] | null>(null)
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null)
  const [history, setHistory] = useState<SalesHistory | null>(null)
  const [historyFailed, setHistoryFailed] = useState(false)
  const [nowHour, setNowHour] = useState(() => { const d = new Date(); return d.getHours() + d.getMinutes() / 60 })
  const configId = catalog?.settings.configId ?? null
  const seesSales = role === 'admin' || role === 'cashier'

  // Reservas de hoy e inventario: se refrescan cada minuto. Cada fuente falla por separado: si el inventario no carga,
  // las reservas se siguen avisando (una lista vacía es mejor que un tablero en blanco).
  useEffect(() => {
    if (configId === null) return
    let alive = true
    const load = () => {
      const d = new Date()
      setNowHour(d.getHours() + d.getMinutes() / 60)
      getTimeline(configId, todayIso()).then((tl) => {
        if (!alive) return
        const byId = new Map(tl.tables.flatMap((tb) => tb.reservations).map((r) => [r.id, r])) // una reserva de grupo viene en la fila de cada mesa
        setReservations([...byId.values()])
      }).catch(() => { if (alive) setReservations([]) })
      listIngredients().then((rows) => { if (alive) setIngredients(rows) }).catch(() => { if (alive) setIngredients([]) })
    }
    load()
    const id = setInterval(load, REFRESH_MS)
    return () => { alive = false; clearInterval(id) }
  }, [configId])

  useEffect(() => {
    if (configId === null || !seesSales) return
    let alive = true
    getSalesHistory(configId).then((h) => { if (alive) setHistory(h) }).catch(() => { if (alive) setHistoryFailed(true) })
    return () => { alive = false }
  }, [configId, seesSales])

  const busyTables = useMemo(() => new Set(orders.flatMap((o) => (o.tableId === null ? [] : [o.tableId]))), [orders])
  const ready = useMemo(() => readyToServe(orders), [orders])
  const confirmed = useMemo(() => (reservations ?? []).filter((r) => r.state === 'confirmed'), [reservations])
  const attention = useMemo(() => attentionItems({
    nowHour, ready: ready.length,
    reservations: confirmed.map((r) => ({ id: r.id, name: r.name, customer: r.customerName, timeStart: r.timeStart, label: r.label, people: r.people, tables: tablesLabel(r.tableNumbers), depositPending: r.depositState === 'pending' })),
    ingredients: (ingredients ?? []).map((i) => ({ id: i.id, name: i.name, level: i.level, stock: i.qty, min: i.min, uom: i.uomName })),
    soldOut: (catalog?.products ?? []).filter((p) => p.soldOut).map((p) => ({ id: p.id, name: p.name })),
  }), [nowHour, ready.length, confirmed, ingredients, catalog])
  // La carta son los productos con categoría del POS: una tarjeta de regalo o la propina se venden, pero no son platos.
  const stats = useMemo(() => (history && catalog ? dishStats(history, catalog.products.filter((p) => p.categoryIds.length > 0).map((p) => ({ id: p.id, templateId: p.templateId, name: p.name }))) : null), [history, catalog])
  const forecast = useMemo(() => (history ? forecastNextMonth(history) : null), [history])

  const kpis = useMemo(() => (history ? generalKpis(history) : null), [history])
  const weekdays = useMemo(() => (history ? weekdayAverages(history) : []), [history])
  const hours = useMemo(() => (history ? peakHours(history) : []), [history])
  const money = (k: PeriodKpi | undefined) => (k ? `$ ${formatCop(Math.round(k.value))}` : '')
  const hintOf = (k: PeriodKpi | undefined, text: string) => (k && k.change === null ? t('general.noCompare') : text)
  const freeTables = (catalog?.tables ?? []).filter((tb) => !busyTables.has(tb.id)).length

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="shrink-0 px-2 py-4 sm:px-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink">{t(`greeting.${greetingFor(new Date().getHours())}`, { name: firstName })}</h1>
            <p className="text-[15px] text-soft">{registerClosed ? t('mottoClosed') : t('motto')}</p>
          </div>
          <LiveClock label={t('clock')} />
        </div>

        {seesSales ? (
          <Link href="/ventas" aria-label={t('seeSales')} className="grid grid-cols-2 lg:grid-cols-4 gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-primary">
            <KpiTile loading={!kpis} label={t('general.week')} value={money(kpis?.week)} icon="wallet" change={kpis?.week.change} hint={hintOf(kpis?.week, t('general.weekHint'))} />
            <KpiTile loading={!kpis} label={t('general.month')} value={money(kpis?.month)} icon="chartLine" change={kpis?.month.change} hint={hintOf(kpis?.month, t('general.monthHint'))} />
            <KpiTile loading={!kpis} label={t('general.monthOrders')} value={kpis ? String(kpis.monthOrders.value) : ''} icon="fileCheck" change={kpis?.monthOrders.change} hint={hintOf(kpis?.monthOrders, t('general.monthHint'))} />
            <KpiTile loading={!kpis} label={t('general.ticket')} value={money(kpis?.ticket)} icon="sales" change={kpis?.ticket.change} hint={t('general.ticketHint')} />
          </Link>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/pedidos" aria-label={t('seeOrders')} className="rounded-lg focus-visible:outline-2 focus-visible:outline-primary"><KpiTile label={t('kpi.open')} value={String(orders.length)} icon="alarm" /></Link>
            <Link href="/reservas" className="rounded-lg focus-visible:outline-2 focus-visible:outline-primary"><KpiTile label={t('kpi.reservationsToday')} loading={reservations === null} value={reservations === null ? '' : String(confirmed.length)} icon="reservations" /></Link>
            <KpiTile label={t('general.freeTables')} value={String(freeTables)} icon="tables" />
            <KpiTile label={t('general.soldOut')} value={String((catalog?.products ?? []).filter((p) => p.soldOut).length)} icon="alert" />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:h-[440px] shrink-0">
          <AttentionFeed items={attention} loaded={reservations !== null && ingredients !== null} />
          {seesSales ? <PatternCard weekdays={weekdays} hours={hours} loaded={history !== null || historyFailed} />
            : <TablesAvailable floors={catalog?.floors ?? []} tables={catalog?.tables ?? []} busyTableIds={busyTables} />}
        </div>

        {seesSales && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            <DishStatsCard stats={stats} windowDays={history?.windowDays ?? 28} loaded={history !== null || historyFailed} />
            <ForecastCard forecast={forecast} loaded={history !== null || historyFailed} />
          </div>
        )}
      </div>
    </>
  )
}
