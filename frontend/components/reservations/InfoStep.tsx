'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { Stepper } from '@/components/orders/Stepper'
import { Button } from '@/components/ui/Button'
import { holdLabel, hourLabel, infoStepReady, PREP_CHOICES, type ReservationDraft } from '@/lib/domain/reservations'
import { cn } from '@/lib/utils'

const INPUT = 'h-12 px-4 rounded-md border border-border bg-surface text-[16px] text-ink focus:outline-none focus:border-primary'

// Paso 1 del kit (Fill Customer Information.png): datos del cliente y el botón que abre fecha y hora.
export function InfoStep({ draft, onChange, onPickMoment, onContinue }: {
  draft: ReservationDraft; onChange: (patch: Partial<ReservationDraft>) => void; onPickMoment: () => void; onContinue: () => void
}) {
  const t = useTranslations('reservations.info')
  const moment = draft.date && draft.timeStart !== null
    ? `${new Date(`${draft.date}T00:00:00`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'long' })} · ${hourLabel(draft.timeStart)}`
    : t('pickMoment')

  return (
    <div className="flex-1 min-h-0 overflow-auto grid place-items-start justify-center py-8">
      <div className="w-[560px] flex flex-col gap-5">
        <h2 className="text-[22px] font-semibold text-ink">{t('title')}</h2>

        <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('when')}
          <button type="button" onClick={onPickMoment}
            className={cn('h-12 px-4 rounded-md border border-border bg-surface flex items-center justify-between text-[16px]', draft.date ? 'text-ink' : 'text-dim')}>
            <span className="flex items-center gap-2"><Icon name="reservations" size={18} />{moment}</span>
            <Icon name="chevronRight" size={18} className="text-dim" />
          </button>
        </label>

        <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('name')}
          <input aria-label={t('name')} value={draft.customerName} onChange={(e) => onChange({ customerName: e.target.value })} placeholder={t('namePlaceholder')} className={INPUT} /></label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('email')}
            <input aria-label={t('email')} type="email" value={draft.customerEmail} onChange={(e) => onChange({ customerEmail: e.target.value })} placeholder={t('emailPlaceholder')} className={INPUT} /></label>
          <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('phone')}
            <input aria-label={t('phone')} value={draft.customerPhone} onChange={(e) => onChange({ customerPhone: e.target.value })} placeholder={t('phonePlaceholder')} className={INPUT} /></label>
        </div>

        <div className="flex items-end gap-8">
          <div className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('people')}
            <Stepper value={draft.people} min={1} onChange={(people) => onChange({ people })} lessLabel={t('lessPeople')} moreLabel={t('morePeople')} /></div>
          <div className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('babyChair')}
            <div role="radiogroup" aria-label={t('babyChair')} className="flex gap-2">
              {[false, true].map((value) => (
                <button key={String(value)} type="button" role="radio" aria-checked={draft.babyChair === value} onClick={() => onChange({ babyChair: value })}
                  className={cn('h-12 px-6 rounded-md border text-[15px] font-semibold', draft.babyChair === value ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface border-border text-soft')}>
                  {value ? t('yes') : t('no')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cuánto antes se aparta la mesa. Es tiempo para prepararla, no para el comensal: fuera de esa
            ventana la mesa se usa con normalidad, y por eso una reserva de la noche no mata la mesa al mediodía. */}
        <div className="flex flex-col gap-2">
          <span className="text-[15px] font-medium text-ink">{t('prep')}</span>
          <div role="radiogroup" aria-label={t('prep')} className="flex flex-wrap gap-2">
            {PREP_CHOICES.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={draft.prepMinutes === value} onClick={() => onChange({ prepMinutes: value })}
                className={cn('h-12 px-4 rounded-md border text-[15px] font-semibold', draft.prepMinutes === value ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface border-border text-soft')}>
                {t(`prepChoice.${value}`)}
              </button>
            ))}
          </div>
          <p className="text-[14px] text-soft leading-relaxed">
            {draft.timeStart === null
              ? t('prepHintNoTime')
              : t('prepHint', { from: holdLabel(draft.timeStart, draft.prepMinutes), to: hourLabel(draft.timeStart) })}
          </p>
        </div>

        <label className="flex flex-col gap-2 text-[15px] font-medium text-ink">{t('notes')}
          <textarea aria-label={t('notes')} value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} rows={2} placeholder={t('notesPlaceholder')}
            className="px-4 py-3 rounded-md border border-border bg-surface text-[16px] text-ink focus:outline-none focus:border-primary resize-none" /></label>

        <Button variant="primary" size="money" className="self-start px-8" disabled={!infoStepReady(draft)} onClick={onContinue}>
          {t('continue')}<Icon name="arrowRight" size={18} />
        </Button>
      </div>
    </div>
  )
}
