'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { PayLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { OrderState, PayMethod } from '@/lib/types'

// Barras del pedido en la pantalla «Pagado»: recibido · en preparación · servido.
const STEP_BARS: Record<OrderState, number> = { pendiente_pago: 0, enviado: 1, en_cocina: 2, listo: 2, servido: 3, pagado: 3, fallido: 0 }
// Maqueta de tarjeta: se formatea para que se vea real, pero el número nunca sale del componente (no hay pasarela todavía).
const formatCardNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }

// Pago genérico (flujo base 3a/3b, docs/diseno/2026-09-05-flujos-base-pago-y-cuenta.md): píldoras de método, formulario de tarjeta
// maquetado, «Autorizando» con datos del comercio, «Pagado» con la insignia «Demo · sin cobro real» y «Rechazada» con salidas.
export function GenericPay({ bill, methods, onPay, state, demo, goBack, result, order, merchant, table, account, onRetry, onPayAtTable, onSignup, goMenu }: PayLayoutProps) {
  const t = useTranslations('diner.pay')
  const ts = useTranslations('diner.status')
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? 'tarjeta')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [save, setSave] = useState(true)
  const amount = formatCop(bill.total)
  const discount = bill.descuento
  const pct = discount?.porcentaje ?? 0
  const shell = 'px-[18px] pt-[22px] pb-[18px] flex flex-col gap-4 text-t-tinta'
  const field = 'h-[52px] w-full rounded-t-boton bg-t-superficie border border-t-borde px-3.5 font-t-mono text-[16px] text-t-tinta placeholder:text-t-tinta-terciaria'
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const secondary = 'h-tap rounded-t-boton bg-t-superficie border border-t-borde text-base font-medium text-t-tinta'
  const money = 'h-[60px] rounded-t-boton bg-free text-white text-[17px] font-bold disabled:opacity-60'
  const demoBadge = demo && <span className="self-start inline-flex items-center h-7 px-2.5 rounded-t-chip bg-pending-soft text-pending-ink text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>

  if (state === 'authorizing') {
    return (
      <div className={`${shell} items-center text-center`} aria-busy="true">
        <div role="status" aria-label={t('authorizing')} className="w-[92px] h-[92px] rounded-full border-[5px] border-muted border-t-t-acento animate-spin" />
        <h1 className="t-title text-[22px] leading-tight">{t('authorizing')}</h1>
        <p className="text-base text-t-tinta-suave">{t('authorizingHint')}</p>
        <dl className="w-full rounded-t-tarjeta bg-t-superficie border border-t-borde p-4 flex flex-col gap-2 text-left text-[15px]">
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('merchant')}</dt><dd className="font-medium">{merchant}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('reference')}</dt><dd className="font-t-mono tabular">{table !== null ? `#${table}` : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('amount')}</dt><dd className="font-t-mono tabular">$ {amount}</dd></div>
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
          <span className="font-t-mono tabular text-[26px]">$ {amount}</span>
          {demo && <span className="inline-flex items-center h-7 px-2.5 rounded-t-chip bg-white/20 text-white text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>}
        </header>
        <div className="px-[18px] flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-t-borde text-[15px]">
            {discount && (discount.aplicado || discount.aplicable) && <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('saved')}</dt><dd className="font-t-mono tabular text-free-ink">$ {formatCop(discount.monto)}</dd></div>}
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('paidWith')}</dt><dd className="font-medium">{t(`method.${result?.metodo ?? method}`)}{result?.referencia ? <span className="font-t-mono tabular text-t-tinta-suave"> · {result.referencia}</span> : null}</dd></div>
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('invoice')}</dt><dd className="text-free-ink font-medium">{t('invoiceSent')}</dd></div>
          </dl>
          <section className="rounded-t-tarjeta bg-muted p-4 flex flex-col gap-3">
            <span className="text-[15px] font-medium">{order ? ts(order.estado) : t('orderCard')}</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i <= bars ? 'bg-free' : 'bg-border'}`} />)}</div>
            <span className="text-[13px] text-t-tinta-suave">{t('orderSteps')}</span>
          </section>
          {account && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] text-t-tinta">{t('keepData')}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={goMenu} className={`${secondary} flex-1`}>{t('backToMenu')}</button>
            <button type="button" disabled className="h-tap flex-1 rounded-t-boton bg-dark text-dark-ink text-base font-medium disabled:opacity-50">{t('rate')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'declined') {
    const option = 'h-tap px-4 rounded-t-boton border border-t-borde bg-t-superficie text-left text-base font-medium text-t-tinta flex items-center justify-between'
    return (
      <div className={shell}>
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
      <div className={shell}>
        <h1 className="t-title text-[32px] leading-tight">{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('nothing')}</p>
        <button type="button" onClick={goMenu} className={secondary}>{t('seeMenu')}</button>
        <button type="button" onClick={goBack} className="h-tap-min text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    )
  }

  const [before, after] = t('pay', { amount }).split(amount)
  const pill = (m: PayMethod) => `shrink-0 h-[44px] px-3.5 rounded-t-chip text-[14px] font-medium ${method === m ? 'bg-dark text-dark-ink' : 'bg-t-superficie border border-t-borde text-t-tinta-suave'}`
  return (
    <div className={shell}>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="t-title text-[32px] leading-tight">{t('title')}</h1>
        <span className="font-t-mono tabular text-[20px]">$ {amount}</span>
      </div>
      {table !== null && <span className="-mt-3 text-[14px] text-t-tinta-suave">{t('table', { n: table })}</span>}
      <div role="radiogroup" aria-label={t('methods')} className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={pill(m)}>{t(`method.${m}`)}</button>)}
      </div>
      {method === 'tarjeta' && (
        <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} autoComplete="off">
          <label className="flex flex-col gap-1.5">
            <span className={label}>{t('cardNumber')}</span>
            <input inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={number} onChange={(e) => setNumber(formatCardNumber(e.target.value))} className={field} />
            <span className="text-[12px] text-t-tinta-terciaria">{t('cardHint')}</span>
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1.5"><span className={label}>{t('expires')}</span><input inputMode="numeric" autoComplete="off" placeholder="08/29" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} className={field} /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>{t('cvv')}</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="•••" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} className={field} /></label>
          </div>
          <label className="flex items-center gap-3 h-tap-min">
            <button type="button" role="switch" aria-checked={save} onClick={() => setSave((s) => !s)} className={`w-[52px] h-[30px] shrink-0 rounded-full p-[3px] flex ${save ? 'bg-t-acento justify-end' : 'bg-border justify-start'}`}><span aria-hidden="true" className="w-6 h-6 rounded-full bg-white" /></button>
            <span className="text-[14px] text-t-tinta-suave">{t('saveCard')}</span>
          </label>
        </form>
      )}
      {method === 'pse' && <p className="text-[15px] text-t-tinta-suave">{t('pseHint')}</p>}
      {method === 'nequi' && <p className="text-[15px] text-t-tinta-suave">{t('nequiHint')}</p>}
      {method === 'efectivo' && <p className="text-[15px] text-t-tinta-suave">{t('cashHint')}</p>}
      <div className="flex gap-2.5 items-center px-3.5 py-3 rounded-t-boton bg-muted">
        <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-md bg-free text-white grid place-items-center text-[11px] font-bold">✓</span>
        <span className="text-[13px] leading-snug text-t-tinta-suave">{t('tokenized')}</span>
      </div>
      {!account && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
        <button type="button" onClick={onSignup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-left text-[14px] font-medium text-t-tinta">{t('signupHook', { pct })}</button>
      )}
      {demoBadge}
      {method === 'efectivo'
        ? <button type="button" onClick={onPayAtTable} className={money}>{t('payAtTable')}</button>
        : <button type="button" onClick={() => onPay(method)} className={money}>{before}<span className="font-t-mono tabular">{amount}</span>{after}</button>}
      <button type="button" onClick={goBack} className="h-tap-min text-[15px] font-medium text-t-acento">{t('back')}</button>
    </div>
  )
}
