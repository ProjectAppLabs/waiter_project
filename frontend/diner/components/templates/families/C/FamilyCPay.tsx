'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { familyCCode, isDarkC, money } from '@/components/templates/families/C/parts'
import type { PayLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { OrderState, PayMethod } from '@/lib/types'

// Pago de la familia C (docs/diseno/plantillas/C*/pago.html). Base (C1, C2, C4, C5): banda superior de acento con «Total» y la
// cifra en mono 28; los métodos como filas de 62 px (la elegida con borde 2 px de acento y peso 500); CTA «PAGAR $ {total}» de 64 px
// radio 8. C3 difiere (spec.pantallas.pago.layout = "C3"): sin banda ni filas; chips redondos de método arriba (activo en acento)
// y debajo el formulario de tarjeta. El registro solo admite claves por familia: se ramifica aquí por código. Se conserva lo del
// genérico: formulario de tarjeta maquetado (el número nunca sale del componente), interruptor «Guardar», aviso de tokenización,
// invitación al 5 % sin cuenta, insignia «Demo · sin cobro real», efectivo → el mesero cobra en la mesa, y los estados
// authorizing / paid / declined en la piel de la familia (C1 y C4 en Bebas Neue, C2 y C5 en Ubuntu 700 por los tokens).
const STEP_BARS: Record<OrderState, number> = { pendiente_pago: 0, enviado: 1, en_cocina: 2, listo: 2, servido: 3, pagado: 3, fallido: 0 }
const formatCardNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }

