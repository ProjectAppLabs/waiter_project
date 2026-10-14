import type { ReactNode } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

export type PillTone = 'progress' | 'success' | 'info' | 'danger' | 'reserved' | 'neutral'
const TONE: Record<PillTone, string> = {
  progress: 'bg-progress-soft text-progress-ink', success: 'bg-success-soft text-success-ink', info: 'bg-info-soft text-info-ink',
  danger: 'bg-danger-soft text-danger-ink', reserved: 'bg-reserved text-reserved-ink', neutral: 'bg-muted text-soft',
}

// Píldora de estado del kit: "In Progress" naranja, "Served" verde, "Waiting for Payment" azul, reservada en tinta.
export function StatusPill({ tone, icon, children, className }: { tone: PillTone; icon?: KitIcon; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-[14px] font-semibold', TONE[tone], className)}>
      {icon && <Icon name={icon} size={16} />}{children}
    </span>
  )
}
