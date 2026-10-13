/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 13 CTA final
export function CtaFinal({ v }: { v: Pick<LandingVals, 'waHref'> }) {
  return (
    <section data-screen-label="13 CTA final" style={{ position: 'relative', background: '#0B1430', color: '#FFFFFF', overflow: 'hidden', padding: 'clamp(88px,11vw,140px) 0 0' }}>
      {' '}
      <div aria-hidden="true" style={{ position: 'absolute', inset: '0', background: 'linear-gradient(150deg,#152A78,#0D1840 55%,#0B1430)' }}></div>
      {' '}
      <div aria-hidden="true" style={{ position: 'absolute', inset: '0', overflow: 'hidden' }}>
        {' '}
        <span data-blob="" style={{ position: 'absolute', left: '4%', top: '4%', width: '340px', height: '340px', borderRadius: '50%', background: '#447DFC', filter: 'blur(44px)', mixBlendMode: 'screen', opacity: '.42' }}></span>
        {' '}
        <span data-blob="" style={{ position: 'absolute', left: '58%', top: '-6%', width: '300px', height: '300px', borderRadius: '50%', background: '#6172F3', filter: 'blur(44px)', mixBlendMode: 'screen', opacity: '.4' }}></span>
        {' '}
        <span data-blob="" style={{ position: 'absolute', left: '78%', top: '20%', width: '220px', height: '220px', borderRadius: '50%', background: '#F59E0B', filter: 'blur(44px)', mixBlendMode: 'screen', opacity: '.22' }}></span>
        {' '}
        <span data-blob="" style={{ position: 'absolute', left: '22%', top: '30%', width: '240px', height: '240px', borderRadius: '50%', background: '#2DD4A7', filter: 'blur(44px)', mixBlendMode: 'screen', opacity: '.18' }}></span>
        {' '}
        <span data-blob="" style={{ position: 'absolute', left: '40%', top: '12%', width: '200px', height: '200px', borderRadius: '50%', background: '#F4628C', filter: 'blur(44px)', mixBlendMode: 'screen', opacity: '.16' }}></span>
        {' '}
      </div>
      {' '}
      <div style={{ position: 'relative', maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '22px' }}>
        {' '}
        <h2 data-reveal="" style={{ margin: '0', fontSize: 'clamp(56px,9vw,120px)', lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '600' }}>
          ¿Hablamos
          <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400' }}>?</span>
        </h2>
        {' '}
        <p data-reveal="" style={{ margin: '0', fontSize: '20px', lineHeight: '1.5', color: '#E2E8F0', maxWidth: '560px' }}>Te mostramos Waiter funcionando con tu carta. Te responde una persona real.</p>
        {' '}
        <div data-reveal="" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
          {' '}
          <a className="wl-h7" href={v.waHref} target="_blank" rel="noopener noreferrer" style={{ height: '56px', padding: '0 26px', borderRadius: '12px', background: '#FFFFFF', color: '#0F172A', fontSize: '17px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '22px', height: '22px', flex: 'none', color: '#15803D' }}>
              <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9"></path>
              {' '}
              <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1"></path>
            </svg>
            Escríbenos por WhatsApp
          </a>
          {' '}
          <a className="wl-h8" href="#demo" style={{ height: '56px', padding: '0 24px', borderRadius: '12px', border: '1px solid #93B4FD', color: '#FFFFFF', fontSize: '17px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>Agenda una demo</a>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
      <div data-cta-frame="" style={{ position: 'relative', maxWidth: '1440px', margin: 'clamp(48px,7vw,80px) auto 0', padding: '0 24px' }}>
        {' '}
        <div style={{ position: 'relative', aspectRatio: '2400/1170', borderRadius: '24px 24px 0 0', overflow: 'hidden', border: '1px solid #1E2A44', borderBottom: '0' }}>
          {' '}
          <img loading="lazy" decoding="async" data-cta-img="" src="/img/viernes-8pm.webp" alt="Un restaurante lleno un viernes por la noche: comensales pidiendo desde el celular, el mesero, la cocinera y el domiciliario saliendo en moto" style={{ position: 'absolute', left: '0', top: '-5%', width: '100%', height: '110%', objectFit: 'cover', display: 'block' }} />
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </section>
  )
}
