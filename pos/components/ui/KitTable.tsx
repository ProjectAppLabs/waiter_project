import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface KitColumn<T> { key: string; header: ReactNode; width?: string; align?: 'left' | 'right'; render: (row: T) => ReactNode }

// Tabla del kit (tabla Items / Qty / Price de la tarjeta de pedido): cabecera gris suave, filas de 48 px separadas por línea.
export function KitTable<T>({ columns, rows, rowKey, empty, onRowClick, selectedKey }: {
  columns: KitColumn<T>[]; rows: T[]; rowKey: (row: T) => string | number; empty: ReactNode; onRowClick?: (row: T) => void; selectedKey?: string | number | null
}) {
  const template = columns.map((c) => c.width ?? '1fr').join(' ')
  return (
    <div className="flex flex-col min-h-0">
      <div role="row" className="grid gap-3 px-5 h-11 items-center bg-muted text-[13px] font-medium text-soft" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => <span key={c.key} role="columnheader" className={cn(c.align === 'right' && 'text-right')}>{c.header}</span>)}
      </div>
      {rows.length === 0 && <div className="flex">{empty}</div>}
      <div className="overflow-y-auto">
        {rows.map((row) => {
          const key = rowKey(row)
          const Tag = onRowClick ? 'button' : 'div'
          return (
            <Tag key={key} role="row" type={onRowClick ? 'button' : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('w-full grid gap-3 px-5 min-h-12 py-2 items-center border-b border-border text-[15px] text-ink text-left', onRowClick && 'hover:bg-muted', selectedKey === key && 'bg-primary-soft')}
              style={{ gridTemplateColumns: template }}>
              {/* Lo alineado a la derecha son importes: no se truncan (se veía «$ 12.0…» o el «$» solo). */}
              {columns.map((c) => <span key={c.key} role="cell" className={cn(c.align === 'right' ? 'text-right whitespace-nowrap' : 'min-w-0 truncate')}>{c.render(row)}</span>)}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
