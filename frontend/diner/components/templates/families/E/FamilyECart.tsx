'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Avatar, Chip, TotalRow, useAccount, useDinerLabels } from '@/components/templates/families/E/parts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'
import type { CartLine } from '@/lib/types'

type Variant = 'E1' | 'E2' | 'E3' | 'E4' | 'E5'
const variantOf = (code: string): Variant => (['E2', 'E3', 'E4', 'E5'].includes(code.toUpperCase()) ? (code.toUpperCase() as Variant) : 'E1')

// Carrito de la familia E (docs/diseno/plantillas/E*/carrito.html). Base E1 (E4 la reutiliza en claro): «Tu pedido» + «N ítems»
// (la ronda no existe en la sesión), líneas con avatar de 34 px con las iniciales de quien la pidió (yo / C1, C2… por id real de
// comensal), nombre 15 e importe mono; totales sobre superficie con la línea de descuento en verde; en E1 el chip «−5% aplicado»
// junto al total (descuento5: chip), en E4 la línea (linea). Variantes por código: E2 cabecera centrada en la voz serif, líneas con
// guía de puntos y nota «cantidad · nota», total en serif sobre línea punteada; E3 banda dorada «5% · Primera compra: descuento
// aplicado.» (banner), líneas numeradas en mono en el acento, CTA de 60 px y radio 8; E5 chips de 26 px bajo cada línea
// («2 unidades», «IVA incluido») y la nota verde «Incluye tu 5% de primera compra» bajo el CTA (usado). Ningún marco dibuja stepper
// ni «Quitar»: tocar una línea mía abre los controles (− cantidad ＋, Quitar). «Enviar a cocina» es la acción principal y «Pagar lo
// mío» (E1/E4) o «Ir a pagar» (E2/E3/E5) la secundaria; cierra «o pagar en la mesa con el mesero». La propina (10 % / selector) y la
// fila «Para la mesa» no existen en el carrito del servidor y no se pintan.
export function FamilyECart({ cart, template, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const tc = useTranslations('diner.templates.familiaE.cart')
  const variant = variantOf(template.codigo)
  const account = useAccount()
  const { of } = useDinerLabels(cart, account)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const step = (line: CartLine, delta: number) => { const qty = line.cantidad + delta; if (qty < 1) remove(line.id); else setQty(line.id, qty) }
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }
  const pct = discount?.porcentaje ?? 0
  const count = itemCount(cart)
  const tall = variant === 'E3' || variant === 'E5'
  const primary = `w-full ${tall ? 'h-[60px] text-[17px]' : 'h-[56px] text-[16px]'} rounded-t-boton bg-t-acento text-t-acento-tinta font-bold tracking-[-0.02em] disabled:opacity-60`
  const secondary = 'w-full h-[52px] rounded-t-boton border border-t-borde bg-t-fondo text-[15px] font-medium text-t-tinta disabled:opacity-60'
  const head = (
    <header className={`px-[18px] py-4 border-b border-t-borde flex ${variant === 'E2' ? 'flex-col items-center justify-center gap-1 text-center' : 'items-center gap-3'}`}>
      {variant !== 'E2' && <Link href={hrefs.home} aria-label={t('common.back')} className="shrink-0 w-[44px] h-[44px] -ml-2 grid place-items-center text-[18px] text-t-tinta-suave">←</Link>}
      <h1 className={`t-title leading-[1.15] ${variant === 'E2' ? 'text-[22px]' : 'text-[19px] flex-1'}`}>{t('cart.title')}</h1>
      {count > 0 && <span className="text-[14px] text-t-tinta-suave">{tc('items', { n: count })}</span>}
      {variant === 'E2' && <Link href={hrefs.home} className="inline-flex items-center h-[44px] text-[14px] text-t-tinta-suave">← {t('common.back')}</Link>}
    </header>
  )

  if (!cart) {
    return (
      <div className="flex flex-col text-t-tinta">
        {head}
        <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-t-tinta-suave">{error ? t('cart.loadFailed') : t('common.loading')}</p>
          {error && <button type="button" onClick={retry} className={primary}>{t('common.retry')}</button>}
        </section>
      </div>
    )
  }
  if (cart.lineas.length === 0) {
    return (
      <div className="flex flex-col text-t-tinta">
        {head}
        <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center">
          <p className="text-base text-t-tinta-suave">{t('cart.empty')}</p>
          <button type="button" onClick={goMenu} className={primary}>{t('cart.goMenu')}</button>
        </section>
      </div>
    )
  }

  const own = mine(cart)
  const theirs = others(cart)
  const amount = formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))
  const [before, after] = t('cart.confirm', { amount }).split(amount)
  const subtotal = cart.total
  const showBanner = variant === 'E3' && discount && (discount.porcentaje > 0 && (discount.aplicado || discount.aplicable || !discount.registrado))
  const line = (l: CartLine, index: number) => {
    const open = l.mio && editing === l.id
    const note = l.nota ? tc('lineNote', { qty: l.cantidad, note: l.nota }) : tc('lineQty', { qty: l.cantidad })
    const who = variant === 'E1' || variant === 'E4' ? of(l) : null
    const body = variant === 'E2'
      ? (
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="flex items-baseline gap-2">
            <span className="t-title text-[20px] leading-[1.1]">{l.nombre}</span>
            <span aria-hidden="true" className="flex-1 border-b border-dotted border-t-borde" />
            <span className="font-t-mono tabular text-[15px] whitespace-nowrap">{formatCop(l.subtotal)}</span>
          </span>
          <span className="text-[13px] text-t-tinta-suave mt-1">{note}</span>
        </span>
      )
      : (
        <>
          {who && <Avatar label={who.label} name={who.name} color={who.color} />}
          {variant === 'E3' && <span aria-hidden="true" className="w-[34px] shrink-0 font-t-mono tabular text-[19px] leading-none text-t-acento">{index + 1}</span>}
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="flex justify-between gap-2.5">
              <span className={variant === 'E3' ? 'text-[16px] font-bold tracking-[-0.02em] leading-[1.15]' : variant === 'E5' ? 'text-[16px] font-medium leading-snug' : 'text-[15px] leading-snug'}>{l.nombre}</span>
              <span className={`font-t-mono tabular whitespace-nowrap ${variant === 'E3' ? 'text-[17px]' : 'text-[15px]'}`}>{formatCop(l.subtotal)}</span>
            </span>
            {variant === 'E5'
              ? <span className="flex flex-wrap gap-1.5 mt-[7px]"><Chip>{note}</Chip><Chip>{tc('taxes')}</Chip></span>
              : <span className="text-[13px] text-t-tinta-suave mt-0.5">{note}</span>}
          </span>
        </>
      )
    const pad = variant === 'E1' || variant === 'E4' ? 'py-2.5' : variant === 'E5' ? 'py-3' : 'py-[15px]'
    return (
      <li key={l.id} className={`px-[18px] border-b border-t-borde flex flex-col ${pad} ${!l.mio && (variant === 'E1' || variant === 'E4') ? 'bg-t-superficie' : ''}`}>
        {l.mio
          ? <button type="button" aria-expanded={open} aria-label={tc('editLine', { name: l.nombre })} onClick={() => setEditing((e) => (e === l.id ? null : l.id))} className="w-full text-left flex gap-[11px] items-center min-h-[44px]">{body}</button>
          : <div className="flex gap-[11px] items-center min-h-[44px]">{body}</div>}
        {open && (
          <div className="flex items-center gap-2 mt-2">
            <div role="group" aria-label={l.nombre} className="inline-flex items-center rounded-[9px] border border-t-borde overflow-hidden">
              <button type="button" aria-label={t('dish.fewer')} disabled={busy} onClick={() => step(l, -1)} className="w-[44px] h-[44px] text-[17px] leading-none text-t-tinta-suave disabled:opacity-50">−</button>
              <span className="w-8 text-center font-t-mono tabular text-[15px]">{l.cantidad}</span>
              <button type="button" aria-label={t('dish.more')} disabled={busy} onClick={() => step(l, 1)} className="w-[44px] h-[44px] text-[17px] leading-none text-t-tinta-suave border-l border-t-borde disabled:opacity-50">＋</button>
            </div>
            <button type="button" aria-label={`${t('cart.remove')}: ${l.nombre}`} disabled={busy} onClick={() => remove(l.id)} className={`h-[44px] px-2 text-[14px] disabled:opacity-50 ${template.tokens.modo === 'oscuro' ? 'text-t-tinta-suave underline underline-offset-4' : 'text-busy-ink'}`}>{t('cart.remove')}</button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="flex flex-col text-t-tinta">
      {head}
      {showBanner && ((discount.aplicado || discount.aplicable)
        ? <div className="px-[18px] py-[13px] bg-t-acento-suave border-b border-t-borde flex items-center gap-2.5"><span className="text-[22px] font-bold tracking-[-0.02em] text-[#E4B879]">{pct}%</span><span className="text-[14px] leading-[1.35] text-[#E4B879]">{tc('discountBanner')}</span></div>
        : <Link href={hrefs.signup} className="px-[18px] py-[13px] bg-t-acento-suave border-b border-t-borde flex items-center gap-2.5"><span className="text-[22px] font-bold tracking-[-0.02em] text-[#E4B879]">{pct}%</span><span className="text-[14px] leading-[1.35] text-[#E4B879]">{tc('discountBannerPending', { pct })}</span></Link>)}
      <ul className="flex flex-col">{own.map(line)}</ul>
      {own.length === 0 && <p className="px-[18px] py-4 text-[15px] text-t-tinta-suave">{t('cart.empty')}</p>}
      {theirs.length > 0 && (
        <section>
          <h2 className="px-[18px] pt-4 pb-1 text-[13px] font-medium tracking-[0.04em] text-t-tinta-suave">{tc('others')}</h2>
          <ul className="flex flex-col">{theirs.map((l, i) => line(l, own.length + i))}</ul>
        </section>
      )}
      <Link href={hrefs.menu} className="self-start mx-[18px] inline-flex items-center h-[44px] text-[15px] font-medium text-t-acento">{t('cart.addMore')}</Link>
      {variant !== 'E3' && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
        <Link href={hrefs.signup} className="mx-[18px] mb-3 px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>
      )}
      <dl className="px-[18px] py-4 border-t border-t-borde bg-t-superficie flex flex-col">
        {theirs.length > 0 && <TotalRow label={tc('mine')} value={formatCop(cart.mio)} />}
        <TotalRow label={tc('subtotal')} value={formatCop(subtotal)} />
        {discount && (discount.aplicado || discount.aplicable) && <TotalRow label={t('cart.discountLine', { pct })} value={`−${formatCop(discount.monto)}`} className="text-free" />}
        <div className={`flex justify-between items-baseline gap-2.5 pt-2.5 mt-2 border-t border-t-borde ${variant === 'E2' ? 'border-dotted' : ''}`}>
          <dt className={variant === 'E2' ? 't-title text-[21px] leading-[1.1]' : 'text-[18px] font-bold tracking-[-0.02em] leading-[1.15]'}>{theirs.length > 0 ? tc('totalTable') : tc('total')}</dt>
          <dd className="flex items-center gap-2">
            {variant === 'E1' && discount && (discount.aplicado || discount.aplicable) && <span className="inline-flex items-center h-[26px] px-[9px] rounded-[7px] bg-free/[0.22] text-[#A9E0C0] text-[13px] font-medium">{tc('discountChip', { pct })}</span>}
            <span className="font-t-mono tabular text-[25px] whitespace-nowrap">$ {amount}</span>
          </dd>
        </div>
      </dl>
      <div className="sticky bottom-0 px-[18px] py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-2.5">
        <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className={primary}>
          {sending ? t('cart.confirming') : <>{before}<span className="font-t-mono tabular">{amount}</span>{after}</>}
        </button>
        <button type="button" disabled={busy || sending} onClick={goPay} className={secondary}>{variant === 'E1' || variant === 'E4' ? tc('payMine') : t('cart.goPay')}</button>
        {variant === 'E5' && discount && (discount.aplicado || discount.aplicable) && <p className="text-center text-[13px] text-free">{tc('discountIncluded', { pct })}</p>}
        <Link href={hrefs.table} className="self-center inline-flex items-center h-[44px] text-[14px] text-t-tinta-suave">{t('cart.payAtTable')}</Link>
      </div>
    </div>
  )
}
