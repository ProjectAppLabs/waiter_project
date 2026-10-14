'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useCarta, useCountLabel } from '@/components/templates/families/F/parts'
import type { PayLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { OrderState, PayMethod } from '@/lib/types'

// Pago de la familia F (docs/diseno/plantillas/F*/pago.html), una entrada por familia ramificada por template.codigo:
//  · F1 y F2 (base): cabecera «Confirmar y pagar» + «44 piezas · mesa 14»; caja resumen Productos / Descuento 5% / Total; campos
//    Número de la tarjeta, Vence + CVV de 52 px en mono; nota de factura electrónica sin caja; CTA «Pagar $ total» (F2: 64 px, radio 8).
//  · F3: piel oscura de la familia A: «TOTAL A PAGAR» en versalitas + monto mono 38; campos sobre la superficie; nota de
//    tokenización con check verde; CTA de contorno dorado.
//  · F4: estructura de la familia B: píldoras de método arriba (la activa en el acento rojo), campos, interruptor «Guardar para la
//    próxima visita», nota de tokenización sobre gris cálido, CTA rojo.
//  · F5: «¿Cómo dividen?»: Pagar lo mío (bill.mio, si hay más comensales), Dividir en N (bill.partes > 1) y Pagar todo; la elegida
//    define el monto del CTA. No hay tarjeta guardada en el pago simulado: en su lugar van los campos de tarjeta del pago base.
//    onPay envía la opción de reparto; experience calcula el importe sobre el pedido confirmado.
// Los métodos de Waiter (Tarjeta / PSE / Nequi / Efectivo) se ofrecen en las cuatro pieles; Efectivo manda al mesero. Los estados
// «Autorizando», «Pagado» y «Rechazada» llevan la insignia «Demo · sin cobro real» y las tres salidas del flujo base.
const STEP_BARS: Record<OrderState, number> = { pendiente_pago: 0, enviado: 1, en_cocina: 2, listo: 2, servido: 3, pagado: 3, fallido: 0 }
const formatCardNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }
type Split = 'mine' | 'split' | 'all'

