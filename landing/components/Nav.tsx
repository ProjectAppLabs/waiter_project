'use client'
// Navegación en pill, como la de projectapp.co: flota centrada a 24 px del borde, translúcida con desenfoque, y un
// resaltado que se desliza al enlace de la sección que se está viendo (en ProjectApp marca la página activa). En
// pantallas angostas es una barra completa con un botón que abre el menú a pantalla completa, también como ProjectApp.
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { gsap } from 'gsap'

const SECCIONES = [
  { id: 'como-funciona', label: 'Producto' },
  { id: 'modulos', label: 'Módulos' },
  { id: 'domicilios', label: 'Domicilios' },
  { id: 'precios', label: 'Precios' },
  { id: 'preguntas', label: 'Preguntas' },
]

// Mientras no haya una dirección pública del POS, «Iniciar sesión» sigue como en el diseño.
const INICIAR_SESION = process.env.NEXT_PUBLIC_LOGIN_URL || '#'

const reducido = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Con el menú abierto la página de atrás no se desplaza
const fijarPagina = (fija: boolean) => { document.documentElement.style.overflow = fija ? 'hidden' : '' }

function Logo({ inicio, onClick }: { inicio: boolean; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <a href={inicio ? '#producto' : '/'} className="wn-logo" aria-label="Waiter. Inicio" onClick={onClick}>
      <span className="wn-logo-nombre">Waiter.</span>
      <span className="wn-logo-firma">By ProjectApp.</span>
    </a>
  )
}

export function Nav({ waHref, inicio }: { waHref: string; inicio: boolean }) {
  const href = (id: string) => (inicio ? '#' : '/#') + id
  const enlaces = useRef<(HTMLAnchorElement | null)[]>([])
  const resaltado = useRef<HTMLSpanElement>(null)
  const activo = useRef(-1)
  const [actual, setActual] = useState(-1)
  const [menu, setMenu] = useState(false)
  const capa = useRef<HTMLDivElement>(null)

  // El resaltado sigue a la sección visible (solo en el inicio; en las páginas legales no hay sección activa)
  useEffect(() => {
    if (!inicio) return
    let raf = 0
    const mover = (i: number, instantaneo = false) => {
      const el = resaltado.current, a = enlaces.current[i]
      if (!el) return
      const d = instantaneo || reducido() ? 0 : 1
      if (i < 0 || !a) { gsap.to(el, { opacity: 0, duration: 0.3 * d, overwrite: true }); return }
      if (activo.current < 0 || instantaneo) gsap.set(el, { x: a.offsetLeft, width: a.offsetWidth })
      gsap.to(el, { x: a.offsetLeft, width: a.offsetWidth, opacity: 1, duration: 0.45 * d, ease: 'power3.out', overwrite: true })
    }
    const revisar = () => {
      raf = 0
      const linea = window.innerHeight * 0.4
      let i = -1
      SECCIONES.forEach((s, k) => { const r = document.getElementById(s.id)?.getBoundingClientRect(); if (r && r.top <= linea && r.bottom > linea) i = k })
      if (i !== activo.current) { mover(i); activo.current = i; setActual(i) }
    }
    const pedir = () => { if (!raf) raf = requestAnimationFrame(revisar) }
    const ajustar = () => { if (activo.current >= 0) mover(activo.current, true) }
    window.addEventListener('scroll', pedir, { passive: true })
    window.addEventListener('resize', ajustar)
    document.fonts?.ready.then(ajustar)
    revisar()
    return () => { window.removeEventListener('scroll', pedir); window.removeEventListener('resize', ajustar); cancelAnimationFrame(raf) }
  }, [inicio])

  const cerrar = useCallback((despues?: () => void) => {
    const el = capa.current
    const fin = () => { fijarPagina(false); setMenu(false); despues?.() }
    if (!el || reducido()) { fin(); return }
    gsap.to(el, { opacity: 0, duration: 0.25, ease: 'power2.in', onComplete: fin })
  }, [])

  // Menú de pantalla completa: entra con un fundido y los enlaces suben uno tras otro
  useEffect(() => {
    if (!menu) return
    fijarPagina(true)
    const el = capa.current
    if (el && !reducido()) {
      gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' })
      gsap.fromTo(el.querySelectorAll('[data-menu-item]'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power3.out', stagger: 0.06, delay: 0.1 })
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar() }
    window.addEventListener('keydown', tecla)
    return () => { window.removeEventListener('keydown', tecla); fijarPagina(false) }
  }, [menu, cerrar])

  // En el inicio, un enlace del menú cierra el menú y luego baja a la sección
  const irDesdeMenu = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (!inicio) { fijarPagina(false); return }
    e.preventDefault()
    cerrar(() => document.getElementById(id)?.scrollIntoView({ behavior: reducido() ? 'auto' : 'smooth' }))
  }

  return (
    <>
      <nav className="wn-pill" aria-label="Navegación principal">
        <Logo inicio={inicio} />
        <div className="wn-enlaces">
          <span ref={resaltado} className="wn-resaltado" aria-hidden="true" />
          {SECCIONES.map((s, i) => (
            <a key={s.id} ref={el => { enlaces.current[i] = el }} href={href(s.id)} className={'wn-enlace' + (i === actual ? ' wn-activo' : '')} aria-current={i === actual ? 'location' : undefined}>{s.label}</a>
          ))}
        </div>
        <a href={INICIAR_SESION} className="wn-sesion">Iniciar sesión</a>
        <a href={waHref} target="_blank" rel="noopener noreferrer" className="wn-cta">Agenda una demo</a>
      </nav>

      <nav className="wn-barra" aria-label="Navegación móvil">
        <Logo inicio={inicio} />
        <div className="wn-barra-acciones">
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="wn-cta wn-cta-chica">Agenda una demo</a>
          <button type="button" className="wn-boton-menu" aria-label="Abrir el menú" aria-expanded={menu} aria-controls="menu-movil" onClick={() => setMenu(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
          </button>
        </div>
      </nav>

      {menu && (
        <div ref={capa} id="menu-movil" className="wn-menu" role="dialog" aria-modal="true" aria-label="Menú">
          <div className="wn-menu-velo" />
          <div className="wn-menu-panel">
            <div className="wn-menu-cabecera">
              <Logo inicio={inicio} onClick={e => irDesdeMenu(e, 'producto')} />
              <button type="button" className="wn-boton-cerrar" aria-label="Cerrar el menú" onClick={() => cerrar()}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="wn-menu-enlaces">
              {SECCIONES.map(s => (
                <a key={s.id} data-menu-item="" href={href(s.id)} className="wn-menu-enlace" onClick={e => irDesdeMenu(e, s.id)}>{s.label}</a>
              ))}
            </div>
            <div className="wn-menu-pie" data-menu-item="">
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="wn-menu-cta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" /><path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" /></svg>
                Agenda una demo
              </a>
              <div className="wn-menu-secundarios">
                <a href={INICIAR_SESION}>Iniciar sesión</a>
                <a href="/privacy">Privacidad</a>
                <a href="/terms">Condiciones</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
