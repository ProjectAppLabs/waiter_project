'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
// Lógica de «Landing Waiter.dc.html» (Claude Design) portada tal cual: misma clase, mismos tiempos y mismas animaciones.
// Lo único distinto: GSAP llega por npm y no por window, las rutas de imagen empiezan en /img/, como el servidor
// pinta con el ancho de escritorio, al montar se ajusta al ancho real antes de animar (el diseño lo mide al crearse), y
// la navegación es la propia en pill (components/Nav.tsx), que no cambia al bajar como la del diseño.
import { Component, createRef, type FormEvent } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { LandingVals } from './vals'
import { enlaceWhatsApp } from '@/lib/whatsapp'
import { Nav } from './Nav'
import { Hero } from './sections/Hero'
import { FuncionaEn } from './sections/FuncionaEn'
import { Dolores } from './sections/Dolores'
import { TuEquipo } from './sections/TuEquipo'
import { AsiFunciona } from './sections/AsiFunciona'
import { Modulos } from './sections/Modulos'
import { Domicilios } from './sections/Domicilios'
import { MeseroVirtual } from './sections/MeseroVirtual'
import { Banda } from './sections/Banda'
import { Precios } from './sections/Precios'
import { Seguridad } from './sections/Seguridad'
import { AgendaDemo } from './sections/AgendaDemo'
import { Preguntas } from './sections/Preguntas'
import { CtaFinal } from './sections/CtaFinal'
import { Pie } from './sections/Pie'
import { WhatsAppFlotante } from './sections/WhatsAppFlotante'

type G = typeof gsap
type ST = typeof ScrollTrigger

export interface WaiterLandingProps {
  whatsapp: string
  mostrarProximamente: boolean
  movimiento: 'Completo' | 'Reducido'
}

interface State {
  vw: 'xl' | 'md' | 'sm'
  narrow: boolean
  tab: number
  tone: string
  step: number
  sedes: string
  form: 'idle' | 'sending' | 'done'
  formError: string
  formName: string
  brand: number
  ready: boolean
}

export default class WaiterLanding extends Component<WaiterLandingProps, State> {
  rootRef = createRef<HTMLDivElement>()
  timers: ReturnType<typeof setTimeout>[] = []
  state: State = { vw: 'xl', narrow: false, tab: 0, tone: 'neutro', step: 0, sedes: '1', form: 'idle', formError: '', formName: '', brand: 0, ready: false }

  started = false
  ctx: gsap.Context | null = null
  raf = 0
  chatToken: object | null = null
  howStep = -1
  kitchen: boolean | null = null
  flame: number | null = null
  reduced = false
  forceReduced = false
  watchdog = false
  setupHidden = false
  _prev: any
  onResize: any
  onVis: any
  onMapResize: any

  MODS = [
    { tab: 'Operación', items: [
      { icon: '/img/icons/layout-dashboard.svg', name: 'Núcleo', line: 'POS, caja, catálogo y equipo. La base de todo.', anim: 'pulse' },
      { icon: '/img/icons/armchair.svg', name: 'Salón', line: 'Mesas en vivo: libre, ocupada, en cocina, por cobrar.', anim: 'tilt' },
      { icon: '/img/icons/flame.svg', name: 'Cocina', line: 'Pantalla de cocina por estaciones, sin papel.', anim: 'flicker' },
      { icon: '/img/icons/packages.svg', name: 'Inventario', line: 'Recetas, existencias y alertas antes de que se acabe.', anim: 'bounce' },
      { icon: '/img/icons/building-store.svg', name: 'Varios locales', line: 'Todas tus sedes en una consola.', anim: 'slide' }] },
    { tab: 'Ventas digitales', items: [
      { icon: '/img/icons/device-mobile.svg', name: 'Menú del comensal', line: 'Tu carta con tu marca. Piden y piden la cuenta desde la mesa.', anim: 'tap' },
      { icon: '/img/icons/truck-delivery.svg', name: 'Domicilios', line: 'Pedidos a domicilio propios, sin comisión.', anim: 'drive' },
      { icon: '/img/icons/credit-card.svg', name: 'Pagos en línea', line: 'Bancolombia, QR, Nequi y tarjetas, desde el celular.', anim: 'tilt', soon: true },
      { icon: '/img/icons/calendar-event.svg', name: 'Reservas', line: 'Horarios, mesas y anticipo con enlace.', anim: 'bounce' }] },
    { tab: 'Inteligencia', items: [
      { icon: '/img/icons/message-chatbot.svg', name: 'Asistente en el menú', line: 'Un mesero virtual que recomienda y vende más.', anim: 'nod' },
      { icon: '/img/icons/brand-whatsapp.svg', name: 'Asistente de WhatsApp', line: 'El mismo mesero toma pedidos por WhatsApp.', anim: 'nod', soon: true },
      { icon: '/img/icons/star.svg', name: 'Fidelización', line: 'Puntos, cupones y premios que hacen volver.', anim: 'spin' }] },
    { tab: 'Cumplimiento', items: [
      { icon: '/img/icons/file-invoice.svg', name: 'Facturación electrónica', line: 'Factura DIAN desde el mismo pedido.', anim: 'tilt', soon: true },
      { icon: '/img/icons/cash-register.svg', name: 'Datáfono integrado', line: 'Hoy cobras con datáfono manual desde la caja. Integrado, muy pronto.', anim: 'pulse', soon: true }] }
  ]

  STEPS = [
    { title: 'Toca y pide', text: 'NFC o QR en la mesa. Sin descargar nada.' },
    { title: 'Tu mesero virtual recomienda', text: 'Pregunta el nombre, recomienda lo mejor de la casa y sugiere con qué acompañarlo. Habla como tu región: paisa, costeño, rolo…' },
    { title: 'La cocina recibe al instante', text: 'La comanda llega a la pantalla de cocina, sin papel. Cuando está lista, el salón se entera.' },
    { title: 'Pide la cuenta y vuelve', text: 'Pide la cuenta desde la mesa y acumula puntos para la próxima. El pago desde el celular llega pronto.' }
  ]

