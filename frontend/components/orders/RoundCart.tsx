'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { templateImage } from '@/components/orders/format'
import { formatCop } from '@/lib/domain/money'
import type { DraftLine } from '@/lib/domain/order'
import type { Product } from '@/lib/types'

interface Props {
  lines: DraftLine[]; totals: { subtotal: number; tax: number; total: number }; busy: boolean; productOf: (id: number) => Product | undefined
  onQty: (uuid: string, qty: number) => void; onNote: (uuid: string) => void; onRemove: (uuid: string) => void; onReset: () => void; onSend: () => void
}

// Panel "New Order" del kit: líneas de la ronda con lápiz, stepper y borrar; "Reiniciar"; totales reales y "Guardar y enviar a cocina".
export function RoundCart({ lines, totals, busy, productOf, onQty, onNote, onRemove, onReset, onSend }: Props) {
  const t = useTranslations('orders.addRound')
  return (
    <aside aria-label={t('cart')} className="rounded-lg border border-border bg-surface flex flex-col min-h-0">
      <header className="px-4 h-16 flex items-center justify-between border-b border-border shrink-0">
        <span className="inline-flex items-center gap-2 text-[17px] font-semibold text-ink"><Icon name="orders" size={20} />{t('cart')}</span>
        <button type="button" onClick={onReset} disabled={lines.length === 0} className="h-10 px-3 rounded-md border border-border text-[14px] font-semibold text-ink inline-flex items-center gap-1.5 disabled:opacity-40"><Icon name="trash" size={16} />{t('reset')}</button>
      </header>
      <ul className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3">
        {lines.length === 0 && <li className="py-10 text-center text-[14px] text-soft">{t('empty')}</li>}
        {lines.map((l) => {
          const p = productOf(l.productId)
          return (
            <li key={l.uuid} aria-label={l.name} className="rounded-md border border-border p-3 flex flex-col gap-3 shrink-0">
              <div className="flex gap-3">
                <span className="w-20 h-20 rounded-sm bg-muted overflow-hidden shrink-0 grid place-items-center text-dim">{p?.hasImage ? <img src={templateImage(p.templateId)} alt="" className="w-full h-full object-cover" /> : <Icon name="photo" size={22} />}</span>
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <span className="text-[15px] font-semibold text-ink">{l.name}</span>
                  {l.note && <span className="text-[13px] text-soft">{t('note')} {l.note}</span>}
                </div>
                <button type="button" onClick={() => onRemove(l.uuid)} aria-label={`${t('remove')} ${l.name}`} className="w-8 h-8 rounded-sm bg-danger text-white grid place-items-center shrink-0"><Icon name="trash" size={16} /></button>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="text-[15px] font-semibold text-ink tabular">$ {formatCop(l.unitPrice * l.qty)}</span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onNote(l.uuid)} aria-label={`${t('edit')} ${l.name}`} className="w-9 h-9 rounded-sm border border-border grid place-items-center text-ink"><Icon name="edit" size={16} /></button>
                  <div className="inline-flex items-center rounded-sm border border-border overflow-hidden">
                    <button type="button" onClick={() => onQty(l.uuid, l.qty - 1)} aria-label={`${t('decrease')} ${l.name}`} className="w-9 h-9 grid place-items-center text-ink"><Icon name="minus" size={16} /></button>
                    <span className="w-9 text-center text-[15px] font-semibold text-ink tabular border-x border-border leading-9">{l.qty}</span>
                    <button type="button" onClick={() => onQty(l.uuid, l.qty + 1)} aria-label={`${t('increase')} ${l.name}`} className="w-9 h-9 grid place-items-center text-ink"><Icon name="plus" size={16} /></button>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
      <div className="m-3 mt-0 p-4 rounded-md bg-muted flex flex-col gap-1.5 shrink-0">
        <div className="flex justify-between text-[14px] text-soft"><span>{t('subtotal')}</span><span className="tabular text-ink">$ {formatCop(totals.subtotal)}</span></div>
        <div className="flex justify-between text-[14px] text-soft"><span>{t('tax')}</span><span className="tabular text-ink">$ {formatCop(totals.tax)}</span></div>
        <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-dashed border-border"><span className="text-[15px] font-semibold text-ink">{t('total')}</span><span className="text-[20px] font-semibold text-ink tabular">$ {formatCop(totals.total)}</span></div>
      </div>
      <div className="px-3 pb-3 shrink-0">
        <button type="button" onClick={onSend} disabled={busy || lines.length === 0} className="w-full h-12 rounded-md bg-primary text-primary-ink text-[16px] font-bold disabled:opacity-40">{t('send')}</button>
      </div>
    </aside>
  )
}
