'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

export interface RowMenuItem { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }

// Menú «⋯» de una fila de tabla. Se abre con posición fija (sobre todo lo demás): dentro de una tabla con scroll
// horizontal, un menú absoluto quedaba recortado por el contenedor. Se cierra al elegir, al tocar fuera o con Escape.
export function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!at) return
    const close = (e: Event) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setAt(null) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null) }
    document.addEventListener('mousedown', close); document.addEventListener('scroll', close, true); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', close, true); document.removeEventListener('keydown', key) }
  }, [at])
  const toggle = () => {
    if (at) { setAt(null); return }
    const r = button.current!.getBoundingClientRect()
    // Abre hacia arriba si no cabe debajo (las últimas filas de la pantalla).
    const below = window.innerHeight - r.bottom > 48 * items.length + 16
    setAt({ top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - (44 * items.length + 12)), right: window.innerWidth - r.right })
  }
  return (
    <>
      <button ref={button} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={!!at} onClick={toggle}
        className="w-10 h-10 rounded-md border border-border grid place-items-center text-soft hover:bg-muted"><Icon name="more" size={18} /></button>
      {at && (
        <div ref={menu} role="menu" aria-label={label} style={{ top: at.top, right: at.right }}
          className="fixed z-50 min-w-[220px] p-1.5 rounded-md border border-border bg-surface shadow-lg flex flex-col">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" disabled={item.disabled} onClick={() => { setAt(null); item.onSelect() }}
              className={cn('h-11 px-3 rounded-sm text-left text-[14px] font-medium disabled:opacity-40', item.danger ? 'text-danger-ink hover:bg-danger-soft' : 'text-ink hover:bg-muted')}>
              {item.label}</button>
          ))}
        </div>
      )}
    </>
  )
}
