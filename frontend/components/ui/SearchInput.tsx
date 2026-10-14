'use client'

import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

// Buscador del kit: lupa a la izquierda, borde suave, radio 12 (Order / Ipad View.png).
export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <label className={cn('h-12 px-4 rounded-md border border-border bg-surface flex items-center gap-2 text-soft focus-within:border-primary', className)}>
      <Icon name="search" size={20} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="flex-1 min-w-0 bg-transparent text-[15px] text-ink placeholder:text-dim outline-none" />
    </label>
  )
}
