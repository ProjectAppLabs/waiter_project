'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { primaryCta, secondaryCta, skinOf } from '@/components/templates/families/A/shared'
import { useEntry } from '@/components/templates/families/A/storeExtras'
import type { CartLayoutProps } from '@/components/templates/types'
import { formatCop, itemCount } from '@/lib/domain/cart'
import type { CartLine, Dish, Entry } from '@/lib/types'

// Carrito de la familia A · Alta cocina (docs/diseno/plantillas/A*/carrito.html). A1 define la base (A2 y A5 la reutilizan con su piel):
// cabecera centrada «Tu pedido / N platos», líneas con nombre en serif, guía de puntos y precio en mono, nota debajo; totales sobre la
// superficie (Subtotal / Descuento primera compra 5 % / Total) y CTA. A3 y A4 difieren en estructura (spec.pantallas.carrito.layout = "A3" / "A4");
// el registro solo admite claves por familia, así que se ramifica aquí por template.codigo:
//   · A3: cabecera en una fila, nombre en Ubuntu 500 con chips grises (nota, «IVA incluido»), descuento como línea y como chip «−5% aplicado».
//   · A4: miniatura 1:1 de 54 px, nombre en Ubuntu 500, stepper y «Quitar» siempre dibujados (el único de la familia).
// Descuento5 según el spec: linea (A1, A4), banner bajo la cabecera (A2), chip (A3), nota verde bajo el CTA (A5 «usado»).
// Donde el marco no dibuja controles (A1, A2, A3, A5), tocar una línea propia abre el stepper y «Quitar». Las líneas de otros comensales se
// listan sin controles con la nota «Pedido por otro comensal» (el carrito es de la mesa, como en el genérico). Propina: los frames dibujan
// «Propina 10 %» y A4 un selector, pero el carrito no trae propina (contrato 3): no se pinta para no inventar un total. La sugerencia
// «¿Algo para cerrar?» de A1 sale de la carta (postres/cafés no agotados: precio mínimo) y se omite si no hay; «Cocina tarda unos 12 min» no
// existe en la sede y queda solo la segunda frase. Acciones: «Enviar a cocina · $ total» (confirm), «Ir a pagar» (goPay) y «o pagar en la mesa».
export function FamilyACart({ cart, template, busy, error, setQty, remove, confirm, goPay, goMenu, discount, retry, hrefs }: CartLayoutProps) {
  const t = useTranslations('diner')
  const tf = useTranslations('diner.templates.familiaA.cart')
  const tfa = useTranslations('diner.templates.familiaA')
  const skin = skinOf(template)
  const entry = useEntry()
  const [sending, setSending] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const rowHeader = skin.code === 'A3' || skin.code === 'A4'
  const withThumbs = skin.code === 'A4'
  const withChips = skin.code === 'A3'

  const step = (line: CartLine, delta: number) => { const qty = line.cantidad + delta; if (qty < 1) remove(line.id); else setQty(line.id, qty) }
  const onConfirm = async () => { setSending(true); try { await confirm() } finally { setSending(false) } }
  const count = itemCount(cart)
  const head = (
    <header className={`px-[18px] py-4 border-b border-t-borde flex ${rowHeader ? 'items-baseline justify-between gap-2.5' : 'flex-col items-center gap-2.5 text-center'}`}>
      <h1 className="t-title text-[22px] leading-[1.1] text-t-tinta">{t('cart.title')}</h1>
      <span className="text-[14px] text-t-tinta-suave">{tfa('dishes', { n: count })}</span>
    </header>
  )
  const stateBox = (text: string, action?: React.ReactNode) => (
    <div className="flex flex-col text-t-tinta">
      {head}
      <section className="px-[18px] py-8 flex flex-col items-center gap-4 text-center">
        <p className="text-base text-t-tinta-suave">{text}</p>
        {action}
      </section>
    </div>
  )
  if (!cart) return stateBox(error ? t('cart.loadFailed') : t('common.loading'), error && <button type="button" onClick={retry} className={`${primaryCta(skin)} px-6`}>{t('common.retry')}</button>)
  if (cart.lineas.length === 0) return stateBox(t('cart.empty'), <button type="button" onClick={goMenu} className={`${primaryCta(skin)} px-6`}>{t('cart.goMenu')}</button>)

  const pct = discount?.porcentaje ?? 0
  const applied = Boolean(discount?.aplicado || discount?.aplicable)
  const offer = Boolean(discount && discount.porcentaje > 0 && !discount.registrado && !discount.aplicable && !discount.aplicado)
  const subtotal = cart.total
  const shared = cart.mio !== cart.total
  const amount = formatCop(Math.max(0, cart.total - (discount?.monto ?? 0)))
  const [before, after] = t('cart.confirm', { amount }).split(amount)
  const upsell = skin.code === 'A1' ? suggestion(entry) : null
  const controls = (l: CartLine) => (
    <div className="flex items-center gap-2 mt-2">
      <div role="group" aria-label={l.nombre} className="inline-flex items-center rounded-[9px] border border-t-borde overflow-hidden">
        <button type="button" aria-label={t('dish.fewer')} disabled={busy} onClick={() => step(l, -1)} className="w-11 h-11 grid place-items-center text-[17px] text-t-tinta-suave disabled:opacity-50">−</button>
        <span className="w-8 text-center font-t-mono tabular text-[15px] text-t-tinta">{l.cantidad}</span>
        <button type="button" aria-label={t('dish.more')} disabled={busy} onClick={() => step(l, 1)} className="w-11 h-11 grid place-items-center text-[17px] text-t-tinta-suave border-l border-t-borde disabled:opacity-50">＋</button>
      </div>
      <button type="button" aria-label={`${t('cart.remove')}: ${l.nombre}`} disabled={busy} onClick={() => remove(l.id)} className="h-11 px-2 text-[14px] text-busy-ink disabled:opacity-50">{t('cart.remove')}</button>
    </div>
  )
  const note = (l: CartLine) => [l.nota, l.cantidad > 1 ? tf('qtyOf', { n: l.cantidad, amount: formatCop(l.precio) }) : null, !l.mio ? tf('byOther') : null].filter(Boolean)
  return (
    <div className="flex flex-col text-t-tinta">
      {head}
      {skin.code === 'A2' && (applied || offer) && (
        applied
          ? <div className="px-[18px] py-3 bg-t-acento/15 border-b border-t-borde flex items-center gap-2.5"><span className="text-[22px] font-bold tracking-[-0.02em] text-t-acento">{tf('pct', { pct })}</span><span className="text-[14px] leading-[1.35] text-t-acento">{tf('banner5Applied')}</span></div>
          : <Link href={hrefs.signup} className="px-[18px] py-3 bg-t-acento/15 border-b border-t-borde flex items-center gap-2.5"><span className="text-[22px] font-bold tracking-[-0.02em] text-t-acento">{tf('pct', { pct })}</span><span className="text-[14px] leading-[1.35] text-t-acento">{t('cart.discountHint', { pct })}</span></Link>
      )}
      <ul className="flex flex-col">
        {cart.lineas.map((l) => {
          const open = withThumbs || openId === l.id
          const editable = l.mio && !withThumbs
          const notes = note(l)
          return (
            <li key={l.id} className={`px-[18px] border-b border-t-borde flex gap-3 ${withThumbs || withChips ? 'py-3' : 'py-[15px]'}`}>
              {withThumbs && <Thumb entry={entry} line={l} />}
              <div className="flex-1 min-w-0">
                {editable
                  ? <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : l.id)} className="w-full text-left"><LineHead line={l} skin={skin} /></button>
                  : <LineHead line={l} skin={skin} />}
                {withChips
                  ? <div className="flex flex-wrap gap-1.5 mt-[7px]">{[...notes, tf('chipTax')].map((n) => <span key={n} className="inline-flex items-center h-[26px] px-[9px] rounded-[6px] bg-muted text-[12px] text-t-tinta-suave">{n}</span>)}</div>
                  : notes.length > 0 && <p className="text-[13px] text-t-tinta-suave mt-1">{notes.join(' · ')}</p>}
                {l.mio && open && controls(l)}
              </div>
            </li>
          )
        })}
      </ul>
      {!withThumbs && cart.lineas.some((l) => l.mio) && <p className="px-[18px] pt-2 text-[12px] text-t-tinta-terciaria">{tf('editHint')}</p>}
      {upsell && (
        <div className="px-[18px] py-3 mt-2 bg-t-acento-suave flex items-center gap-[11px]">
          <button type="button" aria-label={t('cart.addMore')} onClick={goMenu} className="shrink-0 w-tap-min h-tap-min -m-2 grid place-items-center"><span aria-hidden="true" className="w-8 h-8 rounded-full bg-t-acento text-t-acento-tinta grid place-items-center text-[16px]">＋</span></button>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-medium">{tf('upsellTitle')}</p>
            <p className="text-[13px] opacity-72">{upsell.waiter ? tf('upsellSub', { waiter: upsell.waiter, amount: formatCop(upsell.from) }) : tf('upsellSubNoWaiter', { amount: formatCop(upsell.from) })}</p>
          </div>
        </div>
      )}
      {skin.code === 'A1' && <p className="px-[18px] py-3 text-[13px] leading-[1.4] opacity-62">{tf('kitchenNote')}</p>}
      <Link href={hrefs.menu} className="self-start mx-[18px] inline-flex items-center h-tap-min text-[14px] font-medium text-t-acento">{t('cart.addMore')}</Link>
      {offer && skin.code !== 'A2' && <Link href={hrefs.signup} className="mx-[18px] mb-3 px-3.5 py-2.5 rounded-t-boton bg-t-acento-suave text-[14px] font-medium text-t-tinta">{t('cart.discountHint', { pct })}</Link>}
      {error && <p role="alert" className="mx-[18px] mb-3 px-3.5 py-2.5 rounded-t-boton bg-busy-soft text-busy-ink text-[14px]">{error}</p>}
      <div className={`sticky bottom-0 ${skin.foot}`}>
        <dl className="px-[18px] py-4 border-t border-t-borde flex flex-col">
          {shared && <Row label={tf('mine')} value={formatCop(cart.mio)} />}
          <Row label={tf('subtotal')} value={formatCop(subtotal)} />
          {applied && <Row label={t('cart.discountLine', { pct })} value={`−${formatCop(discount?.monto ?? 0)}`} className="text-free" />}
          <div className={`flex items-baseline justify-between gap-2.5 pt-2.5 mt-2 border-t border-t-borde ${skin.rule}`}>
            <dt className="t-title text-[21px] leading-[1.1]">{tf('total')}</dt>
            <dd className="flex items-center gap-2">
              {withChips && applied && <span className="inline-flex items-center h-[26px] px-[9px] rounded-[7px] bg-free-soft text-free-ink text-[13px] font-medium">{tf('chipDiscount', { pct })}</span>}
              <span className="font-t-mono tabular text-[25px] whitespace-nowrap">$ {amount}</span>
            </dd>
          </div>
        </dl>
        <div className="px-[18px] py-3.5 border-t border-t-borde flex flex-col gap-2.5">
          <button type="button" disabled={busy || sending} onClick={() => void onConfirm()} className={primaryCta(skin)}>
            {sending ? t('cart.confirming') : <>{before}<span className="font-t-mono tabular">{amount}</span>{after}</>}
          </button>
          {skin.code === 'A5' && applied && <p className="text-center text-[13px] text-free">{tf('includesDiscount', { pct })}</p>}
          <button type="button" disabled={busy || sending} onClick={goPay} className={secondaryCta(skin)}>{t('cart.goPay')}</button>
          <Link href={hrefs.table} className="self-center inline-flex items-center h-tap-min text-[14px] text-t-tinta-suave">{t('cart.payAtTable')}</Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, className = 'text-t-tinta-suave' }: { label: string; value: string; className?: string }) {
  return <div className={`flex justify-between gap-3 py-[3px] text-[15px] ${className}`}><dt>{label}</dt><dd className="font-t-mono tabular whitespace-nowrap">{value}</dd></div>
}

