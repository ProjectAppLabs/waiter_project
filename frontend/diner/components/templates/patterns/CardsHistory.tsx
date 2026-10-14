'use client'

import { useTranslations } from 'next-intl'

import type { HistoryProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { AccountOrder } from '@/lib/types'

const dayLabel = (iso: string) => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(iso))
// «Hamburguesa Angus +2» (primer producto y cuántos más) o «4 ítems» cuando el pedido no trae sus líneas.
export function orderSummary(o: AccountOrder, fallback: string): string {
  const first = o.lineas?.[0]
  if (!first) return fallback
  const rest = (o.lineas?.length ?? 1) - 1
  return rest > 0 ? `${first.nombre} +${rest}` : first.nombre
}

// Historial · patrón «tarjetas» (reutilizable por cualquier plantilla; solo tokens): «Mis pedidos» + conteo; una tarjeta por pedido con
// local, «Sáb 16 nov · Hamburguesa Angus +2», total en mono de 19 px y, en la más reciente, «Volver a pedir»; pie con «Volver a pedir»
// del último pedido. «Ver factura» / «Facturas» del marco no se pintan: no hay facturaUrl en los datos (datosOpcionales del spec).
// La cabecera oscura con avatar la pinta AccountHome (igual para las 30).
export function CardsHistory({ orders, onReorder }: HistoryProps) {
  const t = useTranslations('diner.account.history')
  const sorted = [...orders].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const last = sorted.find((o) => o.lineas && o.lineas.length > 0)
  const chip = 'inline-flex items-center h-[26px] px-2 rounded-md text-[12px] font-medium'
  return (
    <section className="flex flex-col text-t-tinta">
      <div className="px-5 pt-[22px] pb-1 flex items-baseline justify-between gap-3">
        <h2 className="t-title text-[18px] leading-tight">{t('title')}</h2>
        <span className="text-[14px] text-t-tinta-suave">{t('summary', { n: orders.length })}</span>
      </div>
      <ul className="px-5 py-4 flex flex-col gap-3">
        {sorted.map((o, i) => (
          <li key={o.id} className="border border-t-borde rounded-t-tarjeta p-[15px] flex flex-col">
            <div className="flex justify-between items-baseline gap-2.5">
              <div className="min-w-0 flex flex-col">
                <span className="t-title text-[16px] leading-[1.15] truncate">{o.local}</span>
                <span className="text-[13px] text-t-tinta-suave mt-[3px]">{dayLabel(o.fecha)} · {orderSummary(o, t('lineNoTable', { date: '', items: o.items }).replace(/^\s*·\s*/, ''))}</span>
              </div>
              <span className="font-t-mono tabular text-[19px] whitespace-nowrap">{formatCop(o.total)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {o.estado === 'pagado' ? <span className={`${chip} bg-free-soft text-free-ink`}>{t('paid')}</span> : <span className={`${chip} bg-pending-soft text-pending-ink`}>{t('pending')}</span>}
              {o.descuento > 0 && <span className={`${chip} bg-t-acento-suave text-t-tinta`}>{t('discount', { amount: formatCop(o.descuento) })}</span>}
            </div>
            {i === 0 && o.lineas && o.lineas.length > 0 && (
              <button type="button" onClick={() => onReorder(o)} className="mt-3 h-[44px] rounded-[10px] bg-t-acento text-t-acento-tinta text-[14px] font-medium">{t('reorder')}</button>
            )}
          </li>
        ))}
      </ul>
      {last && (
        <div className="px-5 py-3.5 border-t border-t-borde bg-t-superficie">
          <button type="button" onClick={() => onReorder(last)} className="w-full h-[50px] rounded-[11px] bg-t-acento text-t-acento-tinta text-[15px] font-medium">{t('reorder')} · {last.local}</button>
        </div>
      )}
    </section>
  )
}
