'use client'

import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

// Stepper del kit (Dine In Selected.png): "−" sobre gris, número, "+" con borde. Tamaño compacto para las líneas del carrito.
export function Stepper({ value, onChange, min = 1, max = 99, lessLabel, moreLabel, size = 'md' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; lessLabel: string; moreLabel: string; size?: 'md' | 'sm' }) {
  const cell = size === 'md' ? 'w-10 h-9' : 'w-9 h-9'
  return (
    <div className="inline-flex items-center gap-2">
      <button type="button" aria-label={lessLabel} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className={cn(cell, 'rounded-sm bg-muted text-ink grid place-items-center disabled:opacity-40')}><Icon name="minus" size={18} /></button>
      <span className="min-w-8 text-center text-[16px] font-semibold text-ink tabular-nums">{value}</span>
      <button type="button" aria-label={moreLabel} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className={cn(cell, 'rounded-sm border border-border bg-surface text-ink grid place-items-center disabled:opacity-40')}><Icon name="plus" size={18} /></button>
    </div>
  )
}
