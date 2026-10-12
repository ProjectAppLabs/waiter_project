/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import { INICIAR_SESION } from '@/lib/sesion'
import type { LandingVals } from '../vals'

// 14 Pie
export function Pie({ v }: { v: Pick<LandingVals, 'waHref'> }) {
  return (
    <footer data-screen-label="14 Pie" style={{ position: 'relative', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px' }}>
      {' '}
      <img loading="lazy" decoding="async" src="/img/mesa-mata.webp" alt="" aria-hidden="true" style={{ position: 'absolute', right: 'max(24px,calc(50% - 560px))', top: '-96px', width: '124px', zIndex: '2', pointerEvents: 'none' }} />
      {' '}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px 24px 40px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
        {' '}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: '36px' }}>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {' '}
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1' }}>
              <span style={{ fontWeight: '600', fontSize: '28px', letterSpacing: '-0.02em' }}>Waiter.</span>
              <span style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>By ProjectApp.</span>
            </div>
            {' '}
            <span style={{ fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Waiter es un producto de ProjectApp. Medellín, Colombia.</span>
            {' '}
          </div>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '15px' }}>
            {' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#475569' }}>Producto</span>
            {' '}
            <a href="#como-funciona" style={{ color: '#0F172A' }}>Cómo funciona</a>
            <a href="#domicilios" style={{ color: '#0F172A' }}>Domicilios</a>
            <a href="#mesero" style={{ color: '#0F172A' }}>Mesero virtual</a>
            <a href="#precios" style={{ color: '#0F172A' }}>Precios</a>
            {' '}
          </div>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '15px' }}>
            {' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#475569' }}>Módulos</span>
            {' '}
            <a href="#modulos" style={{ color: '#0F172A' }}>Operación</a>
            <a href="#modulos" style={{ color: '#0F172A' }}>Ventas digitales</a>
            <a href="#modulos" style={{ color: '#0F172A' }}>Inteligencia</a>
            <a href="#modulos" style={{ color: '#0F172A' }}>Cumplimiento</a>
            {' '}
          </div>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '15px' }}>
            {' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#475569' }}>Empresa</span>
            {' '}
            <a href="https://projectapp.co/es-co" style={{ color: '#0F172A' }}>ProjectApp.</a>
            <a href={v.waHref} target="_blank" rel="noopener noreferrer" style={{ color: '#0F172A' }}>Contacto</a>
            <a href={INICIAR_SESION} style={{ color: '#0F172A' }}>Iniciar sesión</a>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px 24px', paddingTop: '24px', borderTop: '1px solid #E2E8F0', fontSize: '14px', color: '#475569' }}>
          {' '}
          <span>© 2026 ProjectApp.</span>
          {' '}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            <a href="/privacy" style={{ color: '#475569' }}>Política de privacidad</a>
            <a href="/terms" style={{ color: '#475569' }}>Condiciones del servicio</a>
            <a href="/data-deletion" style={{ color: '#475569' }}>Eliminación de datos</a>
          </div>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </footer>
  )
}
