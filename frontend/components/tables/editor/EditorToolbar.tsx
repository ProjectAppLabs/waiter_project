'use client'

import { memo } from 'react'

import { Icon } from '@/components/kit/Icon'
import { IconButton, Kbd, TOOLS, type Tool } from '@/components/tables/editor/parts'
import { cn } from '@/lib/utils'

// Barra flotante sobre el lienzo: qué hace el dedo (seleccionar, mover, dibujar) y el historial. Cada herramienta lleva
// icono, nombre corto y su tecla; la activa se pinta en azul.
export const EditorToolbar = memo(function EditorToolbar({ tool, onTool, canUndo, canRedo, onUndo, onRedo, busy, onLayers }: { tool: Tool; onTool: (t: Tool) => void; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; busy: boolean; onLayers: () => void }) {
  return (
    <div role="toolbar" aria-label="Herramientas del lienzo" className="absolute left-1/2 -translate-x-1/2 top-4 z-10 flex items-center gap-1 p-1.5 rounded-lg border border-border bg-surface shadow-lg">
      {TOOLS.map((t, i) => (
        <span key={t.key} className="flex items-center">
          {i === 2 && <span aria-hidden className="w-px h-7 mx-1 bg-border" />}
          <button type="button" aria-label={t.name} aria-pressed={tool === t.key} title={`${t.name} (${t.shortcut})`} onClick={() => onTool(t.key)}
            className={cn('h-11 pl-3 pr-2.5 flex items-center gap-2 rounded-md text-[14px] font-semibold', tool === t.key ? 'bg-primary text-primary-ink' : 'text-soft hover:bg-muted hover:text-ink')}>
            <Icon name={t.icon} size={20} /><span className="hidden md:inline whitespace-nowrap">{t.short}</span>
            <span className={cn('hidden lg:grid min-w-5 h-5 px-1 place-items-center rounded-[5px] font-mono text-[11px]', tool === t.key ? 'bg-white/20 text-primary-ink' : 'border border-border bg-muted text-soft')}>{t.shortcut}</span>
          </button>
        </span>
      ))}
      <span aria-hidden className="w-px h-7 mx-1 bg-border" />
      <IconButton icon="undo" label="Deshacer" shortcut="Ctrl+Z" onClick={onUndo} disabled={!canUndo || busy} />
      <IconButton icon="redo" label="Rehacer" shortcut="Ctrl+Mayús+Z" onClick={onRedo} disabled={!canRedo || busy} />
      <span aria-hidden className="xl:hidden w-px h-7 mx-1 bg-border" />
      <IconButton icon="layers" label="Ver capas y propiedades" onClick={onLayers} className="xl:hidden" />
    </div>
  )
})

// Pista de la herramienta activa y atajos de lo seleccionado. Vive abajo a la izquierda, donde no tapa el plano.
export const EditorHint = memo(function EditorHint({ text, selected, counts }: { text: string; selected: boolean; counts: string }) {
  return (
    <div className="pointer-events-none absolute left-4 bottom-4 z-10 max-w-[min(560px,calc(100%-250px))] flex flex-col gap-1.5 rounded-md border border-border bg-surface/95 shadow px-3 py-2 text-[13px] text-soft" role="status" aria-live="polite">
      <p className="flex items-start gap-2 text-ink"><Icon name="info" size={16} className="mt-0.5 shrink-0 text-primary" /><span>{text}</span></p>
      {selected && <p className="hidden xl:flex flex-wrap items-center gap-x-3 gap-y-1"><span className="flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd><Kbd>↑</Kbd><Kbd>↓</Kbd> mover</span><span className="flex items-center gap-1"><Kbd>R</Kbd> rotar</span><span className="flex items-center gap-1"><Kbd>Ctrl</Kbd><Kbd>D</Kbd> duplicar</span><span className="flex items-center gap-1"><Kbd>Supr</Kbd> eliminar</span><span className="flex items-center gap-1"><Kbd>Esc</Kbd> soltar</span></p>}
      <p className="text-[12px] text-dim">{counts}</p>
    </div>
  )
})
