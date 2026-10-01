'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

// Contenedor de las tablas de datos. Si la tabla no cabe, hace scroll horizontal (las celdas no se aprietan: ver
// `.data-table` en globals.css, con la primera columna fija) y muestra además una barra de desplazamiento ARRIBA que se
// queda pegada al borde superior mientras se baja por la página, como en una hoja de cálculo: no hay que llegar al final
// de la tabla para moverla de lado. Las dos barras se mueven juntas.
// `boxClassName`: para tablas que además hacen scroll vertical dentro de su panel (Facturación), en vez del borde redondeado.
export function ScrollTable({ children, className, boxClassName = 'rounded-lg border border-border', label }: { children: ReactNode; className?: string; boxClassName?: string; label?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const rail = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [overflow, setOverflow] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => { setWidth(el.scrollWidth); setOverflow(el.scrollWidth > el.clientWidth + 1) }
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
      {overflow && (
        <div ref={rail} role="scrollbar" aria-orientation="horizontal" aria-label={label ? `Desplazar ${label} a los lados` : 'Desplazar la tabla a los lados'}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={0} tabIndex={-1}
          onScroll={() => follow(rail.current, box.current)}
          className="scroll-rail sticky top-0 z-20 h-4 overflow-x-auto overflow-y-hidden">
          <div style={{ width }} className="h-px" />
        </div>
      )}
      <div ref={box} onScroll={() => follow(box.current, rail.current)} className={cn('overflow-x-auto', boxClassName)}>
        {children}
      </div>
    </div>
  )
}
