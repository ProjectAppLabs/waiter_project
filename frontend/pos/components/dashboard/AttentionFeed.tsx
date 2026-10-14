'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { ListSkeleton } from '@/components/kit/Skeleton'
import type { AttentionItem, AttentionKind } from '@/lib/domain/insights'
import { cn } from '@/lib/utils'

const ICON: Record<AttentionKind, KitIcon> = { accessDenied: 'lock', cashDifference: 'scale', ready: 'chef', reservationSoon: 'reservations', depositPending: 'wallet', stockEmpty: 'inventory', stockLow: 'inventory', soldOut: 'alert', stockEmptyMore: 'inventory', stockLowMore: 'inventory', soldOutMore: 'alert' }
const TONE = { danger: 'bg-danger-soft text-danger-ink', warning: 'bg-progress-soft text-progress-ink', info: 'bg-primary-soft text-primary' }

// «Para atender ahora»: lo que pide acción, ya ordenado por urgencia (`attentionItems`). Cada renglón lleva a la pantalla
// donde se resuelve. Vacío no es un hueco: es la buena noticia de que no hay nada pendiente.
export function AttentionFeed({ items, loaded }: { items: AttentionItem[]; loaded: boolean }) {
  const t = useTranslations('dashboard.attention')
  return (
    <section aria-label={t('title')} className="bg-surface border border-border rounded-lg flex flex-col min-h-0 min-w-0">
      <h2 className="px-4 h-16 shrink-0 flex items-center gap-3 text-[17px] font-semibold text-ink border-b border-border">
        {t('title')}{/* El contador solo cuando la lista está completa: a medio cargar contaría de menos. */}{loaded && items.length > 0 && <span className="px-2 py-0.5 rounded-full bg-danger-soft text-danger-ink text-[13px] font-semibold tabular">{items.length}</span>}
      </h2>
      {!loaded ? <ListSkeleton rows={4} label={t('loading')} className="divide-y divide-border" />
        : items.length === 0 ? (
          <div className="flex-1 grid place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-2">
              <span className="w-12 h-12 rounded-full bg-success-soft text-success-ink grid place-items-center"><Icon name="check" size={24} /></span>
              <p className="text-[16px] font-semibold text-ink">{t('emptyTitle')}</p>
              <p className="text-[14px] text-soft max-w-[36ch]">{t('emptyBody')}</p>
            </div>
          </div>
        ) : (
          <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
            {items.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="px-4 py-3 flex items-center gap-3 hover:bg-muted">
                  <span className={cn('w-10 h-10 shrink-0 rounded-md grid place-items-center', TONE[item.tone])}><Icon name={ICON[item.kind]} size={20} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-ink truncate">{t(`${item.kind}.title`, item.values)}</span>
                    <span className="block text-[14px] text-soft truncate">{t(`${item.kind}.body`, item.values)}</span>
                  </span>
                  <Icon name="chevronRight" size={18} className="shrink-0 text-dim" />
                </Link>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
