import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Tarjeta del kit: superficie, borde suave, radio 16, cabecera opcional con acción a la derecha.
export function Card({ title, action, className, children }: { title?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('bg-surface border border-border rounded-lg flex flex-col', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between px-5 h-16 border-b border-border">
          {title && <h2 className="text-[18px] font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  )
}
