'use client'

import { useTranslations } from 'next-intl'

import { PageTitle } from '@/components/ui/PageHeader'
import { Icon, type KitIcon } from '@/components/kit/Icon'
import type { PantryTab } from '@/lib/stores/pantryStore'
import { cn } from '@/lib/utils'

const TABS: PantryTab[] = ['menu', 'ingredients', 'requests']

// Título de la vista, pestañas de contenido, buscador y acción principal.
export function PantryHeader({ tab, onTab, query, onQuery, searchPlaceholder, action, actionIcon = 'plus', onAction }: {
  tab: PantryTab; onTab: (t: PantryTab) => void; query: string; onQuery: (q: string) => void; searchPlaceholder: string
  action?: string; actionIcon?: KitIcon; onAction?: () => void
}) {
  const t = useTranslations('pantry')
  return (
    <div className="shrink-0 min-h-[88px] px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <PageTitle>{t('title')}</PageTitle>
      <div role="tablist" aria-label={t('title')} className="flex items-center gap-2">
        {TABS.map((x) => (
          <button key={x} type="button" role="tab" aria-selected={x === tab} onClick={() => onTab(x)}
            className={cn('h-11 px-4 rounded-md border border-border bg-surface text-[15px] font-semibold', x === tab ? 'text-ink' : 'text-dim hover:text-soft')}>{t(`tabs.${x}`)}</button>
        ))}
      </div>
      <div className="ml-auto max-sm:w-full flex flex-wrap items-center gap-4">
        <label className="h-11 w-full sm:w-[320px] px-3.5 rounded-md border border-border bg-surface flex items-center gap-2.5 text-soft">
          <Icon name="search" size={20} />
          <input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder}
            className="flex-1 min-w-0 bg-transparent text-[15px] text-ink placeholder:text-dim outline-none" />
        </label>
        {action && (
          <>
            <span className="w-px h-8 bg-border max-sm:hidden" aria-hidden />
            <button type="button" onClick={onAction} className="h-11 px-4 rounded-md bg-primary text-primary-ink text-[15px] font-semibold flex items-center gap-2">
              <Icon name={actionIcon} size={20} />{action}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