  TONES = [
    { key: 'neutro', label: 'Neutro', name: 'Colombiano neutro', msgs: ['¡Buenas noches! Qué gusto atenderlo. Hoy le recomiendo la Hamburguesa de la casa. ¿Por dónde quiere empezar?', 'Una hamburguesa de la casa, por favor.', '¡Listo! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.', '¿Le gustaría acompañarlo con algo de tomar? Le tengo estas opciones.'] },
    { key: 'paisa', label: 'Paisa', name: 'Paisa (Antioquia)', msgs: ['¡Buenas noches! Bienvenido, con mucho gusto lo atiendo. Lo que más piden hoy es la Hamburguesa de la casa. ¿Qué le provoca, pues?', 'Una hamburguesa de la casa, por favor.', '¡De una! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.', '¿Le provoca acompañarlo con algo de tomar, pues? Le tengo estas opciones.'] },
    { key: 'rolo', label: 'Rolo', name: 'Rolo (Bogotá)', msgs: ['¡Buenas noches! Qué gusto saludarlo. Hoy le recomiendo la Hamburguesa de la casa, muy chévere. ¿Por dónde quiere empezar?', 'Una hamburguesa de la casa, por favor.', '¡Listo! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.', '¿Le gustaría acompañarlo con algo de tomar? Le tengo estas opciones.'] },
    { key: 'costeno', label: 'Costeño', name: 'Costeño (Caribe)', msgs: ['¡Buenas noches! ¿Qué más? Bienvenido, con todo el gusto te atiendo. Lo que más piden hoy es la Hamburguesa de la casa. ¿Qué te provoca?', 'Una hamburguesa de la casa, por favor.', '¡Listo! Ya te agregué eso a Mi pedido. Allá lo puedes revisar antes de mandarlo a cocina.', '¿Te provoca algo bien frío para acompañar? Te tengo estas opciones.'] },
    { key: 'caleno', label: 'Caleño', name: 'Caleño (Valle)', msgs: ['¡Buenas noches! Bienvenido, bien pueda. Mirá, lo que más piden hoy es la Hamburguesa de la casa. ¿Qué querés?', 'Una hamburguesa de la casa, por favor.', '¡Listo, ve! Ya te agregué eso a Mi pedido. Allá lo podés revisar antes de mandarlo a cocina.', '¿Querés algo de tomar para acompañar, ve? Mirá estas opciones.'] },
    { key: 'santandereano', label: 'Santandereano', name: 'Santandereano', msgs: ['¡Buenas noches! Qué gusto tenerlo por acá. Hoy le recomiendo la Hamburguesa de la casa. ¡Hágale! ¿Qué se le antoja?', 'Una hamburguesa de la casa, por favor.', '¡Hágale! Ya le agregué eso a Mi pedido. Allá lo puede revisar antes de mandarlo a cocina.', '¿Le gustaría acompañarlo con algo de tomar? Le tengo estas opciones.'] }
  ]

  BRANDS = [
    { name: 'Burger House', color: '#7A2E2A', ink: '#7A2E2A', soft: 'rgba(122,46,42,.07)' },
    { name: 'La Arepería', color: '#F59E0B', ink: '#B45309', soft: 'rgba(245,158,11,.09)' },
    { name: 'Café del Parque', color: '#22C55E', ink: '#15803D', soft: 'rgba(34,197,94,.08)' }
  ]

  FAQS = [
    { q: '¿Necesito cambiar mi caja o mis equipos?', a: 'No. Waiter funciona en el navegador: en una tablet, un computador o un celular. Si tienes impresora térmica, imprime comandas y recibos.' },
    { q: '¿Mis clientes tienen que descargar una app?', a: 'No. Tocan el NFC o escanean el QR de la mesa y la carta se abre en su celular.' },
    { q: '¿Cuánto cuesta?', a: 'Pagas una mensualidad por sede, los módulos que actives y, en los que usan IA, WhatsApp o facturación, lo que consumas. Agenda una demo y te cotizamos en 24 horas.' },
    { q: '¿En cuánto tiempo quedo funcionando?', a: 'Depende de tu carta y de cuántas sedes tengas. Te acompañamos en la instalación y en la demo te damos una fecha.' },
    { q: '¿Qué pasa con mis domicilios de Rappi?', a: 'Puedes seguir con ellos y sumar los tuyos, sin comisión, desde tu propia carta.' },
    { q: '¿El mesero virtual reemplaza a mi equipo?', a: 'No. Les quita lo repetitivo: tomar el pedido, recomendar y sugerir con qué acompañarlo. Tu equipo se dedica a atender.' },
    { q: '¿Mis datos y los de mis clientes son míos?', a: 'Sí. Los datos de tus clientes se guardan con su autorización, según la Ley 1581, y pueden retirarla cuando quieran.' },
    { q: '¿Funciona si tengo varias sedes?', a: 'Sí. Con Varios locales ves todas tus sedes en una consola, con precios, agotados y módulos por sede.' }
  ]

  componentDidMount() {
    // El diseño calcula estos tres valores al crearse; aquí el servidor ya pintó con escritorio, así que se ajustan antes
    // de arrancar las animaciones (la raíz sigue oculta hasta entonces, como en el diseño, que no pinta antes del JS).
    const w = window.innerWidth, narrow = w < 900, vw = w >= 1100 ? 'xl' : w >= 640 ? 'md' : 'sm'
    if (narrow !== this.state.narrow || vw !== this.state.vw) this.setState({ narrow, vw }, () => this.start())
    else this.start()
  }

