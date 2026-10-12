'use client'
// Fondo «Aurora» ambiental del sistema de diseño (pos/components/kit/Aurora.tsx, AuroraBackground): cinco manchas de
// color difuminadas a la deriva. Las manchas solo se mueven mientras la sección está a la vista.
import { useEffect, useRef } from 'react'

const MANCHAS = ['blue', 'indigo', 'amber', 'mint', 'rose']

export function AuroraFondo() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.removeAttribute('data-pausa'); else el.setAttribute('data-pausa', '') })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className="pos-aurora-backdrop" aria-hidden="true" data-pausa="">
      <div className="pos-aurora-field">
        {MANCHAS.map(m => <span key={m} className={`login-blob login-blob-${m}`} />)}
      </div>
    </div>
  )
}
