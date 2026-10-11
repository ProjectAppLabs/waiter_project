/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 03 Dolores
export function Dolores({ v }: { v: LandingVals }) {
  return (
    <section data-screen-label="03 Dolores" style={{ padding: 'clamp(80px,10vw,128px) 0', backgroundColor: '#FFFBEB', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px' }}>
      {' '}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '48px' }}>
        {' '}
        <div data-reveal="" style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '780px' }}>
          {' '}
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Lo que ya conoces</span>
          {' '}
          <h2 style={{ margin: '0', fontSize: 'clamp(34px,4.5vw,56px)', lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600', textWrap: 'balance' }}>
            ¿Te pasa esto un viernes a las{' '}
            <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', color: '#1F4FC2' }}>8 p. m.?</span>
          </h2>
          {' '}
        </div>
        {' '}
        <div style={{ display: 'grid', gridTemplateColumns: v.painCols, gap: '16px' }}>
          {' '}
          <article data-pain="espera" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', aspectRatio: '1', padding: '6%', borderBottom: '1px solid #F1F5F9' }}>
              {' '}
              <img loading="lazy" decoding="async" src="/img/dolor-espera.webp" alt="Comensal con la mano levantada, esperando al mesero" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              {' '}
              <span style={{ position: 'absolute', top: '7%', right: '6%', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '999px', background: '#FFFFFF', border: '1px solid #E2E8F0', fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#B45309' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '15px', height: '15px', flex: 'none' }}>
                  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path>
                  {' '}
                  <path d="M12 7v5l3 3"></path>
                </svg>
                <span data-timer="">12:47</span>
              </span>
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span data-pain-num="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#94A3B8' }}>01</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>Mesas esperando al mesero</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Para pedir, para pagar, para la cuenta. Cada espera es una mesa que rota menos.</p>
              {' '}
            </div>
            {' '}
          </article>
          {' '}
          <article data-pain="tajada" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', aspectRatio: '1', padding: '6%', borderBottom: '1px solid #F1F5F9' }}>
              {' '}
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {' '}
                <img loading="lazy" decoding="async" src="/img/dolor-tajada.webp" alt="Una mano con guante se lleva una tajada de la hamburguesa" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', clipPath: 'polygon(0 0,53% 0,53% 72%,76% 72%,100% 64%,100% 100%,0 100%)' }} />
                {' '}
                <img loading="lazy" decoding="async" data-slice="" src="/img/dolor-tajada.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', clipPath: 'polygon(53% 0,100% 0,100% 64%,76% 72%,53% 72%)' }} />
                {' '}
              </div>
              {' '}
              <span data-cut="" style={{ position: 'absolute', bottom: '9%', right: '7%', padding: '5px 10px', borderRadius: '999px', background: '#FEF3F2', color: '#B91C1C', fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', fontWeight: '500' }}>−30%</span>
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span data-pain-num="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#94A3B8' }}>02</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>Comisiones que se comen el margen</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Las apps de domicilio se quedan con hasta 30% de cada pedido.</p>
              {' '}
            </div>
            {' '}
          </article>
          {' '}
          <article data-pain="comanda" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', aspectRatio: '1', padding: '6%', borderBottom: '1px solid #F1F5F9' }}>
              {' '}
              <img loading="lazy" decoding="async" data-wobble="" src="/img/dolor-comanda.webp" alt="Cocinero confundido leyendo una comanda arrugada" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span data-pain-num="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#94A3B8' }}>03</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>Comandas que llegan mal a cocina</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Papelitos, gritos y platos repetidos.</p>
              {' '}
            </div>
            {' '}
          </article>
          {' '}
          <article data-pain="nevera" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {' '}
            <div style={{ position: 'relative', aspectRatio: '1', padding: '6%', borderBottom: '1px solid #F1F5F9' }}>
              {' '}
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {' '}
                <img loading="lazy" decoding="async" src="/img/nevera-abierta.webp" alt="Nevera abierta con el estante de la carne vacío" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain' }} />
                {' '}
                <img loading="lazy" decoding="async" data-fridge-closed="" src="/img/nevera-cerrada.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', opacity: '0' }} />
                {' '}
              </div>
              {' '}
            </div>
            {' '}
            <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {' '}
              <span data-pain-num="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#94A3B8' }}>04</span>
              {' '}
              <h3 style={{ margin: '0', fontSize: '20px', lineHeight: '1.25', fontWeight: '600', letterSpacing: '-0.01em' }}>Inventario a ciegas</h3>
              {' '}
              <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>Te enteras de que se acabó la carne cuando el cliente ya pidió.</p>
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
