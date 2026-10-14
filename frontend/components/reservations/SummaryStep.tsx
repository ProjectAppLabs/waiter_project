'use client'

import { imageUrl } from '@/lib/services/pantry'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import { additionNames, lineSubtotal, type CartLine, type CartTotals } from '@/lib/domain/orderWizard'
import { MAX_DEPOSIT, depositReady, hourLabel, tablesLabel, type ReservationDraft } from '@/lib/domain/reservations'

// Paso 4 del kit (Reservation Summary.png): los platos pre-pedidos a la izquierda y la ficha de la reserva
// a la derecha. El ID lo asigna el servidor al crearla.
export function SummaryStep({ draft, tableNumbers, lines, totals, busy, onCreate, onChange }: {
  draft: ReservationDraft; tableNumbers: (number | string)[]; lines: CartLine[]; totals: CartTotals; busy: boolean; onCreate: () => void
  onChange: (patch: Partial<ReservationDraft>) => void
}) {
  const t = useTranslations('reservations.summary')
  const rows: [string, string, 'hash' | 'user' | 'reservations' | 'clock' | 'tables' | 'babyChair' | 'mail' | 'phone'][] = [
    [t('id'), t('idPending'), 'hash'],
    [t('customer'), draft.customerName, 'user'],
    [t('date'), draft.date ? new Date(`${draft.date}T00:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '—', 'reservations'],
    [t('time'), draft.timeStart !== null ? hourLabel(draft.timeStart) : '—', 'clock'],
    [t(tableNumbers.length > 1 ? 'tables' : 'table'), tablesLabel(tableNumbers), 'tables'],
    [t('people'), String(draft.people), 'user'],
    [t('babyChair'), draft.babyChair ? t('yes') : t('no'), 'babyChair'],
    ...(draft.customerEmail ? ([[t('email'), draft.customerEmail, 'mail']] as typeof rows) : []),
    ...(draft.customerPhone ? ([[t('phone'), draft.customerPhone, 'phone']] as typeof rows) : []),
  ]

  return (
    <div className="flex-1 min-h-0 flex gap-6 p-6 overflow-hidden">
      <section className="flex-1 min-w-0 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
        <h2 className="h-14 px-5 flex items-center text-[17px] font-semibold text-ink border-b border-border">{t('dishes')}</h2>
        <div className="flex-1 min-h-0 overflow-auto p-5">
          {lines.length === 0
            ? <p className="text-[15px] text-dim">{t('noDishes')}</p>
            : (
              <div className="grid grid-cols-2 gap-3">
                {lines.map((line) => (
                  <article key={line.uuid} className="p-3 rounded-md border border-border flex gap-3">
                    <span className="w-14 h-14 shrink-0 rounded-sm bg-muted overflow-hidden grid place-items-center text-dim">
                      {line.hasImage ? <img src={imageUrl(line.templateId, 256)} alt="" className="w-full h-full object-cover" /> : <Icon name="photo" size={20} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-ink truncate">{line.name}</span>
                      {line.options.length > 0 && <span className="block text-[13px] text-soft truncate">{t('addition', { list: additionNames(line) })}</span>}
                      {line.note && <span className="block text-[13px] text-soft truncate">{t('note', { note: line.note })}</span>}
                      <span className="block mt-1 text-[15px] font-semibold text-ink">{formatCop(lineSubtotal(line))}</span>
                    </span>
                    <span className="self-start h-7 px-2 rounded-sm bg-muted text-[13px] font-semibold text-soft grid place-items-center">x{line.qty}</span>
                  </article>
                ))}
              </div>
            )}
        </div>
        {lines.length > 0 && (
          <footer className="px-5 py-4 border-t border-border flex flex-col gap-2 text-[15px]">
            <span className="flex justify-between text-soft">{t('subtotal')}<span className="tabular">{formatCop(totals.subtotal)}</span></span>
            <span className="flex justify-between text-soft">{totals.taxNames.join(' · ') || t('tax')}<span className="tabular">{formatCop(totals.tax)}</span></span>
            <span className="flex justify-between text-[17px] font-semibold text-ink">{t('total')}<span className="tabular">{formatCop(totals.total)}</span></span>
          </footer>
        )}
      </section>

      <section className="w-[400px] shrink-0 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
        <h2 className="h-14 px-5 flex items-center text-[17px] font-semibold text-ink border-b border-border">{t('details')}</h2>
        <dl className="flex-1 min-h-0 overflow-auto p-5 flex flex-col gap-4">
          {rows.map(([label, value, icon]) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <dt className="flex items-center gap-2 text-[15px] text-dim"><Icon name={icon} size={16} />{label}</dt>
              <dd className="text-[15px] font-semibold text-ink text-right truncate">{value}</dd>
            </div>
          ))}
        </dl>
        {/* Costo de la reserva: viene activo. Quitarlo es una decisión explícita, no un campo que se olvida en blanco. */}
        <div className="px-5 py-4 border-t border-border flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-ink"><Icon name="banknote" size={18} />{t('deposit')}</h3>
            <button type="button" onClick={() => onChange({ depositEnabled: !draft.depositEnabled })} className="text-[14px] font-semibold text-primary">{draft.depositEnabled ? t('depositRemove') : t('depositRestore')}</button>
          </div>
          {draft.depositEnabled ? (
            <>
              <div className="flex flex-col gap-1.5 text-[13px] font-medium text-soft"><label htmlFor="deposit-amount">{t('depositAmount')}</label>
                <span className="flex items-center h-12 rounded-md border border-border bg-surface focus-within:border-primary">
                  <span className="pl-4 pr-1 text-[17px] font-semibold text-soft">$</span>
                  <input id="deposit-amount" type="number" inputMode="numeric" min={1} max={MAX_DEPOSIT} step={1000} placeholder="50000" value={draft.depositAmount ?? ''}
                    onChange={(e) => onChange({ depositAmount: e.target.value === '' ? null : Number(e.target.value) })}
                    className="flex-1 min-w-0 h-full bg-transparent pr-4 text-[17px] font-semibold text-ink tabular focus:outline-none" />
                </span>
              </div>
              <p className="text-[13px] leading-relaxed text-dim">{depositReady(draft) ? t('depositHint') : t('depositMissing')}</p>
            </>
          ) : <p className="text-[14px] text-soft">{t('depositNone')}</p>}
        </div>
        <div className="p-5 border-t border-border">
          <Button variant="primary" size="money" className="w-full" disabled={busy || !depositReady(draft)} onClick={onCreate}>{t('create')}</Button>
        </div>
      </section>
    </div>
  )
}
