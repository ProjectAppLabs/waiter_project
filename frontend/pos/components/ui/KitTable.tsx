import type { ReactNode } from 'react'

import { ScrollTable } from '@/components/ui/ScrollTable'
import { cn } from '@/lib/utils'

export interface KitColumn<T> { key: string; header: ReactNode; width?: string; align?: 'left' | 'right'; render: (row: T) => ReactNode }

// Tabla del kit (tabla Items / Qty / Price de la tarjeta de pedido): cabecera gris suave, filas de 48 px separadas por línea.
export function KitTable<T>({ columns, rows, rowKey, empty, onRowClick, selectedKey }: {
  columns: KitColumn<T>[]; rows: T[]; rowKey: (row: T) => string | number; empty: ReactNode; onRowClick?: (row: T) => void; selectedKey?: string | number | null
}) {
  // Una columna «fr» nunca baja de lo que mide su contenido: si no cabe, la tabla hace scroll horizontal en vez de
  // apretar y partir los valores. La primera columna queda fija al desplazarse.
  const template = columns.map((c) => { const w = c.width ?? '1fr'; return w.endsWith('fr') ? `minmax(max-content, ${w})` : w }).join(' ')
  const sticky = 'sticky left-0 z-[1] bg-surface'
  return (
    <ScrollTable boxClassName="min-h-0" className="min-h-0"><div className="flex flex-col min-h-0 w-max min-w-full">
      <div role="row" className="grid gap-3 px-5 h-11 items-center bg-muted text-[13px] font-medium text-soft" style={{ gridTemplateColumns: template }}>
        {columns.map((c, i) => <span key={c.key} role="columnheader" className={cn('whitespace-nowrap', c.align === 'right' && 'text-right', i === 0 && cn(sticky, 'bg-muted'))}>{c.header}</span>)}
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
              {columns.map((c, i) => <span key={c.key} role="cell" className={cn('whitespace-nowrap', c.align === 'right' && 'text-right', i === 0 && sticky)}>{c.render(row)}</span>)}
            </Tag>
          )
        })}
      </div>
    </div></ScrollTable>
  )
}
