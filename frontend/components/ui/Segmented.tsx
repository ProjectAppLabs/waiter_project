'use client'

import { cn } from '@/lib/utils'

// Segmentos del diseño (Todo · Mesas · Cocina · Pagos / Semana · Mes · Año): el activo va en blanco.
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-1 p-1 bg-muted rounded-xl">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cn('px-4 py-2.5 rounded-[9px] text-[15px]', o.value === value ? 'bg-surface font-medium text-ink' : 'text-soft hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
