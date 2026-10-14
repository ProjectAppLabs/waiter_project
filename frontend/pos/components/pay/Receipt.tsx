'use client'

import { printReceipt } from '@/lib/print/settings'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { useIssuer } from '@/lib/services/issuer'
import type { ReceiptData } from '@/lib/stores/orderStore'

// Cuenta de cobro del cliente, compuesta para rodillo térmico de 80 mm (ver el bloque `@media print` de
// globals.css: al imprimir solo `.receipt` queda visible y todo se fuerza a negro sobre blanco).
//
// La térmica solo quema o no quema: no hay grises ni color. Por eso aquí no se usan tonos suaves para la
// jerarquía —se usan mayúsculas, negrita y espacio— y los separadores son líneas discontinuas negras.
// La marca es tipográfica a propósito: un logo ráster sale con bandas en estos rodillos.
const RULE = 'border-t border-dashed border-ink/60 my-1'
const ROW = 'flex justify-between gap-2'

// En Colombia el precio que ve el cliente YA lleva el IVA dentro (a diferencia de Estados Unidos, donde se
// suma al final). Así que cada línea se imprime por lo que realmente se cobra —`l.total`, con impuesto—, la
// suma de las líneas es el total, y el IVA se declara aparte como "incluido": informa, no suma.
const lineCharged = (l: ReceiptData['lines'][number]) =>
  l.total ?? l.qty * l.unitPrice * (1 - (l.discount ?? 0) / 100)

export function Receipt({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  const t = useTranslations('pos.pay.receipt')
  const issuer = useIssuer()
  const at = new Date(data.at)
  const discount = data.lines.reduce((a, l) => a + l.qty * l.unitPrice * (l.discount ?? 0) / 100, 0)
  // La tarifa se deduce de lo cobrado (665 sobre una base de 3.500 → 19 %) en vez de darla por sentada: cada
  // restaurante tiene sus propios impuestos y posiciones fiscales, y hay carta con IVA e INC mezclados.
  // Si no da un porcentaje limpio, el papel dice "IVA incluido" a secas antes que inventar una cifra.
  const base = data.total - data.tax - data.tip
  const rate = base > 0 ? Math.round((data.tax / base) * 100) : 0
  const vatRate = rate > 0 && Math.abs(base * rate / 100 - data.tax) <= 1 ? rate : null

  return (
    <aside aria-label={t('title')} className="w-panel-lg shrink-0 border-l border-border bg-surface flex flex-col">
      <div className="receipt flex-1 min-h-0 overflow-y-auto px-[22px] py-5 font-mono text-[13px] leading-snug text-ink">

        {/* Emisor */}
        <header className="text-center flex flex-col">
          <span className="font-sans text-[17px] font-bold uppercase tracking-wide">{data.company}</span>
          {issuer?.vat && <span>{t('vat')} {issuer.vat}</span>}
          {issuer?.street && <span>{[issuer.street, issuer.city].filter(Boolean).join(' · ')}</span>}
          {issuer?.phone && <span>{issuer.phone}</span>}
        </header>

        {/* Documento */}
        <p className="mt-3 text-center font-sans font-bold tracking-[0.18em] uppercase">{t('title')}</p>
        <p className="text-center">{t('number')} {data.reference}</p>
        <div className={`${ROW} mt-1`}>
          <span>{at.toLocaleDateString('es-CO')}</span>
          <span>{at.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        {(data.tableLabel || data.tableNumber > 0) && <p>{data.tableLabel ?? t('table', { n: data.tableNumber })}</p>}

        {/* Consumo */}
        <div className={RULE} />
        <div className={`${ROW} font-semibold uppercase text-[12px]`}>
          <span>{t('columnItem')}</span><span>{t('columnAmount')}</span>
        </div>
        <div className={RULE} />
        <ul>
          {data.lines.map((l) => (
            <li key={l.uuid} className="mb-0.5">
              <span className="block">{l.qty} × {l.name}</span>
              <span className={`${ROW} tabular-nums`}>
                <span className="pl-4 text-[12px]">{formatCop(lineCharged(l) / l.qty)} c/u</span>
                <span>{formatCop(lineCharged(l))}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Totales. El consumo solo se separa del total cuando hay propina: si no, sería la misma cifra dos veces. */}
        <div className={RULE} />
        {discount > 0 && <div className={`${ROW} tabular-nums`}><span>{t('discountIncluded')}</span><span>−{formatCop(discount)}</span></div>}
        {data.tip > 0 && (
          <>
            <div className={`${ROW} tabular-nums`}><span>{t('consumption')}</span><span>{formatCop(data.total - data.tip)}</span></div>
            <div className={`${ROW} tabular-nums`}><span>{t('tip')}</span><span>{formatCop(data.tip)}</span></div>
          </>
        )}
        <div className="border-t-2 border-ink my-1" />
        <div className={`${ROW} font-sans text-[16px] font-bold tabular-nums`}>
          <span>{t('total')}</span><span>$ {formatCop(data.total)}</span>
        </div>
        {/* El IVA no se suma: ya va dentro de los precios de arriba. Se declara para que el cliente lo vea. */}
        {data.tax > 0 && (
          <div className={`${ROW} text-[12px] tabular-nums`}>
            <span>{vatRate ? t('taxIncludedAt', { rate: vatRate, name: vatRate === 8 ? 'INC' : 'IVA' }) : t('taxIncluded')}</span><span>{formatCop(data.tax)}</span>
          </div>
        )}

        {/* Pago */}
        {(data.payments.length > 0 || data.change > 0) && <div className={RULE} />}
        {data.payments.map((p, i) => (
          <div key={i} className={`${ROW} tabular-nums`}>
            <span>{p.method}{p.reference && ` · ${p.reference}`}</span><span>{formatCop(p.amount)}</span>
          </div>
        ))}
        {data.change > 0 && (
          <div className={`${ROW} font-semibold tabular-nums`}><span>{t('change')}</span><span>{formatCop(data.change)}</span></div>
        )}

        {/* Pie */}
        <div className={RULE} />
        <p className="text-center">{t('thanks')}</p>
        <p className="mt-3 text-center font-sans text-[15px] font-bold tracking-[-0.02em]">Waiter.</p>
        <p className="text-center text-[11px]">by ProjectApp</p>
      </div>

      <footer className="px-[22px] py-4 border-t border-border bg-canvas flex gap-2.5 print:hidden">
        <Button className="flex-1" onClick={printReceipt}>{t('print')}</Button>
        <Button variant="primary" className="flex-1" onClick={onClose}>{t('close')}</Button>
      </footer>
    </aside>
  )
}
