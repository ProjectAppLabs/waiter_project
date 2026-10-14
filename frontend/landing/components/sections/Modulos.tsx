// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 05 Módulos
export function Modulos({ v }: { v: Pick<LandingVals, 'mods' | 'tabs'> }) {
  return (
    <section id="modulos" data-screen-label="05 Módulos" style={{ padding: 'clamp(80px,10vw,128px) 0', borderTop: '1px solid #E2E8F0', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px' }}>
      {' '}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '40px' }}>
        {' '}
        <div data-reveal="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '640px' }}>
            {' '}
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Módulos</span>
            {' '}
            <h2 style={{ margin: '0', fontSize: 'clamp(34px,4.5vw,56px)', lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600' }}>
              Arma{' '}
              <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', color: '#1F4FC2' }}>tu Waiter.</span>
            </h2>
            {' '}
            <p style={{ margin: '0', fontSize: '18px', lineHeight: '1.55', color: '#475569', textWrap: 'pretty' }}>Empiezas con el núcleo y prendes lo demás cuando lo necesites, sede por sede.</p>
            {' '}
          </div>
          {' '}
          <div role="tablist" aria-label="Grupos de módulos" style={{ display: 'inline-flex', flexWrap: 'wrap', padding: '4px', background: '#F1F5F9', borderRadius: '12px', gap: '4px' }}>
            {' '}
            {v.tabs.map((t, i) => (
              <button key={i} role="tab" onClick={t.onClick} style={{ height: '44px', padding: '0 16px', border: '0', borderRadius: '9px', fontFamily: 'inherit', fontSize: '15px', fontWeight: '600', cursor: 'pointer', background: t.bg, color: t.fg, boxShadow: t.shadow }}>{t.label}</button>
            ))}
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '16px' }}>
          {' '}
          {v.mods.map((m, i) => (
            <div key={i} className="wl-h3" data-mod-card="" onMouseEnter={m.onEnter} style={{ flex: `0 0 ${m.basis}`, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '196px' }}>
              {' '}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                {' '}
                <span style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EEF4FF', color: '#1F4FC2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span data-icon="" aria-hidden="true" style={{ width: '26px', height: '26px', display: 'block', background: '#1F4FC2', maskImage: m.mask, maskSize: '100% 100%', maskRepeat: 'no-repeat' }}></span>
                </span>
                {' '}
                <span style={{ display: m.soonDisplay, fontSize: '13px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px', background: '#FFFBEB', color: '#B45309' }}>Próximamente</span>
                {' '}
              </div>
              {' '}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {' '}
                <span style={{ fontSize: '19px', fontWeight: '600', letterSpacing: '-0.01em' }}>{m.name}</span>
                {' '}
                <span style={{ fontSize: '15px', lineHeight: '1.55', color: '#475569' }}>{m.line}</span>
                {' '}
              </div>
              {' '}
            </div>
          ))}
          {' '}
        </div>
        {' '}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
          {' '}
          <a className="wl-h2" href="#precios" style={{ height: '52px', padding: '0 22px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontSize: '16px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            Arma tu plan{' '}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '18px', height: '18px', flex: 'none' }}>
              <path d="M5 12l14 0"></path>
              {' '}
              <path d="M13 18l6 -6"></path>
              {' '}
              <path d="M13 6l6 6"></path>
            </svg>
          </a>
          {' '}
          <span style={{ fontSize: '15px', color: '#475569' }}>Cada módulo se prende y se apaga desde tu consola.</span>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </section>
  )
}
