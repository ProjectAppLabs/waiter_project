'use client'

import { memo, useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/kit/Icon'
import { KIND_ICON, KIND_TITLE, PanelTitle, type SelectionKind } from '@/components/tables/editor/parts'
import { DECOR_INFO, type Decor } from '@/lib/domain/decor'
import { CELL, WALL_COLOR, type FloorDocument, type PlanRect, type PlanTable, type TableProblem, type Wall, type Zone } from '@/lib/domain/floorPlan'
import { cn } from '@/lib/utils'

const field = 'h-11 w-full rounded-md border border-border bg-surface px-3 text-[15px] text-ink focus:outline-2 focus:outline-brand-500'
const PROBLEM_TEXT: Record<TableProblem, string> = {
  number: 'El número debe estar entre 1 y 9999.', seats: 'La capacidad debe estar entre 1 y 100 personas.', size: 'La mesa es más pequeña que una celda.',
  duplicate: 'Ya hay otra mesa con este número.', table: 'Está encima o demasiado cerca de otra mesa.', wall: 'Está encima o demasiado cerca de una pared.',
}
export interface Layer { kind: SelectionKind; id: string; label: string; invalid?: boolean }

// Paleta de colores más un selector libre. El selector nativo dispara decenas de eventos por segundo mientras se arrastra:
// el valor se guarda aquí para que el control responda al instante, y al plano se publica como mucho un cambio por cuadro.
function ColorField({ label, value, colors, onChange }: { label: string; value: string; colors: string[]; onChange: (color: string) => void }) {
  const [local, setLocal] = useState(value)
  const frame = useRef<number | null>(null), pending = useRef(value), publish = useRef(onChange)
  useEffect(() => { publish.current = onChange })
  // Si el valor cambia desde fuera (deshacer, otra zona seleccionada), el control lo adopta. Se hace durante el render,
  // comparando con el último valor visto, para no encadenar un render extra desde un efecto.
  const [seen, setSeen] = useState(value)
  if (seen !== value) { setSeen(value); setLocal(value) }
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current) }, [])
  const pick = (color: string) => {
    setLocal(color); pending.current = color
    if (frame.current === null) frame.current = requestAnimationFrame(() => { frame.current = null; publish.current(pending.current) })
  }
  const id = `color-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5 text-[13px] font-medium text-soft"><span id={id}>{label}</span>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={id}>
        {colors.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={local.toLowerCase() === c} onClick={() => { setLocal(c); onChange(c) }} className={cn('w-9 h-9 rounded-full border-2', local.toLowerCase() === c ? 'border-ink' : 'border-transparent')} style={{ background: c }} />)}
        <input type="color" aria-label={label} title="Otro color" value={local} onChange={(e) => pick(e.target.value)} className="w-9 h-9 rounded-full overflow-hidden border border-border bg-transparent cursor-pointer" />
      </div>
    </div>
  )
}

// La lista de capas solo se vuelve a dibujar si cambia lo que muestra (etiquetas, avisos, cuál está activa). Cambiar el
// color de una zona crea un arreglo de capas nuevo pero idéntico: se compara por contenido, no por identidad.
const LayerList = memo(function LayerList({ layers, activeKey, busy, onSelect }: { layers: Layer[]; activeKey: string; busy: boolean; onSelect: (layer: Layer) => void }) {
  if (layers.length === 0) return <p className="text-[13px] text-dim">El plano está vacío.</p>
  return (
    <div className="flex flex-col gap-0.5">
      {layers.map((layer) => { const active = activeKey === `${layer.kind}:${layer.id}`; return (
        <button key={`${layer.kind}:${layer.id}`} type="button" aria-label={`Seleccionar capa: ${layer.label}`} aria-pressed={active} disabled={busy} onClick={() => onSelect(layer)}
          className={cn('h-10 px-2 flex items-center gap-2 rounded-md text-left text-[14px]', active ? 'bg-primary-soft text-primary font-semibold' : 'text-ink hover:bg-muted')}>
          <Icon name={KIND_ICON[layer.kind]} size={16} className={active ? 'text-primary' : 'text-soft'} /><span className="flex-1 min-w-0 truncate">{layer.label}</span>
          {layer.invalid && <Icon name="alert" size={16} className="text-danger" label="Ubicación no válida" />}
        </button>
      ) })}
    </div>
  )
}, (a, b) => a.activeKey === b.activeKey && a.busy === b.busy && a.onSelect === b.onSelect && a.layers.length === b.layers.length
  && a.layers.every((l, i) => l.kind === b.layers[i].kind && l.id === b.layers[i].id && l.label === b.layers[i].label && Boolean(l.invalid) === Boolean(b.layers[i].invalid)))

interface Props {
  plan: FloorDocument; selection: { kind: SelectionKind; id: string } | null; current: PlanRect | null | undefined
  table?: PlanTable; zone?: Zone; wall?: Wall; decor?: Decor; problems: TableProblem[]; zoneColors: string[]; wallColors: string[]; layers: Layer[]; busy: boolean
  onPatch: (values: Record<string, unknown>) => void; onRotate: () => void; onDuplicate: () => void; onRemove: () => void; onSelectLayer: (layer: Layer) => void
  open: boolean; onClose: () => void
}

// Columna derecha. Arriba, las propiedades de lo seleccionado con sus tres acciones (rotar, duplicar, eliminar); sin
// selección, explica por dónde empezar. Abajo, las capas: la forma de elegir algo que quedó tapado por otra cosa.
export function EditorInspector({ plan, selection, current, table, zone, wall, decor, problems, zoneColors, wallColors, layers, busy, onPatch, onRotate, onDuplicate, onRemove, onSelectLayer, open, onClose }: Props) {
  // La etiqueta apunta al campo por id: los botones van fuera del <label>, porque un label con varios controles dentro
  // se asocia al primero (el botón de restar) y no al número.
  const stepper = (key: 'seats' | 'number', value: number, min: number, max: number, label: string, less: string, more: string) => (
    <div className="flex flex-col gap-1.5 text-[13px] font-medium text-soft">
      <label htmlFor={`inspector-${key}`}>{label}</label>
      <span className="flex items-center gap-1">
        <button type="button" aria-label={less} disabled={value <= min} onClick={() => onPatch({ [key]: Math.max(min, value - 1) })} className="w-11 h-11 shrink-0 grid place-items-center rounded-md border border-border text-soft hover:bg-muted disabled:opacity-35"><Icon name="minus" size={18} /></button>
        <input id={`inspector-${key}`} type="number" min={min} max={max} className={cn(field, 'text-center tabular font-semibold')} value={value} onChange={(e) => onPatch({ [key]: Number(e.target.value) })} />
        <button type="button" aria-label={more} disabled={value >= max} onClick={() => onPatch({ [key]: Math.min(max, value + 1) })} className="w-11 h-11 shrink-0 grid place-items-center rounded-md border border-border text-soft hover:bg-muted disabled:opacity-35"><Icon name="plus" size={18} /></button>
      </span>
    </div>
  )
  return (
    // En escritorio es una columna fija. En tablet se superpone al lienzo y solo aparece con algo seleccionado o al pedir las capas.
    <aside className={cn('w-[300px] shrink-0 border-l border-border bg-surface overflow-y-auto flex-col xl:static xl:flex xl:shadow-none', 'absolute inset-y-0 right-0 z-20 shadow-xl', open ? 'flex' : 'hidden')} aria-label="Herramientas del plano">
      <button type="button" onClick={onClose} className="xl:hidden shrink-0 h-11 px-4 flex items-center gap-2 border-b border-border text-[14px] font-semibold text-soft hover:bg-muted"><Icon name="chevronRight" size={18} />Ocultar panel</button>
      {current && selection ? (
        <section className="p-4 border-b border-border flex flex-col gap-3" aria-label="Elemento seleccionado">
          <PanelTitle icon={KIND_ICON[selection.kind]}>{KIND_TITLE[selection.kind]}</PanelTitle>
          {problems.length > 0 && <ul role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] leading-relaxed text-danger-ink flex flex-col gap-1">{problems.map((p) => <li key={p} className="flex gap-2"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{PROBLEM_TEXT[p]}</li>)}</ul>}
          {selection.kind === 'tables' && table && <>
            {stepper('number', table.number, 1, 9999, 'Número de mesa', 'Número anterior', 'Número siguiente')}
            {stepper('seats', table.seats, 1, 100, 'Capacidad (personas)', 'Quitar una silla', 'Agregar una silla')}
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-soft">Zona de la mesa
              <select className={field} value={table.zone} onChange={(e) => onPatch({ zone: e.target.value })}><option value="">Sin zona</option>{plan.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
            </label>
          </>}
          {selection.kind === 'zones' && zone && <>
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-soft">Nombre de zona<input className={field} value={zone.name} onChange={(e) => onPatch({ name: e.target.value })} /></label>
            <ColorField label="Color de zona" value={zone.color} colors={zoneColors} onChange={(color) => onPatch({ color })} />
            <p className="text-[12px] text-dim">{plan.tables.filter((t) => t.zone === zone.id).length} mesas en esta zona.</p>
          </>}
          {selection.kind === 'walls' && wall && <ColorField label="Color de pared" value={wall.color ?? WALL_COLOR} colors={wallColors} onChange={(color) => onPatch({ color })} />}
          {selection.kind === 'decor' && decor && <p className="text-[13px] leading-relaxed text-soft"><span className="font-semibold text-ink">{DECOR_INFO[decor.asset].label}</span>. Rotar la gira de a 90 grados; la esquina blanca cambia su tamaño.</p>}
          {(selection.kind === 'images' || selection.kind === 'background') && <p className="text-[13px] leading-relaxed text-soft">Arrástrala hasta su lugar, por ejemplo sobre la zona que representa. Cambia de tamaño sin deformarse.</p>}
          <details className="rounded-md border border-border">
            <summary className="h-10 px-3 flex items-center gap-2 cursor-pointer text-[13px] font-semibold text-soft">Configuración avanzada</summary>
            <div className="grid grid-cols-2 gap-2 p-3 pt-0">{(['width', 'height'] as const).map((k) => <label key={k} className="flex flex-col gap-1 text-[12px] font-medium text-soft">{k === 'width' ? 'Ancho (celdas)' : 'Largo (celdas)'}<input className={field} type="number" min={1} max={1000} value={current[k] / CELL} onChange={(e) => onPatch({ [k]: Math.max(CELL, Math.min(20000, Number(e.target.value) * CELL)) })} /></label>)}</div>
          </details>
          <div className="grid grid-cols-3 gap-2">
            {selection.kind !== 'background' && selection.kind !== 'images' && <button type="button" onClick={onRotate} className="h-14 rounded-md border border-border flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-soft hover:bg-muted hover:text-ink"><Icon name="rotate" size={18} />Rotar</button>}
            {selection.kind !== 'background' && selection.kind !== 'images' && <button type="button" onClick={onDuplicate} className="h-14 rounded-md border border-border flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-soft hover:bg-muted hover:text-ink"><Icon name="copy" size={18} />Duplicar</button>}
            <button type="button" aria-label="Eliminar elemento" onClick={onRemove} className="h-14 rounded-md border border-border flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-danger-ink hover:bg-danger-soft"><Icon name="trash" size={18} />Eliminar</button>
          </div>
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-dim"><Icon name="expand" size={14} className="mt-0.5 shrink-0" />Arrastra la esquina blanca para cambiar el tamaño.</p>
        </section>
      ) : (
        <section className="p-4 border-b border-border flex flex-col gap-3" aria-label="Cómo empezar">
          <PanelTitle icon="info">Nada seleccionado</PanelTitle>
          <ol className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-soft">
            {([['plus', 'Agrega mesas desde la columna izquierda.'], ['pointer', 'Toca una mesa para cambiar su número, sillas y zona.'], ['wall', 'Dibuja paredes y deja huecos para las puertas.'], ['zone', 'Marca zonas para repartir el salón entre meseros.']] as const).map(([icon, text]) => <li key={icon} className="flex items-start gap-2.5"><span className="w-7 h-7 shrink-0 grid place-items-center rounded-md bg-primary-soft text-primary"><Icon name={icon} size={16} /></span><span className="pt-0.5">{text}</span></li>)}
          </ol>
        </section>
      )}
      <section aria-label="Capas del plano" className="p-4 flex flex-col gap-2 min-h-0">
        <PanelTitle icon="layers" aside={<span className="text-[12px] font-normal text-dim">{layers.length}</span>}>Capas</PanelTitle>
        <p className="text-[12px] leading-relaxed text-dim">Elige aquí un elemento que quedó tapado por otro.</p>
        <LayerList layers={layers} activeKey={selection ? `${selection.kind}:${selection.id}` : ''} busy={busy} onSelect={onSelectLayer} />
      </section>
    </aside>
  )
}
