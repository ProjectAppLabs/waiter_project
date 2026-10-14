'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import type { Restaurant } from '@/lib/services/restaurants'

// Plan P: el encargado de varios restaurantes elige en cuál trabaja ahora; el dispositivo lo recuerda para la próxima vez.
// El dueño no pasa por aquí: va a su consola y entra al POS de cada restaurante desde allí.
export function RestaurantPicker({ restaurants, onPick }: { restaurants: Restaurant[]; onPick: (r: Restaurant) => void }) {
  const t = useTranslations('account.restaurant')
  return (
    <section className="w-[520px] max-w-full flex flex-col gap-4">
      <div className="text-center">
        <h1 className="text-[24px] font-semibold text-ink">{t('title')}</h1>
        <p className="mt-1 text-[16px] text-dim">{t('subtitle')}</p>
      </div>
      <ul aria-label={t('list')} className="flex flex-col gap-2">
        {restaurants.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onPick(r)} className="w-full min-h-tap flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left hover:border-primary">
              <span className="w-10 h-10 shrink-0 rounded-md bg-primary-soft text-primary grid place-items-center"><Icon name="store" size={20} /></span>
              <span className="min-w-0 flex-1"><span className="block font-semibold text-ink truncate">{r.name}</span>
                {(r.street || r.city) && <span className="block text-[13px] text-soft truncate">{[r.street, r.city].filter(Boolean).join(' · ')}</span>}</span>
              <StatusPill tone={r.open ? 'success' : 'neutral'}>{r.open ? t('open') : t('closed')}</StatusPill>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
