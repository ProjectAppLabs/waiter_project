'use client'

import type { ReactNode } from 'react'

import { Icon } from '@/components/kit/Icon'
import type { TableSort } from '@/lib/hooks/useTableView'
import { cn } from '@/lib/utils'

// Cabecera que ordena la tabla al tocarla (ver useTableView). Dice al lector de pantalla en qué orden está la columna.
export function SortTh({ label, sortKey, sort, onSort, align = 'left', className }: {
  label: ReactNode; sortKey: string; sort: TableSort | null; onSort: (key: string) => void; align?: 'left' | 'right'; className?: string
}) {
  const active = sort?.key === sortKey
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-4 py-3 font-semibold', align === 'right' && 'text-right', className)}>
      <button type="button" onClick={() => onSort(sortKey)} className={cn('group inline-flex items-center gap-1 hover:text-ink', active && 'text-ink', align === 'right' && 'flex-row-reverse')}>
        {label}
        <Icon name={active ? (sort.dir === 'asc' ? 'arrowUp' : 'arrowDown') : 'arrowDown'} size={14} className={cn(!active && 'opacity-0 group-hover:opacity-40')} />
      </button>
    </th>
  )
}

// Buscador de una tabla: filtra mientras se escribe, sin distinguir tildes ni mayúsculas.
export function TableSearch({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <Icon name="search" size={18} className="absolute left-3 text-dim pointer-events-none" />
      <input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full pl-9 pr-3 rounded-md border border-border bg-surface text-[15px] text-ink" />
    </span>
  )
}
