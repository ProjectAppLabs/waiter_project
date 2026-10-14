import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Tarjeta de indicador del diseño 1e: etiqueta en mayúsculas y valor mono de 24 px. tone="busy" para lo que duele.
export function KpiCard({ label, value, hint, tone = 'neutral', className }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'busy' | 'brand'; className?: string }) {
  return (
    <div className={cn('rounded-[14px] bg-surface border p-4 flex flex-col gap-2', tone === 'busy' ? 'border-danger/40' : tone === 'brand' ? 'bg-brand-50 border-primary/30' : 'border-border', className)}>
      <span className={cn('text-[13px] tracking-[0.08em] uppercase font-medium', tone === 'busy' ? 'text-busy-ink' : tone === 'brand' ? 'text-brand-600' : 'text-ink-3')}>{label}</span>
      <span className={cn('font-mono tabular text-2xl', tone === 'busy' && 'text-busy-ink')}>{value}</span>
      {hint && <span className="text-sm text-soft leading-snug">{hint}</span>}
    </div>
  )
}
