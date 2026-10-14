'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Contenedor de las tablas de datos. Si la tabla no cabe, hace scroll horizontal (las celdas no se aprietan: ver
// `.data-table` en globals.css, con la primera columna fija). La barra horizontal va ABAJO y se queda pegada al borde
// inferior de la pantalla mientras la tabla sigue a la vista: con una tabla más alta que la pantalla no hay que bajar
// hasta el final para moverla de lado. Es una sola barra: la propia de la tabla se oculta y esta la mueve.
// `boxClassName`: para tablas que además hacen scroll vertical dentro de su panel (Facturación), en vez del borde redondeado.
export function ScrollTable({ children, className, boxClassName = 'rounded-lg border border-border', label }: { children: ReactNode; className?: string; boxClassName?: string; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    // Lo que sobra de la tabla: la barra recorre exactamente eso (con el ancho total, el borde la descuadraba 2 px).
    const measure = () => { setWidth(el.scrollWidth - el.clientWidth); setOverflow(el.scrollWidth > el.clientWidth + 1) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [])

  // Solo se copia si difiere: así un desplazamiento no rebota entre las dos barras.
  const follow = (from: HTMLDivElement | null, to: HTMLDivElement | null) => { if (from && to && to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft }

  return (
    <div className={cn('flex flex-col', className)}>
      <div ref={box} onScroll={() => follow(box.current, rail.current)} className={cn('overflow-x-auto', overflow && 'no-x-scrollbar', boxClassName)}>
        {children}
      </div>
      {overflow && (
        <div ref={rail} role="scrollbar" aria-orientation="horizontal" aria-label={label ? `Desplazar ${label} a los lados` : 'Desplazar la tabla a los lados'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} tabIndex={-1}
          onScroll={() => follow(rail.current, box.current)}
          className="scroll-rail sticky bottom-0 z-20 h-4 overflow-x-auto overflow-y-hidden">
          <div style={{ width: `calc(100% + ${width}px)` }} className="h-px" />
        </div>
      )}
    </div>
  )
}
