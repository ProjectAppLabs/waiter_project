import type { ReactNode } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

// Indicador del kit (Dashboard / Filled.png): etiqueta a la izquierda, icono en caja a la derecha, valor grande debajo.
export function KpiTile({ label, value, icon, hint, tone = 'neutral', className }: { label: string; value: ReactNode; icon: KitIcon; hint?: ReactNode; tone?: 'neutral' | 'primary' | 'danger'; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-surface border p-5 flex flex-col gap-3', tone === 'danger' ? 'border-danger/40' : tone === 'primary' ? 'border-primary/40' : 'border-border', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[16px] text-soft">{label}</span>
        <span className={cn('w-10 h-10 rounded-md border grid place-items-center shrink-0', tone === 'danger' ? 'border-danger/40 text-danger' : 'border-border text-primary')}><Icon name={icon} size={20} /></span>
      </div>
      <span className={cn('text-[30px] font-semibold leading-none tabular', tone === 'danger' ? 'text-danger-ink' : 'text-ink')}>{value}</span>
      {hint && <span className="text-[13px] text-soft leading-snug">{hint}</span>}
    </div>
  )
}
