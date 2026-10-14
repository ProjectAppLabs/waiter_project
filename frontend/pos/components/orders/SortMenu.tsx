'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import type { OrdersSort } from '@/lib/domain/orderState'
import { cn } from '@/lib/utils'

const SORTS: OrdersSort[] = ['latest', 'oldest', 'type']

// "Sort by: Latest Order ⌄" del kit (Order / Sorting.png): botón con borde y menú flotante con el check en la opción activa.
export function SortMenu({ value, onChange }: { value: OrdersSort; onChange: (v: OrdersSort) => void }) {
  const t = useTranslations('orders')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="h-11 px-4 rounded-md border border-border bg-surface text-[15px] font-semibold text-ink inline-flex items-center gap-2">
        {t('sortBy', { label: t(`sort.${value}`) })}<Icon name="chevronDown" size={18} />
      </button>
      {open && (
        <ul role="menu" aria-label={t('sortMenu')} className="absolute right-0 top-[52px] z-20 w-[210px] p-2 rounded-md bg-surface border border-border shadow-lg">
          {SORTS.map((s) => (
            <li key={s} role="none">
              <button type="button" role="menuitemradio" aria-checked={s === value} onClick={() => { onChange(s); setOpen(false) }}
                className={cn('w-full h-10 px-3 rounded-sm flex items-center justify-between text-[15px]', s === value ? 'text-primary font-semibold' : 'text-ink hover:bg-muted')}>
                {t(`sort.${s}`)}{s === value && <Icon name="check" size={18} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
