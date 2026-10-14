'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { Icon } from '@/components/kit/Icon'
import { salonZoom, type PlanRect } from '@/lib/domain/floorPlan'
import { cn } from '@/lib/utils'

const MIN = 0.2, MAX = 2
// Píxeles que hay que mover el ratón para que un clic se convierta en arrastre del plano.
const DRAG_PX = 6
// Parte del plano que siempre queda a la vista al arrastrarlo.
const KEEP_PX = 120

// Visor del salón. Encuadra el plano entero y lo centra al abrir, al cambiar de piso y al girar la tablet, igual que
// «Ver todo» en el editor: lo que el administrador dibujó es lo que el mesero ve, sin tener que desplazarse.
// Si alguien acerca o aleja a mano, el visor respeta ese zoom hasta que pulse «Ver todo» o cambie de piso.
// `bounds` son los límites de todo lo dibujado y `core` los de lo que se opera (sin la imagen): ver salonZoom.
// `inset` reserva espacio arriba para el chip flotante del piso.
export function PlanViewport({ children, bounds, core = bounds, inset = 0 }: { children: ReactNode; bounds: PlanRect; core?: PlanRect; inset?: number }) {
  const root = useRef<HTMLDivElement>(null)
  // Arrastre con el ratón (botón izquierdo o rueda). Empieza a mover solo pasado DRAG_PX: así un clic sobre una mesa
  // la sigue abriendo, y arrastrar desde encima de una mesa también mueve el plano (el clic de esa mesa se descarta).
  // Mueve el plano en sí (`offset`), no el desplazamiento del contenedor: con el plano encuadrado entero no hay nada que
  // desplazar, y la mano aparecía sin mover nada.
  const pan = useRef<{ x: number; y: number; from: { x: number; y: number }; moving: boolean } | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragged = useRef(false)
  const [grabbing, setGrabbing] = useState(false)
  const [view, setView] = useState({ width: 0, height: 0 })
  const [manual, setManual] = useState<number | null>(null)
  const key = `${bounds.x}:${bounds.y}:${bounds.width}:${bounds.height}`
  const [fittedKey, setFittedKey] = useState(key)
  if (fittedKey !== key) { setFittedKey(key); setManual(null); setOffset({ x: 0, y: 0 }) }

  useEffect(() => {
    const el = root.current
    if (!el) return
    const measure = () => setView({ width: el.clientWidth, height: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fitted = salonZoom(bounds, core, { width: view.width, height: Math.max(0, view.height - inset) })
  const zoom = manual ?? fitted
  const step = (factor: number) => setManual(Math.max(MIN, Math.min(MAX, zoom * factor)))
  // Hasta dónde se puede llevar el plano: siempre queda a la vista al menos KEEP_PX de él, para no perderlo de pantalla.
  const limit = (value: number, box: number, space: number) => { const max = Math.max(0, (box + space) / 2 - KEEP_PX); return Math.max(-max, Math.min(max, value)) }
  return (
    <div className="relative flex-1 min-h-0 min-w-0">
      <div ref={root} data-testid="floor-plan" className={cn('absolute inset-0 overflow-auto touch-pan-x touch-pan-y', grabbing ? 'cursor-grabbing' : 'cursor-grab')}
        onPointerDown={(e) => {
          // El dedo usa el desplazamiento nativo; el ratón arrastra con el izquierdo o con la rueda pulsada.
          if (e.pointerType === 'touch' || (e.button !== 0 && e.button !== 1)) return
          if (e.button === 1) e.preventDefault() // sin el autodesplazamiento del navegador
          dragged.current = false
          pan.current = { x: e.clientX, y: e.clientY, from: offset, moving: false }
        }}
        onPointerMove={(e) => {
          const p = pan.current
          if (!p) return
          if (!p.moving) {
            if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return
            p.moving = true; dragged.current = true; setGrabbing(true)
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          setOffset({ x: limit(p.from.x + e.clientX - p.x, bounds.width * zoom, view.width), y: limit(p.from.y + e.clientY - p.y, bounds.height * zoom, view.height) })
        }}
        onPointerUp={() => { pan.current = null; setGrabbing(false) }} onPointerCancel={() => { pan.current = null; setGrabbing(false) }}
        onClickCapture={(e) => { if (dragged.current) { dragged.current = false; e.stopPropagation(); e.preventDefault() } }}
        onAuxClick={(e) => { if (e.button === 1) e.preventDefault() }}>
        {/* margin:auto dentro de un flex centra cuando sobra espacio y no recorta el contenido cuando falta. */}
        <div className="flex min-w-full min-h-full" style={{ paddingTop: inset }}>
          <div className="m-auto shrink-0" data-testid="plan-canvas" style={{ width: bounds.width * zoom, height: bounds.height * zoom, transform: offset.x || offset.y ? `translate(${offset.x}px, ${offset.y}px)` : undefined }}>
            <div className="relative origin-top-left" style={{ width: bounds.width, height: bounds.height, transform: `scale(${zoom})`, '--plan-zoom': zoom } as CSSProperties}>
              <div className="absolute" style={{ left: -bounds.x, top: -bounds.y }}>{children}</div>
            </div>
          </div>
        </div>
      </div>
      <div role="group" aria-label="Zoom del plano" className="absolute bottom-3 right-3 flex items-center rounded-md border border-border bg-surface shadow-lg text-[14px] text-ink">
        <button type="button" aria-label="Alejar plano" onClick={() => step(1 / 1.2)} className="w-11 h-11 grid place-items-center rounded-l-md hover:bg-muted"><Icon name="minus" size={18} /></button>
        <span className="w-14 text-center tabular font-semibold" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Acercar plano" onClick={() => step(1.2)} className="w-11 h-11 grid place-items-center hover:bg-muted"><Icon name="plus" size={18} /></button>
        <button type="button" onClick={() => { setManual(null); setOffset({ x: 0, y: 0 }); root.current?.scrollTo(0, 0) }} aria-pressed={manual === null && !offset.x && !offset.y} className="h-11 px-3 flex items-center gap-2 border-l border-border rounded-r-md font-semibold hover:bg-muted"><Icon name="expand" size={18} />Ver todo</button>
      </div>
    </div>
  )
}
