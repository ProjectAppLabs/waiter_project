// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 00 Navegación
export function Nav({ v }: { v: LandingVals }) {
  return (
    <nav data-nav="" style={{ position: 'fixed', top: '0', left: '0', right: '0', zIndex: '50', height: '92px', display: 'flex', alignItems: 'center', borderBottom: '1px solid transparent', transition: 'height .25s ease, background-color .25s ease, border-color .25s ease' }}>
      {' '}
      <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: '32px' }}>
        {' '}
        <a href="#producto" style={{ display: 'flex', flexDirection: 'column', lineHeight: '1', color: '#0F172A' }}>
          {' '}
          <span style={{ fontWeight: '600', fontSize: '24px', letterSpacing: '-0.02em' }}>Waiter.</span>
          {' '}
          <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>By ProjectApp.</span>
          {' '}
        </a>
        {' '}
        <div style={{ display: v.navLinksDisplay, alignItems: 'center', gap: '28px', fontSize: '15px', fontWeight: '500' }}>
          {' '}
          <a className="wl-h0" href="#como-funciona" style={{ color: '#475569' }}>Producto</a>
          {' '}
          <a className="wl-h0" href="#modulos" style={{ color: '#475569' }}>Módulos</a>
          {' '}
          <a className="wl-h0" href="#domicilios" style={{ color: '#475569' }}>Domicilios</a>
          {' '}
          <a className="wl-h0" href="#precios" style={{ color: '#475569' }}>Precios</a>
          {' '}
          <a className="wl-h0" href="#preguntas" style={{ color: '#475569' }}>Preguntas</a>
          {' '}
        </div>
        {' '}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '16px' }}>
          {' '}
          <a href="#" style={{ display: v.navLinksDisplay, fontSize: '15px', fontWeight: '600', color: '#0F172A', whiteSpace: 'nowrap' }}>Iniciar sesión</a>
          {' '}
          <a className="wl-h1" href={v.waHref} target="_blank" rel="noopener noreferrer" style={{ height: '48px', padding: '0 20px', borderRadius: '12px', background: '#2F66E6', color: '#FFFFFF', fontSize: '15px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>Agenda una demo</a>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </nav>
  )
}
