/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 07 Mesero virtual
export function MeseroVirtual({ v }: { v: LandingVals }) {
  return (
    <section id="mesero" data-waiter="" data-screen-label="07 Mesero virtual" style={{ padding: 'clamp(80px,10vw,128px) 0', borderTop: '1px solid #E2E8F0', overflow: 'hidden', backgroundColor: '#FFFBEB', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px' }}>
      {' '}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,460px),1fr))', gap: '48px', alignItems: 'center' }}>
        {' '}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {' '}
          <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Mesero virtual</span>
            {' '}
            <h2 style={{ margin: '0', fontSize: 'clamp(34px,4.5vw,56px)', lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600', textWrap: 'balance' }}>
              Un mesero que habla{' '}
              <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', color: '#1F4FC2' }}>como tu ciudad.</span>
            </h2>
            {' '}
            <p style={{ margin: '0', fontSize: '18px', lineHeight: '1.55', color: '#475569', textWrap: 'pretty' }}>Saluda, pregunta el nombre, recomienda lo mejor de la casa y sugiere con qué acompañarlo. Tú escoges cómo habla.</p>
            {' '}
          </div>
          {' '}
          <div role="group" aria-label="Tono del mesero" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {' '}
            {v.tones.map((t, i) => (
              <button key={i} onClick={t.onClick} style={{ height: '44px', padding: '0 16px', borderRadius: '999px', border: `1px solid ${t.bd}`, background: t.bg, color: t.fg, fontFamily: 'inherit', fontSize: '15px', fontWeight: '600', cursor: 'pointer' }}>{t.label}</button>
            ))}
            {' '}
          </div>
          {' '}
          <div data-chat="" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '24px', overflow: 'hidden' }}>
            {' '}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
              {' '}
              <span style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundImage: 'url(/img/mesero.webp)', backgroundSize: '280%', backgroundPosition: '46% 6%', backgroundColor: '#EEF4FF', flex: 'none' }}></span>
              {' '}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '15px', fontWeight: '600' }}>Mi mesero · Burger House</span>
                <span style={{ fontSize: '14px', color: '#475569' }}>{v.toneName}</span>
              </div>
              {' '}
            </div>
            {' '}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '18px', minHeight: '340px' }}>
              {' '}
              <div data-bubble="0" style={{ alignSelf: 'flex-start', maxWidth: '88%', background: '#F1F5F9', borderRadius: '16px 16px 16px 4px', padding: '11px 14px', fontSize: '16px', lineHeight: '1.5', opacity: '0' }}>
                <span data-text=""></span>
              </div>
              {' '}
              <div data-bubble="1" style={{ alignSelf: 'flex-end', maxWidth: '80%', background: '#2F66E6', color: '#FFFFFF', borderRadius: '16px 16px 4px 16px', padding: '11px 14px', fontSize: '16px', lineHeight: '1.5', opacity: '0' }}>
                <span data-text=""></span>
              </div>
              {' '}
              <div data-bubble="2" style={{ alignSelf: 'flex-start', maxWidth: '88%', background: '#F1F5F9', borderRadius: '16px 16px 16px 4px', padding: '11px 14px', fontSize: '16px', lineHeight: '1.5', opacity: '0' }}>
                <span data-text=""></span>
              </div>
              {' '}
              <div data-bubble="3" style={{ alignSelf: 'flex-start', maxWidth: '88%', background: '#F1F5F9', borderRadius: '16px 16px 16px 4px', padding: '11px 14px', fontSize: '16px', lineHeight: '1.5', opacity: '0' }}>
                <span data-text=""></span>
              </div>
              {' '}
              <div data-bubble="4" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', opacity: '0' }}>
                {' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px 6px 6px', borderRadius: '999px', border: '1px solid #E2E8F0', fontSize: '15px', fontWeight: '600' }}>
                  <img loading="lazy" decoding="async" src="/img/plato-limonada.webp" alt="" style={{ width: '30px', height: '30px', objectFit: 'contain' }} />
                  Limonada de coco · $ 9.000
                </span>
                {' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px 6px 6px', borderRadius: '999px', border: '1px solid #E2E8F0', fontSize: '15px', fontWeight: '600' }}>
                  <img loading="lazy" decoding="async" src="/img/plato-cerveza.webp" alt="" style={{ width: '30px', height: '30px', objectFit: 'contain' }} />
                  Cerveza · $ 8.000
                </span>
                {' '}
              </div>
              {' '}
              <div data-typing="" style={{ alignSelf: 'flex-start', display: 'flex', gap: '5px', padding: '12px 14px', borderRadius: '16px', background: '#F1F5F9', opacity: '0' }}>
                {' '}
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#94A3B8' }}></span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#94A3B8' }}></span>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#94A3B8' }}></span>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          <span style={{ fontSize: '14px', color: '#475569' }}>Son frases reales de Waiter. El mesero nunca inventa precios ni promesas: una revisión lo bloquea.</span>
          {' '}
        </div>
        {' '}
        <div style={{ position: 'relative', width: '100%', maxWidth: '520px', margin: '0 auto', aspectRatio: '840/980' }}>
          {' '}
          <img loading="lazy" decoding="async" src="/img/guilloche-roseta.svg" alt="" aria-hidden="true" style={{ position: 'absolute', left: '-18%', top: '6%', width: '120%', opacity: '.45' }} />
          {' '}
          <img loading="lazy" decoding="async" data-tone-img="neutro" src="/img/mesero.webp" alt="El mesero virtual de Waiter con una bandeja y una limonada" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%' }} />
          {' '}
          <img loading="lazy" decoding="async" data-tone-img="paisa" src="/img/mesero-paisa.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' }} />
          {' '}
          <img loading="lazy" decoding="async" data-tone-img="rolo" src="/img/mesero-rolo.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' }} />
          {' '}
          <img loading="lazy" decoding="async" data-tone-img="costeno" src="/img/mesero-costeno.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' }} />
          {' '}
          <img loading="lazy" decoding="async" data-tone-img="caleno" src="/img/mesero-caleno.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' }} />
          {' '}
          <img loading="lazy" decoding="async" data-tone-img="santandereano" src="/img/mesero-santandereano.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' }} />
          {' '}
          <img loading="lazy" decoding="async" data-boca-a="" src="/img/mesero-boca-a.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0' }} />
          {' '}
          <img loading="lazy" decoding="async" data-mouth="" src="/img/mesero-boca-e.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', maskImage: 'radial-gradient(ellipse 7% 4% at 52% 22%, #000 55%, transparent 100%)' }} />
          {' '}
          <img loading="lazy" decoding="async" data-blink="" src="/img/mesero-ojos-cerrados.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', maskImage: 'radial-gradient(ellipse 10% 3.4% at 51% 16%, #000 55%, transparent 100%)' }} />
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </section>
  )
}
