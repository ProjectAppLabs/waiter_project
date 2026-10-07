'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'

export interface PaidSummary { total: number; methodName: string; received: number; change: number }

// "Payment Successful!" del kit (Cash / Success Payment.png).
//
// Lo que el cajero necesita de esta pantalla es UNA cosa: cuánto le devuelve al cliente. Por eso el cambio
// es lo más grande del aviso y no una fila más de la lista. Las dos acciones van a altura de botón de dinero
// (`size="money"`), con el icono a la escala del texto: antes eran iconos de 18 px perdidos en el botón.
export function PaymentSuccess({ summary, onPrint, onDone }: { summary: PaidSummary; onPrint: () => void; onDone: () => void }) {
  const t = useTranslations('payment')
  const hasChange = summary.change > 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/60 p-6">
      <div role="dialog" aria-modal="true" aria-label={t('successTitle')} className="w-full min-w-0 max-w-[480px] max-h-[calc(100dvh-3rem)] bg-surface rounded-xl shadow-xl overflow-y-auto">
        <div className="px-6 pt-8 pb-5 flex flex-col items-center gap-2 text-center">
          <span className="w-[76px] h-[76px] rounded-full bg-primary text-primary-ink grid place-items-center"><Icon name="check" size={38} /></span>
          <p className="mt-2 text-[20px] font-semibold text-ink">{t('successTitle')}</p>
          <p className="text-[14px] text-dim">{t('successBody')}</p>
        </div>

        {/* El cambio manda: es la acción física que sigue. */}
        <div className={`mx-6 mb-5 px-5 py-4 rounded-lg text-center ${hasChange ? 'bg-primary-soft border border-primary/30' : 'bg-muted border border-border'}`}>
          <p className="text-[15px] font-semibold text-ink">{hasChange ? t('changeToGive') : t('noChange')}</p>
          {hasChange && <p aria-label={t('change')} className="mt-1 text-[40px] leading-none font-bold text-ink tabular-nums">$ {formatCop(summary.change)}</p>}
        </div>

        <div className="px-6 py-3.5 border-y border-border"><p className="text-[16px] font-semibold text-ink">{t('paymentDetails')}</p></div>
        <dl className="px-6 py-4 flex flex-col gap-2.5 text-[15px]">
          <div className="flex justify-between"><dt className="text-soft">{t('totalPayment')}</dt><dd className="text-ink tabular-nums">$ {formatCop(summary.total)}</dd></div>
          <div className="flex justify-between"><dt className="text-soft">{t('paymentMethod')}</dt><dd className="text-primary font-semibold">{summary.methodName}</dd></div>
          <div className="flex justify-between"><dt className="text-soft">{t('customerPays')}</dt><dd className="text-ink tabular-nums">$ {formatCop(summary.received)}</dd></div>
        </dl>

        <div className="p-5 pt-0 flex gap-3">
          <Button size="money" className="flex-1 rounded-md" onClick={onPrint}><Icon name="printer" size={24} />{t('printBill')}</Button>
          <Button size="money" variant="primary" className="flex-1 rounded-md" onClick={onDone}><Icon name="check" size={24} />{t('paymentDone')}</Button>
        </div>
      </div>
    </div>
  )
}
