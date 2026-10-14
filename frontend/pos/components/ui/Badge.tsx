import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

const TONE = {
  free: 'bg-free-soft text-free-ink', busy: 'bg-busy-soft text-busy-ink', kitchen: 'bg-kitchen-soft text-kitchen-ink',
  pending: 'bg-pending-soft text-pending-ink', assist: 'bg-assist-soft text-assist', brand: 'bg-brand-50 text-brand-600',
  neutral: 'bg-muted text-soft',
}

export function Badge({ tone, children, className }: { tone: keyof typeof TONE; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-2 h-8 px-3 rounded-full text-sm font-medium', TONE[tone], className)}>{children}</span>
}
