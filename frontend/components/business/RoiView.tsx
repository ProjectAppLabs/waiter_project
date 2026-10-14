'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'

import { Chip } from '@/components/kit/Chip'
import { RoiBento } from '@/components/roi/RoiBento'
import { PageHeader } from '@/components/ui/PageHeader'
import { inRange, metrics, monthsOfUse, pctChange, periodRange, toServerDate, type Period } from '@/lib/domain/roi'
import { listPaidOrders, type PaidOrder } from '@/lib/services/roi'
import { useCatalogStore } from '@/lib/stores/catalogStore'

const PERIODS: Period[] = ['week', 'month', 'year']
const HISTORY = 3

// Retorno de inversión con el armazón del kit: chips de sección (retorno, analítica, configuración) y chips de periodo.
export function RoiView() {
  const t = useTranslations('admin.roi')
  const catalog = useCatalogStore((s) => s.catalog)
  const [period, setPeriod] = useState<Period>('month')
  // Clave del periodo con los datos: mientras no coincida, la pantalla carga (sin setState síncrono en el efecto).
  const [data, setData] = useState<{ key: Period; orders: PaidOrder[] } | null>(null)
  const now = useMemo(() => new Date(), [])
  const ranges = useMemo(() => Array.from({ length: HISTORY }, (_, i) => periodRange(period, now, HISTORY - 1 - i)), [period, now])

  useEffect(() => {
    void listPaidOrders(toServerDate(ranges[0].start), toServerDate(ranges[HISTORY - 1].end)).then((orders) => setData({ key: period, orders }))
  }, [ranges, period])
  const orders = data?.key === period ? data.orders : null

  if (!catalog) return null
  const s = catalog.settings
  const perRange = ranges.map((r) => metrics((orders ?? []).filter((o) => inRange(o, r)), s, r.days))
  const current = perRange[HISTORY - 1]
  const previous = perRange[HISTORY - 2]
  const history = ranges.map((r, i) => ({ label: r.label.replace(/ \d{4}$/, ''), hoursPer100: perRange[i].hoursPer100 }))
  return (
    <>
      <PageHeader title={t('title')} actions={
        <div role="tablist" aria-label={t('title')} className="flex items-center gap-2">
          {PERIODS.map((p) => <Chip key={p} label={t(`periods.${p}`)} active={period === p} onClick={() => setPeriod(p)} />)}
        </div>
      }>
        <span className="text-[14px] text-soft whitespace-nowrap">{t('subtitle', { period: ranges[HISTORY - 1].label, previous: s.roiStartDate ? ranges[HISTORY - 2].label : t('baseline') })}</span>
      </PageHeader>
      {orders === null ? <p className="px-5 text-soft" role="status">…</p>
        : <RoiBento current={current} history={history} months={monthsOfUse(s.roiStartDate, now)} periodLabel={ranges[HISTORY - 1].label} laborChange={pctChange(current.laborSaving, previous.laborSaving)} />}
    </>
  )
}
