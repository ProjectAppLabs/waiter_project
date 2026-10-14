'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { primaryCta, secondaryCta, skinOf } from '@/components/templates/families/A/shared'
import { useCartCount } from '@/components/templates/families/A/storeExtras'
import type { PayLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { OrderState, PayMethod } from '@/lib/types'

const STEP_BARS: Record<OrderState, number> = { pendiente_pago: 0, enviado: 1, en_cocina: 2, listo: 2, servido: 3, pagado: 3, fallido: 0 }
// Maqueta de tarjeta: se formatea para verse real; el número nunca sale del componente (no hay pasarela).
const formatCardNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }

// Pago de la familia A · Alta cocina (docs/diseno/plantillas/A*/pago.html). A1 define la base (A2 y A4 la reutilizan con su piel): cabecera
// centrada «TOTAL A PAGAR» en versalitas + monto mono 38, campos de tarjeta de 52 px, nota «Tokenizado por la pasarela…» con check verde y
// CTA «Pagar $ X». A3 y A5 comparten otra estructura (spec.pantallas.pago.layout = "A3" / "A5"; el registro va por familia → se ramifica por
// template.codigo): cabecera a la izquierda «Confirmar y pagar» + «N platos · mesa X», caja resumen Productos / Descuento / Total, campos y
// nota de factura electrónica sin caja. Funcionalidad del genérico que los marcos no dibujan y aquí se conserva: píldoras de método (tarjeta,
// PSE, Nequi, efectivo), gancho de registro, «Volver al pedido», y los estados «Autorizando», «Pagado» (cabecera verde de Waiter) y
// «Rechazada» con sus salidas, todos con la insignia «Demo · sin cobro real». El conteo «N platos» sale del carrito (store).
export function FamilyAPay({ bill, template, methods, onPay, state, demo, goBack, result, order, merchant, table, account, onRetry, onPayAtTable, onSignup, goMenu }: PayLayoutProps) {
  const t = useTranslations('diner.pay')
  const tf = useTranslations('diner.templates.familiaA')
  const ts = useTranslations('diner.status')
  const skin = skinOf(template)
  const confirmStyle = skin.code === 'A3' || skin.code === 'A5'
  const count = useCartCount()
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? 'tarjeta')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const amount = formatCop(bill.total)
  const discount = bill.descuento
  const pct = discount?.porcentaje ?? 0
  const applied = Boolean(discount?.aplicado)
  const field = `h-[52px] w-full rounded-[10px] ${skin.input} border border-t-borde px-3.5 font-t-mono text-[16px] text-t-tinta placeholder:text-t-tinta-terciaria focus:outline-none focus:border-t-acento`
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  // CTA de pago: 60 px en A1–A4 y 64 en A5 (bloque cta de spec.pantallas.pago); el carrito es el que mide 56/60.
  const money = `${primaryCta(skin, 'pay')} w-full`
  const demoBadge = demo && <span className="self-start inline-flex items-center h-7 px-2.5 rounded-t-chip bg-pending-soft text-pending-ink text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>
  const foot = (children: React.ReactNode) => <div className={`sticky bottom-0 px-[18px] py-3.5 border-t border-t-borde ${skin.foot} flex flex-col gap-2.5`}>{children}</div>

  if (state === 'authorizing') {
    return (
      <div className="px-[18px] py-6 flex flex-col items-center gap-4 text-center text-t-tinta" aria-busy="true">
        <div role="status" aria-label={t('authorizing')} className="w-[92px] h-[92px] rounded-full border-[5px] border-t-borde border-t-t-acento animate-spin" />
        <h1 className="t-title text-[22px] leading-tight">{t('authorizing')}</h1>
        <p className="text-base text-t-tinta-suave">{t('authorizingHint')}</p>
        <dl className={`w-full rounded-t-tarjeta ${skin.note} p-4 flex flex-col gap-2 text-left text-[15px]`}>
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
      <div className="flex flex-col text-t-tinta">
        <header className="bg-free text-white px-[18px] pt-[26px] pb-6 flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="w-[62px] h-[62px] rounded-full bg-white/20 grid place-items-center text-[28px] font-bold">✓</span>
          <h1 className="t-title text-[24px] leading-tight">{t('paid')}</h1>
          <span className="font-t-mono tabular text-[26px]">$ {amount}</span>
          {demo && <span className="inline-flex items-center h-7 px-2.5 rounded-t-chip bg-white/20 text-white text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>}
        </header>
        <div className="px-[18px] py-4 flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-t-borde text-[15px]">
            {applied && <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('saved')}</dt><dd className="font-t-mono tabular text-free">$ {formatCop(discount?.monto ?? 0)}</dd></div>}
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('paidWith')}</dt><dd className="font-medium">{t(`method.${result?.metodo ?? method}`)}{result?.referencia ? <span className="font-t-mono tabular text-t-tinta-suave"> · {result.referencia}</span> : null}</dd></div>
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('invoice')}</dt><dd className="text-free font-medium">{t('invoiceSent')}</dd></div>
          </dl>
          <section className={`rounded-t-tarjeta ${skin.note} p-4 flex flex-col gap-3`}>
            <span className="text-[15px] font-medium">{order ? ts(order.estado) : t('orderCard')}</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i <= bars ? 'bg-free' : 'bg-t-borde'}`} />)}</div>
            <span className="text-[13px] text-t-tinta-suave">{t('orderSteps')}</span>
          </section>
          {account && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] text-t-tinta">{t('keepData')}</p>}
        </div>
        {foot(<button type="button" onClick={goMenu} className={secondaryCta(skin, 'pay')}>{t('backToMenu')}</button>)}
      </div>
    )
  }

  if (state === 'declined') {
    const option = 'h-14 px-4 rounded-t-boton border border-t-borde bg-t-superficie text-left text-base font-medium text-t-tinta flex items-center justify-between'
    return (
      <div className="px-[18px] py-5 flex flex-col gap-3.5 text-t-tinta">
        {/* Caja de rechazo con los tokens de ocupado de Waiter (busy / busy-soft / busy-ink): los marcos no fijan estos colores. */}
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
      <div className="px-[18px] py-6 flex flex-col gap-4 text-t-tinta">
        <h1 className="t-title text-[22px] leading-tight">{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('nothing')}</p>
        <button type="button" onClick={goMenu} className={secondaryCta(skin)}>{t('seeMenu')}</button>
        <button type="button" onClick={goBack} className="h-tap-min text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    )
  }

  const [before, after] = t('pay', { amount }).split(amount)
  const pill = (m: PayMethod) => `shrink-0 h-11 px-3.5 rounded-t-chip text-[14px] font-medium ${method === m ? 'bg-t-acento text-t-acento-tinta' : 'bg-t-superficie border border-t-borde text-t-tinta-suave'}`
  const subtotal = bill.total + (applied ? discount?.monto ?? 0 : 0)
  return (
    <div className="flex flex-col text-t-tinta">
      {confirmStyle
        ? (
          <header className="px-[18px] py-4 border-b border-t-borde">
            <h1 className="t-title text-[21px] leading-[1.1]">{tf('pay.confirmTitle')}</h1>
            <p className="mt-[3px] text-[14px] text-t-tinta-suave">{table !== null ? tf('pay.confirmSub', { n: count, table }) : tf('pay.confirmSubNoTable', { n: count })}</p>
          </header>
        )
        : (
          <header className="px-[18px] pt-[26px] pb-5 border-b border-t-borde text-center">
            <p className="text-[13px] tracking-[0.14em] uppercase font-medium text-t-tinta-suave">{tf('pay.totalToPay')}</p>
            <p className="mt-2 font-t-mono tabular text-[38px] leading-none whitespace-nowrap">$ {amount}</p>
            {table !== null && <p className="mt-2 text-[13px] text-t-tinta-terciaria">{t('table', { n: table })}</p>}
          </header>
        )}
      <div className="px-[18px] py-4 flex flex-col gap-3">
        {confirmStyle && (
          <dl className="px-3.5 py-3 rounded-t-tarjeta bg-t-superficie border border-t-borde flex flex-col">
            <div className="flex justify-between gap-3 py-[3px] text-[15px] text-t-tinta-suave"><dt>{tf('pay.products')}</dt><dd className="font-t-mono tabular">{formatCop(subtotal)}</dd></div>
            {applied && <div className="flex justify-between gap-3 py-[3px] text-[15px] text-free"><dt>{tf('pay.discount', { pct })}</dt><dd className="font-t-mono tabular">−{formatCop(discount?.monto ?? 0)}</dd></div>}
            <div className="flex justify-between gap-3 py-[3px] text-[15px] text-t-tinta"><dt>{tf('pay.total')}</dt><dd className="font-t-mono tabular">$ {amount}</dd></div>
          </dl>
        )}
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
          </form>
        )}
        {method === 'pse' && <p className="text-[15px] text-t-tinta-suave">{t('pseHint')}</p>}
        {method === 'nequi' && <p className="text-[15px] text-t-tinta-suave">{t('nequiHint')}</p>}
        {method === 'efectivo' && <p className="text-[15px] text-t-tinta-suave">{t('cashHint')}</p>}
        {confirmStyle
          ? <p className="text-[13px] leading-[1.45] text-t-tinta-suave">{tf('pay.invoiceNote')}</p>
          : (
            <div className={`flex gap-[9px] items-center px-[13px] py-[11px] rounded-[10px] ${skin.note}`}>
              <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-md bg-free text-white grid place-items-center text-[11px] font-bold">✓</span>
              <span className="text-[13px] leading-[1.4] text-t-tinta-suave">{tf('pay.tokenized')}</span>
            </div>
          )}
        {!account && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
          <button type="button" onClick={onSignup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-left text-[14px] font-medium text-t-tinta">{t('signupHook', { pct })}</button>
        )}
        {demoBadge}
      </div>
      {foot(
        <>
          {method === 'efectivo'
            ? <button type="button" onClick={onPayAtTable} className={money}>{t('payAtTable')}</button>
            : <button type="button" onClick={() => onPay(method)} className={money}>{before}<span className="font-t-mono tabular">{amount}</span>{after}</button>}
          <button type="button" onClick={goBack} className="self-center h-tap-min text-[14px] font-medium text-t-tinta-suave">{t('back')}</button>
        </>,
      )}
    </div>
  )
}
