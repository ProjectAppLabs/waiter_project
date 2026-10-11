/* eslint-disable @next/next/no-img-element */
// Generado desde «Landing Waiter.dc.html» (Claude Design) con scripts/dc2jsx.py: no editar a mano los estilos,
// regenerar. Las imágenes van con <img> porque el diseño depende de sus medidas exactas.
import type { LandingVals } from '../vals'

// 01 Hero
export function Hero({ v }: { v: Pick<LandingVals, 'waHref'> }) {
  return (
    <section id="producto" data-screen-label="01 Hero" style={{ position: 'relative', padding: '148px 0 88px', overflow: 'hidden', backgroundColor: '#FFFBEB', backgroundImage: 'url(/img/grano.png)', backgroundSize: '256px 256px' }}>
      {' '}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,480px),1fr))', gap: '56px', alignItems: 'center' }}>
        {' '}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', position: 'relative', zIndex: '2' }}>
          {' '}
          <span data-hero-fade="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: '14px', color: '#2F66E6' }}>Opera más mesas con menos carga operativa</span>
          {' '}
          <h1 style={{ margin: '0', fontSize: 'clamp(42px,5.6vw,76px)', lineHeight: '1.04', letterSpacing: '-0.035em', fontWeight: '600', textWrap: 'balance' }}>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>Tu</span>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>restaurante</span>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>atiende,</span>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>cobra</span>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>y</span>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>lleva</span>
            {' '}
            <span data-word="" style={{ display: 'inline-block' }}>domicilios.</span>
            {' '}
            <span style={{ position: 'relative', display: 'inline-block', whiteSpace: 'nowrap', fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontWeight: '400', letterSpacing: '-0.01em', color: '#1F4FC2', paddingRight: '.08em' }}>
              <span data-word="" style={{ display: 'inline-block' }}>Sin</span>
              {' '}
              <span data-word="" style={{ display: 'inline-block' }}>sumar</span>
              {' '}
              <span data-word="" style={{ display: 'inline-block' }}>meseros.</span>
              {' '}
              <svg viewBox="0 0 600 32" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', left: '-1%', bottom: '-0.14em', width: '102%', height: '0.3em', overflow: 'visible' }}>
                <path data-draw="hero" d="M6 22 C 70 12, 150 9, 236 13 S 392 22, 470 12 S 560 7, 594 15" fill="none" stroke="#447DFC" strokeWidth="7" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset="1"></path>
              </svg>
              {' '}
            </span>
            {' '}
          </h1>
          {' '}
          <p data-hero-fade="" style={{ margin: '0', fontSize: '20px', lineHeight: '1.5', color: '#475569', maxWidth: '560px', textWrap: 'pretty' }}>El cliente pide desde su mesa con un toque, la cocina recibe la comanda al instante y tú ves todo en un solo lugar. Sin comisiones de apps de domicilio.</p>
          {' '}
          <div data-hero-fade="" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {' '}
            <a className="wl-h1" href={v.waHref} target="_blank" rel="noopener noreferrer" style={{ height: '56px', padding: '0 26px', borderRadius: '12px', background: '#2F66E6', color: '#FFFFFF', fontSize: '17px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '22px', height: '22px', flex: 'none' }}>
                <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9"></path>
                {' '}
                <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1"></path>
              </svg>
              Agenda una demo
            </a>
            {' '}
            <a className="wl-h2" href="#como-funciona" style={{ height: '56px', padding: '0 24px', borderRadius: '12px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A', fontSize: '17px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
              Mira cómo funciona{' '}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '18px', height: '18px', flex: 'none' }}>
                <path d="M12 5l0 14"></path>
                {' '}
                <path d="M18 13l-6 6"></path>
                {' '}
                <path d="M6 13l6 6"></path>
              </svg>
            </a>
            {' '}
          </div>
          {' '}
          <div data-hero-fade="" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', fontSize: '15px', color: '#475569' }}>
            {' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '19px', height: '19px', flex: 'none', color: '#2F66E6' }}>
                <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0"></path>
                {' '}
                <path d="M6 21v-2a4 4 0 0 1 4 -4h4"></path>
                {' '}
                <path d="M15 19l2 2l4 -4"></path>
              </svg>
              Te responde una persona real
            </span>
            {' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '19px', height: '19px', flex: 'none', color: '#2F66E6' }}>
                <path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5"></path>
              </svg>
              Instalación acompañada
            </span>
            {' '}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '19px', height: '19px', flex: 'none', color: '#2F66E6' }}>
                <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3"></path>
                {' '}
                <path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"></path>
                {' '}
                <path d="M12 12l0 2.5"></path>
              </svg>
              Tus datos son tuyos (Ley 1581)
            </span>
            {' '}
          </div>
          {' '}
        </div>
        {' '}
        <div data-hero-scene="" style={{ position: 'relative', width: '100%', maxWidth: '640px', margin: '0 auto', aspectRatio: '1/1.04' }}>
          {' '}
          <img src="/img/guilloche-roseta.svg" alt="" aria-hidden="true" style={{ position: 'absolute', top: '-14%', right: '-26%', width: '88%', opacity: '.55', pointerEvents: 'none' }} />
          {' '}
          <div style={{ position: 'absolute', left: '-10%', bottom: '-2%', width: '104%', aspectRatio: '1.6', zIndex: '1' }}>
            {' '}
            <img src="/img/mesa-nfc.webp" alt="Mesa de madera con un sticker NFC, una limonada y una arepa" style={{ width: '100%', height: '100%', display: 'block' }} />
            {' '}
            <svg viewBox="0 0 100 100" aria-hidden="true" style={{ position: 'absolute', left: '34.1%', top: '72.3%', width: '26%', transform: 'translate(-50%,-50%)', overflow: 'visible' }}>
              {' '}
              <ellipse data-ring="" cx="50" cy="50" rx="30" ry="16" fill="none" stroke="#2F66E6" strokeWidth="2.4" opacity="0"></ellipse>
              {' '}
              <ellipse data-ring="" cx="50" cy="50" rx="30" ry="16" fill="none" stroke="#2F66E6" strokeWidth="2" opacity="0"></ellipse>
              {' '}
              <ellipse data-ring="" cx="50" cy="50" rx="30" ry="16" fill="none" stroke="#2F66E6" strokeWidth="1.6" opacity="0"></ellipse>
              {' '}
            </svg>
            {' '}
          </div>
          {' '}
          <div style={{ position: 'absolute', right: '-4%', top: '6%', width: '56%', background: '#0F172A', borderRadius: '22px', padding: '8px', zIndex: '4' }}>
            {' '}
            <div style={{ background: '#FFFFFF', borderRadius: '15px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {' '}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                {' '}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '15px', fontWeight: '600' }}>Comandas</span>
                  <span style={{ fontSize: '13px', color: '#475569' }}>Sede Poblado</span>
                </div>
                {' '}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#15803D', fontWeight: '600' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E' }}></span>
                  En vivo
                </span>
                {' '}
              </div>
              {' '}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '12px', borderRadius: '12px', background: '#F8FAFC' }}>
                {' '}
                <span style={{ fontSize: '13px', color: '#475569' }}>Ventas de hoy</span>
                {' '}
                <span data-hero-sales="" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 'clamp(18px,2vw,24px)', fontWeight: '500', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>$ 1.284.000</span>
                {' '}
              </div>
              {' '}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {' '}
                <div data-hero-row="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '12px', opacity: '0' }}>
                  {' '}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '0' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>Mesa 4</span>
                    <span style={{ fontSize: '13px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>1 × Hamburguesa de la casa</span>
                  </div>
                  {' '}
                  <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
                    {' '}
                    <span data-pill-new="" style={{ fontSize: '13px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px', background: '#FFFBEB', color: '#B45309', whiteSpace: 'nowrap' }}>Nueva</span>
                    {' '}
                    <span data-pill-cook="" style={{ position: 'absolute', right: '0', top: '0', fontSize: '13px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px', background: '#EEF4FF', color: '#3538CD', whiteSpace: 'nowrap', opacity: '0' }}>En cocina</span>
                    {' '}
                  </span>
                  {' '}
                </div>
                {' '}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                  {' '}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '0' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>Domicilio · Laureles</span>
                    <span style={{ fontSize: '13px', color: '#475569' }}>2 × Perro de la esquina</span>
                  </div>
                  {' '}
                  <span style={{ fontSize: '13px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px', background: '#F0FDFA', color: '#0F766E', whiteSpace: 'nowrap' }}>En camino</span>
                  {' '}
                </div>
                {' '}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px', border: '1px solid #E2E8F0', borderRadius: '12px' }}>
                  {' '}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '0' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>Mesa 2</span>
                    <span style={{ fontSize: '13px', color: '#475569' }}>1 × Bandeja paisa</span>
                  </div>
                  {' '}
                  <span style={{ fontSize: '13px', fontWeight: '600', padding: '3px 10px', borderRadius: '999px', background: '#F0FDF4', color: '#15803D', whiteSpace: 'nowrap' }}>Lista</span>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
            </div>
            {' '}
          </div>
          {' '}
          <div data-hero-hand="" style={{ position: 'absolute', left: '-12%', top: '-2%', width: '88%', aspectRatio: '3/4', zIndex: '3', transformOrigin: '72% 95%' }}>
            {' '}
            <div data-hero-layer="" style={{ position: 'absolute', left: '27.3%', top: '8.4%', width: '35.8%', height: '60.3%', containerType: 'inline-size', overflow: 'hidden', background: '#FFFFFF' }}>
              {' '}
              <div data-hero-portada="" style={{ position: 'absolute', inset: '0', background: '#7A2E2A', color: '#FFFFFF', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20cqw 8cqw 10cqw', gap: '3cqw', textAlign: 'center' }}>
                {' '}
                <span style={{ fontSize: '3.8cqw', fontWeight: '600', background: '#F2EAEA', color: '#7A2E2A', borderRadius: '99px', padding: '1.2cqw 3.4cqw' }}>Mesa 4</span>
                {' '}
                <img src="/img/plato-hamburguesa.webp" alt="" style={{ width: '70cqw', height: '70cqw', objectFit: 'contain', marginTop: '6cqw' }} />
                {' '}
                <span style={{ fontFamily: "'Fraunces',serif", fontSize: '12cqw', fontWeight: '600', lineHeight: '1', marginTop: '2cqw' }}>Burger House</span>
                {' '}
                <span style={{ fontSize: '4.8cqw', color: '#F2EAEA' }}>Cocina de barrio</span>
                {' '}
                <span style={{ marginTop: 'auto', width: '100%', height: '13cqw', borderRadius: '4cqw', background: '#F59E0B', color: '#0F172A', fontSize: '5cqw', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Ver la carta</span>
                {' '}
                <span style={{ fontSize: '3.6cqw', color: '#F2EAEA' }}>Sin descargar nada</span>
                {' '}
              </div>
              {' '}
              <div data-hero-carta="" style={{ position: 'absolute', inset: '0', background: '#FFFFFF', display: 'flex', flexDirection: 'column', opacity: '0' }}>
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
                <div style={{ display: 'flex', gap: '2cqw', padding: '4cqw 6cqw 2cqw', fontSize: '3.8cqw', fontWeight: '600', whiteSpace: 'nowrap' }}>
                  {' '}
                  <span style={{ padding: '1.6cqw 3.4cqw', borderRadius: '99px', background: '#F59E0B', color: '#0F172A' }}>Hamburguesas</span>
                  {' '}
                  <span style={{ padding: '1.6cqw 3.4cqw', borderRadius: '99px', border: '1px solid #E2E8F0', color: '#475569' }}>Para picar</span>
                  {' '}
                  <span style={{ padding: '1.6cqw 3.4cqw', borderRadius: '99px', border: '1px solid #E2E8F0', color: '#475569' }}>Bebidas</span>
                  {' '}
                </div>
                {' '}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3cqw', padding: '3cqw 6cqw' }}>
                  {' '}
                  <div style={{ display: 'grid', gridTemplateColumns: '22cqw minmax(0,1fr) 10cqw', gap: '3cqw', alignItems: 'center', padding: '2.4cqw', border: '1px solid #F2EAEA', borderRadius: '4cqw' }}>
                    {' '}
                    <img src="/img/plato-hamburguesa.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                    {' '}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                      <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Hamburguesa de la casa</span>
                      <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 32.000</span>
                    </div>
                    {' '}
                    <span data-hero-plus="" style={{ width: '10cqw', height: '10cqw', borderRadius: '50%', background: '#F59E0B', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6cqw' }}>
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
                    <img src="/img/plato-perro.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                    {' '}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                      <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Perro de la esquina</span>
                      <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 18.000</span>
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
                    <img src="/img/plato-empanadas.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                    {' '}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                      <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Empanadas × 3</span>
                      <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 12.000</span>
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
                    <img src="/img/plato-limonada.webp" alt="" style={{ width: '22cqw', height: '22cqw', objectFit: 'contain' }} />
                    {' '}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1cqw' }}>
                      <span style={{ fontSize: '4.6cqw', fontWeight: '600', lineHeight: '1.15' }}>Limonada de coco</span>
                      <span style={{ fontSize: '4.4cqw', fontWeight: '700', color: '#7A2E2A' }}>$ 9.000</span>
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
                <div style={{ marginTop: 'auto', padding: '4cqw 6cqw 9cqw' }}>
                  {' '}
                  <div data-hero-cart="" style={{ height: '13cqw', borderRadius: '4cqw', background: '#7A2E2A', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2cqw', fontSize: '4.8cqw', fontWeight: '600' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '5.6cqw', height: '5.6cqw', flex: 'none' }}>
                      <path d="M6.331 8h11.339a2 2 0 0 1 1.977 2.304l-1.255 8.152a3 3 0 0 1 -2.966 2.544h-6.852a3 3 0 0 1 -2.965 -2.544l-1.255 -8.152a2 2 0 0 1 1.977 -2.304z"></path>
                      {' '}
                      <path d="M9 11v-5a3 3 0 0 1 6 0v5"></path>
                    </svg>
                    Mi pedido
                    <span data-hero-badge="" style={{ minWidth: '6cqw', height: '6cqw', borderRadius: '99px', background: '#F59E0B', color: '#0F172A', fontSize: '3.8cqw', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'scale(0)' }}>1</span>
                  </div>
                  {' '}
                </div>
                {' '}
              </div>
              {' '}
              <span data-hero-paper="" aria-hidden="true" style={{ position: 'absolute', left: '0', top: '0', width: '4cqw', height: '5cqw', background: '#FFFFFF', border: '1px solid #0F172A', borderRadius: '0.6cqw', opacity: '0', zIndex: '5' }}></span>
              {' '}
            </div>
            {' '}
            <img src="/img/mano-telefono.webp" alt="Mano de una comensal con el celular abierto en la carta del restaurante" style={{ position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' }} />
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