  start() {
    this.started = true
    this.onResize = () => { const w = window.innerWidth, n = w < 900, vw = w >= 1100 ? 'xl' : w >= 640 ? 'md' : 'sm'; if (n !== this.state.narrow || vw !== this.state.vw) this.setState({ narrow: n, vw }); }
    this.snapPrev()
    this.onVis = () => {
      if (document.hidden) return
      if (!this.ctx || this.forceReduced || this.setupHidden) { this.forceReduced = false; this.watchdog = false; this.setupHidden = false; this.teardown(); this.setup(); }
      else ScrollTrigger.refresh()
    }
    document.addEventListener('visibilitychange', this.onVis)
    window.addEventListener('resize', this.onResize)
    if (!document.hidden) this.setup()
    this.setState({ ready: true })
  }

  snapPrev() { this._prev = { narrow: this.state.narrow, tab: this.state.tab, form: this.state.form, mov: this.props.movimiento }; }

  componentDidUpdate() {
    if (!this.started) return
    const ps = this._prev || {}
    this.snapPrev()
    if (ps.narrow !== this.state.narrow || ps.mov !== this.props.movimiento) { this.teardown(); this.timers.push(setTimeout(() => this.setup(), 30)); return; }
    if (ps.tab !== this.state.tab && !this.reduced) gsap.from(this.qa('[data-mod-card]'), { y: 14, opacity: 0, duration: .4, ease: 'power3.out', stagger: .05 })
    if (ps.form !== 'done' && this.state.form === 'done') { const c = this.q('[data-check]'); if (c) gsap.to(c, { strokeDashoffset: 0, duration: this.reduced ? 0 : .6, ease: 'power2.out', delay: .1 }); }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.onResize)
    document.removeEventListener('visibilitychange', this.onVis)
    if (this.onMapResize) window.removeEventListener('resize', this.onMapResize)
    this.teardown()
    this.timers.forEach(clearTimeout)
  }

  q(s: string): any { return this.rootRef.current ? this.rootRef.current.querySelector(s) : null; }
  qa(s: string): any[] { return this.rootRef.current ? [...this.rootRef.current.querySelectorAll(s)] : []; }
  wait(ms: number) { return new Promise(r => this.timers.push(setTimeout(r, ms))); }

  teardown() {
    if (this.ctx) this.ctx.revert()
    this.ctx = null
    cancelAnimationFrame(this.raf)
    this.chatToken = null
    this.howStep = -1
  }

  setup() {
    const root = this.rootRef.current, ST = ScrollTrigger
    if (!root) return
    gsap.registerPlugin(ST)
    this.reduced = this.forceReduced || this.props.movimiento === 'Reducido' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!this.reduced && !this.watchdog && !document.hidden) { this.watchdog = true; let n = 0; const c = () => { n++; if (n < 6) requestAnimationFrame(c); }; requestAnimationFrame(c); this.timers.push(setTimeout(() => { if (n < 3) { this.forceReduced = true; this.teardown(); this.setup(); } }, 900)); }
    this.howStep = -1; this.kitchen = null
    this.ctx = gsap.context(() => {
      (['setupHero', 'setupReveals', 'setupPains', 'setupHow', 'setupMap', 'setupWaiter', 'setupMisc'] as const).forEach(n => {
        try { this[n](gsap, ST); } catch (e: any) { console.warn('[waiter] ' + n + ': ' + (e && e.message)); }
      })
    }, root)
    this.setupMarquee()
    ST.refresh()
    this.setupHidden = document.hidden
    this.timers.push(setTimeout(() => {
      if (document.hidden || !this.ctx) return
      const w = this.q('[data-word]')
      if (w && parseFloat(getComputedStyle(w).opacity) < .05) gsap.set(this.qa('[data-word], [data-hero-fade], [data-hero-scene]'), { opacity: 1, y: 0 })
    }, 3500))
  }

  setupHero(gsap: G) {
    const q = (s: string) => this.q(s), qa = (s: string) => this.qa(s)
    const portada = q('[data-hero-portada]'), carta = q('[data-hero-carta]'), row = q('[data-hero-row]'), sales = q('[data-hero-sales]')
    if (this.reduced) { gsap.set(portada, { opacity: 0 }); gsap.set([carta, row], { opacity: 1 }); gsap.set(q('[data-draw="hero"]'), { strokeDashoffset: 0 }); return; }
    gsap.timeline()
      .from(qa('[data-word]'), { y: 28, opacity: 0, duration: .8, ease: 'power3.out', stagger: .06 })
      .to(q('[data-draw="hero"]'), { strokeDashoffset: 0, duration: .65, ease: 'power2.inOut' }, '-=.25')
      .from(qa('[data-hero-fade]'), { y: 16, opacity: 0, duration: .6, ease: 'power3.out', stagger: .08 }, .35)
      .from(q('[data-hero-scene]'), { y: 32, opacity: 0, duration: 1.1, ease: 'expo.out' }, .3)
    const hand = q('[data-hero-hand]'), rings = qa('[data-ring]'), plus = q('[data-hero-plus]'), paper = q('[data-hero-paper]'), cart = q('[data-hero-cart]'), badge = q('[data-hero-badge]'), layer = q('[data-hero-layer]'), pNew = q('[data-pill-new]'), pCook = q('[data-pill-cook]')
    const s = { v: 1284000 }, fmt = (v: number) => '$ ' + Math.round(v).toLocaleString('es-CO')
    gsap.set(rings, { transformOrigin: '50% 50%' })
    gsap.timeline({ repeat: -1, repeatDelay: .3, delay: 1.9 })
      .set(row, { opacity: 0, y: -10 }).set(pNew, { opacity: 1 }).set(pCook, { opacity: 0 }).set(badge, { scale: 0 })
      .call(() => { s.v = 1284000; sales.textContent = fmt(s.v); })
      .to(hand, { xPercent: -3, yPercent: 6, rotation: -4, duration: .8, ease: 'power3.inOut' })
      .fromTo(rings, { scale: .5, opacity: .95 }, { scale: 1.9, opacity: 0, duration: 1.2, ease: 'power2.out', stagger: .2 }, '-=.15')
      .to(portada, { opacity: 0, duration: .4 }, '<.3')
      .fromTo(carta, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .6, ease: 'power3.out' }, '<')
      .to(hand, { xPercent: 0, yPercent: 0, rotation: 0, duration: 1, ease: 'expo.out' }, '<')
      .to(plus, { scale: .8, duration: .12, yoyo: true, repeat: 1, ease: 'power1.out' }, '+=.5')
      .call(() => this.toss(gsap, paper, plus, cart, layer))
      .to(badge, { scale: 1, duration: .3, ease: 'back.out(2)' }, '+=.68')
      .fromTo(row, { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: .5, ease: 'back.out(1.6)' }, '+=.25')
      .to(s, { v: 1316000, duration: 1.1, ease: 'power2.out', onUpdate: () => { sales.textContent = fmt(s.v); } }, '<.15')
      .to(pNew, { opacity: 0, duration: .3 }, '+=1.1').to(pCook, { opacity: 1, duration: .3 }, '<')
      .to({}, { duration: 1.6 })
      .to([carta, row], { opacity: 0, duration: .45 }).to(portada, { opacity: 1, duration: .45 }, '<').to(badge, { scale: 0, duration: .2 }, '<')
  }

  toss(gsap: G, paper: any, from: any, to: any, layer: any) {
    if (!paper || !from || !to || !layer) return
    const L = layer.getBoundingClientRect(), F = from.getBoundingClientRect(), T = to.getBoundingClientRect()
    const pw = paper.offsetWidth, ph = paper.offsetHeight
    const sx = F.left + F.width / 2 - L.left - pw / 2, sy = F.top + F.height / 2 - L.top - ph / 2
    const tx = T.left + T.width / 2 - L.left - pw / 2, ty = T.top + T.height / 2 - L.top - ph / 2
    gsap.set(paper, { x: sx, y: sy, opacity: 1, rotation: 0, scale: 1 })
    gsap.timeline()
      .to(paper, { x: tx, duration: .7, ease: 'power1.inOut' }, 0)
      .to(paper, { keyframes: [{ y: Math.min(sy - 40, ty - 40), duration: .32, ease: 'power2.out' }, { y: ty, duration: .38, ease: 'power2.in' }] }, 0)
      .to(paper, { rotation: 300, scale: .45, duration: .7, ease: 'none' }, 0)
      .to(paper, { opacity: 0, duration: .12 }, .62)
      .fromTo(to, { scale: 1 }, { scale: 1.06, duration: .14, yoyo: true, repeat: 1, ease: 'power1.out' }, .66)
  }

  setupReveals(gsap: G, ST: ST) {
    const els = this.qa('[data-reveal]')
    const draws = this.qa('[data-draw-enter]')
    if (this.reduced) { gsap.set(draws, { strokeDashoffset: 0 }); return; }
    gsap.set(els, { opacity: 0, y: 28 })
    ST.batch(els, { start: 'top 88%', once: true, onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: .8, ease: 'power3.out', stagger: .08 }) })
    draws.forEach(d => ST.create({ trigger: d.closest('section') ? d.parentNode.parentNode : d, start: 'top 75%', once: true, onEnter: () => gsap.to(d, { strokeDashoffset: 0, duration: d.tagName === 'rect' ? 1.6 : .7, ease: 'power2.inOut', delay: .3 }) }))
  }

  setupPains(gsap: G, ST: ST) {
    const cards = this.qa('[data-pain]')
    if (this.reduced) return
    gsap.set(cards, { opacity: 0, y: 32 })
    gsap.set(this.q('[data-cut]'), { opacity: 0, scale: .6 })
    ST.batch(cards, { start: 'top 85%', once: true, onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: .8, ease: 'power3.out', stagger: .1 }) })
    cards.forEach((card, i) => {
      ST.create({ trigger: card, start: 'top 70%', once: true, onEnter: () => {
        const num = card.querySelector('[data-pain-num]'); const n = { v: 0 }
        gsap.to(n, { v: i + 1, duration: .5, ease: 'none', snap: { v: 1 }, onUpdate: () => { num.textContent = String(n.v).padStart(2, '0'); } })
        const kind = card.dataset.pain
        if (kind === 'espera') { const t = card.querySelector('[data-timer]'); const o = { v: 0 }; gsap.to(o, { v: 767, duration: 1.8, ease: 'power2.out', delay: .2, onUpdate: () => { const m = Math.floor(o.v / 60), sec = Math.floor(o.v % 60); t.textContent = String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'); } }); }
        if (kind === 'tajada') { gsap.to(card.querySelector('[data-slice]'), { xPercent: 5, yPercent: -2, rotation: 2.5, transformOrigin: '80% 40%', duration: 1, ease: 'power3.inOut', delay: .35 }); gsap.to(card.querySelector('[data-cut]'), { opacity: 1, scale: 1, duration: .45, ease: 'back.out(2)', delay: 1.1 }); }
        if (kind === 'comanda') gsap.to(card.querySelector('[data-wobble]'), { keyframes: [{ rotation: -2.5, duration: .18 }, { rotation: 2, duration: .22 }, { rotation: -1, duration: .2 }, { rotation: 0, duration: .3 }], transformOrigin: '50% 95%', delay: .35 })
        if (kind === 'nevera') { const c = card.querySelector('[data-fridge-closed]'); gsap.set(c, { opacity: 1 }); gsap.to(c, { opacity: 0, duration: .45, ease: 'power2.out', delay: .55 }); }
      } })
    })
  }

  setupHow(gsap: G, ST: ST) {
    const sec = this.q('[data-how]')
    if (!sec) return
    this.goStep(0, true)
    ST.create({ trigger: sec, start: 'top top', end: 'bottom bottom', onUpdate: self => {
      const p = self.progress, step = Math.min(3, Math.floor(p * 4)), sp = p * 4 - step
      if (step !== this.howStep) { this.goStep(step); this.setState({ step }); }
      if (step === 2) { this.setFlame(sp < .25 ? 0 : sp < .5 ? 1 : 2); this.setKitchen(sp > .5); const t = this.q('[data-kds-timer]'); if (t) { const s = Math.round(30 + sp * 300); t.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); } }
      else if (step > 2) { this.setFlame(2); this.setKitchen(true); } else { this.setFlame(0); this.setKitchen(false); }
    } })
  }

  goStep(step: number, instant?: boolean) {
    const d = (instant || this.reduced) ? 0 : 1
    this.howStep = step
    const screens = this.qa('[data-how-screen]'), hand = this.q('[data-how-hand]'), cook = this.q('[data-how-cook]'), callout = this.q('[data-how-callout]'), coins = this.qa('[data-coin]')
    screens.forEach((s, i) => gsap.to(s, { opacity: i === step ? 1 : 0, y: i === step ? 0 : 8, duration: .45 * d, ease: 'power3.out', overwrite: true }))
    const stage = this.q('[data-how-stage]'); let shift = 0
    if (step === 2 && stage && hand) { const sw = stage.offsetWidth, hw = hand.offsetWidth, hl = (sw - hw) / 2; shift = Math.min(0, sw * .4 - (hl + hw * .65)); }
    gsap.to(hand, { x: shift, scale: step === 2 ? .9 : 1, duration: .9 * d, ease: 'expo.out', overwrite: true })
    gsap.to(cook, { opacity: step === 2 ? 1 : 0, x: step === 2 ? 0 : 60, duration: .8 * d, ease: 'expo.out', overwrite: true })
    gsap.to(callout, { opacity: step === 2 ? 1 : 0, y: step === 2 ? 0 : 12, duration: .5 * d, delay: step === 2 ? .25 * d : 0, ease: 'power3.out', overwrite: true })
    if (step === 1) gsap.fromTo(this.qa('[data-how-screen="1"] [data-how-msg]'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .45 * d, ease: 'back.out(1.6)', stagger: .55 * d, delay: .2 * d })
    if (step === 3) {
      gsap.fromTo(coins, { y: -140, opacity: 0, rotation: -20 }, { y: (i: number) => 180 + i * 20, opacity: 1, rotation: 0, duration: .8 * d, ease: 'back.out(1.4)', stagger: .15 * d })
      gsap.to(coins, { opacity: 0, duration: .3 * d, delay: 1.3 * d, stagger: .1 * d })
      const pts = this.q('[data-how-points]'), o = { v: 0 }
      gsap.to(o, { v: 41, duration: 1.2 * d, delay: .5 * d, ease: 'power2.out', onUpdate: () => { pts.textContent = Math.round(o.v); } })
    } else gsap.to(coins, { opacity: 0, duration: .2 * d })
  }

  setKitchen(ready: boolean) {
    if (this.kitchen === ready) return
    this.kitchen = ready
    const d = this.reduced ? 0 : 1
    gsap.to(this.q('[data-kds-ready]'), { opacity: ready ? 1 : 0, duration: .3 * d })
    gsap.to(this.q('[data-kds-cooking]'), { opacity: ready ? 0 : 1, duration: .3 * d })
    gsap.to(this.q('[data-how-ready]'), { opacity: ready ? 1 : 0, duration: .3 * d })
    gsap.to(this.q('[data-how-kds]'), { backgroundColor: ready ? '#F0FDF4' : '#EEF4FF', duration: .3 * d })
  }

  setFlame(f: number) {
    if (this.flame === f) return; this.flame = f
    const img = this.q('[data-cook-img]')
    if (img) img.src = ['/img/cocinera.webp', '/img/cocinera-llama-media.webp', '/img/cocinera-llama-alta.webp'][f]
  }

  scrollToStep(i: number) {
    const sec = this.q('[data-how]'); if (!sec) return
    const top = sec.getBoundingClientRect().top + window.scrollY
    const span = sec.offsetHeight - window.innerHeight
    window.scrollTo({ top: top + span * ((i + .5) / 4), behavior: this.reduced ? 'auto' : 'smooth' })
  }

  setupMap(gsap: G, ST: ST) {
    const card = this.q('[data-map]'), route = this.q('[data-route]'), moto = this.q('[data-moto]'), svg = this.q('[data-map-svg]'), pin = this.q('[data-pin]'), toast = this.q('[data-toast]')
    if (!card || !route) return
    const rings = this.qa('[data-map-ring]'), L = route.getTotalLength()
    const place = (p: number) => { const pt = route.getPointAtLength(L * p), s = svg.getBoundingClientRect().width / 800; gsap.set(moto, { x: pt.x * s - moto.offsetWidth * .5, y: pt.y * s - moto.offsetHeight * .9 }); }
    if (this.reduced) { gsap.set([route, ...rings], { strokeDashoffset: 0 }); place(.82); return; }
    place(0)
    gsap.set(pin, { y: -50, opacity: 0 }); gsap.set(toast, { opacity: 0, y: 10 })
    ST.create({ trigger: card, start: 'top 72%', once: true, onEnter: () => {
      gsap.to(pin, { y: 0, opacity: 1, duration: .8, ease: 'back.out(1.6)' })
      gsap.to(rings, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', stagger: .15, delay: .2 })
    } })
    const proxy = { p: 0 }
    let shown = false
    gsap.to(proxy, { p: 1, ease: 'none', scrollTrigger: { trigger: card, start: 'top 62%', end: 'bottom 45%', scrub: .6 }, onUpdate: () => {
      const p = proxy.p, rp = Math.min(1, p / .9)
      gsap.set(route, { strokeDashoffset: 1 - rp })
      place(Math.min(.82, rp * .82))
      const show = p > .92
      if (show !== shown) { shown = show; gsap.to(toast, { opacity: show ? 1 : 0, y: show ? 0 : 10, duration: .4, ease: 'back.out(1.6)' }); }
    } })
    this.onMapResize = () => place(Math.min(.82, Math.min(1, proxy.p / .9) * .82))
    window.addEventListener('resize', this.onMapResize)
  }

  setupWaiter(gsap: G, ST: ST) {
    const sec = this.q('[data-waiter]'); if (!sec) return
    if (this.reduced) { this.playChat(this.state.tone, true); return; }
    ST.create({ trigger: sec, start: 'top 60%', once: true, onEnter: () => this.playChat(this.state.tone) })
    const blink = () => {
      const el = this.q('[data-blink]')
      if (el && this.state.tone === 'neutro' && this.ctx) gsap.timeline().to(el, { opacity: 1, duration: .04 }).to(el, { opacity: 0, duration: .06, delay: .11 })
      this.timers.push(setTimeout(blink, 2600 + Math.random() * 2600))
    }
    this.timers.push(setTimeout(blink, 2000))
  }

  async playChat(toneKey: string, instant?: boolean) {
    const tone = this.TONES.find(t => t.key === toneKey) || this.TONES[0]
    const token = {}; this.chatToken = token
    const alive = () => this.chatToken === token
    const bubbles = this.qa('[data-bubble]'), typing = this.q('[data-typing]'), mouth = this.q('[data-mouth]')
    bubbles.forEach(b => { gsap.set(b, { opacity: 0, y: 8, display: 'none' }); const t = b.querySelector('[data-text]'); if (t) t.textContent = ''; })
    gsap.set(typing, { opacity: 0, display: 'none' })
    const show = (b: any) => { gsap.set(b, { display: b.dataset.bubble === '4' ? 'flex' : 'block' }); gsap.to(b, { opacity: 1, y: 0, duration: instant ? 0 : .35, ease: 'back.out(1.8)' }); }
    if (instant) { bubbles.forEach((b, i) => { const t = b.querySelector('[data-text]'); if (t) t.textContent = tone.msgs[i]; show(b); }); return; }
    const flap = tone.key === 'neutro'
    for (let i = 0; i < 4; i++) {
      if (!alive()) return
      const b = bubbles[i], t = b.querySelector('[data-text]'), text = tone.msgs[i]
      if (i === 1) { await this.wait(650); if (!alive()) return; t.textContent = text; show(b); await this.wait(500); continue; }
      gsap.set(typing, { display: 'flex' }); gsap.to(typing, { opacity: 1, duration: .2 })
      await this.wait(520 + Math.random() * 300); if (!alive()) return
      gsap.set(typing, { opacity: 0, display: 'none' })
      show(b)
      const ba = this.q('[data-boca-a]')
      if (flap && ba) { gsap.to(ba, { opacity: 1, duration: .1 }); gsap.to(ba, { opacity: 0, duration: .16, delay: .34 }); }
      for (let k = 1; k <= text.length; k++) {
        if (!alive()) return
        t.textContent = text.slice(0, k)
        if (flap && mouth && k % 3 === 0) mouth.style.opacity = mouth.style.opacity === '1' ? '0' : '1'
        const ch = text[k - 1]
        await this.wait(/[.,!?¿¡]/.test(ch) ? 140 + Math.random() * 180 : 14 + Math.random() * 30)
      }
      if (mouth) mouth.style.opacity = '0'
      await this.wait(380)
    }
    if (alive()) show(bubbles[4])
  }

  setTone(key: string) {
    if (key === this.state.tone) return
    this.setState({ tone: key })
    const d = this.reduced ? 0 : 1
    this.qa('[data-tone-img]').forEach(img => gsap.to(img, { opacity: img.dataset.toneImg === key ? 1 : 0, duration: .35 * d, overwrite: true }))
    const active = this.q('[data-tone-img="' + key + '"]')
    if (active && d) gsap.fromTo(active, { scale: .985, rotation: -.8, transformOrigin: '50% 100%' }, { scale: 1, rotation: 0, duration: .55, ease: 'back.out(1.8)' })
    const m = this.q('[data-mouth]'); if (m) m.style.opacity = '0'
    this.playChat(key, this.reduced)
  }

  teamHover(card: HTMLElement, on: boolean) {
    if (!card) return
    const d = this.reduced ? 0 : 1
    gsap.to(card.querySelector('[data-team-front]'), { opacity: on ? 0 : 1, duration: .35 * d, overwrite: true })
    gsap.to(card.querySelector('[data-team-side]'), { opacity: on ? 1 : 0, duration: .35 * d, overwrite: true })
    if (on && d) gsap.fromTo(card.querySelector('[data-team-face]'), { scale: .82 }, { scale: 1, duration: .5, ease: 'back.out(2.4)' })
  }

  setupMarquee() {
    const track = this.q('[data-marquee]'); if (!track || this.reduced) return
    let x = 0, last = window.scrollY, vel = 0, dir = 1
    const tick = () => {
      const y = window.scrollY, dy = y - last; last = y
      if (dy !== 0) dir = dy > 0 ? 1 : -1
      vel = vel * .9 + Math.min(60, Math.abs(dy)) * .1
      x -= (.5 + vel * .4) * dir
      const third = track.scrollWidth / 3
      if (x <= -third) x += third; if (x > 0) x -= third
      track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)'
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  setupMisc(gsap: G, ST: ST) {
    const lock = this.q('[data-lock]'), closed = this.q('[data-lock-closed]'), open = this.q('[data-lock-open]'), body = this.q('[data-lock-body]')
    const plain = this.qa('[data-plain]'), masked = this.qa('[data-masked]'), vcards = this.qa('[data-vault-card]')
    if (this.reduced) { gsap.set(closed, { opacity: 1 }); gsap.set(open, { opacity: 0 }); gsap.set(plain, { opacity: 0 }); gsap.set(masked, { opacity: 1 }); }
    else if (lock) {
      gsap.set(vcards, { opacity: 0, y: 24 })
      ST.create({ trigger: lock, start: 'top 68%', once: true, onEnter: () => {
        gsap.to(vcards, { opacity: 1, y: 0, duration: .7, ease: 'power3.out', stagger: .14 })
        gsap.to(body, { keyframes: [{ y: 8, duration: .14, ease: 'power2.in' }, { y: 0, duration: .5, ease: 'back.out(3)' }], delay: 1.05 })
        gsap.to(closed, { opacity: 1, duration: .16, delay: 1.12 }); gsap.to(open, { opacity: 0, duration: .16, delay: 1.12 })
        gsap.to(plain, { opacity: 0, duration: .3, delay: 1.25, stagger: .12 }); gsap.to(masked, { opacity: 1, duration: .3, delay: 1.25, stagger: .12 })
      } })
    }
    if (!this.reduced) this.qa('[data-steam]').forEach((p, i) => gsap.fromTo(p, { strokeDashoffset: .32 }, { strokeDashoffset: -1, duration: 3 + i * .7, ease: 'none', repeat: -1, delay: i * 1.1 }))
    const salt = this.q('[data-salt]'), coin = this.q('[data-coin-flip]')
    if (salt && !this.reduced) ST.create({ trigger: salt, start: 'top 80%', once: true, onEnter: () => gsap.to(salt, { keyframes: [{ rotation: -24, duration: .16 }, { rotation: -10, duration: .1 }, { rotation: -26, duration: .12 }, { rotation: -8, duration: .1 }, { rotation: 0, duration: .4, ease: 'back.out(2)' }], delay: .3 }) })
    if (coin && !this.reduced) ST.create({ trigger: coin, start: 'top 82%', once: true, onEnter: () => gsap.fromTo(coin, { scaleX: 1, y: 0 }, { keyframes: [{ scaleX: 0.05, y: -18, duration: .18, ease: 'power1.in' }, { scaleX: 1, y: -26, duration: .18, ease: 'power1.out' }, { scaleX: 0.05, y: -18, duration: .18, ease: 'power1.in' }, { scaleX: 1, y: 0, duration: .34, ease: 'bounce.out' }], delay: .4 }) })
    const img = this.q('[data-cta-img]'), frame = this.q('[data-cta-frame]')
    if (img && !this.reduced) gsap.fromTo(img, { yPercent: -3.5 }, { yPercent: 3.5, ease: 'none', scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true } })
    if (!this.reduced) this.qa('[data-blob]').forEach((b, i) => gsap.to(b, { x: (i % 2 ? -1 : 1) * (60 + i * 14), y: (i % 3 ? 1 : -1) * (30 + i * 8), duration: 22 + i * 3.5, ease: 'sine.inOut', yoyo: true, repeat: -1 }))
  }

  iconAnim(card: HTMLElement, kind: string) {
    if (this.reduced) return
    const icon = card.querySelector('[data-icon]'); if (!icon || gsap.isTweening(icon)) return
    const k = ({
      drive: { keyframes: [{ x: 6, duration: .2, ease: 'power2.out' }, { x: 0, duration: .2, ease: 'power2.in' }] },
      flicker: { keyframes: [{ scale: 1.15, duration: .1 }, { scale: .94, duration: .1 }, { scale: 1.06, duration: .1 }, { scale: 1, duration: .1 }] },
      nod: { keyframes: [{ rotation: -12, duration: .14 }, { rotation: 8, duration: .14 }, { rotation: 0, duration: .12 }], transformOrigin: '50% 90%' },
      spin: { keyframes: [{ rotation: 72, duration: .4, ease: 'back.out(2)' }, { rotation: 0, duration: 0 }] },
      bounce: { keyframes: [{ y: -5, duration: .16, ease: 'power2.out' }, { y: 0, duration: .24, ease: 'bounce.out' }] },
      tilt: { keyframes: [{ rotation: -10, duration: .16 }, { rotation: 0, duration: .24, ease: 'back.out(2)' }] },
      pulse: { keyframes: [{ scale: 1.15, duration: .16 }, { scale: 1, duration: .24, ease: 'back.out(2)' }] },
      tap: { keyframes: [{ y: 2, scale: .92, duration: .12 }, { y: 0, scale: 1, duration: .28, ease: 'back.out(2)' }] },
      slide: { keyframes: [{ x: -4, duration: .16 }, { x: 0, duration: .24, ease: 'back.out(2)' }] }
    } as Record<string, gsap.TweenVars>)[kind]
    if (k) gsap.to(icon, k)
  }

  onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (this.state.form !== 'idle') return
    const f = e.currentTarget.elements as any
    if (f.sitio_web && f.sitio_web.value) return
    const name = f.nombre.value.trim(), rest = f.restaurante.value.trim(), cel = f.celular.value.replace(/\D/g, '')
    if (!name || !rest || !cel) return this.setState({ formError: 'Completa tu nombre, el restaurante y tu celular.' })
    if (cel.length < 10) return this.setState({ formError: 'Escribe tu celular con sus 10 dígitos.' })
    if (!f.acepto.checked) return this.setState({ formError: 'Necesitamos tu autorización para el tratamiento de datos.' })
    this.setState({ formError: '', form: 'sending', formName: name.split(' ')[0] })
    this.timers.push(setTimeout(() => this.setState({ form: 'done' }), 1200))
  }

  renderVals(): LandingVals {
    const s = this.state, narrow = s.narrow
    const waHref = enlaceWhatsApp(this.props.whatsapp)
    const showSoon = this.props.mostrarProximamente ?? true
    const groups = this.MODS.map(g => ({ ...g, items: g.items.filter(i => showSoon || !i.soon) })).filter(g => g.items.length)
    const tab = Math.min(s.tab, groups.length - 1)
    const seg = (on: boolean) => ({ bg: on ? '#FFFFFF' : 'transparent', fg: on ? '#0F172A' : '#475569', shadow: on ? '0 1px 2px rgba(15,23,42,.10)' : 'none' })
    const brand = this.BRANDS[s.brand]
    const tone = this.TONES.find(t => t.key === s.tone) || this.TONES[0]
    const n = groups[tab].items.length, vw = s.vw
    const cols = vw === 'sm' ? 1 : vw === 'md' ? (n === 4 ? 2 : Math.min(n, 3)) : (n === 5 ? 3 : Math.min(n, 4))
    const modBasis = cols === 1 ? '100%' : 'calc((100% - ' + ((cols - 1) * 16) + 'px) / ' + cols + ')'
    return {
      rootRef: this.rootRef,
      teamCols: vw === 'sm' ? 'minmax(0,1fr)' : 'repeat(3,minmax(0,1fr))',
      teamEnter: e => this.teamHover(e.currentTarget, true), teamLeave: e => this.teamHover(e.currentTarget, false),
      painCols: vw === 'xl' ? 'repeat(4,minmax(0,1fr))' : vw === 'md' ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)',
      arrowDisplay: narrow ? 'none' : 'block',
      waHref,
      tabs: groups.map((g, i) => ({ label: g.tab, ...seg(i === tab), onClick: () => this.setState({ tab: i }) })),
      mods: groups[tab].items.map(m => ({ ...m, basis: modBasis, mask: 'url(' + m.icon + ')', soonDisplay: m.soon ? 'inline-flex' : 'none', onEnter: e => this.iconAnim(e.currentTarget, m.anim) })),
      steps: this.STEPS.map((st, i) => ({ ...st, n: '0' + (i + 1), opacity: i === s.step ? 1 : .62, display: (!narrow || i === s.step) ? 'grid' : 'none', bar: i === s.step ? '#2F66E6' : '#E2E8F0', textDisplay: i === s.step ? 'block' : 'none', onClick: () => this.scrollToStep(i) })),
      howCols: narrow ? 'minmax(0,1fr)' : 'minmax(0,5fr) minmax(0,7fr)',
      howRows: narrow ? 'auto minmax(0,1fr)' : 'minmax(0,1fr)',
      howPad: narrow ? '84px 20px 16px' : '96px 24px 32px',
      howGap: narrow ? '8px' : '48px',
      howH2: narrow ? '28px' : 'clamp(34px,3.8vw,50px)',
      stageH: narrow ? '100%' : 'min(78vh,720px)',
      brands: this.BRANDS.map((b, i) => ({ ...b, bg: i === s.brand ? '#F8FAFC' : '#FFFFFF', bd: i === s.brand ? '#0F172A' : '#E2E8F0', onClick: () => this.setState({ brand: i }) })),
      accent: brand.ink, accentSoft: brand.soft, boxTint: brand.color, brandName: brand.name,
      tones: this.TONES.map(t => ({ label: t.label, bg: t.key === s.tone ? '#0F172A' : '#FFFFFF', fg: t.key === s.tone ? '#FFFFFF' : '#0F172A', bd: t.key === s.tone ? '#0F172A' : '#E2E8F0', onClick: () => this.setTone(t.key) })),
      toneName: 'Tono: ' + tone.name,
      sedes: ['1', '2–3', '4+'].map(l => ({ label: l, checked: String(l === s.sedes) as 'true' | 'false', ...seg(l === s.sedes), onClick: () => this.setState({ sedes: l }) })),
      formOpen: s.form !== 'done', formDone: s.form === 'done', hasError: !!s.formError, formError: s.formError, formName: s.formName,
      submitLabel: s.form === 'sending' ? 'Enviando…' : 'Agendar demo', submitOpacity: s.form === 'sending' ? .7 : 1,
      onSubmit: this.onSubmit,
      faqs: this.FAQS
    }
  }

  render() {
    const v = this.renderVals()
    return (
      <div ref={v.rootRef} style={{ position: 'relative', overflowX: 'clip', visibility: this.state.ready ? undefined : 'hidden' }}>
        <Nav waHref={v.waHref} inicio />{' '}
        <Hero v={v} />{' '}
        <FuncionaEn />{' '}
        <Dolores v={v} />{' '}
        <TuEquipo v={v} />{' '}
        <AsiFunciona v={v} />{' '}
        <Modulos v={v} />{' '}
        <Domicilios v={v} />{' '}
        <MeseroVirtual v={v} />{' '}
        <Banda />{' '}
        <Precios v={v} />{' '}
        <Seguridad />{' '}
        <AgendaDemo v={v} />{' '}
        <Preguntas v={v} />{' '}
        <CtaFinal v={v} />{' '}
        <Pie v={v} />{' '}
        <WhatsAppFlotante v={v} />
      </div>
    )
  }
}
