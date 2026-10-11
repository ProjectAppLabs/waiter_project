'use client'

import { serverDate } from '@/lib/domain/time'
import { useTranslations } from 'next-intl'

import { Card } from '@/components/kit/Card'
import { Icon } from '@/components/kit/Icon'
import { KitEmptyState } from '@/components/kit/KitEmptyState'
import { Button } from '@/components/ui/Button'
import { formatCop } from '@/lib/domain/money'
import type { Customer, CustomerOrder, LoyaltyCard } from '@/lib/services/customers'
import type { CoreCustomerProfile } from '@/lib/services/core/loyalty'
import { CustomerInsights } from '@/components/customers/CustomerInsights'
import { initials } from '@/lib/utils'

interface CustomerPanelProps { customer: Customer | null; loyalty: LoyaltyCard | null | undefined; history: CustomerOrder[]; onEdit: () => void; profile?: CoreCustomerProfile | null }
const day = (at: string) => serverDate(at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

// Panel derecho del kit (Order History / Bill Selected.png): cabecera con avatar, bloques de datos, puntos e historial.
export function CustomerPanel({ customer, loyalty, history, onEdit, profile }: CustomerPanelProps) {
  const t = useTranslations('admin.customers.panel')
  const field = (label: string, value: string) => <div className="min-w-0"><p className="text-[13px] text-soft">{label}</p><p className="text-[15px] text-ink truncate">{value || '—'}</p></div>
  return (
    <Card title={t('title')} className="w-full xl:w-[400px] shrink-0" action={customer ? <Button size="compact" onClick={onEdit}><Icon name="edit" size={18} />{t('edit')}</Button> : undefined}>
      {!customer ? <KitEmptyState icon="user" title={t('empty')} body={t('emptyBody')} /> : (
        <div className="h-full overflow-y-auto flex flex-col">
          <div className="p-5 flex items-center gap-3 border-b border-border">
            <span className="w-12 h-12 rounded-md bg-primary text-primary-ink grid place-items-center text-[16px] font-semibold">{initials(customer.name)}</span>
            <div className="min-w-0"><p className="text-[16px] font-semibold text-ink truncate">{customer.name}</p><p className="text-[13px] text-soft">{customer.vat || customer.email || '—'}</p></div>
            <div className="ml-auto text-right"><p className="text-[13px] text-soft">{t('orders', { n: customer.orders })}</p><p className="text-[15px] font-semibold text-ink tabular">$ {formatCop(customer.invoiced)}</p></div>
          </div>
          <div className="p-5 grid grid-cols-2 gap-4 border-b border-border">
            {field(t('phone'), customer.phone)}
            {field(t('email'), customer.email)}
            {field(t('street'), customer.street)}
            {field(t('city'), customer.city)}
          </div>
          <section aria-label={t('loyalty')} className="p-5 border-b border-border">
            <p className="text-[15px] font-semibold text-ink mb-3">{t('loyalty')}</p>
            {loyalty ? (
              <div className="rounded-md bg-muted p-4 flex items-center gap-4">
                <span className="w-11 h-11 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name="gift" size={22} /></span>
                <div className="min-w-0"><p className="text-[13px] text-soft">{loyalty.program}</p><p className="text-[24px] font-semibold text-ink tabular leading-none">{loyalty.pointsDisplay}</p></div>
                {loyalty.code && <div className="ml-auto text-right"><p className="text-[13px] text-soft">{t('code')}</p><p className="text-[15px] font-semibold text-ink tabular">{loyalty.code}</p></div>}
              </div>
            ) : <div className="rounded-md bg-muted p-4"><p className="text-[15px] font-medium text-ink">{t('noLoyalty')}</p><p className="text-[13px] text-soft">{t('noLoyaltyBody')}</p></div>}
          </section>
          {profile && <CustomerInsights profile={profile} />}
          <section aria-label={t('history')} className="p-5 flex flex-col gap-2">
            <p className="text-[15px] font-semibold text-ink">{t('history')}</p>
            {history.length === 0 && <p className="text-[14px] text-soft">{t('noHistory')}</p>}
            {history.map((o) => <div key={o.id} className="flex justify-between text-[15px] py-2 border-b border-border"><span><span className="font-semibold text-ink">#{o.id}</span> <span className="text-soft">· {day(o.date)}</span></span><span className="font-semibold text-ink tabular">$ {formatCop(o.total)}</span></div>)}
          </section>
        </div>
      )}
    </Card>
  )
}