export function FamilyCPay({ bill, template, methods, onPay, state, demo, goBack, result, order, merchant, table, account, onRetry, onPayAtTable, onSignup, goMenu }: PayLayoutProps) {
  const t = useTranslations('diner.pay')
  const ts = useTranslations('diner.status')
  const tc = useTranslations('diner.templates.familiaC.pay')
  const code = familyCCode(template.codigo)
  const dark = isDarkC(code)
  const [method, setMethod] = useState<PayMethod>(methods[0] ?? 'tarjeta')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [save, setSave] = useState(true)
  const amount = formatCop(bill.total)
  const discount = bill.descuento
  const pct = discount?.porcentaje ?? 0
  const border = code === 'C4' ? 'border-t-tinta/28' : 'border-t-borde'
  const shell = `flex flex-col text-t-tinta border-b ${border}`
  const ctaText = dark ? 't-title text-[24px] leading-none' : 'text-[17px] font-bold tracking-[-0.02em]'
  // CTA del marco: 64 px radio 8 (C1, C3, C4, C5); C2 lo dibuja de 60 px con el radio de botón de la plantilla.
  const cta = `w-full ${code === 'C2' ? 'h-[60px] rounded-t-boton' : 'h-16 rounded-[8px]'} bg-t-acento text-t-acento-tinta ${ctaText} disabled:opacity-60`
  const secondary = `h-14 rounded-t-boton bg-t-superficie border ${border} text-[16px] font-medium text-t-tinta`
  const foot = `sticky bottom-0 px-[18px] py-3.5 border-t ${border} bg-t-superficie flex flex-col gap-2.5`
  const field = `h-[52px] w-full rounded-[10px] bg-t-fondo border ${border} px-3.5 font-t-mono text-[16px] text-t-tinta placeholder:text-t-tinta-terciaria focus:outline-none focus:border-t-acento`
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const demoBadge = demo && <span className="self-start inline-flex items-center h-7 px-2.5 rounded-t-chip bg-pending-soft text-pending-ink text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>
  const [before, after] = t('pay', { amount }).split(amount)
  const payLabel = <>{before}<span className="font-t-mono tabular normal-case tracking-normal">{amount}</span>{after}</>

  if (state === 'authorizing') {
    return (
      <div className={`${shell} px-[18px] py-6 items-center text-center gap-4`} aria-busy="true">
        <div role="status" aria-label={t('authorizing')} className="w-[92px] h-[92px] rounded-full border-[5px] border-t-borde border-t-t-acento animate-spin" />
        <h1 className={`t-title ${dark ? 'text-[28px]' : 'text-[22px]'} leading-tight`}>{t('authorizing')}</h1>
        <p className="text-base text-t-tinta-suave">{t('authorizingHint')}</p>
        <dl className={`w-full rounded-t-tarjeta bg-t-superficie border ${border} p-4 flex flex-col gap-2 text-left text-[15px]`}>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('merchant')}</dt><dd className="font-medium">{merchant}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('reference')}</dt><dd className="font-t-mono tabular">{table !== null ? `#${table}` : '—'}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('amount')}</dt><dd className="font-t-mono tabular">{money(bill.total)}</dd></div>
        </dl>
        {demoBadge}
        <p className="text-[14px] text-t-tinta-suave">{t('authorizingFoot')}</p>
      </div>
    )
  }

  if (state === 'paid') {
    const bars = order ? STEP_BARS[order.estado] : 1
    return (
      <div className={shell}>
        <header className="bg-free text-white px-[18px] py-6 flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="w-[62px] h-[62px] rounded-full bg-white/20 grid place-items-center text-[28px] font-bold">✓</span>
          <h1 className={`t-title ${dark ? 'text-[30px]' : 'text-[24px]'} leading-tight`}>{t('paid')}</h1>
          <span className="font-t-mono tabular text-[26px]">{money(bill.total)}</span>
          {demo && <span className="inline-flex items-center h-7 px-2.5 rounded-t-chip bg-white/20 text-white text-[12px] font-medium tracking-[0.04em]">{t('demo')}</span>}
        </header>
        <div className="px-[18px] py-4 flex flex-col gap-4">
          <dl className={`flex flex-col divide-y ${code === 'C4' ? 'divide-t-tinta/28' : 'divide-t-borde'} text-[15px]`}>
            {discount && (discount.aplicado || discount.aplicable) && <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('saved')}</dt><dd className="font-t-mono tabular text-free">{money(discount.monto)}</dd></div>}
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('paidWith')}</dt><dd className="font-medium">{t(`method.${result?.metodo ?? method}`)}{result?.referencia ? <span className="font-t-mono tabular text-t-tinta-suave"> · {result.referencia}</span> : null}</dd></div>
            <div className="py-2.5 flex justify-between gap-3"><dt className="text-t-tinta-suave">{t('invoice')}</dt><dd className="text-free font-medium">{t('invoiceSent')}</dd></div>
          </dl>
          <section className={`rounded-t-tarjeta bg-t-superficie border ${border} p-4 flex flex-col gap-3`}>
            <span className="text-[15px] font-medium">{order ? ts(order.estado) : t('orderCard')}</span>
            <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 rounded-full ${i <= bars ? 'bg-free' : 'bg-t-borde'}`} />)}</div>
            <span className="text-[13px] text-t-tinta-suave">{t('orderSteps')}</span>
          </section>
          {account && <p className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] text-t-tinta">{t('keepData')}</p>}
          <div className="flex gap-2.5">
            <button type="button" onClick={goMenu} className={`${secondary} flex-1`}>{t('backToMenu')}</button>
            <button type="button" disabled className="h-14 flex-1 rounded-t-boton bg-dark text-dark-ink text-[16px] font-medium disabled:opacity-50">{t('rate')}</button>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'declined') {
    const option = `h-14 px-4 rounded-t-boton border ${border} bg-t-superficie text-left text-[16px] font-medium text-t-tinta flex items-center justify-between`
    return (
      <div className={`${shell} px-[18px] py-4 gap-3.5`}>
        {/* La caja lleva su propio fondo (rojo suave fijo de Waiter): se lee igual sobre las pieles oscuras y las claras. */}
        <div role="alert" className="rounded-t-tarjeta bg-busy-soft border border-busy/25 p-4 flex gap-3">
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
      <div className={`${shell} px-[18px] py-4 gap-4`}>
        <h1 className={`t-title ${dark ? 'text-[30px]' : 'text-[24px]'} leading-tight`}>{t('title')}</h1>
        <p className="text-base text-t-tinta-suave">{t('nothing')}</p>
        <button type="button" onClick={goMenu} className={secondary}>{t('seeMenu')}</button>
        <button type="button" onClick={goBack} className="h-11 text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    )
  }

  const cardForm = method === 'tarjeta' && (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} autoComplete="off">
      <label className="flex flex-col gap-1.5">
        <span className={label}>{t('cardNumber')}</span>
        <input inputMode="numeric" autoComplete="off" placeholder="4242 4242 4242 4242" value={number} onChange={(e) => setNumber(formatCardNumber(e.target.value))} className={field} />
        <span className="text-[12px] text-t-tinta-terciaria">{t('cardHint')}</span>
      </label>
      <div className="flex gap-2.5">
        <label className="flex-1 flex flex-col gap-1.5"><span className={label}>{t('expires')}</span><input inputMode="numeric" autoComplete="off" placeholder="08/29" value={expiry} onChange={(e) => setExpiry(formatExpiry(e.target.value))} className={field} /></label>
        <label className="flex-1 flex flex-col gap-1.5"><span className={label}>{t('cvv')}</span><input type="password" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="•••" value={cvv} onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))} className={field} /></label>
      </div>
      <label className="flex items-center gap-[11px] h-11">
        <button type="button" role="switch" aria-checked={save} onClick={() => setSave((s) => !s)} className={`w-12 h-7 shrink-0 rounded-full p-[3px] flex ${save ? 'bg-t-acento justify-end' : 'bg-t-borde justify-start'}`}><span aria-hidden="true" className="w-[22px] h-[22px] rounded-full bg-white" /></button>
        <span className="text-[14px] text-t-tinta-suave">{t('saveCard')}</span>
      </label>
    </form>
  )
  const hints = (
    <>
      {method === 'pse' && <p className="text-[15px] text-t-tinta-suave">{t('pseHint')}</p>}
      {method === 'nequi' && <p className="text-[15px] text-t-tinta-suave">{t('nequiHint')}</p>}
      {method === 'efectivo' && <p className="text-[15px] text-t-tinta-suave">{t('cashHint')}</p>}
      <div className="flex gap-[9px] items-center px-[13px] py-[11px] rounded-[10px] bg-t-superficie border border-t-borde">
        <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-md bg-free text-white grid place-items-center text-[11px] font-bold">✓</span>
        <span className="text-[13px] leading-snug text-t-tinta-suave">{tc('tokenized')}</span>
      </div>
      {!account && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
        <button type="button" onClick={onSignup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-left text-[14px] font-medium text-t-tinta">{t('signupHook', { pct })}</button>
      )}
      {demoBadge}
    </>
  )
  const footer = (
    <div className={foot}>
      {method === 'efectivo'
        ? <button type="button" onClick={onPayAtTable} className={cta}>{t('payAtTable')}</button>
        : <button type="button" onClick={() => onPay(method)} className={cta}>{payLabel}</button>}
      <button type="button" onClick={goBack} className="h-11 text-[15px] font-medium text-t-acento">{t('back')}</button>
    </div>
  )

  if (code === 'C3') {
    const chip = (m: PayMethod) => `shrink-0 h-[42px] px-[13px] rounded-t-chip text-[14px] ${method === m ? 'bg-t-acento text-t-acento-tinta font-medium' : 'border border-t-borde text-t-tinta-suave'}`
    // El marco C3 empieza directamente en los chips de método: el total solo va en el CTA. El título queda para el lector de pantalla.
    return (
      <div className={shell}>
        <h1 className="sr-only">{t('title')} · {money(bill.total)}</h1>
        <div role="radiogroup" aria-label={t('methods')} className="px-[18px] py-2.5 border-b border-t-borde flex gap-[7px] overflow-x-auto [scrollbar-width:none]">
          {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={chip(m)}>{t(`method.${m}`)}</button>)}
        </div>
        <div className="px-[18px] py-3.5 flex flex-col gap-3">
          {cardForm}
          {hints}
        </div>
        {footer}
      </div>
    )
  }

  const row = (m: PayMethod) => `h-[62px] px-4 rounded-t-boton flex items-center justify-between text-[16px] text-left ${method === m ? 'border-2 border-t-acento font-medium text-t-tinta' : `border ${border} text-t-tinta-suave`}`
  return (
    <div className={shell}>
      <div className="px-[18px] py-5 bg-t-acento text-t-acento-tinta flex items-baseline justify-between gap-3">
        <h1 className={dark ? 't-title text-[24px] leading-none' : 'text-[17px] font-bold tracking-[-0.02em] leading-[1.15]'}>{tc('total')}{table !== null && <span className="sr-only"> · {t('table', { n: table })}</span>}</h1>
        <span className="font-t-mono tabular text-[28px] whitespace-nowrap">{money(bill.total)}</span>
      </div>
      <div role="radiogroup" aria-label={t('methods')} className="px-[18px] py-4 flex flex-col gap-2.5">
        {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={row(m)}><span>{tc(m)}</span>{method === m && <span aria-hidden="true" className="w-[22px] h-[22px] rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[12px] font-bold">✓</span>}</button>)}
      </div>
      <div className="px-[18px] pb-3.5 flex flex-col gap-3">
        {cardForm}
        {hints}
      </div>
      {footer}
    </div>
  )
}
