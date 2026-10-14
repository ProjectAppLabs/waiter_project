import type { SelectHTMLAttributes } from 'react'

import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

// Selector nativo con el mismo tamaño, borde e indicador en los filtros del POS.
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block w-full min-w-0">
      <select {...props} className={cn('h-tap-min w-full min-w-0 appearance-none rounded-md border border-border bg-surface pl-3.5 pr-10 text-[14px] font-semibold text-ink cursor-pointer hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-primary', className)}>
        {children}
      </select>
      <Icon name="chevronDown" size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-soft" />
    </span>
  )
}
