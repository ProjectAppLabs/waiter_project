'use client'

import { useTranslations } from 'next-intl'

import type { HistoryProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { AccountOrder } from '@/lib/types'

const dateLabel = (iso: string) => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }).format(new Date(iso)).replace(' de ', ' ').replace('.', '')

// Historial · patrón «tablaCufe» (reutilizable por cualquier plantilla; solo tokens --t-*). Tabla de tres columnas (Fecha 74 px en mono /
// Pedido con segunda línea «CUFE disponible» o «Factura pendiente» / Total 92 px en mono a la derecha) con cabecera en versalitas sobre la
// superficie; pie con «Volver a pedir» (el pedido más reciente con líneas). El perfil (avatar, nombre, cifras) lo pinta AccountHome, igual para
// las 30, así que aquí no se repite. «Facturas» del marco no tiene acción todavía (no hay CUFE real): no se dibuja un botón que no hace nada.
export function TablaCufeHistory({ orders, onReorder }: HistoryProps) {
  const t = useTranslations('diner.account.history')
  const tt = useTranslations('diner.templates.tablaCufe')
  const sorted = [...orders].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const reorderable = sorted.find((o) => o.lineas && o.lineas.length > 0)
  const grid = 'grid grid-cols-[74px_minmax(0,1fr)_92px] gap-2.5 px-5'
  const what = (o: AccountOrder) => {
    const lines = o.lineas ?? []
    const first = lines[0]
    if (first) return lines.length > 1 ? tt('more', { name: first.nombre, n: lines.length - 1 }) : first.nombre
    return o.mesa !== null ? tt('items', { n: o.items, table: o.mesa }) : tt('itemsNoTable', { n: o.items })
  }
  return (
    <section className="flex flex-col text-t-tinta">
      <div className="px-5 pt-[22px] pb-3 flex items-baseline justify-between gap-3">
        <h2 className="t-title text-[18px] leading-tight">{t('title')}</h2>
        <span className="text-[14px] text-t-tinta-suave">{t('summary', { n: orders.length })}</span>
      </div>
      <div role="table" aria-label={t('title')} className="flex flex-col">
        <div role="row" className={`${grid} py-[11px] bg-t-superficie border-b border-t-borde text-[12px] tracking-[0.1em] uppercase font-medium text-t-tinta-suave`}>
          <span role="columnheader">{tt('date')}</span><span role="columnheader">{tt('order')}</span><span role="columnheader" className="text-right">{tt('total')}</span>
        </div>
        {sorted.map((o) => (
          <div key={o.id} role="row" className={`${grid} py-[13px] border-b border-t-borde items-center text-[15px]`}>
            <span role="cell" className="font-t-mono tabular text-[13px] text-t-tinta-suave">{dateLabel(o.fecha)}</span>
            <span role="cell" className="min-w-0 flex flex-col">
              <span className="truncate">{what(o)}</span>
              <span className={`text-[12px] ${o.estado === 'pagado' ? 'text-free' : 'text-t-tinta-suave'}`}>{o.estado === 'pagado' ? tt('cufe') : tt('pending')}</span>
            </span>
            <span role="cell" className="font-t-mono tabular text-[14px] text-right">{formatCop(o.total)}</span>
          </div>
        ))}
      </div>
      {reorderable && (
        <div className="px-5 py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-1.5">
          <button type="button" onClick={() => onReorder(reorderable)} className="h-[50px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[15px] font-medium">{tt('reorder')}</button>
          <span className="text-center text-[12px] text-t-tinta-terciaria">{tt('reorderHint')}</span>
        </div>
      )}
    </section>
  )
}
