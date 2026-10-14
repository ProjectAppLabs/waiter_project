'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { DemoBadge, PayStates, TotalRow } from '@/components/templates/families/E/parts'
import type { PayLayoutProps } from '@/components/templates/types'
import { formatCop } from '@/lib/domain/cart'
import type { PayMethod } from '@/lib/types'

type Variant = 'E1' | 'E2' | 'E3' | 'E4' | 'E5'
type Split = 'mine' | 'parts' | 'all'
const variantOf = (code: string): Variant => (['E2', 'E3', 'E4', 'E5'].includes(code.toUpperCase()) ? (code.toUpperCase() as Variant) : 'E1')
// Maqueta de tarjeta: se formatea para verse real, pero el número nunca sale del componente (no hay pasarela todavía).
const formatCardNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()
const formatExpiry = (raw: string) => { const d = raw.replace(/\D/g, '').slice(0, 4); return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }
const LONG: Record<PayMethod, 'methodTarjeta' | 'methodPse' | 'methodNequi' | 'methodEfectivo'> = { tarjeta: 'methodTarjeta', pse: 'methodPse', nequi: 'methodNequi', efectivo: 'methodEfectivo' }

// Pago de la familia E (docs/diseno/plantillas/E*/pago.html). Base E1 (E4 la reutiliza en claro): «¿Cómo dividen?» con el total mono
// 19, tres opciones de división como tarjetas de borde (Pagar lo mío = bill.mio, Dividir en N = bill.porParte, Pagar todo = bill.total:
// datos reales; la activa con borde 2 px en acento sobre superficie / acento suave), el método elegido como tarjeta con insignia y check
// (no hay tarjetas guardadas: se listan los métodos reales) y CTA «Pagar $ parte». Variantes: E2 «Pagar» en la voz serif + mono 22,
// el método activo resaltado y «Usar otra forma de pago →» que despliega el resto, nota «Tokenizado por la pasarela» con check verde
// (solo en E2: los demás marcos no la tienen); E3 cabecera en acento «Total» + monto 28, métodos como filas de 62 px con nombre largo,
// CTA de 64 px y radio 8; E5 «Confirmar y pagar» + mesa, caja resumen (Productos / Descuento / Total), formulario de tarjeta en mono
// (el único marco de la familia con formulario; sin píldoras de método: paga con tarjeta), nota de factura y CTA de 64 px. La
// propina al barista (E2), la tarjeta «•••• 4242» y la línea de mesa fuera de E5 no están en los marcos y no se pintan. Estados
// authorizing / paid / declined y la insignia «Demo · sin cobro real» son comunes (parts.PayStates). onPay solo lleva el método
// (contrato 4).
export function FamilyEPay({ bill, template, methods, onPay, state, demo, goBack, result, order, merchant, table, account, onRetry, onPayAtTable, onSignup, goMenu }: PayLayoutProps) {
  const t = useTranslations('diner.pay')
  const tp = useTranslations('diner.templates.familiaE.pay')
  const variant = variantOf(template.codigo)
  const [chosen, setMethod] = useState<PayMethod>(methods[0] ?? 'tarjeta')
  // E5 no elige método (sin píldoras en el marco): paga con tarjeta, la del formulario.
  const method: PayMethod = variant === 'E5' ? (methods.includes('tarjeta') ? 'tarjeta' : methods[0] ?? 'tarjeta') : chosen
  const [more, setMore] = useState(false)
  const [split, setSplit] = useState<Split>('all')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const discount = bill.descuento
  const pct = discount?.porcentaje ?? 0
  const total = formatCop(bill.total)
  const tall = variant === 'E3' || variant === 'E5'
  const money = `w-full ${tall ? 'h-[64px] text-[17px]' : 'h-[60px] text-[16px]'} rounded-t-boton bg-t-acento text-t-acento-tinta font-bold tracking-[-0.02em] disabled:opacity-60`
  const field = 'h-[52px] w-full rounded-[10px] bg-t-superficie border border-t-borde px-3.5 font-t-mono text-[16px] text-t-tinta placeholder:text-t-tinta-terciaria focus:outline-none focus:border-t-acento'
  const label = 'text-[14px] font-medium text-t-tinta-suave'
  const activeBg = variant === 'E4' ? 'bg-t-acento-suave' : 'bg-t-superficie'
  const card = (active: boolean) => `w-full min-h-[56px] px-3.5 py-3 rounded-t-boton text-left text-[15px] flex items-center justify-between gap-3 ${active ? `border-2 border-t-acento ${activeBg} text-t-tinta font-medium` : 'border border-t-borde text-t-tinta-suave'}`
  const check = <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[12px] font-bold">✓</span>
  const badge = (m: PayMethod) => <span aria-hidden="true" className="shrink-0 inline-flex items-center h-[24px] px-[7px] rounded-[5px] bg-t-tinta text-t-fondo text-[10px] font-bold uppercase tracking-[0.04em]">{t(`method.${m}`)}</span>

  const states = <PayStates state={state} total={bill.total} discount={discount} result={result} order={order} merchant={merchant} table={table} account={account} method={method} onRetry={(m) => { setMethod(m); onRetry() }} onPayAtTable={onPayAtTable} goMenu={goMenu} goBack={goBack} />
  if (state !== 'idle' || bill.total <= 0) return states

  // E1/E4: el monto del CTA es la parte elegida (dato real del servidor); onPay solo lleva el método.
  const splitAmount = variant === 'E1' || variant === 'E4' ? (split === 'mine' ? bill.mio : split === 'parts' ? bill.porParte : bill.total) : bill.total
  const amount = formatCop(splitAmount)
  const [before, after] = t('pay', { amount }).split(amount)
  const cardForm = variant === 'E5' && method === 'tarjeta' && (
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
    </form>
  )
  const hints = (
    <>
      {method === 'pse' && <p className="text-[15px] text-t-tinta-suave">{t('pseHint')}</p>}
      {method === 'nequi' && <p className="text-[15px] text-t-tinta-suave">{t('nequiHint')}</p>}
      {method === 'efectivo' && <p className="text-[15px] text-t-tinta-suave">{t('cashHint')}</p>}
    </>
  )
  // Nota de seguridad con check verde (marco E2) y nota de factura (marco E5); los demás marcos no llevan nota.
  const note = variant === 'E2'
    ? (
      <div className="flex gap-[9px] items-center px-[13px] py-[11px] rounded-[10px] bg-t-superficie">
        <span aria-hidden="true" className="w-[22px] h-[22px] shrink-0 rounded-md bg-free text-white grid place-items-center text-[11px] font-bold">✓</span>
        <span className="text-[13px] leading-[1.4] text-t-tinta-suave">{tp('tokenizedShort')}</span>
      </div>
    )
    : variant === 'E5' ? <p className="text-[13px] leading-[1.45] text-t-tinta-suave">{tp('invoiceNote')}</p> : null
  const hook = !account && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
    <button type="button" onClick={onSignup} className="px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-left text-[14px] font-medium text-t-tinta">{t('signupHook', { pct })}</button>
  )
  const back = <button type="button" onClick={goBack} aria-label={t('back')} className="shrink-0 w-[44px] h-[44px] -ml-2 grid place-items-center text-[18px] text-t-tinta-suave">←</button>
  const header = variant === 'E3'
    ? (
      <header className="px-[18px] py-5 bg-t-acento text-t-acento-tinta flex items-center gap-3">
        <button type="button" onClick={goBack} aria-label={t('back')} className="shrink-0 w-[44px] h-[44px] -ml-2 grid place-items-center text-[18px]">←</button>
        <h1 className="t-title text-[17px] leading-[1.15] flex-1">{tp('total')}</h1>
        <span className="font-t-mono tabular text-[28px] whitespace-nowrap">$ {total}</span>
      </header>
    )
    : variant === 'E5'
      ? (
        <header className="px-[18px] py-4 border-b border-t-borde flex items-center gap-3">
          {back}
          <div className="flex-1 min-w-0">
            <h1 className="t-title text-[18px] leading-[1.15]">{tp('confirm')}</h1>
            {table !== null && <p className="text-[14px] text-t-tinta-suave mt-0.5">{t('table', { n: table })}</p>}
          </div>
        </header>
      )
      : (
        <header className="px-[18px] py-[18px] border-b border-t-borde flex items-center gap-3">
          {back}
          <h1 className={`t-title leading-[1.15] flex-1 ${variant === 'E2' ? 'text-[21px]' : 'text-[18px]'}`}>{variant === 'E2' ? t('title') : tp('split')}</h1>
          <span className={`font-t-mono tabular whitespace-nowrap ${variant === 'E2' ? 'text-[22px]' : 'text-[19px]'}`}>$ {total}</span>
        </header>
      )
  const splitBlock = (variant === 'E1' || variant === 'E4') && (
    <div role="radiogroup" aria-label={tp('splitOptions')} className="flex flex-col gap-2.5">
      {([['mine', tp('splitMine'), bill.mio], ['parts', tp('splitParts', { n: bill.partes }), bill.porParte], ['all', tp('splitAll'), bill.total]] as [Split, string, number][])
        .filter(([k]) => k !== 'parts' || bill.partes > 1)
        .map(([k, name, value]) => <button key={k} type="button" role="radio" aria-checked={split === k} onClick={() => setSplit(k)} className={card(split === k)}><span>{name}</span><span className="font-t-mono tabular text-[15px] text-t-tinta">{formatCop(value)}</span></button>)}
    </div>
  )
  const methodsBlock = variant === 'E3'
    ? (
      <div role="radiogroup" aria-label={t('methods')} className="flex flex-col gap-2.5">
        {methods.map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={`h-[62px] px-4 rounded-t-tarjeta text-left text-[16px] flex items-center ${method === m ? 'border-2 border-t-acento font-medium text-t-tinta' : 'border border-t-borde text-t-tinta-suave'}`}>{tp(LONG[m])}</button>)}
      </div>
    )
    : variant === 'E5'
      ? null
      : (
        <div role="radiogroup" aria-label={t('methods')} className="flex flex-col gap-2.5">
          {methods.filter((m) => more || m === method).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { setMethod(m); setMore(false) }} className={card(method === m)}>
              <span className="flex items-center gap-[11px] min-w-0">{badge(m)}<span className="truncate">{tp(LONG[m])}</span></span>
              {method === m && check}
            </button>
          ))}
          {!more && <button type="button" aria-expanded={more} onClick={() => setMore(true)} className="w-full min-h-[52px] px-3.5 rounded-t-boton border border-t-borde text-left text-[15px] text-t-tinta-suave flex items-center justify-between"><span>{tp('otherMethod')}</span><span aria-hidden="true">→</span></button>}
        </div>
      )
  const summary = variant === 'E5' && (
    <dl className="px-3.5 py-[13px] rounded-t-tarjeta bg-t-superficie border border-t-borde flex flex-col">
      <TotalRow label={tp('products')} value={formatCop(bill.total + (discount?.aplicado || discount?.aplicable ? discount.monto : 0))} />
      {discount && (discount.aplicado || discount.aplicable) && <TotalRow label={t('saved')} value={`−${formatCop(discount.monto)}`} className="text-free" />}
      <TotalRow label={tp('total')} value={total} className="text-t-tinta font-medium" />
    </dl>
  )

  return (
    <div className="flex flex-col text-t-tinta">
      {header}
      <div className="px-[18px] pt-4 pb-4 flex flex-col gap-3">
        {summary}
        {splitBlock}
        {methodsBlock}
        {cardForm}
        {hints}
        {note}
        {hook}
        {demo && <DemoBadge />}
      </div>
      <div className="sticky bottom-0 px-[18px] py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-2.5">
        {method === 'efectivo'
          ? <button type="button" onClick={onPayAtTable} className={money}>{t('payAtTable')}</button>
          : <button type="button" onClick={() => onPay(method, variant === 'E1' || variant === 'E4' ? split : 'all')} className={money}>{before}<span className="font-t-mono tabular">{amount}</span>{after}</button>}
        <button type="button" onClick={goBack} className="self-center h-[44px] text-[15px] font-medium text-t-acento">{t('back')}</button>
      </div>
    </div>
  )
}
