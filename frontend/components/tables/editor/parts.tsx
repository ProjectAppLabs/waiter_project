'use client'

import type { ReactNode } from 'react'

import { Icon, type KitIcon } from '@/components/kit/Icon'
import { cn } from '@/lib/utils'

export type Tool = 'select' | 'pan' | 'wall' | 'zone'
export type SelectionKind = 'tables' | 'walls' | 'zones' | 'images' | 'background' | 'decor'

// Herramientas del lienzo: nombre accesible (lo usan las pruebas), etiqueta corta, icono, atajo y la pista que se
// muestra abajo mientras está activa. Una herramienta nueva se agrega aquí y aparece en la barra.
export const TOOLS: { key: Tool; name: string; short: string; icon: KitIcon; shortcut: string; hint: string }[] = [
  { key: 'select', name: 'Seleccionar elementos', short: 'Seleccionar', icon: 'pointer', shortcut: 'V', hint: 'Toca una mesa, pared o zona para editarla. Arrastra el fondo para mover el plano.' },
  { key: 'pan', name: 'Desplazar plano', short: 'Mover plano', icon: 'hand', shortcut: 'H', hint: 'Arrastra para desplazar el plano. Rueda o pellizco para acercar.' },
  { key: 'wall', name: 'Dibujar pared', short: 'Pared', icon: 'wall', shortcut: 'P', hint: 'Arrastra sobre la cuadrícula para dibujar una pared. Deja huecos para puertas y pasillos.' },
  { key: 'zone', name: 'Dibujar zona', short: 'Zona', icon: 'zone', shortcut: 'Z', hint: 'Arrastra para marcar el área de la zona. Las mesas que queden dentro se asignan solas.' },
]
export const KIND_ICON: Record<SelectionKind, KitIcon> = { tables: 'armchair', walls: 'wall', zones: 'zone', images: 'photo', background: 'photo', decor: 'palette' }
export const KIND_TITLE: Record<SelectionKind, string> = { tables: 'Mesa seleccionada', walls: 'Pared seleccionada', zones: 'Zona seleccionada', images: 'Imagen seleccionada', background: 'Imagen seleccionada', decor: 'Pieza seleccionada' }

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="min-w-5 h-5 px-1 grid place-items-center rounded-[5px] border border-border bg-muted font-mono text-[11px] font-medium text-soft">{children}</kbd>
}

// Título de un bloque del panel: icono, nombre y, si hace falta, algo a la derecha.
export function PanelTitle({ icon, children, aside }: { icon: KitIcon; children: ReactNode; aside?: ReactNode }) {
  return <h2 className="flex items-center gap-2 text-[14px] font-semibold text-ink"><Icon name={icon} size={18} className="text-soft" /><span className="flex-1 min-w-0 truncate">{children}</span>{aside}</h2>
}

// Botón de icono con nombre accesible y tooltip nativo (incluye el atajo).
export function IconButton({ icon, label, shortcut, onClick, disabled, danger, className }: { icon: KitIcon; label: string; shortcut?: string; onClick: () => void; disabled?: boolean; danger?: boolean; className?: string }) {
  return (
    <button type="button" aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick} disabled={disabled}
      className={cn('w-11 h-11 grid place-items-center rounded-md text-soft disabled:opacity-35 disabled:cursor-not-allowed', danger ? 'hover:bg-danger-soft hover:text-danger-ink' : 'hover:bg-muted hover:text-ink', className)}>
      <Icon name={icon} size={20} />
    </button>
  )
}

// Dibujo en miniatura de una mesa con sus sillas, a escala: enseña la forma antes de agregarla. Cuadrada: una silla
// por lado. Alargada: dos en cada lado largo y una en cada cabecera.
export function TableGlyph({ width, height }: { width: number; height: number }) {
  const scale = 38 / Math.max(width, height), w = width * scale, h = height * scale, x = (56 - w) / 2, y = (56 - h) / 2
  const perLong = width === height ? 1 : 2
  const horizontal = width >= height
  const chairs: { x: number; y: number; w: number; h: number }[] = []
  for (let i = 0; i < perLong; i++) {
    const offset = ((horizontal ? w : h) / perLong) * (i + 0.5)
    if (horizontal) chairs.push({ x: x + offset - 5, y: y - 6, w: 10, h: 3 }, { x: x + offset - 5, y: y + h + 3, w: 10, h: 3 })
    else chairs.push({ x: x - 6, y: y + offset - 5, w: 3, h: 10 }, { x: x + w + 3, y: y + offset - 5, w: 3, h: 10 })
  }
  if (horizontal) chairs.push({ x: x - 6, y: y + h / 2 - 5, w: 3, h: 10 }, { x: x + w + 3, y: y + h / 2 - 5, w: 3, h: 10 })
  else chairs.push({ x: x + w / 2 - 5, y: y - 6, w: 10, h: 3 }, { x: x + w / 2 - 5, y: y + h + 3, w: 10, h: 3 })
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0">
      {chairs.map((c, i) => <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} rx={1.5} className="fill-primary/35" />)}
      <rect x={x} y={y} width={w} height={h} rx={6} className="fill-primary" />
    </svg>
  )
}