// Cabeza de línea: serif con guía de puntos (base) o Ubuntu 500 con el precio a la derecha (A3, A4).
function LineHead({ line, skin }: { line: CartLine; skin: ReturnType<typeof skinOf> }) {
  const serif = skin.code !== 'A3' && skin.code !== 'A4'
  return (
    <span className="flex items-baseline gap-2">
      <span className={serif ? 'font-t-display text-[20px] leading-[1.1] text-t-tinta' : 'text-[16px] font-medium text-t-tinta'}>{line.nombre}</span>
      <span aria-hidden="true" className={`flex-1 ${serif ? 'border-b border-dotted border-t-borde' : ''}`} />
      <span className="font-t-mono tabular text-[15px] whitespace-nowrap text-t-tinta">{formatCop(line.subtotal)}</span>
    </span>
  )
}

// Miniatura 1:1 de 54 px (A4): la foto sale de la carta por producto_id; sin foto, el bloque #E8E1D5 del marco.
function Thumb({ entry, line }: { entry: Entry | null; line: CartLine }) {
  const dish = entry?.carta.categorias.flatMap((c) => c.productos).find((d) => d.id === line.producto_id)
  return (
    <div className="w-[54px] h-[54px] shrink-0 rounded-[10px] bg-[#E8E1D5] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dish?.foto && <img src={dish.foto} alt="" className="w-full h-full object-cover" />}
    </div>
  )
}

// «Alex sugiere postre o café · desde 9.900»: categorías de postres/cafés con productos disponibles; sin ellas, sin bloque.
export function suggestion(entry: Entry | null): { waiter: string; from: number } | null {
  if (!entry) return null
  const pool: Dish[] = entry.carta.categorias.filter((c) => /postre|caf[eé]|dulce/i.test(c.nombre)).flatMap((c) => c.productos).filter((d) => !d.agotado)
  if (pool.length === 0) return null
  return { waiter: entry.contexto.marca.mesero, from: Math.min(...pool.map((d) => d.precio)) }
}
