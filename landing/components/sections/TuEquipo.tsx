/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 03b Tu equipo
export function TuEquipo({ v }: { v: LandingVals }) {
  return (
    <section id="equipo" data-screen-label="03b Tu equipo" style={{ padding: 'clamp(80px,10vw,128px) 0', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px' }}>
      {' '}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
        {' '}
        <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '760px' }}>
          {' '}
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Tu equipo</span>
          {' '}
          <h2 style={{ margin: '0', fontSize: 'clamp(34px,4.5vw,56px)', lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600', textWrap: 'balance' }}>
            Tu gente atiende.{' '}
            <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', color: '#1F4FC2' }}>Waiter hace lo repetitivo.</span>
          </h2>
          {' '}
          <p style={{ margin: '0', fontSize: '18px', lineHeight: '1.55', color: '#475569', textWrap: 'pretty' }}>Las mismas personas de siempre, con menos carreras y menos papel.</p>
          {' '}
        </div>
        {' '}
        <div style={{ display: 'grid', gridTemplateColumns: v.teamCols, gap: '16px' }}>
          {' '}
          <article data-team="" data-reveal="" onMouseEnter={v.teamEnter} onMouseLeave={v.teamLeave} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', height: 'clamp(320px,32vw,420px)', backgroundColor: '#FFFBEB', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px', borderBottom: '1px solid #F1F5F9', overflow: 'hidden' }}>
              {' '}
              <img loading="lazy" decoding="async" data-team-front="" src="/img/equipo-mesero-frente.webp" alt="El mesero con su delantal azul" style={{ position: 'absolute', left: '50%', bottom: '-3%', height: '100%', transform: 'translateX(-50%)' }} />
              {' '}
              <img loading="lazy" decoding="async" data-team-side="" src="/img/equipo-mesero-perfil.webp" alt="" aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '-3%', height: '100%', transform: 'translateX(-50%)', opacity: '0' }} />
              {' '}
              <span data-team-face="" style={{ position: 'absolute', top: '14px', right: '14px', width: '76px', height: '76px', borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 0 0 1px #E2E8F0', overflow: 'hidden' }}>
                <img loading="lazy" decoding="async" src="/img/equipo-mesero-cara.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 18%' }} />
              </span>
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Salón</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>El mesero</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Deja de correr detrás de la cuenta: la mesa lo llama y la pide desde el celular.</p>
              {' '}
            </div>
            {' '}
          </article>
          {' '}
          <article data-team="" data-reveal="" onMouseEnter={v.teamEnter} onMouseLeave={v.teamLeave} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', height: 'clamp(320px,32vw,420px)', backgroundColor: '#FFFBEB', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px', borderBottom: '1px solid #F1F5F9', overflow: 'hidden' }}>
              {' '}
              <img loading="lazy" decoding="async" data-team-front="" src="/img/equipo-cocinera-frente.webp" alt="La cocinera con su pañoleta amarilla" style={{ position: 'absolute', left: '50%', bottom: '-3%', height: '100%', transform: 'translateX(-50%)' }} />
              {' '}
              <img loading="lazy" decoding="async" data-team-side="" src="/img/equipo-cocinera-perfil.webp" alt="" aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '-3%', height: '100%', transform: 'translateX(-50%)', opacity: '0' }} />
              {' '}
              <span data-team-face="" style={{ position: 'absolute', top: '14px', right: '14px', width: '76px', height: '76px', borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 0 0 1px #E2E8F0', overflow: 'hidden' }}>
                <img loading="lazy" decoding="async" src="/img/equipo-cocinera-cara.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 18%' }} />
              </span>
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Cocina</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>La cocinera</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Recibe cada comanda clara, por estación y con cronómetro. Sin gritos ni papelitos.</p>
              {' '}
            </div>
            {' '}
          </article>
          {' '}
          <article data-team="" data-reveal="" onMouseEnter={v.teamEnter} onMouseLeave={v.teamLeave} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', height: 'clamp(320px,32vw,420px)', backgroundColor: '#FFFBEB', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px', borderBottom: '1px solid #F1F5F9', overflow: 'hidden' }}>
              {' '}
              <img loading="lazy" decoding="async" data-team-front="" src="/img/equipo-domiciliario-frente.webp" alt="El domiciliario con su chaqueta y su casco" style={{ position: 'absolute', left: '50%', bottom: '-3%', height: '100%', transform: 'translateX(-50%)' }} />
              {' '}
              <img loading="lazy" decoding="async" data-team-side="" src="/img/equipo-domiciliario-perfil.webp" alt="" aria-hidden="true" style={{ position: 'absolute', left: '50%', bottom: '-3%', height: '100%', transform: 'translateX(-50%)', opacity: '0' }} />
              {' '}
              <span data-team-face="" style={{ position: 'absolute', top: '14px', right: '14px', width: '76px', height: '76px', borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 0 0 1px #E2E8F0', overflow: 'hidden' }}>
                <img loading="lazy" decoding="async" src="/img/equipo-domiciliario-cara.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 18%' }} />
              </span>
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Domicilios</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>El domiciliario</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Sale con la dirección exacta, el mapa abierto y su recibo de domicilio.</p>
              {' '}
            </div>
            {' '}
          </article>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </section>
  )
}
