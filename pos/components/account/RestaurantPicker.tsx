'use client'

import { useTranslations } from 'next-intl'

import { Icon } from '@/components/kit/Icon'
import { StatusPill } from '@/components/kit/StatusPill'
import type { Restaurant } from '@/lib/services/restaurants'

// Plan O: cuando la cuenta del terminal opera varios restaurantes, se elige en cuál trabaja este dispositivo antes del
// PIN (la lista de empleados es de cada restaurante). El dueño puede ir en cambio a la consola de la organización.
export function RestaurantPicker({ restaurants, owner, onPick, onConsole }: { restaurants: Restaurant[]; owner: boolean; onPick: (r: Restaurant) => void; onConsole: () => void }) {
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
      {owner && (
        <button type="button" onClick={onConsole} className="min-h-tap flex items-center gap-3 rounded-lg border border-brand-500/40 bg-brand-50 px-4 py-3 text-left">
          <span className="w-10 h-10 shrink-0 rounded-md bg-surface text-primary grid place-items-center"><Icon name="layout" size={20} /></span>
          <span className="min-w-0"><span className="block font-semibold text-ink">{t('console')}</span><span className="block text-[13px] text-soft">{t('consoleHint')}</span></span>
        </button>
      )}
    </section>
  )
}
