'use client'

import { useTranslations } from 'next-intl'

import type { HistoryProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { AccountOrder } from '@/lib/types'

const monthKey = (iso: string) => iso.slice(0, 7)
const monthLabel = (iso: string) => new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(new Date(iso))
const dayLabel = (iso: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', timeZone: 'America/Bogota' }).format(new Date(iso))

// Agrupa los pedidos por mes (los más recientes primero) conservando el orden de llegada dentro del mes.
export function groupByMonth(orders: AccountOrder[]): { key: string; label: string; orders: AccountOrder[] }[] {
  const groups = new Map<string, AccountOrder[]>()
  for (const o of [...orders].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    const k = monthKey(o.fecha)
    groups.set(k, [...(groups.get(k) ?? []), o])
  }
  return Array.from(groups, ([key, list]) => ({ key, label: monthLabel(list[0].fecha), orders: list }))
}

// Historial · patrón «porMes» (Cuenta 4b-5): «Mis pedidos» + conteo; bandas de mes en mayúsculas; por pedido local, total en mono,
// «Sáb 16 · mesa 14 · 3 ítems» y chips (Pagado / −5%); «Volver a pedir» cuando el pedido trae sus líneas.
export function GenericHistory({ orders, onReorder }: HistoryProps) {
  const t = useTranslations('diner.account.history')
  const chip = 'inline-flex items-center h-[26px] px-2 rounded-md text-[12px] font-medium'
  return (
    <section className="flex flex-col text-t-tinta">
      <div className="px-[18px] pt-[22px] pb-3 flex items-baseline justify-between gap-3">
        <h2 className="t-title text-[18px] leading-tight">{t('title')}</h2>
        <span className="text-[14px] text-t-tinta-suave">{t('summary', { n: orders.length })}</span>
      </div>
      {groupByMonth(orders).map((g) => (
        <div key={g.key}>
          <div className="px-[18px] py-1.5 bg-t-superficie text-[12px] tracking-[0.12em] uppercase text-t-tinta-suave">{g.label}</div>
          <ul>
            {g.orders.map((o) => (
              <li key={o.id} className="px-[18px] py-3 border-b border-t-borde flex flex-col gap-1.5">
                <div className="flex justify-between gap-3"><span className="text-[16px] font-medium">{o.local}</span><span className="font-t-mono tabular text-[15px]">$ {formatCop(o.total)}</span></div>
                <span className="text-[13px] text-t-tinta-suave">{o.mesa !== null ? t('line', { date: dayLabel(o.fecha), table: o.mesa, items: o.items }) : t('lineNoTable', { date: dayLabel(o.fecha), items: o.items })}</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {o.estado === 'pagado' ? <span className={`${chip} bg-free-soft text-free-ink`}>{t('paid')}</span> : <span className={`${chip} bg-pending-soft text-pending-ink`}>{t('pending')}</span>}
                  {o.descuento > 0 && <span className={`${chip} bg-t-acento-suave text-[#6B4A05]`}>{t('discount', { amount: formatCop(o.descuento) })}</span>}
                  {o.lineas && o.lineas.length > 0 && <button type="button" onClick={() => onReorder(o)} className="ml-auto h-tap-min px-3 rounded-t-boton bg-t-acento text-t-acento-tinta text-[13px] font-medium">{t('reorder')}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
