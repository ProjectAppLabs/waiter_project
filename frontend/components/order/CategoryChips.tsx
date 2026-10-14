'use client'

import { useTranslations } from 'next-intl'

import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props { categories: Category[]; counts: Record<number, number>; soldOut?: number; activeId: number | null; onChange: (id: number | null) => void }

export function CategoryChips({ categories, counts, soldOut = 0, activeId, onChange }: Props) {
  const t = useTranslations('pos.order')
  return (
    <div className="px-6 pt-4.5 pb-3.5 flex gap-2 flex-wrap border-b border-muted">
      {categories.map((c) => (
        <button key={c.id} type="button" onClick={() => onChange(c.id === activeId ? null : c.id)}
          className={cn('h-tap-min px-4.5 rounded-full text-base grid place-items-center', c.id === activeId ? 'bg-brand-500 text-white font-bold' : 'bg-surface border border-border')}>
          {c.name} {counts[c.id] ?? 0}
        </button>
      ))}
      {soldOut > 0 && <span className="h-tap-min px-4.5 rounded-full text-base grid place-items-center bg-muted border border-dashed border-border text-ink-3">{t('soldOutChip', { count: soldOut })}</span>}
    </div>
  )
}
