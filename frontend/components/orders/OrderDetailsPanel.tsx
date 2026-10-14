'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { Stepper } from '@/components/orders/Stepper'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { additionNames, lineSubtotal, type CartLine, type CartTotals } from '@/lib/domain/orderWizard'

interface Props {
  lines: CartLine[]; totals: CartTotals; busy?: boolean
  onReset: () => void; onQty: (uuid: string, qty: number) => void; onEdit: (uuid: string) => void; onRemove: (uuid: string) => void; onContinue: () => void
  // Reservas: los platos son opcionales. Con `emptyLabel` el botón deja continuar sin ninguno y lo dice.
  emptyLabel?: string
}

// Panel derecho de "Select Menu" (Menu Filled.png): Reiniciar, líneas con nota/adición, editar, stepper, borrar y totales reales.
export function OrderDetailsPanel({ lines, totals, busy = false, onReset, onQty, onEdit, onRemove, onContinue, emptyLabel }: Props) {
  const t = useTranslations('orders.create')
  return (
    <section aria-label={t('orderDetails')} className="w-[400px] shrink-0 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
      <header className="h-[76px] px-5 flex items-center justify-between border-b border-border shrink-0">
        <span className="flex items-center gap-2 text-[18px] font-semibold text-ink"><Icon name="orders" size={20} />{t('orderDetails')}</span>
        <Button variant="secondary" size="compact" className="rounded-md" onClick={onReset} disabled={lines.length === 0}><Icon name="trash" size={16} />{t('resetOrder')}</Button>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {lines.length === 0
          ? <KitEmptyState icon="cart" title={t('noOrder')} body={t('noOrderBody')} />
          : (
            <ul>
              {lines.map((line) => (
                <li key={line.uuid} className="px-4 py-3 border-b border-border flex flex-col gap-2.5">
                  <div className="flex items-start gap-3">
                    <span className="w-[68px] h-[52px] rounded-md bg-muted overflow-hidden grid place-items-center text-dim shrink-0">
                      {line.hasImage
                        ? <img src={imageUrl(line.templateId)} alt={t('photo', { name: line.name })} className="w-full h-full object-cover" />
                        : <Icon name="photo" size={20} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-ink truncate">{line.name}</p>
                      {line.note && <p className="text-[13px] text-dim truncate">{t('note')} {line.note}</p>}
                      {line.options.length > 0 && <p className="text-[13px] text-dim truncate">{t('addition')} {additionNames(line)}</p>}
                    </div>
                    <button type="button" aria-label={t('remove')} onClick={() => onRemove(line.uuid)} className="w-9 h-9 rounded-md bg-danger-soft text-danger-ink grid place-items-center shrink-0"><Icon name="trash" size={18} /></button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-ink tabular-nums">$ {formatCop(lineSubtotal(line))}</span>
                    <div className="flex items-center gap-2">
                      <button type="button" aria-label={t('edit')} onClick={() => onEdit(line.uuid)} className="w-9 h-9 rounded-sm border border-border text-soft grid place-items-center"><Icon name="edit" size={16} /></button>
                      <Stepper value={line.qty} onChange={(q) => onQty(line.uuid, q)} min={1} max={99} size="sm" lessLabel={t('less')} moreLabel={t('more')} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
      </div>

      <footer className="shrink-0 border-t border-border">
        <dl className="m-4 p-4 rounded-md bg-muted flex flex-col gap-2 text-[15px]">
          <div className="flex justify-between"><dt className="text-soft">{t('subtotal')}</dt><dd className="text-ink tabular-nums">$ {formatCop(totals.subtotal)}</dd></div>
          <div className="flex justify-between"><dt className="text-soft">{totals.taxNames.length ? t('taxNamed', { name: totals.taxNames.join(' · ') }) : t('tax')}</dt><dd className="text-ink tabular-nums">$ {formatCop(totals.tax)}</dd></div>
          <div className="pt-2 border-t border-dashed border-border flex justify-between"><dt className="font-semibold text-ink">{t('totalPayment')}</dt><dd className="text-[18px] font-bold text-ink tabular-nums">$ {formatCop(totals.total)}</dd></div>
        </dl>
        <div className="px-4 pb-4">
          <Button variant="primary" className="w-full rounded-md" disabled={(lines.length === 0 && !emptyLabel) || busy} onClick={onContinue}>{lines.length === 0 && emptyLabel ? emptyLabel : t('continue')}</Button>
        </div>
      </footer>
    </section>
  )
}
