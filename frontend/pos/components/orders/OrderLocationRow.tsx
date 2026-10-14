import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import type { OrderLocation } from '@/lib/domain/orderLocation'

export function OrderLocationRow({ location }: { location?: OrderLocation }) {
  const t = useTranslations('orders.location')
  if (!location) return null
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-md bg-muted/60 px-3 py-2.5 text-[13px]">
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-soft"><Icon name="floors" size={16} />{t('floor')}</dt>
        <dd className="mt-1 font-semibold text-ink [overflow-wrap:anywhere]">{location.floor ?? t('unavailable')}</dd>
      </div>
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-soft"><Icon name="zone" size={16} />{t('zone')}</dt>
        <dd className="mt-1 font-semibold text-ink [overflow-wrap:anywhere]">{location.zone ?? t(location.zoneStatus === 'ready' ? 'unavailable' : location.zoneStatus)}</dd>
      </div>
    </dl>
  )
}
