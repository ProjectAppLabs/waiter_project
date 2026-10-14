'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { PayLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { OrderState, PayMethod } from '@/lib/types'

type Variant = 'B1' | 'B2' | 'B3' | 'B4' | 'B5'
type Split = 'mine' | 'parts' | 'all'
const variantOf = (code: string): Variant => (['B2', 'B3', 'B4', 'B5'].includes(code.toUpperCase()) ? (code.toUpperCase() as Variant) : 'B1')
const STEP_BARS: Record<OrderState, number> = { pendiente_pago: 0, enviado: 1, en_cocina: 2, listo: 2, servido: 3, pagado: 3, fallido: 0 }
// Maqueta de tarjeta: se formatea para verse real, pero el número nunca sale del componente (no hay pasarela todavía).
const formatCardNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }
const LONG: Record<PayMethod, 'methodTarjeta' | 'methodPse' | 'methodNequi' | 'methodEfectivo'> = { tarjeta: 'methodTarjeta', pse: 'methodPse', nequi: 'methodNequi', efectivo: 'methodEfectivo' }

// Pago de la familia B (docs/diseno/plantillas/B*/pago.html). Base B1/B5: píldoras de método, formulario de tarjeta en mono,
// interruptor «Guardar para la próxima visita», aviso «Tokenizado por la pasarela» y CTA «Pagar $ total» de 60 px en acento.
// Variantes: B2 cabecera «Pagar» + monto y el método activo como tarjeta seleccionada con check (+ «Usar otra forma de pago →»);
// B3 «¿Cómo dividen?» con Pagar lo mío / Dividir en N / Pagar todo (bill.mio, bill.porParte, bill.total: datos reales) y CTA verde;
// B4 banda crema «Total» + monto de 28 px, métodos en filas de 62 px sin formulario y CTA con radio 8. Estados authorizing / paid /
// declined y la insignia «Demo · sin cobro real» comunes. La tarjeta guardada «•••• 4242» y la propina al barista del marco no
// existen (no hay tarjetas guardadas ni propina en el servidor) y no se pintan. onPay solo lleva el método (contrato 4).
export function FamilyBPay({ bill, template, methods, onPay, state, demo, goBack, result, order, merchant, table, account, onRetry, onPayAtTable, onSignup, goMenu }: PayLayoutProps) {
  const t = useTranslations('diner.pay')
  const tb = useTranslations('diner.templates.familiaB.pay')
  const ts = useTranslations('diner.status')
  const variant = variantOf(template.codigo)
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? 'tarjeta')
  const [others, setOthers] = useState(false)
  const [split, setSplit] = useState<Split>('all')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [save, setSave] = useState(true)
  const discount = bill.descuento
  const pct = discount?.porcentaje ?? 0
  const radius = variant === 'B4' ? 'rounded-[8px]' : 'rounded-t-boton'
  const money = `w-full ${variant === 'B4' ? 'h-[64px] text-[17px]' : 'h-[60px] text-[16px]'} ${radius} bg-t-acento text-t-acento-tinta font-bold disabled:opacity-60`
  const secondary = 'h-[52px] rounded-t-boton bg-t-fondo border border-t-borde text-base font-medium text-t-tinta'
  const field = 'h-[52px] w-full rounded-[10px] bg-t-fondo border border-t-borde px-3.5 font-t-mono text-[16px] text-t-tinta placeholder:text-t-tinta-terciaria'
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const demoBadge = demo && <span className="self-start inline-flex items-center h-7 px-2.5 rounded-t-chip bg-pending-soft text-pending-ink text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>
  const total = formatCop(bill.total)

  if (state === 'authorizing') {
    return (
      <div className="px-[18px] pt-[22px] pb-[18px] flex flex-col items-center gap-4 text-center text-t-tinta" aria-busy="true">
        <div role="status" aria-label={t('authorizing')} className="w-[92px] h-[92px] rounded-full border-[5px] border-t-borde border-t-t-acento animate-spin" />
        <h1 className="t-title text-[22px] leading-tight">{t('authorizing')}</h1>
        <p className="text-base text-t-tinta-suave">{t('authorizingHint')}</p>
        <dl className="w-full rounded-t-tarjeta bg-t-superficie border border-t-borde p-4 flex flex-col gap-2 text-left text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('merchant')}</dt><dd className="font-medium">{merchant}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('reference')}</dt><dd className="font-t-mono tabular">{table !== null ? `#${table}` : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('amount')}</dt><dd className="font-t-mono tabular">$ {total}</dd></div>
        </dl>
        {demoBadge}
        <p className="text-[14px] text-t-tinta-suave">{t('authorizingFoot')}</p>
      </div>
    )
  }

  if (state === 'paid') {
    const bars = order ? STEP_BARS[order.estado] : 1
    return (
      <div className="flex flex-col gap-4 pb-[18px] text-t-tinta">
        <header className="bg-free text-white px-[18px] pt-[22px] pb-6 flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="w-[62px] h-[62px] rounded-full bg-white/20 grid place-items-center text-[28px] font-bold">✓</span>
          <h1 className="t-title text-[24px] leading-tight">{t('paid')}</h1>
          <span className="font-t-mono tabular text-[26px]">$ {total}</span>
          {demo && <span className="inline-flex items-center h-7 px-2.5 rounded-t-chip bg-white/20 text-white text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>}
        </header>
        <div className="px-[18px] flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-t-borde text-[15px]">
            {discount && (discount.aplicado || discount.aplicable) && <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('saved')}</dt><dd className="font-t-mono tabular text-free-ink">$ {formatCop(discount.monto)}</dd></div>}
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('paidWith')}</dt><dd className="font-medium">{t(`method.${result?.metodo ?? method}`)}{result?.referencia ? <span className="font-t-mono tabular text-t-tinta-suave"> · {result.referencia}</span> : null}</dd></div>
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('invoice')}</dt><dd className="text-free-ink font-medium">{t('invoiceSent')}</dd></div>
          </dl>
          <section className="rounded-t-tarjeta bg-t-superficie border border-t-borde p-4 flex flex-col gap-3">
            <span className="text-[15px] font-medium">{order ? ts(order.estado) : t('orderCard')}</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i <= bars ? 'bg-free' : 'bg-t-borde'}`} />)}</div>
            <span className="text-[13px] text-t-tinta-suave">{t('orderSteps')}</span>
          </section>
          {account && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] text-t-tinta">{t('keepData')}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={goMenu} className={`${secondary} flex-1`}>{t('backToMenu')}</button>
            <button type="button" disabled className="h-[52px] flex-1 rounded-t-boton bg-t-acento text-t-acento-tinta text-base font-medium disabled:opacity-50">{t('rate')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'declined') {
    const option = 'h-[56px] px-4 rounded-t-boton border border-t-borde bg-t-superficie text-left text-base font-medium text-t-tinta flex items-center justify-between'
    return (
      <div className="px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4 text-t-tinta">
        <div role="alert" className="rounded-t-tarjeta bg-busy-soft border border-[#EBC7C4] p-4 flex gap-3">
          <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full bg-busy text-white grid place-items-center font-bold">!</span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[18px] font-bold text-[#7E1C18] leading-tight">{t('declined')}</h1>
            <p className="text-[15px] text-busy-ink">{t('declinedHint')}</p>
          </div>
        </div>
        <span className="text-[13px] tracking-[0.1em] uppercase text-t-tinta-terciaria">{t('whatNow')}</span>
        <button type="button" onClick={() => { setMethod('tarjeta'); onRetry() }} className={option}><span>{t('retryCard')}</span><span aria-hidden="true">→</span></button>
        <button type="button" onClick={() => { setMethod('pse'); onRetry() }} className={option}><span>{t('retryOther')}</span><span aria-hidden="true">→</span></button>
        <button type="button" onClick={onPayAtTable} className={option}><span>{t('payAtTable')}</span><span aria-hidden="true">→</span></button>
        {demoBadge}
        <p className="text-[13px] text-t-tinta-suave">{t('declinedFoot')}</p>
      </div>
    )
  }

  if (bill.total <= 0) {
    return (
      <div className="px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4 text-t-tinta">
        <h1 className="t-title text-[19px] leading-tight">{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('nothing')}</p>
        <button type="button" onClick={goMenu} className={secondary}>{t('seeMenu')}</button>
        <button type="button" onClick={goBack} className="h-[44px] text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    )
  }

  // B3: el monto del CTA es la parte elegida (dato real del servidor); onPay solo lleva el método (contrato 4).
  const splitAmount = variant !== 'B3' ? bill.total : split === 'mine' ? bill.mio : split === 'parts' ? bill.porParte : bill.total
  const amount = formatCop(splitAmount)
  const [before, after] = t('pay', { amount }).split(amount)
  const pill = (m: PayMethod) => `shrink-0 h-[44px] px-[13px] rounded-t-chip text-[14px] ${method === m ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta-suave'}`
  const card = (active: boolean) => `w-full min-h-[56px] px-3.5 py-3 rounded-t-boton text-left text-[15px] flex items-center justify-between gap-3 ${active ? 'border-2 border-t-acento bg-t-acento-suave text-t-tinta font-medium' : 'border border-t-borde text-t-tinta-suave'}`
  const check = <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[12px] font-bold">✓</span>
  const cardForm = method === 'tarjeta' && variant !== 'B4' && (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} autoComplete="off">
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t('cardNumber')}</span>
        <input inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={number} onChange={(e) => setNumber(formatCardNumber(e.target.value))} className={field} />
        <span className="text-[12px] text-t-tinta-terciaria">{t('cardHint')}</span>
      </label>
      <div className="flex gap-2.5">
        <label className="flex-1 min-w-0 flex flex-col gap-1.5"><span className={label}>{t('expires')}</span><input inputMode="numeric" autoComplete="off" placeholder="08/29" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} className={field} /></label>
        <label className="flex-1 min-w-0 flex flex-col gap-1.5"><span className={label}>{t('cvv')}</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="•••" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} className={field} /></label>
      </div>
      <label className="flex items-center gap-[11px] min-h-[44px]">
        <button type="button" role="switch" aria-checked={save} onClick={() => setSave((s) => !s)} className={`w-[48px] h-[28px] shrink-0 rounded-full p-[3px] flex ${save ? 'bg-t-acento justify-end' : 'bg-t-borde justify-start'}`}><span aria-hidden="true" className="w-[22px] h-[22px] rounded-full bg-white" /></button>
        <span className="text-[14px] text-t-tinta-suave">{t('saveCard')}</span>
      </label>
    </form>
  )
  const hints = (
    <>
      {method === 'pse' && <p className="text-[15px] text-t-tinta-suave">{t('pseHint')}</p>}
      {method === 'nequi' && <p className="text-[15px] text-t-tinta-suave">{t('nequiHint')}</p>}
      {method === 'efectivo' && <p className="text-[15px] text-t-tinta-suave">{t('cashHint')}</p>}
    </>
  )
  // Aviso «Tokenizado por la pasarela» sobre la superficie de la plantilla (el marco pinta #F2EEE8 en claro; en B4 la caja fija clara
  // dejaba la tinta suave de la pizarra ilegible).
  const tokenized = (
    <div data-testid="tokenized" className="flex gap-[9px] items-center px-[13px] py-[11px] rounded-[10px] bg-t-superficie">
      <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-md bg-free text-white grid place-items-center text-[11px] font-bold">✓</span>
      <span className="text-[13px] leading-[1.4] text-t-tinta-suave">{variant === 'B1' || variant === 'B5' ? t('tokenized') : tb('tokenizedShort')}</span>
    </div>
  )
  const hook = !account && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
    <button type="button" onClick={onSignup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-left text-[14px] font-medium text-t-tinta">{t('signupHook', { pct })}</button>
  )
  const head = (title: string, amountClass: string) => (
    <header className="px-[18px] py-[18px] border-b border-t-borde flex items-center gap-3">
      <button type="button" onClick={goBack} aria-label={t('back')} className="shrink-0 w-[44px] h-[44px] -ml-2 grid place-items-center text-[18px] text-t-tinta-suave">←</button>
      <h1 className="t-title text-[18px] leading-[1.15] flex-1">{title}</h1>
      <span className={`font-t-mono tabular whitespace-nowrap ${amountClass}`}>$ {total}</span>
    </header>
  )
  const methodsBlock = variant === 'B4'
    ? (
      <div role="radiogroup" aria-label={t('methods')} className="flex flex-col gap-2.5">
        {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={`h-[62px] px-4 rounded-t-boton text-left text-[16px] flex items-center ${method === m ? 'border-2 border-t-acento font-medium text-t-tinta' : 'border border-t-borde text-t-tinta-suave'}`}>{tb(LONG[m])}</button>)}
      </div>
    )
    : variant === 'B2'
      ? (
        <div role="radiogroup" aria-label={t('methods')} className="flex flex-col gap-2.5">
          {methods.filter((m) => others || m === method).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { setMethod(m); setOthers(false) }} className={card(method === m)}><span>{tb(LONG[m])}</span>{method === m && check}</button>)}
          {!others && <button type="button" aria-expanded={others} onClick={() => setOthers(true)} className="w-full min-h-[52px] px-3.5 rounded-t-boton border border-t-borde text-left text-[15px] text-t-tinta-suave flex items-center justify-between"><span>{tb('otherMethod')}</span><span aria-hidden="true">→</span></button>}
        </div>
      )
      : (
        <div role="radiogroup" aria-label={t('methods')} className={`flex gap-[7px] overflow-x-auto [scrollbar-width:none] ${variant === 'B3' ? '' : '-mx-[18px] px-[18px] py-2.5 border-b border-t-borde'}`}>
          {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={pill(m)}>{t(`method.${m}`)}</button>)}
        </div>
      )
  const splitBlock = variant === 'B3' && (
    <div role="radiogroup" aria-label={tb('splitOptions')} className="flex flex-col gap-2.5">
      {([['mine', tb('splitMine'), bill.mio], ['parts', tb('splitParts', { n: bill.partes }), bill.porParte], ['all', tb('splitAll'), bill.total]] as [Split, string, number][])
        .filter(([k]) => k !== 'parts' || bill.partes > 1)
        .map(([k, name, value]) => <button key={k} type="button" role="radio" aria-checked={split === k} onClick={() => setSplit(k)} className={card(split === k)}><span>{name}</span><span className="font-t-mono tabular text-[15px] text-t-tinta">{formatCop(value)}</span></button>)}
    </div>
  )

  return (
    <div className="flex flex-col text-t-tinta">
      {variant === 'B4'
        ? (
          <header className="px-[18px] py-5 bg-t-acento text-t-acento-tinta flex items-center gap-3">
            <button type="button" onClick={goBack} aria-label={t('back')} className="shrink-0 w-[44px] h-[44px] -ml-2 grid place-items-center text-[18px]">←</button>
            <h1 className="t-title text-[17px] leading-[1.15] flex-1">{tb('total')}</h1>
            <span className="font-t-mono tabular text-[28px] whitespace-nowrap">$ {total}</span>
          </header>
        )
        : head(variant === 'B3' ? tb('split') : t('title'), variant === 'B2' ? 'text-[22px]' : variant === 'B3' ? 'text-[19px]' : 'text-[20px]')}
      {table !== null && variant !== 'B4' && <span className="px-[18px] pt-2 text-[14px] text-t-tinta-suave">{t('table', { n: table })}</span>}
      <div className={`px-[18px] flex flex-col gap-3 ${variant === 'B1' || variant === 'B5' ? 'pt-0' : 'pt-4'} pb-4`}>
        {splitBlock}
        {methodsBlock}
        {cardForm}
        {hints}
        {tokenized}
        {hook}
        {demoBadge}
      </div>
      <div className="sticky bottom-0 px-[18px] py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-2.5">
        {method === 'efectivo'
          ? <button type="button" onClick={onPayAtTable} className={money}>{t('payAtTable')}</button>
          : <button type="button" onClick={() => onPay(method, variant === 'B3' ? split : 'all')} className={money}>{before}<span className="font-t-mono tabular">{amount}</span>{after}</button>}
        <button type="button" onClick={goBack} className="self-center h-[44px] text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    </div>
  )
}
