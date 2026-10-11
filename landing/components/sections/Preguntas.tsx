/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 12 Preguntas
export function Preguntas({ v }: { v: Pick<LandingVals, 'faqs'> }) {
  return (
    <section id="preguntas" data-screen-label="12 Preguntas" style={{ padding: 'clamp(80px,10vw,128px) 0', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
      {' '}
      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '36px' }}>
        {' '}
        <div data-reveal="" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Preguntas</span>
            {' '}
            <h2 style={{ margin: '0', fontSize: 'clamp(34px,4.5vw,56px)', lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600' }}>
              Lo que nos{' '}
              <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', color: '#1F4FC2' }}>preguntan.</span>
            </h2>
            {' '}
          </div>
          {' '}
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', flex: 'none' }}>
            {' '}
            <img loading="lazy" decoding="async" src="/img/mesa-tenedor.webp" alt="" style={{ height: 'clamp(84px,11vw,124px)' }} />
            {' '}
            <img data-salt="" loading="lazy" decoding="async" src="/img/mesa-salero.webp" alt="" style={{ height: 'clamp(78px,10vw,112px)', transformOrigin: '50% 90%' }} />
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        <div style={{ borderTop: '1px solid #E2E8F0' }}>
          {' '}
          {v.faqs.map((f, i) => (
            <details key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
              {' '}
              <summary style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '22px 0', cursor: 'pointer', fontSize: '19px', fontWeight: '600', letterSpacing: '-0.01em' }}>
                {f.q}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '20px', height: '20px', flex: 'none', color: '#2F66E6' }}>
                  <path d="M12 5l0 14"></path>
                  {' '}
                  <path d="M5 12l14 0"></path>
                </svg>
              </summary>
              {' '}
              <p style={{ margin: '0 0 22px', fontSize: '17px', lineHeight: '1.6', color: '#475569', maxWidth: '720px' }}>{f.a}</p>
              {' '}
            </details>
          ))}
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </section>
  )
}
