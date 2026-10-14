import type { ReactNode } from 'react'

// Panel derecho de 400 px del diseño: detalle o formulario. Cabecera con título y acción de cierre; pie con acciones.
export function Drawer({ title, subtitle, onClose, closeLabel, footer, children }: { title: ReactNode; subtitle?: ReactNode; onClose?: () => void; closeLabel: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <aside aria-label={typeof title === 'string' ? title : undefined} className="w-panel-lg shrink-0 border-l border-border bg-surface flex flex-col">
      <header className="px-[22px] py-4 border-b border-border flex items-start justify-between gap-3">
        <div className="flex flex-col"><span className="text-[19px] font-bold">{title}</span>{subtitle && <span className="text-sm text-soft">{subtitle}</span>}</div>
        {onClose && <button type="button" onClick={onClose} className="h-tap-min px-3 rounded-[10px] text-soft hover:bg-muted text-[15px]">{closeLabel}</button>}
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-[22px] py-4 flex flex-col gap-4">{children}</div>
      {footer && <footer className="px-[22px] py-4 border-t border-border bg-canvas flex gap-2.5">{footer}</footer>}
    </aside>
  )
}
