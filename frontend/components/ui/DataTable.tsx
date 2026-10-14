import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface Column<T> { key: string; header: ReactNode; width?: string; align?: 'left' | 'right'; render: (row: T) => ReactNode }

// Tabla de rejilla del diseño 1e: cabecera en mayúsculas sobre canvas, filas de 16 px con cebra suave.
export function DataTable<T>({ columns, rows, rowKey, emptyText, onRowClick, selectedKey, className }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string | number; emptyText: string; onRowClick?: (row: T) => void; selectedKey?: string | number | null
  className?: string
}) {
  const template = columns.map((c) => c.width ?? '1fr').join(' ')
  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div role="row" className="grid gap-3 px-[22px] py-3.5 bg-canvas border-b border-border text-[13px] font-medium tracking-[0.08em] uppercase text-ink-3" style={{ gridTemplateColumns: template }}>
        {columns.map((c) => <span key={c.key} role="columnheader" className={cn(c.align === 'right' && 'text-right')}>{c.header}</span>)}
      </div>
      {rows.length === 0 && <p className="px-[22px] py-8 text-soft">{emptyText}</p>}
      <div className="overflow-y-auto">
        {rows.map((row, i) => {
          const key = rowKey(row)
          const Tag = onRowClick ? 'button' : 'div'
          return (
            <Tag key={key} role="row" type={onRowClick ? 'button' : undefined} onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('w-full grid gap-3 px-[22px] py-4 items-center border-b border-border text-base text-left', i % 2 === 1 && 'bg-muted/40',
                onRowClick && 'hover:bg-brand-50', selectedKey === key && 'bg-brand-50')} style={{ gridTemplateColumns: template }}>
              {columns.map((c) => <span key={c.key} role="cell" className={cn('min-w-0 truncate', c.align === 'right' && 'text-right')}>{c.render(row)}</span>)}
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
