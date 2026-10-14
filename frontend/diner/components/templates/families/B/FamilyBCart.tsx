'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { BAND_FIGURE, BAND_TEXT, usePhotoIndex } from '@/components/templates/families/B/parts'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount, mine, others } from '@/lib/domain/cart'
import { useDinerStore } from '@/lib/stores/dinerStore'
import type { CartLine } from '@/lib/types'

type Variant = 'B1' | 'B2' | 'B3' | 'B4' | 'B5'
const variantOf = (code: string): Variant => (['B2', 'B3', 'B4', 'B5'].includes(code.toUpperCase()) ? (code.toUpperCase() as Variant) : 'B1')
// Colores fijos del marco B3 para los avatares de los comensales (el primero es el acento: «Yo»); los otros dos son tokens de Waiter.
const AVATAR = ['bg-t-acento text-t-acento-tinta', 'bg-kitchen text-white', 'bg-free text-white']

// Carrito de la familia B (docs/diseno/plantillas/B*/carrito.html). Base B1: «Tu pedido · N ítems», filas con miniatura de 54 px,
// nombre, importe, «cantidad · nota», stepper − 1 ＋ y «Quitar»; totales sobre superficie con la línea de descuento en verde; CTA.
// Variantes por código: B2 banda «5% · Primera compra» (descuento5: banner), B3 avatar del comensal por línea y chip «−5% aplicado»
// junto al total (chip) + «Pagar lo mío», B4 filas numeradas en mono sin miniatura y CTA con radio 8, B5 chips grises bajo la línea.
// Donde el marco no dibuja stepper ni «Quitar» (B2–B5), tocar la línea abre los controles. «Enviar a cocina» es la acción principal
// (el marco solo dibuja «Ir a pagar», que aquí es la secundaria) y «o pagar en la mesa con el mesero» cierra. La propina del marco
// (10 % / selector) no existe en el carrito del servidor y no se pinta; los sellos de fidelidad y «Para la mesa» tampoco (sin datos).
export function FamilyBCart({ cart, template, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const tb = useTranslations('diner.templates.familiaB.cart')
  const variant = variantOf(template.codigo)
  const entry = useDinerStore().entry
  const photos = usePhotoIndex(entry)
  const [sending, setSending] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const step = (line: CartLine, delta: number) => { const qty = line.cantidad + delta; if (qty < 1) remove(line.id); else setQty(line.id, qty) }
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }
  const pct = discount?.porcentaje ?? 0
  const radius = variant === 'B4' ? 'rounded-[8px]' : 'rounded-t-boton'
  const primary = `w-full ${variant === 'B4' ? 'h-[60px]' : 'h-[56px]'} ${radius} bg-t-acento text-t-acento-tinta text-[16px] font-bold disabled:opacity-60`
  const secondary = `w-full h-[52px] ${radius} border border-t-borde bg-t-fondo text-[15px] font-medium text-t-tinta disabled:opacity-60`
  const count = itemCount(cart)
  const head = (
    <header className="px-[18px] py-4 border-b border-t-borde flex items-center gap-3">
      <Link href={hrefs.home} aria-label={t('common.back')} className="shrink-0 w-[44px] h-[44px] -ml-2 grid place-items-center text-[18px] text-t-tinta-suave">←</Link>
      <h1 className="t-title text-[19px] leading-[1.15] flex-1">{t('cart.title')}</h1>
      {count > 0 && <span className="text-[14px] text-t-tinta-suave">{tb('items', { n: count })}</span>}
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
  const diners = Array.from(new Set(theirs.map((l) => l.comensal)))
  const avatarOf = (line: CartLine) => (line.mio ? { label: tb('you'), cls: AVATAR[0] } : { label: `C${diners.indexOf(line.comensal) + 1}`, name: tb('diner', { n: diners.indexOf(line.comensal) + 1 }), cls: AVATAR[(diners.indexOf(line.comensal) + 1) % AVATAR.length] })
  const amount = formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))
  const [before, after] = t('cart.confirm', { amount }).split(amount)
  const showBanner = variant === 'B2' && discount && (discount.porcentaje > 0 && (discount.aplicado || discount.aplicable || !discount.registrado))
  const line = (l: CartLine, index: number) => {
    const open = l.mio && (variant === 'B1' || editing === l.id)
    const note = l.nota ? tb('lineNote', { qty: l.cantidad, note: l.nota }) : tb('lineQty', { qty: l.cantidad })
    const avatar = variant === 'B3' ? avatarOf(l) : null
    const body = (
      <>
        {variant === 'B1' && <Thumb src={photos.get(l.producto_id)} />}
        {variant === 'B4' && <span aria-hidden="true" className="w-[34px] shrink-0 font-t-mono tabular text-[19px] leading-none">{index + 1}</span>}
        {avatar && <span aria-label={avatar.name} className={`w-[34px] h-[34px] shrink-0 rounded-full grid place-items-center text-[13px] font-bold ${avatar.cls}`}>{avatar.label}</span>}
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="flex justify-between gap-2.5">
            <span className={variant === 'B4' ? 't-title text-[16px] leading-[1.15]' : variant === 'B3' ? 'text-[15px] leading-snug' : 'text-[16px] font-medium leading-snug'}>{l.nombre}</span>
            <span className={`font-t-mono tabular whitespace-nowrap ${variant === 'B4' ? 'text-[17px]' : 'text-[15px]'}`}>{formatCop(l.subtotal)}</span>
          </span>
          {variant === 'B5'
            ? <span className="flex flex-wrap gap-1.5 mt-[7px]"><Chip>{note}</Chip><Chip>{tb('taxes')}</Chip></span>
            : <span className="text-[13px] text-t-tinta-suave mt-0.5">{note}</span>}
        </span>
      </>
    )
    return (
      <li key={l.id} className={`px-[18px] border-b border-t-borde flex flex-col ${variant === 'B4' ? 'py-[15px]' : variant === 'B3' ? 'py-2.5' : 'py-3'}`}>
        {l.mio && variant !== 'B1'
          ? <button type="button" aria-expanded={open} aria-label={tb('editLine', { name: l.nombre })} onClick={() => setEditing((e) => (e === l.id ? null : l.id))} className="w-full text-left flex gap-3 items-center min-h-[44px]">{body}</button>
          : <div className="flex gap-3 items-start">{body}</div>}
        {open && (
          <div className={`flex items-center gap-2 mt-2 ${variant === 'B1' ? 'ml-[66px]' : ''}`}>
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
        ? <div className="px-[18px] py-[13px] bg-t-acento-suave border-b border-t-borde flex items-center gap-2.5"><span className={`text-[22px] font-bold tracking-[-0.02em] ${BAND_FIGURE}`}>{pct}%</span><span className={`text-[14px] leading-[1.35] ${BAND_TEXT}`}>{tb('discountBanner')}</span></div>
        : <Link href={hrefs.signup} className="px-[18px] py-[13px] bg-t-acento-suave border-b border-t-borde flex items-center gap-2.5"><span className={`text-[22px] font-bold tracking-[-0.02em] ${BAND_FIGURE}`}>{pct}%</span><span className={`text-[14px] leading-[1.35] ${BAND_TEXT}`}>{tb('discountBannerPending', { pct })}</span></Link>)}
      <ul className="flex flex-col">{own.map(line)}</ul>
      {own.length === 0 && <p className="px-[18px] py-4 text-[15px] text-t-tinta-suave">{t('cart.empty')}</p>}
      {theirs.length > 0 && (
        <section>
          <h2 className="px-[18px] pt-4 pb-1 text-[13px] font-medium tracking-[0.04em] text-t-tinta-suave">{tb('others')}</h2>
          <ul className="flex flex-col">{theirs.map((l, i) => line(l, own.length + i))}</ul>
        </section>
      )}
      <Link href={hrefs.menu} className="self-start mx-[18px] inline-flex items-center h-[44px] text-[15px] font-medium text-t-acento">{t('cart.addMore')}</Link>
      {variant !== 'B2' && discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado && (
        <Link href={hrefs.signup} className="mx-[18px] mb-3 px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>
      )}
      <dl className="px-[18px] py-4 border-t border-t-borde bg-t-superficie flex flex-col">
        {theirs.length > 0 && <Row label={tb('mine')} value={formatCop(Math.max(0, cart.mio - (discount?.monto ?? 0)))} />}
        {(variant !== 'B3' || theirs.length === 0) && <Row label={tb('subtotal')} value={formatCop(cart.total)} />}
        {discount && (discount.aplicado || discount.aplicable) && variant !== 'B3' && <Row label={t('cart.discountLine', { pct })} value={`−${formatCop(discount.monto)}`} className="text-free" />}
        <div className="flex justify-between items-baseline gap-2.5 pt-2.5 mt-2 border-t border-t-borde">
          <dt className="text-[18px] font-bold tracking-[-0.02em] leading-[1.15]">{theirs.length > 0 ? tb('totalTable') : tb('total')}</dt>
          <dd className="flex items-center gap-2">
            {variant === 'B3' && discount && (discount.aplicado || discount.aplicable) && <span className="inline-flex items-center h-[26px] px-[9px] rounded-[7px] bg-free-soft text-free-ink text-[13px] font-medium">{tb('discountChip', { pct })}</span>}
            <span className="font-t-mono tabular text-[25px] whitespace-nowrap">$ {amount}</span>
          </dd>
        </div>
      </dl>
      <div className="sticky bottom-0 px-[18px] py-3.5 border-t border-t-borde bg-t-superficie flex flex-col gap-2.5">
        <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className={primary}>
          {sending ? t('cart.confirming') : <>{before}<span className="font-t-mono tabular">{amount}</span>{after}</>}
        </button>
        <button type="button" disabled={busy || sending} onClick={goPay} className={secondary}>{variant === 'B3' ? tb('payMine') : t('cart.goPay')}</button>
        <Link href={hrefs.table} className="self-center inline-flex items-center h-[44px] text-[14px] text-t-tinta-suave">{t('cart.payAtTable')}</Link>
      </div>
    </div>
  )
}

function Row({ label, value, className = 'text-t-tinta-suave' }: { label: string; value: string; className?: string }) {
  return <div className={`flex justify-between text-[15px] py-[3px] ${className}`}><dt>{label}</dt><dd className="font-t-mono tabular whitespace-nowrap">{value}</dd></div>
}
// Chips grises del marco B5 (#F2EEE8 = su acentoSuave): tokens, no un gris fijo.
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center h-[26px] px-[9px] rounded-[6px] bg-t-acento-suave text-t-tinta-suave text-[12px]">{children}</span>
}
// Miniatura de 54 px del marco B1: foto del producto (por id, desde la carta) o el hueco sobre el borde de la plantilla (#E8E1D5 en el marco).
function Thumb({ src }: { src?: string }) {
  return (
    <span className="w-[54px] h-[54px] shrink-0 rounded-[10px] bg-t-borde overflow-hidden grid place-items-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && <img src={src} alt="" className="w-full h-full object-cover" />}
    </span>
  )
}