export function FamilyFPay({ bill, template, methods, onPay, state, demo, goBack, result, order, merchant, table, account, onRetry, onPayAtTable, onSignup, goMenu }: PayLayoutProps) {
  const t = useTranslations('diner.pay')
  const ts = useTranslations('diner.status')
  const tf = useTranslations('diner.templates.familiaF')
  const menu = useCarta()
  const cart = useDinerStore((s) => s.cart)
  const countLabel = useCountLabel()
  const code = template.codigo.toUpperCase()
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? 'tarjeta')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [save, setSave] = useState(true)
  const [split, setSplit] = useState<Split>('all')
  const discount = bill.descuento
  const pct = discount?.porcentaje ?? 0
  const dark = code === 'F3'
  const cta = code === 'F3'
    ? 'h-[60px] rounded-t-boton border border-t-acento text-t-acento text-[16px] font-bold disabled:opacity-60'
    : code === 'F2'
      ? 'h-16 rounded-[8px] bg-t-acento text-t-acento-tinta text-[17px] font-bold tracking-[-0.02em] disabled:opacity-60'
      : 'h-[60px] rounded-t-boton bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60'
  const option = 'h-12 px-4 rounded-t-boton border border-t-borde bg-t-superficie text-left text-[15px] font-medium text-t-tinta flex items-center justify-between'
  const foot = 'px-[18px] py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-2.5'
  const demoBadge = demo && <span className="self-start inline-flex items-center h-7 px-2.5 rounded-t-chip bg-pending-soft text-pending-ink text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>
  const amountOf = (s: Split) => (s === 'mine' ? bill.mio : s === 'split' ? bill.porParte : bill.total)
  const chosen = code === 'F5' ? amountOf(split) : bill.total
  const amount = formatCop(chosen)

  if (state === 'authorizing') {
    return (
      <div className="px-[18px] py-[22px] flex flex-col items-center gap-4 text-center text-t-tinta" aria-busy="true">
        <div role="status" aria-label={t('authorizing')} className="w-[92px] h-[92px] rounded-full border-[5px] border-t-borde border-t-t-acento animate-spin" />
        <h1 className={dark ? 't-title text-[24px] leading-tight' : 'text-[22px] font-bold tracking-[-0.02em] leading-[1.15]'}>{t('authorizing')}</h1>
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
          <h1 className={dark ? 't-title text-[26px] leading-tight' : 'text-[24px] font-bold tracking-[-0.02em] leading-[1.15]'}>{t('paid')}</h1>
          <span className="font-t-mono tabular text-[26px]">$ {formatCop(result?.monto ?? chosen)}</span>
          {demo && <span className="inline-flex items-center h-7 px-2.5 rounded-t-chip bg-white/20 text-white text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>}
        </header>
        <div className="px-[18px] flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-t-borde text-[15px]">
            {(discount?.aplicado || discount?.aplicable) && <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('saved')}</dt><dd className="font-t-mono tabular text-free">$ {formatCop(discount.monto)}</dd></div>}
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('paidWith')}</dt><dd className="font-medium">{t(`method.${result?.metodo ?? method}`)}{result?.referencia ? <span className="font-t-mono tabular text-t-tinta-suave"> · {result.referencia}</span> : null}</dd></div>
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('invoice')}</dt><dd className="text-free font-medium">{t('invoiceSent')}</dd></div>
          </dl>
          <section className="rounded-t-tarjeta bg-t-superficie border border-t-borde p-4 flex flex-col gap-3">
            <span className="text-[15px] font-medium">{order ? ts(order.estado) : t('orderCard')}</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i <= bars ? 'bg-free' : 'bg-t-borde'}`} />)}</div>
            <span className="text-[13px] text-t-tinta-suave">{t('orderSteps')}</span>
          </section>
          {account && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave border border-t-borde text-[14px] text-t-tinta">{t('keepData')}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={goMenu} className={`${option} flex-1 justify-center`}>{t('backToMenu')}</button>
            <button type="button" disabled className={`${cta} flex-1 h-12`}>{t('rate')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'declined') {
    return (
      <div className="px-[18px] py-[22px] flex flex-col gap-4 text-t-tinta">
        <div role="alert" className="rounded-t-tarjeta bg-busy-soft border border-busy/30 p-4 flex gap-3">
          <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full bg-busy text-white grid place-items-center font-bold">!</span>
          <div className="flex flex-col gap-1">
            <h1 className="text-[18px] font-bold text-busy-ink leading-tight">{t('declined')}</h1>
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
      <div className="px-[18px] py-[22px] flex flex-col gap-4 text-t-tinta">
        <h1 className={dark ? 't-title text-[26px] leading-tight' : 'text-[19px] font-bold tracking-[-0.02em] leading-[1.15]'}>{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('nothing')}</p>
        <button type="button" onClick={goMenu} className={option}>{t('seeMenu')}</button>
        <button type="button" onClick={goBack} className="h-11 text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    )
  }

  const [before, after] = t('pay', { amount }).split(amount)
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const field = `h-[52px] w-full rounded-[10px] border border-t-borde px-3.5 font-t-mono text-[16px] text-t-tinta placeholder:text-t-tinta-terciaria ${dark ? 'bg-t-superficie' : 'bg-t-fondo'}`
  const pill = (m: PayMethod) => `shrink-0 h-[42px] px-[13px] rounded-t-chip text-[14px] ${method === m ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta-suave'}`
  const pieces = countLabel(cart, menu)
  const methodsRow = (
    <div role="radiogroup" aria-label={t('methods')} className={`flex gap-[7px] overflow-x-auto [scrollbar-width:none] ${code === 'F4' ? 'px-[18px] py-2.5 border-b border-t-borde' : ''}`}>
      {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={pill(m)}>{t(`method.${m}`)}</button>)}
    </div>
  )
  const cardForm = method === 'tarjeta' && (
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
      {code === 'F4' && (
        <label className="flex items-center gap-[11px] h-11">
          <button type="button" role="switch" aria-checked={save} onClick={() => setSave((s) => !s)} className={`w-12 h-7 shrink-0 rounded-full p-[3px] flex ${save ? 'bg-t-acento justify-end' : 'bg-t-borde justify-start'}`}><span aria-hidden="true" className="w-[22px] h-[22px] rounded-full bg-white" /></button>
          <span className="text-[14px] text-t-tinta-suave">{t('saveCard')}</span>
        </label>
      )}
    </form>
  )
  const hint = method === 'pse' ? t('pseHint') : method === 'nequi' ? t('nequiHint') : method === 'efectivo' ? t('cashHint') : null
  const tokenNote = (
    <div className={`flex gap-[9px] items-center px-[13px] py-[11px] rounded-[10px] ${dark ? 'bg-t-superficie' : 'bg-muted'}`}>
      <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-md bg-free text-white grid place-items-center text-[11px] font-bold">✓</span>
      <span className="text-[13px] leading-[1.4] text-t-tinta-suave">{tf('pay.tokenized')}</span>
    </div>
  )
  const hook = !account && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
    <button type="button" onClick={onSignup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave border border-t-borde text-left text-[14px] font-medium text-t-tinta">{t('signupHook', { pct })}</button>
  )
  const payButton = method === 'efectivo'
    ? <button type="button" onClick={onPayAtTable} className={cta}>{t('payAtTable')}</button>
    : <button type="button" onClick={() => onPay(method, code === 'F5' ? (split === 'split' ? 'parts' : split) : 'all')} className={cta}>{before}<span className="font-t-mono tabular">{amount}</span>{after}</button>
  const footer = (
    <div className={foot}>
      {demoBadge}
      {payButton}
      <button type="button" onClick={goBack} className="h-11 text-[15px] font-medium text-t-tinta-suave">{t('back')}</button>
    </div>
  )

  if (code === 'F3') {
    return (
      <div className="flex flex-col text-t-tinta">
        <header className="px-[18px] pt-[26px] pb-5 text-center border-b border-t-borde">
          <h1 className="text-[13px] tracking-[0.14em] uppercase text-t-tinta-suave font-medium">{tf('pay.totalToPay')}</h1>
          <p className="font-t-mono tabular text-[38px] mt-2 whitespace-nowrap">$ {amount}</p>
          {(pieces || table !== null) && <p className="text-[13px] text-t-tinta-suave mt-1">{[pieces, table !== null ? t('table', { n: table }) : null].filter(Boolean).join(' · ')}</p>}
        </header>
        <div className="px-[18px] py-4 flex flex-col gap-3">
          {methodsRow}
          {cardForm}
          {hint && <p className="text-[15px] text-t-tinta-suave">{hint}</p>}
          {tokenNote}
          {hook}
        </div>
        {footer}
      </div>
    )
  }

  if (code === 'F4') {
    return (
      <div className="flex flex-col text-t-tinta">
        {methodsRow}
        <div className="px-[18px] py-3.5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] text-t-tinta-suave">{[pieces, table !== null ? t('table', { n: table }) : null].filter(Boolean).join(' · ') || t('title')}</span>
            <span className="font-t-mono tabular text-[20px]">$ {amount}</span>
          </div>
          {cardForm}
          {hint && <p className="text-[15px] text-t-tinta-suave">{hint}</p>}
          {tokenNote}
          {hook}
        </div>
        {footer}
      </div>
    )
  }

  if (code === 'F5') {
    const options: { id: Split; label: string; amount: number }[] = []
    if (bill.mio > 0 && bill.mio < bill.total) options.push({ id: 'mine', label: tf('pay.payMine'), amount: bill.mio })
    if (bill.partes > 1) options.push({ id: 'split', label: tf('pay.splitIn', { n: bill.partes }), amount: bill.porParte })
    options.push({ id: 'all', label: tf('pay.payAll'), amount: bill.total })
    return (
      <div className="flex flex-col text-t-tinta">
        <header className="px-[18px] py-[18px] border-b border-t-borde flex items-baseline justify-between gap-3">
          <h1 className="text-[18px] font-bold tracking-[-0.02em] leading-[1.15]">{tf('pay.howSplit')}</h1>
          <span className="font-t-mono tabular text-[19px] whitespace-nowrap">{formatCop(bill.total)}</span>
        </header>
        <div className="px-[18px] py-4 flex flex-col gap-2.5">
          <div role="radiogroup" aria-label={tf('pay.howSplit')} className="flex flex-col gap-2.5">
            {options.map((o) => {
              const on = split === o.id
              return (
                <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setSplit(o.id)} className={`flex items-center justify-between px-[15px] min-h-[52px] py-3 rounded-t-boton text-[15px] ${on ? 'border-2 border-t-acento bg-t-acento-suave font-medium' : 'border border-t-borde'}`}>
                  <span>{o.label}</span><span className="font-t-mono tabular text-[15px]">{formatCop(o.amount)}</span>
                </button>
              )
            })}
          </div>
          {methodsRow}
          {cardForm}
          {hint && <p className="text-[15px] text-t-tinta-suave">{hint}</p>}
          {tokenNote}
          {hook}
        </div>
        {footer}
      </div>
    )
  }

  // F1 / F2: base de la familia.
  return (
    <div className="flex flex-col text-t-tinta">
      <header className="px-[18px] py-4 border-b border-t-borde">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] leading-[1.15]">{tf('pay.confirmTitle')}</h1>
        <p className="text-[14px] text-t-tinta-suave mt-[3px]">{[pieces, table !== null ? t('table', { n: table }) : null].filter(Boolean).join(' · ') || merchant}</p>
      </header>
      <div className="px-[18px] py-3.5 flex flex-col gap-3">
        <dl className="px-3.5 py-[13px] rounded-t-tarjeta bg-t-superficie border border-t-borde text-[15px]">
          <div className="flex justify-between gap-3 py-[3px] text-t-tinta-suave"><dt>{tf('pay.products')}</dt><dd className="font-t-mono tabular whitespace-nowrap">{formatCop(bill.total + (discount?.aplicado || discount?.aplicable ? discount.monto : 0))}</dd></div>
          {(discount?.aplicado || discount?.aplicable) && <div className="flex justify-between gap-3 py-[3px] text-free"><dt>{tf('pay.discount', { pct })}</dt><dd className="font-t-mono tabular whitespace-nowrap">−{formatCop(discount.monto)}</dd></div>}
          <div className="flex justify-between gap-3 py-[3px] text-t-tinta"><dt>{tf('cart.total')}</dt><dd className="font-t-mono tabular whitespace-nowrap">$ {amount}</dd></div>
        </dl>
        {methodsRow}
        {cardForm}
        {hint && <p className="text-[15px] text-t-tinta-suave">{hint}</p>}
        <p className="text-[13px] leading-[1.45] text-t-tinta-suave">{tf('pay.invoiceNote')}</p>
        {hook}
      </div>
      {footer}
    </div>
  )
}
