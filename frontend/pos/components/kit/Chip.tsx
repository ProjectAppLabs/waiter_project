'use client'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

// Chip de filtro del kit: píldora con borde, conteo en badge; activo en azul suave (Order / Ipad View.png).
export function Chip({ label, count, active = false, onClick, icon }: { label: string; count?: number; active?: boolean; onClick?: () => void; icon?: KitIcon }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn('inline-flex items-center gap-2 h-11 px-4 rounded-md border text-[15px] font-semibold whitespace-nowrap',
        active ? 'bg-primary-soft border-primary/40 text-primary' : 'bg-surface border-border text-soft hover:bg-muted')}>
      {icon && <Icon name={icon} size={18} />}
      <span>{label}</span>
      {count !== undefined && (
        <span className={cn('min-w-6 h-6 px-1.5 rounded-md grid place-items-center text-[13px] font-semibold', active ? 'bg-primary text-primary-ink' : 'bg-muted text-soft')}>{count}</span>
      )}
    </button>
  )
}
