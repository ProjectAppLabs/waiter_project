/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 04 Así funciona
export function AsiFunciona({ v }: { v: Pick<LandingVals, 'howCols' | 'howGap' | 'howH2' | 'howPad' | 'howRows' | 'stageH' | 'steps'> }) {
  return (
    <section id="como-funciona" data-how="" data-screen-label="04 Así funciona" style={{ position: 'relative', height: '420vh', background: '#FFFFFF', borderTop: '1px solid #E2E8F0' }}>
      {' '}
      <div style={{ position: 'sticky', top: '0', height: '100vh', overflow: 'hidden' }}>
        {' '}
        <div style={{ maxWidth: '1200px', height: '100%', margin: '0 auto', padding: v.howPad, display: 'grid', gridTemplateColumns: v.howCols, gridTemplateRows: v.howRows, gap: v.howGap, alignItems: 'center' }}>
          {' '}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative', zIndex: '5' }}>
            {' '}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {' '}
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Así funciona</span>
              {' '}
              <h2 style={{ margin: '0', fontSize: v.howH2, lineHeight: '1.08', letterSpacing: '-0.025em', fontWeight: '600', textWrap: 'balance' }}>
                De la mesa a la cocina,{' '}
                <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', color: '#1F4FC2' }}>sin esperar a nadie.</span>
              </h2>
              {' '}
            </div>
            {' '}
            <ol style={{ listStyle: 'none', margin: '0', padding: '0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {' '}
              {v.steps.map((st, i) => (
                <li key={i} onClick={st.onClick} style={{ display: st.display, gridTemplateColumns: '3px 40px minmax(0,1fr)', gap: '0 14px', padding: '12px 0', cursor: 'pointer', opacity: st.opacity, transition: 'opacity .35s ease' }}>
                  {' '}
                  <span style={{ width: '3px', borderRadius: '3px', background: st.bar, transition: 'background .35s ease' }}></span>
                  {' '}
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6', paddingTop: '3px' }}>{st.n}</span>
                  {' '}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {' '}
                    <span style={{ fontSize: '20px', fontWeight: '600', letterSpacing: '-0.01em' }}>{st.title}</span>
                    {' '}
                    <span style={{ display: st.textDisplay, fontSize: '16px', lineHeight: '1.55', color: '#475569', textWrap: 'pretty' }}>{st.text}</span>
                    {' '}
                  </div>
                  {' '}
                </li>
              ))}
              {' '}
            </ol>
            {' '}
          </div>
          {' '}
          <div data-how-stage="" style={{ position: 'relative', height: v.stageH, minHeight: '0' }}>
            {' '}
            <div style={{ position: 'absolute', inset: '0', display: 'flex', justifyContent: 'center' }}>
              {' '}
              <div data-how-hand="" style={{ position: 'relative', flex: 'none', height: '118%', aspectRatio: '3/4', marginTop: '-6%', zIndex: '2' }}>
                {' '}
                <div style={{ position: 'absolute', left: '27.3%', top: '8.4%', width: '35.8%', height: '60.3%', containerType: 'inline-size', overflow: 'hidden', background: '#FFFFFF' }}>
                  {' '}
                  <div data-how-screen="0" style={{ position: 'absolute', inset: '0', background: '#FFFFFF', display: 'flex', flexDirection: 'column' }}>
                    {' '}
                    <div style={{ background: '#7A2E2A', color: '#FFFFFF', padding: '15cqw 6cqw 6cqw', display: 'flex', flexDirection: 'column', gap: '2.4cqw' }}>
                      {' '}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontFamily: "'Fraunces',serif", fontSize: '6.4cqw', fontWeight: '600' }}>Burger House</span>
                        <span style={{ fontSize: '3.8cqw', background: '#F2EAEA', color: '#7A2E2A', borderRadius: '99px', padding: '1cqw 2.8cqw', fontWeight: '600' }}>Mesa 4</span>
                      </div>
                      {' '}
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: '9cqw', lineHeight: '1.05' }}>¿Qué te provoca hoy?</span>
                      {' '}
                    </div>
                    {' '}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3cqw', padding: '5cqw 6cqw' }}>
                      {' '}
                      <div style={{ display: 'grid', gridTemplateColumns: '22cqw minmax(0,1fr) 10cqw', gap: '3cqw', alignItems: 'center', padding: '2.4cqw', border: '1px solid #F2EAEA', borderRadius: '4cqw' }}>
                        {' '}
                        <img loading="lazy" decoding="async" src="/img/plato-hamburguesa.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                        {' '}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                          <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Hamburguesa de la casa</span>
                          <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 32.000</span>
                        </div>
                        {' '}
                        <span style={{ width: '10cqw', height: '10cqw', borderRadius: '50%', background: '#F59E0B', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6cqw' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '1em', height: '1em', flex: 'none' }}>
                            <path d="M12 5l0 14"></path>
                            {' '}
                            <path d="M5 12l14 0"></path>
                          </svg>
                        </span>
                        {' '}
                      </div>
                      {' '}
                      <div style={{ display: 'grid', gridTemplateColumns: '22cqw minmax(0,1fr) 10cqw', gap: '3cqw', alignItems: 'center', padding: '2.4cqw', border: '1px solid #F2EAEA', borderRadius: '4cqw' }}>
                        {' '}
                        <img loading="lazy" decoding="async" src="/img/plato-arepa.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                        {' '}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                          <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Arepa con queso</span>
                          <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 8.000</span>
                        </div>
                        {' '}
                        <span style={{ width: '10cqw', height: '10cqw', borderRadius: '50%', background: '#F59E0B', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6cqw' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '1em', height: '1em', flex: 'none' }}>
                            <path d="M12 5l0 14"></path>
                            {' '}
                            <path d="M5 12l14 0"></path>
                          </svg>
                        </span>
                        {' '}
                      </div>
                      {' '}
                      <div style={{ display: 'grid', gridTemplateColumns: '22cqw minmax(0,1fr) 10cqw', gap: '3cqw', alignItems: 'center', padding: '2.4cqw', border: '1px solid #F2EAEA', borderRadius: '4cqw' }}>
                        {' '}
                        <img loading="lazy" decoding="async" src="/img/plato-bandeja.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                        {' '}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                          <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Bandeja paisa</span>
                          <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 34.000</span>
                        </div>
                        {' '}
                        <span style={{ width: '10cqw', height: '10cqw', borderRadius: '50%', background: '#F59E0B', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6cqw' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '1em', height: '1em', flex: 'none' }}>
                            <path d="M12 5l0 14"></path>
                            {' '}
                            <path d="M5 12l14 0"></path>
                          </svg>
                        </span>
                        {' '}
                      </div>
                      {' '}
                      <div style={{ display: 'grid', gridTemplateColumns: '22cqw minmax(0,1fr) 10cqw', gap: '3cqw', alignItems: 'center', padding: '2.4cqw', border: '1px solid #F2EAEA', borderRadius: '4cqw' }}>
                        {' '}
                        <img loading="lazy" decoding="async" src="/img/plato-tinto.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                        {' '}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                          <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Tinto</span>
                          <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 3.000</span>
                        </div>
                        {' '}
                        <span style={{ width: '10cqw', height: '10cqw', borderRadius: '50%', background: '#F59E0B', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6cqw' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '1em', height: '1em', flex: 'none' }}>
                            <path d="M12 5l0 14"></path>
                            {' '}
                            <path d="M5 12l14 0"></path>
                          </svg>
                        </span>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                  <div data-how-screen="1" style={{ position: 'absolute', inset: '0', background: '#FFFFFF', display: 'flex', flexDirection: 'column', opacity: '0' }}>
                    {' '}
                    <div style={{ padding: '14cqw 5cqw 4cqw', display: 'flex', alignItems: 'center', gap: '3cqw', borderBottom: '1px solid #F2EAEA' }}>
                      {' '}
                      <span style={{ width: '10cqw', height: '10cqw', borderRadius: '50%', backgroundImage: 'url(/img/mesero.webp)', backgroundSize: '280%', backgroundPosition: '46% 6%', backgroundColor: '#EEF4FF', flex: 'none' }}></span>
                      {' '}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '.4cqw' }}>
                        <span style={{ fontSize: '5cqw', fontWeight: '600' }}>Mi mesero</span>
                        <span style={{ fontSize: '3.6cqw', color: '#475569' }}>Burger House</span>
                      </div>
                      {' '}
                    </div>
                    {' '}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3cqw', padding: '5cqw' }}>
                      {' '}
                      <span data-how-msg="" style={{ alignSelf: 'flex-start', maxWidth: '86%', background: '#F2EAEA', color: '#0F172A', fontSize: '4.3cqw', lineHeight: '1.35', padding: '3cqw 3.6cqw', borderRadius: '4cqw 4cqw 4cqw 1cqw' }}>¡Buenas noches! Qué gusto atenderlo. Hoy le recomiendo la Hamburguesa de la casa. ¿Por dónde quiere empezar?</span>
                      {' '}
                      <span data-how-msg="" style={{ alignSelf: 'flex-end', maxWidth: '80%', background: '#7A2E2A', color: '#FFFFFF', fontSize: '4.3cqw', lineHeight: '1.35', padding: '3cqw 3.6cqw', borderRadius: '4cqw 4cqw 1cqw 4cqw' }}>Esa, por favor.</span>
                      {' '}
                      <span data-how-msg="" style={{ alignSelf: 'flex-start', maxWidth: '86%', background: '#F2EAEA', color: '#0F172A', fontSize: '4.3cqw', lineHeight: '1.35', padding: '3cqw 3.6cqw', borderRadius: '4cqw 4cqw 4cqw 1cqw' }}>¡Listo! Ya le agregué eso a Mi pedido. ¿Le gustaría acompañarlo con algo de tomar?</span>
                      {' '}
                      <div data-how-msg="" style={{ display: 'flex', gap: '2cqw', flexWrap: 'wrap' }}>
                        {' '}
                        <span style={{ fontSize: '3.8cqw', fontWeight: '600', padding: '1.8cqw 3.2cqw', borderRadius: '99px', border: '1px solid #7A2E2A', color: '#7A2E2A' }}>Limonada de coco</span>
                        {' '}
                        <span style={{ fontSize: '3.8cqw', fontWeight: '600', padding: '1.8cqw 3.2cqw', borderRadius: '99px', border: '1px solid #7A2E2A', color: '#7A2E2A' }}>Tinto</span>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                  <div data-how-screen="2" style={{ position: 'absolute', inset: '0', background: '#FFFFFF', display: 'flex', flexDirection: 'column', opacity: '0' }}>
                    {' '}
                    <div style={{ background: '#7A2E2A', color: '#FFFFFF', padding: '15cqw 6cqw 6cqw', display: 'flex', flexDirection: 'column', gap: '1.6cqw' }}>
                      {' '}
                      <span style={{ fontSize: '3.8cqw', color: '#F2EAEA' }}>Mesa 4 · Pedido 128</span>
                      {' '}
                      <span style={{ fontFamily: "'Fraunces',serif", fontSize: '9cqw', lineHeight: '1.05' }}>Tu pedido</span>
                      {' '}
                    </div>
                    {' '}
                    <div style={{ padding: '6cqw', display: 'flex', flexDirection: 'column', gap: '5cqw' }}>
                      {' '}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '3cqw', fontSize: '4.4cqw' }}>
                        <span>1 × Hamburguesa de la casa</span>
                        <span style={{ fontWeight: '700' }}>$ 32.000</span>
                      </div>
                      {' '}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '3cqw', fontSize: '4.4cqw' }}>
                        <span>1 × Limonada de coco</span>
                        <span style={{ fontWeight: '700' }}>$ 9.000</span>
                      </div>
                      {' '}
                      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4cqw', padding: '5cqw', borderRadius: '4cqw', background: '#F8FAFC' }}>
                        {' '}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3cqw', fontSize: '4.4cqw' }}>
                          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style={{ width: '6cqw', height: '6cqw', flex: 'none', color: '#22C55E' }}>
                            <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"></path>
                          </svg>
                          Recibido
                        </span>
                        {' '}
                        <span data-how-cooking="" style={{ display: 'flex', alignItems: 'center', gap: '3cqw', fontSize: '4.4cqw', fontWeight: '600', color: '#3538CD' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '6cqw', height: '6cqw', flex: 'none' }}>
                            <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z"></path>
                          </svg>
                          En cocina
                        </span>
                        {' '}
                        <span data-how-ready="" style={{ position: 'absolute', left: '5cqw', top: '15cqw', display: 'flex', alignItems: 'center', gap: '3cqw', fontSize: '4.4cqw', fontWeight: '600', color: '#15803D', opacity: '0', background: '#F8FAFC', paddingRight: '4cqw' }}>
                          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style={{ width: '6cqw', height: '6cqw', flex: 'none', color: '#22C55E' }}>
                            <path d="M17 3.34a10 10 0 1 1 -14.995 8.984l-.005 -.324l.005 -.324a10 10 0 0 1 14.995 -8.336zm-1.293 5.953a1 1 0 0 0 -1.32 -.083l-.094 .083l-3.293 3.292l-1.293 -1.292l-.094 -.083a1 1 0 0 0 -1.403 1.403l.083 .094l2 2l.094 .083a1 1 0 0 0 1.226 0l.094 -.083l4 -4l.083 -.094a1 1 0 0 0 -.083 -1.32z"></path>
                          </svg>
                          Listo para servir
                        </span>
                        {' '}
                      </div>
                      {' '}
                    </div>
                    {' '}
                  </div>
                  {' '}
                  <div data-how-screen="3" style={{ position: 'absolute', inset: '0', background: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '18cqw 7cqw 8cqw', gap: '3cqw', opacity: '0' }}>
                    {' '}
                    <img loading="lazy" decoding="async" src="/img/trofeo.webp" alt="" style={{ width: '46cqw', height: '46cqw', objectFit: 'contain' }} />
                    {' '}
                    <span style={{ fontFamily: "'Fraunces',serif", fontSize: '8.6cqw', lineHeight: '1.05', color: '#7A2E2A' }}>¡Gracias por venir!</span>
                    {' '}
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13cqw', fontWeight: '500', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                      +
                      <span data-how-points="">41</span>
                    </span>
                    {' '}
                    <span style={{ fontSize: '4.4cqw', color: '#475569' }}>puntos para tu próxima visita, en cualquier sede</span>
                    {' '}
                    <span style={{ marginTop: 'auto', width: '100%', height: '13cqw', borderRadius: '4cqw', background: '#F0FDF4', color: '#15803D', fontSize: '4.4cqw', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2cqw' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '5.4cqw', height: '5.4cqw', flex: 'none' }}>
                        <path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2m4 -14h6m-6 4h6m-2 4h2"></path>
                      </svg>
                      Cuenta pedida
                    </span>
                    {' '}
                  </div>
                  {' '}
                </div>
                {' '}
                <img loading="lazy" decoding="async" src="/img/mano-telefono.webp" alt="Mano de una comensal con el celular" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }} />
                {' '}
              </div>
              {' '}
            </div>
            {' '}
            <div data-how-cook="" style={{ position: 'absolute', right: '-6%', bottom: '-4%', height: '70%', aspectRatio: '1', zIndex: '3', opacity: '0' }}>
              {' '}
              <div data-how-kds="" style={{ position: 'absolute', inset: '0', background: '#EEF4FF', clipPath: 'polygon(7.3% 20.7%,26.5% 24%,27.3% 42.2%,8.5% 41.9%)' }}></div>
              {' '}
              <img loading="lazy" decoding="async" data-cook-img="" src="/img/cocinera.webp" alt="Cocinera tocando la pantalla de cocina" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }} />
              {' '}
            </div>
            {' '}
            <div data-how-callout="" style={{ position: 'absolute', top: '0', right: '0', width: 'min(46%,250px)', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: '4', opacity: '0' }}>
              {' '}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#475569' }}>Cocina · Parrilla</span>
                <span data-kds-timer="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '13px', color: '#0F172A' }}>00:00</span>
              </div>
              {' '}
              <span style={{ fontSize: '17px', fontWeight: '600', letterSpacing: '-0.01em' }}>Mesa 4 · 1 × Hamburguesa</span>
              {' '}
              <span style={{ position: 'relative', display: 'flex', height: '28px', marginTop: '4px' }}>
                {' '}
                <span data-kds-cooking="" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '13px', fontWeight: '600', padding: '0 10px', borderRadius: '999px', background: '#EEF4FF', color: '#3538CD' }}>En cocina</span>
                {' '}
                <span data-kds-ready="" style={{ position: 'absolute', left: '0', top: '0', height: '28px', display: 'inline-flex', alignItems: 'center', fontSize: '13px', fontWeight: '600', padding: '0 10px', borderRadius: '999px', background: '#F0FDF4', color: '#15803D', opacity: '0' }}>Listo · aviso al salón</span>
                {' '}
              </span>
              {' '}
            </div>
            {' '}
            <img loading="lazy" decoding="async" data-coin="" src="/img/moneda-1.webp" alt="" aria-hidden="true" style={{ position: 'absolute', left: '40%', top: '-4%', width: '9%', zIndex: '4', opacity: '0' }} />
            {' '}
            <img loading="lazy" decoding="async" data-coin="" src="/img/moneda-2.webp" alt="" aria-hidden="true" style={{ position: 'absolute', left: '52%', top: '-8%', width: '8%', zIndex: '4', opacity: '0' }} />
            {' '}
            <img loading="lazy" decoding="async" data-coin="" src="/img/moneda-3.webp" alt="" aria-hidden="true" style={{ position: 'absolute', left: '47%', top: '-14%', width: '3.2%', zIndex: '4', opacity: '0' }} />
            {' '}
          </div>
          {' '}
        </div>
        {' '}
      </div>
      {' '}
    </section>
  )
}
