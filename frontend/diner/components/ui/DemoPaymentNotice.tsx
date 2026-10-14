 'use client'
import { useTranslations } from 'next-intl'
import { useDinerStore } from '@/lib/stores/dinerStore'
export function DemoPaymentNotice() {
  const t = useTranslations('diner.pay')
  const { demoSession, session, order } = useDinerStore()
  return demoSession && demoSession === session?.id && order?.estado !== 'pagado'
    ? <p role="status" className="p-3 text-t-tinta bg-t-superficie border border-t-borde">{t('pendingDemo')}</p> : null
}
